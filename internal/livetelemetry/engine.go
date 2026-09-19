// Package livetelemetry implements Live Telemetry (architecture v2.2 §16.2):
// the CVT authority. It owns the Current Value Table in memory, mirrors it to
// Redis (the Valkey-compatible substitute — see the backend plan's flagged
// substitutions) for other pods to read, and publishes coalesced deltas on a
// per-satellite pub/sub channel that Realtime Gateway fans out to browsers.
package livetelemetry

import (
	"context"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"

	"github.com/akashaveda/vyuh-mcs/config"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
)

const (
	TopicParamsRealtime = "tm.params.realtime.v1"
	// DefaultTenant scopes satellites the fleet config doesn't know about.
	DefaultTenant = "default"
)

// CVTEntry is one parameter's packed value with its receive time, kept in
// memory so freshness can be computed at read time.
type CVTEntry struct {
	Value      telemetry.LiveValue `json:"value"`
	OBT        time.Time           `json:"obt"`
	ReceivedAt time.Time           `json:"received_at"`
}

// ValueReading is what GetValues returns per parameter — freshness is
// explicit so callers (interlocks) decide fail-open/fail-closed themselves
// per §16.2's fail-safe rule.
type ValueReading struct {
	Param   string              `json:"param"`
	Value   telemetry.LiveValue `json:"value"`
	AgeMs   int64               `json:"age_ms"`
	Stale   bool                `json:"stale"`
	Present bool                `json:"present"`
}

type Config struct {
	StaleAfter time.Duration // default fallback (no per-parameter dictionary period wired yet)
	DeltaEvery time.Duration // minimum interval between published updates of one parameter
	Fleet      *config.Fleet // maps SCID -> tenant for keys and channels
}

type cvtKey struct {
	scid  uint16
	param string
}

type Engine struct {
	cfg         Config
	redisClient redis.Client
	consumer    kafka.Consumer

	mu        sync.RWMutex
	cvt       map[cvtKey]CVTEntry
	lastDelta map[cvtKey]time.Time
	seq       map[uint16]*atomic.Uint64
}

func NewEngine(cfg Config, r redis.Client, c kafka.Consumer) *Engine {
	if cfg.StaleAfter <= 0 {
		cfg.StaleAfter = 3 * time.Second // FR-LTM-02 default: 3x a 1s assumed period
	}
	if cfg.DeltaEvery <= 0 {
		cfg.DeltaEvery = 100 * time.Millisecond
	}
	if cfg.Fleet == nil {
		cfg.Fleet = config.DefaultFleet()
	}
	return &Engine{
		cfg:         cfg,
		redisClient: r,
		consumer:    c,
		cvt:         make(map[cvtKey]CVTEntry),
		lastDelta:   make(map[cvtKey]time.Time),
		seq:         make(map[uint16]*atomic.Uint64),
	}
}

func (e *Engine) tenantOf(scid uint16) string {
	if s, ok := e.cfg.Fleet.BySCID(scid); ok {
		return s.Tenant
	}
	return DefaultTenant
}

func (e *Engine) Start(ctx context.Context) error {
	return e.consumer.Subscribe(TopicParamsRealtime, func(ctx context.Context, msg *kafka.Message) error {
		var pm telemetry.ProcessedTelemetryMessage
		if err := json.Unmarshal(msg.Value, &pm); err != nil {
			return err
		}
		e.handle(ctx, &pm)
		return nil
	})
}

// handle applies one packet's parameters to the CVT and publishes the changes
// as a single coalesced delta batch.
func (e *Engine) handle(ctx context.Context, pm *telemetry.ProcessedTelemetryMessage) {
	now := time.Now()
	scid := pm.SCID
	var changed []telemetry.LiveValue

	e.mu.Lock()
	for _, p := range pm.Params {
		key := cvtKey{scid: p.SCID, param: p.ParamName}
		// FR-LTM-01: the CVT never goes backwards in on-board time.
		if existing, ok := e.cvt[key]; ok && p.Timestamp.Before(existing.OBT) {
			continue
		}
		lv := telemetry.ToLiveValue(p)
		e.cvt[key] = CVTEntry{Value: lv, OBT: p.Timestamp, ReceivedAt: now}

		if now.Sub(e.lastDelta[key]) >= e.cfg.DeltaEvery {
			e.lastDelta[key] = now
			changed = append(changed, lv)
		}
	}
	e.mu.Unlock()

	if e.redisClient == nil || len(pm.Params) == 0 {
		return
	}

	tenant := e.tenantOf(scid)
	e.mu.RLock()
	hashKey := telemetry.CVTKey(tenant, scid)
	for _, p := range pm.Params {
		if entry, ok := e.cvt[cvtKey{scid: p.SCID, param: p.ParamName}]; ok {
			b, _ := json.Marshal(entry.Value)
			_ = e.redisClient.HSet(ctx, 0, hashKey, p.ParamName, string(b))
		}
	}
	e.mu.RUnlock()

	if len(changed) == 0 {
		return
	}
	_ = e.redisClient.Publish(ctx, telemetry.DeltaChannel(tenant, scid), telemetry.LiveDelta{
		SCID:   scid,
		Seq:    e.nextSeq(scid),
		ERTNs:  pm.ReceiveTSNs,
		Values: changed,
	})
}

func (e *Engine) nextSeq(scid uint16) uint64 {
	e.mu.Lock()
	c, ok := e.seq[scid]
	if !ok {
		c = &atomic.Uint64{}
		e.seq[scid] = c
	}
	e.mu.Unlock()
	return c.Add(1)
}

// GetValues serves interlock reads (§16.2): every value comes back with
// explicit age and staleness so the caller decides, never a silent default.
func (e *Engine) GetValues(scid uint16, params []string) []ValueReading {
	e.mu.RLock()
	defer e.mu.RUnlock()

	out := make([]ValueReading, 0, len(params))
	now := time.Now()
	for _, p := range params {
		entry, ok := e.cvt[cvtKey{scid: scid, param: p}]
		if !ok {
			out = append(out, ValueReading{Param: p, Present: false, Stale: true})
			continue
		}
		age := now.Sub(entry.ReceivedAt)
		out = append(out, ValueReading{
			Param:   p,
			Value:   entry.Value,
			AgeMs:   age.Milliseconds(),
			Stale:   age > e.cfg.StaleAfter,
			Present: true,
		})
	}
	return out
}
