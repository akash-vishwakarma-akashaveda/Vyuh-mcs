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

	"github.com/akashaveda/vyuh-mcs/internal/bff"
	"github.com/akashaveda/vyuh-mcs/internal/demo"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/simulator"
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
	})
	if err != nil {
		fmt.Println("failed to start:", err)
		os.Exit(1)
	}

	serve(ctx, simAddr, st.Sim.Handler())
	serve(ctx, bffAddr, bff.NewService(bff.Config{
		Redis: st.Redis, Fleet: st.Fleet, Alarms: st.Alarms,
		CommandsURL: "http://127.0.0.1" + cmd, SimulatorURL: "http://127.0.0.1" + simAddr,
	}).Routes())

	fmt.Printf("  Realtime Gateway   ws://localhost%s/ws/telemetry\n", ws)
	fmt.Printf("  Operator BFF       http://localhost%s/api/v1\n", bffAddr)
	fmt.Printf("  Command Gateway    http://localhost%s/api/v1/commands\n", cmd)
	fmt.Printf("  Mission Database   http://localhost%s/v1/dictionaries\n", mdb)
	fmt.Printf("  Simulator control  http://localhost%s/v1/faults\n", simAddr)
	fmt.Printf("  Link Gateway       %s (fixed-length CCSDS TM frames)\n", tcp)
	fmt.Printf("  Satellites: %d simulated (AKV-01..10, NBH-01..02) · console: http://localhost:3000\n", len(st.Fleet.All()))
	fmt.Println("================================================================")

	<-ctx.Done()
	fmt.Println("VYUH-MCS cleanly shutdown.")
}
