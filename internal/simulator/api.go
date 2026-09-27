package simulator

import (
	"encoding/json"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"net/http"
)

// Handler is the simulator's control surface (S23 Simulator screen: fault
// injection controls). Faults change what the spacecraft physically does;
// the ground segment only ever sees the resulting telemetry.
//
//	GET    /v1/faults                    active faults by satellite
//	POST   /v1/faults {sat_id, fault}    inject HEATER_A_FAIL | HTR_B_ON | CLEAR
//	DELETE /v1/faults/{sat_id}           back to nominal
func (s *Simulator) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/faults", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, s.ActiveFaults())
	})
	mux.HandleFunc("POST /v1/faults", func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			SatID string `json:"sat_id"`
			Fault string `json:"fault"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		if err := s.Apply(body.SatID, body.Fault); err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, s.ActiveFaults())
	})
	mux.HandleFunc("DELETE /v1/faults/{sat_id}", func(w http.ResponseWriter, r *http.Request) {
		if err := s.Apply(r.PathValue("sat_id"), "CLEAR"); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, s.ActiveFaults())
	})
	s.replayRoutes(mux)
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// replayRoutes serves the OPS-SAT replay, the link impairments and the
// pipeline counters (the simulator UI's data).
//
//	GET  /v1/replay                  replay status
//	POST /v1/replay {action, speed, position_pct, loop}
//	POST /v1/replay/inject {event, arg}   counter_reset | time_jump | unknown_apid | bad_packet | stall
//	GET  /v1/link                    current impairments
//	PUT  /v1/link {…Impairments}
//	GET  /v1/pipeline/stats          per-stage counters and latency
//	GET  /v1/pipeline/events         recent anomaly detections and dead letters
//	POST /v1/uplink/drop             lose the next telecommand frame on the forward link
//	POST /v1/pipeline/reset          zero every counter and the replay ledger
func (s *Simulator) replayRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /v1/replay", func(w http.ResponseWriter, r *http.Request) {
		if s.replay == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no replay configured"})
			return
		}
		writeJSON(w, http.StatusOK, s.replay.Status())
	})
	mux.HandleFunc("POST /v1/replay", func(w http.ResponseWriter, r *http.Request) {
		if s.replay == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no replay configured"})
			return
		}
		var c ReplayControl
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		if err := s.replay.Control(s.runCtx(), c); err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, s.replay.Status())
	})
	mux.HandleFunc("POST /v1/replay/inject", func(w http.ResponseWriter, r *http.Request) {
		if s.replay == nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no replay configured"})
			return
		}
		var body struct {
			Event string  `json:"event"`
			Arg   float64 `json:"arg"`
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		if err := s.replay.Inject(body.Event, body.Arg); err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
			return
		}
		writeJSON(w, http.StatusOK, s.replay.Status())
	})
	mux.HandleFunc("GET /v1/link", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, s.link.Impairments())
	})
	mux.HandleFunc("PUT /v1/link", func(w http.ResponseWriter, r *http.Request) {
		var imp Impairments
		if err := json.NewDecoder(r.Body).Decode(&imp); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
			return
		}
		if err := imp.Validate(); err != nil {
			writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": err.Error()})
			return
		}
		s.link.SetImpairments(imp)
		writeJSON(w, http.StatusOK, s.link.Impairments())
	})
	mux.HandleFunc("GET /v1/pipeline/stats", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, pipeline.Take())
	})
	mux.HandleFunc("GET /v1/pipeline/events", func(w http.ResponseWriter, r *http.Request) {
		if s.events == nil {
			writeJSON(w, http.StatusOK, map[string]any{})
			return
		}
		writeJSON(w, http.StatusOK, s.events())
	})
	mux.HandleFunc("POST /v1/uplink/drop", func(w http.ResponseWriter, r *http.Request) {
		s.DropNextTC(1)
		writeJSON(w, http.StatusOK, map[string]any{"dropping_next_tc_frames": 1})
	})
	mux.HandleFunc("POST /v1/pipeline/reset", func(w http.ResponseWriter, r *http.Request) {
		pipeline.Reset()
		if s.replay != nil {
			s.replay.ResetLedger()
		}
		writeJSON(w, http.StatusOK, pipeline.Take())
	})
}
