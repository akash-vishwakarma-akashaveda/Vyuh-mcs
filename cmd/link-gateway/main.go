package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/linkgateway"
	"github.com/akashaveda/vyuh-mcs/internal/linkgateway/sle"
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
	log := logging.New("link-gateway")
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	bus := kafka.NewMemoryBus()

	gw := linkgateway.NewGateway(linkgateway.Config{
		PodID:     envOr("POD_NAME", "link-gateway-1"),
		AntennaID: envOr("ANTENNA_ID", "ANT-BLR-01"),
		PassID:    envOr("PASS_ID", "PASS-DEFAULT"),
	}, bus)

	// Always-on adapters (FR-LGW-01): raw socket delivery.
	frameLen := 256 // fixed TM frame length on the antenna link (simulator default)
	if v := os.Getenv("FRAME_LENGTH"); v != "" {
		fmt.Sscanf(v, "%d", &frameLen)
	}
	gw.AddAdapter(&linkgateway.TCPAdapter{Addr: envOr("TCP_PORT", ":5050"), FrameLength: frameLen}, nil)
	gw.AddAdapter(&linkgateway.UDPAdapter{Addr: envOr("UDP_PORT", ":5051")}, nil)

	// Optional adapters, enabled by presence of their config (FR-LGW-05: a
	// new provider adapter needs no change elsewhere).
	if path := os.Getenv("FILE_ADAPTER_PATH"); path != "" {
		gw.AddAdapter(&linkgateway.FileAdapter{
			Path:   path,
			Follow: os.Getenv("FILE_ADAPTER_FOLLOW") == "true",
		}, nil)
	}
	if broker := os.Getenv("MQTT_BROKER_URL"); broker != "" {
		gw.AddAdapter(&linkgateway.MQTTAdapter{
			BrokerURL: broker,
			Topic:     envOr("MQTT_TOPIC", "vyuh/frames"),
			ClientID:  envOr("POD_NAME", "link-gateway"),
		}, nil)
	}
	if provider := os.Getenv("SLE_PROVIDER_ADDR"); provider != "" {
		gw.AddAdapter(&sle.Adapter{
			ProviderAddr: provider,
			InitiatorID:  envOr("POD_NAME", "link-gateway"),
			Service:      sle.ServiceRAF,
			DialTimeout:  5 * time.Second,
		}, nil)
	}
	if manifest := os.Getenv("AWSGS_MANIFEST_URL"); manifest != "" {
		gw.AddAdapter(&linkgateway.AWSGSAdapter{ManifestURL: manifest}, nil)
	}

	h := health.NewServer()
	h.AddCheck("kafka", func() error { return nil }) // memory bus is always available
	go platform.ServeObservability(ctx, envOr("HEALTH_PORT", ":9101"), h)
	h.MarkStarted()

	log.Info("Link Gateway started", "antenna", envOr("ANTENNA_ID", "ANT-BLR-01"))
	if err := gw.Start(ctx); err != nil {
		log.Error("gateway stopped with error", "err", err)
	}
}
