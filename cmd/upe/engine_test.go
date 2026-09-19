package main

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"encoding/json"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/upe"
	"github.com/stretchr/testify/assert"
)

func TestUPE_SafetyCheckL1_RangeViolation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()
	engine := upe.NewUPEEngine(42, rClient, bus, bus)

	minV := 0.0
	maxV := 5.0
	engine.RegisterCommandDef(&upe.CommandDefinition{
		SCID: 42,
		APID: 100,
		ParamLimits: map[string]upe.ParamDefinition{
			"voltage": {Min: &minV, Max: &maxV},
		},
	})
	assert.NoError(t, engine.Start(ctx))

	ackChan := make(chan *command.CommandAckEvent, 5)
	_ = bus.Subscribe("cmd.ack.events", func(ctx context.Context, msg *kafka.Message) error {
		var ack command.CommandAckEvent
		if err := json.Unmarshal(msg.Value, &ack); err == nil {
			ackChan <- &ack
		}
		return nil
	})

	// Submit command with voltage = 7.5 (> max 5.0)
	cmd := command.RawCommand{
		CommandID:   "cmd-invalid-range",
		SCID:        42,
		APID:        100,
		Params:      map[string]any{"voltage": 7.5},
		SubmittedAt: time.Now().UTC(),
	}
	_ = kafka.ProduceJSON(ctx, bus, "raw.commands", []byte{0, 42}, cmd, nil)

	select {
	case ack := <-ackChan:
		assert.Equal(t, "cmd-invalid-range", ack.CommandID)
		assert.Equal(t, command.StatusFailed, ack.Status)
		assert.Contains(t, ack.Reason, "L1 check failed")
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for rejection ack on cmd.ack.events")
	}
}

func TestUPE_SuccessAndEncryption(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()
	engine := upe.NewUPEEngine(42, rClient, bus, bus)

	minV := 0.0
	maxV := 5.0
	engine.RegisterCommandDef(&upe.CommandDefinition{
		SCID: 42,
		APID: 100,
		ParamLimits: map[string]upe.ParamDefinition{
			"voltage": {Min: &minV, Max: &maxV},
		},
	})
	assert.NoError(t, engine.Start(ctx))

	tcChan := make(chan *command.TCSpacePacket, 5)
	_ = bus.Subscribe("tc.packets", func(ctx context.Context, msg *kafka.Message) error {
		var tc command.TCSpacePacket
		if err := json.Unmarshal(msg.Value, &tc); err == nil {
			tcChan <- &tc
		}
		return nil
	})

	// Submit valid command
	cmd := command.RawCommand{
		CommandID:   "cmd-valid-001",
		SCID:        42,
		APID:        100,
		Params:      map[string]any{"voltage": 3.3},
		SubmittedAt: time.Now().UTC(),
	}
	_ = kafka.ProduceJSON(ctx, bus, "raw.commands", []byte{0, 42}, cmd, nil)

	select {
	case tc := <-tcChan:
		assert.Equal(t, "cmd-valid-001", tc.CommandID)
		assert.Equal(t, uint16(42), tc.SCID)
		assert.Equal(t, uint16(100), tc.APID)
		assert.Equal(t, 12, len(tc.IV))
		assert.Equal(t, 16, len(tc.GCMTag))
		assert.NotEmpty(t, tc.Ciphertext)

		// Verify that ciphertext decrypts with the key and auth tag!
		key := engine.Key(42)
		block, err := aes.NewCipher(key)
		assert.NoError(t, err)
		gcm, err := cipher.NewGCM(block)
		assert.NoError(t, err)

		sealed := append(tc.Ciphertext, tc.GCMTag...)
		plaintext, err := gcm.Open(nil, tc.IV, sealed, command.SDLSAAD(tc.SCID, tc.APID, tc.SeqCount))
		assert.NoError(t, err)

		var recoveredParams map[string]any
		assert.NoError(t, json.Unmarshal(plaintext, &recoveredParams))
		assert.Equal(t, 3.3, recoveredParams["voltage"])

	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for tc packet on tc.packets")
	}
}
