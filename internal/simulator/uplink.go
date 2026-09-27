package simulator

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"strings"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/command"
)

// ExecutedCommand is one telecommand the spacecraft received, and what it did.
type ExecutedCommand struct {
	SatID  string         `json:"sat_id"`
	APID   uint16         `json:"apid"`
	Seq    uint16         `json:"seq"`
	Params map[string]any `json:"params"`
	At     time.Time      `json:"at"`
	Result string         `json:"result"` // EXECUTED | REJECTED: <why>
}

// Uplink is the spacecraft's command receiver. It implements the uplink
// engine's transmit driver, so in the demo the forward link is an ideal
// channel straight into the spacecraft (no CLTU stream through the Link
// Gateway yet). It verifies the TC transfer frame, runs COP-1's FARM-1,
// authenticates and decrypts the TC packet with the satellite's uplink key,
// and executes the command — visible afterwards only through telemetry and
// the CLCW, exactly as on a real mission.
type Uplink struct{ sim *Simulator }

func (s *Simulator) Uplink() *Uplink { return &Uplink{sim: s} }

// DropNextTC makes the forward link lose the next n telecommand frames (a
// fade during the uplink), for exercising COP-1 retransmission.
func (s *Simulator) DropNextTC(n int) {
	s.mu.Lock()
	s.tcDrops += n
	s.mu.Unlock()
}

func (u *Uplink) Transmit(ctx context.Context, frame []byte) error {
	u.sim.mu.Lock()
	lost := u.sim.tcDrops > 0
	if lost {
		u.sim.tcDrops--
	}
	u.sim.mu.Unlock()
	pipeline.Inc("uplink.tc_frames", 1)
	if lost {
		pipeline.Inc("uplink.tc_frames_lost", 1)
		return nil // radiated, never received on board
	}
	tc, err := ccsds.ParseTCFrame(frame)
	if err != nil {
		return fmt.Errorf("spacecraft: bad TC frame: %w", err)
	}
	satID := u.sim.satIDOf(tc.SpacecraftID)
	if satID == "" {
		return fmt.Errorf("spacecraft: frame for unknown SCID %d", tc.SpacecraftID)
	}

	// COP-1 control commands (Type-BC with the control command flag).
	if tc.BypassFlag && tc.ControlCommandFlag {
		u.sim.farmDirective(tc.SpacecraftID, tc.Data)
		return nil
	}

	// FARM-1 (Type-AD only; Type-BC bypass frames skip sequence control).
	if !tc.BypassFlag && !u.sim.AcceptTCFrame(tc.SpacecraftID, tc.SeqNumber) {
		return nil // out of sequence or duplicate: the CLCW tells the ground
	}

	sp, err := ccsds.ParseSpacePacket(tc.Data)
	if err != nil {
		u.sim.record(satID, ExecutedCommand{Result: "REJECTED: malformed TC packet"})
		return nil // no request ID to report against
	}
	report := func(subtype uint8, code uint16) { u.sim.reportVerification(satID, subtype, sp.APID, sp.SeqCount, code) }

	rec := ExecutedCommand{SatID: satID, APID: sp.APID, Seq: sp.SeqCount, At: u.sim.cfg.Now()}
	key := []byte(nil)
	if u.sim.cfg.UplinkKey != nil {
		key = u.sim.cfg.UplinkKey(tc.SpacecraftID)
	}
	if key == nil {
		rec.Result = "REJECTED: no uplink key"
		u.sim.record(satID, rec)
		report(ccsds.PUSAcceptFailure, ccsds.FailAuthentication)
		return nil
	}
	plain, err := command.OpenTCPayload(key, tc.SpacecraftID, sp.APID, sp.SeqCount, sp.Data)
	if err != nil {
		rec.Result = "REJECTED: authentication failed"
		u.sim.record(satID, rec)
		report(ccsds.PUSAcceptFailure, ccsds.FailAuthentication)
		return nil
	}
	if json.Unmarshal(plain, &rec.Params) != nil {
		rec.Result = "REJECTED: undecodable parameters"
		u.sim.record(satID, rec)
		report(ccsds.PUSAcceptFailure, ccsds.FailParameters)
		return nil
	}

	report(ccsds.PUSAcceptSuccess, 0)
	rec.Result = "EXECUTED"
	if err := u.sim.execute(satID, sp.APID, rec.Params); err != nil {
		rec.Result = "REJECTED: " + err.Error()
		report(ccsds.PUSCompletionFailure, ccsds.FailExecution)
	} else {
		report(ccsds.PUSCompletionSuccess, 0)
	}
	u.sim.record(satID, rec)
	return nil
}

func (s *Simulator) satIDOf(scid uint16) string {
	for _, sat := range s.cfg.Satellites {
		if sat.SCID == scid {
			return sat.SatID
		}
	}
	return ""
}

func (s *Simulator) record(satID string, rec ExecutedCommand) {
	st, ok := s.sats[satID]
	if !ok {
		return
	}
	rec.SatID = satID
	st.mu.Lock()
	st.executed = append(st.executed, rec)
	st.mu.Unlock()
}

// Executed returns the telecommands a satellite has received, oldest first.
func (s *Simulator) Executed(satID string) []ExecutedCommand {
	st, ok := s.sats[satID]
	if !ok {
		return nil
	}
	st.mu.Lock()
	defer st.mu.Unlock()
	return append([]ExecutedCommand(nil), st.executed...)
}

// Spacecraft command dictionary: APID -> behaviour. Only heater switching has
// a physical effect on the modelled dynamics; the rest are accepted and
// logged (a real spacecraft would act on them, our twin has nothing to move).
const (
	apidSafeMode = 0x001
	apidHKRate   = 0x011
	apidHeater   = 0x021 // HTR_SWITCH and SET_HTR_SETPOINT share the thermal APID
	apidDump     = 0x033
	apidDesat    = 0x042
	apidTXPower  = 0x052
	apidImage    = 0x061
)

func (s *Simulator) execute(satID string, apid uint16, params map[string]any) error {
	switch apid {
	case apidHeater:
		if _, ok := params["SETPOINT"]; ok {
			return nil // setpoint accepted; the model's recovery target is fixed
		}
		heater, _ := params["HEATER"].(string)
		state, _ := params["STATE"].(string)
		on := strings.EqualFold(state, "ON")
		switch strings.ToUpper(heater) {
		case "B":
			if on {
				return s.Apply(satID, "HTR_B_ON")
			}
			return s.Apply(satID, "HTR_B_OFF")
		case "A":
			return s.Apply(satID, map[bool]string{true: "HTR_A_ON", false: "HTR_A_OFF"}[on])
		default:
			return fmt.Errorf("unknown heater %q", heater)
		}
	case apidSafeMode, apidHKRate, apidDump, apidDesat, apidTXPower, apidImage:
		return nil
	default:
		return fmt.Errorf("unknown APID %#x", apid)
	}
}

// farmDirective applies a COP-1 control command to the FARM: Unlock (0x00)
// or Set V(R) (0x82 0x00 N), CCSDS 232.0 §4.1.3.3.
func (s *Simulator) farmDirective(scid uint16, d []byte) {
	for _, st := range s.sats {
		if st.sat.SCID != scid {
			continue
		}
		st.mu.Lock()
		defer st.mu.Unlock()
		switch {
		case len(d) >= 1 && d[0] == 0x00:
			st.lockout = false
			pipeline.Inc("uplink.farm_unlocks", 1)
		case len(d) >= 3 && d[0] == 0x82 && d[1] == 0x00:
			st.vr = d[2]
			st.retransmit = false
			pipeline.Inc("uplink.farm_set_vr", 1)
		}
		return
	}
}

// reportVerification queues a PUS-1 report; it goes down in the satellite's
// next telemetry frame.
func (s *Simulator) reportVerification(satID string, subtype uint8, apid, seq uint16, code uint16) {
	st, ok := s.sats[satID]
	if !ok {
		return
	}
	now := s.cfg.Now()
	ticks := uint64(now.Sub(time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)).Seconds() * 65536)
	st.mu.Lock()
	defer st.mu.Unlock()
	st.pusCounter++
	data := (&ccsds.VerificationReport{Subtype: subtype, Counter: st.pusCounter, OBTTicks: ticks, RequestAPID: apid, RequestSeq: seq, FailureCode: code}).Marshal()
	st.seq[ccsds.VerificationAPID]++
	pkt := &ccsds.SpacePacket{SecHdrFlag: true, APID: ccsds.VerificationAPID, SeqFlags: 3, SeqCount: st.seq[ccsds.VerificationAPID] & 0x3FFF, Data: data}
	st.outbox = append(st.outbox, pkt.Marshal())
	pipeline.Inc("uplink.pus1_reports", 1)
}
