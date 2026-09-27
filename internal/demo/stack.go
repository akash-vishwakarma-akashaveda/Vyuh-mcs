// Package demo wires the backend into one process for local demos and
// end-to-end tests: simulator -> Link Gateway -> Frame Processor -> TM
// Processor -> Live Telemetry -> Realtime Gateway, with Mission Database
// supplying the dictionary and Alarm Manager turning limit violations into
// alarms. Every module is the same code that runs as its own service; only the
// Kafka/Redis substrates are in-memory (see the backend plan's flagged
// substitutions).
package demo

import (
	"context"
	"fmt"
	"net/http"
	"time"

	"github.com/akashaveda/vyuh-mcs/config"
	"github.com/akashaveda/vyuh-mcs/internal/alarm"
	"github.com/akashaveda/vyuh-mcs/internal/anomaly"
	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/cmdgw"
	"github.com/akashaveda/vyuh-mcs/internal/dlm"
	"github.com/akashaveda/vyuh-mcs/internal/frameprocessor"
	"github.com/akashaveda/vyuh-mcs/internal/gapreplay"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/linkgateway"
	"github.com/akashaveda/vyuh-mcs/internal/livetelemetry"
	"github.com/akashaveda/vyuh-mcs/internal/missiondatabase"
	"github.com/akashaveda/vyuh-mcs/internal/realtimegateway"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/simulator"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/akashaveda/vyuh-mcs/internal/tmprocessor"
	"github.com/akashaveda/vyuh-mcs/internal/upe"
	"github.com/akashaveda/vyuh-mcs/internal/utfe"
	"github.com/akashaveda/vyuh-mcs/internal/verification"
)

type Options struct {
	TCPAddr     string // Link Gateway antenna listener, e.g. "127.0.0.1:5050"
	MDBAddr     string // Mission Database REST; "" = not served
	MDBDataDir  string // "" = in memory only
	WSAddr      string // Realtime Gateway WebSocket; "" = not listening (use Stack.RTG.Handler)
	CmdAddr     string // Command Gateway REST; "" = not served (use Stack.CmdGW.Routes)
	Redis       redis.Client
	Sim         simulator.Config // TargetTCP is set from TCPAddr
	RunSim      bool
	FrameLength int    // fixed TM frame length on the antenna link, 0 = simulator default
	ReplayData  string // OPS-SAT-AD segments.csv for the replay satellite, "" = data/opensat/segments.csv
}

type Stack struct {
	Bus    *kafka.MemoryBus
	Redis  redis.Client
	Fleet  *config.Fleet
	MDB    *missiondatabase.Store
	Sim    *simulator.Simulator
	Alarms *alarm.AlarmManagerService
	LTM    *livetelemetry.Engine
	RTG    *realtimegateway.Engine
	TMP    *tmprocessor.Engine
	FP     *frameprocessor.Engine
	LGW    *linkgateway.Gateway
	CmdGW  *cmdgw.CommandGatewayService
	AI     *anomaly.Engine
	DLM    *dlm.DeadLetterMonitor
}

// Start boots the stack; it returns once every module is subscribed and
// listening. Everything stops when ctx is done.
func Start(ctx context.Context, o Options) (*Stack, error) {
	fleet := config.DefaultFleet()
	bus := kafka.NewMemoryBus()
	var rc redis.Client = o.Redis
	if rc == nil {
		rc = redis.NewMemoryClient()
	}
	s := &Stack{Bus: bus, Redis: rc, Fleet: fleet}
	if o.ReplayData == "" {
		o.ReplayData = "data/opensat/segments.csv"
	}

	// Mission Database: import + release the platform dictionary for every satellite.
	s.MDB = missiondatabase.NewStore(o.MDBDataDir)
	for _, sat := range fleet.All() {
		dict, err := config.DictionaryFor(sat)
		if err != nil {
			return nil, err
		}
		b, err := s.MDB.Import(sat.SCID, dict)
		if err != nil {
			return nil, fmt.Errorf("import dictionary for %s: %w", sat.SatID, err)
		}
		if _, err := s.MDB.Release(sat.SCID, b.Version, 0); err != nil {
			return nil, err
		}
		_ = rc.HSet(ctx, 1, "scid:whitelist", fmt.Sprintf("%d", sat.SCID), "1")
	}
	if o.MDBAddr != "" {
		srv := &http.Server{Addr: o.MDBAddr, Handler: missiondatabase.NewService(s.MDB, bus).Routes()}
		go func() { _ = srv.ListenAndServe() }()
		go func() { <-ctx.Done(); _ = srv.Close() }()
	}

	// Telemetry path, consumers before the source.
	s.LTM = livetelemetry.NewEngine(livetelemetry.Config{Fleet: fleet}, rc, bus)
	if err := s.LTM.Start(ctx); err != nil {
		return nil, err
	}

	s.TMP = tmprocessor.NewEngine(tmprocessor.Config{ServiceAPIDs: map[uint16]bool{ccsds.VerificationAPID: true}}, rc, bus, bus)
	for _, sat := range fleet.All() {
		if active := s.MDB.Active(sat.SCID, time.Now().UnixNano()); active != nil {
			s.TMP.RegisterDictionary(active.ParameterSets)
		}
	}
	if err := s.TMP.Start(ctx); err != nil {
		return nil, err
	}

	s.FP = frameprocessor.NewEngine(frameprocessor.Config{}, rc, bus, bus)
	if err := s.FP.Start(ctx); err != nil {
		return nil, err
	}

	s.Alarms = alarm.NewAlarmManagerService(bus, rc)
	if err := s.Alarms.Start(ctx); err != nil {
		return nil, err
	}
	if err := gapreplay.NewGapReplayService(bus, bus, rc, func(scid uint16, vcid, fc uint8, after, before time.Time) ([]byte, bool) {
		if s.LGW == nil {
			return nil, false
		}
		return s.LGW.Archive().Lookup(scid, vcid, fc, after, before)
	}).Start(ctx); err != nil {
		return nil, err
	}
	s.DLM = dlm.NewDeadLetterMonitor(bus)
	if err := s.DLM.Start(ctx); err != nil {
		return nil, err
	}
	// Anomaly model on the replayed flight data (the simulated satellites'
	// synthetic signals would only teach it what a sine wave looks like).
	aiSCIDs := map[uint16]bool{}
	for _, sat := range fleet.All() {
		if sat.Source == "replay" {
			aiSCIDs[sat.SCID] = true
		}
	}
	s.AI = anomaly.NewEngine(anomaly.Config{SCIDs: aiSCIDs}, bus, bus)
	if err := s.AI.Start(ctx); err != nil {
		return nil, err
	}

	s.RTG = realtimegateway.NewEngine(rc, realtimegateway.Config{Fleet: fleet, ListenAddr: o.WSAddr})
	if o.WSAddr != "" {
		if err := s.RTG.Start(ctx); err != nil {
			return nil, err
		}
	}

	// Ground link.
	frameLen := o.FrameLength
	if frameLen == 0 {
		frameLen = simulator.DefaultConfig().FrameLength
	}
	s.LGW = linkgateway.NewGateway(linkgateway.Config{PodID: "demo", AntennaID: "ANT-BLR-01"}, bus)
	s.LGW.AddAdapter(&linkgateway.TCPAdapter{Addr: o.TCPAddr, FrameLength: frameLen}, nil)
	go func() { _ = s.LGW.Start(ctx) }()

	// Uplink: one UPE (safety chain + encryption) and one UTFE (COP-1) per
	// satellite, ending at the spacecraft's command receiver.
	upes := map[uint16]*upe.UPEEngine{}
	for _, sat := range fleet.All() {
		e := upe.NewUPEEngine(sat.SCID, rc, bus, bus)
		registerCommandDefinitions(e, sat.SCID)
		if err := e.Start(ctx); err != nil {
			return nil, err
		}
		upes[sat.SCID] = e
	}

	// The spacecraft.
	o.Sim.TargetTCP = o.TCPAddr
	if o.Sim.FrameLength == 0 {
		o.Sim.FrameLength = frameLen
	}
	o.Sim.UplinkKey = func(scid uint16) []byte {
		if e, ok := upes[scid]; ok {
			return e.Key(scid)
		}
		return nil
	}
	s.Sim = simulator.NewSimulator(o.Sim)
	s.Sim.SetContext(ctx)
	for _, sat := range fleet.All() {
		if sat.Source != "replay" {
			continue
		}
		dict, err := config.DictionaryFor(sat)
		if err != nil {
			return nil, err
		}
		s.Sim.SetReplay(simulator.NewReplay(simulator.ReplayConfig{
			DataPath: o.ReplayData, SCID: sat.SCID, VCID: 0, FrameLength: frameLen, Dictionary: dict, TargetTCP: o.TCPAddr,
		}, s.Sim.Link()))
	}

	for _, sat := range fleet.All() {
		if err := utfe.NewUTFEEngine(sat.SCID, rc, bus, bus, s.Sim.Uplink()).Start(ctx); err != nil {
			return nil, err
		}
	}

	// PUS-1: the spacecraft's own acceptance and completion reports.
	if err := verification.NewEngine(bus, bus).Start(ctx); err != nil {
		return nil, err
	}

	// Command Gateway: REST ingress, and live status fan-out to every console.
	s.CmdGW = cmdgw.NewCommandGatewayService(bus, bus)
	s.CmdGW.SetValidator(func(scid, apid uint16) error {
		if _, ok := fleet.BySCID(scid); !ok {
			return fmt.Errorf("spacecraft %d is not in this ground segment's fleet", scid)
		}
		return nil
	})
	s.CmdGW.SetStatusHook(func(rec cmdgw.CommandLogRecord) {
		satID := ""
		if sat, ok := fleet.BySCID(rec.SCID); ok {
			satID = sat.SatID
		}
		_ = rc.Publish(context.Background(), telemetry.StatusChannel(rec.SCID), map[string]any{
			"kind": "COMMAND", "command_id": rec.CommandID, "sat_id": satID, "scid": rec.SCID, "apid": rec.APID,
			"status": rec.Status, "operator_id": rec.OperatorID, "params": rec.Params,
			"reason": rec.RejectionReason, "submitted_utc": rec.SubmittedAt.Format(time.RFC3339Nano),
			"updated_utc": time.Now().UTC().Format(time.RFC3339Nano),
		})
	})
	if o.CmdAddr != "" {
		srv := &http.Server{Addr: o.CmdAddr, Handler: s.CmdGW.Routes()}
		go func() { _ = srv.ListenAndServe() }()
		go func() { <-ctx.Done(); _ = srv.Close() }()
	}

	s.Sim.SetEvents(func() any {
		return map[string]any{"detections": s.AI.Recent(40), "dead_letters": s.DLM.Recent(40)}
	})
	if o.RunSim {
		go func() { _ = s.Sim.Start(ctx) }()
	}
	return s, nil
}

// registerCommandDefinitions installs the L1 range limits of the command
// catalogue (src/data/mission.ts COMMANDS) that have numeric arguments.
func registerCommandDefinitions(e *upe.UPEEngine, scid uint16) {
	f := func(v float64) *float64 { return &v }
	e.RegisterCommandDef(&upe.CommandDefinition{SCID: scid, APID: 0x021, Name: "HTR_SWITCH / SET_HTR_SETPOINT",
		ParamLimits: map[string]upe.ParamDefinition{"SETPOINT": {Min: f(5), Max: f(25)}}})
	e.RegisterCommandDef(&upe.CommandDefinition{SCID: scid, APID: 0x011, Name: "HK_RATE_SET",
		ParamLimits: map[string]upe.ParamDefinition{"RATE_HZ": {Min: f(0.1), Max: f(10)}}})
	e.RegisterCommandDef(&upe.CommandDefinition{SCID: scid, APID: 0x052, Name: "TX_POWER_SET",
		ParamLimits: map[string]upe.ParamDefinition{"POWER_W": {Min: f(2), Max: f(6)}}})
}
