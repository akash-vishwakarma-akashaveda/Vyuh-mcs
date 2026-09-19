package ccsds

import (
	"encoding/binary"
	"errors"
	"fmt"
)

var (
	ErrInvalidCLCWLength = errors.New("CLCW data must be exactly 4 bytes (32 bits)")
	ErrInvalidCLCWType   = errors.New("invalid CLCW type bit (must be 0)")
)

// ParseCLCW unpacks a 32-bit CLCW word from big-endian bytes
func ParseCLCW(data []byte) (*CLCW, error) {
	if len(data) < 4 {
		return nil, ErrInvalidCLCWLength
	}

	word := binary.BigEndian.Uint32(data[:4])

	cwType := uint8((word >> 31) & 0x01)
	if cwType != 0 {
		return nil, fmt.Errorf("%w: got %d", ErrInvalidCLCWType, cwType)
	}

	return &CLCW{
		ControlWordType:  cwType,
		CLCWVersion:      uint8((word >> 29) & 0x03),
		StatusField:      uint8((word >> 26) & 0x07),
		CopInEffect:      uint8((word >> 24) & 0x03),
		VirtualChannelID: uint8((word >> 18) & 0x3F),
		ReservedB:        uint8((word >> 16) & 0x03),
		NoRF:             ((word >> 15) & 0x01) == 1,
		NoBitLock:        ((word >> 14) & 0x01) == 1,
		Lockout:          ((word >> 13) & 0x01) == 1,
		Wait:             ((word >> 12) & 0x01) == 1,
		Retransmit:       ((word >> 11) & 0x01) == 1,
		FarmerBCounter:   uint8((word >> 9) & 0x03),
		Reserved:         uint8((word >> 8) & 0x01),
		ReportValue:      uint8(word & 0xFF),
	}, nil
}

// Marshal serializes a CLCW struct into 4 big-endian bytes
func (c *CLCW) Marshal() []byte {
	var word uint32

	word |= (uint32(c.ControlWordType&0x01) << 31)
	word |= (uint32(c.CLCWVersion&0x03) << 29)
	word |= (uint32(c.StatusField&0x07) << 26)
	word |= (uint32(c.CopInEffect&0x03) << 24)
	word |= (uint32(c.VirtualChannelID&0x3F) << 18)
	word |= (uint32(c.ReservedB&0x03) << 16)

	if c.NoRF {
		word |= (1 << 15)
	}
	if c.NoBitLock {
		word |= (1 << 14)
	}
	if c.Lockout {
		word |= (1 << 13)
	}
	if c.Wait {
		word |= (1 << 12)
	}
	if c.Retransmit {
		word |= (1 << 11)
	}

	word |= (uint32(c.FarmerBCounter&0x03) << 9)
	word |= (uint32(c.Reserved&0x01) << 8)
	word |= uint32(c.ReportValue)

	buf := make([]byte, 4)
	binary.BigEndian.PutUint32(buf, word)
	return buf
}
