package cop1

import (
	"errors"
	"fmt"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
)

// FOPState represents the four formal COP-1 FOP-1 states
type FOPState uint8

const (
	StateActive     FOPState = 1 // S1: Active
	StateRetransmit FOPState = 2 // S2: Retransmit
	StateWait       FOPState = 3 // S3: Wait
	StateInitial    FOPState = 4 // S4: Initial
)

func (s FOPState) String() string {
	switch s {
	case StateActive:
		return "S1_ACTIVE"
	case StateRetransmit:
		return "S2_RETRANSMIT"
	case StateWait:
		return "S3_WAIT"
	case StateInitial:
		return "S4_INITIAL"
	default:
		return "UNKNOWN"
	}
}

var (
	ErrWindowFull     = errors.New("COP-1 transmission window full")
	ErrLockout        = errors.New("spacecraft entered lockout")
	ErrFOPNotActive   = errors.New("COP-1 FOP-1 is not in active state")
	ErrMaxRetriesDone = errors.New("maximum retransmission limit exceeded")
)

// PendingFrame stores an unacknowledged TC transfer frame in flight
type PendingFrame struct {
	SeqNumber uint8
	Frame     *ccsds.TCTransferFrame
	SentAt    time.Time
}

// Config holds configuration parameters for COP-1
type Config struct {
	SCID           uint16
	WindowSize     int           // K window size (default 10)
	MaxRetransmits int           // Max retry count before link failure (default 3)
	InitialT1      time.Duration // Initial timeout (e.g. 3s)
	MaxT1          time.Duration // Max adaptive timeout (e.g. 10s)
}

// FOP1 implements the CCSDS 232.1-B-2 Frame Operations Procedure-1 State Machine
type FOP1 struct {
	mu            sync.RWMutex
	cfg           Config
	state         FOPState
	vs            uint8 // V(S): transmitter frame sequence counter
	vr            uint8 // V(R): receiver's expected counter reported in CLCW
	retransCount  int
	t1Timer       time.Duration
	rttSamples    []time.Duration
	window        map[uint8]*PendingFrame
	inFlightOrder []uint8
	onAcknowledge func(seq uint8)
	onLinkFailure func(scid uint16, reason string)

	pendingFailure string      // link failure to report once the lock is released
	ackedSentAt    []time.Time // send times of frames acknowledged by the last CLCW (RTT)
}

// NewFOP1 constructs an active FOP-1 state machine
func NewFOP1(cfg Config, onAck func(seq uint8), onLinkFailure func(scid uint16, reason string)) *FOP1 {
	if cfg.WindowSize <= 0 {
		cfg.WindowSize = 10
	}
	if cfg.MaxRetransmits <= 0 {
		cfg.MaxRetransmits = 3
	}
	if cfg.InitialT1 <= 0 {
		cfg.InitialT1 = 3 * time.Second
	}
	if cfg.MaxT1 <= 0 {
		cfg.MaxT1 = 10 * time.Second
	}

	return &FOP1{
		cfg:           cfg,
		state:         StateActive,
		vs:            0,
		vr:            0,
		t1Timer:       cfg.InitialT1,
		window:        make(map[uint8]*PendingFrame),
		inFlightOrder: make([]uint8, 0),
		onAcknowledge: onAck,
		onLinkFailure: onLinkFailure,
	}
}

// State returns current FOP-1 state
func (f *FOP1) State() FOPState {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.state
}

// VS returns the current transmitter sequence counter V(S)
func (f *FOP1) VS() uint8 {
	f.mu.RLock()
	defer f.mu.RUnlock()
	return f.vs
}

// SendAD creates and queues an AD (Acceptance Directed) frame under COP-1 sequence control
func (f *FOP1) SendAD(vcid uint8, payload []byte) (*ccsds.TCTransferFrame, error) {
	f.mu.Lock()
	defer f.mu.Unlock()

	if f.state != StateActive {
		return nil, fmt.Errorf("%w (current state: %s)", ErrFOPNotActive, f.state)
	}

	if len(f.window) >= f.cfg.WindowSize {
		return nil, ErrWindowFull
	}

	seq := f.vs
	f.vs = (f.vs + 1) & 0xFF

	frame := &ccsds.TCTransferFrame{
		TransferFrameVersion: 0,
		BypassFlag:           false, // Type-AD
		ControlCommandFlag:   false,
		SpacecraftID:         f.cfg.SCID,
		VirtualChannelID:     vcid,
		SeqNumber:            seq,
		Data:                 payload,
	}

	pf := &PendingFrame{
		SeqNumber: seq,
		Frame:     frame,
		SentAt:    time.Now(),
	}
	f.window[seq] = pf
	f.inFlightOrder = append(f.inFlightOrder, seq)

	return frame, nil
}

// SendBC creates a BC (Bypass / Expedited) frame that bypasses COP-1 sequence counter check
func (f *FOP1) SendBC(vcid uint8, payload []byte) *ccsds.TCTransferFrame {
	f.mu.Lock()
	defer f.mu.Unlock()

	return &ccsds.TCTransferFrame{
		TransferFrameVersion: 0,
		BypassFlag:           true, // Type-BC
		ControlCommandFlag:   false,
		SpacecraftID:         f.cfg.SCID,
		VirtualChannelID:     vcid,
		SeqNumber:            0,
		Data:                 payload,
	}
}

// ProcessCLCW processes an incoming CLCW report from the spacecraft downlink.
// Acknowledgement callbacks run after the FOP lock is released, so a callback
// may call back into its owner without a lock-order inversion.
func (f *FOP1) ProcessCLCW(clcw *ccsds.CLCW) ([]*ccsds.TCTransferFrame, error) {
	f.mu.Lock()
	resend, acked, err := f.processCLCWLocked(clcw)
	failure := f.pendingFailure
	f.pendingFailure = ""
	f.mu.Unlock()
	if f.onAcknowledge != nil {
		for _, seq := range acked {
			f.onAcknowledge(seq)
		}
	}
	if failure != "" && f.onLinkFailure != nil {
		f.onLinkFailure(f.cfg.SCID, failure)
	}
	return resend, err
}

func (f *FOP1) processCLCWLocked(clcw *ccsds.CLCW) ([]*ccsds.TCTransferFrame, []uint8, error) {
	// 1. Check Lockout
	if clcw.Lockout {
		if f.state != StateInitial {
			f.pendingFailure = "Spacecraft entered LOCKOUT"
		}
		f.state = StateInitial
		return nil, nil, ErrLockout
	}

	// 2. Check Wait Flag
	if clcw.Wait {
		f.state = StateWait
		return nil, nil, nil
	} else if f.state == StateWait {
		f.state = StateActive
	}

	// 3. Acknowledge frames up to V(R)
	acked := f.acknowledgeUpTo(clcw.ReportValue)

	// Update RTT and adaptive T1 from the frames just acknowledged
	now := time.Now()
	for _, sent := range f.ackedSentAt {
		if rtt := now.Sub(sent); rtt > 0 {
			f.updateRTT(rtt)
		}
	}
	f.ackedSentAt = f.ackedSentAt[:0]

	// 4. Check Retransmit Flag (only meaningful while frames are outstanding)
	if clcw.Retransmit && len(f.window) > 0 && f.state != StateRetransmit {
		f.state = StateRetransmit
		resend, err := f.prepareRetransmission()
		return resend, acked, err
	}

	if len(f.window) == 0 {
		f.state = StateActive
		f.retransCount = 0
	} else if len(acked) > 0 && f.state == StateRetransmit {
		f.state = StateActive // progress made after a retransmission
		f.retransCount = 0
	}
	return nil, acked, nil
}

// acknowledgeUpTo removes acknowledged frames up to vr (modulo 256) and
// returns their sequence numbers.
func (f *FOP1) acknowledgeUpTo(vr uint8) []uint8 {
	f.vr = vr
	var acked []uint8
	newOrder := make([]uint8, 0, len(f.inFlightOrder))
	for _, seq := range f.inFlightOrder {
		if isAcknowledged(seq, vr) {
			if pf, ok := f.window[seq]; ok {
				f.ackedSentAt = append(f.ackedSentAt, pf.SentAt)
			}
			delete(f.window, seq)
			acked = append(acked, seq)
		} else {
			newOrder = append(newOrder, seq)
		}
	}
	f.inFlightOrder = newOrder
	return acked
}

func isAcknowledged(seq uint8, vr uint8) bool {
	dist := (int(vr) - int(seq)) & 0xFF
	return dist > 0 && dist < 128
}

// prepareRetransmission gathers unacknowledged frames to retransmit
func (f *FOP1) prepareRetransmission() ([]*ccsds.TCTransferFrame, error) {
	if f.retransCount >= f.cfg.MaxRetransmits {
		f.state = StateWait
		f.pendingFailure = "Max retransmits exceeded"
		return nil, ErrMaxRetriesDone
	}

	f.retransCount++
	resend := make([]*ccsds.TCTransferFrame, 0, len(f.inFlightOrder))
	now := time.Now()
	for _, seq := range f.inFlightOrder {
		if pf, ok := f.window[seq]; ok {
			pf.SentAt = now
			resend = append(resend, pf.Frame)
		}
	}
	return resend, nil
}

// updateRTT updates the adaptive T1 timer: 2 * RTT + 500ms
func (f *FOP1) updateRTT(rtt time.Duration) {
	f.rttSamples = append(f.rttSamples, rtt)
	if len(f.rttSamples) > 10 {
		f.rttSamples = f.rttSamples[1:]
	}

	var sum time.Duration
	for _, s := range f.rttSamples {
		sum += s
	}
	avgRTT := sum / time.Duration(len(f.rttSamples))

	newT1 := 2*avgRTT + 500*time.Millisecond
	if newT1 > f.cfg.MaxT1 {
		newT1 = f.cfg.MaxT1
	}
	if newT1 < 500*time.Millisecond {
		newT1 = 500 * time.Millisecond
	}
	f.t1Timer = newT1
}

// HandleTimeout fires when adaptive timer T1 expires: the outstanding window is
// retransmitted, or the link is declared failed once MaxRetransmits is spent.
func (f *FOP1) HandleTimeout() ([]*ccsds.TCTransferFrame, error) {
	f.mu.Lock()
	var resend []*ccsds.TCTransferFrame
	var err error
	if len(f.window) > 0 {
		f.state = StateRetransmit
		resend, err = f.prepareRetransmission()
	}
	failure := f.pendingFailure
	f.pendingFailure = ""
	f.mu.Unlock()
	if failure != "" && f.onLinkFailure != nil {
		f.onLinkFailure(f.cfg.SCID, failure)
	}
	return resend, err
}

// Overdue reports whether the oldest outstanding frame has waited longer than T1.
func (f *FOP1) Overdue(now time.Time) bool {
	f.mu.RLock()
	defer f.mu.RUnlock()
	for _, pf := range f.window {
		if now.Sub(pf.SentAt) > f.t1Timer {
			return true
		}
	}
	return false
}

// Abort gives up on every outstanding frame (after a link failure) and returns
// their sequence numbers; the FOP is Active again from V(S).
func (f *FOP1) Abort() []uint8 {
	f.mu.Lock()
	defer f.mu.Unlock()
	seqs := append([]uint8(nil), f.inFlightOrder...)
	f.window = map[uint8]*PendingFrame{}
	f.inFlightOrder = nil
	f.retransCount = 0
	f.state = StateActive
	return seqs
}

// SetVRFrame builds the Type-BC control command "Set V(R)" (CCSDS 232.0
// §4.1.3.3.3: 0x82 0x00 N) that aligns the spacecraft's FARM to V(S), used
// after an abort or a lockout so the next AD frame is accepted.
func (f *FOP1) SetVRFrame(vcid uint8) *ccsds.TCTransferFrame {
	f.mu.RLock()
	vs := f.vs
	f.mu.RUnlock()
	return &ccsds.TCTransferFrame{BypassFlag: true, ControlCommandFlag: true, SpacecraftID: f.cfg.SCID, VirtualChannelID: vcid, Data: []byte{0x82, 0x00, vs}}
}

// UnlockFrame builds the Type-BC control command "Unlock" (0x00).
func (f *FOP1) UnlockFrame(vcid uint8) *ccsds.TCTransferFrame {
	return &ccsds.TCTransferFrame{BypassFlag: true, ControlCommandFlag: true, SpacecraftID: f.cfg.SCID, VirtualChannelID: vcid, Data: []byte{0x00}}
}

// Resume returns the FOP to Active after lockout recovery.
func (f *FOP1) Resume() {
	f.mu.Lock()
	f.state = StateActive
	f.retransCount = 0
	f.mu.Unlock()
}
