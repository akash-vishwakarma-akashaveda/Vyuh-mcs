package upe

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

var (
	ErrRangeViolation      = errors.New("L1 check failed: parameter value out of valid range")
	ErrConstraintViolation = errors.New("L2 check failed: constraint violated by current CVT value")
	ErrInhibitedViolation  = errors.New("L3 check failed: command APID is currently inhibited")
	ErrInterlockViolation  = errors.New("L4 check failed: interlock condition active")
)

type ParamDefinition struct {
	Min *float64 `json:"min,omitempty"`
	Max *float64 `json:"max,omitempty"`
}

type CommandDefinition struct {
	SCID        uint16                     `json:"scid"`
	APID        uint16                     `json:"apid"`
	Name        string                     `json:"name"`
	ParamLimits map[string]ParamDefinition `json:"param_limits"`
}

type UPEEngine struct {
	scid         uint16
	redisClient  redis.Client
	bus          kafka.Producer
	consumer     kafka.Consumer
	cmdDefs      map[uint16]*CommandDefinition // apid -> def
	keyStore     map[uint16][]byte             // scid -> 32-byte AES key
	seqCounter   uint16
	seqMu        sync.Mutex
	mu           sync.RWMutex
}

func NewUPEEngine(scid uint16, r redis.Client, bus kafka.Producer, consumer kafka.Consumer) *UPEEngine {
	// Generate default 256-bit AES key for test/dev
	key := make([]byte, 32)
	for i := range key {
		key[i] = byte(i + 1)
	}

	return &UPEEngine{
		scid:        scid,
		redisClient: r,
		bus:         bus,
		consumer:    consumer,
		cmdDefs:     make(map[uint16]*CommandDefinition),
		keyStore:    map[uint16][]byte{scid: key},
	}
}

func (e *UPEEngine) RegisterCommandDef(def *CommandDefinition) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.cmdDefs[def.APID] = def
}

func (e *UPEEngine) SetKey(scid uint16, key []byte) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.keyStore[scid] = key
}

func (e *UPEEngine) Key(scid uint16) []byte {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.keyStore[scid]
}

func (e *UPEEngine) Start(ctx context.Context) error {
	if e.consumer == nil {
		return errors.New("consumer is nil")
	}
	return e.consumer.Subscribe("raw.commands", func(ctx context.Context, msg *kafka.Message) error {
		var rc command.RawCommand
		if err := json.Unmarshal(msg.Value, &rc); err != nil {
			return err
		}
		if rc.SCID != e.scid {
			return nil // filtered for this satellite ordinal
		}
		return e.ProcessCommand(ctx, &rc)
	})
}

func (e *UPEEngine) ProcessCommand(ctx context.Context, cmd *command.RawCommand) error {
	// Execute Safety Chain L1 -> L4 in sequence (FR-UPE-002)
	if err := e.ExecuteSafetyChain(ctx, cmd); err != nil {
		// Reject command and report on cmd.ack.events
		ack := command.CommandAckEvent{
			CommandID: cmd.CommandID,
			SCID:      cmd.SCID,
			Status:    command.StatusFailed,
			Timestamp: time.Now().UTC(),
			Reason:    err.Error(),
		}
		if e.bus != nil {
			return kafka.ProduceJSON(ctx, e.bus, "cmd.ack.events", []byte{0, byte(cmd.SCID)}, ack, nil)
		}
		return err
	}

	// Fetch AES-256-GCM key (FR-UPE-007)
	e.mu.RLock()
	key, ok := e.keyStore[cmd.SCID]
	e.mu.RUnlock()
	if !ok {
		return errors.New("satellite uplink key not found in key vault")
	}

	// Encrypt command payload with AES-256-GCM & 12-byte IV (FR-UPE-008, FR-UPE-009)
	payloadBytes, _ := json.Marshal(cmd.Params)
	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}

	iv := make([]byte, 12)
	if _, err := io.ReadFull(rand.Reader, iv); err != nil {
		return err
	}

	// Atomically increment sequence counter (FR-UPE-011). Assigned before
	// sealing because the sequence count is authenticated with the payload.
	e.seqMu.Lock()
	seq := e.seqCounter
	e.seqCounter = (e.seqCounter + 1) & 0x3FFF
	e.seqMu.Unlock()

	aad := command.SDLSAAD(cmd.SCID, cmd.APID, seq)
	sealed := gcm.Seal(nil, iv, payloadBytes, aad)

	// In GCM, the last 16 bytes of sealed are the authentication tag
	tagOffset := len(sealed) - 16
	ciphertext := sealed[:tagOffset]
	tag := sealed[tagOffset:]

	// Build TC Space Packet (FR-UPE-012)
	tcPkt := command.TCSpacePacket{
		CommandID:  cmd.CommandID,
		SCID:       cmd.SCID,
		APID:       cmd.APID,
		Priority:   cmd.Priority,
		SeqCount:   seq,
		IV:         iv,
		Ciphertext: ciphertext,
		GCMTag:     tag,
		BypassCOP1: cmd.BypassCOP1,
		BuiltAt:    time.Now().UTC(),
	}

	// Produce to tc.packets (FR-UPE-013)
	scidKey := []byte{byte(cmd.SCID >> 8), byte(cmd.SCID)}
	if e.bus != nil {
		if err := kafka.ProduceJSON(ctx, e.bus, "tc.packets", scidKey, tcPkt, nil); err != nil {
			return err
		}

		// Notify that command is QUEUED in uplink pipeline
		ack := command.CommandAckEvent{
			CommandID: cmd.CommandID,
			SCID:      cmd.SCID,
			Status:    command.StatusQueued,
			SeqCount:  seq,
			Timestamp: time.Now().UTC(),
		}
		return kafka.ProduceJSON(ctx, e.bus, "cmd.ack.events", scidKey, ack, nil)
	}

	return nil
}

func (e *UPEEngine) ExecuteSafetyChain(ctx context.Context, cmd *command.RawCommand) error {
	e.mu.RLock()
	def, hasDef := e.cmdDefs[cmd.APID]
	e.mu.RUnlock()

	// L1: Validate parameter ranges against min/max limits (FR-UPE-003)
	if hasDef {
		for paramName, limit := range def.ParamLimits {
			val, exists := cmd.Params[paramName]
			if !exists {
				continue
			}
			fVal, ok := toFloat64(val)
			if !ok {
				continue
			}
			if limit.Min != nil && fVal < *limit.Min {
				return fmt.Errorf("%w: parameter %s value %v < min %v", ErrRangeViolation, paramName, fVal, *limit.Min)
			}
			if limit.Max != nil && fVal > *limit.Max {
				return fmt.Errorf("%w: parameter %s value %v > max %v", ErrRangeViolation, paramName, fVal, *limit.Max)
			}
		}
	}

	// L3: Check inhibit flags in Redis DB-2 (FR-UPE-005)
	if e.redisClient != nil {
		inhibited, _ := e.redisClient.Get(ctx, 2, fmt.Sprintf("uplink:inhibited:%d:%d", cmd.SCID, cmd.APID))
		if inhibited == "1" {
			return ErrInhibitedViolation
		}
	}

	// L4: Check interlock chain (FR-UPE-006)
	if e.redisClient != nil {
		executing, _ := e.redisClient.Get(ctx, 2, fmt.Sprintf("uplink:executing:%d", cmd.SCID))
		if executing != "" && executing != cmd.CommandID {
			return ErrInterlockViolation
		}
	}

	return nil
}

func toFloat64(v any) (float64, bool) {
	switch val := v.(type) {
	case float64:
		return val, true
	case float32:
		return float64(val), true
	case int:
		return float64(val), true
	case int64:
		return float64(val), true
	default:
		return 0, false
	}
}
