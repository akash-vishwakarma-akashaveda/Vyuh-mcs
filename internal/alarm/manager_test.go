package alarm

import (
	"context"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/stretchr/testify/assert"
)

func TestAlarmManager_DedupAndInhibit(t *testing.T) {
	ctx := context.Background()
	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	mgr := NewAlarmManagerService(bus, rClient)

	evt := &AlarmEvent{
		AlarmID:    "alm-unit-01",
		SCID:       42,
		ParamName:  "BATT_TEMP",
		AlarmLevel: "HIGH",
		EUValue:    50.0,
		Threshold:  45.0,
		EUUnit:     "°C",
		TS:         time.Now().UTC(),
	}

	// 1. First alarm triggers
	err := mgr.HandleAlarmEvent(ctx, evt)
	assert.NoError(t, err)

	rec, exists := mgr.GetAlarm("alm-unit-01")
	assert.True(t, exists)
	assert.Equal(t, "ACTIVE", rec.Status)

	// 2. Second alarm within 30s is suppressed
	evt2 := &AlarmEvent{
		AlarmID:    "alm-unit-02",
		SCID:       42,
		ParamName:  "BATT_TEMP",
		AlarmLevel: "HIGH",
		EUValue:    51.0,
		Threshold:  45.0,
		EUUnit:     "°C",
		TS:         time.Now().UTC(),
	}
	err = mgr.HandleAlarmEvent(ctx, evt2)
	assert.NoError(t, err)

	_, exists2 := mgr.GetAlarm("alm-unit-02")
	assert.False(t, exists2)

	// 3. Acknowledge
	assert.True(t, mgr.Acknowledge("alm-unit-01", "operator:test"))
	recAck, _ := mgr.GetAlarm("alm-unit-01")
	assert.Equal(t, "ACKNOWLEDGED", recAck.Status)
	assert.Equal(t, "operator:test", recAck.AcknowledgedBy)

	// 4. Inhibit check
	_ = rClient.Set(ctx, 2, "alarm:inhibit:42:VOLTAGE", "1", 0)
	evtInhibit := &AlarmEvent{
		AlarmID:    "alm-unit-03",
		SCID:       42,
		ParamName:  "VOLTAGE",
		AlarmLevel: "LOW",
		EUValue:    20.0,
		Threshold:  22.0,
		EUUnit:     "V",
		TS:         time.Now().UTC(),
	}
	err = mgr.HandleAlarmEvent(ctx, evtInhibit)
	assert.NoError(t, err)
	_, exists3 := mgr.GetAlarm("alm-unit-03")
	assert.False(t, exists3)
}
