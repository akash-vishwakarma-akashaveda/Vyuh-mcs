package simulator

import (
	"encoding/binary"
	"fmt"
	"io"
	"math"
	"math/rand"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
)

// Impairments is what the space-to-ground link does to frames on their way to
// the ground station. Every rate is a percentage of frames, except BER which is
// per bit. Scope limits them to one spacecraft ("" = all).
type Impairments struct {
	Enabled bool   `json:"enabled"`
	Scope   string `json:"scope"` // sat id, or "" for every spacecraft

	BER           float64 `json:"ber"`             // bit error rate, e.g. 1e-5
	DropPct       float64 `json:"drop_pct"`        // independent frame loss
	BurstPct      float64 `json:"burst_pct"`       // chance a fade starts at a frame
	BurstLen      int     `json:"burst_len"`       // frames lost per fade
	DupPct        float64 `json:"dup_pct"`         // frame delivered twice (two stations)
	ReorderPct    float64 `json:"reorder_pct"`     // frame held back and delivered later
	ReorderDepth  int     `json:"reorder_depth"`   // frames it is held behind
	GarbagePct    float64 `json:"garbage_pct"`     // random bytes before the frame (sync slip)
	ASMCorruptPct float64 `json:"asm_corrupt_pct"` // sync marker damaged: the frame cannot be found
	TruncatePct   float64 `json:"truncate_pct"`    // frame cut short (receiver dropout mid-frame)
	WrongSCIDPct  float64 `json:"wrong_scid_pct"`  // frame from an unknown spacecraft (valid CRC)
}

// Validate rejects rates outside 0-100 % and a BER outside 0-0.1.
func (i Impairments) Validate() error {
	for name, v := range map[string]float64{"drop_pct": i.DropPct, "burst_pct": i.BurstPct, "dup_pct": i.DupPct, "reorder_pct": i.ReorderPct,
		"garbage_pct": i.GarbagePct, "asm_corrupt_pct": i.ASMCorruptPct, "truncate_pct": i.TruncatePct, "wrong_scid_pct": i.WrongSCIDPct} {
		if v < 0 || v > 100 {
			return fmt.Errorf("%s must be between 0 and 100", name)
		}
	}
	if i.BER < 0 || i.BER > 0.1 {
		return fmt.Errorf("ber must be between 0 and 0.1")
	}
	if i.BurstLen < 0 || i.BurstLen > 1000 || i.ReorderDepth < 0 || i.ReorderDepth > 64 {
		return fmt.Errorf("burst_len must be 0-1000 and reorder_depth 0-64")
	}
	return nil
}

// Link applies Impairments to every frame written through it. One Link is
// shared by the simulator and the replay, so a fault profile applies to the
// whole downlink.
type Link struct {
	mu    sync.Mutex
	imp   Impairments
	rng   *rand.Rand
	scids map[string]uint16
	stall time.Time // no frames leave before this instant
}

func NewLink(seed int64, scids map[string]uint16) *Link {
	return &Link{rng: rand.New(rand.NewSource(seed)), scids: scids}
}

func (l *Link) Impairments() Impairments {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.imp
}

func (l *Link) SetImpairments(imp Impairments) {
	if imp.BurstLen <= 0 {
		imp.BurstLen = 5
	}
	if imp.ReorderDepth <= 0 {
		imp.ReorderDepth = 2
	}
	l.mu.Lock()
	l.imp = imp
	l.mu.Unlock()
}

// Stall stops the whole downlink for d (antenna handover, station outage).
func (l *Link) Stall(d time.Duration) {
	l.mu.Lock()
	l.stall = time.Now().Add(d)
	l.mu.Unlock()
	pipeline.Inc("sim.stalls", 1)
}

// Wrap returns a writer that expects exactly one frame per Write.
func (l *Link) Wrap(w io.Writer) io.Writer { return &linkWriter{l: l, w: w} }

type heldFrame struct {
	frame []byte
	after int // release after this many further frames
}

type linkWriter struct {
	l    *Link
	w    io.Writer
	fade int // frames still to lose in the current burst
	held []heldFrame
	mu   sync.Mutex
}

func (lw *linkWriter) Write(frame []byte) (int, error) {
	lw.mu.Lock()
	defer lw.mu.Unlock()
	l := lw.l

	l.mu.Lock()
	imp := l.imp
	stallUntil := l.stall
	l.mu.Unlock()

	if d := time.Until(stallUntil); d > 0 {
		pipeline.Inc("sim.stalled_frames", 1)
		time.Sleep(d)
	}
	pipeline.Inc("sim.frames_generated", 1)

	if !imp.Enabled || !lw.inScope(imp.Scope, frame) {
		return lw.send(frame, len(frame))
	}

	chance := func(pct float64) bool {
		if pct <= 0 {
			return false
		}
		l.mu.Lock()
		defer l.mu.Unlock()
		return l.rng.Float64()*100 < pct
	}

	// Fades and independent loss: the frame never reaches the ground.
	if lw.fade > 0 {
		lw.fade--
		pipeline.Inc("sim.frames_dropped", 1)
		pipeline.Inc("sim.burst_dropped", 1)
		return len(frame), lw.releaseHeld()
	}
	if chance(imp.BurstPct) {
		lw.fade = imp.BurstLen - 1
		pipeline.Inc("sim.bursts", 1)
		pipeline.Inc("sim.frames_dropped", 1)
		pipeline.Inc("sim.burst_dropped", 1)
		return len(frame), lw.releaseHeld()
	}
	if chance(imp.DropPct) {
		pipeline.Inc("sim.frames_dropped", 1)
		return len(frame), lw.releaseHeld()
	}

	out := append([]byte(nil), frame...)

	if chance(imp.WrongSCIDPct) && len(out) >= 10 {
		// Re-address to SCID 999 and recompute the FECF: a clean frame from a
		// spacecraft the ground does not fly.
		w0 := binary.BigEndian.Uint16(out[4:6])
		w0 = w0&^(0x03FF<<4) | 999<<4
		binary.BigEndian.PutUint16(out[4:6], w0)
		crc := ccsds.ComputeCRC16CCITT(out[4 : len(out)-2])
		binary.BigEndian.PutUint16(out[len(out)-2:], crc)
		pipeline.Inc("sim.wrong_scid", 1)
	}
	if imp.BER > 0 {
		lw.flipBits(out, imp.BER)
	}
	if chance(imp.ASMCorruptPct) {
		out[1] ^= 0xFF
		pipeline.Inc("sim.asm_corrupted", 1)
	}
	if chance(imp.TruncatePct) {
		l.mu.Lock()
		cut := 8 + l.rng.Intn(len(out)-8)
		l.mu.Unlock()
		out = out[:cut]
		pipeline.Inc("sim.truncated", 1)
	}
	if chance(imp.GarbagePct) {
		l.mu.Lock()
		junk := make([]byte, 1+l.rng.Intn(40))
		l.rng.Read(junk)
		l.mu.Unlock()
		out = append(junk, out...)
		pipeline.Inc("sim.garbage_bytes", int64(len(junk)))
		pipeline.Inc("sim.garbage_inserts", 1)
	}
	if chance(imp.ReorderPct) {
		lw.held = append(lw.held, heldFrame{frame: out, after: imp.ReorderDepth})
		pipeline.Inc("sim.reordered", 1)
		return len(frame), nil
	}

	if _, err := lw.send(out, len(frame)); err != nil {
		return 0, err
	}
	if chance(imp.DupPct) {
		pipeline.Inc("sim.duplicated", 1)
		if _, err := lw.send(out, len(frame)); err != nil {
			return 0, err
		}
	}
	return len(frame), lw.releaseHeld()
}

// Flush delivers every frame still held back for reordering (end of a pass:
// a delayed frame still arrives, just late).
func (lw *linkWriter) Flush() error {
	lw.mu.Lock()
	defer lw.mu.Unlock()
	for _, h := range lw.held {
		if _, err := lw.send(h.frame, len(h.frame)); err != nil {
			return err
		}
	}
	lw.held = nil
	return nil
}

// releaseHeld delivers reordered frames once enough later frames have passed.
func (lw *linkWriter) releaseHeld() error {
	keep := lw.held[:0]
	for _, h := range lw.held {
		h.after--
		if h.after <= 0 {
			if _, err := lw.send(h.frame, len(h.frame)); err != nil {
				return err
			}
			continue
		}
		keep = append(keep, h)
	}
	lw.held = keep
	return nil
}

func (lw *linkWriter) send(b []byte, n int) (int, error) {
	if _, err := lw.w.Write(b); err != nil {
		return 0, err
	}
	pipeline.Inc("sim.frames_sent", 1)
	return n, nil
}

func (lw *linkWriter) flipBits(b []byte, ber float64) {
	l := lw.l
	l.mu.Lock()
	defer l.mu.Unlock()
	bits := len(b) * 8
	// Errors in this frame ~ Poisson(bits·BER), then their positions (cheaper
	// than a draw per bit at realistic BERs).
	lambda := float64(bits) * ber
	n := 0
	if lambda > 30 {
		n = int(math.Max(0, math.Round(lambda+math.Sqrt(lambda)*l.rng.NormFloat64())))
	} else {
		for p, limit := 1.0, math.Exp(-lambda); ; n++ {
			p *= l.rng.Float64()
			if p <= limit {
				break
			}
		}
	}
	for i := 0; i < n; i++ {
		pos := l.rng.Intn(bits)
		b[pos/8] ^= 1 << uint(pos%8)
	}
	if n > 0 {
		pipeline.Inc("sim.bits_flipped", int64(n))
		pipeline.Inc("sim.frames_corrupted", 1)
	}
}

func (lw *linkWriter) inScope(scope string, frame []byte) bool {
	if scope == "" {
		return true
	}
	scid, ok := lw.l.scids[scope]
	if !ok || len(frame) < 6 {
		return false
	}
	return binary.BigEndian.Uint16(frame[4:6])>>4&0x03FF == scid
}
