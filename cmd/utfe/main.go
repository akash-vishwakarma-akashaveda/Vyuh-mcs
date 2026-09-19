package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/utfe"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()
	driver := &utfe.MockAntennaDriver{}

	engine := utfe.NewUTFEEngine(42, rClient, bus, bus, driver)
	fmt.Println("[UTFE] Uplink Transfer Frame Engine started for SCID 42")

	if err := engine.Start(ctx); err != nil {
		fmt.Printf("UTFE error: %v\n", err)
	}
}
