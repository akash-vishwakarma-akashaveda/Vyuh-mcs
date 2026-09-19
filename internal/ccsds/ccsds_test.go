package ccsds

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCRC16CCITT(t *testing.T) {
	data := []byte("123456789")
	crc := ComputeCRC16CCITT(data)
	assert.Equal(t, uint16(0x29B1), crc) // Known CRC-16/CCITT-FALSE test vector
	assert.True(t, VerifyCRC16(data, 0x29B1))
}

func TestSpacePacket_Roundtrip(t *testing.T) {
	payload := []byte{0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x02, 0x03}
	pkt := &SpacePacket{
		Version:    0,
		Type:       0, // TM
		SecHdrFlag: false,
		APID:       100,
		SeqFlags:   3, // unsegmented
		SeqCount:   42,
		Data:       payload,
	}

	bytes := pkt.Marshal()
	assert.Equal(t, 6+len(payload), len(bytes))

	parsed, err := ParseSpacePacket(bytes)
	assert.NoError(t, err)
	assert.Equal(t, pkt.Version, parsed.Version)
	assert.Equal(t, pkt.Type, parsed.Type)
	assert.Equal(t, pkt.APID, parsed.APID)
	assert.Equal(t, pkt.SeqCount, parsed.SeqCount)
	assert.Equal(t, pkt.Data, parsed.Data)
}

func TestCLCW_Roundtrip(t *testing.T) {
	clcw := &CLCW{
		ControlWordType:  0,
		CLCWVersion:      0,
		StatusField:      2,
		CopInEffect:      1, // COP-1
		VirtualChannelID: 5,
		NoRF:             false,
		NoBitLock:        false,
		Lockout:          false,
		Wait:             true,
		Retransmit:       false,
		FarmerBCounter:   1,
		ReportValue:      142, // V(R)
	}

	bytes := clcw.Marshal()
	assert.Equal(t, 4, len(bytes))

	parsed, err := ParseCLCW(bytes)
	assert.NoError(t, err)
	assert.Equal(t, clcw.VirtualChannelID, parsed.VirtualChannelID)
	assert.Equal(t, clcw.Wait, parsed.Wait)
	assert.Equal(t, clcw.ReportValue, parsed.ReportValue)
	assert.Equal(t, clcw.FarmerBCounter, parsed.FarmerBCounter)
}

func TestTCTransferFrame_Roundtrip(t *testing.T) {
	frame := &TCTransferFrame{
		TransferFrameVersion: 0,
		BypassFlag:           false, // Type-AD
		ControlCommandFlag:   false,
		SpacecraftID:         42,
		VirtualChannelID:     3,
		SeqNumber:            15, // V(S)
		Data:                 []byte{0xCA, 0xFE, 0xBA, 0xBE},
	}

	raw := frame.Marshal()
	parsed, err := ParseTCFrame(raw)
	assert.NoError(t, err)
	assert.Equal(t, frame.SpacecraftID, parsed.SpacecraftID)
	assert.Equal(t, frame.VirtualChannelID, parsed.VirtualChannelID)
	assert.Equal(t, frame.SeqNumber, parsed.SeqNumber)
	assert.Equal(t, frame.Data, parsed.Data)
	assert.False(t, parsed.BypassFlag)
}

func TestTMTransferFrame_Roundtrip(t *testing.T) {
	ocfVal := uint32(0x01020304)
	frame := &TransferFrame{
		TransferFrameVersion:    1,
		SpacecraftID:            77,
		VirtualChannelID:        2,
		OperationalControlField: true,
		MasterChannelFC:         10,
		VirtualChannelFC:        20,
		SecHdrFlag:              false,
		SyncFlag:                false,
		PacketOrderFlag:         false,
		SegLenID:                0,
		FirstHeaderPointer:      0,
		DataField:               make([]byte, 100),
		OCF:                     &ocfVal,
	}

	raw := frame.Marshal(true, true)
	parsed, err := ParseTMFrame(raw, true, true)
	assert.NoError(t, err)
	assert.Equal(t, frame.SpacecraftID, parsed.SpacecraftID)
	assert.Equal(t, frame.VirtualChannelID, parsed.VirtualChannelID)
	assert.Equal(t, frame.VirtualChannelFC, parsed.VirtualChannelFC)
	assert.NotNil(t, parsed.OCF)
	assert.Equal(t, ocfVal, *parsed.OCF)
}
