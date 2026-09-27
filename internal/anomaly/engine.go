// Package anomaly is the streaming anomaly model of the telemetry chain: it
// watches decoded parameters (tm.params.realtime.v1) and flags behaviour a
// limit check cannot see — spikes inside the limits, a sensor that turns noisy
// or goes flat, samples that stop arriving on time. It is unsupervised: no
// labels are used, only each parameter's own recent history, so it works on a
// channel it has never seen. Detections go to ai.anomalies.v1 and are kept so a
// verification run can score them against labelled data (OPS-SAT-AD).
package anomaly

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
)

const (
	TopicParams    = "tm.params.realtime.v1"
	TopicAnomalies = "ai.anomalies.v1"
)

// Config tunes the detectors. Zero values take the defaults.
type Config struct {
	Window     int             // samples in the rolling window (default 30)
	SpikeZ     float64         // robust z-score of a spike (default 6)
	NoiseRatio float64         // rolling spread / usual spread for "noisy" (default 4)
	FlatRatio  float64         // rolling spread / usual spread for "flat" (default 0.05)
	GapRatio   float64         // sample interval / usual interval for "gap" (default 4)
	SCIDs      map[uint16]bool // satellites to watch; nil = all
	Cooldown   int             // samples between two detections of the same kind (default 10)
}

type Detection struct {
	SCID  uint16    `json:"scid"`
	Param string    `json:"param"`
	Kind  string    `json:"kind"` // SPIKE | NOISE | FLAT | GAP
	Score float64   `json:"score"`
	Value float64   `json:"value"`
	OBT   time.Time `json:"obt"`
	At    time.Time `json:"detected_at"`
}

type series struct {
	vals     []float64
	lastOBT  time.Time
	dtEWMA   float64 // usual sample interval (s)
	sdEWMA   float64 // usual rolling spread
	n        int
	cooldown map[string]int
}

type Engine struct {
	cfg  Config
	bus  kafka.Producer
	cons kafka.Consumer

	mu     sync.Mutex
	series map[string]*series
	log    []Detection
}

func NewEngine(cfg Config, bus kafka.Producer, cons kafka.Consumer) *Engine {
	if cfg.Window == 0 {
		cfg.Window = 30
	}
	if cfg.SpikeZ == 0 {
		cfg.SpikeZ = 6
	}
	if cfg.NoiseRatio == 0 {
		cfg.NoiseRatio = 4
	}
	if cfg.FlatRatio == 0 {
		cfg.FlatRatio = 0.05
	}
	if cfg.GapRatio == 0 {
		cfg.GapRatio = 4
	}
	if cfg.Cooldown == 0 {
		cfg.Cooldown = 10
	}
	return &Engine{cfg: cfg, bus: bus, cons: cons, series: map[string]*series{}}
}

func (e *Engine) Start(ctx context.Context) error {
	return e.cons.Subscribe(TopicParams, func(ctx context.Context, m *kafka.Message) error {
		var pm telemetry.ProcessedTelemetryMessage
		if json.Unmarshal(m.Value, &pm) != nil {
			return nil
		}
		if e.cfg.SCIDs != nil && !e.cfg.SCIDs[pm.SCID] {
			return nil
		}
		for _, p := range pm.Params {
			if p.IsReplay {
				continue
			}
			for _, d := range e.Observe(p.SCID, p.ParamName, p.EUValue, p.Timestamp) {
				_ = kafka.ProduceJSON(ctx, e.bus, TopicAnomalies, []byte(fmt.Sprintf("%d", d.SCID)), d, nil)
			}
		}
		return nil
	})
}

// Observe feeds one sample and returns any detections it triggers.
func (e *Engine) Observe(scid uint16, param string, v float64, obt time.Time) []Detection {
	e.mu.Lock()
	defer e.mu.Unlock()
	pipeline.Inc("anomaly.samples", 1)
	key := fmt.Sprintf("%d:%s", scid, param)
	s := e.series[key]
	if s == nil {
		s = &series{cooldown: map[string]int{}}
		e.series[key] = s
	}
	for k := range s.cooldown {
		if s.cooldown[k] > 0 {
			s.cooldown[k]--
		}
	}

	var out []Detection
	fire := func(kind string, score float64) {
		if s.cooldown[kind] > 0 {
			return
		}
		s.cooldown[kind] = e.cfg.Cooldown
		d := Detection{SCID: scid, Param: param, Kind: kind, Score: score, Value: v, OBT: obt, At: time.Now()}
		out = append(out, d)
		e.log = append(e.log, d)
		pipeline.Inc("anomaly.detections", 1)
		pipeline.Inc("anomaly."+kind, 1)
	}

	// Sampling irregularity: an interval far longer than this parameter's usual one.
	if !s.lastOBT.IsZero() {
		dt := obt.Sub(s.lastOBT).Seconds()
		if dt > 0 {
			if s.n > e.cfg.Window && s.dtEWMA > 0 && dt > e.cfg.GapRatio*s.dtEWMA {
				fire("GAP", dt/s.dtEWMA)
			}
			if s.dtEWMA == 0 {
				s.dtEWMA = dt
			} else if dt < e.cfg.GapRatio*s.dtEWMA { // a gap does not teach the usual interval
				s.dtEWMA = 0.95*s.dtEWMA + 0.05*dt
			}
		}
	}
	s.lastOBT = obt

	if len(s.vals) >= e.cfg.Window {
		med, mad := medianMAD(s.vals)
		sigma := 1.4826 * mad
		if sigma > 0 {
			if z := math.Abs(v-med) / sigma; z > e.cfg.SpikeZ {
				fire("SPIKE", z)
			}
		}
		sd := stddev(s.vals)
		if s.sdEWMA > 0 && s.n > 3*e.cfg.Window {
			switch r := sd / s.sdEWMA; {
			case r > e.cfg.NoiseRatio:
				fire("NOISE", r)
			case r < e.cfg.FlatRatio:
				fire("FLAT", r)
			}
		}
		if s.sdEWMA == 0 {
			s.sdEWMA = sd
		} else {
			s.sdEWMA = 0.99*s.sdEWMA + 0.01*sd
		}
		s.vals = s.vals[1:]
	}
	s.vals = append(s.vals, v)
	s.n++
	return out
}

// Detections returns every detection since the last Reset.
func (e *Engine) Detections() []Detection {
	e.mu.Lock()
	defer e.mu.Unlock()
	return append([]Detection(nil), e.log...)
}

// Recent returns up to n of the latest detections, newest first.
func (e *Engine) Recent(n int) []Detection {
	e.mu.Lock()
	defer e.mu.Unlock()
	out := make([]Detection, 0, n)
	for i := len(e.log) - 1; i >= 0 && len(out) < n; i-- {
		out = append(out, e.log[i])
	}
	return out
}

// Reset forgets history and detections (start of a verification run).
func (e *Engine) Reset() {
	e.mu.Lock()
	e.series, e.log = map[string]*series{}, nil
	e.mu.Unlock()
}

func medianMAD(v []float64) (float64, float64) {
	s := append([]float64(nil), v...)
	sort.Float64s(s)
	med := s[len(s)/2]
	for i := range s {
		s[i] = math.Abs(s[i] - med)
	}
	sort.Float64s(s)
	return med, s[len(s)/2]
}

func stddev(v []float64) float64 {
	var m float64
	for _, x := range v {
		m += x
	}
	m /= float64(len(v))
	var ss float64
	for _, x := range v {
		ss += (x - m) * (x - m)
	}
	return math.Sqrt(ss / float64(len(v)))
}
