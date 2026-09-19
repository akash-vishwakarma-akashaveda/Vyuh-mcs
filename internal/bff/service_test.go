package bff

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/alarm"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func get(t *testing.T, h http.Handler, path string) (int, map[string]any) {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, path, nil))
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	return rec.Code, body
}

func newAlarms(t *testing.T, r redis.Client) *alarm.AlarmManagerService {
	t.Helper()
	svc := alarm.NewAlarmManagerService(kafka.NewMemoryBus(), r)
	require.NoError(t, svc.HandleAlarmEvent(context.Background(), &alarm.AlarmEvent{
		AlarmID: "AL-1", SCID: 3, ParamName: "BAT_TEMP", AlarmLevel: "LOW_LOW", Direction: "TRIGGERED",
		EUValue: 3.1, EUUnit: "°C", TS: time.Now(),
	}))
	return svc
}

// One call gives a screen the satellite's CVT snapshot and its open alarms
// (§21.2) — read from the real CVT and the real Alarm Manager, nothing canned.
func TestSatelliteHealthAggregatesCVTAndAlarms(t *testing.T) {
	r := redis.NewMemoryClient()
	v, _ := json.Marshal(telemetry.LiveValue{ParamID: "BAT_TEMP", EUValue: 3.1, Unit: "°C", AlarmState: 2})
	_ = r.HSet(context.Background(), 0, telemetry.CVTKey("akashaveda", 3), "BAT_TEMP", string(v))

	h := NewService(Config{Redis: r, Alarms: newAlarms(t, r)}).Routes()

	code, body := get(t, h, "/api/v1/satellites/AKV-03/health")
	require.Equal(t, http.StatusOK, code)
	assert.Equal(t, "AKV-03", body["sat_id"])
	params := body["params"].(map[string]any)
	assert.Equal(t, 3.1, params["BAT_TEMP"].(map[string]any)["eu_value"])
	alarms := body["alarms"].([]any)
	require.Len(t, alarms, 1)
	assert.EqualValues(t, 2, alarms[0].(map[string]any)["alarm_state"])

	code, body = get(t, h, "/api/v1/satellites/AKV-04/health")
	require.Equal(t, http.StatusOK, code)
	assert.Empty(t, body["alarms"], "another satellite has no alarms")

	code, _ = get(t, h, "/api/v1/satellites/NOPE-99/health")
	assert.Equal(t, http.StatusNotFound, code)
}

func TestAlarmsListAndAcknowledgeUseTheAlarmManager(t *testing.T) {
	r := redis.NewMemoryClient()
	alarms := newAlarms(t, r)
	h := NewService(Config{Redis: r, Alarms: alarms}).Routes()

	code, body := get(t, h, "/api/v1/alarms?satellite=AKV-03&open=true")
	require.Equal(t, http.StatusOK, code)
	require.Len(t, body["alarms"], 1)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/alarms/AL-1/acknowledge", nil)
	req.Header.Set("X-Operator-ID", "user:priya")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	require.Equal(t, http.StatusOK, rec.Code)

	rec2, ok := alarms.GetAlarm("AL-1")
	require.True(t, ok)
	assert.Equal(t, "ACKNOWLEDGED", rec2.Status)
	assert.Equal(t, "user:priya", rec2.AcknowledgedBy, "the operator identity comes from the request")

	// An unknown alarm is a 404, not silently created.
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/alarms/nope/acknowledge", nil))
	assert.Equal(t, http.StatusNotFound, rec.Code)
}

func TestAlarmEndpointsUnavailableWithoutAlarmManager(t *testing.T) {
	h := NewService(Config{}).Routes()
	code, _ := get(t, h, "/api/v1/alarms")
	assert.Equal(t, http.StatusServiceUnavailable, code)
}

// Commands and the simulator's fault controls are reached through the BFF;
// it forwards the body and stamps the operator identity itself.
func TestProxiesCommandsAndSimulator(t *testing.T) {
	var gotPath, gotOperator, gotBody string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath, gotOperator = r.URL.Path, r.Header.Get("X-Operator-ID")
		b, _ := io.ReadAll(r.Body)
		gotBody = string(b)
		w.WriteHeader(http.StatusAccepted)
		_, _ = w.Write([]byte(`{"ok":true}`))
	}))
	defer upstream.Close()

	h := NewService(Config{CommandsURL: upstream.URL, SimulatorURL: upstream.URL}).Routes()

	req := httptest.NewRequest(http.MethodPost, "/api/v1/commands", strings.NewReader(`{"scid":3}`))
	req.Header.Set("X-Operator-ID", "user:vikram")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	assert.Equal(t, http.StatusAccepted, rec.Code)
	assert.Equal(t, "/api/v1/commands", gotPath)
	assert.Equal(t, "user:vikram", gotOperator)
	assert.JSONEq(t, `{"scid":3}`, gotBody)

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/api/v1/simulator/faults", strings.NewReader(`{"sat_id":"AKV-03","fault":"HEATER_A_FAIL"}`)))
	assert.Equal(t, "/v1/faults", gotPath, "the simulator API lives under /v1")
	assert.Equal(t, "user:operator", gotOperator, "default identity when the caller sends none")

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodDelete, "/api/v1/simulator/faults/AKV-03", nil))
	assert.Equal(t, "/v1/faults/AKV-03", gotPath)
}

func TestUpstreamDownIsA502NotAHang(t *testing.T) {
	h := NewService(Config{CommandsURL: "http://127.0.0.1:1"}).Routes()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/api/v1/commands", nil))
	assert.Equal(t, http.StatusBadGateway, rec.Code)
}
