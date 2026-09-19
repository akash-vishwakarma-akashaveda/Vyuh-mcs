package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/cmdgw"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()
	gw := cmdgw.NewCommandGatewayService(bus, bus)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	server := &http.Server{
		Addr:    ":" + port,
		Handler: gw.Routes(),
	}

	go func() {
		<-ctx.Done()
		_ = server.Close()
	}()

	fmt.Printf("[Command Gateway] Telecommand Ingress API running on :%s\n", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Printf("Gateway error: %v\n", err)
	}
}
