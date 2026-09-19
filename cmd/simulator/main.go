package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/simulator"
)

func main() {
	cfg := simulator.DefaultConfig()
	if v := os.Getenv("INGEST_TCP"); v != "" {
		cfg.TargetTCP = v
	}
	sim := simulator.NewSimulator(cfg)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	addr := os.Getenv("SIM_ADDR")
	if addr == "" {
		addr = ":9120"
	}
	srv := &http.Server{Addr: addr, Handler: sim.Handler()}
	go func() { _ = srv.ListenAndServe() }()
	go func() { <-ctx.Done(); _ = srv.Close() }()
	fmt.Printf("[Simulator] fault-injection API on %s\n", addr)

	if err := sim.Start(ctx); err != nil && err != context.Canceled {
		fmt.Printf("[Simulator] Exited with: %v\n", err)
	}
}
