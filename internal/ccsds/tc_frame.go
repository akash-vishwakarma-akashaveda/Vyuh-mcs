package ccsds

import (
	"encoding/binary"
	"errors"
	"fmt"
)

var (
	ErrTCFrameTooShort     = errors.New("TC frame is shorter than 7 bytes (header 5 + FECF 2)")
	ErrInvalidTCVersion    = errors.New("invalid TC frame version (must be 0b00)")
	ErrTCFrameLengthMismatch = errors.New("TC frame length field does not match data length")
	ErrTCCRCMismatch       = errors.New("TC frame CRC-16 mismatch")
)

// ParseTCFrame parses a CCSDS 232.0-B-4 TC Transfer Frame from raw bytes
func ParseTCFrame(data []byte) (*TCTransferFrame, error) {
	if len(data) < 7 { // Header (5) + CRC (2)
		return nil, ErrTCFrameTooShort
	}

	calcCRC := ComputeCRC16CCITT(data[:len(data)-2])
	frameCRC := binary.BigEndian.Uint16(data[len(data)-2:])
	if calcCRC != frameCRC {
		return nil, fmt.Errorf("%w: computed 0x%04X != frame 0x%04X", ErrTCCRCMismatch, calcCRC, frameCRC)
	}

	u32 := binary.BigEndian.Uint32(data[0:4])
	seqNumber := data[4]

	version := uint8((u32 >> 30) & 0x03)
	if version != 0 {
		return nil, fmt.Errorf("%w: got %d", ErrInvalidTCVersion, version)
	}

	bypassFlag := ((u32 >> 29) & 0x01) == 1
	controlFlag := ((u32 >> 28) & 0x01) == 1
	reserved := uint8((u32 >> 26) & 0x03)
	scid := uint16((u32 >> 16) & 0x03FF)
	vcid := uint8((u32 >> 10) & 0x3F)
	frameLen := uint16(u32 & 0x03FF)

	expectedTotalLen := int(frameLen) + 1
	if len(data) != expectedTotalLen {
		return nil, fmt.Errorf("%w: expected %d bytes, got %d", ErrTCFrameLengthMismatch, expectedTotalLen, len(data))
	}

	payload := data[5 : len(data)-2]

	return &TCTransferFrame{
		TransferFrameVersion: version,
		BypassFlag:           bypassFlag,
		ControlCommandFlag:   controlFlag,
		Reserved:             reserved,
		SpacecraftID:         scid,
		VirtualChannelID:     vcid,
		FrameLength:          frameLen,
		SeqNumber:            seqNumber,
		Data:                 payload,
		FECF:                 frameCRC,
	}, nil
}

// Marshal serializes a TC Transfer Frame, automatically calculating FrameLength and CRC-16
func (f *TCTransferFrame) Marshal() []byte {
	totalLen := 5 + len(f.Data) + 2 // Header (5) + Data + CRC (2)
	buf := make([]byte, totalLen)

	var u32 uint32
	u32 |= (uint32(f.TransferFrameVersion&0x03) << 30)
	if f.BypassFlag {
		u32 |= (1 << 29)
	}
	if f.ControlCommandFlag {
		u32 |= (1 << 28)
	}
	u32 |= (uint32(f.Reserved&0x03) << 26)
	u32 |= (uint32(f.SpacecraftID&0x03FF) << 16)
	u32 |= (uint32(f.VirtualChannelID&0x3F) << 10)
	u32 |= uint32(totalLen - 1) // FrameLength = total octets - 1

	binary.BigEndian.PutUint32(buf[0:4], u32)
	buf[4] = f.SeqNumber

	copy(buf[5:], f.Data)

	crc := ComputeCRC16CCITT(buf[:totalLen-2])
	binary.BigEndian.PutUint16(buf[totalLen-2:], crc)

	return buf
}
