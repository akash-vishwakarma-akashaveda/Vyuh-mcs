package frameprocessor

import (
	"bytes"
	"encoding/base64"
	"math/rand"
	"testing"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
)

// A spacecraft whose frame generator restarts mid-stream: whatever happens at
// the boundary, no packet may be assembled from bytes of both streams.
func TestStream_CounterResetNeverSplicesPackets(t *testing.T) {
	for cut := 20; cut < 60; cut += 3 {
		h := newHarness(t)
		rng := rand.New(rand.NewSource(int64(cut)))
		sent := map[uint16][]byte{}
		seq := uint16(0)
		push := func(m *ccsds.VCMux) {
			data := make([]byte, 6+rng.Intn(60))
			rng.Read(data)
			p := (&ccsds.SpacePacket{APID: 0x71, SeqFlags: 3, SeqCount: seq, Data: data}).Marshal()
			sent[seq] = p
			seq++
			m.Push(p)
		}
		a := ccsds.NewVCMux(7, 1, 256, true, nil)
		for len(sent) < cut*6 {
			push(a)
			for f := a.Next(false); f != nil; f = a.Next(false) {
				h.feed(f)
			}
		}
		for a.Pending() > 0 {
			h.feed(a.Next(true))
		}
		b := ccsds.NewVCMux(7, 1, 256, true, nil) // counters restart at 0
		for i := 0; i < 400; i++ {
			push(b)
			for f := b.Next(false); f != nil; f = b.Next(false) {
				h.feed(f)
			}
		}
		for b.Pending() > 0 {
			h.feed(b.Next(true))
		}
		got := h.settle(int(seq) - 60)
		for _, g := range got {
			body, _ := base64.StdEncoding.DecodeString(g.PacketBytesB64)
			if want, ok := sent[g.SeqCount]; !ok || !bytes.Equal(want[6:], body) {
				t.Fatalf("cut %d: packet seq %d spliced across the reset", cut, g.SeqCount)
			}
		}
	}
}

// A frame that only continues a packet (FHP 0x7FF) arriving when no packet is
// in progress must not be parsed as if it began with a packet header.
func TestStream_OrphanContinuationIsNotParsed(t *testing.T) {
	h := newHarness(t)
	mux := ccsds.NewVCMux(7, 1, 256, true, nil)
	big := (&ccsds.SpacePacket{APID: 0x71, SeqFlags: 3, Data: bytes.Repeat([]byte{0x00, 0x05}, 400)}).Marshal() // spans 4 frames
	mux.Push(big)
	var frames [][]byte
	for mux.Pending() > 0 {
		frames = append(frames, mux.Next(true))
	}
	// A clean first frame ending on a packet boundary, then the orphan continuation frames.
	first := (&ccsds.SpacePacket{APID: 0x72, SeqFlags: 3, Data: make([]byte, 10)}).Marshal()
	m0 := ccsds.NewVCMux(7, 1, 256, true, nil)
	m0.Push(first)
	h.feed(m0.Next(true))
	for _, f := range frames[1:] {
		h.feed(f)
	}
	for _, g := range h.settle(1) {
		if g.APID != 0x72 {
			t.Fatalf("orphan continuation bytes were parsed as a packet: %+v", g)
		}
	}
}
