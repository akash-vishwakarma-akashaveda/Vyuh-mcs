package ccsds

import (
	"encoding/binary"
	"errors"
	"fmt"
)

const (
	CCSDS_ASM                = uint32(0x1ACFFC1D)
	FHP_NO_PACKET_HEADER     = uint16(0x7FF)
	FHP_IDLE_DATA            = uint16(0x7FE)
)

var (
	ErrInvalidASM         = errors.New("invalid Attached Sync Marker (ASM)")
	ErrFrameTooShort      = errors.New("frame is shorter than required minimum header size")
	ErrInvalidFrameVersion = errors.New("invalid TM frame version (must be 0b00)")
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

	minLen := 6 // primary header, including the data field status
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

	// Primary header, CCSDS 132.0-B-3 §4.1.2 (6 octets):
	//   octets 0-1: TFVN (2) | SCID (10) | VCID (3) | OCF flag (1)
	//   octet  2:   master channel frame count
	//   octet  3:   virtual channel frame count
	//   octets 4-5: data field status: sec hdr (1) | sync (1) | packet order (1) | segment length id (2) | FHP (11)
	w0 := binary.BigEndian.Uint16(data[0:2])
	version := uint8(w0 >> 14)
	if version != 0 {
		return nil, fmt.Errorf("%w: expected 0, got %d", ErrInvalidFrameVersion, version)
	}
	scid := (w0 >> 4) & 0x03FF
	vcid := uint8((w0 >> 1) & 0x07)
	ocfFlag := w0&0x01 == 1
	mcfc := data[2]
	vcfc := data[3]

	dfs := binary.BigEndian.Uint16(data[4:6])
	secHdrFlag := ((dfs >> 15) & 0x01) == 1
	syncFlag := ((dfs >> 14) & 0x01) == 1
	packetOrderFlag := ((dfs >> 13) & 0x01) == 1
	segLenID := uint8((dfs >> 11) & 0x03)
	fhp := dfs & 0x07FF

	payloadEnd := len(data)
	var ocfVal *uint32
	if ocfFlag {
		if payloadEnd < 6+4 {
			return nil, ErrFrameTooShort
		}
		ocfWord := binary.BigEndian.Uint32(data[payloadEnd-4 : payloadEnd])
		ocfVal = &ocfWord
		payloadEnd -= 4
	}

	payload := data[6:payloadEnd]

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
	totalLen += 6 + len(f.DataField)
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

	// Primary header (6 octets, see ParseTMFrame)
	w0 := uint16(f.TransferFrameVersion&0x03)<<14 | (f.SpacecraftID&0x03FF)<<4 | uint16(f.VirtualChannelID&0x07)<<1
	if f.OperationalControlField {
		w0 |= 1
	}
	binary.BigEndian.PutUint16(buf[offset:offset+2], w0)
	buf[offset+2] = f.MasterChannelFC
	buf[offset+3] = f.VirtualChannelFC
	offset += 4

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
