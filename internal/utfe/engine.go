// Package utfe is the Uplink Transfer Frame Engine: TC space packets from the
// Uplink Processing Engine become TC transfer frames under COP-1 (CCSDS 232.0 /
// 232.1). It owns the FOP-1 state machine of one spacecraft: commands wait in
// a queue until the transmission window has room, outstanding frames are
// retransmitted when the CLCW asks for it or T1 expires, the spacecraft's
// FARM is resynchronised with Set V(R) after a failure or a lockout, and a
// cancel is honoured for a command that has not been radiated yet.
package utfe

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/pkg/cop1"
)

// TCVCID is the virtual channel telecommands are sent on.
const TCVCID = 1

// TransmitDriver defines the hardware / ground antenna transmission interface.
type TransmitDriver interface {
	Transmit(ctx context.Context, frameBytes []byte) error
}

// MockAntennaDriver records transmitted frames in memory for testing and emulation.
type MockAntennaDriver struct {
	sentFrames [][]byte
	mu         sync.Mutex
}

func (m *MockAntennaDriver) Transmit(ctx context.Context, frameBytes []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.sentFrames = append(m.sentFrames, frameBytes)
	return nil
}

func (m *MockAntennaDriver) SentFrames() [][]byte {
	m.mu.Lock()
	defer m.mu.Unlock()
	copied := make([][]byte, len(m.sentFrames))
	copy(copied, m.sentFrames)
	return copied
}

// Sent is published whenever a command's TC packet is radiated, so PUS-1
// verification reports (which name the packet) can be matched to the command.
type Sent struct {
	CommandID string `json:"command_id"`
	SCID      uint16 `json:"scid"`
	APID      uint16 `json:"apid"`
	SeqCount  uint16 `json:"seq_count"`
}

const TopicSent = "tc.sent.v1"

// UTFEEngine is the Uplink Transfer Frame Engine implementing CCSDS 232.0-B-3 & COP-1 FOP-1.
type UTFEEngine struct {
	scid          uint16
	fop           *cop1.FOP1
	redisClient   redis.Client
	bus           kafka.Producer
	consumer      kafka.Consumer
	antennaDriver TransmitDriver

	mu        sync.Mutex
	cmdBySeq  map[uint8]string // frame sequence number -> command id
	backlog   []*command.TCSpacePacket
	cancelled map[string]bool
	failed    bool // the FOP gave up; recovery runs from the timer loop
	lockout   bool
}

func NewUTFEEngine(scid uint16, r redis.Client, bus kafka.Producer, c kafka.Consumer, driver TransmitDriver) *UTFEEngine {
	e := &UTFEEngine{
		scid:          scid,
		redisClient:   r,
		bus:           bus,
		consumer:      c,
		antennaDriver: driver,
		cmdBySeq:      make(map[uint8]string),
		cancelled:     make(map[string]bool),
	}
	e.fop = cop1.NewFOP1(cop1.Config{
		SCID:           scid,
		WindowSize:     10,
		MaxRetransmits: 3,
		InitialT1:      3 * time.Second,
		MaxT1:          10 * time.Second,
	}, e.handleAcknowledged, func(scid uint16, reason string) {
		pipeline.Inc("uplink.link_failures", 1)
		e.mu.Lock()
		if reason == "Spacecraft entered LOCKOUT" {
			e.lockout = true
		} else {
			e.failed = true
		}
		e.mu.Unlock()
		if bus != nil {
			_ = kafka.ProduceJSON(context.Background(), bus, "system.health", []byte(fmt.Sprintf("%d", scid)), map[string]any{
				"event": "LINK_FAILURE", "scid": scid, "reason": reason, "ts": time.Now().UTC(),
			}, nil)
		}
	})
	return e
}

func (e *UTFEEngine) Start(ctx context.Context) error {
	if e.consumer == nil {
		return nil
	}
	if err := e.consumer.Subscribe("tc.packets", func(ctx context.Context, msg *kafka.Message) error {
		var tc command.TCSpacePacket
		if err := json.Unmarshal(msg.Value, &tc); err != nil {
			return err
		}
		if tc.SCID != e.scid {
			return nil
		}
		return e.HandleTCPacket(ctx, &tc)
	}); err != nil {
		return err
	}
	if err := e.consumer.Subscribe("cmd.cancel", func(ctx context.Context, msg *kafka.Message) error {
		var c struct {
			CommandID string `json:"command_id"`
			SCID      uint16 `json:"scid"`
		}
		if json.Unmarshal(msg.Value, &c) != nil || c.SCID != e.scid {
			return nil
		}
		e.Cancel(ctx, c.CommandID)
		return nil
	}); err != nil {
		return err
	}
	// Frame Processor's CLCW output (architecture v2.2 §8.3).
	if err := e.consumer.Subscribe("tm.clcw.v1", func(ctx context.Context, msg *kafka.Message) error {
		var ev struct {
			SCID       uint16 `json:"scid"`
			VR         uint8  `json:"v_r"`
			Retransmit bool   `json:"retransmit"`
			Wait       bool   `json:"wait"`
			Lockout    bool   `json:"lockout"`
		}
		if json.Unmarshal(msg.Value, &ev) != nil || ev.SCID != e.scid {
			return nil
		}
		return e.ProcessCLCW(ctx, &ccsds.CLCW{ReportValue: ev.VR, Retransmit: ev.Retransmit, Wait: ev.Wait, Lockout: ev.Lockout})
	}); err != nil {
		return err
	}
	go e.timerLoop(ctx)
	return nil
}

// timerLoop drives T1 retransmission, failure handling and the queue.
func (e *UTFEEngine) timerLoop(ctx context.Context) {
	t := time.NewTicker(200 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case now := <-t.C:
			e.Tick(ctx, now)
		}
	}
}

// Tick runs one pass of the timer work (exported for tests).
func (e *UTFEEngine) Tick(ctx context.Context, now time.Time) {
	e.mu.Lock()
	failed, lockout := e.failed, e.lockout
	e.failed, e.lockout = false, false
	e.mu.Unlock()

	if lockout {
		// FARM lockout: unlock it, align V(R) to our V(S); outstanding commands fail.
		pipeline.Inc("uplink.lockout_recoveries", 1)
		e.transmit(ctx, e.fop.UnlockFrame(TCVCID).Marshal())
		e.abortOutstanding(ctx, "spacecraft FARM lockout; resynchronised with Unlock and Set V(R)")
		e.transmit(ctx, e.fop.SetVRFrame(TCVCID).Marshal())
		e.fop.Resume()
	}
	if failed {
		e.abortOutstanding(ctx, "no acknowledgement after 3 retransmissions (COP-1 T1)")
		e.transmit(ctx, e.fop.SetVRFrame(TCVCID).Marshal())
	}

	if e.fop.Overdue(now) {
		resend, err := e.fop.HandleTimeout()
		if err == nil {
			pipeline.Inc("uplink.t1_timeouts", 1)
			for _, f := range resend {
				pipeline.Inc("uplink.retransmitted_frames", 1)
				e.transmit(ctx, f.Marshal())
			}
		}
	}
	e.drainBacklog(ctx)
}

// abortOutstanding fails every command whose frame was never acknowledged.
func (e *UTFEEngine) abortOutstanding(ctx context.Context, reason string) {
	seqs := e.fop.Abort()
	e.mu.Lock()
	var ids []string
	for _, seq := range seqs {
		if id, ok := e.cmdBySeq[seq]; ok {
			ids = append(ids, id)
			delete(e.cmdBySeq, seq)
		}
	}
	e.mu.Unlock()
	for _, id := range ids {
		pipeline.Inc("uplink.commands_failed", 1)
		e.publish(ctx, command.CommandAckEvent{CommandID: id, SCID: e.scid, Status: command.StatusFailed, Reason: reason, Timestamp: time.Now().UTC()})
	}
}

func (e *UTFEEngine) transmit(ctx context.Context, frame []byte) {
	if e.antennaDriver != nil {
		if err := e.antennaDriver.Transmit(ctx, frame); err != nil {
			pipeline.Inc("uplink.transmit_errors", 1)
		}
	}
}

func (e *UTFEEngine) publish(ctx context.Context, ack command.CommandAckEvent) {
	if e.bus != nil {
		_ = kafka.ProduceJSON(ctx, e.bus, "cmd.ack.events", []byte{byte(e.scid >> 8), byte(e.scid)}, ack, nil)
	}
}

// HandleTCPacket frames and radiates a command now if the COP-1 window has
// room, otherwise queues it (the command stays QUEUED until it is sent).
func (e *UTFEEngine) HandleTCPacket(ctx context.Context, tc *command.TCSpacePacket) error {
	e.mu.Lock()
	if e.cancelled[tc.CommandID] {
		delete(e.cancelled, tc.CommandID)
		e.mu.Unlock()
		pipeline.Inc("uplink.cancelled", 1)
		e.publish(ctx, command.CommandAckEvent{CommandID: tc.CommandID, SCID: e.scid, Status: command.StatusCancelled, Reason: "cancelled before uplink", Timestamp: time.Now().UTC()})
		return nil
	}
	if len(e.backlog) > 0 {
		e.backlog = append(e.backlog, tc) // keep submission order
		e.mu.Unlock()
		pipeline.Inc("uplink.queued", 1)
		e.drainBacklog(ctx)
		return nil
	}
	e.mu.Unlock()
	if err := e.send(ctx, tc); err != nil {
		if errors.Is(err, cop1.ErrWindowFull) || errors.Is(err, cop1.ErrFOPNotActive) {
			e.mu.Lock()
			e.backlog = append(e.backlog, tc)
			e.mu.Unlock()
			pipeline.Inc("uplink.queued", 1)
			return nil
		}
		return err
	}
	return nil
}

func (e *UTFEEngine) drainBacklog(ctx context.Context) {
	for {
		e.mu.Lock()
		if len(e.backlog) == 0 {
			e.mu.Unlock()
			return
		}
		tc := e.backlog[0]
		e.mu.Unlock()
		if err := e.send(ctx, tc); err != nil {
			return // window still full or FOP not active: try again later
		}
		e.mu.Lock()
		if len(e.backlog) > 0 && e.backlog[0] == tc {
			e.backlog = e.backlog[1:]
		}
		e.mu.Unlock()
	}
}

func (e *UTFEEngine) send(ctx context.Context, tc *command.TCSpacePacket) error {
	// The TC frame carries a TC space packet (APID + sequence count in its
	// header, sealed IV||ciphertext||tag as data) so the spacecraft can
	// authenticate and route it.
	tcPacket := (&ccsds.SpacePacket{Type: 1, APID: tc.APID, SeqFlags: 3, SeqCount: tc.SeqCount & 0x3FFF, Data: tc.Payload()}).Marshal()

	var frame *ccsds.TCTransferFrame
	if tc.BypassCOP1 {
		frame = e.fop.SendBC(TCVCID, tcPacket)
	} else {
		e.mu.Lock() // held across SendAD so the ack for this sequence number finds its command
		var err error
		frame, err = e.fop.SendAD(TCVCID, tcPacket)
		if err != nil {
			e.mu.Unlock()
			return err
		}
		e.cmdBySeq[frame.SeqNumber] = tc.CommandID
		e.mu.Unlock()
	}
	raw := frame.Marshal()
	if e.redisClient != nil && !frame.BypassFlag {
		_ = e.redisClient.Set(ctx, 5, fmt.Sprintf("cop1:%d:%d", e.scid, frame.SeqNumber), raw, 60*time.Second)
	}
	if e.bus != nil {
		_ = kafka.ProduceJSON(ctx, e.bus, TopicSent, []byte{byte(e.scid >> 8), byte(e.scid)}, Sent{CommandID: tc.CommandID, SCID: e.scid, APID: tc.APID, SeqCount: tc.SeqCount & 0x3FFF}, nil)
	}
	e.publish(ctx, command.CommandAckEvent{CommandID: tc.CommandID, SCID: e.scid, Status: command.StatusSent, SeqCount: tc.SeqCount, Timestamp: time.Now().UTC()})
	e.transmit(ctx, raw)
	pipeline.Inc("uplink.frames_sent", 1)
	return nil
}

// Cancel withdraws a command that is still waiting to be radiated.
func (e *UTFEEngine) Cancel(ctx context.Context, id string) {
	e.mu.Lock()
	for i, tc := range e.backlog {
		if tc.CommandID == id {
			e.backlog = append(e.backlog[:i], e.backlog[i+1:]...)
			e.mu.Unlock()
			pipeline.Inc("uplink.cancelled", 1)
			e.publish(ctx, command.CommandAckEvent{CommandID: id, SCID: e.scid, Status: command.StatusCancelled, Reason: "cancelled before uplink", Timestamp: time.Now().UTC()})
			return
		}
	}
	for _, sent := range e.cmdBySeq {
		if sent == id {
			e.mu.Unlock()
			e.publish(ctx, command.CommandAckEvent{CommandID: id, SCID: e.scid, Status: command.StatusCancelRejected, Reason: "cancel arrived after the command was radiated", Timestamp: time.Now().UTC()})
			return
		}
	}
	// Not seen yet (still in the Uplink Processing Engine): refuse it on arrival.
	e.cancelled[id] = true
	e.mu.Unlock()
}

func (e *UTFEEngine) ProcessCLCW(ctx context.Context, clcw *ccsds.CLCW) error {
	resend, err := e.fop.ProcessCLCW(clcw)
	if err != nil && !errors.Is(err, cop1.ErrLockout) && !errors.Is(err, cop1.ErrMaxRetriesDone) {
		return err
	}
	for _, rf := range resend {
		pipeline.Inc("uplink.retransmitted_frames", 1)
		e.transmit(ctx, rf.Marshal())
	}
	if len(resend) == 0 {
		e.drainBacklog(ctx)
	}
	return nil
}

func (e *UTFEEngine) handleAcknowledged(seq uint8) {
	e.mu.Lock()
	cmdID, ok := e.cmdBySeq[seq]
	if ok {
		delete(e.cmdBySeq, seq)
	}
	e.mu.Unlock()

	if e.redisClient != nil {
		_ = e.redisClient.Set(context.Background(), 5, fmt.Sprintf("cop1:%d:%d", e.scid, seq), "", 1*time.Millisecond)
	}
	if ok && cmdID != "" {
		pipeline.Inc("uplink.acknowledged", 1)
		e.publish(context.Background(), command.CommandAckEvent{CommandID: cmdID, SCID: e.scid, Status: command.StatusAcknowledged, ReportValueVR: seq + 1, Timestamp: time.Now().UTC()})
	}
}
