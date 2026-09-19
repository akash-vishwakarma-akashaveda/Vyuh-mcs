package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"

	"github.com/akashaveda/vyuh-mcs/internal/bff"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

// Standalone BFF: reads the CVT from Redis and proxies commanding and the
// simulator. Alarm endpoints answer 503 until an Alarm Manager is reachable
// (in the all-in-one demo binary it is wired in-process).
func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var rc redis.Client = redis.NewMemoryClient()
	if addr := os.Getenv("REDIS_ADDR"); addr != "" {
		rc = redis.NewRedisClient(addr)
	}
	svc := bff.NewService(bff.Config{
		Redis:        rc,
		CommandsURL:  envOr("COMMANDS_URL", "http://127.0.0.1:8080"),
		SimulatorURL: envOr("SIMULATOR_URL", "http://127.0.0.1:9120"),
	})

	port := envOr("PORT", "8085")
	server := &http.Server{Addr: ":" + port, Handler: svc.Routes()}
	go func() {
		<-ctx.Done()
		_ = server.Close()
	}()

	fmt.Printf("[BFF] Backend for Frontend API running on :%s\n", port)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fmt.Printf("BFF error: %v\n", err)
	}
}
