package frameprocessor

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/stretchr/testify/assert"
)

func makeFrame(t *testing.T, scid uint16, vc uint8, fc uint8, apid uint16, seq uint16) []byte {
	t.Helper()
	pkt := &ccsds.SpacePacket{APID: apid, SeqCount: seq, SeqFlags: 3, Data: []byte{0x01, 0x02, 0x03}}
	frame := &ccsds.TransferFrame{
		TransferFrameVersion: 0,
		SpacecraftID:         scid,
		VirtualChannelID:     vc,
		VirtualChannelFC:     fc,
		FirstHeaderPointer:   0,
		DataField:            pkt.Marshal(),
	}
	return frame.Marshal(true, true)
}

func newTestEngine(t *testing.T) (*Engine, *kafka.MemoryBus, chan SpacePacketMessage, chan GapEvent) {
	t.Helper()
	bus := kafka.NewMemoryBus()
	r := redis.NewMemoryClient()
	ctx := context.Background()
	_ = r.HSet(ctx, 1, "scid:whitelist", "42", "1")

	e := NewEngine(Config{}, r, bus, bus)
	assert.NoError(t, e.Start(ctx))

	spChan := make(chan SpacePacketMessage, 10)
	_ = bus.Subscribe(TopicPacketsRealtime, func(ctx context.Context, msg *kafka.Message) error {
		var sp SpacePacketMessage
		if json.Unmarshal(msg.Value, &sp) == nil {
			spChan <- sp
		}
		return nil
	})
	gapChan := make(chan GapEvent, 10)
	_ = bus.Subscribe("telemetry.gaps", func(ctx context.Context, msg *kafka.Message) error {
		var g GapEvent
		if json.Unmarshal(msg.Value, &g) == nil {
			gapChan <- g
		}
		return nil
	})
	return e, bus, spChan, gapChan
}

func TestFrameProcessor_ParsesFrameToSpacePacket(t *testing.T) {
	e, bus, spChan, _ := newTestEngine(t)
	ctx := context.Background()

	frameBytes := makeFrame(t, 42, 2, 0, 100, 5)
	env := FrameEnvelope{SCID: 42, FrameBytesB64: base64.StdEncoding.EncodeToString(frameBytes), ReceiveTSNs: time.Now().UnixNano()}
	_ = kafka.ProduceJSON(ctx, bus, TopicFrameStream, []byte{0, 42}, env, nil)
	_ = e

	select {
	case sp := <-spChan:
		assert.Equal(t, uint16(42), sp.SCID)
		assert.Equal(t, uint16(100), sp.APID)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for space packet")
	}
}

// TestFrameProcessor_DropsDuplicateFrame proves FR-FRP-03 dedup: the same
// frame bytes delivered twice (as if received from two ground stations)
// only produces one space packet.
func TestFrameProcessor_DropsDuplicateFrame(t *testing.T) {
	e, bus, spChan, _ := newTestEngine(t)
	ctx := context.Background()
	_ = e

	frameBytes := makeFrame(t, 42, 3, 0, 100, 7)
	env := FrameEnvelope{SCID: 42, FrameBytesB64: base64.StdEncoding.EncodeToString(frameBytes), ReceiveTSNs: time.Now().UnixNano()}
	_ = kafka.ProduceJSON(ctx, bus, TopicFrameStream, []byte{0, 42}, env, nil)
	_ = kafka.ProduceJSON(ctx, bus, TopicFrameStream, []byte{0, 42}, env, nil) // duplicate

	select {
	case <-spChan:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for first space packet")
	}
	select {
	case sp := <-spChan:
		t.Fatalf("duplicate frame should have been dropped, got second packet %+v", sp)
	case <-time.After(300 * time.Millisecond):
		// expected: nothing more arrives
	}
}

// TestFrameProcessor_ReordersOutOfOrderFrames proves FR-FRP-03 reorder:
// frame 1 arriving before frame 0 is buffered, not treated as a gap, and
// both are released once frame 0 shows up.
func TestFrameProcessor_ReordersOutOfOrderFrames(t *testing.T) {
	e, bus, spChan, gapChan := newTestEngine(t)
	ctx := context.Background()
	_ = e

	first := makeFrame(t, 42, 4, 0, 100, 1)
	envFirst := FrameEnvelope{SCID: 42, FrameBytesB64: base64.StdEncoding.EncodeToString(first), ReceiveTSNs: time.Now().UnixNano()}
	_ = kafka.ProduceJSON(ctx, bus, TopicFrameStream, []byte{0, 42}, envFirst, nil)
	select {
	case <-spChan:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for FC 0 packet")
	}

	// FC 2 arrives before FC 1 — should be buffered, no gap declared yet.
	fc2 := makeFrame(t, 42, 4, 2, 100, 3)
	envFC2 := FrameEnvelope{SCID: 42, FrameBytesB64: base64.StdEncoding.EncodeToString(fc2), ReceiveTSNs: time.Now().UnixNano()}
	_ = kafka.ProduceJSON(ctx, bus, TopicFrameStream, []byte{0, 42}, envFC2, nil)

	select {
	case <-spChan:
		t.Fatal("FC 2 should have been buffered, not processed immediately")
	case <-gapChan:
		t.Fatal("no gap should be declared while still within the reorder window")
	case <-time.After(200 * time.Millisecond):
	}

	// FC 1 arrives late — both FC 1 and the buffered FC 2 should drain in order.
	fc1 := makeFrame(t, 42, 4, 1, 100, 2)
	envFC1 := FrameEnvelope{SCID: 42, FrameBytesB64: base64.StdEncoding.EncodeToString(fc1), ReceiveTSNs: time.Now().UnixNano()}
	_ = kafka.ProduceJSON(ctx, bus, TopicFrameStream, []byte{0, 42}, envFC1, nil)

	for i := 0; i < 2; i++ {
		select {
		case <-spChan:
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for reordered packet %d", i)
		}
	}
}
