package verify

import (
	"context"
	"fmt"
	"math"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/simulator"
)

// dl describes one downlink scenario: which slice of the flight data, how
// fast, what the link does to it, what happens at the source mid-run, and the
// scenario-specific expectations on top of the integrity checks.
type dl struct {
	id, title, setup string
	speed            float64
	count            int
	pct              float64
	imp              simulator.Impairments
	during           func(rp *simulator.Replay)
	browser          bool
	expect           func(s *Scenario, st statsView, f *Fidelity)
}

type statsView map[string]map[string]int64

func (v statsView) g(stage, name string) int64 { return v[stage][name] }

func imp(f func(i *simulator.Impairments)) simulator.Impairments {
	i := simulator.Impairments{Enabled: true, Scope: "OPSSAT-1"}
	f(&i)
	return i
}

// cleanStages checks each stage passed exactly what the previous one produced.
func cleanStages(s *Scenario, v statsView, f *Fidelity) {
	emitted := int64(f.Emitted)
	s.add(eq("end-to-end", "Every sample delivered", emitted, int64(f.Delivered), fmt.Sprintf("%.2f%% delivered", f.DeliveryPc)))
	s.add(eq("link", "Frames received = frames sent", v.g("sim", "frames_sent"), v.g("link", "frames_published"), ""))
	s.add(eq("frame", "Frames valid = frames received", v.g("link", "frames_published"), v.g("frame", "valid"), ""))
	s.add(eq("frame", "No frame lost", 0, v.g("frame", "lost"), ""))
	s.add(eq("packet", "Packets forwarded = samples sent", emitted, v.g("packet", "forwarded"), "space packets reassembled across frames"))
	s.add(eq("packet", "No packet sequence gap", 0, v.g("packet", "seq_gap"), ""))
	s.add(eq("tm", "Packets decoded = packets forwarded", v.g("packet", "forwarded"), v.g("tm", "packets_decoded"), ""))
	s.add(eq("tm", "No decommutation error", 0, v.g("tm", "decom_error")+v.g("tm", "unknown_apid"), ""))
	s.add(eq("tm", "No uncertain timestamps", 0, v.g("tm", "samples_uncertain"), "time correlation valid"))
	s.add(eq("cvt", "CVT updated for every sample (or held back as older)", v.g("tm", "params_out"), v.g("cvt", "updates")+v.g("cvt", "older_rejected"), ""))
}

func downlinkCatalogue(slice int) []dl {
	return []dl{
		{id: "D01", title: "Clean link, as fast as possible", setup: fmt.Sprintf("%d samples, speed max, no faults", slice), speed: 0, count: slice, browser: true,
			expect: cleanStages},
		{id: "D02", title: "Clean link at 1x (real time)", setup: "300 samples at 1x", speed: 1, count: 300, pct: 40, expect: cleanStages},
		{id: "D03", title: "Clean link at 10x", setup: "2 000 samples at 10x", speed: 10, count: 2000, pct: 50, expect: cleanStages},
		{id: "D04", title: "Clean link at 100x", setup: "10 000 samples at 100x", speed: 100, count: 10000, pct: 60, expect: cleanStages},

		{id: "D10", title: "Bit errors (BER 1e-4)", setup: "BER 1e-4 on every frame", count: slice,
			imp: imp(func(i *simulator.Impairments) { i.BER = 1e-4 }),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				c, rej := v.g("sim", "frames_corrupted"), v.g("frame", "crc_error")
				s.add(boolCheck("frame", "Corrupted frames rejected by the CRC", rej >= c*95/100 && rej <= c, fmt.Sprintf("~%d (all but those whose sync marker was hit)", c), fmt.Sprint(rej), "CRC-16/CCITT FECF"))
				s.add(within("frame", "Rejected frames reported as lost (gaps)", rej, v.g("frame", "lost"), c-rej+3, "every corrupted frame leaves a counted hole in the sequence"))
				s.add(info("end-to-end", "Samples delivered", fmt.Sprintf("%.2f%%", f.DeliveryPc), "samples in rejected frames, and packets spanning them, are lost — never delivered wrong"))
			}},
		{id: "D11", title: "Random frame loss (2 %)", setup: "2 % of frames dropped", count: slice,
			imp: imp(func(i *simulator.Impairments) { i.DropPct = 2 }),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(within("frame", "Lost frames counted exactly", v.g("sim", "frames_dropped"), v.g("frame", "lost"), 2, "a frame lost at the very end of the run cannot be seen"))
				s.add(atLeast("frame", "Gap events raised", 1, v.g("frame", "gap_events"), ""))
			}},
		{id: "D12", title: "Fades (burst loss)", setup: "1 % chance of a 10-frame fade", count: slice,
			imp: imp(func(i *simulator.Impairments) { i.BurstPct = 1; i.BurstLen = 10 }),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(within("frame", "Frames lost in fades counted", v.g("sim", "frames_dropped"), v.g("frame", "lost"), 10, ""))
				s.add(info("frame", "Gaps declared by window vs timeout", fmt.Sprintf("%d events", v.g("frame", "gap_events")), "a fade longer than the reorder window is released when the window fills"))
			}},
		{id: "D13", title: "Duplicate frames (two stations)", setup: "5 % of frames delivered twice", count: slice,
			imp: imp(func(i *simulator.Impairments) { i.DupPct = 5 }),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(eq("frame", "Every duplicate dropped", v.g("sim", "duplicated"), v.g("frame", "duplicate"), "content fingerprint window"))
				s.add(eq("end-to-end", "Every sample delivered", int64(f.Emitted), int64(f.Delivered), ""))
			}},
		{id: "D14", title: "Out-of-order frames", setup: "5 % of frames delayed by 3 frames", count: slice,
			imp: imp(func(i *simulator.Impairments) { i.ReorderPct = 5; i.ReorderDepth = 3 }),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(eq("frame", "No gap declared for a late-but-in-window frame", 0, v.g("frame", "gap_events"), ""))
				s.add(within("end-to-end", "Every sample delivered", int64(f.Emitted), int64(f.Delivered), 0, ""))
				s.add(info("frame", "Frames held for reordering", fmt.Sprint(v.g("frame", "buffered")), ""))
			}},
		{id: "D15", title: "Garbage between frames (sync slip)", setup: "5 % of frames preceded by 1-40 random bytes", count: slice,
			imp: imp(func(i *simulator.Impairments) { i.GarbagePct = 5 }),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(eq("link", "Garbage bytes skipped by frame sync", v.g("sim", "garbage_bytes"), v.g("link", "sync_slip_bytes"), ""))
				s.add(eq("end-to-end", "Every sample delivered", int64(f.Emitted), int64(f.Delivered), ""))
			}},
		{id: "D16", title: "Damaged sync marker", setup: "1 % of frames with a corrupted ASM", count: slice,
			imp: imp(func(i *simulator.Impairments) { i.ASMCorruptPct = 1 }),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(within("frame", "Frames without a findable marker reported lost", v.g("sim", "asm_corrupted"), v.g("frame", "lost"), 2, ""))
			}},
		{id: "D17", title: "Truncated frames (receiver dropout)", setup: "1 % of frames cut short", count: slice,
			imp: imp(func(i *simulator.Impairments) { i.TruncatePct = 1 }),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(eq("link", "Truncated frames detected by frame sync", v.g("sim", "truncated"), v.g("link", "truncated_frames"), "CRC-checked resync on the inner marker"))
				s.add(within("frame", "Only the truncated frame is lost, not its neighbour", v.g("sim", "truncated"), v.g("frame", "lost"), 2, ""))
			}},
		{id: "D18", title: "Frames from an unknown spacecraft", setup: "2 % of frames re-addressed to SCID 999 (valid CRC)", count: slice,
			imp: imp(func(i *simulator.Impairments) { i.WrongSCIDPct = 2 }),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(eq("frame", "Foreign frames refused (SCID whitelist)", v.g("sim", "wrong_scid"), v.g("frame", "unknown_scid"), ""))
				s.add(eq("deadletter", "Each written to the dead-letter log", v.g("sim", "wrong_scid"), v.g("deadletter", "UNKNOWN_SCID"), ""))
			}},
		{id: "D20", title: "Spacecraft counter reset (reboot)", setup: "frame counters restart mid-run (2 500 samples at 250x)", speed: 250, count: 2500, pct: 10,
			during: func(rp *simulator.Replay) { time.Sleep(1500 * time.Millisecond); _ = rp.Inject("counter_reset", 0) },
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				if v.g("frame", "counter_reset") >= 1 {
					s.add(eq("frame", "Counter reset recognised", 1, v.g("frame", "counter_reset"), "the new count landed behind the old one"))
				} else {
					s.add(gap("frame", "Counter reset told apart from a fade", "recognised as a reset", fmt.Sprintf("reported as a discontinuity of %d frames", v.g("frame", "lost")),
						"a forward counter jump looks exactly like lost frames from the frame counts alone; telling them apart needs on-board time in the frame processor"))
				}
				s.add(atLeast("end-to-end", "Stream followed after the reset (>= 99 % delivered)", int64(f.Emitted)*99/100, int64(f.Delivered), "a few frames before detection can be dropped"))
			}},
		{id: "D21", title: "On-board time jump", setup: "on-board clock jumps +2 h mid-run", speed: 250, count: 2500, pct: 10,
			during: func(rp *simulator.Replay) { time.Sleep(1500 * time.Millisecond); _ = rp.Inject("time_jump", 7200) },
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(atLeast("tm", "Time jump detected per packet stream", 1, v.g("tm", "time_jump"), ""))
				s.add(eq("end-to-end", "Samples still delivered", int64(f.Emitted), int64(f.Delivered), "a time jump is flagged, not dropped"))
			}},
		{id: "D22", title: "Packets with an unknown APID", setup: "25 packets with an APID the dictionary lacks", speed: 250, count: 2500, pct: 10,
			during: func(rp *simulator.Replay) { time.Sleep(1500 * time.Millisecond); _ = rp.Inject("unknown_apid", 25) },
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(eq("tm", "Unknown APIDs refused by the decoder", 25, v.g("tm", "unknown_apid"), ""))
				s.add(atLeast("deadletter", "Written to the dead-letter log", 25, v.g("deadletter", "DECOM_FAILURE"), ""))
				s.add(eq("end-to-end", "Other samples unaffected", int64(f.Emitted), int64(f.Delivered), ""))
			}},
		{id: "D23", title: "Malformed packets", setup: "5 packets with an invalid version field, 1.2 s apart", speed: 250, count: 2500, pct: 10,
			during: func(rp *simulator.Replay) {
				for i := 0; i < 5; i++ {
					time.Sleep(1200 * time.Millisecond)
					_ = rp.Inject("bad_packet", 1)
				}
			},
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(atLeast("packet", "Malformed packet headers detected", 5, v.g("packet", "bad_header"), ""))
				s.add(info("end-to-end", "Samples lost while resynchronising", fmt.Sprint(f.Lost), "after a bad header the stream resyncs at the next first-header pointer"))
			}},
		{id: "D24", title: "Station outage (3 s stall)", setup: "downlink stops for 3 s mid-run", count: slice,
			during: func(rp *simulator.Replay) { time.Sleep(400 * time.Millisecond); _ = rp.Inject("stall", 3) },
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				s.add(eq("end-to-end", "Nothing lost across the outage", int64(f.Emitted), int64(f.Delivered), ""))
				s.add(eq("frame", "No false gap declared", 0, v.g("frame", "gap_events"), ""))
			}},
		{id: "D30", title: "A bad pass: everything at once", setup: "BER 1e-5, 1 % loss, 2 % duplicates, 2 % reordering, 1 % garbage, 0.5 % truncation", count: slice,
			imp: imp(func(i *simulator.Impairments) {
				i.BER, i.DropPct, i.DupPct, i.ReorderPct, i.ReorderDepth, i.GarbagePct, i.TruncatePct = 1e-5, 1, 2, 2, 2, 1, 0.5
			}),
			expect: func(s *Scenario, v statsView, f *Fidelity) {
				explained := v.g("sim", "frames_dropped") + v.g("frame", "crc_error") + v.g("link", "truncated_frames")
				s.add(within("frame", "Every lost frame explained (dropped + CRC-rejected + truncated)", explained, v.g("frame", "lost"), 4, "residual = frames whose sync marker was hit by a bit error"))
				s.add(within("frame", "Every duplicate that arrived was dropped", v.g("sim", "duplicated"), v.g("frame", "duplicate"), 3, "a duplicated frame that was also truncated or corrupted never reaches the processor"))
				s.add(info("end-to-end", "Samples delivered", fmt.Sprintf("%.2f%%", f.DeliveryPc), ""))
			}},
	}
}

func runDownlink(ctx context.Context, dataPath string, d dl) (*Scenario, error) {
	e, err := boot(ctx, dataPath, false)
	if err != nil {
		return nil, err
	}
	defer e.close()
	e.st.Sim.Link().SetImpairments(d.imp)

	// Every scenario has a console connected, so latency to the browser is
	// measured everywhere; the value-by-value browser checks run where asked.
	var ws *wsClient
	{
		if ws, err = dialWS(e.wsURL); err == nil {
			defer ws.close()
			time.Sleep(200 * time.Millisecond)
			ws.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "o", "kind": "PARAMS", "satellite": "OPSSAT-1"})
			ws.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "a", "kind": "ALARMS", "scope": []string{"OPSSAT-1"}})
		}
	}

	start := time.Now()
	if err := e.replay(ctx, d.pct, d.count, d.speed, d.during); err != nil {
		return nil, err
	}
	sc := &Scenario{ID: d.id, Group: "Downlink", Title: d.title, Setup: d.setup, Seconds: time.Since(start).Seconds()}
	ledger := e.st.Sim.Replay().Ledger()
	f := compare(ledger, e.decodedSamples())
	snap := pipeline.Take()
	sc.Emitted, sc.Fidelity, sc.Stats, sc.Latency = len(ledger), f, snap.Stages, snap.Latency

	for _, c := range integrityChecks(f) {
		sc.add(c)
	}
	d.expect(sc, statsView(snap.Stages), f)

	if lat, ok := snap.Latency["ert_to_ws"]; ok && d.speed != 0 {
		sc.add(boolCheck("browser", "Ground receive to browser latency p95 < 250 ms", lat.P95 < 250, "< 250 ms (production budget 100 ms)", fmt.Sprintf("p50 %.1f / p95 %.1f / p99 %.1f / max %.1f ms", lat.P50, lat.P95, lat.P99, lat.Max), ""))
	}
	if d.speed != 0 {
		sc.add(info("end-to-end", "Throughput", fmt.Sprintf("%.0f samples/s", float64(f.Emitted)/sc.Seconds), ""))
	} else {
		sc.add(info("end-to-end", "Throughput at full speed", fmt.Sprintf("%.0f samples/s, %.0f frames/s", float64(f.Emitted)/sc.Seconds, float64(snap.Stages["frame"]["valid"])/sc.Seconds), "the link is paced by TCP backpressure from the ground"))
	}
	if ws != nil && d.browser {
		browserChecks(sc, e, ws)
	}
	sc.finish()
	return sc, nil
}

// browserChecks: what a console shows must be what the spacecraft last said.
func browserChecks(sc *Scenario, e *env, ws *wsClient) {
	final := map[string]float64{}
	for _, d := range e.decodedSamples() {
		final[d.Name] = d.EU
	}
	deltas := ws.frames("DELTA")
	sc.add(atLeast("browser", "Live DELTA frames received", 1, int64(len(deltas)), ""))
	last := lastValues(deltas)
	stale := 0
	for _, name := range sortedKeys(final) {
		if v, ok := last[name]; !ok || math.Abs(v-final[name]) > 1e-9 {
			stale++
		}
	}
	sc.add(eq("browser", "Last live value shown = last value the spacecraft sent (per parameter)", 0, int64(stale), fmt.Sprintf("%d parameters compared", len(final))))

	// A console opening now gets the CVT snapshot.
	late, err := dialWS(e.wsURL)
	if err == nil {
		defer late.close()
		time.Sleep(200 * time.Millisecond)
		late.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "s", "kind": "PARAMS", "satellite": "OPSSAT-1"})
		time.Sleep(500 * time.Millisecond)
		snaps := late.frames("SNAPSHOT")
		snapVals := lastValues(snaps)
		wrong := 0
		for name, v := range final {
			if sv, ok := snapVals[name]; !ok || math.Abs(sv-v) > 1e-9 {
				wrong++
			}
		}
		sc.add(eq("browser", "Snapshot for a newly opened console = latest values", 0, int64(wrong), ""))
	}
	raised := pipeline.Get("alarm.raised")
	sc.add(info("browser", "Alarm frames delivered", fmt.Sprintf("%d ALARM frames for %d alarms raised, %d cleared", len(ws.frames("ALARM")), raised, pipeline.Get("alarm.cleared")), ""))
}
