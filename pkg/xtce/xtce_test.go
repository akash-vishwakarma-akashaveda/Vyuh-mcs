package xtce

import (
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/telemetry"
	"github.com/stretchr/testify/assert"
)

func TestXTCE_Decommutate(t *testing.T) {
	// Let's create a simulated packet payload:
	// Byte 0: Battery Voltage high byte (DN=2800 -> 28.00V)
	// Byte 1: Battery Voltage low byte
	// Byte 2: Battery Temp (DN=45 -> 45 degC)
	// Byte 3: Heater Status (bit 0 = 1, rest 0)
	payload := []byte{
		0x0A, 0xF0, // 2800 in uint16
		0x2D,       // 45 in uint8
		0x80,       // bit 0 is 1 (Heater ON)
	}

	highLimit := 40.0
	highHighLimit := 50.0

	paramSet := &ParameterSet{
		SCID: 1,
		APID: 100,
		Parameters: []*Parameter{
			{
				SCID:      1,
				APID:      100,
				Name:      "BATT_VOLTAGE",
				DataType:  "UINT",
				BitOffset: 0,
				BitLength: 16,
				Unit:      "V",
				CalibType: "POLYNOMIAL",
				CalibData: []float64{0.0, 0.01}, // EU = 0.01 * DN
			},
			{
				SCID:      1,
				APID:      100,
				Name:      "BATT_TEMP",
				DataType:  "UINT",
				BitOffset: 16,
				BitLength: 8,
				Unit:      "degC",
				CalibType: "NONE",
				Alarms: &AlarmLimits{
					HighLimit:     &highLimit,
					HighHighLimit: &highHighLimit,
					AlarmEnabled:  true,
				},
			},
			{
				SCID:      1,
				APID:      100,
				Name:      "HEATER_ACTIVE",
				DataType:  "BOOL",
				BitOffset: 24,
				BitLength: 1,
				CalibType: "NONE",
			},
		},
	}

	now := time.Now()
	decoded, err := paramSet.Decommutate(payload, now, 12)
	assert.NoError(t, err)
	assert.Equal(t, 3, len(decoded))

	// Verify Voltage
	assert.Equal(t, "BATT_VOLTAGE", decoded[0].ParamName)
	assert.Equal(t, int64(2800), decoded[0].RawValue)
	assert.InDelta(t, 28.00, decoded[0].EUValue, 0.001)
	assert.Equal(t, "V", decoded[0].EUUnit)
	assert.Equal(t, telemetry.AlarmNormal, decoded[0].AlarmState)

	// Verify Temp
	assert.Equal(t, "BATT_TEMP", decoded[1].ParamName)
	assert.Equal(t, int64(45), decoded[1].RawValue)
	assert.InDelta(t, 45.0, decoded[1].EUValue, 0.001)
	assert.Equal(t, telemetry.AlarmHigh, decoded[1].AlarmState) // > 40.0, < 50.0

	// Verify Heater
	assert.Equal(t, "HEATER_ACTIVE", decoded[2].ParamName)
	assert.Equal(t, int64(1), decoded[2].RawValue)
	assert.Equal(t, 1.0, decoded[2].EUValue)
}
