package telemetry

import "time"

type AlarmState uint8

const (
	AlarmNormal   AlarmState = 0
	AlarmLow      AlarmState = 1
	AlarmLowLow   AlarmState = 2
	AlarmHigh     AlarmState = 3
	AlarmHighHigh AlarmState = 4
)

func (a AlarmState) String() string {
	switch a {
	case AlarmNormal:
		return "NORMAL"
	case AlarmLow:
		return "LOW"
	case AlarmLowLow:
		return "LOW_LOW"
	case AlarmHigh:
		return "HIGH"
	case AlarmHighHigh:
		return "HIGH_HIGH"
	default:
		return "UNKNOWN"
	}
}

type Quality uint8

const (
	QualityGood      Quality = 0
	QualityUncertain Quality = 1
	QualityBad       Quality = 2
)

// DecodedParameter represents a fully processed telemetry parameter
type DecodedParameter struct {
	SCID       uint16     `json:"scid"`
	APID       uint16     `json:"apid"`
	ParamName  string     `json:"name"`
	RawValue   int64      `json:"dn_value"`
	EUValue    float64    `json:"eu_value"`
	EUUnit     string     `json:"eu_unit"`
	Quality    Quality    `json:"quality"`
	OBTRaw     uint64     `json:"obt_raw"`
	Timestamp  time.Time  `json:"timestamp"`
	AlarmState AlarmState `json:"alarm_state"`
	PacketSeq  uint16     `json:"packet_seq"`
	PassID     string     `json:"pass_id,omitempty"`
	IsReplay   bool       `json:"is_replay"`
}

// ProcessedTelemetryMessage matches the tm.params.realtime.v1 / tm.params.playback.v1 Kafka message schema
type ProcessedTelemetryMessage struct {
	SCID     uint16    `json:"scid"`
	APID     uint16    `json:"apid"`
	PacketTS time.Time `json:"packet_ts"`
	PassID   string    `json:"pass_id,omitempty"`
	Replay   bool      `json:"replay"`
	// ReceiveTSNs is the Link Gateway receive time (ERT) of the frame that
	// carried the packet: the start of the end-to-end latency clock (Q-01).
	ReceiveTSNs int64              `json:"receive_ts_ns,omitempty"`
	Params      []DecodedParameter `json:"params"`
}
