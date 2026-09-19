// Package realtimegateway implements Realtime Gateway (architecture v2.2
// §21.3): pushes live telemetry, alarms and command status to browser
// WebSocket connections with bounded latency and memory.
//
// It never consumes Kafka: it subscribes to Live Telemetry's per-satellite
// delta channels (so a pod only receives the satellites its clients watch) and
// to the alarm / status channels. Each connection has two lanes:
//
//   - a priority lane (ALARM, STATUS, HEARTBEAT, control frames) that is never
//     dropped — a client too slow to drain it is disconnected and resumes;
//   - a value lane that conflates: a newer value of a parameter replaces an
//     unsent older one, so a slow client sees the latest state, not a backlog.
//
// Frames are JSON here rather than binary Protobuf (a flagged substitution).
//
//	client -> server  SUBSCRIBE {sub_id, kind: PARAMS|ALARMS|STATUS, satellite|scope, params?}
//	                  UNSUBSCRIBE {sub_id} · RESUME {instance_id, last_event_seq} · PING
//	server -> client  HELLO · SNAPSHOT · DELTA{seq} · ALARM{event_seq} · STATUS{event_seq}
//	                  HEARTBEAT{event_seq} · RESUMED / RESUME_FAILED · ERROR · PONG
package realtimegateway

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"github.com/akashaveda/vyuh-mcs/config"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{CheckOrigin: func(r *http.Request) bool { return true }}

type Config struct {
	Fleet          *config.Fleet
	ListenAddr     string
	HeartbeatEvery time.Duration // default 5s (§21.3)
	FlushEvery     time.Duration // value-lane coalescing window, default 20ms
	ReplayEvents   int           // events retained for RESUME, default 2000
	ReplayWindow   time.Duration // default 60s (§21.3)
	PriorityQueue  int           // per-connection priority lane depth, default 256
}

type Engine struct {
	cfg        Config
	redis      redis.Client
	instanceID string
	hub        *hub
}

func NewEngine(r redis.Client, cfg Config) *Engine {
	if cfg.Fleet == nil {
		cfg.Fleet = config.DefaultFleet()
	}
	if cfg.ListenAddr == "" {
		cfg.ListenAddr = ":8089"
	}
	if cfg.HeartbeatEvery <= 0 {
		cfg.HeartbeatEvery = 5 * time.Second
	}
	if cfg.FlushEvery <= 0 {
		cfg.FlushEvery = 20 * time.Millisecond
	}
	if cfg.ReplayEvents <= 0 {
		cfg.ReplayEvents = 2000
	}
	if cfg.ReplayWindow <= 0 {
		cfg.ReplayWindow = 60 * time.Second
	}
	if cfg.PriorityQueue <= 0 {
		cfg.PriorityQueue = 256
	}
	e := &Engine{cfg: cfg, redis: r, instanceID: fmt.Sprintf("rtg-%d", time.Now().UnixNano())}
	e.hub = newHub(e)
	return e
}

// Handler returns the WebSocket mux, exposed separately so tests can drive
// it with httptest without opening a real listener.
func (e *Engine) Handler(ctx context.Context) http.Handler {
	e.hub.startEventWatchers(ctx)
	mux := http.NewServeMux()
	mux.HandleFunc("/ws/telemetry", func(w http.ResponseWriter, r *http.Request) {
		e.serve(ctx, w, r)
	})
	return mux
}

func (e *Engine) Start(ctx context.Context) error {
	server := &http.Server{Addr: e.cfg.ListenAddr, Handler: e.Handler(ctx)}
	go func() {
		<-ctx.Done()
		_ = server.Close()
	}()
	go func() { _ = server.ListenAndServe() }()
	return nil
}

// ---------------------------------------------------------------- frames

type inFrame struct {
	Type        string   `json:"type"`
	SubID       string   `json:"sub_id"`
	Kind        string   `json:"kind"`
	Satellite   string   `json:"satellite"`
	Scope       []string `json:"scope"`
	Params      []string `json:"params"`
	InstanceID  string   `json:"instance_id"`
	LastEventSq uint64   `json:"last_event_seq"`
}

type frame map[string]any

func nowUTC() string { return time.Now().UTC().Format(time.RFC3339Nano) }

// ---------------------------------------------------------------- client

type sub struct {
	id      string
	kind    string          // PARAMS | ALARMS | STATUS
	scid    uint16          // PARAMS only
	satID   string          // PARAMS only
	params  map[string]bool // nil = every parameter
	scope   map[uint16]bool // ALARMS/STATUS; nil = every satellite
	pending map[string]telemetry.LiveValue
	ert     int64
	seq     uint64
}

func (s *sub) wantsParam(p string) bool { return s.params == nil || s.params[p] }

type client struct {
	conn   *websocket.Conn
	prio   chan []byte
	wake   chan struct{}
	done   chan struct{}
	closed atomic.Bool

	mu   sync.Mutex
	subs map[string]*sub
}

func newClient(conn *websocket.Conn, prioDepth int) *client {
	return &client{
		conn: conn, prio: make(chan []byte, prioDepth), wake: make(chan struct{}, 1),
		done: make(chan struct{}), subs: map[string]*sub{},
	}
}

// sendPriority queues a frame that must not be lost. A client that cannot
// drain its priority lane is disconnected (it reconnects and resumes) rather
// than silently missing an alarm.
func (c *client) sendPriority(f frame) {
	if c.closed.Load() {
		return
	}
	b, err := json.Marshal(f)
	if err != nil {
		return
	}
	select {
	case c.prio <- b:
	default:
		c.close()
	}
}

func (c *client) close() {
	if c.closed.CompareAndSwap(false, true) {
		close(c.done)
		_ = c.conn.Close()
	}
}

// offerValues puts a LiveDelta on the conflating value lane of every PARAMS
// subscription that watches its satellite.
func (c *client) offerValues(satID string, d telemetry.LiveDelta) {
	c.mu.Lock()
	woke := false
	for _, s := range c.subs {
		if s.kind != "PARAMS" || s.scid != d.SCID {
			continue
		}
		for _, v := range d.Values {
			if s.wantsParam(v.ParamID) {
				s.pending[v.ParamID] = v // a newer value replaces an unsent older one
				woke = true
			}
		}
		if woke && d.ERTNs != 0 {
			s.ert = d.ERTNs
		}
	}
	c.mu.Unlock()
	if woke {
		select {
		case c.wake <- struct{}{}:
		default:
		}
	}
}

// flushValues turns every subscription's pending values into one DELTA frame.
func (c *client) flushValues() {
	var out []frame
	c.mu.Lock()
	for _, s := range c.subs {
		if s.kind != "PARAMS" || len(s.pending) == 0 {
			continue
		}
		vals := make([]telemetry.LiveValue, 0, len(s.pending))
		for _, v := range s.pending {
			vals = append(vals, v)
		}
		s.pending = map[string]telemetry.LiveValue{}
		s.seq++
		out = append(out, frame{
			"type": "DELTA", "sub_id": s.id, "satellite": s.satID, "seq": s.seq,
			"ert_ns": s.ert, "gw_ns": time.Now().UnixNano(), "values": vals,
		})
	}
	c.mu.Unlock()
	for _, f := range out {
		c.sendPriorityValue(f)
	}
}

// sendPriorityValue writes a value-lane frame straight to the socket queue
// without the slow-consumer disconnect (values are conflated upstream).
func (c *client) sendPriorityValue(f frame) {
	b, err := json.Marshal(f)
	if err != nil || c.closed.Load() {
		return
	}
	select {
	case c.prio <- b:
	default: // queue is full of undelivered frames; the newer state follows in the next flush
	}
}

func (c *client) writer(flushEvery time.Duration) {
	write := func(b []byte) bool {
		_ = c.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
		return c.conn.WriteMessage(websocket.TextMessage, b) == nil
	}
	for {
		select {
		case <-c.done:
			return
		case b := <-c.prio:
			if !write(b) {
				c.close()
				return
			}
		case <-c.wake:
			// Coalescing window: priority frames keep flowing while values accumulate.
			timer := time.NewTimer(flushEvery)
		window:
			for {
				select {
				case <-c.done:
					timer.Stop()
					return
				case b := <-c.prio:
					if !write(b) {
						c.close()
						return
					}
				case <-timer.C:
					break window
				}
			}
			c.flushValues()
		}
	}
}

// ---------------------------------------------------------------- serving

func (e *Engine) serve(ctx context.Context, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	c := newClient(conn, e.cfg.PriorityQueue)
	e.hub.add(c)
	defer func() {
		e.hub.remove(c)
		c.close()
	}()

	go c.writer(e.cfg.FlushEvery)
	go e.heartbeat(c)

	c.sendPriority(frame{
		"type": "HELLO", "instance_id": e.instanceID, "event_seq": e.hub.currentSeq(),
		"heartbeat_ms": e.cfg.HeartbeatEvery.Milliseconds(), "resume_window_s": int(e.cfg.ReplayWindow.Seconds()),
		"server_time_utc": nowUTC(),
	})

	for {
		_, data, err := conn.ReadMessage()
		if err != nil {
			return
		}
		var f inFrame
		if json.Unmarshal(data, &f) != nil {
			c.sendPriority(frame{"type": "ERROR", "code": "BAD_FRAME"})
			continue
		}
		switch f.Type {
		case "PING":
			c.sendPriority(frame{"type": "PONG", "server_time_utc": nowUTC()})
		case "SUBSCRIBE":
			e.hub.subscribe(ctx, c, f)
		case "UNSUBSCRIBE":
			e.hub.unsubscribe(c, f.SubID)
		case "RESUME":
			e.hub.resume(c, f)
		}
	}
}

func (e *Engine) heartbeat(c *client) {
	t := time.NewTicker(e.cfg.HeartbeatEvery)
	defer t.Stop()
	for {
		select {
		case <-c.done:
			return
		case <-t.C:
			c.sendPriority(frame{"type": "HEARTBEAT", "server_time_utc": nowUTC(), "event_seq": e.hub.currentSeq()})
		}
	}
}
