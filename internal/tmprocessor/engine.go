// Package tmprocessor implements TM Processor (architecture v2.2 §16.1,
// FR-TMP-*): space packets in, calibrated time-correlated limit-checked
// parameters out, using the active Mission Database dictionary. Reused from
// the original TPPP engine (decommutation via pkg/xtce, limit hysteresis);
// this adds OBT->TAI time correlation (FR-TMP-02) and dictionary hot-swap
// from Mission Database's mdb.releases.v1 instead of an ad-hoc Redis cache
// key, and renames topics to match §8.3.
package tmprocessor

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/missiondatabase"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/akashaveda/vyuh-mcs/pkg/xtce"
	"github.com/google/uuid"
)

const (
	TopicPacketsRealtime = "tm.packets.realtime.v1"
	TopicParamsRealtime  = "tm.params.realtime.v1"
	TopicMDBReleases     = "mdb.releases.v1"
	// TopicAlarmEvents keeps its original name — Events & Alarms (EAL) is a
	// Phase 3 module; the existing Alarm Manager service still consumes this
	// exact topic and is explicitly out of scope for this pass.
	TopicAlarmEvents = "alarm.events"
)

type Config struct {
	ConsumerGroup string
	MDBBaseURL    string // Mission Database HTTP base, e.g. http://localhost:9104 ("" disables hot-swap fetch)
	MDBHTTPClient *http.Client
}

type SpacePacketMessage struct {
	SCID           uint16 `json:"scid"`
	APID           uint16 `json:"apid"`
	SeqCount       uint16 `json:"seq_count"`
	SeqFlags       uint8  `json:"seq_flags"`
	PacketBytesB64 string `json:"packet_bytes_b64"`
	OBTRaw         uint64 `json:"obt_raw"`
	ReceiveTSNs    int64  `json:"receive_ts_ns"`
	PassID         string `json:"pass_id"`
	Replay         bool   `json:"replay"`
}

type AlarmEvent struct {
	AlarmID    string    `json:"alarm_id"`
	SCID       uint16    `json:"scid"`
	ParamName  string    `json:"param_name"`
	AlarmLevel string    `json:"alarm_level"`
	Direction  string    `json:"direction"`
	EUValue    float64   `json:"eu_value"`
	Threshold  float64   `json:"threshold"`
	EUUnit     string    `json:"eu_unit"`
	TS         time.Time `json:"ts"`
}

type AlarmTracker struct {
	CurrentState    telemetry.AlarmState
	PendingState    telemetry.AlarmState
	ConsecutiveHits int
}

type Engine struct {
	cfg         Config
	redisClient redis.Client
	bus         kafka.Producer
	consumer    kafka.Consumer
	correlator  *TimeCorrelator

	paramSets  map[string]*xtce.ParameterSet // "scid:apid" -> active set
	mdbVersion map[uint16]int                // scid -> active mdb version
	alarmTrack map[string]*AlarmTracker
	mu         sync.RWMutex
}

func NewEngine(cfg Config, r redis.Client, bus kafka.Producer, consumer kafka.Consumer) *Engine {
	if cfg.MDBHTTPClient == nil {
		cfg.MDBHTTPClient = http.DefaultClient
	}
	return &Engine{
		cfg:         cfg,
		redisClient: r,
		bus:         bus,
		consumer:    consumer,
		correlator:  NewTimeCorrelator(),
		paramSets:   make(map[string]*xtce.ParameterSet),
		mdbVersion:  make(map[uint16]int),
		alarmTrack:  make(map[string]*AlarmTracker),
	}
}

func (e *Engine) RegisterParameterSet(ps *xtce.ParameterSet) {
	e.mu.Lock()
	key := fmt.Sprintf("%d:%d", ps.SCID, ps.APID)
	e.paramSets[key] = ps
	e.mu.Unlock()

	// Time-correlation defaults compiled into the dictionary (FR-TMP-02).
	if ps.TimeHeaderBytes > 0 && ps.TimeTicksPerSec > 0 {
		if epoch, err := time.Parse(time.RFC3339, ps.TimeEpoch); err == nil {
			e.correlator.Set(ps.SCID, epoch, ps.TimeTicksPerSec)
		}
	}
}

// RegisterDictionary activates a whole satellite dictionary (one set per APID).
func (e *Engine) RegisterDictionary(sets []*xtce.ParameterSet) {
	for _, ps := range sets {
		e.RegisterParameterSet(ps)
	}
}

func (e *Engine) Start(ctx context.Context) error {
	if err := e.consumer.Subscribe(TopicMDBReleases, func(ctx context.Context, msg *kafka.Message) error {
		return e.handleMDBRelease(ctx, msg.Value)
	}); err != nil {
		return err
	}
	return e.consumer.Subscribe(TopicPacketsRealtime, func(ctx context.Context, msg *kafka.Message) error {
		return e.HandleSpacePacket(ctx, msg.Value)
	})
}

// handleMDBRelease implements dictionary hot-swap (§16.1: "a new bundle is
// loaded in the background ... and switched atomically at the release's
// effective time"). Here the switch is immediate on receipt since Kafka
// delivery already only happens once the version is RELEASED.
func (e *Engine) handleMDBRelease(ctx context.Context, data []byte) error {
	var rel missiondatabase.ReleaseEvent
	if err := json.Unmarshal(data, &rel); err != nil {
		return err
	}
	if e.cfg.MDBBaseURL == "" {
		return nil
	}

	url := fmt.Sprintf("%s/v1/dictionaries/%d/%d", e.cfg.MDBBaseURL, rel.SCID, rel.Version)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := e.cfg.MDBHTTPClient.Do(req)
	if err != nil {
		return err // keep the previous version and let the caller retry/alarm
	}
	defer resp.Body.Close()

	var bundle missiondatabase.Bundle
	if err := json.NewDecoder(resp.Body).Decode(&bundle); err != nil {
		return err
	}
	if len(bundle.ParameterSets) == 0 {
		return nil
	}

	e.RegisterDictionary(bundle.ParameterSets)
	e.mu.Lock()
	e.mdbVersion[rel.SCID] = rel.Version
	e.mu.Unlock()
	return nil
}

func (e *Engine) HandleSpacePacket(ctx context.Context, data []byte) error {
	var sp SpacePacketMessage
	if err := json.Unmarshal(data, &sp); err != nil {
		return err
	}

	payload, err := base64.StdEncoding.DecodeString(sp.PacketBytesB64)
	if err != nil {
		return err
	}

	e.mu.RLock()
	key := fmt.Sprintf("%d:%d", sp.SCID, sp.APID)
	ps, exists := e.paramSets[key]
	mdbVersion := e.mdbVersion[sp.SCID]
	e.mu.RUnlock()

	if !exists && e.redisClient != nil {
		// Fallback for a satellite/APID with no Mission Database release yet.
		cachedJSON, err := e.redisClient.Get(ctx, 2, fmt.Sprintf("xtce:%d:%d", sp.SCID, sp.APID))
		if err == nil && cachedJSON != "" {
			var cachedSet xtce.ParameterSet
			if json.Unmarshal([]byte(cachedJSON), &cachedSet) == nil {
				e.RegisterParameterSet(&cachedSet)
				ps = &cachedSet
				exists = true
			}
		}
	}

	if !exists || ps == nil {
		_ = kafka.ProduceJSON(ctx, e.bus, "dead.letter", nil, map[string]any{
			"error_type": "DECOM_FAILURE",
			"scid":       sp.SCID,
			"apid":       sp.APID,
			"reason":     "no XTCE parameter set for APID",
		}, nil)
		return nil
	}

	receiveTime := time.Unix(0, sp.ReceiveTSNs).UTC()

	// The dictionary says the packet data field starts with an on-board time
	// header (CUC); read it for time correlation (FR-TMP-02). Parameter bit
	// offsets in the dictionary are measured from the start of the data field,
	// header included, so the payload is decommutated as received.
	obtRaw := sp.OBTRaw
	if n := ps.TimeHeaderBytes; n > 0 {
		if len(payload) < n {
			_ = kafka.ProduceJSON(ctx, e.bus, "dead.letter", nil, map[string]any{
				"error_type": "DECOM_FAILURE", "scid": sp.SCID, "apid": sp.APID, "reason": "packet shorter than time header",
			}, nil)
			return nil
		}
		obtRaw = 0
		for _, b := range payload[:n] {
			obtRaw = obtRaw<<8 | uint64(b)
		}
	}
	// OBT -> TAI, flagging stale/uncorrelated samples.
	pktTime, correlationStale := e.correlator.Correlate(sp.SCID, obtRaw, receiveTime)

	decoded, err := ps.Decommutate(payload, pktTime, sp.SeqCount)
	if err != nil {
		_ = kafka.ProduceJSON(ctx, e.bus, "dead.letter", nil, map[string]any{
			"error_type": "DECOM_FAILURE",
			"scid":       sp.SCID,
			"apid":       sp.APID,
			"detail":     err.Error(),
		}, nil)
		return nil
	}

	for _, p := range decoded {
		p.PassID = sp.PassID
		p.IsReplay = sp.Replay
		if correlationStale {
			p.Quality = telemetry.QualityUncertain
		}
		e.processAlarmHysteresis(ctx, p)
	}

	msg := telemetry.ProcessedTelemetryMessage{
		SCID:     sp.SCID,
		APID:     sp.APID,
		PacketTS: pktTime,
		PassID:   sp.PassID,
		Replay:   sp.Replay,
		// ERT: carried through so the end-to-end latency can be measured.
		ReceiveTSNs: sp.ReceiveTSNs,
		Params:      make([]telemetry.DecodedParameter, len(decoded)),
	}
	for i, d := range decoded {
		msg.Params[i] = *d
	}
	_ = mdbVersion // recorded for observability; carried per-sample once mdb_version is threaded onto DecodedParameter

	scidKey := []byte(fmt.Sprintf("%d", sp.SCID))
	return kafka.ProduceJSON(ctx, e.bus, TopicParamsRealtime, scidKey, msg, nil)
}

func (e *Engine) processAlarmHysteresis(ctx context.Context, p *telemetry.DecodedParameter) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if e.redisClient != nil {
		inhibit, _ := e.redisClient.Get(ctx, 2, fmt.Sprintf("alarm:inhibit:%d:%s", p.SCID, p.ParamName))
		if inhibit == "1" {
			p.AlarmState = telemetry.AlarmNormal
			return
		}
	}

	key := fmt.Sprintf("%d:%s", p.SCID, p.ParamName)
	tracker, ok := e.alarmTrack[key]
	if !ok {
		tracker = &AlarmTracker{CurrentState: telemetry.AlarmNormal}
		e.alarmTrack[key] = tracker
	}

	instantState := p.AlarmState

	if instantState != tracker.CurrentState {
		if instantState == tracker.PendingState {
			tracker.ConsecutiveHits++
		} else {
			tracker.PendingState = instantState
			tracker.ConsecutiveHits = 1
		}

		if tracker.ConsecutiveHits >= 3 {
			tracker.CurrentState = instantState
			tracker.ConsecutiveHits = 0

			direction := "TRIGGERED"
			if instantState == telemetry.AlarmNormal {
				direction = "CLEARED"
			}

			evt := AlarmEvent{
				AlarmID:    "AL-" + strings.ToUpper(uuid.NewString()[:8]),
				SCID:       p.SCID,
				ParamName:  p.ParamName,
				AlarmLevel: instantState.String(),
				Direction:  direction,
				EUValue:    p.EUValue,
				Threshold:  p.EUValue,
				EUUnit:     p.EUUnit,
				TS:         p.Timestamp,
			}
			_ = kafka.ProduceJSON(ctx, e.bus, TopicAlarmEvents, []byte(key), evt, nil)
		}
	} else {
		tracker.ConsecutiveHits = 0
		tracker.PendingState = tracker.CurrentState
	}

	p.AlarmState = tracker.CurrentState
}
