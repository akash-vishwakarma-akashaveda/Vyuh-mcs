package main

import (
	"context"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/dlm"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/stretchr/testify/assert"
)

func TestDLM_Ingestion(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	bus := kafka.NewMemoryBus()
	monitor := dlm.NewDeadLetterMonitor(bus)
	assert.NoError(t, monitor.Start(ctx))

	entry := dlm.DeadLetterEntry{
		Service:   "tfpe",
		ErrorType: "UNKNOWN_SCID",
		SCID:      999,
		Reason:    "not whitelisted",
	}

	_ = kafka.ProduceJSON(ctx, bus, "dead.letter", nil, entry, nil)

	assert.Eventually(t, func() bool {
		return monitor.TotalCount() == 1
	}, 1*time.Second, 10*time.Millisecond)
}
