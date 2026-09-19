package calibration

import (
	"errors"
	"fmt"
	"math"
	"sort"
)

var (
	ErrEmptyCalibData  = errors.New("calibration data is empty")
	ErrInvalidCalib    = errors.New("invalid calibration parameters")
	ErrOutOfDomain     = errors.New("value outside calibration domain")
	ErrDivisionByZero  = errors.New("division by zero during calibration")
)

// Calibrator transforms raw data number (DN) to engineering units (EU).
type Calibrator interface {
	Calibrate(dn float64) (float64, error)
}

// NoneCalibrator performs pass-through without modification.
type NoneCalibrator struct{}

func (n *NoneCalibrator) Calibrate(dn float64) (float64, error) {
	return dn, nil
}

// PolynomialCalibrator computes EU = a0 + a1*DN + a2*DN^2 + ... + an*DN^n
type PolynomialCalibrator struct {
	Coefficients []float64 // [a0, a1, a2, ...]
}

func NewPolynomialCalibrator(coeffs []float64) (*PolynomialCalibrator, error) {
	if len(coeffs) == 0 {
		return nil, ErrEmptyCalibData
	}
	return &PolynomialCalibrator{Coefficients: coeffs}, nil
}

func (p *PolynomialCalibrator) Calibrate(dn float64) (float64, error) {
	if len(p.Coefficients) == 0 {
		return dn, nil
	}
	// Horner's method for numerical stability & speed
	res := p.Coefficients[len(p.Coefficients)-1]
	for i := len(p.Coefficients) - 2; i >= 0; i-- {
		res = res*dn + p.Coefficients[i]
	}
	return res, nil
}

// LUTPoint represents a point in a look-up table
type LUTPoint struct {
	DN float64 `json:"dn"`
	EU float64 `json:"eu"`
}

// LUTCalibrator performs piecewise linear interpolation over a lookup table
type LUTCalibrator struct {
	Points []LUTPoint
}

func NewLUTCalibrator(points []LUTPoint) (*LUTCalibrator, error) {
	if len(points) < 2 {
		return nil, fmt.Errorf("%w: at least 2 points required for LUT", ErrInvalidCalib)
	}

	// Copy and sort by DN ascending
	sorted := make([]LUTPoint, len(points))
	copy(sorted, points)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].DN < sorted[j].DN
	})

	// Check for strictly increasing DN
	for i := 1; i < len(sorted); i++ {
		if sorted[i].DN <= sorted[i-1].DN {
			return nil, fmt.Errorf("%w: duplicate or non-increasing DN at index %d", ErrInvalidCalib, i)
		}
	}

	return &LUTCalibrator{Points: sorted}, nil
}

func (l *LUTCalibrator) Calibrate(dn float64) (float64, error) {
	n := len(l.Points)
	if dn <= l.Points[0].DN {
		return l.Points[0].EU, nil
	}
	if dn >= l.Points[n-1].DN {
		return l.Points[n-1].EU, nil
	}

	// Binary search for interval
	idx := sort.Search(n, func(i int) bool {
		return l.Points[i].DN >= dn
	})

	if idx == 0 {
		return l.Points[0].EU, nil
	}

	p0 := l.Points[idx-1]
	p1 := l.Points[idx]

	span := p1.DN - p0.DN
	if span == 0 {
		return p0.EU, nil
	}

	t := (dn - p0.DN) / span
	return p0.EU + t*(p1.EU-p0.EU), nil
}

// CubicSplineCalibrator performs natural cubic spline interpolation
type CubicSplineCalibrator struct {
	x []float64 // control DNs
	y []float64 // control EUs
	b []float64
	c []float64
	d []float64
}

func NewCubicSplineCalibrator(points []LUTPoint) (*CubicSplineCalibrator, error) {
	n := len(points)
	if n < 3 {
		return nil, fmt.Errorf("%w: cubic spline requires at least 3 points", ErrInvalidCalib)
	}

	sorted := make([]LUTPoint, len(points))
	copy(sorted, points)
	sort.Slice(sorted, func(i, j int) bool {
		return sorted[i].DN < sorted[j].DN
	})

	x := make([]float64, n)
	y := make([]float64, n)
	for i, pt := range sorted {
		if i > 0 && pt.DN <= sorted[i-1].DN {
			return nil, fmt.Errorf("%w: duplicate or non-increasing DN", ErrInvalidCalib)
		}
		x[i] = pt.DN
		y[i] = pt.EU
	}

	h := make([]float64, n-1)
	for i := 0; i < n-1; i++ {
		h[i] = x[i+1] - x[i]
		if h[i] <= 0 {
			return nil, ErrInvalidCalib
		}
	}

	alpha := make([]float64, n-1)
	for i := 1; i < n-1; i++ {
		alpha[i] = (3.0/h[i])*(y[i+1]-y[i]) - (3.0/h[i-1])*(y[i]-y[i-1])
	}

	l := make([]float64, n)
	mu := make([]float64, n)
	z := make([]float64, n)
	l[0] = 1.0

	for i := 1; i < n-1; i++ {
		l[i] = 2.0*(x[i+1]-x[i-1]) - h[i-1]*mu[i-1]
		if math.Abs(l[i]) < 1e-12 {
			return nil, ErrDivisionByZero
		}
		mu[i] = h[i] / l[i]
		z[i] = (alpha[i] - h[i-1]*z[i-1]) / l[i]
	}
	l[n-1] = 1.0

	c := make([]float64, n)
	b := make([]float64, n-1)
	d := make([]float64, n-1)

	for j := n - 2; j >= 0; j-- {
		c[j] = z[j] - mu[j]*c[j+1]
		b[j] = (y[j+1]-y[j])/h[j] - h[j]*(c[j+1]+2.0*c[j])/3.0
		d[j] = (c[j+1] - c[j]) / (3.0 * h[j])
	}

	return &CubicSplineCalibrator{
		x: x,
		y: y,
		b: b,
		c: c,
		d: d,
	}, nil
}

func (s *CubicSplineCalibrator) Calibrate(dn float64) (float64, error) {
	n := len(s.x)
	if dn <= s.x[0] {
		// Linear extrapolation using first interval derivative
		dx := dn - s.x[0]
		return s.y[0] + s.b[0]*dx, nil
	}
	if dn >= s.x[n-1] {
		// Linear extrapolation using last point derivative
		dx := dn - s.x[n-1]
		lastIdx := n - 2
		h := s.x[n-1] - s.x[lastIdx]
		slope := s.b[lastIdx] + 2.0*s.c[lastIdx]*h + 3.0*s.d[lastIdx]*h*h
		return s.y[n-1] + slope*dx, nil
	}

	// Binary search for bracket
	idx := sort.Search(n, func(i int) bool {
		return s.x[i] >= dn
	})
	if idx > 0 {
		idx--
	}
	if idx >= n-1 {
		idx = n - 2
	}

	dx := dn - s.x[idx]
	res := s.y[idx] + s.b[idx]*dx + s.c[idx]*dx*dx + s.d[idx]*dx*dx*dx
	return res, nil
}
