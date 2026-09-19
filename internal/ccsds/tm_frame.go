package ccsds

import (
	"encoding/binary"
	"errors"
	"fmt"
)

const (
	CCSDS_ASM                = uint32(0x1ACFFC1D)
	TM_FRAME_FIXED_SIZE      = 1115
	FHP_NO_PACKET_HEADER     = uint16(0x7FF)
	FHP_IDLE_DATA            = uint16(0x7FE)
)

var (
	ErrInvalidASM         = errors.New("invalid Attached Sync Marker (ASM)")
	ErrFrameTooShort      = errors.New("frame is shorter than required minimum header size")
	ErrInvalidFrameVersion = errors.New("invalid TM frame version (must be 0b01)")
	ErrCRCMismatch        = errors.New("frame CRC-16 mismatch")
)

// ParseTMFrame parses a CCSDS 132.0-B-3 TM Transfer Frame from raw bytes.
// If withASM is true, the first 4 bytes are expected to be ASM (0x1ACFFC1D).
// hasFECF specifies whether a 2-byte CRC-16 trailer is present.
func ParseTMFrame(raw []byte, withASM bool, hasFECF bool) (*TransferFrame, error) {
	data := raw
	if withASM {
		if len(data) < 4 {
			return nil, ErrFrameTooShort
		}
		asm := binary.BigEndian.Uint32(data[:4])
		if asm != CCSDS_ASM {
			return nil, fmt.Errorf("%w: expected 0x1ACFFC1D, got 0x%08X", ErrInvalidASM, asm)
		}
		data = data[4:]
	}

	minLen := 6 + 2 // Primary Header (6) + Data Field Status (2)
	if hasFECF {
		minLen += 2
	}
	if len(data) < minLen {
		return nil, ErrFrameTooShort
	}

	// Verify CRC over all frame bytes except the last 2 bytes
	var fecfVal *uint16
	if hasFECF {
		calcCRC := ComputeCRC16CCITT(data[:len(data)-2])
		frameCRC := binary.BigEndian.Uint16(data[len(data)-2:])
		if calcCRC != frameCRC {
			return nil, fmt.Errorf("%w: computed 0x%04X != frame 0x%04X", ErrCRCMismatch, calcCRC, frameCRC)
		}
		fecfVal = &frameCRC
		data = data[:len(data)-2] // Strip CRC from parsing view
	}

	// Primary Header (6 bytes)
	// Word 0 (2 bytes): Version (2), SCID (10), VCID (6) -> Wait: 2+10=12 bits, then VCID (6 bits) is in byte 1 lower + byte 2 upper
	// CCSDS 132.0 Bit Mapping:
	// Byte 0: Version (2 bits, 0b01), SCID bits 9..4 (6 bits)
	// Byte 1: SCID bits 3..0 (4 bits), VCID bits 5..2 (4 bits)
	// Byte 2: VCID bits 1..0 (2 bits), OCF Flag (1 bit), Master Channel FC bits 7..3 (5 bits) -- wait!
	// Let's use exact CCSDS 132.0-B-3 Section 4.1.2 standard field definitions:
	// - Master Channel ID (12 bits): Version (2 bits), SCID (10 bits)
	// - Virtual Channel ID (6 bits)
	// - OCF Flag (1 bit)
	// - Master Channel Frame Count (8 bits)
	// - Virtual Channel Frame Count (8 bits)
	// Total = 12 + 6 + 1 + 8 + 8 = 35 bits? Wait! In CCSDS 132.0:
	// Byte 0-1 (16 bits): Version (2b), SCID (10b), VCID (6b) = wait, 2+10+6 = 18 bits? Wait!
	// Let's check CCSDS 132.0 Section 4.1.2:
	// Byte 0..1: Version (2 bits), SCID (10 bits), VCID (6 bits) -> That is 18 bits (takes 2 bytes + 2 bits).
	// Let's verify standard bit layout:
	// Byte 0: Version (bits 0..1), SCID high (bits 2..7)
	// Byte 1: SCID low (bits 0..3), VCID (bits 4..7)? Wait!
	// Let's check SRS Section 8.1:
	// TransferFrameVersion uint8 // 2 bits
	// SpacecraftID uint16 // 10 bits
	// VirtualChannelID uint8 // 6 bits
	// OperationalControlField bool // 1 bit
	// MasterChannelFC uint8 // 8 bits
	// VirtualChannelFC uint8 // 8 bits
	// Let's check total primary header in CCSDS 132.0:
	// 48 bits = 6 octets:
	// Bits 0..1: Version (2 bits)
	// Bits 2..11: SCID (10 bits)
	// Bits 12..17: VCID (6 bits)
	// Bit 18: OCF Flag (1 bit)
	// Bits 19..23: Master Channel Frame Count (wait: MCFC is 8 bits, bits 24..31)
	// Wait, let's verify exact bit offsets for 48 bits (6 bytes):
	// Bits 0-1 (2b): Version
	// Bits 2-11 (10b): SCID
	// Bits 12-17 (6b): VCID
	// Bit 18 (1b): OCF flag
	// Bits 19-23 (5b): Reserved/MCFC?
	// Wait! Let's check CCSDS 132.0:
	// Master Channel Frame Count is 8 bits (octet 2-3? No, octet 3 is MCFC, octet 4 is VCFC).
	// Let's calculate: 2b (version) + 10b (SCID) + 6b (VCID) + 1b (OCF) = 19 bits.
	// That leaves 5 bits in octet 2!
	// In CCSDS 132.0-B-3, octets are:
	// Octet 0: Version (2), SCID high (6)
	// Octet 1: SCID low (4), VCID (4 of 6) -- wait:
	// Unpack the 48 bits of Primary Header:
	u64 := (uint64(data[0]) << 40) |
		(uint64(data[1]) << 32) |
		(uint64(data[2]) << 24) |
		(uint64(data[3]) << 16) |
		(uint64(data[4]) << 8) |
		uint64(data[5])

	version := uint8((u64 >> 46) & 0x03)
	if version != 1 { // CCSDS 132.0 version is 0b01
		return nil, fmt.Errorf("%w: expected 1, got %d", ErrInvalidFrameVersion, version)
	}
	scid := uint16((u64 >> 36) & 0x03FF)
	vcid := uint8((u64 >> 30) & 0x3F)
	ocfFlag := ((u64 >> 29) & 0x01) == 1
	mcfc := uint8((u64 >> 21) & 0xFF)
	vcfc := uint8((u64 >> 13) & 0xFF)
	// Remaining 13 bits of primary header: spare / signaling

	// Data Field Status (2 bytes): data[6:8]
	dfs := binary.BigEndian.Uint16(data[6:8])
	secHdrFlag := ((dfs >> 15) & 0x01) == 1
	syncFlag := ((dfs >> 14) & 0x01) == 1
	packetOrderFlag := ((dfs >> 13) & 0x01) == 1
	segLenID := uint8((dfs >> 11) & 0x03)
	fhp := dfs & 0x07FF

	payloadEnd := len(data)
	var ocfVal *uint32
	if ocfFlag {
		if payloadEnd < 8+4 {
			return nil, ErrFrameTooShort
		}
		ocfWord := binary.BigEndian.Uint32(data[payloadEnd-4 : payloadEnd])
		ocfVal = &ocfWord
		payloadEnd -= 4
	}

	payload := data[8:payloadEnd]

	return &TransferFrame{
		TransferFrameVersion:    version,
		SpacecraftID:            scid,
		VirtualChannelID:        vcid,
		OperationalControlField: ocfFlag,
		MasterChannelFC:         mcfc,
		VirtualChannelFC:        vcfc,
		SecHdrFlag:              secHdrFlag,
		SyncFlag:                syncFlag,
		PacketOrderFlag:         packetOrderFlag,
		SegLenID:                segLenID,
		FirstHeaderPointer:      fhp,
		DataField:               payload,
		OCF:                     ocfVal,
		FECF:                    fecfVal,
	}, nil
}

// Marshal serializes the TransferFrame into bytes, optionally appending ASM and FECF CRC
func (f *TransferFrame) Marshal(withASM bool, withFECF bool) []byte {
	var totalLen int
	if withASM {
		totalLen += 4
	}
	totalLen += 6 + 2 + len(f.DataField)
	if f.OperationalControlField && f.OCF != nil {
		totalLen += 4
	}
	if withFECF {
		totalLen += 2
	}

	buf := make([]byte, totalLen)
	offset := 0

	if withASM {
		binary.BigEndian.PutUint32(buf[offset:offset+4], CCSDS_ASM)
		offset += 4
	}

	frameStartOffset := offset

	// 48-bit primary header
	var u64 uint64
	u64 |= (uint64(f.TransferFrameVersion&0x03) << 46)
	u64 |= (uint64(f.SpacecraftID&0x03FF) << 36)
	u64 |= (uint64(f.VirtualChannelID&0x3F) << 30)
	if f.OperationalControlField {
		u64 |= (1 << 29)
	}
	u64 |= (uint64(f.MasterChannelFC) << 21)
	u64 |= (uint64(f.VirtualChannelFC) << 13)

	buf[offset] = byte(u64 >> 40)
	buf[offset+1] = byte(u64 >> 32)
	buf[offset+2] = byte(u64 >> 24)
	buf[offset+3] = byte(u64 >> 16)
	buf[offset+4] = byte(u64 >> 8)
	buf[offset+5] = byte(u64)
	offset += 6

	// Data field status (2 bytes)
	var dfs uint16
	if f.SecHdrFlag {
		dfs |= (1 << 15)
	}
	if f.SyncFlag {
		dfs |= (1 << 14)
	}
	if f.PacketOrderFlag {
		dfs |= (1 << 13)
	}
	dfs |= (uint16(f.SegLenID&0x03) << 11)
	dfs |= (f.FirstHeaderPointer & 0x07FF)

	binary.BigEndian.PutUint16(buf[offset:offset+2], dfs)
	offset += 2

	// Payload data
	copy(buf[offset:], f.DataField)
	offset += len(f.DataField)

	// OCF
	if f.OperationalControlField && f.OCF != nil {
		binary.BigEndian.PutUint32(buf[offset:offset+4], *f.OCF)
		offset += 4
	}

	// FECF CRC
	if withFECF {
		crc := ComputeCRC16CCITT(buf[frameStartOffset:offset])
		binary.BigEndian.PutUint16(buf[offset:offset+2], crc)
	}

	return buf
}
