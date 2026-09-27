package anomaly

import (
	"math"
	"math/rand"
	"testing"
	"time"
)

// feed runs n samples of f(i) at 1 s spacing starting at t0 and returns the kinds detected.
func feed(e *Engine, param string, t0 time.Time, from, n int, f func(i int) float64, dt func(i int) time.Duration) map[string]int {
	got := map[string]int{}
	t := t0
	for i := from; i < from+n; i++ {
		t = t.Add(dt(i))
		for _, d := range e.Observe(1, param, f(i), t) {
			got[d.Kind]++
		}
	}
	return got
}

func second(int) time.Duration { return time.Second }

func TestDetectsASpikeInsideTheLimits(t *testing.T) {
	e := NewEngine(Config{}, nil, nil)
	rng := rand.New(rand.NewSource(1))
	base := func(i int) float64 { return 20 + math.Sin(float64(i)/10) + rng.NormFloat64()*0.05 }
	t0 := time.Unix(0, 0)
	if got := feed(e, "X", t0, 0, 200, base, second); len(got) != 0 {
		t.Fatalf("false detections on a clean signal: %v", got)
	}
	got := feed(e, "X", t0.Add(200*time.Second), 200, 1, func(int) float64 { return 25 }, second)
	if got["SPIKE"] != 1 {
		t.Fatalf("spike not detected: %v", got)
	}
}

func TestDetectsASensorThatGoesFlatAndOneThatTurnsNoisy(t *testing.T) {
	rng := rand.New(rand.NewSource(2))
	noisy := func(i int) float64 { return rng.NormFloat64() }
	t0 := time.Unix(0, 0)

	e := NewEngine(Config{}, nil, nil)
	feed(e, "F", t0, 0, 300, noisy, second)
	if got := feed(e, "F", t0.Add(300*time.Second), 300, 60, func(int) float64 { return 0.3 }, second); got["FLAT"] == 0 {
		t.Fatalf("stuck sensor not detected: %v", got)
	}

	e = NewEngine(Config{}, nil, nil)
	feed(e, "N", t0, 0, 300, func(i int) float64 { return 0.1 * rng.NormFloat64() }, second)
	if got := feed(e, "N", t0.Add(300*time.Second), 300, 60, func(int) float64 { return 3 * rng.NormFloat64() }, second); got["NOISE"] == 0 {
		t.Fatalf("noise burst not detected: %v", got)
	}
}

func TestDetectsMissingSamples(t *testing.T) {
	e := NewEngine(Config{}, nil, nil)
	t0 := time.Unix(0, 0)
	flatish := func(i int) float64 { return float64(i % 7) }
	feed(e, "G", t0, 0, 100, flatish, second)
	got := feed(e, "G", t0.Add(100*time.Second), 100, 3, flatish, func(i int) time.Duration {
		if i == 101 {
			return 30 * time.Second // 30 samples missing
		}
		return time.Second
	})
	if got["GAP"] != 1 {
		t.Fatalf("sampling gap not detected: %v", got)
	}
}
