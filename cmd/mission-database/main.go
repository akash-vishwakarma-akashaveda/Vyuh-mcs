package main

import (
	"context"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/missiondatabase"
	"github.com/akashaveda/vyuh-mcs/internal/platform"
	"github.com/akashaveda/vyuh-mcs/internal/platform/health"
	"github.com/akashaveda/vyuh-mcs/internal/platform/logging"
)

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	log := logging.New("mission-database")
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	store := missiondatabase.NewStore(envOr("MDB_DATA_DIR", "./data/mdb"))
	svc := missiondatabase.NewService(store, bus)

	addr := envOr("PORT", ":9104")
	server := &http.Server{Addr: addr, Handler: svc.Routes()}
	go func() {
		<-ctx.Done()
		_ = server.Close()
	}()

	h := health.NewServer()
	go platform.ServeObservability(ctx, envOr("HEALTH_PORT", ":9114"), h)
	h.MarkStarted()

	log.Info("Mission Database started", "addr", addr)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Error("server error", "err", err)
	}
}
