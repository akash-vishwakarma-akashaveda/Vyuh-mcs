package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/platform"
	"github.com/akashaveda/vyuh-mcs/internal/platform/health"
	"github.com/akashaveda/vyuh-mcs/internal/platform/logging"
	"github.com/akashaveda/vyuh-mcs/internal/realtimegateway"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	log := logging.New("realtime-gateway")
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var rClient redis.Client = redis.NewMemoryClient()
	if addr := os.Getenv("REDIS_ADDR"); addr != "" {
		rClient = redis.NewRedisClient(addr)
	}

	engine := realtimegateway.NewEngine(rClient, realtimegateway.Config{ListenAddr: envOr("WS_ADDR", ":8089")})
	if err := engine.Start(ctx); err != nil {
		log.Error("engine start failed", "err", err)
	}

	h := health.NewServer()
	go platform.ServeObservability(ctx, envOr("HEALTH_PORT", ":9116"), h)
	h.MarkStarted()

	log.Info("Realtime Gateway started", "ws_addr", envOr("WS_ADDR", ":8089"))
	<-ctx.Done()
}
