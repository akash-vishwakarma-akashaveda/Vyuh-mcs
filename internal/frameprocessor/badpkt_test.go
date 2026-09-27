package frameprocessor

import (
	"testing"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
)

func TestStream_MalformedPacketIsDetectedAndStreamResyncs(t *testing.T) {
	h := newHarness(t)
	mux := ccsds.NewVCMux(7, 1, 256, true, nil)
	var sent [][]byte
	for i := 0; i < 60; i++ {
		p := (&ccsds.SpacePacket{APID: 0x70, SeqFlags: 3, SeqCount: uint16(i), Data: make([]byte, 40)}).Marshal()
		if i == 20 {
			bad := (&ccsds.SpacePacket{APID: 0x70, SeqFlags: 3, Data: make([]byte, 10)}).Marshal()
			bad[0] |= 0x40
			mux.Push(bad)
		}
		sent = append(sent, p)
		mux.Push(p)
	}
	for mux.Pending() > 0 {
		h.feed(mux.Next(true))
	}
	got := h.settle(40)
	checkIntact(t, sent, got)
	if pipeline.Get("packet.bad_header") != 1 {
		t.Fatalf("bad header not detected: %+v", pipeline.Take().Stages["packet"])
	}
}
