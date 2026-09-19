package realtimegateway

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type rig struct {
	t      *testing.T
	ctx    context.Context
	redis  *redis.MemoryClient
	engine *Engine
	srv    *httptest.Server
}

func newRig(t *testing.T, cfg Config) *rig {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	t.Cleanup(cancel)
	r := redis.NewMemoryClient()
	e := NewEngine(r, cfg)
	srv := httptest.NewServer(e.Handler(ctx))
	t.Cleanup(srv.Close)
	return &rig{t: t, ctx: ctx, redis: r, engine: e, srv: srv}
}

type conn struct {
	t *testing.T
	c *websocket.Conn
}

func (r *rig) dial() *conn {
	r.t.Helper()
	url := "ws" + strings.TrimPrefix(r.srv.URL, "http") + "/ws/telemetry"
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	require.NoError(r.t, err)
	r.t.Cleanup(func() { _ = c.Close() })
	return &conn{t: r.t, c: c}
}

func (c *conn) send(v any) {
	c.t.Helper()
	require.NoError(c.t, c.c.WriteJSON(v))
}

func (c *conn) next() map[string]any {
	c.t.Helper()
	_ = c.c.SetReadDeadline(time.Now().Add(2 * time.Second))
	var m map[string]any
	require.NoError(c.t, c.c.ReadJSON(&m))
	return m
}

// nextOfType skips frames until one of the wanted type arrives.
func (c *conn) nextOfType(typ string) map[string]any {
	c.t.Helper()
	for i := 0; i < 20; i++ {
		if m := c.next(); m["type"] == typ {
			return m
		}
	}
	c.t.Fatalf("no %s frame", typ)
	return nil
}

func (r *rig) publishDelta(scid uint16, seq uint64, ert int64, values ...telemetry.LiveValue) {
	_ = r.redis.Publish(r.ctx, telemetry.DeltaChannel("akashaveda", scid), telemetry.LiveDelta{SCID: scid, Seq: seq, ERTNs: ert, Values: values})
}

func (r *rig) seedCVT(scid uint16, v telemetry.LiveValue) {
	b, _ := json.Marshal(v)
	_ = r.redis.HSet(r.ctx, 0, telemetry.CVTKey("akashaveda", scid), v.ParamID, string(b))
}

func values(m map[string]any) map[string]map[string]any {
	out := map[string]map[string]any{}
	for _, raw := range m["values"].([]any) {
		v := raw.(map[string]any)
		out[v["param_id"].(string)] = v
	}
	return out
}

func TestHelloThenSnapshotThenDelta(t *testing.T) {
	r := newRig(t, Config{})
	r.seedCVT(3, telemetry.LiveValue{ParamID: "BAT_TEMP", EUValue: 18.5, Unit: "°C"})
	r.seedCVT(3, telemetry.LiveValue{ParamID: "BUS_VOLTAGE", EUValue: 29.3, Unit: "V"})

	c := r.dial()
	hello := c.next()
	assert.Equal(t, "HELLO", hello["type"])
	assert.NotEmpty(t, hello["instance_id"])

	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "s1", "kind": "PARAMS", "satellite": "AKV-03"})
	snap := c.nextOfType("SNAPSHOT")
	assert.Equal(t, "AKV-03", snap["satellite"])
	assert.Equal(t, "s1", snap["sub_id"])
	assert.Len(t, values(snap), 2)

	r.publishDelta(3, 1, 111, telemetry.LiveValue{ParamID: "BAT_TEMP", EUValue: 17.9, AlarmState: 1})
	d := c.nextOfType("DELTA")
	assert.Equal(t, "s1", d["sub_id"])
	assert.EqualValues(t, 1, d["seq"])
	assert.EqualValues(t, 111, d["ert_ns"], "gateway receive time is carried for the latency probe")
	assert.NotZero(t, d["gw_ns"])
	assert.Equal(t, 17.9, values(d)["BAT_TEMP"]["eu_value"])
	assert.EqualValues(t, 1, values(d)["BAT_TEMP"]["alarm_state"])
}

func TestParamFilterAndUnknownSatellite(t *testing.T) {
	r := newRig(t, Config{})
	c := r.dial()
	c.nextOfType("HELLO")

	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "x", "kind": "PARAMS", "satellite": "NOPE-99"})
	e := c.nextOfType("ERROR")
	assert.Equal(t, "UNKNOWN_SATELLITE", e["code"])

	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "s1", "kind": "PARAMS", "satellite": "AKV-03", "params": []string{"BAT_TEMP"}})
	c.nextOfType("SNAPSHOT")

	r.publishDelta(3, 1, 0, telemetry.LiveValue{ParamID: "BUS_VOLTAGE", EUValue: 30}, telemetry.LiveValue{ParamID: "BAT_TEMP", EUValue: 12})
	d := c.nextOfType("DELTA")
	got := values(d)
	assert.Contains(t, got, "BAT_TEMP")
	assert.NotContains(t, got, "BUS_VOLTAGE", "unsubscribed parameters are filtered server-side")
}

// Value lane conflates: a burst of updates to one parameter inside a flush
// window reaches the client as far fewer frames, and the last value wins.
func TestValueLaneConflatesBursts(t *testing.T) {
	r := newRig(t, Config{FlushEvery: 100 * time.Millisecond})
	c := r.dial()
	c.nextOfType("HELLO")
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "s1", "kind": "PARAMS", "satellite": "AKV-03"})
	c.nextOfType("SNAPSHOT")

	for i := 1; i <= 50; i++ {
		r.publishDelta(3, uint64(i), 0, telemetry.LiveValue{ParamID: "BAT_TEMP", EUValue: float64(i)})
	}

	// A read timeout permanently fails a gorilla connection, so collect frames
	// from a reader goroutine and count them over a fixed window instead.
	in := make(chan map[string]any, 100)
	go func() {
		for {
			var m map[string]any
			if err := c.c.ReadJSON(&m); err != nil {
				return
			}
			in <- m
		}
	}()

	frames, last := 0, 0.0
	window := time.After(600 * time.Millisecond)
collect:
	for {
		select {
		case m := <-in:
			if m["type"] == "DELTA" {
				frames++
				last = values(m)["BAT_TEMP"]["eu_value"].(float64)
			}
		case <-window:
			break collect
		}
	}
	assert.Less(t, frames, 10, "50 updates must be conflated, not forwarded one by one")
	assert.Equal(t, 50.0, last, "the newest value wins")
}

func alarmJSON(id, level, status string) map[string]any {
	return map[string]any{
		"alarmId": id, "scid": 3, "paramName": "BAT_TEMP", "level": level, "value": 3.1, "unit": "°C",
		"triggeredAt": time.Now().UTC().Format(time.RFC3339Nano), "status": status,
	}
}

func TestAlarmFramesAreMappedAndCarryEventSeq(t *testing.T) {
	r := newRig(t, Config{})
	c := r.dial()
	c.nextOfType("HELLO")
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "a", "kind": "ALARMS", "scope": []string{"*"}})
	c.nextOfType("SUBSCRIBED")

	_ = r.redis.Publish(r.ctx, telemetry.AlarmChannel(3), alarmJSON("AL-1", "LOW_LOW", "ACTIVE"))
	f := c.nextOfType("ALARM")
	assert.EqualValues(t, 1, f["event_seq"])
	assert.Equal(t, "AKV-03", f["satellite"])
	al := f["alarm"].(map[string]any)
	assert.Equal(t, "AL-1", al["alarm_id"])
	assert.Equal(t, "AKV-03", al["sat_id"])
	assert.Equal(t, "BAT_TEMP", al["param_id"])
	assert.EqualValues(t, 2, al["alarm_state"], "LOW_LOW is critical")
	assert.Equal(t, false, al["acknowledged"])
}

func TestAlarmScopeFiltersSatellites(t *testing.T) {
	r := newRig(t, Config{})
	c := r.dial()
	c.nextOfType("HELLO")
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "a", "kind": "ALARMS", "scope": []string{"AKV-05"}})
	c.nextOfType("SUBSCRIBED")

	_ = r.redis.Publish(r.ctx, telemetry.AlarmChannel(3), alarmJSON("AL-1", "LOW", "ACTIVE")) // AKV-03: out of scope
	_ = r.redis.Publish(r.ctx, telemetry.AlarmChannel(5), alarmJSON("AL-2", "LOW", "ACTIVE")) // AKV-05
	f := c.nextOfType("ALARM")
	assert.Equal(t, "AKV-05", f["satellite"])
}

// A reconnecting client re-subscribes, then asks to resume: alarms raised
// while it was away are replayed; a different gateway instance or a cursor
// older than the retained window is refused so the client refreshes instead.
func TestResumeReplaysMissedAlarms(t *testing.T) {
	r := newRig(t, Config{})

	// Alarm raised while nobody is connected.
	first := r.dial()
	hello := first.nextOfType("HELLO")
	instance := hello["instance_id"].(string)
	_ = first.c.Close()
	_ = r.redis.Publish(r.ctx, telemetry.AlarmChannel(3), alarmJSON("AL-1", "HIGH", "ACTIVE"))
	require.Eventually(t, func() bool { return r.engine.hub.currentSeq() == 1 }, time.Second, 10*time.Millisecond)

	c := r.dial()
	c.nextOfType("HELLO")
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "a", "kind": "ALARMS", "scope": []string{"*"}})
	c.nextOfType("SUBSCRIBED")
	c.send(map[string]any{"type": "RESUME", "instance_id": instance, "last_event_seq": 0})

	f := c.nextOfType("ALARM")
	assert.EqualValues(t, 1, f["event_seq"])
	done := c.nextOfType("RESUMED")
	assert.EqualValues(t, 1, done["replayed"])

	// Nothing more to replay from the current position.
	c.send(map[string]any{"type": "RESUME", "instance_id": instance, "last_event_seq": 1})
	done = c.nextOfType("RESUMED")
	assert.EqualValues(t, 0, done["replayed"])

	c.send(map[string]any{"type": "RESUME", "instance_id": "some-other-gateway", "last_event_seq": 1})
	failed := c.nextOfType("RESUME_FAILED")
	assert.Equal(t, "INSTANCE_CHANGED", failed["reason"])
}

func TestHeartbeatCarriesEventSeq(t *testing.T) {
	r := newRig(t, Config{HeartbeatEvery: 40 * time.Millisecond})
	c := r.dial()
	hb := c.nextOfType("HEARTBEAT")
	assert.NotEmpty(t, hb["server_time_utc"])
	assert.EqualValues(t, 0, hb["event_seq"])
}

func TestUnsubscribeStopsDeltasAndReleasesWatcher(t *testing.T) {
	r := newRig(t, Config{})
	c := r.dial()
	c.nextOfType("HELLO")
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "s1", "kind": "PARAMS", "satellite": "AKV-03"})
	c.nextOfType("SNAPSHOT")
	require.Len(t, r.engine.hub.watch, 1)

	c.send(map[string]any{"type": "UNSUBSCRIBE", "sub_id": "s1"})
	require.Eventually(t, func() bool {
		r.engine.hub.mu.Lock()
		defer r.engine.hub.mu.Unlock()
		return len(r.engine.hub.watch) == 0
	}, time.Second, 10*time.Millisecond, "the satellite watcher is released with its last subscriber")
}
