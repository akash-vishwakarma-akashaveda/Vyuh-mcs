package dlm

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
)

func TestDeadLetterMonitor_Direct(t *testing.T) {
	ctx := context.Background()
	monitor := NewDeadLetterMonitor(nil)

	assert.Equal(t, 0, monitor.TotalCount())

	entry := &DeadLetterEntry{
		Service:      "tfpe",
		ErrorType:    "CRC_FAILURE",
		SCID:         42,
		Reason:       "CRC check failed",
		ReceivedTime: time.Now().UTC(),
	}

	err := monitor.HandleDeadLetter(ctx, entry)
	assert.NoError(t, err)
	assert.Equal(t, 1, monitor.TotalCount())
	assert.Equal(t, 1, monitor.RecentRate())
}
