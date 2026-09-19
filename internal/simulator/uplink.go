package simulator

import (
	"context"
	"encoding/json"
	"fmt"
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

func (u *Uplink) Transmit(ctx context.Context, frame []byte) error {
	tc, err := ccsds.ParseTCFrame(frame)
	if err != nil {
		return fmt.Errorf("spacecraft: bad TC frame: %w", err)
	}
	satID := u.sim.satIDOf(tc.SpacecraftID)
	if satID == "" {
		return fmt.Errorf("spacecraft: frame for unknown SCID %d", tc.SpacecraftID)
	}

	// FARM-1 (Type-AD only; Type-BC bypass frames skip sequence control).
	if !tc.BypassFlag && !u.sim.AcceptTCFrame(tc.SpacecraftID, tc.SeqNumber) {
		return nil // out of sequence or duplicate: the CLCW tells the ground
	}

	sp, err := ccsds.ParseSpacePacket(tc.Data)
	if err != nil {
		u.sim.record(satID, ExecutedCommand{Result: "REJECTED: malformed TC packet"})
		return nil
	}

	rec := ExecutedCommand{SatID: satID, APID: sp.APID, Seq: sp.SeqCount, At: u.sim.cfg.Now()}
	key := []byte(nil)
	if u.sim.cfg.UplinkKey != nil {
		key = u.sim.cfg.UplinkKey(tc.SpacecraftID)
	}
	if key == nil {
		rec.Result = "REJECTED: no uplink key"
		u.sim.record(satID, rec)
		return nil
	}
	plain, err := command.OpenTCPayload(key, tc.SpacecraftID, sp.APID, sp.SeqCount, sp.Data)
	if err != nil {
		rec.Result = "REJECTED: authentication failed"
		u.sim.record(satID, rec)
		return nil
	}
	if json.Unmarshal(plain, &rec.Params) != nil {
		rec.Result = "REJECTED: undecodable parameters"
		u.sim.record(satID, rec)
		return nil
	}

	rec.Result = "EXECUTED"
	if err := u.sim.execute(satID, sp.APID, rec.Params); err != nil {
		rec.Result = "REJECTED: " + err.Error()
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
