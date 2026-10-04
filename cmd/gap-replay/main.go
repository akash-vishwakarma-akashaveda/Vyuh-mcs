package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/gapreplay"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	svc := gapreplay.NewGapReplayService(bus, bus, rClient, nil) // no station recording in this standalone process
	fmt.Println("[Gap Replay] Service started, monitoring telemetry.gaps")

	if err := svc.Start(ctx); err != nil {
		fmt.Printf("Gap replay error: %v\n", err)
		os.Exit(1)
	}
	// Start only subscribes; the service runs until interrupted.
	<-ctx.Done()
}
