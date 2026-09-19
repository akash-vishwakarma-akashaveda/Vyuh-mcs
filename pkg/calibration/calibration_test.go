package calibration

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestPolynomialCalibrator(t *testing.T) {
	// y = 5 + 2x + 0.5x^2
	// For x = 4: y = 5 + 8 + 0.5(16) = 21
	poly, err := NewPolynomialCalibrator([]float64{5.0, 2.0, 0.5})
	assert.NoError(t, err)

	val, err := poly.Calibrate(4.0)
	assert.NoError(t, err)
	assert.InDelta(t, 21.0, val, 1e-9)
}

func TestLUTCalibrator(t *testing.T) {
	points := []LUTPoint{
		{DN: 0, EU: 0},
		{DN: 100, EU: 25},
		{DN: 200, EU: 100},
	}
	lut, err := NewLUTCalibrator(points)
	assert.NoError(t, err)

	// Midpoint interpolation: x = 50 -> y = 12.5
	val, err := lut.Calibrate(50)
	assert.NoError(t, err)
	assert.InDelta(t, 12.5, val, 1e-9)

	// Clamp below
	valBelow, err := lut.Calibrate(-10)
	assert.NoError(t, err)
	assert.Equal(t, 0.0, valBelow)

	// Clamp above
	valAbove, err := lut.Calibrate(300)
	assert.NoError(t, err)
	assert.Equal(t, 100.0, valAbove)
}

func TestCubicSplineCalibrator(t *testing.T) {
	points := []LUTPoint{
		{DN: 0, EU: 0},
		{DN: 1, EU: 1},
		{DN: 2, EU: 8},
		{DN: 3, EU: 27},
	}
	spline, err := NewCubicSplineCalibrator(points)
	assert.NoError(t, err)

	// Exact point checks
	val, err := spline.Calibrate(1.0)
	assert.NoError(t, err)
	assert.InDelta(t, 1.0, val, 1e-6)

	val, err = spline.Calibrate(2.0)
	assert.NoError(t, err)
	assert.InDelta(t, 8.0, val, 1e-6)

	// Intermediate value
	valMid, err := spline.Calibrate(1.5)
	assert.NoError(t, err)
	assert.True(t, valMid > 1.0 && valMid < 8.0)
}
