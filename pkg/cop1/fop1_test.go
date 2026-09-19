package cop1

import (
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/stretchr/testify/assert"
)

func TestFOP1_SendADAndAck(t *testing.T) {
	var acks []uint8
	fop := NewFOP1(Config{
		SCID:           42,
		WindowSize:     5,
		MaxRetransmits: 3,
		InitialT1:      1 * time.Second,
	}, func(seq uint8) {
		acks = append(acks, seq)
	}, nil)

	assert.Equal(t, StateActive, fop.State())
	assert.Equal(t, uint8(0), fop.VS())

	// Send frame 0
	frame0, err := fop.SendAD(1, []byte{0x01, 0x02})
	assert.NoError(t, err)
	assert.Equal(t, uint8(0), frame0.SeqNumber)
	assert.Equal(t, uint8(1), fop.VS())

	// Send frame 1
	frame1, err := fop.SendAD(1, []byte{0x03, 0x04})
	assert.NoError(t, err)
	assert.Equal(t, uint8(1), frame1.SeqNumber)
	assert.Equal(t, uint8(2), fop.VS())

	// Spacecraft receives frame 0 and sends CLCW with V(R)=1 (expecting frame 1)
	clcw := &ccsds.CLCW{
		ReportValue: 1, // acknowledges frame 0
	}
	resend, err := fop.ProcessCLCW(clcw)
	assert.NoError(t, err)
	assert.Nil(t, resend)

	assert.Contains(t, acks, uint8(0))
	assert.NotContains(t, acks, uint8(1))
}

func TestFOP1_RetransmissionOnCLCWFlag(t *testing.T) {
	fop := NewFOP1(Config{
		SCID:           42,
		WindowSize:     5,
		MaxRetransmits: 3,
	}, nil, nil)

	// Send 2 frames: 0 and 1
	_, err := fop.SendAD(1, []byte{0x01})
	assert.NoError(t, err)
	_, err = fop.SendAD(1, []byte{0x02})
	assert.NoError(t, err)

	// Spacecraft lost frame 0 and sets Retransmit flag with V(R)=0
	clcw := &ccsds.CLCW{
		ReportValue: 0,
		Retransmit:  true,
	}
	resend, err := fop.ProcessCLCW(clcw)
	assert.NoError(t, err)
	assert.Equal(t, 2, len(resend))
	assert.Equal(t, uint8(0), resend[0].SeqNumber)
	assert.Equal(t, uint8(1), resend[1].SeqNumber)
	assert.Equal(t, StateRetransmit, fop.State())
}

func TestFOP1_WaitFlag(t *testing.T) {
	fop := NewFOP1(Config{SCID: 42}, nil, nil)

	_, err := fop.SendAD(1, []byte{0x01})
	assert.NoError(t, err)

	// Satellite buffer full -> sends Wait flag
	clcw := &ccsds.CLCW{
		Wait: true,
	}
	_, err = fop.ProcessCLCW(clcw)
	assert.NoError(t, err)
	assert.Equal(t, StateWait, fop.State())

	// Cannot send while in S3 Wait
	_, err = fop.SendAD(1, []byte{0x02})
	assert.ErrorIs(t, err, ErrFOPNotActive)

	// Satellite clears wait
	clcwClear := &ccsds.CLCW{
		Wait: false,
	}
	_, err = fop.ProcessCLCW(clcwClear)
	assert.NoError(t, err)
	assert.Equal(t, StateActive, fop.State())
}
