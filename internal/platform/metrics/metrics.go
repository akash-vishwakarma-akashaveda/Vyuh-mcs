// Package metrics exposes the standard Prometheus metrics every service must
// publish per the architecture (v2.2 §22.2, FRD §16.1): the auto-registered
// Go/process collectors, reachable at /metrics. Full OpenTelemetry export is
// skipped here since no OTel Collector runs in this environment (see the
// backend plan's "explicit, flagged substitutions").
package metrics

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Handler returns the /metrics endpoint. The default Prometheus registry
// already carries go_goroutines, go_memstats_*, process_cpu_seconds_total,
// etc. from client_golang's init-time registration.
func Handler() http.Handler {
	return promhttp.Handler()
}
