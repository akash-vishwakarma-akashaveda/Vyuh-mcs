package upe

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

func TestUPEEngine_SafetyChain(t *testing.T) {
	ctx := context.Background()
	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	engine := NewUPEEngine(42, rClient, bus, bus)

	minV := 2.5
	maxV := 5.0
	engine.RegisterCommandDef(&CommandDefinition{
		SCID: 42,
		APID: 100,
		Name: "SET_VOLTAGE",
		ParamLimits: map[string]ParamDefinition{
			"voltage": {Min: &minV, Max: &maxV},
		},
	})

	// 1. Valid command passes
	validCmd := &command.RawCommand{
		CommandID: "cmd-001",
		SCID:      42,
		APID:      100,
		Params:    map[string]any{"voltage": 3.3},
	}
	if err := engine.ExecuteSafetyChain(ctx, validCmd); err != nil {
		t.Fatalf("expected valid command to pass safety chain, got: %v", err)
	}

	// 2. L1 Range Violation (above max)
	invalidCmd := &command.RawCommand{
		CommandID: "cmd-002",
		SCID:      42,
		APID:      100,
		Params:    map[string]any{"voltage": 6.0},
	}
	if err := engine.ExecuteSafetyChain(ctx, invalidCmd); err == nil {
		t.Fatalf("expected range violation error, got nil")
	}

	// 3. L3 Inhibit Check
	_ = rClient.Set(ctx, 2, "uplink:inhibited:42:100", "1", 0)
	if err := engine.ExecuteSafetyChain(ctx, validCmd); err != ErrInhibitedViolation {
		t.Fatalf("expected ErrInhibitedViolation, got: %v", err)
	}
	_ = rClient.Set(ctx, 2, "uplink:inhibited:42:100", "0", 0)

	// 4. L4 Interlock Check
	_ = rClient.Set(ctx, 2, "uplink:executing:42", "cmd-running-999", 0)
	if err := engine.ExecuteSafetyChain(ctx, validCmd); err != ErrInterlockViolation {
		t.Fatalf("expected ErrInterlockViolation, got: %v", err)
	}
}

func TestUPEEngine_ProcessAndEncrypt(t *testing.T) {
	ctx := context.Background()
	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()

	engine := NewUPEEngine(42, rClient, bus, bus)

	tcChan := make(chan *command.TCSpacePacket, 5)
	_ = bus.Subscribe("tc.packets", func(ctx context.Context, msg *kafka.Message) error {
		var pkt command.TCSpacePacket
		if err := json.Unmarshal(msg.Value, &pkt); err == nil {
			tcChan <- &pkt
		}
		return nil
	})

	cmd := &command.RawCommand{
		CommandID: "cmd-encrypt-01",
		SCID:      42,
		APID:      200,
		Priority:  command.PriorityCritical,
		Params:    map[string]any{"power_mode": "SAFE"},
	}

	err := engine.ProcessCommand(ctx, cmd)
	if err != nil {
		t.Fatalf("failed to process command: %v", err)
	}

	var tcPkt *command.TCSpacePacket
	select {
	case tcPkt = <-tcChan:
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for TC Space Packet on tc.packets topic")
	}
	if tcPkt.CommandID != "cmd-encrypt-01" {
		t.Errorf("expected command ID cmd-encrypt-01, got %s", tcPkt.CommandID)
	}
	if len(tcPkt.Ciphertext) == 0 {
		t.Errorf("expected non-empty ciphertext")
	}
	if len(tcPkt.GCMTag) != 16 {
		t.Errorf("expected 16-byte GCM tag, got %d", len(tcPkt.GCMTag))
	}
	if len(tcPkt.IV) != 12 {
		t.Errorf("expected 12-byte IV, got %d", len(tcPkt.IV))
	}
}
