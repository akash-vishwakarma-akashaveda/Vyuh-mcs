package ccsds

import "testing"

func TestVerificationReportRoundTrip(t *testing.T) {
	for _, sub := range []uint8{PUSAcceptSuccess, PUSAcceptFailure, PUSCompletionSuccess, PUSCompletionFailure} {
		in := &VerificationReport{Subtype: sub, Counter: 7, OBTTicks: 123456789, RequestAPID: 0x021, RequestSeq: 0x3ABC, FailureCode: FailExecution}
		out, err := ParseVerification(in.Marshal())
		if err != nil {
			t.Fatal(err)
		}
		if out.Subtype != sub || out.RequestAPID != 0x021 || out.RequestSeq != 0x3ABC || out.OBTTicks != 123456789 || out.Counter != 7 {
			t.Fatalf("round trip mismatch: %+v", out)
		}
		failure := sub == PUSAcceptFailure || sub == PUSCompletionFailure
		if failure != (out.FailureCode == FailExecution) {
			t.Fatalf("failure code only on failure reports: %+v", out)
		}
	}
	if _, err := ParseVerification([]byte{0x20, 3, 1}); err == nil {
		t.Fatal("short or non-service-1 data must be refused")
	}
}

// Frames closed early (partly full) must never put an idle packet inside a
// packet: walking the frames' data fields as one packet stream must find only
// well-formed packets, and every packet pushed.
func TestVCMuxNeverSplitsAPacketWithIdleFill(t *testing.T) {
	for size := 6; size < 60; size++ {
		m := NewVCMux(1, 0, 256, true, nil)
		stream := []byte{}
		for i := 0; i < 300; i++ {
			m.Push((&SpacePacket{APID: 0x70, SeqFlags: 3, SeqCount: uint16(i), Data: make([]byte, size+i%7)}).Marshal())
			if i%5 == 0 { // close a partly filled frame, as the replay's latency flush does
				f, err := ParseTMFrame(m.Next(true), true, true)
				if err != nil {
					t.Fatal(err)
				}
				stream = append(stream, f.DataField...)
			}
		}
		for m.Pending() > 0 {
			f, _ := ParseTMFrame(m.Next(true), true, true)
			stream = append(stream, f.DataField...)
		}
		seen := 0
		for len(stream) >= 6 {
			if stream[0]>>5 != 0 {
				t.Fatalf("size %d: malformed packet boundary after %d packets", size, seen)
			}
			total := 7 + (int(stream[4])<<8 | int(stream[5]))
			if total > len(stream) {
				t.Fatalf("size %d: stream ends inside a packet", size)
			}
			if stream[1] != 0xFF || stream[0]&0x07 != 0x07 { // not idle
				seen++
			}
			stream = stream[total:]
		}
		if seen != 300 {
			t.Fatalf("size %d: %d packets in the stream, want 300", size, seen)
		}
	}
}
