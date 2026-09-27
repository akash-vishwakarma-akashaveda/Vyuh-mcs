package verify

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/anomaly"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/simulator"
)

// Confusion is a per-segment confusion matrix: a segment is predicted
// anomalous when the model flagged anything inside it.
type Confusion struct {
	TP int `json:"tp"`
	FP int `json:"fp"`
	FN int `json:"fn"`
	TN int `json:"tn"`
}

func (c Confusion) Precision() float64 { return ratio(c.TP, c.TP+c.FP) }
func (c Confusion) Recall() float64    { return ratio(c.TP, c.TP+c.FN) }
func (c Confusion) F1() float64 {
	p, r := c.Precision(), c.Recall()
	if p+r == 0 {
		return 0
	}
	return 2 * p * r / (p + r)
}
func (c Confusion) Accuracy() float64 { return ratio(c.TP+c.TN, c.TP+c.TN+c.FP+c.FN) }

func ratio(a, b int) float64 {
	if b == 0 {
		return 0
	}
	return float64(a) / float64(b)
}

type ModelResult struct {
	Model     string               `json:"model"`
	Split     string               `json:"split"` // all | test
	Confusion Confusion            `json:"confusion"`
	Precision float64              `json:"precision"`
	Recall    float64              `json:"recall"`
	F1        float64              `json:"f1"`
	Accuracy  float64              `json:"accuracy"`
	ByChannel map[string]Confusion `json:"by_channel"`
	Notes     string               `json:"notes,omitempty"`
}

type ModelRun struct {
	Seconds     float64          `json:"seconds"`
	Samples     int              `json:"samples"`
	Segments    int              `json:"segments"`
	Anomalous   int              `json:"anomalous_segments"`
	Detections  map[string]int64 `json:"detections_by_kind"`
	AlarmEvents int              `json:"alarm_events"`
	Results     []ModelResult    `json:"results"`
}

type segSpan struct {
	param    string
	from, to time.Time
	anomaly  bool
	train    bool
}

func segments(ledger []simulator.LedgerEntry) []segSpan {
	m := map[int32]*segSpan{}
	for _, l := range ledger {
		s := m[l.Segment]
		if s == nil {
			s = &segSpan{param: l.Param, from: l.OBT, to: l.OBT, train: l.Train}
			m[l.Segment] = s
		}
		if l.OBT.Before(s.from) {
			s.from = l.OBT
		}
		if l.OBT.After(s.to) {
			s.to = l.OBT
		}
		s.anomaly = s.anomaly || l.Anomaly
	}
	out := make([]segSpan, 0, len(m))
	for _, s := range m {
		out = append(out, *s)
	}
	return out
}

type interval struct{ from, to time.Time }

func score(name, split string, segs []segSpan, flagged func(segSpan) bool, notes string) ModelResult {
	var c Confusion
	by := map[string]Confusion{}
	for _, s := range segs {
		if split == "test" && s.train {
			continue
		}
		pred := flagged(s)
		bc := by[s.param]
		switch {
		case pred && s.anomaly:
			c.TP++
			bc.TP++
		case pred && !s.anomaly:
			c.FP++
			bc.FP++
		case !pred && s.anomaly:
			c.FN++
			bc.FN++
		default:
			c.TN++
			bc.TN++
		}
		by[s.param] = bc
	}
	return ModelResult{Model: name, Split: split, Confusion: c, Precision: c.Precision(), Recall: c.Recall(), F1: c.F1(), Accuracy: c.Accuracy(), ByChannel: by, Notes: notes}
}

// runModels replays the whole dataset on a clean link and scores the limit
// alarms, the anomaly model, and both together against the ESA labels.
func runModels(ctx context.Context, dataPath string, count int) (*ModelRun, error) {
	e, err := boot(ctx, dataPath, false)
	if err != nil {
		return nil, err
	}
	defer e.close()
	start := time.Now()
	if err := e.replay(ctx, 0, count, 0, nil); err != nil {
		return nil, err
	}
	ledger := e.st.Sim.Replay().Ledger()
	segs := segments(ledger)
	run := &ModelRun{Seconds: time.Since(start).Seconds(), Samples: len(ledger), Segments: len(segs), Detections: map[string]int64{}}
	for _, s := range segs {
		if s.anomaly {
			run.Anomalous++
		}
	}
	for _, k := range []string{"SPIKE", "NOISE", "FLAT", "GAP"} {
		run.Detections[k] = pipeline.Get("anomaly." + k)
	}

	// Alarm intervals from raise/clear events (what an operator sees).
	e.mu.Lock()
	events := append(e.alarms[:0:0], e.alarms...)
	e.mu.Unlock()
	run.AlarmEvents = len(events)
	sort.Slice(events, func(i, j int) bool { return events[i].TS.Before(events[j].TS) })
	open := map[string]time.Time{}
	alarmIv := map[string][]interval{}
	far := time.Now().Add(1000 * time.Hour)
	for _, ev := range events {
		if ev.Direction == "CLEARED" {
			if t, ok := open[ev.ParamName]; ok {
				alarmIv[ev.ParamName] = append(alarmIv[ev.ParamName], interval{t, ev.TS})
				delete(open, ev.ParamName)
			}
			continue
		}
		if _, ok := open[ev.ParamName]; !ok {
			open[ev.ParamName] = ev.TS
		}
	}
	for p, t := range open {
		alarmIv[p] = append(alarmIv[p], interval{t, far})
	}
	byAlarm := func(s segSpan) bool {
		for _, iv := range alarmIv[s.param] {
			if !iv.from.After(s.to) && !iv.to.Before(s.from) {
				return true
			}
		}
		return false
	}

	dets := map[string][]anomaly.Detection{}
	for _, d := range e.st.AI.Detections() {
		dets[d.Param] = append(dets[d.Param], d)
	}
	byModel := func(s segSpan) bool {
		for _, d := range dets[s.param] {
			if !d.OBT.Before(s.from) && !d.OBT.After(s.to) {
				return true
			}
		}
		return false
	}
	both := func(s segSpan) bool { return byAlarm(s) || byModel(s) }

	for _, split := range []string{"all", "test"} {
		run.Results = append(run.Results,
			score("Limit alarms (MAG ±47/±52 µT, 3-sample confirmation)", split, segs, byAlarm, "limits set from nominal training data; sun sensors have no limits (nominal data saturates at π/2)"),
			score("Anomaly model (spike / noise / flat / gap, unsupervised)", split, segs, byModel, "no labels used; rolling median-MAD, spread ratio and sample-interval tests"),
			score("Limits + anomaly model", split, segs, both, "either flags the segment"),
		)
	}
	return run, nil
}

func modelChecks(r *ModelRun) *Scenario {
	sc := &Scenario{ID: "M01", Group: "Models", Title: "Limit alarms and anomaly model against ESA labels", Seconds: r.Seconds, Emitted: r.Samples,
		Setup: fmt.Sprintf("full OPS-SAT-AD dataset: %d samples, %d segments (%d labelled anomalous), clean link", r.Samples, r.Segments, r.Anomalous)}
	for _, m := range r.Results {
		if m.Split != "all" {
			continue
		}
		sc.add(info("model", m.Model, fmt.Sprintf("precision %.2f · recall %.2f · F1 %.2f (TP %d FP %d FN %d TN %d)", m.Precision, m.Recall, m.F1, m.Confusion.TP, m.Confusion.FP, m.Confusion.FN, m.Confusion.TN), m.Notes))
	}
	best := 0.0
	for _, m := range r.Results {
		if m.F1 > best {
			best = m.F1
		}
	}
	sc.add(boolCheck("model", "Limits catch magnetometer excursions", r.Results[0].ByChannel["MAG_X"].TP+r.Results[0].ByChannel["MAG_Y"].TP+r.Results[0].ByChannel["MAG_Z"].TP > 0, "> 0 true positives on MAG_*", fmt.Sprint(r.Results[0].ByChannel["MAG_X"].TP+r.Results[0].ByChannel["MAG_Y"].TP+r.Results[0].ByChannel["MAG_Z"].TP), ""))
	sc.add(gap("model", "Supervised anomaly model trained on the labels", "published ESA baselines reach F1 ≈ 0.6-0.9 with supervised models", fmt.Sprintf("best unsupervised F1 here %.2f", best), "a trained model (ESA's training split) is the next step for the Anomaly advisories screen"))
	sc.finish()
	return sc
}
