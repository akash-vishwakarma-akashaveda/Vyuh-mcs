// Package sle implements the SLE (Space Link Extension) RAF/RCF/F-CLTU
// service procedure (CCSDS 911.x/912.1/913.1) that the Link Gateway's
// SLEAdapter runs against a provider: BIND -> START -> TRANSFER-DATA (or
// CLTU) -> STOP -> UNBIND.
//
// The wire encoding here is a hand-rolled BER tag-length-value scheme
// (self-delimiting TLVs, the same BER length rules real SLE ASN.1 uses) for
// exactly the PDUs this adapter needs — not ESA's real SLE API encoding,
// since no provider or ESA library is reachable from this environment (see
// the backend plan's flagged substitutions). The service procedure and PDU
// set are real; swapping this codec for a byte-compatible one later doesn't
// change the adapter or the state machine.
package sle

import (
	"encoding/binary"
	"fmt"
	"io"
)

// PDU tags.
const (
	TagBindInvocation   byte = 0x01
	TagBindReturn       byte = 0x02
	TagStartInvocation  byte = 0x03
	TagStartReturn      byte = 0x04
	TagTransferData     byte = 0x05
	TagStopInvocation   byte = 0x06
	TagStopReturn       byte = 0x07
	TagUnbindInvocation byte = 0x08
	TagUnbindReturn     byte = 0x09
)

// Field tags, scoped within one PDU's field map.
const (
	fInitiatorID byte = 0x01
	fService     byte = 0x02
	fVersion     byte = 0x03
	fResult      byte = 0x04
	fDiagnostic  byte = 0x05
	fStartTime   byte = 0x06
	fStopTime    byte = 0x07
	fERT         byte = 0x08
	fAntennaID   byte = 0x09
	fRadiated    byte = 0x0A
	fFrame       byte = 0x0B
	fReason      byte = 0x0C
)

type ServiceType uint8

const (
	ServiceRAF ServiceType = iota
	ServiceRCF
	ServiceFCLTU
)

type Result uint8

const (
	ResultPositive Result = 0
	ResultNegative Result = 1
)

type BindInvocation struct {
	InitiatorID string
	Service     ServiceType
	Version     uint8
}

type BindReturn struct {
	Result     Result
	Diagnostic string
}

type StartInvocation struct {
	StartTimeNs int64 // 0 = start now
	StopTimeNs  int64 // 0 = open-ended
}

type StartReturn struct {
	Result     Result
	Diagnostic string
}

type TransferData struct {
	EarthReceiveTimeNs int64
	AntennaID          string
	Radiated           bool
	Frame              []byte
}

type StopInvocation struct{}

type StopReturn struct {
	Result Result
}

type UnbindInvocation struct {
	Reason uint8
}

type UnbindReturn struct {
	Result Result
}

// ---- BER TLV primitives ----

func appendBERLength(buf []byte, n int) []byte {
	if n < 128 {
		return append(buf, byte(n))
	}
	var lenBytes []byte
	for n > 0 {
		lenBytes = append([]byte{byte(n & 0xFF)}, lenBytes...)
		n >>= 8
	}
	buf = append(buf, 0x80|byte(len(lenBytes)))
	return append(buf, lenBytes...)
}

func readBERLength(r io.Reader) (int, error) {
	var first [1]byte
	if _, err := io.ReadFull(r, first[:]); err != nil {
		return 0, err
	}
	if first[0] < 128 {
		return int(first[0]), nil
	}
	numBytes := int(first[0] & 0x7F)
	lenBytes := make([]byte, numBytes)
	if _, err := io.ReadFull(r, lenBytes); err != nil {
		return 0, err
	}
	n := 0
	for _, b := range lenBytes {
		n = (n << 8) | int(b)
	}
	return n, nil
}

type fieldWriter struct{ buf []byte }

func (w *fieldWriter) put(tag byte, value []byte) {
	w.buf = append(w.buf, tag)
	w.buf = appendBERLength(w.buf, len(value))
	w.buf = append(w.buf, value...)
}
func (w *fieldWriter) str(tag byte, s string) { w.put(tag, []byte(s)) }
func (w *fieldWriter) u8(tag byte, v uint8)   { w.put(tag, []byte{v}) }
func (w *fieldWriter) i64(tag byte, v int64) {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, uint64(v))
	w.put(tag, b)
}
func (w *fieldWriter) bytes(tag byte, v []byte) { w.put(tag, v) }

func parseFields(data []byte) (map[byte][]byte, error) {
	fields := make(map[byte][]byte)
	i := 0
	for i < len(data) {
		tag := data[i]
		i++
		if i >= len(data) {
			return nil, fmt.Errorf("sle: truncated field tag %#x", tag)
		}
		n, adv, err := decodeLenAt(data[i:])
		if err != nil {
			return nil, err
		}
		i += adv
		if i+n > len(data) {
			return nil, fmt.Errorf("sle: field %#x length %d exceeds buffer", tag, n)
		}
		fields[tag] = data[i : i+n]
		i += n
	}
	return fields, nil
}

func decodeLenAt(data []byte) (n int, advanced int, err error) {
	if len(data) == 0 {
		return 0, 0, io.ErrUnexpectedEOF
	}
	first := data[0]
	if first < 128 {
		return int(first), 1, nil
	}
	numBytes := int(first & 0x7F)
	if len(data) < 1+numBytes {
		return 0, 0, io.ErrUnexpectedEOF
	}
	n = 0
	for _, b := range data[1 : 1+numBytes] {
		n = (n << 8) | int(b)
	}
	return n, 1 + numBytes, nil
}

func fieldI64(fields map[byte][]byte, tag byte) int64 {
	b, ok := fields[tag]
	if !ok || len(b) != 8 {
		return 0
	}
	return int64(binary.BigEndian.Uint64(b))
}
func fieldStr(fields map[byte][]byte, tag byte) string { return string(fields[tag]) }
func fieldU8(fields map[byte][]byte, tag byte) uint8 {
	b := fields[tag]
	if len(b) != 1 {
		return 0
	}
	return b[0]
}

// ---- PDU envelope encode/decode ----

// WritePDU writes one self-delimiting [tag][BER length][fields] PDU to w.
func WritePDU(w io.Writer, tag byte, fields []byte) error {
	buf := append([]byte{tag}, appendBERLength(nil, len(fields))...)
	buf = append(buf, fields...)
	_, err := w.Write(buf)
	return err
}

// ReadPDU reads one PDU's tag and field bytes from r.
func ReadPDU(r io.Reader) (tag byte, fields []byte, err error) {
	var tagBuf [1]byte
	if _, err := io.ReadFull(r, tagBuf[:]); err != nil {
		return 0, nil, err
	}
	n, err := readBERLength(r)
	if err != nil {
		return 0, nil, err
	}
	fields = make([]byte, n)
	if _, err := io.ReadFull(r, fields); err != nil {
		return 0, nil, err
	}
	return tagBuf[0], fields, nil
}

// ---- per-PDU encode ----

func EncodeBindInvocation(p BindInvocation) []byte {
	w := &fieldWriter{}
	w.str(fInitiatorID, p.InitiatorID)
	w.u8(fService, uint8(p.Service))
	w.u8(fVersion, p.Version)
	return w.buf
}
func DecodeBindInvocation(fields []byte) (BindInvocation, error) {
	f, err := parseFields(fields)
	if err != nil {
		return BindInvocation{}, err
	}
	return BindInvocation{
		InitiatorID: fieldStr(f, fInitiatorID),
		Service:     ServiceType(fieldU8(f, fService)),
		Version:     fieldU8(f, fVersion),
	}, nil
}

func EncodeBindReturn(p BindReturn) []byte {
	w := &fieldWriter{}
	w.u8(fResult, uint8(p.Result))
	w.str(fDiagnostic, p.Diagnostic)
	return w.buf
}
func DecodeBindReturn(fields []byte) (BindReturn, error) {
	f, err := parseFields(fields)
	if err != nil {
		return BindReturn{}, err
	}
	return BindReturn{Result: Result(fieldU8(f, fResult)), Diagnostic: fieldStr(f, fDiagnostic)}, nil
}

func EncodeStartInvocation(p StartInvocation) []byte {
	w := &fieldWriter{}
	w.i64(fStartTime, p.StartTimeNs)
	w.i64(fStopTime, p.StopTimeNs)
	return w.buf
}
func DecodeStartInvocation(fields []byte) (StartInvocation, error) {
	f, err := parseFields(fields)
	if err != nil {
		return StartInvocation{}, err
	}
	return StartInvocation{StartTimeNs: fieldI64(f, fStartTime), StopTimeNs: fieldI64(f, fStopTime)}, nil
}

func EncodeStartReturn(p StartReturn) []byte {
	w := &fieldWriter{}
	w.u8(fResult, uint8(p.Result))
	w.str(fDiagnostic, p.Diagnostic)
	return w.buf
}
func DecodeStartReturn(fields []byte) (StartReturn, error) {
	f, err := parseFields(fields)
	if err != nil {
		return StartReturn{}, err
	}
	return StartReturn{Result: Result(fieldU8(f, fResult)), Diagnostic: fieldStr(f, fDiagnostic)}, nil
}

func EncodeTransferData(p TransferData) []byte {
	w := &fieldWriter{}
	w.i64(fERT, p.EarthReceiveTimeNs)
	w.str(fAntennaID, p.AntennaID)
	radiated := uint8(0)
	if p.Radiated {
		radiated = 1
	}
	w.u8(fRadiated, radiated)
	w.bytes(fFrame, p.Frame)
	return w.buf
}
func DecodeTransferData(fields []byte) (TransferData, error) {
	f, err := parseFields(fields)
	if err != nil {
		return TransferData{}, err
	}
	return TransferData{
		EarthReceiveTimeNs: fieldI64(f, fERT),
		AntennaID:          fieldStr(f, fAntennaID),
		Radiated:           fieldU8(f, fRadiated) == 1,
		Frame:              f[fFrame],
	}, nil
}

func EncodeStopInvocation(StopInvocation) []byte          { return nil }
func DecodeStopInvocation([]byte) (StopInvocation, error) { return StopInvocation{}, nil }

func EncodeStopReturn(p StopReturn) []byte {
	w := &fieldWriter{}
	w.u8(fResult, uint8(p.Result))
	return w.buf
}
func DecodeStopReturn(fields []byte) (StopReturn, error) {
	f, err := parseFields(fields)
	if err != nil {
		return StopReturn{}, err
	}
	return StopReturn{Result: Result(fieldU8(f, fResult))}, nil
}

func EncodeUnbindInvocation(p UnbindInvocation) []byte {
	w := &fieldWriter{}
	w.u8(fReason, p.Reason)
	return w.buf
}
func DecodeUnbindInvocation(fields []byte) (UnbindInvocation, error) {
	f, err := parseFields(fields)
	if err != nil {
		return UnbindInvocation{}, err
	}
	return UnbindInvocation{Reason: fieldU8(f, fReason)}, nil
}

func EncodeUnbindReturn(p UnbindReturn) []byte {
	w := &fieldWriter{}
	w.u8(fResult, uint8(p.Result))
	return w.buf
}
func DecodeUnbindReturn(fields []byte) (UnbindReturn, error) {
	f, err := parseFields(fields)
	if err != nil {
		return UnbindReturn{}, err
	}
	return UnbindReturn{Result: Result(fieldU8(f, fResult))}, nil
}
