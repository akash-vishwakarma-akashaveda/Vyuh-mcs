package simulator

import (
	"encoding/json"
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
	return mux
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
