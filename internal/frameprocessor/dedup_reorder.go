package frameprocessor

import (
	"hash/fnv"
	"time"
)

// dedupWindow keeps a small ring of recent content fingerprints per
// satellite:VC (FR-FRP-03: "multi-station arbitration and dedup") — the same
// frame arriving from two stations, or replayed by a flaky link, is dropped.
type dedupWindow struct {
	size int
	seen map[string]map[uint64]int // key -> fingerprint -> insertion order
	next map[string]int
}

func newDedupWindow(size int) *dedupWindow {
	return &dedupWindow{size: size, seen: make(map[string]map[uint64]int), next: make(map[string]int)}
}

func fingerprint(frame []byte) uint64 {
	h := fnv.New64a()
	_, _ = h.Write(frame)
	return h.Sum64()
}

// seenBefore reports whether this exact frame was already processed for key,
// and records it if not.
func (d *dedupWindow) seenBefore(key string, frame []byte) bool {
	fp := fingerprint(frame)
	m, ok := d.seen[key]
	if !ok {
		m = make(map[uint64]int)
		d.seen[key] = m
	}
	if _, dup := m[fp]; dup {
		return true
	}

	order := d.next[key]
	m[fp] = order
	d.next[key] = order + 1

	if len(m) > d.size {
		var oldestFp uint64
		oldestOrder := order + 1
		for fp, o := range m {
			if o < oldestOrder {
				oldestOrder = o
				oldestFp = fp
			}
		}
		delete(m, oldestFp)
	}
	return false
}

// pendingFrame is one validated frame waiting for its turn in VCFC order.
type pendingFrame struct {
	fc     uint8
	bytes  []byte
	tsNs   int64
	passID string
	replay bool
	at     time.Time
	resync bool // the stream restarted here: drop any partial packet first
}

// vcState is everything the processor remembers about one satellite:VC —
// frame-count sequencing and the packet stream that runs across its frames.
type vcState struct {
	started  bool
	expected uint8
	pending  map[uint8]pendingFrame

	// Consecutive frames that look "late": if they keep counting up, the
	// spacecraft counter was reset (reboot) rather than frames arriving late.
	lateRun  int
	lateNext uint8

	// Packet reassembly (CCSDS 132.0 §4.1.2.7, 133.0): bytes of a packet that
	// started in an earlier frame, and whether we are aligned to a packet
	// boundary. After any lost frame the stream is out of sync until the next
	// frame whose first header pointer shows where a packet starts.
	partial []byte
	inSync  bool

	pktSeq map[uint16]uint16 // last seen source sequence count per APID

	// Arrival timing of in-order frames: used to tell a counter reset from a
	// real loss (frames cannot be lost faster than they are transmitted) and
	// to let Gap Replay identify the exact missing frames.
	lastAt     time.Time
	lastTsNs   int64
	intervalMs float64 // smoothed arrival interval
}

// dist is the forward distance from a to b on the mod-256 frame counter.
func dist(a, b uint8) uint8 { return b - a }

// oldestPending returns the buffered frame nearest the expected count.
func (s *vcState) nearestPending() (pendingFrame, bool) {
	var best pendingFrame
	found := false
	for _, pf := range s.pending {
		if !found || dist(s.expected, pf.fc) < dist(s.expected, best.fc) {
			best, found = pf, true
		}
	}
	return best, found
}

func (s *vcState) oldestArrival() time.Time {
	var t time.Time
	for _, pf := range s.pending {
		if t.IsZero() || pf.at.Before(t) {
			t = pf.at
		}
	}
	return t
}

// drain releases buffered frames that are now in order.
func (s *vcState) drain() []pendingFrame {
	var out []pendingFrame
	for {
		pf, ok := s.pending[s.expected]
		if !ok {
			return out
		}
		out = append(out, pf)
		delete(s.pending, s.expected)
		s.expected++
	}
}

// anchor starts the sequence at the earliest held frame: the one every other
// held frame is ahead of (within half the counter range).
func (s *vcState) anchor() []pendingFrame {
	for fc := range s.pending {
		earliest := true
		for other := range s.pending {
			if other != fc && dist(fc, other) >= 128 {
				earliest = false
				break
			}
		}
		if earliest {
			s.started, s.expected = true, fc
			return s.drain()
		}
	}
	// Held frames disagree about order (a counter reset during start-up): take any.
	for fc := range s.pending {
		s.started, s.expected = true, fc
		return s.drain()
	}
	return nil
}
