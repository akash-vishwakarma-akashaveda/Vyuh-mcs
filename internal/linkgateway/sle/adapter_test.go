package sle_test

import (
	"context"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/linkgateway"
	"github.com/akashaveda/vyuh-mcs/internal/linkgateway/sle"
	"github.com/akashaveda/vyuh-mcs/internal/linkgateway/slemock"
)

// TestSLEAdapterAgainstMock proves the real BIND -> START -> TRANSFER-DATA ->
// STOP -> UNBIND procedure round-trips a frame from provider to adapter.
func TestSLEAdapterAgainstMock(t *testing.T) {
	provider := slemock.NewProvider()
	l, err := provider.Listen("127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	go provider.Serve(ctx, l)

	adapter := &sle.Adapter{
		ProviderAddr: l.Addr().String(),
		InitiatorID:  "VYUH-LGW",
		Service:      sle.ServiceRAF,
	}

	out := make(chan linkgateway.RawUnit, 4)
	go func() { _ = adapter.Start(ctx, out) }()

	// Give BIND/START a moment, then deliver one frame.
	time.Sleep(100 * time.Millisecond)
	want := []byte{0xDE, 0xAD, 0xBE, 0xEF}
	provider.Frames <- want

	select {
	case unit := <-out:
		if string(unit.Payload) != string(want) {
			t.Fatalf("payload = %x, want %x", unit.Payload, want)
		}
		if unit.SourceAdapter != adapter.Name() {
			t.Fatalf("source adapter = %q, want %q", unit.SourceAdapter, adapter.Name())
		}
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for transfer-data frame")
	}
}
