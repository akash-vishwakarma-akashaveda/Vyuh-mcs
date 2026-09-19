package main

import (
	"context"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/alarm"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/stretchr/testify/assert"
)

func TestAlarmManager_DedupAndAcknowledge(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	mgr := alarm.NewAlarmManagerService(bus, rClient)
	assert.NoError(t, mgr.Start(ctx))

	// Subscribe to Redis pub/sub channel ws:alarms:42
	alarmPubSub := rClient.Subscribe("ws:alarms:42")

	evt1 := alarm.AlarmEvent{
		AlarmID:    "alm-001",
		SCID:       42,
		ParamName:  "BATT_TEMP",
		AlarmLevel: "HIGH",
		EUValue:    45.2,
		Threshold:  45.0,
		EUUnit:     "degC",
		TS:         time.Now().UTC(),
	}

	// 1. Send first alarm
	_ = kafka.ProduceJSON(ctx, bus, "alarm.events", []byte("42:BATT_TEMP"), evt1, nil)

	select {
	case msg := <-alarmPubSub:
		assert.Contains(t, msg, "BATT_TEMP")
		assert.Contains(t, msg, "alm-001")
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for alarm on pubsub")
	}

	// 2. Send repeat identical alarm within 30s -> MUST be deduplicated/suppressed
	evtRepeat := alarm.AlarmEvent{
		AlarmID:    "alm-002",
		SCID:       42,
		ParamName:  "BATT_TEMP",
		AlarmLevel: "HIGH",
		EUValue:    45.3,
		Threshold:  45.0,
		EUUnit:     "degC",
		TS:         time.Now().UTC(),
	}
	_ = kafka.ProduceJSON(ctx, bus, "alarm.events", []byte("42:BATT_TEMP"), evtRepeat, nil)
	time.Sleep(100 * time.Millisecond)

	select {
	case <-alarmPubSub:
		t.Fatal("duplicate alarm within 30s should have been suppressed")
	default:
	}

	// 3. Acknowledge alarm
	assert.True(t, mgr.Acknowledge("alm-001", "operator:akash"))
	rec, ok := mgr.GetAlarm("alm-001")
	assert.True(t, ok)
	assert.Equal(t, "ACKNOWLEDGED", rec.Status)
	assert.Equal(t, "operator:akash", rec.AcknowledgedBy)
}
