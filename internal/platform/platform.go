// Package platform wires the shared service-template pieces (health, metrics,
// logging) together the same way in every service, per architecture v2.2 §22.2.
package platform

import (
	"context"
	"net/http"

	"github.com/akashaveda/vyuh-mcs/internal/platform/health"
	"github.com/akashaveda/vyuh-mcs/internal/platform/metrics"
)

// ServeObservability starts the /livez, /readyz, /startupz and /metrics
// server for a service and stops it when ctx is done. It never blocks the
// caller — run it in a goroutine.
func ServeObservability(ctx context.Context, addr string, h *health.Server) {
	mux := h.Mux()
	mux.Handle("GET /metrics", metrics.Handler())

	srv := &http.Server{Addr: addr, Handler: mux}
	go func() {
		<-ctx.Done()
		_ = srv.Close()
	}()

	_ = srv.ListenAndServe()
}
