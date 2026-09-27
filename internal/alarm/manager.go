package alarm

import (
	"context"
	"encoding/json"
	"fmt"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"sort"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
)

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

type AlarmRecord struct {
	AlarmID        string     `json:"alarmId"`
	SCID           uint16     `json:"scid"`
	ParamName      string     `json:"paramName"`
	Level          string     `json:"level"`
	Value          float64    `json:"value"`
	Threshold      float64    `json:"threshold"`
	Unit           string     `json:"unit"`
	TriggeredAt    time.Time  `json:"triggeredAt"`
	Status         string     `json:"status"` // ACTIVE, ACKNOWLEDGED, CLEARED
	AcknowledgedBy string     `json:"acknowledgedBy,omitempty"`
	AcknowledgedAt *time.Time `json:"acknowledgedAt,omitempty"`
	ClearedAt      *time.Time `json:"clearedAt,omitempty"`
}

type AlarmManagerService struct {
	consumer    kafka.Consumer
	redisClient redis.Client
	alarms      map[string]*AlarmRecord // alarmId -> record
	open        map[string]*AlarmRecord // "scid:param" -> the one alarm still open for that parameter
	lastFired   map[string]time.Time    // "scid:param:level" -> time (for 30s dedup)
	mu          sync.RWMutex
}

func NewAlarmManagerService(c kafka.Consumer, r redis.Client) *AlarmManagerService {
	return &AlarmManagerService{
		consumer:    c,
		redisClient: r,
		alarms:      make(map[string]*AlarmRecord),
		open:        make(map[string]*AlarmRecord),
		lastFired:   make(map[string]time.Time),
	}
}

func (s *AlarmManagerService) Start(ctx context.Context) error {
	if s.consumer == nil {
		return nil
	}
	return s.consumer.Subscribe("alarm.events", func(ctx context.Context, msg *kafka.Message) error {
		var evt AlarmEvent
		if err := json.Unmarshal(msg.Value, &evt); err != nil {
			return err
		}
		return s.HandleAlarmEvent(ctx, &evt)
	})
}

func (s *AlarmManagerService) HandleAlarmEvent(ctx context.Context, evt *AlarmEvent) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	paramKey := fmt.Sprintf("%d:%s", evt.SCID, evt.ParamName)
	pipeline.Inc("alarm.events_in", 1)

	// Return to normal: the open alarm for this parameter is cleared (ISA-18.2 RTN).
	if evt.Direction == "CLEARED" {
		rec, ok := s.open[paramKey]
		if !ok {
			return nil
		}
		now := time.Now().UTC()
		rec.Status = "CLEARED"
		rec.ClearedAt = &now
		rec.Value = evt.EUValue
		delete(s.open, paramKey)
		for _, lvl := range []string{"LOW", "LOW_LOW", "HIGH", "HIGH_HIGH"} {
			delete(s.lastFired, paramKey+":"+lvl) // a fresh excursion must alarm again
		}
		s.publish(ctx, rec)
		pipeline.Inc("alarm.cleared", 1)
		return nil
	}

	// 1. De-duplicate alarms: same param + level within 30s -> suppress repeat (FR-ALARM-002)
	dedupKey := paramKey + ":" + evt.AlarmLevel
	now := time.Now()
	if last, exists := s.lastFired[dedupKey]; exists && now.Sub(last) < 30*time.Second {
		pipeline.Inc("alarm.suppressed_dup", 1)
		return nil // suppressed
	}
	s.lastFired[dedupKey] = now

	// 2. Check Redis DB-2 alarm inhibit flag (FR-ALARM-003)
	if s.redisClient != nil {
		inhibit, _ := s.redisClient.Get(ctx, 2, fmt.Sprintf("alarm:inhibit:%d:%s", evt.SCID, evt.ParamName))
		if inhibit == "1" {
			pipeline.Inc("alarm.inhibited", 1)
			return nil // inhibited by operator
		}
	}

	// 3. One alarm per (satellite, parameter): a level change updates the open
	// alarm instead of creating a second one (FR-EAL-05 grouping), and an
	// escalation makes it unacknowledged again.
	if rec, ok := s.open[paramKey]; ok {
		escalated := telemetry.LevelOf(evt.AlarmLevel) > telemetry.LevelOf(rec.Level)
		rec.Level, rec.Value, rec.Threshold, rec.Unit = evt.AlarmLevel, evt.EUValue, evt.Threshold, evt.EUUnit
		if escalated {
			rec.Status, rec.AcknowledgedBy, rec.AcknowledgedAt = "ACTIVE", "", nil
			pipeline.Inc("alarm.escalated", 1)
		}
		s.publish(ctx, rec)
		return nil
	}

	rec := &AlarmRecord{
		AlarmID:     evt.AlarmID,
		SCID:        evt.SCID,
		ParamName:   evt.ParamName,
		Level:       evt.AlarmLevel,
		Value:       evt.EUValue,
		Threshold:   evt.Threshold,
		Unit:        evt.EUUnit,
		TriggeredAt: evt.TS,
		Status:      "ACTIVE",
	}
	s.alarms[evt.AlarmID] = rec
	s.open[paramKey] = rec
	pipeline.Inc("alarm.raised", 1)

	// 4. Publish to Redis Pub/Sub ws:alarms:{scid} for real-time UI delivery (FR-ALARM-005)
	s.publish(ctx, rec)

	// 5. If HIGH_HIGH, trigger webhook / urgent notification (FR-ALARM-006)
	if evt.AlarmLevel == "HIGH_HIGH" {
		fmt.Printf("[ALARM CRITICAL] PagerDuty alert triggered for SCID %d, Param %s, Value %.2f\n", evt.SCID, evt.ParamName, evt.EUValue)
	}

	return nil
}

func (s *AlarmManagerService) publish(ctx context.Context, rec *AlarmRecord) {
	if s.redisClient != nil {
		_ = s.redisClient.Publish(ctx, telemetry.AlarmChannel(rec.SCID), rec)
	}
}

func (s *AlarmManagerService) Acknowledge(alarmID string, user string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	rec, ok := s.alarms[alarmID]
	if !ok {
		return false
	}
	now := time.Now().UTC()
	if rec.Status == "ACTIVE" {
		rec.Status = "ACKNOWLEDGED"
	}
	rec.AcknowledgedBy, rec.AcknowledgedAt = user, &now
	s.publish(context.Background(), rec) // every console sees the acknowledgement
	return true
}

func (s *AlarmManagerService) GetAlarm(alarmID string) (*AlarmRecord, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	rec, ok := s.alarms[alarmID]
	return rec, ok
}

// List returns alarms, newest first. scid 0 means every satellite; openOnly
// hides alarms that have returned to normal.
func (s *AlarmManagerService) List(scid uint16, openOnly bool) []AlarmRecord {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]AlarmRecord, 0, len(s.alarms))
	for _, rec := range s.alarms {
		if (scid != 0 && rec.SCID != scid) || (openOnly && rec.Status == "CLEARED") {
			continue
		}
		out = append(out, *rec)
	}
	sort.Slice(out, func(i, j int) bool { return out[i].TriggeredAt.After(out[j].TriggeredAt) })
	return out
}

// ConsoleView is the alarm as the console consumes it (snake_case, alarm_state
// 1 warning / 2 critical), shared by the live ALARM frames and the REST list
// so both always agree.
func (r AlarmRecord) ConsoleView(satID string) map[string]any {
	utc := func(t *time.Time) string {
		if t == nil {
			return ""
		}
		return t.UTC().Format(time.RFC3339Nano)
	}
	return map[string]any{
		"alarm_id": r.AlarmID, "sat_id": satID, "param_id": r.ParamName,
		"alarm_state": telemetry.LevelOf(r.Level), "level": r.Level,
		"eu_value": r.Value, "unit": r.Unit, "timestamp_utc": r.TriggeredAt.UTC().Format(time.RFC3339Nano),
		"status": r.Status, "acknowledged": r.Status == "ACKNOWLEDGED",
		"acknowledged_by": r.AcknowledgedBy, "acknowledged_utc": utc(r.AcknowledgedAt),
		"cleared_utc": utc(r.ClearedAt),
	}
}
