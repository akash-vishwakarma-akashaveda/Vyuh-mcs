package main

import (
	"context"
	"encoding/json"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/livetelemetry"
	"github.com/akashaveda/vyuh-mcs/internal/platform"
	"github.com/akashaveda/vyuh-mcs/internal/platform/health"
	"github.com/akashaveda/vyuh-mcs/internal/platform/logging"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	log := logging.New("live-telemetry")
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	var rClient redis.Client = redis.NewMemoryClient()
	if addr := os.Getenv("REDIS_ADDR"); addr != "" {
		rClient = redis.NewRedisClient(addr) // real Redis, Valkey-API-compatible (see backend plan)
	}

	engine := livetelemetry.NewEngine(livetelemetry.Config{}, rClient, bus)
	if err := engine.Start(ctx); err != nil {
		log.Error("engine start failed", "err", err)
	}

	// GetValues interlock read (§16.2), HTTP/JSON substitute for gRPC.
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/values", func(w http.ResponseWriter, r *http.Request) {
		scid, err := strconv.Atoi(r.URL.Query().Get("scid"))
		if err != nil {
			http.Error(w, `{"error":"invalid scid"}`, http.StatusBadRequest)
			return
		}
		params := strings.Split(r.URL.Query().Get("params"), ",")
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(engine.GetValues(uint16(scid), params))
	})
	server := &http.Server{Addr: envOr("PORT", ":9105"), Handler: mux}
	go func() {
		<-ctx.Done()
		_ = server.Close()
	}()
	go func() { _ = server.ListenAndServe() }()

	h := health.NewServer()
	go platform.ServeObservability(ctx, envOr("HEALTH_PORT", ":9115"), h)
	h.MarkStarted()

	log.Info("Live Telemetry started")
	<-ctx.Done()
}
