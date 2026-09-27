// Package verify is the end-to-end verification harness of the ground
// segment. It boots the real backend in-process, replays ESA OPS-SAT flight
// telemetry through the real downlink under controlled link faults, drives the
// uplink, and checks every stage against ground truth: what the spacecraft
// sent (the replay ledger) versus what each stage counted, what was decoded,
// and what reached a browser client. Models (limit alarms, anomaly detector)
// are scored against the ESA engineers' labels.
package verify

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"net/http/httptest"
	"os"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/demo"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/simulator"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/akashaveda/vyuh-mcs/internal/tmprocessor"
	"github.com/gorilla/websocket"
)

var debug = os.Getenv("VERIFY_DEBUG") != ""

// OPSSATSCID is the replay satellite's spacecraft id (config/satellites.json).
const OPSSATSCID = 13

type Status string

const (
	Pass Status = "PASS"
	Fail Status = "FAIL"
	Gap  Status = "GAP"  // a capability the system does not have yet
	Info Status = "INFO" // measured, no pass/fail criterion
)

type Check struct {
	Name     string `json:"name"`
	Stage    string `json:"stage"`
	Expected string `json:"expected"`
	Observed string `json:"observed"`
	Status   Status `json:"status"`
	Note     string `json:"note,omitempty"`
}

type Scenario struct {
	ID       string                             `json:"id"`
	Group    string                             `json:"group"`
	Title    string                             `json:"title"`
	Setup    string                             `json:"setup"`
	Seconds  float64                            `json:"seconds"`
	Emitted  int                                `json:"samples_emitted"`
	Fidelity *Fidelity                          `json:"fidelity,omitempty"`
	Checks   []Check                            `json:"checks"`
	Stats    map[string]map[string]int64        `json:"stats"`
	Latency  map[string]pipeline.LatencySummary `json:"latency"`
	Status   Status                             `json:"status"`
}

func (s *Scenario) add(c Check) { s.Checks = append(s.Checks, c) }

func (s *Scenario) finish() {
	s.Status = Pass
	for _, c := range s.Checks {
		switch {
		case c.Status == Fail:
			s.Status = Fail
			return
		case c.Status == Gap && s.Status == Pass:
			s.Status = Gap
		}
	}
}

// ---- check builders ----

func eq(stage, name string, want, got int64, note string) Check {
	st := Pass
	if want != got {
		st = Fail
	}
	return Check{Name: name, Stage: stage, Expected: fmt.Sprint(want), Observed: fmt.Sprint(got), Status: st, Note: note}
}

func within(stage, name string, want, got, tol int64, note string) Check {
	st := Pass
	if d := want - got; d > tol || d < -tol {
		st = Fail
	}
	return Check{Name: name, Stage: stage, Expected: fmt.Sprintf("%d (±%d)", want, tol), Observed: fmt.Sprint(got), Status: st, Note: note}
}

func atLeast(stage, name string, min, got int64, note string) Check {
	st := Pass
	if got < min {
		st = Fail
	}
	return Check{Name: name, Stage: stage, Expected: fmt.Sprintf(">= %d", min), Observed: fmt.Sprint(got), Status: st, Note: note}
}

func info(stage, name, observed, note string) Check {
	return Check{Name: name, Stage: stage, Expected: "—", Observed: observed, Status: Info, Note: note}
}

func gap(stage, name, expected, observed, note string) Check {
	return Check{Name: name, Stage: stage, Expected: expected, Observed: observed, Status: Gap, Note: note}
}

func boolCheck(stage, name string, ok bool, expected, observed, note string) Check {
	st := Pass
	if !ok {
		st = Fail
	}
	return Check{Name: name, Stage: stage, Expected: expected, Observed: observed, Status: st, Note: note}
}

// ---- environment ----

type decoded struct {
	APID  uint16
	Seq   uint16
	Name  string
	EU    float64
	OBT   time.Time
	Alarm telemetry.AlarmState
}

type env struct {
	st     *demo.Stack
	cancel context.CancelFunc
	wsURL  string

	mu      sync.Mutex
	samples []decoded
	alarms  []tmprocessor.AlarmEvent
}

func freeAddr() string {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return "127.0.0.1:5999"
	}
	defer l.Close()
	return l.Addr().String()
}

func boot(parent context.Context, dataPath string, runSim bool) (*env, error) {
	ctx, cancel := context.WithCancel(parent)
	pipeline.Reset()
	simCfg := simulator.DefaultConfig()
	simCfg.Cycle = 200 * time.Millisecond
	st, err := demo.Start(ctx, demo.Options{TCPAddr: freeAddr(), Sim: simCfg, RunSim: runSim, ReplayData: dataPath})
	if err != nil {
		cancel()
		return nil, err
	}
	e := &env{st: st, cancel: cancel}
	srv := httptest.NewServer(st.RTG.Handler(ctx))
	go func() { <-ctx.Done(); srv.Close() }()
	e.wsURL = "ws" + strings.TrimPrefix(srv.URL, "http") + "/ws/telemetry"

	_ = st.Bus.Subscribe(tmprocessor.TopicParamsRealtime, func(_ context.Context, m *kafka.Message) error {
		var pm telemetry.ProcessedTelemetryMessage
		if json.Unmarshal(m.Value, &pm) != nil || pm.SCID != OPSSATSCID {
			return nil
		}
		e.mu.Lock()
		for _, p := range pm.Params {
			e.samples = append(e.samples, decoded{APID: pm.APID, Seq: p.PacketSeq, Name: p.ParamName, EU: p.EUValue, OBT: p.Timestamp, Alarm: p.AlarmState})
		}
		e.mu.Unlock()
		return nil
	})
	_ = st.Bus.Subscribe(tmprocessor.TopicAlarmEvents, func(_ context.Context, m *kafka.Message) error {
		var ev tmprocessor.AlarmEvent
		if json.Unmarshal(m.Value, &ev) != nil || ev.SCID != OPSSATSCID {
			return nil
		}
		e.mu.Lock()
		e.alarms = append(e.alarms, ev)
		e.mu.Unlock()
		return nil
	})
	return e, nil
}

func (e *env) close() { e.cancel(); time.Sleep(100 * time.Millisecond) }

func (e *env) decodedSamples() []decoded {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]decoded(nil), e.samples...)
}

// replay plays count samples from pct at speed and waits until the ground
// segment has processed everything (counters stable past the reorder timeout).
func (e *env) replay(ctx context.Context, pct float64, count int, speed float64, during func(rp *simulator.Replay)) error {
	rp := e.st.Sim.Replay()
	if rp == nil {
		return fmt.Errorf("no replay satellite configured")
	}
	rp.ResetLedger()
	if err := rp.Control(ctx, simulator.ReplayControl{Action: "start", Speed: &speed, PositionPc: &pct, Count: &count}); err != nil {
		return err
	}
	if during != nil {
		go during(rp)
	}
	deadline := time.Now().Add(10 * time.Minute)
	for rp.Status().State != "done" {
		if time.Now().After(deadline) || ctx.Err() != nil {
			return fmt.Errorf("replay did not finish (state %s)", rp.Status().State)
		}
		time.Sleep(50 * time.Millisecond)
	}
	e.settle()
	return nil
}

// settle waits until no stage is still working.
func (e *env) settle() {
	last := int64(-1)
	stable := time.Now()
	for time.Since(stable) < 1500*time.Millisecond {
		n := pipeline.Get("frame.received") + pipeline.Get("tm.packets_in") + pipeline.Get("cvt.updates") + pipeline.Get("frame.processed")
		if n != last {
			last, stable = n, time.Now()
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// ---- ground-truth comparison ----

// Fidelity compares every decoded OPS-SAT sample with what the spacecraft sent.
type Fidelity struct {
	Emitted    int     `json:"emitted"`
	Delivered  int     `json:"delivered"`
	Lost       int     `json:"lost"`
	Corrupted  int     `json:"corrupted"`  // decoded value or time differs from what was sent
	Unmatched  int     `json:"unmatched"`  // decoded sample that was never sent
	Duplicates int     `json:"duplicates"` // the same sample delivered twice
	OutOfOrder int     `json:"out_of_order"`
	MaxError   float64 `json:"max_abs_error"`
	DeliveryPc float64 `json:"delivery_pct"`
}

// step is the quantisation of each channel's encoding (half of it is the
// largest honest decode error).
func step(unit string) float64 {
	if unit == "uT" {
		return 0.001
	}
	return 0.0001
}

func compare(ledger []simulator.LedgerEntry, got []decoded) *Fidelity {
	f := &Fidelity{Emitted: len(ledger)}
	type slot struct {
		e    simulator.LedgerEntry
		seen bool
	}
	byAPID := map[uint16][]*slot{}
	for _, l := range ledger {
		byAPID[l.APID] = append(byAPID[l.APID], &slot{e: l})
	}
	ptr := map[uint16]int{}
	for _, d := range got {
		list := byAPID[d.APID]
		i := ptr[d.APID]
		// Forward match (normal case, possibly after lost samples).
		j := -1
		for k := i; k < len(list) && k < i+20000; k++ {
			if list[k].e.Seq == d.Seq && absDur(list[k].e.OBT.Sub(d.OBT)) < time.Millisecond {
				j = k
				break
			}
		}
		if j < 0 {
			// Behind: a duplicate or an out-of-order delivery.
			for k := i - 1; k >= 0 && k > i-2000; k-- {
				if list[k].e.Seq == d.Seq && absDur(list[k].e.OBT.Sub(d.OBT)) < time.Millisecond {
					j = k
					break
				}
			}
			if j < 0 {
				f.Unmatched++
				if debug {
					fmt.Printf("UNMATCHED apid=%#x seq=%d eu=%g obt=%s\n", d.APID, d.Seq, d.EU, d.OBT.Format(time.RFC3339Nano))
				}
				continue
			}
			if list[j].seen {
				f.Duplicates++
			} else {
				f.OutOfOrder++
				list[j].seen = true
				f.Delivered++
			}
			continue
		}
		ptr[d.APID] = j + 1
		if list[j].seen {
			f.Duplicates++
			continue
		}
		list[j].seen = true
		f.Delivered++
		unit := "rad"
		if strings.HasPrefix(d.Name, "MAG") {
			unit = "uT"
		}
		errAbs := math.Abs(d.EU - list[j].e.EU)
		if errAbs > f.MaxError {
			f.MaxError = errAbs
		}
		if errAbs > step(unit)/2+1e-9 {
			f.Corrupted++
			if debug {
				fmt.Printf("CORRUPT apid=%#x seq=%d sent=%g got=%g obt=%s\n", d.APID, d.Seq, list[j].e.EU, d.EU, d.OBT.Format(time.RFC3339Nano))
				for k := max(0, j-2); k < min(len(list), j+3); k++ {
					fmt.Printf("   ledger[%d] seq=%d eu=%g obt=%s seg=%d emitted=%s\n", k, list[k].e.Seq, list[k].e.EU, list[k].e.OBT.Format(time.RFC3339Nano), list[k].e.Segment, list[k].e.EmittedAt.Format("15:04:05.000"))
				}
			}
		}
	}
	f.Lost = f.Emitted - f.Delivered
	if f.Emitted > 0 {
		f.DeliveryPc = 100 * float64(f.Delivered) / float64(f.Emitted)
	}
	return f
}

func absDur(d time.Duration) time.Duration {
	if d < 0 {
		return -d
	}
	return d
}

// integrityChecks are the checks every downlink scenario must pass: whatever
// the link does, nothing wrong, duplicated or reordered reaches the ground's users.
func integrityChecks(f *Fidelity) []Check {
	return []Check{
		eq("end-to-end", "No corrupted value delivered", 0, int64(f.Corrupted+f.Unmatched), fmt.Sprintf("largest decode error %.2g (quantisation step bound)", f.MaxError)),
		eq("end-to-end", "No sample delivered twice", 0, int64(f.Duplicates), ""),
		eq("end-to-end", "Samples delivered in order", 0, int64(f.OutOfOrder), ""),
	}
}

// ---- browser client ----

type wsClient struct {
	c  *websocket.Conn
	mu sync.Mutex
	in []map[string]any
}

func dialWS(url string) (*wsClient, error) {
	c, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		return nil, err
	}
	w := &wsClient{c: c}
	go func() {
		for {
			var m map[string]any
			if c.ReadJSON(&m) != nil {
				return
			}
			w.mu.Lock()
			w.in = append(w.in, m)
			w.mu.Unlock()
		}
	}()
	return w, nil
}

func (w *wsClient) send(v any) { _ = w.c.WriteJSON(v) }
func (w *wsClient) close()     { _ = w.c.Close() }

func (w *wsClient) frames(typ string) []map[string]any {
	w.mu.Lock()
	defer w.mu.Unlock()
	var out []map[string]any
	for _, m := range w.in {
		if m["type"] == typ {
			out = append(out, m)
		}
	}
	return out
}

// lastValues returns the most recent value per parameter across DELTA frames.
func lastValues(frames []map[string]any) map[string]float64 {
	out := map[string]float64{}
	for _, f := range frames {
		vals, _ := f["values"].([]any)
		for _, raw := range vals {
			if v, ok := raw.(map[string]any); ok {
				if id, ok := v["param_id"].(string); ok {
					out[id], _ = v["eu_value"].(float64)
				}
			}
		}
	}
	return out
}

func sortedKeys[M ~map[string]V, V any](m M) []string {
	k := make([]string, 0, len(m))
	for x := range m {
		k = append(k, x)
	}
	sort.Strings(k)
	return k
}
