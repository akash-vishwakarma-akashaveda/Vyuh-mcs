package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/upe"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	engine := upe.NewUPEEngine(42, rClient, bus, bus)
	fmt.Println("[UPE] Uplink Processing Engine started for SCID 42")

	if err := engine.Start(ctx); err != nil {
		fmt.Printf("UPE error: %v\n", err)
	}
}
