package frameprocessor

import "hash/fnv"

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
		// evict the oldest fingerprint
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

// reorderBuffer holds frames that arrived ahead of the expected virtual
// channel frame count, bounded so a single stuck gap can't grow unbounded
// (FR-FRP-03's reorder window). onInOrder is called for every frame released
// in FC order, including a synthetic gap acknowledgement when the buffer
// fills before the missing frame shows up.
type reorderBuffer struct {
	maxSize int
	pending map[string]map[uint8][]byte
}

func newReorderBuffer(maxSize int) *reorderBuffer {
	return &reorderBuffer{maxSize: maxSize, pending: make(map[string]map[uint8][]byte)}
}

// admitResult reports what an Admit call decided: the frames now safe to
// hand downstream, the advanced next-expected FC, and — only when the
// reorder buffer filled up before the missing frame arrived — the gap that
// had to be declared lost.
type admitResult struct {
	Ready        [][]byte
	NextExpected uint8
	GapDeclared  bool
	GapFrom      uint8
	GapCount     int
}

// Admit processes one arriving frame against the expected FC for key.
func (r *reorderBuffer) Admit(key string, fc uint8, expected uint8, data []byte) admitResult {
	if fc == expected {
		ready, next := r.drain(key, expected+1)
		return admitResult{Ready: append([][]byte{data}, ready...), NextExpected: next}
	}

	// Out of order: buffer it, bounded.
	buf, ok := r.pending[key]
	if !ok {
		buf = make(map[uint8][]byte)
		r.pending[key] = buf
	}
	buf[fc] = data

	if len(buf) < r.maxSize {
		return admitResult{NextExpected: expected} // wait for the missing frame(s)
	}

	// Buffer is full: the missing frame(s) are treated as lost. Advance past
	// the gap to the smallest buffered FC and drain whatever is now in order.
	next := smallestFC(buf)
	lost := int(next) - int(expected)
	if lost < 0 {
		lost += 256
	}
	ready, nextExpected := r.drain(key, next)
	return admitResult{Ready: ready, NextExpected: nextExpected, GapDeclared: true, GapFrom: expected, GapCount: lost}
}

func (r *reorderBuffer) drain(key string, expected uint8) ([][]byte, uint8) {
	buf := r.pending[key]
	var ready [][]byte
	for {
		data, ok := buf[expected]
		if !ok {
			break
		}
		ready = append(ready, data)
		delete(buf, expected)
		expected++
	}
	return ready, expected
}

func smallestFC(buf map[uint8][]byte) uint8 {
	first := true
	var min uint8
	for fc := range buf {
		if first || fc < min {
			min = fc
			first = false
		}
	}
	return min
}
