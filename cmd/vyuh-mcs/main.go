// vyuh-mcs runs the whole backend in one process for demos: a 12-satellite
// spacecraft simulator flying against the ground segment (Link Gateway, Frame
// Processor, TM Processor, Live Telemetry, Realtime Gateway, Mission Database,
// Alarm Manager, uplink chain, Command Gateway) behind the Operator BFF.
// Kafka and Redis are in-memory unless REDIS_ADDR is set.
package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/bff"
	"github.com/akashaveda/vyuh-mcs/internal/demo"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/platform"
	"github.com/akashaveda/vyuh-mcs/internal/platform/health"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/simulator"
	"github.com/prometheus/client_golang/prometheus"
)

func envOr(k, d string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return d
}

func serve(ctx context.Context, addr string, h http.Handler) {
	srv := &http.Server{Addr: addr, Handler: h}
	go func() { _ = srv.ListenAndServe() }()
	go func() { <-ctx.Done(); _ = srv.Close() }()
}

func main() {
	fmt.Println("================================================================")
	fmt.Println("  VYUH-MCS — Mission Control Software Backend")
	fmt.Println("  Akashaveda Space Technologies · architecture v2.2 (Phase 0-1 + uplink)")
	fmt.Println("================================================================")

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var rc redis.Client
	if addr := os.Getenv("REDIS_ADDR"); addr != "" {
		rc = redis.NewRedisClient(addr)
	}

	simCfg := simulator.DefaultConfig()
	if v := os.Getenv("SIM_TIME_SCALE"); v != "" {
		fmt.Sscanf(v, "%g", &simCfg.TimeScale) // accelerate fault dynamics for short demos
	}

	tcp, ws, mdb, cmd, bffAddr, simAddr := envOr("TCP_ADDR", "127.0.0.1:5050"), envOr("WS_ADDR", ":8088"),
		envOr("MDB_ADDR", ":9104"), envOr("CMD_ADDR", ":8080"), envOr("BFF_ADDR", ":8085"), envOr("SIM_ADDR", ":9120")

	st, err := demo.Start(ctx, demo.Options{
		TCPAddr: tcp, WSAddr: ws, MDBAddr: mdb, CmdAddr: cmd, Redis: rc, Sim: simCfg, RunSim: true,
		ReplayData: os.Getenv("OPSSAT_DATA"), // default data/opensat/segments.csv
	})
	if err != nil {
		fmt.Println("failed to start:", err)
		os.Exit(1)
	}

	// Health probes and Prometheus metrics (architecture §22.2), including the
	// per-stage pipeline counters.
	obsAddr := envOr("OBS_ADDR", ":9100")
	hs := health.NewServer()
	if rc != nil {
		hs.AddCheck("redis", func() error {
			return rc.Set(context.Background(), 0, "health:probe", time.Now().UnixNano(), time.Minute)
		})
	}
	prometheus.MustRegister(pipeline.Collector())
	hs.MarkStarted()
	go platform.ServeObservability(ctx, obsAddr, hs)

	serve(ctx, simAddr, st.Sim.Handler())
	serve(ctx, bffAddr, bff.NewService(bff.Config{
		Redis: st.Redis, Fleet: st.Fleet, Alarms: st.Alarms,
		CommandsURL: "http://127.0.0.1" + cmd, SimulatorURL: "http://127.0.0.1" + simAddr,
	}).Routes())

	fmt.Printf("  Realtime Gateway   ws://localhost%s/ws/telemetry\n", ws)
	fmt.Printf("  Operator BFF       http://localhost%s/api/v1\n", bffAddr)
	fmt.Printf("  Command Gateway    http://localhost%s/api/v1/commands\n", cmd)
	fmt.Printf("  Mission Database   http://localhost%s/v1/dictionaries\n", mdb)
	fmt.Printf("  Simulator control  http://localhost%s/v1/faults · /v1/replay · /v1/link · /v1/pipeline/stats\n", simAddr)
	fmt.Printf("  Link Gateway       %s (fixed-length CCSDS TM frames)\n", tcp)
	fmt.Printf("  Health & metrics   http://localhost%s/livez · /readyz · /metrics\n", obsAddr)
	fmt.Printf("  Satellites: %d (AKV-01..10, NBH-01..02 simulated; OPSSAT-1 replays ESA OPS-SAT flight data)\n", len(st.Fleet.All()))
	fmt.Println("  Console: http://localhost:3000 · Simulator lab: http://localhost:3000/simlab.html")
	fmt.Println("================================================================")

	<-ctx.Done()
	fmt.Println("VYUH-MCS cleanly shutdown.")
}
