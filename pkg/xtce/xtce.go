package xtce

import (
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/akashaveda/vyuh-mcs/pkg/bitreader"
	"github.com/akashaveda/vyuh-mcs/pkg/calibration"
)

var (
	ErrUnknownDataType  = errors.New("unsupported XTCE data type")
	ErrInvalidCalibType = errors.New("unsupported calibration type")
)

type AlarmLimits struct {
	LowLowLimit   *float64 `json:"low_low_limit,omitempty"`
	LowLimit      *float64 `json:"low_limit,omitempty"`
	HighLimit     *float64 `json:"high_limit,omitempty"`
	HighHighLimit *float64 `json:"high_high_limit,omitempty"`
	HysteresisPct float64  `json:"hysteresis_pct"`
	AlarmEnabled  bool     `json:"alarm_enabled"`
}

// Parameter defines a single telemetry parameter in the XTCE dictionary
type Parameter struct {
	SCID        uint16       `json:"scid"`
	APID        uint16       `json:"apid"`
	Name        string       `json:"param_name"`
	Description string       `json:"description,omitempty"`
	DataType    string       `json:"data_type"` // UINT, INT, FLOAT, BOOL, STRING
	BitOffset   int          `json:"bit_offset"`
	BitLength   int          `json:"bit_length"`
	ByteOrder   string       `json:"byte_order"` // BIG_ENDIAN, LITTLE_ENDIAN
	Unit        string       `json:"eu_unit"`
	CalibType   string       `json:"calib_type"` // POLYNOMIAL, SPLINE, LUT, NONE
	CalibData   any          `json:"calib_data,omitempty"`
	Alarms      *AlarmLimits `json:"alarms,omitempty"`

	calibrator calibration.Calibrator
}

// Compile compiles and validates the calibrator for the parameter
func (p *Parameter) Compile() error {
	switch p.CalibType {
	case "", "NONE":
		p.calibrator = &calibration.NoneCalibrator{}
		return nil

	case "POLYNOMIAL":
		var coeffs []float64
		switch v := p.CalibData.(type) {
		case []float64:
			coeffs = v
		case []any:
			for _, item := range v {
				if f, ok := item.(float64); ok {
					coeffs = append(coeffs, f)
				}
			}
		default:
			// Try unmarshaling if JSON string / raw
			b, _ := json.Marshal(p.CalibData)
			_ = json.Unmarshal(b, &coeffs)
		}
		calib, err := calibration.NewPolynomialCalibrator(coeffs)
		if err != nil {
			return err
		}
		p.calibrator = calib
		return nil

	case "LUT":
		var points []calibration.LUTPoint
		b, _ := json.Marshal(p.CalibData)
		if err := json.Unmarshal(b, &points); err != nil {
			return fmt.Errorf("%w: failed to parse LUT points: %v", ErrInvalidCalibType, err)
		}
		calib, err := calibration.NewLUTCalibrator(points)
		if err != nil {
			return err
		}
		p.calibrator = calib
		return nil

	case "SPLINE":
		var points []calibration.LUTPoint
		b, _ := json.Marshal(p.CalibData)
		if err := json.Unmarshal(b, &points); err != nil {
			return fmt.Errorf("%w: failed to parse spline points: %v", ErrInvalidCalibType, err)
		}
		calib, err := calibration.NewCubicSplineCalibrator(points)
		if err != nil {
			return err
		}
		p.calibrator = calib
		return nil

	default:
		return fmt.Errorf("%w: %s", ErrInvalidCalibType, p.CalibType)
	}
}

// Extract extracts and calibrates this parameter from packet data
func (p *Parameter) Extract(r *bitreader.Reader, timestamp time.Time, packetSeq uint16) (*telemetry.DecodedParameter, error) {
	if p.calibrator == nil {
		if err := p.Compile(); err != nil {
			return nil, err
		}
	}

	order := bitreader.BigEndian
	if p.ByteOrder == "LITTLE_ENDIAN" {
		order = bitreader.LittleEndian
	}

	var dn int64
	var rawFloat float64
	var isFloat bool

	switch p.DataType {
	case "BOOL":
		b, err := r.ReadBool(p.BitOffset)
		if err != nil {
			return nil, err
		}
		if b {
			dn = 1
		} else {
			dn = 0
		}

	case "UINT":
		u, err := r.ReadBitsUint64(p.BitOffset, p.BitLength, order)
		if err != nil {
			return nil, err
		}
		dn = int64(u)

	case "INT":
		i, err := r.ReadInt64(p.BitOffset, p.BitLength, order)
		if err != nil {
			return nil, err
		}
		dn = i

	case "FLOAT":
		isFloat = true
		if p.BitLength == 32 {
			f, err := r.ReadFloat32(p.BitOffset, order)
			if err != nil {
				return nil, err
			}
			rawFloat = float64(f)
		} else if p.BitLength == 64 {
			f, err := r.ReadFloat64(p.BitOffset, order)
			if err != nil {
				return nil, err
			}
			rawFloat = f
		} else {
			return nil, fmt.Errorf("invalid float bit length %d", p.BitLength)
		}

	default:
		return nil, fmt.Errorf("%w: %s", ErrUnknownDataType, p.DataType)
	}

	var eu float64
	var err error
	if isFloat {
		eu, err = p.calibrator.Calibrate(rawFloat)
		dn = int64(rawFloat)
	} else {
		eu, err = p.calibrator.Calibrate(float64(dn))
	}
	if err != nil {
		return nil, fmt.Errorf("calibration failed for %s: %w", p.Name, err)
	}

	alarmState := p.evaluateAlarm(eu)

	return &telemetry.DecodedParameter{
		SCID:       p.SCID,
		APID:       p.APID,
		ParamName:  p.Name,
		RawValue:   dn,
		EUValue:    eu,
		EUUnit:     p.Unit,
		Quality:    telemetry.QualityGood,
		Timestamp:  timestamp,
		AlarmState: alarmState,
		PacketSeq:  packetSeq,
	}, nil
}

func (p *Parameter) evaluateAlarm(eu float64) telemetry.AlarmState {
	if p.Alarms == nil || !p.Alarms.AlarmEnabled {
		return telemetry.AlarmNormal
	}

	if p.Alarms.HighHighLimit != nil && eu >= *p.Alarms.HighHighLimit {
		return telemetry.AlarmHighHigh
	}
	if p.Alarms.LowLowLimit != nil && eu <= *p.Alarms.LowLowLimit {
		return telemetry.AlarmLowLow
	}
	if p.Alarms.HighLimit != nil && eu >= *p.Alarms.HighLimit {
		return telemetry.AlarmHigh
	}
	if p.Alarms.LowLimit != nil && eu <= *p.Alarms.LowLimit {
		return telemetry.AlarmLow
	}

	return telemetry.AlarmNormal
}

// ParameterSet is a collection of XTCE parameters associated with an APID
type ParameterSet struct {
	SCID       uint16       `json:"scid"`
	APID       uint16       `json:"apid"`
	Name       string       `json:"name,omitempty"` // subsystem, e.g. POWER
	Parameters []*Parameter `json:"parameters"`

	// Time-correlation defaults compiled into the dictionary (FR-TMP-02): the
	// packet data field starts with TimeHeaderBytes of on-board time (CUC:
	// 4 coarse + 2 fine bytes = 1/65536 s ticks) counting from TimeEpoch.
	TimeHeaderBytes int     `json:"time_header_bytes,omitempty"`
	TimeEpoch       string  `json:"time_epoch,omitempty"` // RFC3339
	TimeTicksPerSec float64 `json:"time_ticks_per_sec,omitempty"`
}

// Decommutate extracts all parameters from a space packet payload
func (ps *ParameterSet) Decommutate(payload []byte, timestamp time.Time, packetSeq uint16) ([]*telemetry.DecodedParameter, error) {
	r := bitreader.NewReader(payload)
	results := make([]*telemetry.DecodedParameter, 0, len(ps.Parameters))

	for _, param := range ps.Parameters {
		dp, err := param.Extract(r, timestamp, packetSeq)
		if err != nil {
			return nil, fmt.Errorf("failed decommutating param %s: %w", param.Name, err)
		}
		results = append(results, dp)
	}

	return results, nil
}
