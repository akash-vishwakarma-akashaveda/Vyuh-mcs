package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/platform"
	"github.com/akashaveda/vyuh-mcs/internal/platform/health"
	"github.com/akashaveda/vyuh-mcs/internal/platform/logging"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/tmprocessor"
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	log := logging.New("tm-processor")
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	engine := tmprocessor.NewEngine(tmprocessor.Config{
		ConsumerGroup: "tm-processor-cg",
		MDBBaseURL:    os.Getenv("MDB_BASE_URL"), // e.g. http://localhost:9104
	}, rClient, bus, bus)

	h := health.NewServer()
	go platform.ServeObservability(ctx, envOr("HEALTH_PORT", ":9103"), h)
	h.MarkStarted()

	log.Info("TM Processor started")
	if err := engine.Start(ctx); err != nil {
		log.Error("engine stopped with error", "err", err)
	}
	<-ctx.Done()
}
