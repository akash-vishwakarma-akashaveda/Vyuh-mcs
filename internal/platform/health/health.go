// Package health implements the service template health endpoints from the
// architecture (v2.2 §22.2): /livez, /readyz, /startupz.
package health

import (
	"encoding/json"
	"net/http"
	"sync"
	"sync/atomic"
)

// Check reports whether a dependency is usable, for /readyz.
type Check func() error

// Server tracks readiness checks and startup state for one service.
type Server struct {
	mu      sync.RWMutex
	checks  map[string]Check
	started atomic.Bool
}

func NewServer() *Server {
	return &Server{checks: make(map[string]Check)}
}

// AddCheck registers a named dependency check, evaluated on every /readyz call.
func (s *Server) AddCheck(name string, c Check) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.checks[name] = c
}

// MarkStarted flips /startupz to 200. Call once initial setup (e.g. subscribing
// to required topics) has completed.
func (s *Server) MarkStarted() {
	s.started.Store(true)
}

func (s *Server) Mux() *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /livez", s.handleLivez)
	mux.HandleFunc("GET /readyz", s.handleReadyz)
	mux.HandleFunc("GET /startupz", s.handleStartupz)
	return mux
}

func (s *Server) handleLivez(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte("ok"))
}

func (s *Server) handleStartupz(w http.ResponseWriter, r *http.Request) {
	if s.started.Load() {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
		return
	}
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = w.Write([]byte("starting"))
}

func (s *Server) handleReadyz(w http.ResponseWriter, r *http.Request) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	deps := make(map[string]string, len(s.checks))
	ready := true
	for name, check := range s.checks {
		if err := check(); err != nil {
			deps[name] = err.Error()
			ready = false
		} else {
			deps[name] = "ok"
		}
	}

	w.Header().Set("Content-Type", "application/json")
	if !ready {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	_ = json.NewEncoder(w).Encode(map[string]any{
		"status":       map[bool]string{true: "ok", false: "degraded"}[ready],
		"dependencies": deps,
	})
}
