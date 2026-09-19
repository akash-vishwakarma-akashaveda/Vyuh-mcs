package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/alarm"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	svc := alarm.NewAlarmManagerService(bus, rClient)
	fmt.Println("[Alarm Manager] Service started, consuming from alarm.events")

	if err := svc.Start(ctx); err != nil {
		fmt.Printf("Alarm Manager error: %v\n", err)
	}
}
