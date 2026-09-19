package bitreader

import (
	"encoding/binary"
	"errors"
	"fmt"
	"math"
)

var (
	ErrOutOfBounds = errors.New("bit offset and length exceed buffer boundary")
	ErrInvalidLen  = errors.New("invalid bit length")
)

// Endianness defines byte order for multi-byte values
type Endianness int

const (
	BigEndian Endianness = iota
	LittleEndian
)

// Reader provides bit-level reading from a byte slice.
type Reader struct {
	data []byte
	len  int // total bits
}

// NewReader creates a bit reader wrapping the provided byte slice.
func NewReader(data []byte) *Reader {
	return &Reader{
		data: data,
		len:  len(data) * 8,
	}
}

// ReadBitsUint64 extracts up to 64 bits starting at bitOffset.
// Bits are numbered 0 = MSB of byte 0, 7 = LSB of byte 0, 8 = MSB of byte 1, etc.
func (r *Reader) ReadBitsUint64(bitOffset int, bitLen int, order Endianness) (uint64, error) {
	if bitLen <= 0 || bitLen > 64 {
		return 0, fmt.Errorf("%w: %d (must be 1..64)", ErrInvalidLen, bitLen)
	}
	if bitOffset < 0 || bitOffset+bitLen > r.len {
		return 0, fmt.Errorf("%w: offset=%d len=%d total_bits=%d", ErrOutOfBounds, bitOffset, bitLen, r.len)
	}

	startByte := bitOffset / 8
	endByte := (bitOffset + bitLen - 1) / 8

	var raw uint64
	for i := startByte; i <= endByte; i++ {
		raw = (raw << 8) | uint64(r.data[i])
	}

	totalBitsInWindow := (endByte - startByte + 1) * 8
	shiftRight := totalBitsInWindow - ((bitOffset % 8) + bitLen)
	val := (raw >> shiftRight) & ((1 << bitLen) - 1)

	if order == LittleEndian && bitLen > 8 && bitLen%8 == 0 {
		val = swapBytesForLen(val, bitLen/8)
	}

	return val, nil
}

// ReadBool reads a single bit at bitOffset as a boolean.
func (r *Reader) ReadBool(bitOffset int) (bool, error) {
	val, err := r.ReadBitsUint64(bitOffset, 1, BigEndian)
	if err != nil {
		return false, err
	}
	return val == 1, nil
}

// ReadUint8 reads an 8-bit unsigned integer at bitOffset.
func (r *Reader) ReadUint8(bitOffset int) (uint8, error) {
	val, err := r.ReadBitsUint64(bitOffset, 8, BigEndian)
	return uint8(val), err
}

// ReadUint16 reads a 16-bit unsigned integer at bitOffset.
func (r *Reader) ReadUint16(bitOffset int, order Endianness) (uint16, error) {
	val, err := r.ReadBitsUint64(bitOffset, 16, order)
	return uint16(val), err
}

// ReadUint32 reads a 32-bit unsigned integer at bitOffset.
func (r *Reader) ReadUint32(bitOffset int, order Endianness) (uint32, error) {
	val, err := r.ReadBitsUint64(bitOffset, 32, order)
	return uint32(val), err
}

// ReadUint64 reads a 64-bit unsigned integer at bitOffset.
func (r *Reader) ReadUint64(bitOffset int, order Endianness) (uint64, error) {
	return r.ReadBitsUint64(bitOffset, 64, order)
}

// ReadInt64 reads a signed integer of bitLen bits with two's complement sign extension.
func (r *Reader) ReadInt64(bitOffset int, bitLen int, order Endianness) (int64, error) {
	uVal, err := r.ReadBitsUint64(bitOffset, bitLen, order)
	if err != nil {
		return 0, err
	}

	// Sign extension if MSB is set
	if bitLen < 64 && (uVal&(1<<uint(bitLen-1))) != 0 {
		uVal |= ^((1 << uint(bitLen)) - 1)
	}

	return int64(uVal), nil
}

// ReadFloat32 reads a 32-bit IEEE 754 float at bitOffset.
func (r *Reader) ReadFloat32(bitOffset int, order Endianness) (float32, error) {
	bits, err := r.ReadBitsUint64(bitOffset, 32, order)
	if err != nil {
		return 0, err
	}
	return math.Float32frombits(uint32(bits)), nil
}

// ReadFloat64 reads a 64-bit IEEE 754 float at bitOffset.
func (r *Reader) ReadFloat64(bitOffset int, order Endianness) (float64, error) {
	bits, err := r.ReadBitsUint64(bitOffset, 64, order)
	if err != nil {
		return 0, err
	}
	return math.Float64frombits(bits), nil
}

// ReadBytes extracts numBytes starting at byte-aligned or non-aligned bit offset.
func (r *Reader) ReadBytes(bitOffset int, numBytes int) ([]byte, error) {
	if numBytes <= 0 {
		return []byte{}, nil
	}
	if bitOffset < 0 || bitOffset+numBytes*8 > r.len {
		return nil, ErrOutOfBounds
	}

	out := make([]byte, numBytes)
	for i := 0; i < numBytes; i++ {
		b, err := r.ReadUint8(bitOffset + i*8)
		if err != nil {
			return nil, err
		}
		out[i] = b
	}
	return out, nil
}

func swapBytesForLen(val uint64, bytes int) uint64 {
	switch bytes {
	case 2:
		return uint64(binary.LittleEndian.Uint16([]byte{byte(val >> 8), byte(val)}))
	case 4:
		b := make([]byte, 4)
		binary.BigEndian.PutUint32(b, uint32(val))
		return uint64(binary.LittleEndian.Uint32(b))
	case 8:
		b := make([]byte, 8)
		binary.BigEndian.PutUint64(b, val)
		return binary.LittleEndian.Uint64(b)
	default:
		return val
	}
}
