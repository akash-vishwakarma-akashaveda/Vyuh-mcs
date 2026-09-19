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

	svc := NewGapReplayService(bus, bus, rClient)

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
