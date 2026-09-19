// Package logging provides the structured JSON logger required by the
// architecture (FRD §16.2): every entry carries ts, level, service, pod and msg,
// plus whatever call-site fields (scid, trace_id, duration_ms, ...) are passed.
package logging

import (
	"log/slog"
	"os"
)

// New returns a JSON slog.Logger with "service" and "pod" bound to every record.
// pod defaults to the POD_NAME env var (falls back to hostname) so it matches
// what Kubernetes would inject without any extra wiring in dev.
func New(service string) *slog.Logger {
	pod := os.Getenv("POD_NAME")
	if pod == "" {
		if h, err := os.Hostname(); err == nil {
			pod = h
		} else {
			pod = "unknown"
		}
	}

	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		ReplaceAttr: func(groups []string, a slog.Attr) slog.Attr {
			if a.Key == slog.TimeKey {
				a.Key = "ts"
			}
			if a.Key == slog.MessageKey {
				a.Key = "msg"
			}
			if a.Key == slog.LevelKey {
				a.Key = "level"
			}
			return a
		},
	})

	return slog.New(handler).With("service", service, "pod", pod)
}
