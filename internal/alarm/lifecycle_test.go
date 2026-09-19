package alarm

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func next(t *testing.T, ch <-chan string) AlarmRecord {
	t.Helper()
	select {
	case raw := <-ch:
		var rec AlarmRecord
		require.NoError(t, json.Unmarshal([]byte(raw), &rec))
		return rec
	case <-time.After(time.Second):
		t.Fatal("no alarm update published")
		return AlarmRecord{}
	}
}

// One alarm per parameter: escalation updates it (and un-acknowledges it),
// acknowledgement and return-to-normal are published to every console, and a
// fresh excursion after clearing raises a new alarm.
func TestAlarmLifecycle_EscalateAcknowledgeClear(t *testing.T) {
	ctx := context.Background()
	r := redis.NewMemoryClient()
	svc := NewAlarmManagerService(kafka.NewMemoryBus(), r)
	updates := r.Subscribe(telemetry.AlarmChannel(3))

	evt := func(id, level, direction string, v float64) *AlarmEvent {
		return &AlarmEvent{AlarmID: id, SCID: 3, ParamName: "BAT_TEMP", AlarmLevel: level, Direction: direction, EUValue: v, EUUnit: "°C", TS: time.Now()}
	}

	require.NoError(t, svc.HandleAlarmEvent(ctx, evt("a1", "LOW", "TRIGGERED", 9.5)))
	rec := next(t, updates)
	assert.Equal(t, "ACTIVE", rec.Status)
	assert.Equal(t, "LOW", rec.Level)

	require.True(t, svc.Acknowledge("a1", "operator:akash"))
	rec = next(t, updates)
	assert.Equal(t, "ACKNOWLEDGED", rec.Status)
	assert.Equal(t, "operator:akash", rec.AcknowledgedBy)

	// Getting worse un-acknowledges it — same alarm, higher level.
	require.NoError(t, svc.HandleAlarmEvent(ctx, evt("a2", "LOW_LOW", "TRIGGERED", 3.1)))
	rec = next(t, updates)
	assert.Equal(t, "a1", rec.AlarmID, "escalation updates the open alarm, it does not create a second one")
	assert.Equal(t, "LOW_LOW", rec.Level)
	assert.Equal(t, "ACTIVE", rec.Status)
	assert.Len(t, svc.List(3, true), 1)

	require.NoError(t, svc.HandleAlarmEvent(ctx, evt("a3", "NORMAL", "CLEARED", 18.4)))
	rec = next(t, updates)
	assert.Equal(t, "CLEARED", rec.Status)
	assert.NotNil(t, rec.ClearedAt)
	assert.Empty(t, svc.List(3, true), "no open alarms after return to normal")
	assert.Len(t, svc.List(3, false), 1, "history keeps it")

	// A new excursion right after clearing must alarm again (not deduplicated).
	require.NoError(t, svc.HandleAlarmEvent(ctx, evt("a4", "LOW", "TRIGGERED", 9.0)))
	rec = next(t, updates)
	assert.Equal(t, "a4", rec.AlarmID)
	assert.Equal(t, "ACTIVE", rec.Status)
}
