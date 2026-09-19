package linkgateway_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/linkgateway"
)

// fakeAdapter pushes one fixed payload then blocks until ctx is done.
type fakeAdapter struct {
	name    string
	payload []byte
}

func (a *fakeAdapter) Name() string { return a.name }
func (a *fakeAdapter) Start(ctx context.Context, out chan<- linkgateway.RawUnit) error {
	out <- linkgateway.RawUnit{SourceAdapter: a.name, ReceivedAtNs: time.Now().UnixNano(), Payload: a.payload}
	<-ctx.Done()
	return nil
}

func TestGatewayPublishesFrameEnvelope(t *testing.T) {
	bus := kafka.NewMemoryBus()
	gw := linkgateway.NewGateway(linkgateway.Config{AntennaID: "ANT-TEST"}, bus)
	gw.AddAdapter(&fakeAdapter{name: "fake:1", payload: []byte("not-a-real-ccsds-frame-but-bytes")}, nil)

	received := make(chan linkgateway.FrameEnvelope, 1)
	_ = bus.Subscribe(linkgateway.TopicFrameStream, func(ctx context.Context, msg *kafka.Message) error {
		var env linkgateway.FrameEnvelope
		if err := json.Unmarshal(msg.Value, &env); err != nil {
			return err
		}
		received <- env
		return nil
	})

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	go func() { _ = gw.Start(ctx) }()

	select {
	case env := <-received:
		if env.SourceAdapter != "fake:1" {
			t.Fatalf("source adapter = %q, want fake:1", env.SourceAdapter)
		}
		if env.AntennaID != "ANT-TEST" {
			t.Fatalf("antenna id = %q, want ANT-TEST", env.AntennaID)
		}
	case <-time.After(1500 * time.Millisecond):
		t.Fatal("timed out waiting for frame envelope on tm.frames.stream.v1")
	}
}
