package bitreader

import (
	"math"
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestBitReader_Basic(t *testing.T) {
	// 0x1A, 0xCF, 0xFC, 0x1D (CCSDS ASM)
	data := []byte{0x1A, 0xCF, 0xFC, 0x1D}
	r := NewReader(data)

	// Read 32-bit ASM
	asm, err := r.ReadUint32(0, BigEndian)
	assert.NoError(t, err)
	assert.Equal(t, uint32(0x1ACFFC1D), asm)

	// Read 2-bit version (0b00)
	v, err := r.ReadBitsUint64(0, 2, BigEndian)
	assert.NoError(t, err)
	assert.Equal(t, uint64(0), v)

	// Read next 6 bits (0b011010 = 26)
	sub, err := r.ReadBitsUint64(2, 6, BigEndian)
	assert.NoError(t, err)
	assert.Equal(t, uint64(26), sub)

	// Read boolean
	b, err := r.ReadBool(3) // 4th bit of 0x1A (0001 1010) -> bit index 3 is '1'
	assert.NoError(t, err)
	assert.True(t, b)
}

func TestBitReader_SignedInt(t *testing.T) {
	// Negative number in 8 bits: -10 = 0xF6
	data := []byte{0xF6, 0x00}
	r := NewReader(data)

	val, err := r.ReadInt64(0, 8, BigEndian)
	assert.NoError(t, err)
	assert.Equal(t, int64(-10), val)

	// 12-bit signed: 0xFFF = -1
	data12 := []byte{0xFF, 0xF0}
	r12 := NewReader(data12)
	val12, err := r12.ReadInt64(0, 12, BigEndian)
	assert.NoError(t, err)
	assert.Equal(t, int64(-1), val12)
}

func TestBitReader_Float(t *testing.T) {
	buf := make([]byte, 4)
	mathVal := float32(28.4)
	bits := math.Float32bits(mathVal)
	buf[0] = byte(bits >> 24)
	buf[1] = byte(bits >> 16)
	buf[2] = byte(bits >> 8)
	buf[3] = byte(bits)

	r := NewReader(buf)
	fVal, err := r.ReadFloat32(0, BigEndian)
	assert.NoError(t, err)
	assert.InDelta(t, mathVal, fVal, 0.0001)
}

func TestBitReader_OutOfBounds(t *testing.T) {
	data := []byte{0x01, 0x02}
	r := NewReader(data)

	_, err := r.ReadBitsUint64(10, 8, BigEndian) // 10+8=18 > 16
	assert.ErrorIs(t, err, ErrOutOfBounds)

	_, err = r.ReadBitsUint64(0, 65, BigEndian)
	assert.ErrorIs(t, err, ErrInvalidLen)
}
