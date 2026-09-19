package ccsds

import (
	"encoding/binary"
	"errors"
	"fmt"
)

var (
	ErrPacketTooShort   = errors.New("packet is too short to contain CCSDS primary header (min 6 bytes)")
	ErrPacketLength     = errors.New("packet data length field does not match payload size")
	ErrInvalidVersion   = errors.New("invalid CCSDS packet version (must be 0)")
)

// ParseSpacePacket parses a CCSDS 133.0-B-2 space packet from raw bytes
func ParseSpacePacket(raw []byte) (*SpacePacket, error) {
	if len(raw) < 6 {
		return nil, ErrPacketTooShort
	}

	h0 := binary.BigEndian.Uint16(raw[0:2])
	h1 := binary.BigEndian.Uint16(raw[2:4])
	dataLength := binary.BigEndian.Uint16(raw[4:6])

	version := uint8((h0 >> 13) & 0x07)
	if version != 0 {
		return nil, fmt.Errorf("%w: got %d", ErrInvalidVersion, version)
	}

	pktType := uint8((h0 >> 12) & 0x01)
	secHdr := ((h0 >> 11) & 0x01) == 1
	apid := h0 & 0x07FF

	seqFlags := uint8((h1 >> 14) & 0x03)
	seqCount := h1 & 0x3FFF

	expectedDataLen := int(dataLength) + 1
	actualDataLen := len(raw) - 6

	if actualDataLen < expectedDataLen {
		return nil, fmt.Errorf("%w: declared %d bytes, got %d", ErrPacketLength, expectedDataLen, actualDataLen)
	}

	payload := raw[6 : 6+expectedDataLen]

	return &SpacePacket{
		Version:    version,
		Type:       pktType,
		SecHdrFlag: secHdr,
		APID:       apid,
		SeqFlags:   seqFlags,
		SeqCount:   seqCount,
		DataLength: dataLength,
		Data:       payload,
	}, nil
}

// Marshal serializes the SpacePacket into standard 6-byte header + data payload
func (p *SpacePacket) Marshal() []byte {
	totalLen := 6 + len(p.Data)
	buf := make([]byte, totalLen)

	h0 := (uint16(p.Version&0x07) << 13) |
		(uint16(p.Type&0x01) << 12) |
		(uint16(boolToUint8(p.SecHdrFlag)&0x01) << 11) |
		(p.APID & 0x07FF)

	h1 := (uint16(p.SeqFlags&0x03) << 14) |
		(p.SeqCount & 0x3FFF)

	binary.BigEndian.PutUint16(buf[0:2], h0)
	binary.BigEndian.PutUint16(buf[2:4], h1)
	binary.BigEndian.PutUint16(buf[4:6], uint16(len(p.Data)-1))

	copy(buf[6:], p.Data)
	return buf
}

func boolToUint8(b bool) uint8 {
	if b {
		return 1
	}
	return 0
}
