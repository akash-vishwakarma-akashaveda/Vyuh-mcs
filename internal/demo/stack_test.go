package demo

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/akashaveda/vyuh-mcs/internal/command"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/simulator"
	"github.com/gorilla/websocket"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func freeAddr(t *testing.T) string {
	t.Helper()
	l, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	defer l.Close()
	return l.Addr().String()
}

type ws struct {
	t  *testing.T
	in chan map[string]any
	c  *websocket.Conn
}

func dial(t *testing.T, url string) *ws {
	t.Helper()
	c, _, err := websocket.DefaultDialer.Dial("ws"+strings.TrimPrefix(url, "http")+"/ws/telemetry", nil)
	require.NoError(t, err)
	w := &ws{t: t, c: c, in: make(chan map[string]any, 4096)}
	t.Cleanup(func() { _ = c.Close() })
	go func() {
		for {
			var m map[string]any
			if c.ReadJSON(&m) != nil {
				close(w.in)
				return
			}
			w.in <- m
		}
	}()
	return w
}

// until returns the first frame matching pred, or fails after the timeout.
func (w *ws) until(timeout time.Duration, pred func(map[string]any) bool) map[string]any {
	w.t.Helper()
	deadline := time.After(timeout)
	for {
		select {
		case m, ok := <-w.in:
			if !ok {
				w.t.Fatal("connection closed while waiting")
			}
			if pred(m) {
				return m
			}
		case <-deadline:
			w.t.Fatal("timed out waiting for frame")
			return nil
		}
	}
}

func isType(typ string) func(map[string]any) bool {
	return func(m map[string]any) bool { return m["type"] == typ }
}

func paramValue(m map[string]any, param string) (map[string]any, bool) {
	vals, _ := m["values"].([]any)
	for _, raw := range vals {
		if v, ok := raw.(map[string]any); ok && v["param_id"] == param {
			return v, true
		}
	}
	return nil, false
}

// The whole ground segment, end to end: a simulated spacecraft's bytes cross
// a real TCP link, are deframed, de-duplicated, decommutated with the released
// dictionary, held in the CVT and arrive at a WebSocket client as live values
// with spacecraft time and a measurable end-to-end latency.
func TestSpacecraftToBrowser_LiveTelemetry(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	simCfg := simulator.DefaultConfig()
	simCfg.Cycle = 120 * time.Millisecond
	st, err := Start(ctx, Options{TCPAddr: freeAddr(t), Sim: simCfg, RunSim: true})
	require.NoError(t, err)

	srv := httptest.NewServer(st.RTG.Handler(ctx))
	defer srv.Close()
	c := dial(t, srv.URL)

	c.until(2*time.Second, isType("HELLO"))
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "s1", "kind": "PARAMS", "satellite": "AKV-03", "params": []string{"BUS_VOLTAGE", "BAT_TEMP"}})

	// Live deltas arrive (the snapshot may be empty if it beat the first packet).
	delta := c.until(5*time.Second, func(m map[string]any) bool {
		if m["type"] != "DELTA" {
			return false
		}
		_, ok := paramValue(m, "BUS_VOLTAGE")
		return ok
	})
	v, _ := paramValue(delta, "BUS_VOLTAGE")
	assert.InDelta(t, 29.36, v["eu_value"], 1.5, "value decoded through the dictionary")
	assert.EqualValues(t, 0, v["quality"], "correlated on-board time => good quality (not stale)")
	assert.Equal(t, "V", v["unit"])

	// Sample time is the spacecraft clock, close to now.
	ts, err := time.Parse(time.RFC3339Nano, v["timestamp_utc"].(string))
	require.NoError(t, err)
	assert.WithinDuration(t, time.Now(), ts, 3*time.Second)

	// End-to-end latency: link gateway receive -> here (Q-01 budget is 100 ms in production; generous locally).
	ert := int64(delta["ert_ns"].(float64))
	require.NotZero(t, ert)
	latency := time.Since(time.Unix(0, ert))
	assert.Less(t, latency, time.Second, "gateway receive -> client")
	t.Logf("end-to-end latency: %v", latency)
}

// Demo Journey 1, first half: a heater fault on AKV-03 drives the battery
// temperature through its limits; the operator sees a warning that escalates
// to critical — one alarm, not two — and sees it clear after recovery.
func TestHeaterFault_RaisesEscalatesAndClearsAlarm(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	simCfg := simulator.DefaultConfig()
	simCfg.Cycle = 100 * time.Millisecond
	simCfg.TimeScale = 25 // 60 s of fault dynamics in ~2.4 s
	st, err := Start(ctx, Options{TCPAddr: freeAddr(t), Sim: simCfg, RunSim: true})
	require.NoError(t, err)

	srv := httptest.NewServer(st.RTG.Handler(ctx))
	defer srv.Close()
	c := dial(t, srv.URL)
	c.until(2*time.Second, isType("HELLO"))
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "a", "kind": "ALARMS", "scope": []string{"*"}})
	c.until(2*time.Second, isType("SUBSCRIBED"))

	// Let telemetry flow, then break heater A on AKV-03.
	time.Sleep(600 * time.Millisecond)
	require.NoError(t, st.Sim.Apply("AKV-03", simulator.FaultHeaterAFail))

	warn := c.until(15*time.Second, func(m map[string]any) bool {
		return m["type"] == "ALARM" && m["satellite"] == "AKV-03"
	})
	al := warn["alarm"].(map[string]any)
	assert.Equal(t, "BAT_TEMP", al["param_id"])
	assert.EqualValues(t, 1, al["alarm_state"], "first a warning as the battery passes 10 °C")
	alarmID := al["alarm_id"]

	crit := c.until(15*time.Second, func(m map[string]any) bool {
		a, ok := m["alarm"].(map[string]any)
		return m["type"] == "ALARM" && ok && a["alarm_state"] == float64(2)
	})
	assert.Equal(t, alarmID, crit["alarm"].(map[string]any)["alarm_id"], "escalation updates the same alarm")

	// Only AKV-03 alarmed.
	assert.Len(t, st.Alarms.List(0, true), 1)

	// Recovery: heater B on, temperature returns, alarm clears.
	require.NoError(t, st.Sim.Apply("AKV-03", "HTR_B_ON"))
	cleared := c.until(20*time.Second, func(m map[string]any) bool {
		a, ok := m["alarm"].(map[string]any)
		return m["type"] == "ALARM" && ok && a["status"] == "CLEARED"
	})
	assert.Equal(t, alarmID, cleared["alarm"].(map[string]any)["alarm_id"])
}

func (w *ws) send(v any) {
	w.t.Helper()
	require.NoError(w.t, w.c.WriteJSON(v))
}

func statusOf(m map[string]any) (id, status, reason string) {
	st, _ := m["status"].(map[string]any)
	id, _ = st["command_id"].(string)
	status, _ = st["status"].(string)
	reason, _ = st["reason"].(string)
	return
}

func post(t *testing.T, h http.Handler, path, operator string, body any) map[string]any {
	t.Helper()
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(b))
	req.Header.Set("X-Operator-ID", operator)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	require.Equal(t, http.StatusAccepted, rec.Code, rec.Body.String())
	var out map[string]any
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out))
	return out
}

// Demo Journey 1 end to end: after the heater fault the operator sends the
// real recovery command. It crosses the safety chain, is encrypted, framed
// under COP-1, received and authenticated by the spacecraft, acknowledged
// through the CLCW on the downlink, and its physical effect is what clears
// the alarm — and the consoles see every status change live.
func TestCommandLoop_HeaterSwitchRecoversBattery(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	simCfg := simulator.DefaultConfig()
	simCfg.Cycle = 100 * time.Millisecond
	simCfg.TimeScale = 25
	st, err := Start(ctx, Options{TCPAddr: freeAddr(t), Sim: simCfg, RunSim: true})
	require.NoError(t, err)

	srv := httptest.NewServer(st.RTG.Handler(ctx))
	defer srv.Close()
	c := dial(t, srv.URL)
	c.until(2*time.Second, isType("HELLO"))
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "al", "kind": "ALARMS", "scope": []string{"*"}})
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "st", "kind": "STATUS", "scope": []string{"*"}})
	c.until(2*time.Second, isType("SUBSCRIBED"))

	time.Sleep(500 * time.Millisecond)
	require.NoError(t, st.Sim.Apply("AKV-03", simulator.FaultHeaterAFail))
	c.until(15*time.Second, func(m map[string]any) bool {
		a, ok := m["alarm"].(map[string]any)
		return m["type"] == "ALARM" && ok && a["alarm_state"] == float64(2)
	})

	// The operator's recovery: switch heater B on.
	sent := post(t, st.CmdGW.Routes(), "/api/v1/commands", "user:vikram", map[string]any{
		"scid": 3, "apid": 0x021, "priority": "CRITICAL", "params": map[string]any{"HEATER": "B", "STATE": "ON"},
	})
	id := sent["commandId"].(string)

	var seen []string
	for len(seen) == 0 || seen[len(seen)-1] != "COMPLETED" {
		m := c.until(10*time.Second, func(m map[string]any) bool {
			cid, _, _ := statusOf(m)
			return m["type"] == "STATUS" && cid == id
		})
		_, status, _ := statusOf(m)
		seen = append(seen, status)
	}
	// Every status reaches the console in lifecycle order, ending with the
	// spacecraft's own completion report (PUS-1 TM(1,7)).
	assert.Equal(t, "PENDING", seen[0])
	assert.Contains(t, seen, "SENT")
	assert.Equal(t, "COMPLETED", seen[len(seen)-1])
	for i := 1; i < len(seen); i++ {
		assert.GreaterOrEqual(t, command.Rank(command.CommandStatus(seen[i])), command.Rank(command.CommandStatus(seen[i-1])), "status went backwards: %v", seen)
	}

	// The spacecraft received, authenticated and executed it.
	require.Eventually(t, func() bool { return len(st.Sim.Executed("AKV-03")) == 1 }, 3*time.Second, 20*time.Millisecond)
	exec := st.Sim.Executed("AKV-03")[0]
	assert.Equal(t, "EXECUTED", exec.Result)
	assert.Equal(t, "B", exec.Params["HEATER"])

	// The physical effect is what recovers the battery and clears the alarm.
	cleared := c.until(20*time.Second, func(m map[string]any) bool {
		a, ok := m["alarm"].(map[string]any)
		return m["type"] == "ALARM" && ok && a["status"] == "CLEARED"
	})
	assert.Equal(t, "BAT_TEMP", cleared["alarm"].(map[string]any)["param_id"])
}

// A command outside its range is stopped by the uplink safety chain: the
// operator sees FAILED with the reason, and nothing reaches the spacecraft.
func TestCommandOutOfRangeIsRejectedBeforeUplink(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	st, err := Start(ctx, Options{TCPAddr: freeAddr(t), Sim: simulator.DefaultConfig(), RunSim: false})
	require.NoError(t, err)

	srv := httptest.NewServer(st.RTG.Handler(ctx))
	defer srv.Close()
	c := dial(t, srv.URL)
	c.until(2*time.Second, isType("HELLO"))
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "st", "kind": "STATUS", "scope": []string{"AKV-03"}})
	c.until(2*time.Second, isType("SUBSCRIBED"))

	sent := post(t, st.CmdGW.Routes(), "/api/v1/commands", "user:vikram", map[string]any{
		"scid": 3, "apid": 0x021, "params": map[string]any{"HEATER": "B", "SETPOINT": 99},
	})
	id := sent["commandId"].(string)

	failed := c.until(5*time.Second, func(m map[string]any) bool {
		cid, status, _ := statusOf(m)
		return m["type"] == "STATUS" && cid == id && status == "FAILED"
	})
	_, _, reason := statusOf(failed)
	assert.Contains(t, reason, "L1 check failed")
	assert.Empty(t, st.Sim.Executed("AKV-03"), "the spacecraft never saw it")
}
