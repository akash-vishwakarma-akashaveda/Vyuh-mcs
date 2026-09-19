package telemetry

import (
	"fmt"
	"math"
	"time"
)

// LiveValue is one parameter value as carried on Live Telemetry's pub/sub
// channels, in the CVT hash, and to browsers (architecture v2.2 §16.2/§21.3).
type LiveValue struct {
	ParamID      string  `json:"param_id"`
	EUValue      float64 `json:"eu_value"`
	Unit         string  `json:"unit"`
	AlarmState   uint8   `json:"alarm_state"` // 0 normal, 1 warning, 2 critical
	Quality      uint8   `json:"quality"`     // 0 good, 1 uncertain/bad
	TimestampUTC string  `json:"timestamp_utc"`
}

// LiveDelta is one published batch: everything one telemetry packet changed
// for one satellite. Seq is assigned by Live Telemetry, the single writer.
type LiveDelta struct {
	SCID   uint16      `json:"scid"`
	Seq    uint64      `json:"seq"`
	ERTNs  int64       `json:"ert_ns,omitempty"` // Link Gateway receive time, for the latency probe
	Values []LiveValue `json:"values"`
}

// Level collapses the five limit states to the console's three: LOW/HIGH are
// warnings, LOW_LOW/HIGH_HIGH are critical.
func (a AlarmState) Level() uint8 {
	switch a {
	case AlarmLow, AlarmHigh:
		return 1
	case AlarmLowLow, AlarmHighHigh:
		return 2
	default:
		return 0
	}
}

// LevelOf maps an alarm level name ("HIGH_HIGH", "LOW", ...) the same way.
func LevelOf(name string) uint8 {
	switch name {
	case "LOW", "HIGH":
		return 1
	case "LOW_LOW", "HIGH_HIGH":
		return 2
	default:
		return 0
	}
}

func (q Quality) Level() uint8 {
	if q == QualityGood {
		return 0
	}
	return 1
}

// roundSig trims calibration float noise (28.490000000000002 -> 28.49) to
// digits significant figures, keeping the wire and the displays clean.
func roundSig(v float64, digits int) float64 {
	if v == 0 || math.IsNaN(v) || math.IsInf(v, 0) {
		return v
	}
	p := math.Pow(10, float64(digits-int(math.Ceil(math.Log10(math.Abs(v))))))
	return math.Round(v*p) / p
}

func ToLiveValue(p DecodedParameter) LiveValue {
	return LiveValue{
		ParamID:      p.ParamName,
		EUValue:      roundSig(p.EUValue, 9),
		Unit:         p.EUUnit,
		AlarmState:   p.AlarmState.Level(),
		Quality:      p.Quality.Level(),
		TimestampUTC: p.Timestamp.UTC().Format(time.RFC3339Nano),
	}
}

// Redis keys and pub/sub channels shared by Live Telemetry and Realtime Gateway.

// CVTKey is the hash holding the latest LiveValue (JSON) of every parameter.
func CVTKey(tenant string, scid uint16) string { return fmt.Sprintf("cvt:%s:%d", tenant, scid) }

// DeltaChannel carries LiveDelta batches (coalesced) for one satellite.
func DeltaChannel(tenant string, scid uint16) string { return fmt.Sprintf("cvtd:%s:%d", tenant, scid) }

// AlarmChannel carries alarm records for one satellite (published by Alarm Manager).
func AlarmChannel(scid uint16) string { return fmt.Sprintf("ws:alarms:%d", scid) }

// StatusChannel carries command / session status events for one satellite.
func StatusChannel(scid uint16) string { return fmt.Sprintf("ws:status:%d", scid) }
