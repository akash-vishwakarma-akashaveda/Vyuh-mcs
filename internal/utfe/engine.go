package utfe

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/pkg/cop1"
)

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

// UTFEEngine is the Uplink Transfer Frame Engine implementing CCSDS 232.0-B-3 & COP-1 FOP-1.
type UTFEEngine struct {
	scid          uint16
	fop           *cop1.FOP1
	redisClient   redis.Client
	bus           kafka.Producer
	consumer      kafka.Consumer
	antennaDriver TransmitDriver
	cmdBySeq      map[uint8]string // seqNumber -> commandID
	mu            sync.Mutex
}

func NewUTFEEngine(scid uint16, r redis.Client, bus kafka.Producer, c kafka.Consumer, driver TransmitDriver) *UTFEEngine {
	engine := &UTFEEngine{
		scid:          scid,
		redisClient:   r,
		bus:           bus,
		consumer:      c,
		antennaDriver: driver,
		cmdBySeq:      make(map[uint8]string),
	}

	// Initialize COP-1 FOP-1 state machine (FR-UTFE-005)
	fopCfg := cop1.Config{
		SCID:           scid,
		WindowSize:     10,
		MaxRetransmits: 3,
		InitialT1:      3 * time.Second,
		MaxT1:          10 * time.Second,
	}

	engine.fop = cop1.NewFOP1(fopCfg, func(ackedSeq uint8) {
		engine.handleAcknowledged(ackedSeq)
	}, func(scid uint16, reason string) {
		// Publish LINK_FAILURE event to system.health (FR-UTFE-013)
		if bus != nil {
			_ = kafka.ProduceJSON(context.Background(), bus, "system.health", []byte(fmt.Sprintf("%d", scid)), map[string]any{
				"event":  "LINK_FAILURE",
				"scid":   scid,
				"reason": reason,
				"ts":     time.Now().UTC(),
			}, nil)
		}
	})

	return engine
}

func (e *UTFEEngine) Start(ctx context.Context) error {
	if e.consumer == nil {
		return nil
	}

	// 1. Consume from tc.packets (FR-UTFE-001)
	err := e.consumer.Subscribe("tc.packets", func(ctx context.Context, msg *kafka.Message) error {
		var tc command.TCSpacePacket
		if err := json.Unmarshal(msg.Value, &tc); err != nil {
			return err
		}
		if tc.SCID != e.scid {
			return nil
		}
		return e.HandleTCPacket(ctx, &tc)
	})
	if err != nil {
		return err
	}

	// 2. Consume from tm.clcw.v1 (FR-UTFE-008) — Frame Processor's renamed
	// CLCW output (architecture v2.2 §8.3; was clcw.events).
	err = e.consumer.Subscribe("tm.clcw.v1", func(ctx context.Context, msg *kafka.Message) error {
		var event map[string]any
		if err := json.Unmarshal(msg.Value, &event); err != nil {
			return err
		}
		if scidF, ok := event["scid"].(float64); ok && uint16(scidF) == e.scid {
			vr := uint8(event["v_r"].(float64))
			retrans := event["retransmit"].(bool)
			wait := event["wait"].(bool)

			clcw := &ccsds.CLCW{
				ReportValue: vr,
				Retransmit:  retrans,
				Wait:        wait,
			}
			return e.ProcessCLCW(ctx, clcw)
		}
		return nil
	})

	return err
}

func (e *UTFEEngine) HandleTCPacket(ctx context.Context, tc *command.TCSpacePacket) error {
	e.mu.Lock()
	defer e.mu.Unlock()

	var frame *ccsds.TCTransferFrame
	var err error

	// The TC frame carries a TC space packet (APID + sequence count in its
	// header, sealed IV||ciphertext||tag as data) so the spacecraft can
	// authenticate and route it.
	tcPacket := (&ccsds.SpacePacket{Type: 1, APID: tc.APID, SeqFlags: 3, SeqCount: tc.SeqCount & 0x3FFF, Data: tc.Payload()}).Marshal()

	// Build TC Transfer Frame: Bypass mode (Type-BC) or Sequence-controlled (Type-AD) (FR-UTFE-002, FR-UTFE-012)
	if tc.BypassCOP1 {
		frame = e.fop.SendBC(1, tcPacket)
	} else {
		frame, err = e.fop.SendAD(1, tcPacket)
		if err != nil {
			return err
		}
		e.cmdBySeq[frame.SeqNumber] = tc.CommandID
	}

	rawFrame := frame.Marshal()

	// Store frame in Redis DB-5 retransmit buffer (FR-UTFE-004)
	if e.redisClient != nil && !frame.BypassFlag {
		_ = e.redisClient.Set(ctx, 5, fmt.Sprintf("cop1:%d:%d", e.scid, frame.SeqNumber), rawFrame, 60*time.Second)
	}

	// Transmit to antenna driver (FR-UTFE-010)
	if e.antennaDriver != nil {
		_ = e.antennaDriver.Transmit(ctx, rawFrame)
	}

	// Publish SENT event
	ack := command.CommandAckEvent{
		CommandID: tc.CommandID,
		SCID:      e.scid,
		Status:    command.StatusSent,
		SeqCount:  tc.SeqCount,
		Timestamp: time.Now().UTC(),
	}
	if e.bus != nil {
		return kafka.ProduceJSON(ctx, e.bus, "cmd.ack.events", []byte{byte(e.scid >> 8), byte(e.scid)}, ack, nil)
	}
	return nil
}

func (e *UTFEEngine) ProcessCLCW(ctx context.Context, clcw *ccsds.CLCW) error {
	resend, err := e.fop.ProcessCLCW(clcw)
	if err != nil {
		return err
	}

	// If retransmission requested, re-transmit unacknowledged frames (FR-UTFE-007)
	if len(resend) > 0 && e.antennaDriver != nil {
		for _, rf := range resend {
			_ = e.antennaDriver.Transmit(ctx, rf.Marshal())
		}
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

	// Remove from Redis DB-5 (FR-UTFE-009)
	if e.redisClient != nil {
		_ = e.redisClient.Set(context.Background(), 5, fmt.Sprintf("cop1:%d:%d", e.scid, seq), "", 1*time.Millisecond)
	}

	if ok && cmdID != "" && e.bus != nil {
		// Publish ACKNOWLEDGED event to cmd.ack.events (FR-UTFE-011)
		ack := command.CommandAckEvent{
			CommandID:     cmdID,
			SCID:          e.scid,
			Status:        command.StatusAcknowledged,
			ReportValueVR: seq + 1,
			Timestamp:     time.Now().UTC(),
		}
		_ = kafka.ProduceJSON(context.Background(), e.bus, "cmd.ack.events", []byte{byte(e.scid >> 8), byte(e.scid)}, ack, nil)
	}
}
