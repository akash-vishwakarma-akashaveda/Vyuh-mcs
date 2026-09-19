package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/config"
	"github.com/akashaveda/vyuh-mcs/internal/frameprocessor"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
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
	log := logging.New("frame-processor")
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()
	for _, sat := range config.DefaultFleet().All() {
		_ = rClient.HSet(ctx, 1, "scid:whitelist", fmt.Sprintf("%d", sat.SCID), "1")
	}

	engine := frameprocessor.NewEngine(frameprocessor.Config{ConsumerGroup: "frame-processor-cg"}, rClient, bus, bus)

	h := health.NewServer()
	go platform.ServeObservability(ctx, envOr("HEALTH_PORT", ":9102"), h)
	h.MarkStarted()

	log.Info("Frame Processor started")
	if err := engine.Start(ctx); err != nil {
		log.Error("engine stopped with error", "err", err)
	}
	<-ctx.Done()
}
