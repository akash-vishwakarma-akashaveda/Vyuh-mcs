package verify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"
)

// statusLog collects every command status the console would see.
type statusLog struct{ ws *wsClient }

func (l statusLog) of(id string) []string {
	var out []string
	for _, f := range l.ws.frames("STATUS") {
		st, _ := f["status"].(map[string]any)
		if st != nil && st["command_id"] == id {
			if s, ok := st["status"].(string); ok {
				out = append(out, s)
			}
		}
	}
	return out
}

func (l statusLog) last(id string) string {
	s := l.of(id)
	if len(s) == 0 {
		return ""
	}
	return s[len(s)-1]
}

func (l statusLog) wait(id, want string, d time.Duration) bool {
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		if l.last(id) == want {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

// done reports whether the command reached target or a later successful status.
func (l statusLog) done(id, target string, d time.Duration) bool {
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		last := l.last(id)
		if last == target || (success[last] && rank[last] >= rank[target]) {
			return true
		}
		time.Sleep(50 * time.Millisecond)
	}
	return false
}

var success = map[string]bool{"ACKNOWLEDGED": true, "ACCEPTED": true, "COMPLETED": true}

func submit(h http.Handler, body map[string]any) (string, int) {
	b, _ := json.Marshal(body)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/commands", bytes.NewReader(b))
	req.Header.Set("X-Operator-ID", "verify:operator")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	var out map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &out)
	id, _ := out["commandId"].(string)
	return id, rec.Code
}

var rank = map[string]int{"PENDING": 0, "QUEUED": 1, "SENT": 2, "ACKNOWLEDGED": 3, "ACCEPTED": 4, "COMPLETED": 5, "EXECUTION_FAILED": 5, "FAILED": 5, "CANCELLED": 5}

func regressions(seq []string) int {
	n := 0
	for i := 1; i < len(seq); i++ {
		if rank[seq[i]] < rank[seq[i-1]] {
			n++
		}
	}
	return n
}

func runUplink(ctx context.Context, dataPath string) ([]*Scenario, error) {
	e, err := boot(ctx, dataPath, true)
	if err != nil {
		return nil, err
	}
	defer e.close()
	ws, err := dialWS(e.wsURL)
	if err != nil {
		return nil, err
	}
	defer ws.close()
	time.Sleep(300 * time.Millisecond)
	ws.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "st", "kind": "STATUS", "scope": []string{"*"}})
	time.Sleep(1500 * time.Millisecond) // CLCW flowing from the simulated fleet
	log := statusLog{ws}
	gw := e.st.CmdGW.Routes()
	var out []*Scenario

	// U01: routine command, end to end.
	{
		sc := &Scenario{ID: "U01", Group: "Uplink", Title: "Routine command, console to spacecraft and back", Setup: "HK_RATE_SET RATE_HZ=2 to AKV-03"}
		t0 := time.Now()
		id, code := submit(gw, map[string]any{"scid": 3, "apid": 0x011, "priority": "NORMAL", "params": map[string]any{"RATE_HZ": 2}})
		sc.add(eq("command-gw", "Accepted by the gateway", 202, int64(code), ""))
		ok := log.done(id, "ACKNOWLEDGED", 10*time.Second)
		sc.add(boolCheck("uplink", "Acknowledged by the spacecraft (CLCW)", ok, "ACKNOWLEDGED or later", log.last(id), ""))
		sc.add(info("uplink", "Time to acknowledgement", fmt.Sprintf("%.0f ms", float64(time.Since(t0).Milliseconds())), "includes waiting for the next downlink frame's CLCW"))
		executed := len(e.st.Sim.Executed("AKV-03")) > 0
		sc.add(boolCheck("spacecraft", "Authenticated, decrypted and executed on board", executed, "executed", fmt.Sprint(executed), ""))
		done := log.wait(id, "COMPLETED", 10*time.Second)
		seq := log.of(id)
		sc.add(boolCheck("browser", "Console saw the statuses in lifecycle order, never backwards", regressions(seq) == 0 && len(seq) >= 4 && seq[0] == "PENDING", "PENDING → … → SENT → (ACKNOWLEDGED) → ACCEPTED → COMPLETED", fmt.Sprint(seq), "CLCW acknowledgement and PUS-1 acceptance share a frame and may arrive in either order"))
		sc.add(boolCheck("verification", "Spacecraft reported acceptance and completion (PUS-1)", done && contains(seq, "ACCEPTED"), "ACCEPTED (TM 1,1) then COMPLETED (TM 1,7)", fmt.Sprint(seq), "matched to the command by its TC packet request ID"))
		sc.add(info("verification", "Time to completion report", fmt.Sprintf("%.0f ms", float64(time.Since(t0).Milliseconds())), ""))
		sc.finish()
		out = append(out, sc)
	}

	// U09: accepted on board but the spacecraft cannot do it.
	{
		sc := &Scenario{ID: "U09", Group: "Uplink", Title: "Command the spacecraft accepts but cannot perform", Setup: "HTR_SWITCH HEATER=C (no such heater) to AKV-02"}
		id, _ := submit(gw, map[string]any{"scid": 2, "apid": 0x021, "params": map[string]any{"HEATER": "C", "STATE": "ON"}})
		ok := log.wait(id, "EXECUTION_FAILED", 10*time.Second)
		rec, _ := e.st.CmdGW.GetRecord(id)
		reason := ""
		if rec != nil {
			reason = rec.RejectionReason
		}
		sc.add(boolCheck("verification", "Execution failure reported by the spacecraft (TM 1,8)", ok, "EXECUTION_FAILED with the on-board reason", fmt.Sprintf("%s · %s", log.last(id), reason), "not marked done just because the frame was acknowledged"))
		sc.finish()
		out = append(out, sc)
	}

	// U02: safety chain.
	{
		sc := &Scenario{ID: "U02", Group: "Uplink", Title: "Out-of-range command stopped before uplink", Setup: "SET_HTR_SETPOINT SETPOINT=99 (range 5-25)"}
		before := len(e.st.Sim.Executed("AKV-05"))
		id, _ := submit(gw, map[string]any{"scid": 5, "apid": 0x021, "params": map[string]any{"HEATER": "B", "SETPOINT": 99}})
		ok := log.wait(id, "FAILED", 5*time.Second)
		sc.add(boolCheck("upe", "Rejected by the L1 range check", ok, "FAILED", log.last(id), ""))
		sc.add(eq("spacecraft", "Never reached the spacecraft", int64(before), int64(len(e.st.Sim.Executed("AKV-05"))), ""))
		sc.finish()
		out = append(out, sc)
	}

	// U03: validation at the gateway.
	{
		sc := &Scenario{ID: "U03", Group: "Uplink", Title: "Command to a spacecraft the ground does not fly", Setup: "SCID 200"}
		id, code := submit(gw, map[string]any{"scid": 200, "apid": 0x011, "params": map[string]any{"RATE_HZ": 1}})
		time.Sleep(1500 * time.Millisecond)
		sc.add(boolCheck("command-gw", "Refused at submission", code >= 400, "4xx", fmt.Sprintf("%d, then %q", code, log.last(id)), "an unknown SCID should never be accepted"))
		sc.finish()
		out = append(out, sc)
	}

	// U04: a lost telecommand frame with nothing after it — only the T1 timer recovers this.
	{
		sc := &Scenario{ID: "U04", Group: "Uplink", Title: "Lost telecommand frame, no later traffic", Setup: "forward link loses the next TC frame"}
		e.st.Sim.DropNextTC(1)
		id, _ := submit(gw, map[string]any{"scid": 4, "apid": 0x011, "params": map[string]any{"RATE_HZ": 1}})
		ok := log.done(id, "ACKNOWLEDGED", 12*time.Second)
		sc.add(boolCheck("cop1", "Retransmitted by COP-1 (T1 timer) and acknowledged", ok, "ACKNOWLEDGED within 12 s", log.last(id), "FOP-1 must retransmit on T1 expiry"))
		sc.finish()
		out = append(out, sc)
	}

	// U05: lost frame followed by another command — FARM asks for retransmission.
	{
		sc := &Scenario{ID: "U05", Group: "Uplink", Title: "Lost telecommand frame, next command arrives", Setup: "first TC frame lost, second sent 300 ms later"}
		e.st.Sim.DropNextTC(1)
		a, _ := submit(gw, map[string]any{"scid": 6, "apid": 0x011, "params": map[string]any{"RATE_HZ": 1}})
		time.Sleep(300 * time.Millisecond)
		b, _ := submit(gw, map[string]any{"scid": 6, "apid": 0x011, "params": map[string]any{"RATE_HZ": 3}})
		okA := log.done(a, "ACKNOWLEDGED", 10*time.Second)
		okB := log.done(b, "ACKNOWLEDGED", 5*time.Second)
		sc.add(boolCheck("cop1", "Both acknowledged after retransmission", okA && okB, "both ACKNOWLEDGED", fmt.Sprintf("%s / %s", log.last(a), log.last(b)), "CLCW retransmit flag → FOP resends the window"))
		sc.finish()
		out = append(out, sc)
	}

	// U06: a burst of commands.
	{
		sc := &Scenario{ID: "U06", Group: "Uplink", Title: "Burst of 20 commands to one spacecraft", Setup: "20 HK_RATE_SET to AKV-07 back to back (COP-1 window 10)"}
		var ids []string
		for i := 0; i < 20; i++ {
			id, _ := submit(gw, map[string]any{"scid": 7, "apid": 0x011, "params": map[string]any{"RATE_HZ": 1 + i%5}})
			ids = append(ids, id)
		}
		deadline := time.Now().Add(20 * time.Second)
		acked, regress := 0, 0
		for time.Now().Before(deadline) {
			acked = 0
			for _, id := range ids {
				if success[log.last(id)] {
					acked++
				}
			}
			if acked == len(ids) {
				break
			}
			time.Sleep(200 * time.Millisecond)
		}
		stuck := map[string]int{}
		for _, id := range ids {
			regress += regressions(log.of(id))
			if l := log.last(id); !success[l] {
				stuck[l]++
			}
		}
		sc.add(eq("uplink", "All 20 acknowledged", 20, int64(acked), fmt.Sprintf("not acknowledged, by last status: %v", stuck)))
		sc.add(eq("browser", "No status went backwards on the console", 0, int64(regress), "QUEUED arriving after SENT"))
		sc.finish()
		out = append(out, sc)
	}

	// U07: cancel.
	{
		sc := &Scenario{ID: "U07", Group: "Uplink", Title: "Cancel a command just after submission", Setup: "submit to AKV-08 then cancel immediately"}
		before := len(e.st.Sim.Executed("AKV-08"))
		id, _ := submit(gw, map[string]any{"scid": 8, "apid": 0x011, "params": map[string]any{"RATE_HZ": 4}})
		req := httptest.NewRequest(http.MethodPost, "/api/v1/commands/"+id+"/cancel", nil)
		rec := httptest.NewRecorder()
		gw.ServeHTTP(rec, req)
		time.Sleep(3 * time.Second)
		executed := len(e.st.Sim.Executed("AKV-08")) - before
		cmdRec, _ := e.st.CmdGW.GetRecord(id)
		status, reason := "", ""
		if cmdRec != nil {
			status, reason = string(cmdRec.Status), cmdRec.RejectionReason
		}
		consistent := (executed == 0 && status == "CANCELLED") || (executed == 1 && strings.Contains(reason, "radiated"))
		sc.add(boolCheck("uplink", "Cancel outcome is consistent", consistent, "withdrawn before uplink, or reported as too late (already radiated)", fmt.Sprintf("cancel HTTP %d · executed %d · status %s · %s", rec.Code, executed, status, reason), ""))
		// A cancel that has time to act: a command queued behind a full window.
		e.st.Sim.Link().Stall(3 * time.Second)
		time.Sleep(100 * time.Millisecond)
		var queued []string
		for i := 0; i < 12; i++ {
			qid, _ := submit(gw, map[string]any{"scid": 10, "apid": 0x011, "params": map[string]any{"RATE_HZ": 1}})
			queued = append(queued, qid)
		}
		time.Sleep(300 * time.Millisecond)
		last := queued[len(queued)-1]
		creq := httptest.NewRequest(http.MethodPost, "/api/v1/commands/"+last+"/cancel", nil)
		gw.ServeHTTP(httptest.NewRecorder(), creq)
		ok := log.wait(last, "CANCELLED", 3*time.Second)
		sc.add(boolCheck("uplink", "A command still queued is withdrawn", ok, "CANCELLED", log.last(last), "queued behind a full COP-1 window while the downlink was stalled"))
		sc.finish()
		out = append(out, sc)
	}

	// U08: window full while the downlink (and so the CLCW) is interrupted.
	{
		sc := &Scenario{ID: "U08", Group: "Uplink", Title: "Commands while the downlink is interrupted", Setup: "downlink stalled 4 s, 12 commands to AKV-09 meanwhile (window 10)"}
		e.st.Sim.Link().Stall(4 * time.Second)
		time.Sleep(100 * time.Millisecond)
		var ids []string
		for i := 0; i < 12; i++ {
			id, _ := submit(gw, map[string]any{"scid": 9, "apid": 0x011, "params": map[string]any{"RATE_HZ": 2}})
			ids = append(ids, id)
		}
		time.Sleep(12 * time.Second)
		states := map[string]int{}
		okN := 0
		for _, id := range ids {
			states[log.last(id)]++
			if success[log.last(id)] {
				okN++
			}
		}
		sc.add(eq("cop1", "All 12 acknowledged once the downlink returns", 12, int64(okN), fmt.Sprintf("final statuses %v", states)))
		sc.finish()
		out = append(out, sc)
	}
	return out, nil
}

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}
