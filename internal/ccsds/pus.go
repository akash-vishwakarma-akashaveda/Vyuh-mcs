package ccsds

import (
	"encoding/binary"
	"errors"
)

// PUS service 1 (request verification), ECSS-E-ST-70-41C. The spacecraft
// reports on every telecommand it receives: acceptance (1,1) or its failure
// (1,2), and completion of execution (1,7) or its failure (1,8). The report
// names the telecommand by its request ID: the TC packet's packet ID and
// sequence control, exactly as they were uplinked.

// VerificationAPID is the TM APID the spacecraft sends PUS-1 reports on.
const VerificationAPID = 0x3E0

const (
	PUSAcceptSuccess     = 1
	PUSAcceptFailure     = 2
	PUSCompletionSuccess = 7
	PUSCompletionFailure = 8
)

// PUS-1 failure codes used by the spacecraft model.
const (
	FailAuthentication = 0x0001
	FailMalformed      = 0x0002
	FailParameters     = 0x0003
	FailExecution      = 0x0010
)

type VerificationReport struct {
	Subtype     uint8
	Counter     uint16 // message type counter
	OBTTicks    uint64 // on-board time (CUC 4+2, 1/65536 s)
	RequestAPID uint16 // of the telecommand being reported on
	RequestSeq  uint16
	FailureCode uint16 // failure subtypes only
}

var ErrNotVerification = errors.New("not a PUS-1 verification report")

// pusTMHeaderLen is the PUS-C TM secondary header used here: version/time
// status (1), service (1), subtype (1), message counter (2), destination (2),
// time (6).
const pusTMHeaderLen = 13

// Marshal encodes the packet data field (secondary header + source data).
func (r *VerificationReport) Marshal() []byte {
	n := pusTMHeaderLen + 4
	failure := r.Subtype == PUSAcceptFailure || r.Subtype == PUSCompletionFailure
	if failure {
		n += 2
	}
	b := make([]byte, n)
	b[0] = 2 << 4 // PUS version 2 (PUS-C)
	b[1] = 1      // service 1
	b[2] = r.Subtype
	binary.BigEndian.PutUint16(b[3:5], r.Counter)
	for i := 0; i < 6; i++ {
		b[7+i] = byte(r.OBTTicks >> (8 * uint(5-i)))
	}
	// Request ID: packet ID (version 0, type 1 = TC, sec hdr, APID) + sequence control.
	binary.BigEndian.PutUint16(b[13:15], 0x1000|0x0800|r.RequestAPID&0x07FF)
	binary.BigEndian.PutUint16(b[15:17], 0xC000|r.RequestSeq&0x3FFF)
	if failure {
		binary.BigEndian.PutUint16(b[17:19], r.FailureCode)
	}
	return b
}

// ParseVerification decodes a PUS-1 report from a TM packet data field.
func ParseVerification(b []byte) (*VerificationReport, error) {
	if len(b) < pusTMHeaderLen+4 || b[0]>>4 != 2 || b[1] != 1 {
		return nil, ErrNotVerification
	}
	r := &VerificationReport{Subtype: b[2], Counter: binary.BigEndian.Uint16(b[3:5])}
	for i := 0; i < 6; i++ {
		r.OBTTicks = r.OBTTicks<<8 | uint64(b[7+i])
	}
	r.RequestAPID = binary.BigEndian.Uint16(b[13:15]) & 0x07FF
	r.RequestSeq = binary.BigEndian.Uint16(b[15:17]) & 0x3FFF
	if (r.Subtype == PUSAcceptFailure || r.Subtype == PUSCompletionFailure) && len(b) >= pusTMHeaderLen+6 {
		r.FailureCode = binary.BigEndian.Uint16(b[17:19])
	}
	return r, nil
}
