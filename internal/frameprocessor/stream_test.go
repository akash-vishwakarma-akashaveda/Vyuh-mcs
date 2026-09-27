package frameprocessor

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"math/rand"
	"sync"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

// harness drives the engine frame by frame and collects what it forwards.
type harness struct {
	t    *testing.T
	e    *Engine
	mu   sync.Mutex
	pkts []SpacePacketMessage
	gaps []GapEvent
}

func newHarness(t *testing.T) *harness {
	t.Helper()
	pipeline.Reset()
	bus := kafka.NewMemoryBus()
	r := redis.NewMemoryClient()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	_ = r.HSet(ctx, 1, "scid:whitelist", "7", "1")
	h := &harness{t: t, e: NewEngine(Config{}, r, bus, bus)}
	if err := h.e.Start(ctx); err != nil {
		t.Fatal(err)
	}
	_ = bus.Subscribe(TopicPacketsRealtime, func(_ context.Context, m *kafka.Message) error {
		var sp SpacePacketMessage
		_ = json.Unmarshal(m.Value, &sp)
		h.mu.Lock()
		h.pkts = append(h.pkts, sp)
		h.mu.Unlock()
		return nil
	})
	_ = bus.Subscribe(TopicGaps, func(_ context.Context, m *kafka.Message) error {
		var g GapEvent
		_ = json.Unmarshal(m.Value, &g)
		h.mu.Lock()
		h.gaps = append(h.gaps, g)
		h.mu.Unlock()
		return nil
	})
	return h
}

func (h *harness) feed(frame []byte) {
	env, _ := json.Marshal(FrameEnvelope{SCID: 7, FrameBytesB64: base64.StdEncoding.EncodeToString(frame), ReceiveTSNs: time.Now().UnixNano()})
	if err := h.e.HandleRawFrame(context.Background(), env); err != nil {
		h.t.Fatal(err)
	}
}

func (h *harness) settle(want int) []SpacePacketMessage {
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		h.mu.Lock()
		n := len(h.pkts)
		h.mu.Unlock()
		if n >= want {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	time.Sleep(50 * time.Millisecond)
	h.mu.Lock()
	defer h.mu.Unlock()
	return append([]SpacePacketMessage(nil), h.pkts...)
}

// stream builds n packets of random length on APID 0x70 and frames them.
func stream(n int, frameLen int, seed int64) (packets [][]byte, frames [][]byte) {
	rng := rand.New(rand.NewSource(seed))
	mux := ccsds.NewVCMux(7, 1, frameLen, true, nil)
	for i := 0; i < n; i++ {
		data := make([]byte, 4+rng.Intn(600))
		rng.Read(data)
		p := (&ccsds.SpacePacket{APID: 0x70, SeqFlags: 3, SeqCount: uint16(i), Data: data}).Marshal()
		packets = append(packets, p)
		mux.Push(p)
		for f := mux.Next(false); f != nil; f = mux.Next(false) {
			frames = append(frames, f)
		}
	}
	for mux.Pending() > 0 {
		frames = append(frames, mux.Next(true))
	}
	return packets, frames
}

// checkIntact asserts every forwarded packet is byte-identical to one sent, in order.
func checkIntact(t *testing.T, sent [][]byte, got []SpacePacketMessage) {
	t.Helper()
	last := -1
	for _, g := range got {
		body, _ := base64.StdEncoding.DecodeString(g.PacketBytesB64)
		i := int(g.SeqCount)
		if i >= len(sent) || !bytes.Equal(sent[i][6:], body) {
			t.Fatalf("packet seq %d is corrupted or unknown", i)
		}
		if i <= last {
			t.Fatalf("packet seq %d out of order after %d", i, last)
		}
		last = i
	}
}

func TestStream_PacketsSpanningFramesReassembleIntact(t *testing.T) {
	h := newHarness(t)
	sent, frames := stream(200, 256, 1)
	for _, f := range frames {
		h.feed(f)
	}
	got := h.settle(len(sent))
	if len(got) != len(sent) {
		t.Fatalf("got %d packets, want %d", len(got), len(sent))
	}
	checkIntact(t, sent, got)
	if pipeline.Get("packet.seq_gap") != 0 || pipeline.Get("packet.spill_mismatch") != 0 {
		t.Fatalf("unexpected errors: %+v", pipeline.Take().Stages["packet"])
	}
}

func TestStream_IdleFramesCarryNoData(t *testing.T) {
	h := newHarness(t)
	mux := ccsds.NewVCMux(7, 1, 256, true, nil)
	var sent [][]byte
	for i := 0; i < 20; i++ {
		p := (&ccsds.SpacePacket{APID: 0x70, SeqFlags: 3, SeqCount: uint16(i), Data: bytes.Repeat([]byte{byte(i)}, 300)}).Marshal()
		sent = append(sent, p)
		mux.Push(p)
		h.feed(mux.Next(true))
		h.feed(mux.Next(true)) // drains the rest of the packet or sends idle
		h.feed(mux.Next(true))
	}
	got := h.settle(len(sent))
	if len(got) != len(sent) {
		t.Fatalf("got %d packets, want %d", len(got), len(sent))
	}
	checkIntact(t, sent, got)
	if pipeline.Get("frame.idle") == 0 {
		t.Fatal("expected idle frames to be recognised")
	}
}

func TestStream_LostFrameDeclaresGapAndNeverEmitsACorruptPacket(t *testing.T) {
	h := newHarness(t)
	sent, frames := stream(200, 256, 2)
	for i, f := range frames {
		if i == 40 || i == 41 || i == 90 {
			continue // lost on the link
		}
		h.feed(f)
	}
	got := h.settle(len(sent) - 10)
	checkIntact(t, sent, got) // nothing spliced from unrelated bytes
	if len(got) >= len(sent) {
		t.Fatal("packets in lost frames cannot all have arrived")
	}
	h.mu.Lock()
	defer h.mu.Unlock()
	lost := 0
	for _, g := range h.gaps {
		lost += g.LostFrames
	}
	if lost != 3 {
		t.Fatalf("gap events report %d lost frames, want 3 (%+v)", lost, h.gaps)
	}
}

func TestStream_ReorderedFramesAreRestored(t *testing.T) {
	h := newHarness(t)
	sent, frames := stream(150, 256, 3)
	// Pairs swapped from the very first frame: session start-up holds the first
	// frames and anchors on the earliest, so even frame 0 arriving second is kept.
	for i := 0; i+1 < len(frames); i += 2 {
		frames[i], frames[i+1] = frames[i+1], frames[i]
	}
	for _, f := range frames {
		h.feed(f)
	}
	got := h.settle(len(sent))
	if len(got) != len(sent) {
		t.Fatalf("got %d packets, want %d", len(got), len(sent))
	}
	checkIntact(t, sent, got)
}

func TestStream_GapReleasedOnTimeoutWhenStreamStops(t *testing.T) {
	h := newHarness(t)
	sent, frames := stream(30, 256, 4)
	for i, f := range frames[:12] {
		if i == 5 {
			continue
		}
		h.feed(f)
	}
	// Only a few frames are buffered behind the hole — the window is not full.
	time.Sleep(800 * time.Millisecond) // > ReorderTimeout
	if pipeline.Get("frame.gap_events") != 1 {
		t.Fatalf("expected the overdue gap to be released by timeout, stats %+v", pipeline.Take().Stages["frame"])
	}
	_ = sent
}

func TestStream_LateFrameAfterGapIsDropped(t *testing.T) {
	h := newHarness(t)
	_, frames := stream(100, 256, 5)
	var late []byte
	for i, f := range frames[:40] {
		if i == 10 {
			late = f
			continue
		}
		h.feed(f)
	}
	h.settle(1)
	time.Sleep(700 * time.Millisecond)
	h.feed(late)
	if pipeline.Get("frame.late") != 1 {
		t.Fatalf("late frame should be counted and dropped, stats %+v", pipeline.Take().Stages["frame"])
	}
}

func TestStream_CounterResetIsFollowed(t *testing.T) {
	h := newHarness(t)
	_, first := stream(60, 256, 6)
	for _, f := range first[:50] {
		h.feed(f)
	}
	sent, second := stream(40, 256, 7) // a rebooted spacecraft counts from 0 again
	for _, f := range second {
		h.feed(f)
	}
	got := h.settle(20)
	if pipeline.Get("frame.counter_reset") != 1 {
		t.Fatalf("expected one counter reset, stats %+v", pipeline.Take().Stages["frame"])
	}
	// Packets from after the reset must flow (the first few frames before
	// detection are dropped as late).
	n := 0
	for _, g := range got {
		if g.SeqCount < 40 {
			n++
		}
	}
	if n == 0 {
		t.Fatal("no packets forwarded after the counter reset")
	}
	_ = sent
}

func TestStream_BitErrorIsRejectedByCRC(t *testing.T) {
	h := newHarness(t)
	_, frames := stream(20, 256, 8)
	bad := append([]byte(nil), frames[3]...)
	bad[100] ^= 0x10
	h.feed(bad)
	if pipeline.Get("frame.crc_error") != 1 {
		t.Fatalf("expected CRC rejection, stats %+v", pipeline.Take().Stages["frame"])
	}
}
