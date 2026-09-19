package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/dlm"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	monitor := dlm.NewDeadLetterMonitor(bus)
	fmt.Println("[Dead Letter Monitor] Started, monitoring dead.letter")

	if err := monitor.Start(ctx); err != nil {
		fmt.Printf("DLM error: %v\n", err)
	}
}
