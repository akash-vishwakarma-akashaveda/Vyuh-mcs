// Package frameprocessor implements Frame Processor (architecture v2.2
// §15.3, FR-FRP-*): the canonical frame stream in, clean de-duplicated
// ordered packets and CLCW feedback out. Reused from the original TFPE
// engine (frame validation, counter-extension gap detection, space-packet
// reassembly, CLCW extraction); this adds the dedup window and reorder
// buffer FR-FRP-03 calls for and renames topics to match §8.3.
package frameprocessor

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"sync"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

// idleAPID is the CCSDS idle packet APID used to pad fixed-length frames.
const idleAPID = 0x7FF

const (
	TopicFrameStream     = "tm.frames.stream.v1"
	TopicPacketsRealtime = "tm.packets.realtime.v1"
	TopicCLCW            = "tm.clcw.v1"
)

type Config struct {
	ConsumerGroup  string
	DedupWindow    int // fingerprints kept per satellite:VC, 0 = default
	ReorderMaxSize int // out-of-order frames buffered per satellite:VC before declaring a gap, 0 = default
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
	TimestampNs int64  `json:"timestamp_ns"`
}

type Engine struct {
	cfg         Config
	redisClient redis.Client
	bus         kafka.Producer
	consumer    kafka.Consumer

	dedup   *dedupWindow
	reorder *reorderBuffer

	lastVCFC   map[string]uint8
	partialBuf map[string][]byte
	mu         sync.Mutex
}

func NewEngine(cfg Config, r redis.Client, bus kafka.Producer, consumer kafka.Consumer) *Engine {
	if cfg.DedupWindow == 0 {
		cfg.DedupWindow = 32
	}
	if cfg.ReorderMaxSize == 0 {
		cfg.ReorderMaxSize = 8
	}
	return &Engine{
		cfg:         cfg,
		redisClient: r,
		bus:         bus,
		consumer:    consumer,
		dedup:       newDedupWindow(cfg.DedupWindow),
		reorder:     newReorderBuffer(cfg.ReorderMaxSize),
		lastVCFC:    make(map[string]uint8),
		partialBuf:  make(map[string][]byte),
	}
}

func (e *Engine) Start(ctx context.Context) error {
	return e.consumer.Subscribe(TopicFrameStream, func(ctx context.Context, msg *kafka.Message) error {
		return e.HandleRawFrame(ctx, msg.Value)
	})
}

func (e *Engine) HandleRawFrame(ctx context.Context, data []byte) error {
	var rf FrameEnvelope
	if err := json.Unmarshal(data, &rf); err != nil {
		return err
	}

	frameBytes, err := base64.StdEncoding.DecodeString(rf.FrameBytesB64)
	if err != nil {
		return err
	}

	frameBytes = e.alignToASM(frameBytes)
	if len(frameBytes) < 4 {
		return nil
	}

	// FR-FRP-01: validate frames and quarantine strangers.
	tf, err := ccsds.ParseTMFrame(frameBytes, true, true)
	if err != nil {
		_ = kafka.ProduceJSON(ctx, e.bus, "tm.ingest.quarantine.v1", nil, map[string]any{
			"error_type": "FRAME_VALIDATION_FAILED",
			"detail":     err.Error(),
		}, nil)
		return nil
	}

	if e.redisClient != nil {
		whitelisted, _ := e.redisClient.HGet(ctx, 1, "scid:whitelist", fmt.Sprintf("%d", tf.SpacecraftID))
		if whitelisted == "" {
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
		return nil
	}

	e.mu.Lock()
	lastFC, hadPrior := e.lastVCFC[key]
	var ready [][]byte
	if !hadPrior {
		// First frame ever seen for this key: nothing to reorder against yet.
		e.lastVCFC[key] = tf.VirtualChannelFC
		ready = [][]byte{frameBytes}
		e.mu.Unlock()
	} else {
		expected := lastFC + 1
		result := e.reorder.Admit(key, tf.VirtualChannelFC, expected, frameBytes)
		e.lastVCFC[key] = result.NextExpected - 1
		e.mu.Unlock()

		if result.GapDeclared {
			e.emitGap(ctx, tf.SpacecraftID, tf.VirtualChannelID, result.GapFrom, tf.VirtualChannelFC, result.GapCount, rf.ReceiveTSNs)
		}
		ready = result.Ready
	}

	for _, fb := range ready {
		e.processFrame(ctx, fb, rf.ReceiveTSNs, rf.PassID, rf.Replay)
	}
	return nil
}

func (e *Engine) processFrame(ctx context.Context, frameBytes []byte, tsNs int64, passID string, replay bool) {
	tf, err := ccsds.ParseTMFrame(frameBytes, true, true)
	if err != nil {
		return
	}

	if tf.OperationalControlField && tf.OCF != nil {
		clcwBytes := make([]byte, 4)
		binary.BigEndian.PutUint32(clcwBytes, *tf.OCF)
		if clcw, err := ccsds.ParseCLCW(clcwBytes); err == nil {
			clcwEvent := map[string]any{
				"scid":         tf.SpacecraftID,
				"v_r":          clcw.ReportValue,
				"retransmit":   clcw.Retransmit,
				"wait":         clcw.Wait,
				"no_rf":        clcw.NoRF,
				"no_bitlock":   clcw.NoBitLock,
				"timestamp_ns": tsNs,
				"pass_id":      passID,
			}
			scidKey := make([]byte, 2)
			binary.BigEndian.PutUint16(scidKey, tf.SpacecraftID)
			// CLCW is published outside the packet transaction, at-least-once,
			// to keep command feedback fast (§15.3).
			_ = kafka.ProduceJSON(ctx, e.bus, TopicCLCW, scidKey, clcwEvent, nil)
		}
	}

	e.reassembleSpacePackets(ctx, tf, tsNs, passID, replay)
}

func (e *Engine) emitGap(ctx context.Context, scid uint16, vcid uint8, expectedFC, receivedFC uint8, lost int, tsNs int64) {
	key := fmt.Sprintf("%d:%d", scid, vcid)
	gap := GapEvent{SCID: scid, VCID: vcid, ExpectedFC: expectedFC, ReceivedFC: receivedFC, LostFrames: lost, TimestampNs: tsNs}
	_ = kafka.ProduceJSON(ctx, e.bus, "telemetry.gaps", []byte(key), gap, nil)
}

func (e *Engine) alignToASM(data []byte) []byte {
	for i := 0; i+4 <= len(data); i++ {
		if binary.BigEndian.Uint32(data[i:i+4]) == ccsds.CCSDS_ASM {
			return data[i:]
		}
	}
	return data
}

func (e *Engine) reassembleSpacePackets(ctx context.Context, tf *ccsds.TransferFrame, tsNs int64, passID string, replay bool) {
	e.mu.Lock()
	defer e.mu.Unlock()

	key := fmt.Sprintf("%d:%d", tf.SpacecraftID, tf.VirtualChannelID)
	buf := e.partialBuf[key]
	buf = append(buf, tf.DataField...)

	offset := 0
	if tf.FirstHeaderPointer != ccsds.FHP_NO_PACKET_HEADER && tf.FirstHeaderPointer != ccsds.FHP_IDLE_DATA {
		offset = int(tf.FirstHeaderPointer)
	}

	for offset+6 <= len(buf) {
		pkt, err := ccsds.ParseSpacePacket(buf[offset:])
		if err != nil {
			break
		}

		totalPktLen := 6 + len(pkt.Data)
		if offset+totalPktLen > len(buf) {
			break
		}

		if pkt.APID == idleAPID {
			offset += totalPktLen // FR-FRP-01: idle fill is filtered, never forwarded
			continue
		}

		spMsg := SpacePacketMessage{
			SCID:           tf.SpacecraftID,
			APID:           pkt.APID,
			SeqCount:       pkt.SeqCount,
			SeqFlags:       pkt.SeqFlags,
			PacketBytesB64: base64.StdEncoding.EncodeToString(pkt.Data),
			ReceiveTSNs:    tsNs,
			PassID:         passID,
			Replay:         replay,
		}

		scidKey := make([]byte, 2)
		binary.BigEndian.PutUint16(scidKey, tf.SpacecraftID)
		_ = kafka.ProduceJSON(ctx, e.bus, TopicPacketsRealtime, scidKey, spMsg, nil)

		offset += totalPktLen
	}

	if offset < len(buf) {
		e.partialBuf[key] = buf[offset:]
	} else {
		e.partialBuf[key] = nil
	}
}
