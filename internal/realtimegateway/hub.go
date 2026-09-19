package realtimegateway

import (
	"context"
	"encoding/json"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/alarm"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
)

type event struct {
	seq   uint64
	at    time.Time
	kind  string // ALARM | STATUS
	scid  uint16
	frame frame
}

type satWatch struct {
	refs   int
	cancel context.CancelFunc
}

// hub is the shared per-process state: connected clients, the reference-
// counted per-satellite delta watchers, and the retained event ring buffer
// that RESUME replays from.
type hub struct {
	e *Engine

	mu      sync.Mutex
	clients map[*client]struct{}
	watch   map[uint16]*satWatch
	ring    []event
	seq     uint64
	root    context.Context
	once    sync.Once
}

func newHub(e *Engine) *hub {
	return &hub{e: e, clients: map[*client]struct{}{}, watch: map[uint16]*satWatch{}, root: context.Background()}
}

func (h *hub) add(c *client) {
	h.mu.Lock()
	h.clients[c] = struct{}{}
	h.mu.Unlock()
}

func (h *hub) remove(c *client) {
	h.mu.Lock()
	delete(h.clients, c)
	h.mu.Unlock()
	c.mu.Lock()
	var scids []uint16
	for _, s := range c.subs {
		if s.kind == "PARAMS" {
			scids = append(scids, s.scid)
		}
	}
	c.subs = map[string]*sub{}
	c.mu.Unlock()
	for _, scid := range scids {
		h.release(scid)
	}
}

func (h *hub) currentSeq() uint64 {
	h.mu.Lock()
	defer h.mu.Unlock()
	return h.seq
}

// ---------------------------------------------------------------- subscriptions

func (h *hub) subscribe(ctx context.Context, c *client, f inFrame) {
	if f.SubID == "" {
		c.sendPriority(frame{"type": "ERROR", "code": "MISSING_SUB_ID"})
		return
	}
	switch f.Kind {
	case "PARAMS":
		h.subscribeParams(c, f)
	case "ALARMS", "STATUS", "COMMANDS", "SESSIONS":
		kind := "STATUS"
		if f.Kind == "ALARMS" {
			kind = "ALARMS"
		}
		s := &sub{id: f.SubID, kind: kind, scope: h.scopeSet(f.Scope)}
		h.putSub(c, s)
		c.sendPriority(frame{"type": "SUBSCRIBED", "sub_id": f.SubID, "kind": f.Kind, "event_seq": h.currentSeq()})
	default:
		c.sendPriority(frame{"type": "ERROR", "sub_id": f.SubID, "code": "UNSUPPORTED_KIND"})
	}
}

func (h *hub) scopeSet(scope []string) map[uint16]bool {
	if len(scope) == 0 {
		return nil
	}
	out := map[uint16]bool{}
	for _, id := range scope {
		if id == "*" {
			return nil
		}
		if sat, ok := h.e.cfg.Fleet.BySatID(id); ok {
			out[sat.SCID] = true
		}
	}
	return out
}

func (h *hub) putSub(c *client, s *sub) {
	c.mu.Lock()
	old := c.subs[s.id]
	c.subs[s.id] = s
	c.mu.Unlock()
	if old != nil && old.kind == "PARAMS" {
		h.release(old.scid)
	}
}

func (h *hub) subscribeParams(c *client, f inFrame) {
	sat, ok := h.e.cfg.Fleet.BySatID(f.Satellite)
	if !ok {
		c.sendPriority(frame{"type": "ERROR", "sub_id": f.SubID, "code": "UNKNOWN_SATELLITE", "satellite": f.Satellite})
		return
	}

	var params map[string]bool
	if len(f.Params) > 0 && !(len(f.Params) == 1 && f.Params[0] == "*") {
		params = map[string]bool{}
		for _, p := range f.Params {
			params[p] = true
		}
	}
	s := &sub{id: f.SubID, kind: "PARAMS", scid: sat.SCID, satID: sat.SatID, params: params, pending: map[string]telemetry.LiveValue{}}

	// Subscribe to the live channel first, then snapshot: anything published
	// after this point is delivered as a delta, so nothing falls in the gap.
	h.acquire(sat.SCID)
	h.putSub(c, s)

	values := []telemetry.LiveValue{}
	if h.e.redis != nil {
		all, err := h.e.redis.HGetAll(context.Background(), 0, telemetry.CVTKey(sat.Tenant, sat.SCID))
		if err == nil {
			for name, raw := range all {
				if !s.wantsParam(name) {
					continue
				}
				var v telemetry.LiveValue
				if json.Unmarshal([]byte(raw), &v) == nil {
					v.ParamID = name
					values = append(values, v)
				}
			}
		}
	}
	c.sendPriority(frame{
		"type": "SNAPSHOT", "sub_id": f.SubID, "satellite": sat.SatID, "seq": 0,
		"gw_ns": time.Now().UnixNano(), "values": values,
	})
}

func (h *hub) unsubscribe(c *client, id string) {
	c.mu.Lock()
	old := c.subs[id]
	delete(c.subs, id)
	c.mu.Unlock()
	if old != nil && old.kind == "PARAMS" {
		h.release(old.scid)
	}
}

// ---------------------------------------------------------------- delta watchers

// acquire starts (or reference-counts) the Live Telemetry delta watcher for a
// satellite; the redis subscription is established before it returns.
func (h *hub) acquire(scid uint16) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if w, ok := h.watch[scid]; ok {
		w.refs++
		return
	}
	sat, ok := h.e.cfg.Fleet.BySCID(scid)
	if !ok || h.e.redis == nil {
		return
	}
	ctx, cancel := context.WithCancel(h.root)
	ch, err := h.e.redis.SubscribeCtx(ctx, telemetry.DeltaChannel(sat.Tenant, scid))
	if err != nil {
		cancel()
		return
	}
	h.watch[scid] = &satWatch{refs: 1, cancel: cancel}
	go func() {
		for raw := range ch {
			var d telemetry.LiveDelta
			if json.Unmarshal([]byte(raw), &d) == nil {
				h.dispatchDelta(sat.SatID, d)
			}
		}
	}()
}

func (h *hub) release(scid uint16) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if w, ok := h.watch[scid]; ok {
		if w.refs--; w.refs <= 0 {
			w.cancel()
			delete(h.watch, scid)
		}
	}
}

func (h *hub) dispatchDelta(satID string, d telemetry.LiveDelta) {
	h.mu.Lock()
	clients := make([]*client, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()
	for _, c := range clients {
		c.offerValues(satID, d)
	}
}

// ---------------------------------------------------------------- priority events

// startEventWatchers subscribes, once, to every satellite's alarm and status
// channels — independent of connected clients, so the ring buffer already
// holds recent events when a client reconnects and asks to resume.
func (h *hub) startEventWatchers(ctx context.Context) {
	h.once.Do(func() {
		h.mu.Lock()
		h.root = ctx
		h.mu.Unlock()
		if h.e.redis == nil {
			return
		}
		for _, sat := range h.e.cfg.Fleet.All() {
			sat := sat
			if ch, err := h.e.redis.SubscribeCtx(ctx, telemetry.AlarmChannel(sat.SCID)); err == nil {
				go func() {
					for raw := range ch {
						var r alarm.AlarmRecord
						if json.Unmarshal([]byte(raw), &r) != nil {
							continue
						}
						h.emit("ALARM", sat.SCID, frame{"satellite": sat.SatID, "alarm": r.ConsoleView(sat.SatID)})
					}
				}()
			}
			if ch, err := h.e.redis.SubscribeCtx(ctx, telemetry.StatusChannel(sat.SCID)); err == nil {
				go func() {
					for raw := range ch {
						h.emit("STATUS", sat.SCID, frame{"satellite": sat.SatID, "status": json.RawMessage(raw)})
					}
				}()
			}
		}
	})
}

func wantsEvent(c *client, ev event) bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	for _, s := range c.subs {
		want := (ev.kind == "ALARM" && s.kind == "ALARMS") || (ev.kind == "STATUS" && s.kind == "STATUS")
		if want && (s.scope == nil || s.scope[ev.scid]) {
			return true
		}
	}
	return false
}

// emit stamps an event with the next event_seq, retains it for RESUME, and
// pushes it down every interested connection's priority lane.
func (h *hub) emit(kind string, scid uint16, body frame) {
	h.mu.Lock()
	h.seq++
	body["type"] = kind
	body["event_seq"] = h.seq
	ev := event{seq: h.seq, at: time.Now(), kind: kind, scid: scid, frame: body}
	h.ring = append(h.ring, ev)
	if over := len(h.ring) - h.e.cfg.ReplayEvents; over > 0 {
		h.ring = h.ring[over:]
	}
	cut := time.Now().Add(-h.e.cfg.ReplayWindow)
	for len(h.ring) > 0 && h.ring[0].at.Before(cut) {
		h.ring = h.ring[1:]
	}
	clients := make([]*client, 0, len(h.clients))
	for c := range h.clients {
		clients = append(clients, c)
	}
	h.mu.Unlock()

	for _, c := range clients {
		if wantsEvent(c, ev) {
			c.sendPriority(ev.frame)
		}
	}
}

// resume replays the priority events a reconnecting client missed. Values are
// not replayed — the SNAPSHOT sent on re-subscribe already carries the latest
// state — so this only has to be gap-free for alarms and status (§21.3).
func (h *hub) resume(c *client, f inFrame) {
	h.mu.Lock()
	current := h.seq
	if f.InstanceID != h.e.instanceID {
		h.mu.Unlock()
		c.sendPriority(frame{"type": "RESUME_FAILED", "reason": "INSTANCE_CHANGED", "event_seq": current, "instance_id": h.e.instanceID})
		return
	}
	// Retained events start at oldest; anything older than last+1 is gone.
	if len(h.ring) > 0 && h.ring[0].seq > f.LastEventSq+1 {
		h.mu.Unlock()
		c.sendPriority(frame{"type": "RESUME_FAILED", "reason": "TOO_OLD", "event_seq": current, "instance_id": h.e.instanceID})
		return
	}
	var replay []event
	for _, ev := range h.ring {
		if ev.seq > f.LastEventSq {
			replay = append(replay, ev)
		}
	}
	h.mu.Unlock()

	n := 0
	for _, ev := range replay {
		if wantsEvent(c, ev) {
			c.sendPriority(ev.frame)
			n++
		}
	}
	c.sendPriority(frame{"type": "RESUMED", "from_seq": f.LastEventSq, "to_seq": current, "replayed": n, "instance_id": h.e.instanceID})
}
