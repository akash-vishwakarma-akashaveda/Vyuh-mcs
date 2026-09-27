// Package pipeline holds the counters every stage of the telemetry and command
// chain reports into. One process-wide registry, so the simulator UI and the
// verification harness can see, for one frame stream, how many units each stage
// received, passed on and rejected — and why.
package pipeline

import (
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var (
	mu       sync.RWMutex
	counters = map[string]*atomic.Int64{}
	started  = time.Now()

	latMu sync.Mutex
	lat   = map[string]*latency{}
)

func counter(name string) *atomic.Int64 {
	mu.RLock()
	c := counters[name]
	mu.RUnlock()
	if c != nil {
		return c
	}
	mu.Lock()
	defer mu.Unlock()
	if c = counters[name]; c == nil {
		c = &atomic.Int64{}
		counters[name] = c
	}
	return c
}

// Inc adds n to a counter named "stage.what", e.g. "frame.crc_error".
func Inc(name string, n int64) { counter(name).Add(n) }

// Get returns the current value of a counter.
func Get(name string) int64 { return counter(name).Load() }

// latency keeps a bounded reservoir of recent samples per path.
type latency struct {
	samples []float64
	next    int
	count   int64
}

const reservoir = 4096

// ObserveLatency records one end-to-end latency sample in milliseconds for a path
// such as "frame_to_ws".
func ObserveLatency(path string, ms float64) {
	latMu.Lock()
	defer latMu.Unlock()
	l := lat[path]
	if l == nil {
		l = &latency{samples: make([]float64, 0, reservoir)}
		lat[path] = l
	}
	if len(l.samples) < reservoir {
		l.samples = append(l.samples, ms)
	} else {
		l.samples[l.next] = ms
		l.next = (l.next + 1) % reservoir
	}
	l.count++
}

// LatencySummary is p50/p95/p99/max over the recent reservoir.
type LatencySummary struct {
	Count int64   `json:"count"`
	P50   float64 `json:"p50_ms"`
	P95   float64 `json:"p95_ms"`
	P99   float64 `json:"p99_ms"`
	Max   float64 `json:"max_ms"`
}

// Snapshot is the whole registry at one instant, grouped by stage prefix.
type Snapshot struct {
	UptimeS  float64                              `json:"uptime_s"`
	Stages   map[string]map[string]int64          `json:"stages"`
	Latency  map[string]LatencySummary            `json:"latency"`
}

func Take() Snapshot {
	s := Snapshot{UptimeS: time.Since(started).Seconds(), Stages: map[string]map[string]int64{}, Latency: map[string]LatencySummary{}}
	mu.RLock()
	for name, c := range counters {
		stage, what, ok := strings.Cut(name, ".")
		if !ok {
			stage, what = "misc", name
		}
		if s.Stages[stage] == nil {
			s.Stages[stage] = map[string]int64{}
		}
		s.Stages[stage][what] = c.Load()
	}
	mu.RUnlock()

	latMu.Lock()
	for path, l := range lat {
		v := append([]float64(nil), l.samples...)
		sort.Float64s(v)
		pick := func(q float64) float64 {
			if len(v) == 0 {
				return 0
			}
			return v[min(len(v)-1, int(q*float64(len(v))))]
		}
		s.Latency[path] = LatencySummary{Count: l.count, P50: pick(0.5), P95: pick(0.95), P99: pick(0.99), Max: pick(1)}
	}
	latMu.Unlock()
	return s
}

// Reset zeroes every counter and latency reservoir (start of a verification run).
func Reset() {
	mu.Lock()
	for _, c := range counters {
		c.Store(0)
	}
	started = time.Now()
	mu.Unlock()
	latMu.Lock()
	lat = map[string]*latency{}
	latMu.Unlock()
}
