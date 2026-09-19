package livetelemetry

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

func packet(scid uint16, at time.Time, params ...telemetry.DecodedParameter) telemetry.ProcessedTelemetryMessage {
	for i := range params {
		params[i].SCID = scid
		params[i].Timestamp = at
	}
	return telemetry.ProcessedTelemetryMessage{SCID: scid, Params: params, ReceiveTSNs: time.Now().UnixNano()}
}

func TestEngineGetValues_FreshVsStale(t *testing.T) {
	bus := kafka.NewMemoryBus()
	r := redis.NewMemoryClient()
	e := NewEngine(Config{StaleAfter: 300 * time.Millisecond}, r, bus)
	ctx := context.Background()
	require.NoError(t, e.Start(ctx))

	_ = kafka.ProduceJSON(ctx, bus, TopicParamsRealtime, nil,
		packet(3, time.Now(), telemetry.DecodedParameter{ParamName: "BUS_VOLTAGE", EUValue: 28.1, EUUnit: "V"}), nil)
	time.Sleep(50 * time.Millisecond) // let the async MemoryBus dispatch land

	readings := e.GetValues(3, []string{"BUS_VOLTAGE", "MISSING_PARAM"})
	require.Len(t, readings, 2)
	assert.True(t, readings[0].Present && !readings[0].Stale, "BUS_VOLTAGE fresh: %+v", readings[0])
	assert.False(t, readings[1].Present)

	time.Sleep(350 * time.Millisecond)
	assert.True(t, e.GetValues(3, []string{"BUS_VOLTAGE"})[0].Stale)
}

// One packet -> one coalesced delta batch on the satellite's channel, with a
// monotonically increasing seq, alarm levels collapsed to 0/1/2, and the CVT
// mirrored to the Redis hash a gateway snapshots from.
func TestEngine_PublishesBatchedDeltaAndMirrorsCVT(t *testing.T) {
	bus := kafka.NewMemoryBus()
	r := redis.NewMemoryClient()
	e := NewEngine(Config{}, r, bus)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	require.NoError(t, e.Start(ctx))

	ch, err := r.SubscribeCtx(ctx, telemetry.DeltaChannel("akashaveda", 3))
	require.NoError(t, err)

	_ = kafka.ProduceJSON(ctx, bus, TopicParamsRealtime, nil, packet(3, time.Now(),
		telemetry.DecodedParameter{ParamName: "BAT_TEMP", EUValue: 3.2, EUUnit: "°C", AlarmState: telemetry.AlarmLowLow},
		telemetry.DecodedParameter{ParamName: "BUS_VOLTAGE", EUValue: 29.4, EUUnit: "V"},
	), nil)

	select {
	case raw := <-ch:
		var d telemetry.LiveDelta
		require.NoError(t, json.Unmarshal([]byte(raw), &d))
		assert.Equal(t, uint16(3), d.SCID)
		assert.Equal(t, uint64(1), d.Seq)
		require.Len(t, d.Values, 2, "one packet is one batch")
		byName := map[string]telemetry.LiveValue{}
		for _, v := range d.Values {
			byName[v.ParamID] = v
		}
		assert.Equal(t, uint8(2), byName["BAT_TEMP"].AlarmState, "LOW_LOW is critical")
		assert.Equal(t, uint8(0), byName["BUS_VOLTAGE"].AlarmState)
		assert.NotZero(t, d.ERTNs, "receive time carried for the latency probe")
	case <-time.After(2 * time.Second):
		t.Fatal("no delta published")
	}

	snap, err := r.HGetAll(ctx, 0, telemetry.CVTKey("akashaveda", 3))
	require.NoError(t, err)
	assert.Contains(t, snap, "BAT_TEMP")
	assert.Contains(t, snap, "BUS_VOLTAGE")
}

func TestEngine_CVTNeverGoesBackwardsInOnBoardTime(t *testing.T) {
	bus := kafka.NewMemoryBus()
	e := NewEngine(Config{DeltaEvery: time.Nanosecond}, nil, bus)
	ctx := context.Background()

	now := time.Now()
	e.handle(ctx, ptr(packet(3, now, telemetry.DecodedParameter{ParamName: "BUS_VOLTAGE", EUValue: 29})))
	e.handle(ctx, ptr(packet(3, now.Add(-time.Hour), telemetry.DecodedParameter{ParamName: "BUS_VOLTAGE", EUValue: 11}))) // older OBT

	got := e.GetValues(3, []string{"BUS_VOLTAGE"})[0]
	assert.Equal(t, 29.0, got.Value.EUValue, "an older sample must not overwrite a newer one")
}

func ptr[T any](v T) *T { return &v }
