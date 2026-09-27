// Package verification is the Command Verification Engine: it turns the
// spacecraft's PUS service 1 reports into command statuses. The Uplink
// Transfer Frame Engine announces every telecommand it radiates (spacecraft,
// APID, packet sequence count); a TM(1,x) report names the telecommand by the
// same request ID, so acceptance and completion are matched to the command the
// operator sent — the only honest source of "executed".
package verification

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/utfe"
)

const (
	topicPackets = "tm.packets.realtime.v1"
	topicAcks    = "cmd.ack.events"
	// keep is how long a radiated command waits for its reports.
	keep = 10 * time.Minute
)

type packetMsg struct {
	SCID           uint16 `json:"scid"`
	APID           uint16 `json:"apid"`
	PacketBytesB64 string `json:"packet_bytes_b64"`
	Replay         bool   `json:"replay"`
}

type pending struct {
	id string
	at time.Time
}

type Engine struct {
	bus  kafka.Producer
	cons kafka.Consumer

	mu   sync.Mutex
	sent map[string]pending // "scid:apid:seq" -> command
}

func NewEngine(bus kafka.Producer, cons kafka.Consumer) *Engine {
	return &Engine{bus: bus, cons: cons, sent: map[string]pending{}}
}

func key(scid, apid, seq uint16) string { return fmt.Sprintf("%d:%d:%d", scid, apid&0x7FF, seq&0x3FFF) }

func (e *Engine) Start(ctx context.Context) error {
	if err := e.cons.Subscribe(utfe.TopicSent, func(_ context.Context, m *kafka.Message) error {
		var s utfe.Sent
		if json.Unmarshal(m.Value, &s) != nil {
			return nil
		}
		now := time.Now()
		e.mu.Lock()
		e.sent[key(s.SCID, s.APID, s.SeqCount)] = pending{id: s.CommandID, at: now}
		for k, p := range e.sent { // forget commands whose reports never came
			if now.Sub(p.at) > keep {
				delete(e.sent, k)
			}
		}
		e.mu.Unlock()
		return nil
	}); err != nil {
		return err
	}
	return e.cons.Subscribe(topicPackets, func(ctx context.Context, m *kafka.Message) error {
		var p packetMsg
		if json.Unmarshal(m.Value, &p) != nil || p.APID != ccsds.VerificationAPID || p.Replay {
			return nil
		}
		data, err := base64.StdEncoding.DecodeString(p.PacketBytesB64)
		if err != nil {
			return nil
		}
		e.handle(ctx, p.SCID, data)
		return nil
	})
}

func (e *Engine) handle(ctx context.Context, scid uint16, data []byte) {
	r, err := ccsds.ParseVerification(data)
	if err != nil {
		pipeline.Inc("verification.malformed", 1)
		return
	}
	pipeline.Inc("verification.reports", 1)
	k := key(scid, r.RequestAPID, r.RequestSeq)
	e.mu.Lock()
	p, ok := e.sent[k]
	if ok && (r.Subtype == ccsds.PUSCompletionSuccess || r.Subtype == ccsds.PUSCompletionFailure || r.Subtype == ccsds.PUSAcceptFailure) {
		delete(e.sent, k) // final report
	}
	e.mu.Unlock()
	if !ok {
		pipeline.Inc("verification.unmatched", 1) // a command from another ground system, or one we forgot
		return
	}

	ack := command.CommandAckEvent{CommandID: p.id, SCID: scid, SeqCount: r.RequestSeq, Timestamp: time.Now().UTC()}
	switch r.Subtype {
	case ccsds.PUSAcceptSuccess:
		ack.Status = command.StatusAcceptedOnBoard
		pipeline.Inc("verification.accepted", 1)
	case ccsds.PUSAcceptFailure:
		ack.Status, ack.Reason = command.StatusExecFailed, "rejected on board at acceptance: "+failure(r.FailureCode)
		pipeline.Inc("verification.acceptance_failed", 1)
	case ccsds.PUSCompletionSuccess:
		ack.Status = command.StatusCompleted
		pipeline.Inc("verification.completed", 1)
	case ccsds.PUSCompletionFailure:
		ack.Status, ack.Reason = command.StatusExecFailed, "execution failed on board: "+failure(r.FailureCode)
		pipeline.Inc("verification.execution_failed", 1)
	default:
		return
	}
	_ = kafka.ProduceJSON(ctx, e.bus, topicAcks, []byte{byte(scid >> 8), byte(scid)}, ack, nil)
}

func failure(code uint16) string {
	switch code {
	case ccsds.FailAuthentication:
		return "authentication failed"
	case ccsds.FailMalformed:
		return "malformed telecommand"
	case ccsds.FailParameters:
		return "invalid parameters"
	case ccsds.FailExecution:
		return "the spacecraft could not perform it"
	}
	return fmt.Sprintf("code 0x%04X", code)
}
