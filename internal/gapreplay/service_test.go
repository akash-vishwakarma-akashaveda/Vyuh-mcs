package gapreplay

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/stretchr/testify/assert"
)

func TestGapReplayService_DirectRecovery(t *testing.T) {
	ctx := context.Background()
	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	recorded := map[uint8][]byte{10: {0x1A, 0xCF, 0xFC, 0x1D, 1}, 11: {0x1A, 0xCF, 0xFC, 0x1D, 2}}
	svc := NewGapReplayService(bus, bus, rClient, func(scid uint16, vcid, fc uint8, _, _ time.Time) ([]byte, bool) {
		f, ok := recorded[fc]
		return f, ok
	})

	replayedChan := make(chan *kafka.Message, 5)
	_ = bus.Subscribe("tm.frames.stream.v1", func(ctx context.Context, msg *kafka.Message) error {
		if msg.Headers != nil && msg.Headers["replay"] == "true" {
			replayedChan <- msg
		}
		return nil
	})

	gap := &GapEvent{
		SCID:        42,
		VCID:        1,
		ExpectedFC:  10,
		ReceivedFC:  12,
		LostFrames:  2,
		TimestampNs: time.Now().UnixNano(),
	}

	err := svc.HandleGap(ctx, gap)
	assert.NoError(t, err)

	assert.Equal(t, uint64(2), svc.RecoveredCount())

	// Verify frames re-injected
	for i := 0; i < 2; i++ {
		select {
		case msg := <-replayedChan:
			assert.Equal(t, "true", msg.Headers["replay"])
			var rf map[string]any
			assert.NoError(t, json.Unmarshal(msg.Value, &rf))
			assert.Equal(t, float64(42), rf["scid"])
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for replayed frame %d", i+1)
		}
	}

	// Repeated gap should be ignored by Redis filter
	err = svc.HandleGap(ctx, gap)
	assert.NoError(t, err)
	assert.Equal(t, uint64(2), svc.RecoveredCount()) // count should NOT increase
}

// A frame the station never recorded is reported, never invented.
func TestGapReplayService_NeverFabricates(t *testing.T) {
	bus := kafka.NewMemoryBus()
	svc := NewGapReplayService(bus, bus, nil, func(uint16, uint8, uint8, time.Time, time.Time) ([]byte, bool) { return nil, false })
	got := make(chan *kafka.Message, 5)
	_ = bus.Subscribe("tm.frames.stream.v1", func(_ context.Context, m *kafka.Message) error { got <- m; return nil })
	assert.NoError(t, svc.HandleGap(context.Background(), &GapEvent{SCID: 7, VCID: 0, ExpectedFC: 3, LostFrames: 3}))
	select {
	case m := <-got:
		t.Fatalf("a frame was injected for an unrecorded gap: %s", m.Value)
	case <-time.After(300 * time.Millisecond):
	}
	assert.Equal(t, uint64(3), svc.UnrecoverableCount())
	assert.Zero(t, svc.RecoveredCount())
}
