package verify

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type Options struct {
	DataPath     string
	Slice        int    // samples per fault scenario (default 20000)
	FullModelRun bool   // score models on the whole dataset (default: first 60000 samples)
	Only         string // run only scenarios whose ID starts with this ("D", "U", "M", "D1"…)
	Log          func(string)
}

type Report struct {
	GeneratedUTC string         `json:"generated_utc"`
	Environment  map[string]any `json:"environment"`
	Dataset      map[string]any `json:"dataset"`
	Scenarios    []*Scenario    `json:"scenarios"`
	Models       *ModelRun      `json:"models,omitempty"`
	Summary      map[Status]int `json:"summary"`
}

func Run(ctx context.Context, o Options) (*Report, error) {
	if o.Slice == 0 {
		o.Slice = 20000
	}
	if o.Log == nil {
		o.Log = func(string) {}
	}
	r := &Report{
		GeneratedUTC: time.Now().UTC().Format(time.RFC3339),
		Environment:  map[string]any{"go": runtime.Version(), "os": runtime.GOOS + "/" + runtime.GOARCH, "cpus": runtime.NumCPU(), "substrate": "in-memory bus and Redis, single process (cmd/vyuh-mcs wiring)"},
		Dataset:      map[string]any{"name": "OPS-SAT-AD (ESA OPS-SAT, Zenodo 12588359, CC-BY-4.0)", "path": o.DataPath},
		Summary:      map[Status]int{},
	}
	want := func(id string) bool { return o.Only == "" || strings.HasPrefix(id, o.Only) }

	for _, d := range downlinkCatalogue(o.Slice) {
		if !want(d.id) {
			continue
		}
		o.Log(fmt.Sprintf("%s %s", d.id, d.title))
		sc, err := runDownlink(ctx, o.DataPath, d)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", d.id, err)
		}
		o.Log(fmt.Sprintf("    %s in %.1fs", sc.Status, sc.Seconds))
		r.Scenarios = append(r.Scenarios, sc)
	}
	if want("U") {
		o.Log("U uplink scenarios")
		us, err := runUplink(ctx, o.DataPath)
		if err != nil {
			return nil, fmt.Errorf("uplink: %w", err)
		}
		for _, s := range us {
			o.Log(fmt.Sprintf("    %s %s: %s", s.ID, s.Title, s.Status))
		}
		r.Scenarios = append(r.Scenarios, us...)
	}
	if want("M") {
		n := 60000
		if o.FullModelRun {
			n = 1 << 30
		}
		o.Log("M models against ESA labels")
		m, err := runModels(ctx, o.DataPath, n)
		if err != nil {
			return nil, fmt.Errorf("models: %w", err)
		}
		r.Models = m
		sc := modelChecks(m)
		o.Log(fmt.Sprintf("    %s in %.1fs", sc.Status, sc.Seconds))
		r.Scenarios = append(r.Scenarios, sc)
	}
	for _, s := range r.Scenarios {
		for _, c := range s.Checks {
			r.Summary[c.Status]++
		}
	}
	return r, nil
}

// Write saves the report as JSON and Markdown in dir.
func (r *Report) Write(dir string) (string, error) {
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	b, _ := json.MarshalIndent(r, "", "  ")
	if err := os.WriteFile(filepath.Join(dir, "pipeline-report.json"), b, 0o644); err != nil {
		return "", err
	}
	md := filepath.Join(dir, "PIPELINE_REPORT.md")
	return md, os.WriteFile(md, []byte(r.Markdown()), 0o644)
}

func (r *Report) Markdown() string {
	var b strings.Builder
	w := func(f string, a ...any) { fmt.Fprintf(&b, f+"\n", a...) }
	w("# VYUH-MCS pipeline verification report")
	w("")
	w("Generated %s · %v · %v", r.GeneratedUTC, r.Environment["os"], r.Environment["substrate"])
	w("")
	w("Telemetry source: %v. Real on-board ADCS measurements (3 magnetometer, 6 sun-sensor channels) with anomalies labelled by ESA engineers, packetised and framed as CCSDS 133.0 / 132.0 by the replay satellite OPSSAT-1 and sent through the real ground segment.", r.Dataset["name"])
	w("")
	w("**Checks:** %d pass · %d fail · %d capability gaps · %d measurements", r.Summary[Pass], r.Summary[Fail], r.Summary[Gap], r.Summary[Info])
	w("")
	w("| ID | Scenario | Result | Samples | Delivered | Time |")
	w("|---|---|---|---|---|---|")
	for _, s := range r.Scenarios {
		del := "—"
		if s.Fidelity != nil {
			del = fmt.Sprintf("%.2f %%", s.Fidelity.DeliveryPc)
		}
		w("| %s | %s | %s | %d | %s | %.1f s |", s.ID, s.Title, s.Status, s.Emitted, del, s.Seconds)
	}
	for _, s := range r.Scenarios {
		w("")
		w("## %s · %s — %s", s.ID, s.Title, s.Status)
		w("")
		w("Setup: %s", s.Setup)
		w("")
		w("| Stage | Check | Expected | Observed | Result | Note |")
		w("|---|---|---|---|---|---|")
		for _, c := range s.Checks {
			w("| %s | %s | %s | %s | %s | %s |", c.Stage, c.Name, esc(c.Expected), esc(c.Observed), c.Status, esc(c.Note))
		}
		if l, ok := s.Latency["ert_to_ws"]; ok && l.Count > 0 {
			w("")
			w("Latency ground receive → browser: p50 %.1f ms · p95 %.1f ms · p99 %.1f ms · max %.1f ms (%d samples)", l.P50, l.P95, l.P99, l.Max, l.Count)
		}
	}
	if m := r.Models; m != nil {
		w("")
		w("## Model scores (per segment, against ESA labels)")
		w("")
		w("%d samples, %d segments, %d anomalous. Anomaly model detections by kind: %v. Limit alarm events: %d.", m.Samples, m.Segments, m.Anomalous, m.Detections, m.AlarmEvents)
		w("")
		w("| Model | Split | Precision | Recall | F1 | Accuracy | TP | FP | FN | TN |")
		w("|---|---|---|---|---|---|---|---|---|---|")
		for _, x := range m.Results {
			c := x.Confusion
			w("| %s | %s | %.2f | %.2f | %.2f | %.2f | %d | %d | %d | %d |", x.Model, x.Split, x.Precision, x.Recall, x.F1, x.Accuracy, c.TP, c.FP, c.FN, c.TN)
		}
		w("")
		w("Per channel (all segments):")
		w("")
		w("| Model | Channel | TP | FP | FN | TN | Recall |")
		w("|---|---|---|---|---|---|---|")
		for _, x := range m.Results {
			if x.Split != "all" {
				continue
			}
			for _, ch := range sortedKeys(x.ByChannel) {
				c := x.ByChannel[ch]
				w("| %s | %s | %d | %d | %d | %d | %.2f |", x.Model, ch, c.TP, c.FP, c.FN, c.TN, c.Recall())
			}
		}
	}
	return b.String()
}

func esc(s string) string { return strings.ReplaceAll(strings.ReplaceAll(s, "|", "\\|"), "\n", " ") }
