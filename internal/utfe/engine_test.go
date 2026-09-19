package utfe

import (
	"context"
	"testing"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

func TestUTFEEngine_DirectFramingAndCLCW(t *testing.T) {
	ctx := context.Background()
	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()
	driver := &MockAntennaDriver{}

	engine := NewUTFEEngine(42, rClient, bus, bus, driver)

	tc := &command.TCSpacePacket{
		CommandID:  "cmd-test-direct",
		SCID:       42,
		APID:       100,
		SeqCount:   1,
		Ciphertext: []byte{0x01, 0x02, 0x03, 0x04},
		BypassCOP1: false,
	}

	// 1. Send packet
	err := engine.HandleTCPacket(ctx, tc)
	if err != nil {
		t.Fatalf("failed to handle TC packet: %v", err)
	}

	frames := driver.SentFrames()
	if len(frames) != 1 {
		t.Fatalf("expected 1 transmitted frame, got %d", len(frames))
	}

	parsed, err := ccsds.ParseTCFrame(frames[0])
	if err != nil {
		t.Fatalf("failed to parse transmitted TC frame: %v", err)
	}
	if parsed.SpacecraftID != 42 {
		t.Errorf("expected SCID 42, got %d", parsed.SpacecraftID)
	}
	if parsed.SeqNumber != 0 {
		t.Errorf("expected sequence number 0, got %d", parsed.SeqNumber)
	}

	// 2. Process CLCW with ReportValue = 1
	clcw := &ccsds.CLCW{
		ReportValue: 1, // ACKs frame 0
		Retransmit:  false,
		Wait:        false,
	}
	err = engine.ProcessCLCW(ctx, clcw)
	if err != nil {
		t.Fatalf("failed to process CLCW: %v", err)
	}

	// 3. Test Bypass Mode (Type-BC)
	tcBC := &command.TCSpacePacket{
		CommandID:  "cmd-test-bc",
		SCID:       42,
		APID:       100,
		SeqCount:   2,
		Ciphertext: []byte{0xDE, 0xAD},
		BypassCOP1: true,
	}
	err = engine.HandleTCPacket(ctx, tcBC)
	if err != nil {
		t.Fatalf("failed to handle BC packet: %v", err)
	}

	frames = driver.SentFrames()
	if len(frames) != 2 {
		t.Fatalf("expected 2 frames transmitted, got %d", len(frames))
	}
	parsedBC, err := ccsds.ParseTCFrame(frames[1])
	if err != nil {
		t.Fatalf("failed to parse BC TC frame: %v", err)
	}
	if !parsedBC.BypassFlag {
		t.Errorf("expected BypassFlag to be true for BC frame")
	}
}
