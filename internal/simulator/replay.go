package simulator

import (
	"context"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"sort"
	"strconv"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/pkg/xtce"
)

// Replay plays the ESA OPS-SAT-AD flight telemetry (real on-board ADCS
// measurements, anomalies labelled by ESA engineers) through the real downlink:
// every sample becomes a space packet with an on-board time header, packets are
// laid into fixed-length CCSDS TM frames by an on-board style frame generator,
// and the frames go to the Link Gateway through the same impaired link as the
// simulator. The ground truth of every sample is kept so each stage can be
// scored against it.

// OPSSATChannels maps the dataset's channel codes to the dictionary order
// (APID 0x70 + index).
var OPSSATChannels = []string{"CADC0872", "CADC0873", "CADC0874", "CADC0884", "CADC0886", "CADC0888", "CADC0890", "CADC0892", "CADC0894"}

// Gap compression: pauses longer than this in the recorded timeline are
// shortened to CompressedGap, so the replay moves from segment to segment.
const (
	gapThreshold  = 30 * time.Second
	compressedGap = 2 * time.Second
)

type ReplaySample struct {
	Recorded time.Time
	VT       float64 // seconds on the compressed replay timeline
	Channel  int
	Value    float64 // SI units from the dataset (T, rad)
	Anomaly  bool
	Segment  int32
	Train    bool
}

// LedgerEntry is the ground truth of one emitted sample.
type LedgerEntry struct {
	APID      uint16    `json:"apid"`
	Seq       uint16    `json:"seq"`
	Param     string    `json:"param"`
	OBT       time.Time `json:"obt"`
	EU        float64   `json:"eu"`
	Segment   int32     `json:"segment"`
	Anomaly   bool      `json:"anomaly"`
	Train     bool      `json:"train"`
	EmittedAt time.Time `json:"emitted_at"`
}

type ReplayConfig struct {
	DataPath    string
	SCID        uint16
	VCID        uint8
	FrameLength int
	Dictionary  []*xtce.ParameterSet // APID 0x70.. in OPSSATChannels order
	TargetTCP   string
}

type ReplayStatus struct {
	State          string  `json:"state"` // idle | loading | ready | running | paused | done | error
	Error          string  `json:"error,omitempty"`
	DataPath       string  `json:"data_path"`
	Samples        int     `json:"samples"`
	Segments       int     `json:"segments"`
	AnomalySegs    int     `json:"anomaly_segments"`
	Position       int     `json:"position"`
	Speed          float64 `json:"speed"` // 0 = as fast as the link takes it
	Loop           bool    `json:"loop"`
	ReplaySeconds  float64 `json:"replay_seconds"`  // compressed timeline length at 1x
	VirtualSeconds float64 `json:"virtual_seconds"` // position on that timeline
	Recorded       string  `json:"recorded_utc"`    // original timestamp of the current sample
	Emitted        int64   `json:"samples_emitted"`
	AnomalyEmitted int64   `json:"anomaly_samples_emitted"`
	Frames         int64   `json:"frames"`
	Connected      bool    `json:"connected"`
	OBTOffsetS     float64 `json:"obt_offset_s"`
}

type Replay struct {
	cfg  ReplayConfig
	link *Link

	mu       sync.Mutex
	state    string
	err      string
	samples  []ReplaySample
	segs     int
	anomSegs int
	pos      int
	stopAt   int // finish when pos reaches this (0 = end of dataset)
	speed    float64
	loop     bool
	vnow     float64
	cancel   context.CancelFunc

	emitted, anomalyEmitted, frames int64
	connected                       bool
	obtOffset                       time.Duration
	// On-board time of sample i is obtBase + VT(i): the recorded sample spacing
	// is kept whatever the replay speed (at 1x it tracks the wall clock).
	obtBase time.Time
	seq                             map[uint16]uint16
	ledger                          []LedgerEntry

	// one-shot source events, applied by the run loop
	resetCounter bool
	unknownAPID  int
	badPackets   int
}

func NewReplay(cfg ReplayConfig, link *Link) *Replay {
	if cfg.FrameLength == 0 {
		cfg.FrameLength = 256
	}
	return &Replay{cfg: cfg, link: link, state: "idle", speed: 1, seq: map[uint16]uint16{}}
}

// Load reads the dataset (once) and builds the compressed replay timeline.
func (r *Replay) Load() error {
	r.mu.Lock()
	if len(r.samples) > 0 {
		r.mu.Unlock()
		return nil
	}
	r.state = "loading"
	r.mu.Unlock()

	samples, segs, anom, err := loadOPSSAT(r.cfg.DataPath)
	r.mu.Lock()
	defer r.mu.Unlock()
	if err != nil {
		r.state, r.err = "error", err.Error()
		return err
	}
	r.samples, r.segs, r.anomSegs, r.state = samples, segs, anom, "ready"
	return nil
}

func loadOPSSAT(path string) ([]ReplaySample, int, int, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, 0, 0, fmt.Errorf("OPS-SAT dataset not found at %s (download data/opensat/segments.csv from Zenodo record 12588359): %w", path, err)
	}
	defer f.Close()
	rd := csv.NewReader(f)
	head, err := rd.Read()
	if err != nil {
		return nil, 0, 0, err
	}
	col := map[string]int{}
	for i, h := range head {
		col[h] = i
	}
	for _, need := range []string{"channel", "timestamp", "value", "anomaly", "segment", "train"} {
		if _, ok := col[need]; !ok {
			return nil, 0, 0, fmt.Errorf("dataset column %q missing", need)
		}
	}
	chIdx := map[string]int{}
	for i, c := range OPSSATChannels {
		chIdx[c] = i
	}

	var out []ReplaySample
	segSeen := map[int32]bool{}
	for {
		rec, err := rd.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return nil, 0, 0, err
		}
		ch, ok := chIdx[rec[col["channel"]]]
		if !ok {
			continue
		}
		ts, err1 := time.Parse(time.RFC3339Nano, rec[col["timestamp"]])
		v, err2 := strconv.ParseFloat(rec[col["value"]], 64)
		seg, err3 := strconv.Atoi(rec[col["segment"]])
		if err1 != nil || err2 != nil || err3 != nil {
			continue
		}
		anom := rec[col["anomaly"]] == "1"
		out = append(out, ReplaySample{Recorded: ts, Channel: ch, Value: v, Anomaly: anom, Segment: int32(seg), Train: rec[col["train"]] == "1"})
		if _, seen := segSeen[int32(seg)]; !seen || anom {
			segSeen[int32(seg)] = anom
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Recorded.Before(out[j].Recorded) })
	vt := 0.0
	for i := range out {
		if i > 0 {
			dt := out[i].Recorded.Sub(out[i-1].Recorded)
			if dt > gapThreshold {
				dt = compressedGap
			}
			vt += dt.Seconds()
		}
		out[i].VT = vt
	}
	anomSegs := 0
	for _, a := range segSeen {
		if a {
			anomSegs++
		}
	}
	return out, len(segSeen), anomSegs, nil
}

// Control changes what the replay is doing.
type ReplayControl struct {
	Action     string   `json:"action"` // start | pause | resume | stop | seek | speed
	Speed      *float64 `json:"speed,omitempty"`
	PositionPc *float64 `json:"position_pct,omitempty"`
	Loop       *bool    `json:"loop,omitempty"`
	Count      *int     `json:"count,omitempty"` // play this many samples from the position, then finish
}

func (r *Replay) Control(ctx context.Context, c ReplayControl) error {
	if c.Action == "start" || c.Action == "seek" {
		if err := r.Load(); err != nil {
			return err
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if c.Speed != nil {
		if *c.Speed < 0 {
			return errors.New("speed must be >= 0 (0 = as fast as possible)")
		}
		r.speed = *c.Speed
	}
	if c.Loop != nil {
		r.loop = *c.Loop
	}
	if c.PositionPc != nil && len(r.samples) > 0 {
		p := int(*c.PositionPc / 100 * float64(len(r.samples)))
		r.pos = max(0, min(len(r.samples)-1, p))
		r.vnow = r.samples[r.pos].VT
	}
	if c.Count != nil {
		r.stopAt = min(len(r.samples), r.pos+*c.Count)
	} else if c.Action == "start" {
		r.stopAt = 0
	}
	if c.Action == "start" || c.Action == "seek" {
		vt := 0.0
		if len(r.samples) > 0 {
			vt = r.samples[r.pos].VT
		}
		r.obtBase = time.Now().Add(-time.Duration(vt * float64(time.Second)))
	}
	switch c.Action {
	case "start":
		if r.cancel != nil {
			r.cancel()
		}
		runCtx, cancel := context.WithCancel(ctx)
		r.cancel = cancel
		r.state = "running"
		go r.run(runCtx)
	case "pause":
		if r.state == "running" {
			r.state = "paused"
		}
	case "resume":
		if r.state == "paused" {
			r.state = "running"
		}
	case "stop":
		if r.cancel != nil {
			r.cancel()
			r.cancel = nil
		}
		r.state = "ready"
		r.pos, r.vnow = 0, 0
	case "seek", "speed", "":
	default:
		return fmt.Errorf("unknown action %q", c.Action)
	}
	return nil
}

// Inject queues a one-shot source-side event.
func (r *Replay) Inject(event string, arg float64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	switch event {
	case "counter_reset":
		r.resetCounter = true
	case "time_jump":
		r.obtOffset += time.Duration(arg * float64(time.Second))
		pipeline.Inc("sim.time_jumps", 1)
	case "unknown_apid":
		r.unknownAPID += max(1, int(arg))
	case "bad_packet":
		r.badPackets += max(1, int(arg))
	case "stall":
		r.link.Stall(time.Duration(max(1, arg) * float64(time.Second)))
	default:
		return fmt.Errorf("unknown event %q", event)
	}
	return nil
}

func (r *Replay) Status() ReplayStatus {
	r.mu.Lock()
	defer r.mu.Unlock()
	st := ReplayStatus{
		State: r.state, Error: r.err, DataPath: r.cfg.DataPath, Samples: len(r.samples), Segments: r.segs, AnomalySegs: r.anomSegs,
		Position: r.pos, Speed: r.speed, Loop: r.loop, VirtualSeconds: r.vnow, Emitted: r.emitted, AnomalyEmitted: r.anomalyEmitted,
		Frames: r.frames, Connected: r.connected, OBTOffsetS: r.obtOffset.Seconds(),
	}
	if n := len(r.samples); n > 0 {
		st.ReplaySeconds = r.samples[n-1].VT
		st.Recorded = r.samples[min(r.pos, n-1)].Recorded.Format(time.RFC3339)
	}
	return st
}

// Ledger returns a copy of the ground truth of every sample emitted so far.
func (r *Replay) Ledger() []LedgerEntry {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]LedgerEntry(nil), r.ledger...)
}

// ResetLedger clears the ground truth and counters (start of a verification run).
func (r *Replay) ResetLedger() {
	r.mu.Lock()
	r.ledger, r.emitted, r.anomalyEmitted, r.frames = nil, 0, 0, 0
	r.mu.Unlock()
}

func (r *Replay) run(ctx context.Context) {
	for ctx.Err() == nil {
		conn, err := (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "tcp", r.cfg.TargetTCP)
		if err != nil {
			select {
			case <-ctx.Done():
				return
			case <-time.After(time.Second):
				continue
			}
		}
		r.mu.Lock()
		r.connected = true
		r.mu.Unlock()
		err = r.stream(ctx, r.link.Wrap(conn))
		_ = conn.Close()
		r.mu.Lock()
		r.connected = false
		if err == nil { // finished the dataset
			r.state = "done"
			r.cancel = nil
			r.mu.Unlock()
			return
		}
		r.mu.Unlock()
	}
}

func (r *Replay) stream(ctx context.Context, w io.Writer) error {
	sets := map[uint16]*xtce.ParameterSet{}
	for _, ps := range r.cfg.Dictionary {
		sets[ps.APID] = ps
	}
	mcfc := new(uint8)
	newMux := func() *ccsds.VCMux {
		m := ccsds.NewVCMux(r.cfg.SCID, r.cfg.VCID, r.cfg.FrameLength, true, mcfc)
		m.OCF = func() uint32 {
			b := (&ccsds.CLCW{CopInEffect: 1, VirtualChannelID: 1}).Marshal()
			return uint32(b[0])<<24 | uint32(b[1])<<16 | uint32(b[2])<<8 | uint32(b[3])
		}
		return m
	}
	mux := newMux()
	write := func(frame []byte) error {
		if _, err := w.Write(frame); err != nil {
			return err
		}
		r.mu.Lock()
		r.frames++
		r.mu.Unlock()
		pipeline.Inc("replay.frames", 1)
		return nil
	}

	const tick = 10 * time.Millisecond
	lastFrame := time.Now()
	last := time.Now()
	t := time.NewTicker(tick)
	defer t.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-t.C:
		}
		now := time.Now()
		elapsed := now.Sub(last).Seconds()
		last = now

		r.mu.Lock()
		if r.state != "running" {
			r.mu.Unlock()
			continue
		}
		reset := r.resetCounter
		r.resetCounter = false
		extra := r.sourceFaults()
		var batch []ReplaySample
		if r.speed == 0 {
			// As fast as the link accepts: the TCP write blocks when the ground
			// side falls behind, which throttles this loop.
			limit := len(r.samples)
			if r.stopAt > 0 {
				limit = r.stopAt
			}
			end := min(limit, r.pos+400)
			batch = r.samples[r.pos:end]
			if end > r.pos {
				r.vnow = r.samples[end-1].VT
			}
			r.pos = end
		} else {
			r.vnow += elapsed * r.speed
			start := r.pos
			limit := len(r.samples)
			if r.stopAt > 0 {
				limit = r.stopAt
			}
			for r.pos < limit && r.samples[r.pos].VT <= r.vnow {
				r.pos++
			}
			batch = r.samples[start:r.pos]
		}
		end := len(r.samples)
		if r.stopAt > 0 {
			end = r.stopAt
		}
		done := r.pos >= end
		if done && r.loop && r.stopAt == 0 {
			r.pos, r.vnow = 0, 0
			r.obtBase = time.Now()
			done = false
		}
		offset := r.obtOffset
		base := r.obtBase
		r.mu.Unlock()

		if reset {
			// Close out what the old frame generator holds, then restart its counters.
			for mux.Pending() > 0 {
				if err := write(mux.Next(true)); err != nil {
					return err
				}
			}
			*mcfc = 0
			mux = newMux()
			pipeline.Inc("sim.counter_resets", 1)
		}

		for _, p := range extra {
			mux.Push(p)
		}
		for _, s := range batch {
			apid := uint16(0x70 + s.Channel)
			ps := sets[apid]
			if ps == nil || len(ps.Parameters) == 0 {
				continue
			}
			obt := base.Add(time.Duration(s.VT*float64(time.Second)) + offset)
			ticks := uint64(obt.Sub(epochOf(ps)).Seconds() * ps.TimeTicksPerSec)
			name := ps.Parameters[0].Name
			eu := s.Value
			if ps.Parameters[0].Unit == "uT" {
				eu = s.Value * 1e6 // dataset is in tesla
			}
			data := encodeSet(ps, map[string]float64{name: eu}, ticks)

			r.mu.Lock()
			seq := r.seq[apid]
			r.seq[apid] = (seq + 1) & 0x3FFF
			r.emitted++
			if s.Anomaly {
				r.anomalyEmitted++
			}
			r.ledger = append(r.ledger, LedgerEntry{APID: apid, Seq: seq, Param: name, OBT: obt, EU: eu, Segment: s.Segment, Anomaly: s.Anomaly, Train: s.Train, EmittedAt: time.Now()})
			r.mu.Unlock()
			pipeline.Inc("replay.samples", 1)

			mux.Push((&ccsds.SpacePacket{SecHdrFlag: true, APID: apid, SeqFlags: 3, SeqCount: seq, Data: data}).Marshal())
			for f := mux.Next(false); f != nil; f = mux.Next(false) {
				if err := write(f); err != nil {
					return err
				}
				lastFrame = time.Now()
			}
		}

		// A partly filled frame is not held longer than 200 ms (latency bound),
		// and an idle link still carries idle frames once a second.
		if (mux.Pending() > 0 && time.Since(lastFrame) > 200*time.Millisecond) || time.Since(lastFrame) > time.Second {
			if err := write(mux.Next(true)); err != nil {
				return err
			}
			lastFrame = time.Now()
		}
		if done {
			for mux.Pending() > 0 {
				if err := write(mux.Next(true)); err != nil {
					return err
				}
			}
			if f, ok := w.(interface{ Flush() error }); ok {
				if err := f.Flush(); err != nil {
					return err
				}
			}
			// One idle frame after the last data lets the ground see a loss at the very end.
			return write(mux.Next(true))
		}
	}
}

// sourceFaults builds the packets for queued one-shot events. Called with r.mu held.
func (r *Replay) sourceFaults() [][]byte {
	var out [][]byte
	for ; r.unknownAPID > 0; r.unknownAPID-- {
		out = append(out, (&ccsds.SpacePacket{APID: 0x1F0, SeqFlags: 3, Data: make([]byte, 12)}).Marshal())
		pipeline.Inc("sim.unknown_apid_packets", 1)
	}
	for ; r.badPackets > 0; r.badPackets-- {
		p := (&ccsds.SpacePacket{APID: 0x70, SeqFlags: 3, Data: make([]byte, 10)}).Marshal()
		p[0] |= 0x40 // packet version 2: not a CCSDS 133.0 packet
		out = append(out, p)
		pipeline.Inc("sim.bad_packets", 1)
	}
	return out
}
