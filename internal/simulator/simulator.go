// Package simulator is Spacecraft Simulator v0 (architecture v2.2 §18.5, the
// roadmap's "Simulator v0"): a digital twin of the demo constellation. Every
// satellite emits its platform dictionary's subsystem packets — encoded from
// the very same dictionary the ground segment decodes them with — inside
// fixed-length CCSDS TM frames padded with idle packets, carries an on-board
// time header (CUC) in every packet, reports COP-1 state in the CLCW, and
// supports scripted faults (e.g. heater A failure) for the demo story.
package simulator

import (
	"bytes"
	"context"
	"fmt"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"io"
	"math"
	"math/rand"
	"net"
	"sort"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/config"
	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/pkg/xtce"
)

const idleAPID = 0x7FF

// farmWindow is the FARM-1 sliding window width W (CCSDS 232.1): frames further
// ahead or behind than this put the FARM into lockout.
const farmWindow = 20

type Config struct {
	Satellites  []config.Satellite
	Dictionary  []*xtce.ParameterSet // layout per subsystem APID
	Model       map[string]config.SimParam
	FrameLength int           // total frame bytes including the 4-byte ASM
	VCID        uint8         // telemetry virtual channel
	TCVCID      uint8         // virtual channel the CLCW reports on
	Cycle       time.Duration // one full set of subsystem packets per satellite per cycle
	TargetTCP   string
	Seed        int64
	// TimeScale accelerates the physics (fault dynamics) relative to wall
	// clock; the on-board time in packets stays real time. 1 = real time.
	TimeScale float64
	// UplinkKey returns the satellite's uplink (SDLS) key; nil rejects commands.
	UplinkKey func(scid uint16) []byte
	Now       func() time.Time
}

// DefaultConfig returns the embedded 12-satellite demo constellation.
func DefaultConfig() Config {
	dict, err := config.PlatformDictionary()
	if err != nil {
		panic(err)
	}
	model, err := config.SimModel()
	if err != nil {
		panic(err)
	}
	return Config{
		Satellites:  config.DefaultFleet().All(),
		Dictionary:  dict,
		Model:       model,
		FrameLength: 256,
		VCID:        1,
		TCVCID:      1,
		Cycle:       time.Second,
		TargetTCP:   "127.0.0.1:5050",
		Seed:        42,
		TimeScale:   1,
		Now:         time.Now,
	}
}

type override struct{ target, tau float64 }

type satState struct {
	mu   sync.Mutex
	sat  config.Satellite
	vals map[string]float64 // smoothed physical state
	out  map[string]float64 // last emitted value (state + measurement noise)
	over map[string]override

	phase, period, scale map[string]float64
	rng                  *rand.Rand

	vcfc       uint8
	seq        map[uint16]uint16
	vr         uint8 // COP-1 FARM-1 V(R): next expected TC frame sequence number
	retransmit bool
	lockout    bool

	outbox     [][]byte // service packets (PUS-1 reports) waiting for a downlink frame
	pusCounter uint16

	fault   string
	faultAt time.Time

	executed []ExecutedCommand
}

type Simulator struct {
	cfg  Config
	sats map[string]*satState
	ids  []string
	sets []*xtce.ParameterSet
	mu   sync.Mutex // serialises writes to the downlink stream

	tcDrops int     // telecommand frames the forward link will lose next
	link    *Link   // space-to-ground link impairments, shared with the replay
	replay  *Replay // OPS-SAT flight data replay, nil when not configured
	ctx     context.Context
	events  func() any // recent pipeline events for the control API
}

// SetEvents provides the recent pipeline events served at /v1/pipeline/events.
func (s *Simulator) SetEvents(f func() any) { s.events = f }

// SetContext sets the lifetime of work started from the control API (a replay
// started over HTTP must outlive the request).
func (s *Simulator) SetContext(ctx context.Context) { s.ctx = ctx }

func (s *Simulator) runCtx() context.Context {
	if s.ctx != nil {
		return s.ctx
	}
	return context.Background()
}

// Link is the impaired space-to-ground link every frame passes through.
func (s *Simulator) Link() *Link { return s.link }

// SetReplay attaches the OPS-SAT replay so its controls are served with the simulator's.
func (s *Simulator) SetReplay(r *Replay) { s.replay = r }

// Replay returns the attached replay, if any.
func (s *Simulator) Replay() *Replay { return s.replay }

func NewSimulator(cfg Config) *Simulator {
	d := DefaultConfig()
	if len(cfg.Satellites) == 0 {
		cfg.Satellites = d.Satellites
	}
	if len(cfg.Dictionary) == 0 {
		cfg.Dictionary = d.Dictionary
	}
	if cfg.Model == nil {
		cfg.Model = d.Model
	}
	if cfg.FrameLength == 0 {
		cfg.FrameLength = d.FrameLength
	}
	if cfg.VCID == 0 {
		cfg.VCID = d.VCID
	}
	if cfg.TCVCID == 0 {
		cfg.TCVCID = d.TCVCID
	}
	if cfg.Cycle <= 0 {
		cfg.Cycle = d.Cycle
	}
	if cfg.TargetTCP == "" {
		cfg.TargetTCP = d.TargetTCP
	}
	if cfg.TimeScale <= 0 {
		cfg.TimeScale = 1
	}
	if cfg.Now == nil {
		cfg.Now = time.Now
	}

	scids := map[string]uint16{}
	for _, sat := range cfg.Satellites {
		scids[sat.SatID] = sat.SCID
	}
	s := &Simulator{cfg: cfg, sats: map[string]*satState{}, sets: cfg.Dictionary, link: NewLink(cfg.Seed+1, scids)}
	sort.Slice(s.sets, func(i, j int) bool { return s.sets[i].APID < s.sets[j].APID })

	for i, sat := range cfg.Satellites {
		if !sat.Simulated() {
			continue // replayed from a recorded dataset, not modelled here
		}
		rng := rand.New(rand.NewSource(cfg.Seed + int64(i)*7919))
		st := &satState{
			sat: sat, vals: map[string]float64{}, out: map[string]float64{}, over: map[string]override{},
			phase: map[string]float64{}, period: map[string]float64{}, scale: map[string]float64{},
			rng: rng, seq: map[uint16]uint16{},
		}
		for name, mp := range cfg.Model {
			st.phase[name] = rng.Float64() * 2 * math.Pi
			st.period[name] = 90 + rng.Float64()*60
			st.scale[name] = 1 + (rng.Float64()-0.5)*0.01 // ±0.5% per-satellite variety
			st.vals[name] = mp.Base * st.scale[name]
			st.out[name] = st.vals[name]
		}
		s.sats[sat.SatID] = st
		s.ids = append(s.ids, sat.SatID)
	}
	return s
}

// step advances one satellite's physical state by dt seconds at time t.
func (st *satState) step(model map[string]config.SimParam, t time.Time, dt float64) {
	st.mu.Lock()
	defer st.mu.Unlock()
	sec := float64(t.UnixNano()) / 1e9

	for name, mp := range model {
		ov, overridden := st.over[name]
		switch mp.Kind {
		case "state":
			if overridden {
				st.vals[name] = ov.target
			}
			st.out[name] = math.Round(st.vals[name])
		case "counter":
			st.vals[name] += mp.Drift * dt
			if mp.Wrap > 0 && st.vals[name] >= mp.Wrap {
				st.vals[name] = mp.Base
			}
			st.out[name] = math.Floor(st.vals[name])
		default: // analog
			target := mp.Base*st.scale[name] + mp.Drift*6*math.Sin(2*math.Pi*sec/st.period[name]+st.phase[name])
			tau := 1.0
			if overridden {
				target, tau = ov.target, ov.tau
			}
			st.vals[name] += (target - st.vals[name]) * (1 - math.Exp(-dt/tau))
			st.out[name] = st.vals[name] + st.rng.NormFloat64()*mp.Drift*0.5
		}
	}
}

// ---- faults & spacecraft actions ----

// Faults the demo story uses.
const (
	FaultHeaterAFail = "HEATER_A_FAIL"
)

// Apply injects a fault or performs a spacecraft action on a satellite.
// Actions: HEATER_A_FAIL (fault), HTR_B_ON (recovery command), CLEAR (back to nominal).
func (s *Simulator) Apply(satID, action string) error {
	st, ok := s.sats[satID]
	if !ok {
		return fmt.Errorf("simulator: unknown satellite %q", satID)
	}
	st.mu.Lock()
	defer st.mu.Unlock()

	switch action {
	case FaultHeaterAFail:
		st.fault, st.faultAt = FaultHeaterAFail, s.cfg.Now()
		st.over["HTR_A_DUTY"] = override{target: 0, tau: 0.5}
		st.over["BAT_TEMP"] = override{target: 1.5, tau: 25}
		st.over["BAT_BAY_TEMP"] = override{target: 6, tau: 40}
	case "HTR_B_ON":
		st.over["HTR_B_STATE"] = override{target: 1, tau: 0}
		st.over["BAT_TEMP"] = override{target: 20, tau: 15}
		st.over["BAT_BAY_TEMP"] = override{target: 20, tau: 20}
	case "HTR_B_OFF":
		delete(st.over, "HTR_B_STATE")
		st.vals["HTR_B_STATE"] = 0
		if st.fault == FaultHeaterAFail { // heater A is still dead: the battery cools again
			st.over["BAT_TEMP"] = override{target: 1.5, tau: 25}
			st.over["BAT_BAY_TEMP"] = override{target: 6, tau: 40}
		} else {
			delete(st.over, "BAT_TEMP")
			delete(st.over, "BAT_BAY_TEMP")
		}
	case "HTR_A_OFF":
		st.over["HTR_A_DUTY"] = override{target: 0, tau: 0.5}
	case "HTR_A_ON":
		delete(st.over, "HTR_A_DUTY")
	case "CLEAR":
		st.fault = ""
		st.over = map[string]override{}
	default:
		return fmt.Errorf("simulator: unknown action %q", action)
	}
	return nil
}

// ActiveFaults returns satellite id -> active fault name.
func (s *Simulator) ActiveFaults() map[string]string {
	out := map[string]string{}
	for id, st := range s.sats {
		st.mu.Lock()
		if st.fault != "" {
			out[id] = st.fault
		}
		st.mu.Unlock()
	}
	return out
}

// Value returns the last emitted engineering value of a parameter.
func (s *Simulator) Value(satID, param string) (float64, bool) {
	st, ok := s.sats[satID]
	if !ok {
		return 0, false
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	v, ok := st.out[param]
	return v, ok
}

// AcceptTCFrame is the spacecraft's FARM-1. An in-sequence Type-AD telecommand
// frame is accepted and advances V(R); one ahead of V(R) means a frame was
// lost, so the retransmit flag is raised in the CLCW; one behind V(R) is a
// duplicate (a retransmission that crossed the acknowledgement) and is
// silently discarded. It reports whether the frame was accepted for execution.
func (s *Simulator) AcceptTCFrame(scid uint16, seq uint8) bool {
	for _, st := range s.sats {
		if st.sat.SCID != scid {
			continue
		}
		st.mu.Lock()
		defer st.mu.Unlock()
		if st.lockout {
			return false // only Unlock clears a lockout
		}
		switch d := seq - st.vr; {
		case d == 0:
			st.vr++
			st.retransmit = false
			return true
		case d < farmWindow:
			st.retransmit = true // ahead within the positive window: ask for retransmission
		case d > 255-farmWindow:
			// behind within the negative window: a duplicate, discard
		default:
			st.lockout = true // outside both windows: FARM-1 lockout
			pipeline.Inc("uplink.farm_lockouts", 1)
		}
		return false
	}
	return false
}

// ---- downlink ----

// BuildFrame encodes subsystem packet k of a satellite into one fixed-length
// TM frame (ASM + header + [packet + idle fill] + OCF + FECF).
func (s *Simulator) BuildFrame(satID string, k int) ([]byte, error) {
	st, ok := s.sats[satID]
	if !ok {
		return nil, fmt.Errorf("simulator: unknown satellite %q", satID)
	}
	ps := s.sets[k%len(s.sets)]
	now := s.cfg.Now()

	st.mu.Lock()
	defer st.mu.Unlock()

	ticks := uint64(now.Sub(epochOf(ps)).Seconds() * ps.TimeTicksPerSec)
	data := encodeSet(ps, st.out, ticks)

	st.seq[ps.APID]++
	pkt := &ccsds.SpacePacket{SecHdrFlag: true, APID: ps.APID, SeqFlags: 3, SeqCount: st.seq[ps.APID] & 0x3FFF, Data: data}
	field := pkt.Marshal()

	fieldLen := s.cfg.FrameLength - 16 // ASM 4 + primary header 6 (incl. data field status) + OCF 4 + FECF 2
	// Service packets (PUS-1 reports) ride along in the same frame when they fit.
	for len(st.outbox) > 0 {
		if rest := fieldLen - len(field) - len(st.outbox[0]); rest != 0 && rest < 7 {
			break
		}
		field = append(field, st.outbox[0]...)
		st.outbox = st.outbox[1:]
	}
	// Fill the fixed-length frame with an idle packet (CCSDS idle APID).
	if rest := fieldLen - len(field); rest >= 7 {
		idle := &ccsds.SpacePacket{APID: idleAPID, SeqFlags: 3, Data: bytes.Repeat([]byte{0x55}, rest-6)}
		field = append(field, idle.Marshal()...)
	} else if rest != 0 {
		return nil, fmt.Errorf("simulator: packet (%d B) cannot be padded to a %d B frame", len(field), s.cfg.FrameLength)
	}

	clcw := &ccsds.CLCW{CopInEffect: 1, VirtualChannelID: s.cfg.TCVCID, ReportValue: st.vr, Retransmit: st.retransmit, Lockout: st.lockout}
	raw := clcw.Marshal()
	word := uint32(raw[0])<<24 | uint32(raw[1])<<16 | uint32(raw[2])<<8 | uint32(raw[3])

	st.vcfc++
	frame := &ccsds.TransferFrame{
		TransferFrameVersion:    0,
		SpacecraftID:            st.sat.SCID,
		VirtualChannelID:        s.cfg.VCID,
		OperationalControlField: true,
		VirtualChannelFC:        st.vcfc,
		FirstHeaderPointer:      0,
		DataField:               field,
		OCF:                     &word,
	}
	return frame.Marshal(true, true), nil
}

func epochOf(ps *xtce.ParameterSet) time.Time {
	if t, err := time.Parse(time.RFC3339, ps.TimeEpoch); err == nil {
		return t
	}
	return time.Unix(0, 0)
}

// RunStream emits every satellite's telemetry to w until ctx is done. Each
// satellite sends its subsystem packets evenly spread across the cycle, and
// satellites are staggered so the downlink is smooth rather than bursty.
func (s *Simulator) RunStream(ctx context.Context, w io.Writer) error {
	errc := make(chan error, len(s.ids))
	var wg sync.WaitGroup
	for i, id := range s.ids {
		wg.Add(1)
		go func(i int, id string) {
			defer wg.Done()
			if err := s.runSatellite(ctx, w, id, i); err != nil {
				errc <- err
			}
		}(i, id)
	}

	done := make(chan struct{})
	go func() { wg.Wait(); close(done) }()
	select {
	case <-ctx.Done():
		<-done
		return ctx.Err()
	case err := <-errc:
		<-done
		return err
	}
}

func (s *Simulator) runSatellite(ctx context.Context, w io.Writer, id string, index int) error {
	st := s.sats[id]
	interval := s.cfg.Cycle / time.Duration(len(s.sets))

	select { // stagger start
	case <-ctx.Done():
		return ctx.Err()
	case <-time.After(time.Duration(index) * interval / time.Duration(len(s.ids)+1)):
	}

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	last := s.cfg.Now()
	for n := 0; ; n++ {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
		}
		now := s.cfg.Now()
		st.step(s.cfg.Model, now, now.Sub(last).Seconds()*s.cfg.TimeScale)
		last = now

		frame, err := s.BuildFrame(id, n)
		if err != nil {
			return err
		}
		s.mu.Lock()
		_, err = w.Write(frame)
		s.mu.Unlock()
		if err != nil {
			return err
		}
	}
}

// Start connects to the Link Gateway and streams until ctx is done,
// reconnecting if the link drops (frames sent during an outage are lost,
// exactly like a real station going away — the ground segment must cope).
func (s *Simulator) Start(ctx context.Context) error {
	fmt.Printf("[Simulator] %d satellites -> Link Gateway %s (frame %d B)\n", len(s.ids), s.cfg.TargetTCP, s.cfg.FrameLength)
	for {
		conn, err := (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "tcp", s.cfg.TargetTCP)
		if err != nil {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(time.Second):
				continue
			}
		}
		fmt.Printf("[Simulator] Connected to Link Gateway at %s\n", s.cfg.TargetTCP)
		err = s.RunStream(ctx, s.link.Wrap(conn))
		_ = conn.Close()
		if ctx.Err() != nil {
			return ctx.Err()
		}
		fmt.Printf("[Simulator] Link lost (%v), reconnecting...\n", err)
	}
}

// ---- encoding ----

func polyCoeffs(p *xtce.Parameter) (c0, c1 float64) {
	c0, c1 = 0, 1
	if p.CalibType != "POLYNOMIAL" {
		return
	}
	if arr, ok := p.CalibData.([]any); ok && len(arr) >= 2 {
		if a, ok := arr[0].(float64); ok {
			c0 = a
		}
		if b, ok := arr[1].(float64); ok {
			c1 = b
		}
	}
	return
}

// encodeSet writes the on-board time header and every parameter of one APID
// into a packet data field, the exact inverse of xtce decommutation.
func encodeSet(ps *xtce.ParameterSet, vals map[string]float64, obtTicks uint64) []byte {
	endBit := 0
	for _, p := range ps.Parameters {
		if e := p.BitOffset + p.BitLength; e > endBit {
			endBit = e
		}
	}
	data := make([]byte, (endBit+7)/8)

	for i := 0; i < ps.TimeHeaderBytes; i++ {
		data[i] = byte(obtTicks >> (8 * uint(ps.TimeHeaderBytes-1-i)))
	}

	for _, p := range ps.Parameters {
		eu := vals[p.Name]
		var raw uint64
		switch p.DataType {
		case "INT":
			c0, c1 := polyCoeffs(p)
			r := int64(math.Round((eu - c0) / c1))
			lim := int64(1)<<(uint(p.BitLength)-1) - 1
			if r > lim {
				r = lim
			} else if r < -lim-1 {
				r = -lim - 1
			}
			raw = uint64(r) & (1<<uint(p.BitLength) - 1)
		default: // UINT / BOOL with no calibration
			r := math.Round(eu)
			if r < 0 {
				r = 0
			}
			if max := float64(uint64(1)<<uint(p.BitLength) - 1); r > max {
				r = max
			}
			raw = uint64(r)
		}
		nbytes := p.BitLength / 8
		for b := 0; b < nbytes; b++ {
			data[p.BitOffset/8+b] = byte(raw >> (8 * uint(nbytes-1-b)))
		}
	}
	return data
}
