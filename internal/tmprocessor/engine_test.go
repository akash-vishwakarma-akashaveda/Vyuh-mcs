package tmprocessor

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/akashaveda/vyuh-mcs/pkg/xtce"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTMProcessor_DecommutatesPacket(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	engine := NewEngine(Config{}, rClient, bus, bus)
	assert.NoError(t, engine.Start(ctx))

	hiVoltage, loVoltage := 32.0, 24.0
	engine.RegisterParameterSet(&xtce.ParameterSet{
		SCID: 42, APID: 100,
		Parameters: []*xtce.Parameter{{
			SCID: 42, APID: 100, Name: "BUS_VOLTAGE", DataType: "UINT",
			BitOffset: 0, BitLength: 16, Unit: "V", CalibType: "NONE",
			Alarms: &xtce.AlarmLimits{HighLimit: &hiVoltage, LowLimit: &loVoltage, AlarmEnabled: true},
		}},
	})

	paramsChan := make(chan telemetry.ProcessedTelemetryMessage, 5)
	_ = bus.Subscribe(TopicParamsRealtime, func(ctx context.Context, msg *kafka.Message) error {
		var pm telemetry.ProcessedTelemetryMessage
		if json.Unmarshal(msg.Value, &pm) == nil {
			paramsChan <- pm
		}
		return nil
	})

	payload := []byte{0x00, 28} // BUS_VOLTAGE raw = 28
	sp := SpacePacketMessage{SCID: 42, APID: 100, PacketBytesB64: base64.StdEncoding.EncodeToString(payload), ReceiveTSNs: time.Now().UnixNano()}
	_ = kafka.ProduceJSON(ctx, bus, TopicPacketsRealtime, []byte("42"), sp, nil)

	select {
	case pm := <-paramsChan:
		assert.Equal(t, uint16(42), pm.SCID)
		assert.Len(t, pm.Params, 1)
		assert.Equal(t, "BUS_VOLTAGE", pm.Params[0].ParamName)
		assert.Equal(t, float64(28), pm.Params[0].EUValue)
		// No OBT was in the message, so correlation falls back to receive
		// time and marks the sample QualityUncertain (FR-TMP-02 fallback).
		assert.Equal(t, telemetry.QualityUncertain, pm.Params[0].Quality)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for processed telemetry")
	}
}

func TestTimeCorrelator(t *testing.T) {
	tc := NewTimeCorrelator()

	// No entry yet: falls back to receive time, marked stale.
	now := time.Now()
	got, stale := tc.Correlate(42, 1000, now)
	assert.True(t, stale)
	assert.Equal(t, now, got)

	// With a correlation entry: obtRaw ticks convert to TAI via the epoch.
	epoch := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	tc.Set(42, epoch, 10) // 10 ticks/sec
	got, stale = tc.Correlate(42, 50, now)
	assert.False(t, stale)
	assert.Equal(t, epoch.Add(5*time.Second), got) // 50 ticks / 10 ticks-per-sec = 5s
}

// The dictionary declares an on-board time header: the sample time must be the
// spacecraft's clock (epoch + ticks), and a correlated sample is good quality.
func TestTMProcessor_UsesOnBoardTimeHeader(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	bus := kafka.NewMemoryBus()
	engine := NewEngine(Config{}, redis.NewMemoryClient(), bus, bus)
	require.NoError(t, engine.Start(ctx))

	engine.RegisterParameterSet(&xtce.ParameterSet{
		SCID: 42, APID: 100, TimeHeaderBytes: 6, TimeEpoch: "2026-01-01T00:00:00Z", TimeTicksPerSec: 65536,
		Parameters: []*xtce.Parameter{{
			SCID: 42, APID: 100, Name: "BUS_VOLTAGE", DataType: "UINT", BitOffset: 48, BitLength: 16, CalibType: "NONE",
		}},
	})

	got := make(chan telemetry.ProcessedTelemetryMessage, 1)
	_ = bus.Subscribe(TopicParamsRealtime, func(ctx context.Context, msg *kafka.Message) error {
		var pm telemetry.ProcessedTelemetryMessage
		if json.Unmarshal(msg.Value, &pm) == nil {
			got <- pm
		}
		return nil
	})

	// 10 s of ticks (655360 = 0x0A0000) in a 6-byte big-endian header, then BUS_VOLTAGE = 28.
	payload := []byte{0x00, 0x00, 0x00, 0x0A, 0x00, 0x00, 0x00, 28}
	sp := SpacePacketMessage{SCID: 42, APID: 100, PacketBytesB64: base64.StdEncoding.EncodeToString(payload), ReceiveTSNs: 123456789}
	_ = kafka.ProduceJSON(ctx, bus, TopicPacketsRealtime, []byte("42"), sp, nil)

	select {
	case pm := <-got:
		require.Len(t, pm.Params, 1)
		epoch := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
		assert.True(t, pm.Params[0].Timestamp.Equal(epoch.Add(10*time.Second)), "timestamp = %v", pm.Params[0].Timestamp)
		assert.Equal(t, telemetry.QualityGood, pm.Params[0].Quality)
		assert.Equal(t, int64(123456789), pm.ReceiveTSNs, "ERT carried through for the latency probe")
		assert.Equal(t, float64(28), pm.Params[0].EUValue)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for processed telemetry")
	}
}
