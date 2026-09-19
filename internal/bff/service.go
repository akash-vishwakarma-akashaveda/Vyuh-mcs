// Package bff implements the Operator BFF (architecture v2.2 §21.2): screen-
// shaped APIs that hide the internal service landscape from the web console.
// Aggregation endpoints combine what a screen needs in one call (a satellite's
// health = CVT snapshot + open alarms); commanding and the simulator's fault
// controls are reached through it too, so the console depends on one stable
// origin and the BFF is the single place operator identity is attached.
package bff

import (
	"encoding/json"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"

	"github.com/akashaveda/vyuh-mcs/config"
	"github.com/akashaveda/vyuh-mcs/internal/alarm"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
)

// AlarmSource is the Alarm Manager as the BFF needs it.
type AlarmSource interface {
	List(scid uint16, openOnly bool) []alarm.AlarmRecord
	Acknowledge(alarmID, user string) bool
}

type Config struct {
	Redis        redis.Client
	Fleet        *config.Fleet
	Alarms       AlarmSource // nil: alarm endpoints answer 503
	CommandsURL  string      // Command Gateway base URL, e.g. http://127.0.0.1:8080
	SimulatorURL string      // Spacecraft Simulator control API base URL
}

type Service struct {
	cfg Config
}

func NewService(cfg Config) *Service {
	if cfg.Fleet == nil {
		cfg.Fleet = config.DefaultFleet()
	}
	return &Service{cfg: cfg}
}

// operator is the identity attached to state-changing calls. It comes from the
// session once real sign-in exists; until then the console sends its persona.
func operator(r *http.Request) string {
	if v := r.Header.Get("X-Operator-ID"); v != "" {
		return v
	}
	return "user:operator"
}

func (s *Service) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /api/v1/satellites", s.handleSatellites)
	mux.HandleFunc("GET /api/v1/satellites/{id}/health", s.handleHealth)
	mux.HandleFunc("GET /api/v1/alarms", s.handleAlarms)
	mux.HandleFunc("POST /api/v1/alarms/{id}/acknowledge", s.handleAcknowledge)
	mux.HandleFunc("GET /health", s.handleService)

	if s.cfg.CommandsURL != "" {
		mux.Handle("/api/v1/commands", s.proxy(s.cfg.CommandsURL, nil))
		mux.Handle("/api/v1/commands/", s.proxy(s.cfg.CommandsURL, nil))
	}
	if s.cfg.SimulatorURL != "" {
		// /api/v1/simulator/faults[/{sat}]  ->  simulator /v1/faults[/{sat}]
		mux.Handle("/api/v1/simulator/", s.proxy(s.cfg.SimulatorURL, func(p string) string {
			return "/v1/" + strings.TrimPrefix(p, "/api/v1/simulator/")
		}))
	}
	return mux
}

func (s *Service) proxy(target string, rewrite func(string) string) http.Handler {
	u, err := url.Parse(target)
	if err != nil {
		return http.NotFoundHandler()
	}
	rp := httputil.NewSingleHostReverseProxy(u)
	orig := rp.Director
	rp.Director = func(r *http.Request) {
		orig(r)
		if rewrite != nil {
			r.URL.Path = rewrite(r.URL.Path)
			r.URL.RawPath = ""
		}
		r.Header.Set("X-Operator-ID", operator(r)) // the BFF, not the browser, vouches for identity
	}
	rp.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": "UPSTREAM_UNAVAILABLE", "detail": err.Error()})
	}
	return rp
}

func (s *Service) handleSatellites(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"satellites": s.cfg.Fleet.All()})
}

// handleHealth is the aggregation endpoint from §21.2: one call gives a
// screen the satellite's CVT snapshot and its open alarms.
func (s *Service) handleHealth(w http.ResponseWriter, r *http.Request) {
	sat, ok := s.cfg.Fleet.BySatID(r.PathValue("id"))
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "SATELLITE_NOT_FOUND"})
		return
	}

	params := map[string]telemetry.LiveValue{}
	if s.cfg.Redis != nil {
		if all, err := s.cfg.Redis.HGetAll(r.Context(), 0, telemetry.CVTKey(sat.Tenant, sat.SCID)); err == nil {
			for name, raw := range all {
				var v telemetry.LiveValue
				if json.Unmarshal([]byte(raw), &v) == nil {
					v.ParamID = name
					params[name] = v
				}
			}
		}
	}

	alarms := []map[string]any{}
	if s.cfg.Alarms != nil {
		for _, a := range s.cfg.Alarms.List(sat.SCID, true) {
			alarms = append(alarms, a.ConsoleView(sat.SatID))
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"sat_id": sat.SatID, "scid": sat.SCID, "tenant": sat.Tenant,
		"as_of":  time.Now().UTC().Format(time.RFC3339Nano),
		"params": params, "alarms": alarms,
	})
}

func (s *Service) handleAlarms(w http.ResponseWriter, r *http.Request) {
	if s.cfg.Alarms == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "ALARM_MANAGER_UNAVAILABLE"})
		return
	}
	var scid uint16
	if id := r.URL.Query().Get("satellite"); id != "" {
		sat, ok := s.cfg.Fleet.BySatID(id)
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "SATELLITE_NOT_FOUND"})
			return
		}
		scid = sat.SCID
	}
	openOnly := r.URL.Query().Get("open") == "true"

	out := []map[string]any{}
	for _, a := range s.cfg.Alarms.List(scid, openOnly) {
		sat, _ := s.cfg.Fleet.BySCID(a.SCID)
		out = append(out, a.ConsoleView(sat.SatID))
	}
	writeJSON(w, http.StatusOK, map[string]any{"alarms": out})
}

func (s *Service) handleAcknowledge(w http.ResponseWriter, r *http.Request) {
	if s.cfg.Alarms == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "ALARM_MANAGER_UNAVAILABLE"})
		return
	}
	id := r.PathValue("id")
	if !s.cfg.Alarms.Acknowledge(id, operator(r)) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "ALARM_NOT_FOUND"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"alarm_id": id, "status": "ACKNOWLEDGED", "acknowledged_by": operator(r)})
}

func (s *Service) handleService(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "service": "bff"})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
