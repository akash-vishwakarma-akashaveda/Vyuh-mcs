// Package frameprocessor implements Frame Processor (architecture v2.2
// §15.3, FR-FRP-*): the canonical frame stream in, clean de-duplicated
// ordered packets and CLCW feedback out.
//
// Per satellite:VC it keeps the frame-count sequence (duplicates dropped,
// out-of-order frames buffered, a gap declared when the window fills or the
// missing frame is overdue, a counter reset recognised) and reassembles the
// space-packet stream that runs across frames per CCSDS 132.0 / 133.0:
// packets may span frames, idle frames carry no packet data, and after a lost
// frame the stream is resynchronised at the next first-header pointer.
package frameprocessor

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

// idleAPID is the CCSDS idle packet APID used to pad fixed-length frames.
const idleAPID = 0x7FF

// maxPacketLen is the largest space packet CCSDS 133.0 allows (6 + 65536).
const maxPacketLen = 65542

const (
	TopicFrameStream     = "tm.frames.stream.v1"
	TopicPacketsRealtime = "tm.packets.realtime.v1"
	TopicCLCW            = "tm.clcw.v1"
	TopicQuarantine      = "tm.ingest.quarantine.v1"
	TopicGaps            = "telemetry.gaps"
)

type Config struct {
	ConsumerGroup  string
	DedupWindow    int           // fingerprints kept per satellite:VC, 0 = default 32
	ReorderMaxSize int           // out-of-order frames buffered per satellite:VC before declaring a gap, 0 = default 8
	ReorderTimeout time.Duration // how long a missing frame is waited for, 0 = default 500 ms
}

// FrameEnvelope mirrors internal/linkgateway.FrameEnvelope's wire shape
// (kept independent to avoid a cross-package dependency for one struct).
type FrameEnvelope struct {
	SCID          uint16 `json:"scid"`
	FrameBytesB64 string `json:"frame_bytes_b64"`
	ReceiveTSNs   int64  `json:"receive_ts_ns"`
	AntennaID     string `json:"antenna_id"`
	PassID        string `json:"pass_id"`
	Replay        bool   `json:"replay"`
}

type SpacePacketMessage struct {
	SCID           uint16 `json:"scid"`
	APID           uint16 `json:"apid"`
	SeqCount       uint16 `json:"seq_count"`
	SeqFlags       uint8  `json:"seq_flags"`
	PacketBytesB64 string `json:"packet_bytes_b64"`
	OBTRaw         uint64 `json:"obt_raw"`
	ReceiveTSNs    int64  `json:"receive_ts_ns"`
	PassID         string `json:"pass_id"`
	Replay         bool   `json:"replay"`
}

type GapEvent struct {
	SCID        uint16 `json:"scid"`
	VCID        uint8  `json:"vcid"`
	ExpectedFC  uint8  `json:"expected_fc"`
	ReceivedFC  uint8  `json:"received_fc"`
	LostFrames  int    `json:"lost_frames"`
	Reason      string `json:"reason"` // WINDOW_FULL, TIMEOUT, COUNTER_RESET
	TimestampNs int64  `json:"timestamp_ns"`
	// SinceNs is when the last good frame before the gap was received: the
	// missing frames can only have been received after it (frame counts wrap
	// every 256 frames, so the count alone does not identify a frame).
	SinceNs int64 `json:"since_ns"`
}

type Engine struct {
	cfg         Config
	redisClient redis.Client
	bus         kafka.Producer
	consumer    kafka.Consumer

	dedup *dedupWindow

	mu sync.Mutex
	vc map[string]*vcState
}

func NewEngine(cfg Config, r redis.Client, bus kafka.Producer, consumer kafka.Consumer) *Engine {
	if cfg.DedupWindow == 0 {
		cfg.DedupWindow = 32
	}
	if cfg.ReorderMaxSize == 0 {
		cfg.ReorderMaxSize = 8
	}
	if cfg.ReorderTimeout == 0 {
		cfg.ReorderTimeout = 500 * time.Millisecond
	}
	return &Engine{
		cfg:         cfg,
		redisClient: r,
		bus:         bus,
		consumer:    consumer,
		dedup:       newDedupWindow(cfg.DedupWindow),
		vc:          make(map[string]*vcState),
	}
}

func (e *Engine) Start(ctx context.Context) error {
	// A missing frame is not waited for forever: overdue gaps are released on a
	// timer, so a stream that stops still delivers what it has buffered.
	go func() {
		t := time.NewTicker(100 * time.Millisecond)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case now := <-t.C:
				e.Flush(ctx, now)
			}
		}
	}()
	return e.consumer.Subscribe(TopicFrameStream, func(ctx context.Context, msg *kafka.Message) error {
		return e.HandleRawFrame(ctx, msg.Value)
	})
}

func (e *Engine) quarantine(ctx context.Context, reason, detail string, scid uint16) {
	pipeline.Inc("frame.rejected", 1)
	pipeline.Inc("frame."+reason, 1)
	_ = kafka.ProduceJSON(ctx, e.bus, TopicQuarantine, nil, map[string]any{
		"error_type": "FRAME_VALIDATION_FAILED",
		"reason":     reason,
		"scid":       scid,
		"detail":     detail,
		"timestamp":  time.Now().UTC().Format(time.RFC3339Nano),
	}, nil)
}

func classify(err error) string {
	switch {
	case errors.Is(err, ccsds.ErrCRCMismatch):
		return "crc_error"
	case errors.Is(err, ccsds.ErrInvalidASM):
		return "bad_asm"
	case errors.Is(err, ccsds.ErrInvalidFrameVersion):
		return "bad_version"
	case errors.Is(err, ccsds.ErrFrameTooShort):
		return "too_short"
	}
	return "invalid"
}

func (e *Engine) HandleRawFrame(ctx context.Context, data []byte) error {
	var rf FrameEnvelope
	if err := json.Unmarshal(data, &rf); err != nil {
		e.quarantine(ctx, "bad_envelope", err.Error(), 0)
		return nil
	}
	frameBytes, err := base64.StdEncoding.DecodeString(rf.FrameBytesB64)
	if err != nil {
		e.quarantine(ctx, "bad_envelope", err.Error(), rf.SCID)
		return nil
	}
	pipeline.Inc("frame.received", 1)

	frameBytes = e.alignToASM(frameBytes)

	// FR-FRP-01: validate frames and quarantine strangers.
	tf, err := ccsds.ParseTMFrame(frameBytes, true, true)
	if err != nil {
		e.quarantine(ctx, classify(err), err.Error(), rf.SCID)
		return nil
	}

	if e.redisClient != nil {
		whitelisted, _ := e.redisClient.HGet(ctx, 1, "scid:whitelist", fmt.Sprintf("%d", tf.SpacecraftID))
		if whitelisted == "" {
			pipeline.Inc("frame.unknown_scid", 1)
			_ = kafka.ProduceJSON(ctx, e.bus, "dead.letter", nil, map[string]any{
				"error_type": "UNKNOWN_SCID",
				"scid":       tf.SpacecraftID,
			}, nil)
			return nil
		}
	}

	key := fmt.Sprintf("%d:%d", tf.SpacecraftID, tf.VirtualChannelID)

	// FR-FRP-03: drop exact duplicates (multi-station arbitration).
	if e.dedup.seenBefore(key, frameBytes) {
		pipeline.Inc("frame.duplicate", 1)
		return nil
	}
	pipeline.Inc("frame.valid", 1)

	pf := pendingFrame{fc: tf.VirtualChannelFC, bytes: frameBytes, tsNs: rf.ReceiveTSNs, passID: rf.PassID, replay: rf.Replay, at: time.Now()}

	e.mu.Lock()
	defer e.mu.Unlock()
	if rf.Replay {
		// A frame recovered from the station recording: it belongs to a gap
		// the live stream has already moved past. Process it on its own —
		// only the packets wholly inside it — and keep it out of the live
		// sequence and packet stream.
		pipeline.Inc("frame.replayed", 1)
		e.processFrame(ctx, &vcState{pending: map[uint8]pendingFrame{}, pktSeq: map[uint16]uint16{}}, pf)
		return nil
	}
	st := e.state(key)
	for _, r := range e.admit(ctx, st, tf.SpacecraftID, tf.VirtualChannelID, pf) {
		e.processFrame(ctx, st, r)
	}
	return nil
}

func (e *Engine) state(key string) *vcState {
	st := e.vc[key]
	if st == nil {
		st = &vcState{pending: map[uint8]pendingFrame{}, pktSeq: map[uint16]uint16{}}
		e.vc[key] = st
	}
	return st
}

// admit places a frame in VCFC order and returns the frames now ready.
func (e *Engine) admit(ctx context.Context, st *vcState, scid uint16, vcid uint8, pf pendingFrame) []pendingFrame {
	if !st.started {
		// Session start: there is no history to order against, and the very
		// first frame may itself be out of order. Hold the first few frames
		// (or until the reorder timeout) and anchor on the earliest.
		st.pending[pf.fc] = pf
		if len(st.pending) < e.cfg.ReorderMaxSize {
			return nil
		}
		return st.anchor()
	}
	d := dist(st.expected, pf.fc)
	switch {
	case d == 0:
		st.lateRun = 0
		st.expected++
		return append([]pendingFrame{pf}, st.drain()...)

	case d < 128: // ahead of what we expect: wait for the missing frame(s)
		st.lateRun = 0
		st.pending[pf.fc] = pf
		pipeline.Inc("frame.buffered", 1)
		if len(st.pending) >= e.cfg.ReorderMaxSize {
			return e.declareGap(ctx, st, scid, vcid, "WINDOW_FULL", pf.tsNs)
		}
		return nil

	default: // behind: a late frame after its gap was declared, or a counter reset
		if st.lateRun > 0 && pf.fc == st.lateNext {
			st.lateRun++
		} else {
			st.lateRun = 1
		}
		st.lateNext = pf.fc + 1
		if st.lateRun >= 3 {
			// Three consecutive counts behind us: the spacecraft restarted its
			// counter. Flush what we hold and follow the new sequence.
			pipeline.Inc("frame.counter_reset", 1)
			out := make([]pendingFrame, 0, len(st.pending)+1)
			for len(st.pending) > 0 {
				out = append(out, e.declareGap(ctx, st, scid, vcid, "COUNTER_RESET", pf.tsNs)...)
			}
			st.expected = pf.fc + 1
			st.lateRun = 0
			_ = e.emitGap(ctx, scid, vcid, pf.fc, pf.fc, 0, "COUNTER_RESET", pf.tsNs, st.lastTsNs)
			pf.resync = true // the old stream's buffered frames go first; this one starts afresh
			return append(out, pf)
		}
		pipeline.Inc("frame.late", 1)
		return nil
	}
}

// declareGap gives up on the missing frame(s) before the nearest buffered one.
func (e *Engine) declareGap(ctx context.Context, st *vcState, scid uint16, vcid uint8, reason string, tsNs int64) []pendingFrame {
	next, ok := st.nearestPending()
	if !ok {
		return nil
	}
	lost := int(dist(st.expected, next.fc))
	if lost > 0 {
		_ = e.emitGap(ctx, scid, vcid, st.expected, next.fc, lost, reason, tsNs, st.lastTsNs)
		// Bytes of a packet that spanned the lost frames can never be completed.
		st.partial, st.inSync = nil, false
	}
	st.expected = next.fc
	return st.drain()
}

// Flush releases any satellite:VC whose missing frame is overdue.
func (e *Engine) Flush(ctx context.Context, now time.Time) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for key, st := range e.vc {
		if !st.started && len(st.pending) > 0 && now.Sub(st.oldestArrival()) >= e.cfg.ReorderTimeout {
			for _, r := range st.anchor() {
				e.processFrame(ctx, st, r)
			}
			continue
		}
		if len(st.pending) == 0 || now.Sub(st.oldestArrival()) < e.cfg.ReorderTimeout {
			continue
		}
		var scid uint16
		var vcid uint8
		fmt.Sscanf(key, "%d:%d", &scid, &vcid)
		for _, r := range e.declareGap(ctx, st, scid, vcid, "TIMEOUT", now.UnixNano()) {
			e.processFrame(ctx, st, r)
		}
	}
}

func (e *Engine) processFrame(ctx context.Context, st *vcState, pf pendingFrame) {
	tf, err := ccsds.ParseTMFrame(pf.bytes, true, true)
	if err != nil {
		return
	}
	pipeline.Inc("frame.processed", 1)
	if !pf.replay {
		if !st.lastAt.IsZero() {
			iv := float64(pf.at.Sub(st.lastAt).Microseconds()) / 1000
			if st.intervalMs == 0 {
				st.intervalMs = iv
			} else {
				st.intervalMs = 0.9*st.intervalMs + 0.1*iv
			}
		}
		st.lastAt, st.lastTsNs = pf.at, pf.tsNs
	}

	if tf.OperationalControlField && tf.OCF != nil && !pf.replay { // a recovered frame's CLCW is history
		clcwBytes := make([]byte, 4)
		binary.BigEndian.PutUint32(clcwBytes, *tf.OCF)
		if clcw, err := ccsds.ParseCLCW(clcwBytes); err == nil {
			clcwEvent := map[string]any{
				"scid":         tf.SpacecraftID,
				"vcid":         clcw.VirtualChannelID,
				"v_r":          clcw.ReportValue,
				"retransmit":   clcw.Retransmit,
				"wait":         clcw.Wait,
				"lockout":      clcw.Lockout,
				"no_rf":        clcw.NoRF,
				"no_bitlock":   clcw.NoBitLock,
				"timestamp_ns": pf.tsNs,
				"pass_id":      pf.passID,
			}
			scidKey := make([]byte, 2)
			binary.BigEndian.PutUint16(scidKey, tf.SpacecraftID)
			// CLCW is published outside the packet transaction, at-least-once,
			// to keep command feedback fast (§15.3).
			_ = kafka.ProduceJSON(ctx, e.bus, TopicCLCW, scidKey, clcwEvent, nil)
			pipeline.Inc("clcw.published", 1)
		} else {
			pipeline.Inc("clcw.invalid", 1)
		}
	}

	e.reassemble(ctx, st, tf, pf)
}

func (e *Engine) emitGap(ctx context.Context, scid uint16, vcid uint8, expectedFC, receivedFC uint8, lost int, reason string, tsNs, sinceNs int64) error {
	if lost > 0 {
		pipeline.Inc("frame.gap_events", 1)
		pipeline.Inc("frame.lost", int64(lost))
	}
	key := fmt.Sprintf("%d:%d", scid, vcid)
	gap := GapEvent{SCID: scid, VCID: vcid, ExpectedFC: expectedFC, ReceivedFC: receivedFC, LostFrames: lost, Reason: reason, TimestampNs: tsNs, SinceNs: sinceNs}
	return kafka.ProduceJSON(ctx, e.bus, TopicGaps, []byte(key), gap, nil)
}

func (e *Engine) alignToASM(data []byte) []byte {
	for i := 0; i+4 <= len(data); i++ {
		if binary.BigEndian.Uint32(data[i:i+4]) == ccsds.CCSDS_ASM {
			if i > 0 {
				pipeline.Inc("frame.realigned", 1)
			}
			return data[i:]
		}
	}
	return data
}

// reassemble pulls complete space packets out of the virtual channel's packet
// stream, honouring the first header pointer.
func (e *Engine) reassemble(ctx context.Context, st *vcState, tf *ccsds.TransferFrame, pf pendingFrame) {
	data := tf.DataField
	fhp := tf.FirstHeaderPointer
	if pf.resync {
		st.partial, st.inSync = nil, false
	}

	switch {
	case fhp == ccsds.FHP_IDLE_DATA:
		// Only idle data: no packet bytes, the stream continues in the next frame.
		pipeline.Inc("frame.idle", 1)
		return

	case fhp == ccsds.FHP_NO_PACKET_HEADER:
		// The whole data field continues a packet that started earlier.
		if !st.inSync || len(st.partial) == 0 {
			// A continuation with no packet in progress: its start was never
			// seen (lost, or another stream). Parsing it would read packet
			// bytes as a header. Drop it and wait for the next packet start.
			pipeline.Inc("packet.discarded_bytes", int64(len(data)))
			st.inSync = false
			return
		}
		st.partial = append(st.partial, data...)
		st.partial = e.extract(ctx, st, tf, pf, st.partial)
		return

	case int(fhp) > len(data):
		pipeline.Inc("frame.bad_fhp", 1)
		st.partial, st.inSync = nil, false
		return
	}

	head := data[:fhp]
	if st.inSync && len(st.partial) > 0 {
		// The end of the packet that spilled over from the previous frame. It
		// is only trusted if it completes whole packets exactly up to the first
		// header pointer; anything else means the two pieces do not belong
		// together, and nothing of it is delivered.
		joined := append(st.partial, head...)
		if exactPackets(joined) {
			e.extract(ctx, st, tf, pf, joined)
		} else {
			pipeline.Inc("packet.spill_mismatch", 1)
			pipeline.Inc("packet.discarded_bytes", int64(len(joined)))
		}
	} else if len(head) > 0 {
		// Lost the start of this packet: its tail is unusable.
		pipeline.Inc("packet.discarded_bytes", int64(len(head)))
	}
	st.inSync = true
	st.partial = e.extract(ctx, st, tf, pf, append([]byte(nil), data[fhp:]...))
}

// extract emits every complete packet at the front of buf and returns the
// incomplete remainder (a packet continuing in the next frame).
func (e *Engine) extract(ctx context.Context, st *vcState, tf *ccsds.TransferFrame, pf pendingFrame, buf []byte) []byte {
	for len(buf) >= 6 {
		if buf[0]>>5 != 0 { // packet version must be 0
			pipeline.Inc("packet.bad_header", 1)
			st.inSync = false
			return nil
		}
		total := 7 + int(binary.BigEndian.Uint16(buf[4:6]))
		if len(buf) < total {
			break
		}
		e.emitPacket(ctx, st, tf, pf, buf[:total])
		buf = buf[total:]
	}
	if len(buf) > maxPacketLen {
		pipeline.Inc("packet.bad_header", 1)
		st.inSync = false
		return nil
	}
	return append([]byte(nil), buf...)
}

func (e *Engine) emitPacket(ctx context.Context, st *vcState, tf *ccsds.TransferFrame, pf pendingFrame, raw []byte) {
	pkt, err := ccsds.ParseSpacePacket(raw)
	if err != nil {
		pipeline.Inc("packet.bad_header", 1)
		return
	}
	if pkt.APID == idleAPID {
		pipeline.Inc("packet.idle", 1) // FR-FRP-01: idle fill is filtered, never forwarded
		return
	}
	if last, ok := st.pktSeq[pkt.APID]; ok {
		if want := (last + 1) & 0x3FFF; pkt.SeqCount != want {
			pipeline.Inc("packet.seq_gap", 1)
			pipeline.Inc("packet.seq_missing", int64((pkt.SeqCount-want)&0x3FFF))
		}
	}
	st.pktSeq[pkt.APID] = pkt.SeqCount
	if pkt.SeqFlags != 3 {
		pipeline.Inc("packet.segmented", 1)
	}

	spMsg := SpacePacketMessage{
		SCID:           tf.SpacecraftID,
		APID:           pkt.APID,
		SeqCount:       pkt.SeqCount,
		SeqFlags:       pkt.SeqFlags,
		PacketBytesB64: base64.StdEncoding.EncodeToString(pkt.Data),
		ReceiveTSNs:    pf.tsNs,
		PassID:         pf.passID,
		Replay:         pf.replay,
	}
	scidKey := make([]byte, 2)
	binary.BigEndian.PutUint16(scidKey, tf.SpacecraftID)
	_ = kafka.ProduceJSON(ctx, e.bus, TopicPacketsRealtime, scidKey, spMsg, nil)
	pipeline.Inc("packet.forwarded", 1)
}

// exactPackets reports whether b is a whole number of well-formed space packets.
func exactPackets(b []byte) bool {
	for len(b) > 0 {
		if len(b) < 7 || b[0]>>5 != 0 {
			return false
		}
		total := 7 + int(binary.BigEndian.Uint16(b[4:6]))
		if total > len(b) {
			return false
		}
		b = b[total:]
	}
	return true
}
