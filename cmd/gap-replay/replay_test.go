package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/gapreplay"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/stretchr/testify/assert"
)

func TestGapReplay_RecoverAndReinject(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	svc := gapreplay.NewGapReplayService(bus, bus, rClient)
	assert.NoError(t, svc.Start(ctx))

	replayedChan := make(chan *kafka.Message, 5)
	_ = bus.Subscribe("tm.frames.stream.v1", func(ctx context.Context, msg *kafka.Message) error {
		if msg.Headers != nil && msg.Headers["replay"] == "true" {
			replayedChan <- msg
		}
		return nil
	})

	gap := gapreplay.GapEvent{
		SCID:        42,
		VCID:        1,
		ExpectedFC:  5,
		ReceivedFC:  7,
		LostFrames:  2, // lost frames 5 and 6
		TimestampNs: time.Now().UnixNano(),
	}

	_ = kafka.ProduceJSON(ctx, bus, "telemetry.gaps", []byte("42:1"), gap, nil)

	// Should receive 2 replayed frames
	for i := 0; i < 2; i++ {
		select {
		case msg := <-replayedChan:
			assert.Equal(t, "true", msg.Headers["replay"])
			var rf map[string]any
			assert.NoError(t, json.Unmarshal(msg.Value, &rf))
			assert.Equal(t, float64(42), rf["scid"])
			assert.Equal(t, true, rf["replay"])
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for replayed frame %d", i+1)
		}
	}
}
