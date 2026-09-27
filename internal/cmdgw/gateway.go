package cmdgw

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/google/uuid"
)

// SubmitCommandRequest is the JSON payload submitted by operators or flight automation.
type SubmitCommandRequest struct {
	SCID       uint16         `json:"scid"`
	APID       uint16         `json:"apid"`
	Priority   string         `json:"priority"` // CRITICAL | HIGH | NORMAL | LOW
	Params     map[string]any `json:"params"`
	BypassCOP1 bool           `json:"bypass_cop1"`
}

// CommandLogRecord stores the full command audit trail.
type CommandLogRecord struct {
	CommandID       string                `json:"commandId"`
	SCID            uint16                `json:"scid"`
	APID            uint16                `json:"apid"`
	Priority        string                `json:"priority"`
	Params          map[string]any        `json:"params"`
	OperatorID      string                `json:"operatorId"`
	BypassCOP1      bool                  `json:"bypassCop1"`
	Status          command.CommandStatus `json:"status"`
	SubmittedAt     time.Time             `json:"submittedAt"`
	QueuedAt        *time.Time            `json:"queuedAt,omitempty"`
	SentAt          *time.Time            `json:"sentAt,omitempty"`
	AcknowledgedAt  *time.Time            `json:"acknowledgedAt,omitempty"`
	CompletedAt     *time.Time            `json:"completedAt,omitempty"`
	CancelRequested bool                  `json:"cancelRequested,omitempty"`
	FailedAt        *time.Time            `json:"failedAt,omitempty"`
	RejectionReason string                `json:"rejectionReason,omitempty"`
}

// CommandGatewayService handles telecommand ingress, validation, and tracking.
type CommandGatewayService struct {
	bus      kafka.Producer
	consumer kafka.Consumer
	logStore map[string]*CommandLogRecord
	hook     func(CommandLogRecord)
	validate func(scid, apid uint16) error
	mu       sync.RWMutex
}

// SetValidator installs the submission check (known spacecraft, known
// command): a command that fails it is refused with 422 and never enters the chain.
func (gw *CommandGatewayService) SetValidator(v func(scid, apid uint16) error) { gw.validate = v }

// NewCommandGatewayService creates a new command gateway service.
func NewCommandGatewayService(bus kafka.Producer, consumer kafka.Consumer) *CommandGatewayService {
	gw := &CommandGatewayService{
		bus:      bus,
		consumer: consumer,
		logStore: make(map[string]*CommandLogRecord),
	}

	// Listen for cmd.ack.events to update command execution status
	if consumer != nil {
		_ = consumer.Subscribe("cmd.ack.events", func(ctx context.Context, msg *kafka.Message) error {
			var ack command.CommandAckEvent
			if err := json.Unmarshal(msg.Value, &ack); err == nil {
				gw.UpdateCommandStatus(&ack)
			}
			return nil
		})
	}

	return gw
}

// SetStatusHook registers a callback invoked (outside any lock) with a copy of
// the command record every time its status changes — the fan-out point for
// live updates to every connected console.
func (gw *CommandGatewayService) SetStatusHook(fn func(CommandLogRecord)) {
	gw.mu.Lock()
	gw.hook = fn
	gw.mu.Unlock()
}

func (gw *CommandGatewayService) notify(rec CommandLogRecord) {
	gw.mu.RLock()
	fn := gw.hook
	gw.mu.RUnlock()
	if fn != nil {
		fn(rec)
	}
}

// UpdateCommandStatus updates the internal tracking record based on an ACK event.
func (gw *CommandGatewayService) UpdateCommandStatus(ack *command.CommandAckEvent) {
	gw.mu.Lock()
	rec, ok := gw.logStore[ack.CommandID]
	if !ok {
		gw.mu.Unlock()
		return
	}
	defer func() {
		snapshot := *rec
		gw.mu.Unlock()
		gw.notify(snapshot)
	}()

	if ack.Status == command.StatusCancelRejected {
		// The command left before the cancel reached the uplink: say so, keep its status.
		rec.RejectionReason = ack.Reason
		return
	}
	// Events from different engines can arrive out of order (a QUEUED after its
	// SENT): the record only ever moves forward along the lifecycle.
	if command.Rank(ack.Status) < command.Rank(rec.Status) || command.Rank(rec.Status) == 9 {
		return
	}
	rec.Status = ack.Status
	now := ack.Timestamp
	if now.IsZero() {
		now = time.Now().UTC()
	}

	switch ack.Status {
	case command.StatusQueued:
		rec.QueuedAt = &now
	case command.StatusSent:
		rec.SentAt = &now
	case command.StatusAcknowledged:
		rec.AcknowledgedAt = &now
	case command.StatusCompleted:
		rec.CompletedAt = &now
	case command.StatusExecFailed, command.StatusCancelled:
		rec.FailedAt = &now
		rec.RejectionReason = ack.Reason
	case command.StatusFailed, command.StatusRejectedRange, command.StatusRejectedConstraint, command.StatusRejectedInhibited:
		rec.FailedAt = &now
		rec.RejectionReason = ack.Reason
	}
}

// Routes builds the HTTP router for the command gateway.
func (gw *CommandGatewayService) Routes() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("POST /api/v1/commands", gw.handleSubmitCommand)
	mux.HandleFunc("GET /api/v1/commands/", gw.handleGetCommandByID)
	mux.HandleFunc("GET /api/v1/commands", gw.handleListCommands)
	mux.HandleFunc("POST /api/v1/commands/{commandId}/cancel", gw.handleCancelCommand)

	return mux
}

func (gw *CommandGatewayService) handleSubmitCommand(w http.ResponseWriter, r *http.Request) {
	var req SubmitCommandRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"INVALID_SCHEMA","detail":"failed to decode JSON"}`, http.StatusBadRequest)
		return
	}

	if req.SCID == 0 || req.APID == 0 {
		http.Error(w, `{"error":"INVALID_SCHEMA","detail":"scid and apid are required"}`, http.StatusBadRequest)
		return
	}

	if gw.validate != nil {
		if err := gw.validate(req.SCID, req.APID); err != nil {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnprocessableEntity)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "REJECTED", "detail": err.Error()})
			return
		}
	}

	operatorID := r.Header.Get("X-Operator-ID")
	if operatorID == "" {
		operatorID = "user:operator"
	}

	cmdID, _ := uuid.NewV7()
	cmdIDStr := cmdID.String()

	prio := command.PriorityNormal
	switch strings.ToUpper(req.Priority) {
	case "CRITICAL":
		prio = command.PriorityCritical
	case "HIGH":
		prio = command.PriorityHigh
	case "LOW":
		prio = command.PriorityLow
	}

	now := time.Now().UTC()

	rec := &CommandLogRecord{
		CommandID:   cmdIDStr,
		SCID:        req.SCID,
		APID:        req.APID,
		Priority:    prio.String(),
		Params:      req.Params,
		OperatorID:  operatorID,
		BypassCOP1:  req.BypassCOP1,
		Status:      command.StatusPending,
		SubmittedAt: now,
	}

	gw.mu.Lock()
	gw.logStore[cmdIDStr] = rec
	snapshot := *rec
	gw.mu.Unlock()
	gw.notify(snapshot)

	rawMsg := command.RawCommand{
		CommandID:   cmdIDStr,
		SCID:        req.SCID,
		APID:        req.APID,
		Priority:    prio,
		Params:      req.Params,
		OperatorID:  operatorID,
		BypassCOP1:  req.BypassCOP1,
		SubmittedAt: now,
	}

	scidKey := []byte(fmt.Sprintf("%d", req.SCID))
	_ = kafka.ProduceJSON(r.Context(), gw.bus, "raw.commands", scidKey, rawMsg, nil)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"commandId":   cmdIDStr,
		"scid":        req.SCID,
		"apid":        req.APID,
		"status":      "PENDING",
		"submittedAt": now.Format(time.RFC3339Nano),
		"operatorId":  operatorID,
	})
}

func (gw *CommandGatewayService) handleGetCommandByID(w http.ResponseWriter, r *http.Request) {
	path := r.URL.Path
	cmdID := strings.TrimPrefix(path, "/api/v1/commands/")
	if cmdID == "" || strings.Contains(cmdID, "/") {
		http.NotFound(w, r)
		return
	}

	gw.mu.RLock()
	rec, ok := gw.logStore[cmdID]
	gw.mu.RUnlock()

	if !ok {
		http.Error(w, `{"error":"COMMAND_NOT_FOUND"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(rec)
}

func (gw *CommandGatewayService) handleListCommands(w http.ResponseWriter, r *http.Request) {
	gw.mu.RLock()
	list := make([]*CommandLogRecord, 0, len(gw.logStore))
	for _, rec := range gw.logStore {
		list = append(list, rec)
	}
	gw.mu.RUnlock()

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"commands": list,
		"total":    len(list),
	})
}

func (gw *CommandGatewayService) handleCancelCommand(w http.ResponseWriter, r *http.Request) {
	cmdID := r.PathValue("commandId")
	if cmdID == "" {
		parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if len(parts) >= 5 && parts[len(parts)-1] == "cancel" {
			cmdID = parts[len(parts)-2]
		}
	}
	if cmdID == "" {
		http.NotFound(w, r)
		return
	}

	gw.mu.Lock()
	rec, ok := gw.logStore[cmdID]
	if !ok {
		gw.mu.Unlock()
		http.Error(w, `{"error":"COMMAND_NOT_FOUND"}`, http.StatusNotFound)
		return
	}

	if rec.Status != command.StatusPending && rec.Status != command.StatusQueued {
		gw.mu.Unlock()
		http.Error(w, `{"error":"CANNOT_CANCEL","detail":"Command has already been dispatched"}`, http.StatusConflict)
		return
	}

	// The uplink engine decides: it withdraws a command still waiting for the
	// transmission window, or reports that it was already radiated.
	rec.CancelRequested = true
	scid := rec.SCID
	gw.mu.Unlock()
	_ = kafka.ProduceJSON(r.Context(), gw.bus, "cmd.cancel", []byte(fmt.Sprintf("%d", scid)), map[string]any{"command_id": cmdID, "scid": scid}, nil)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusAccepted)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"commandId": cmdID,
		"status":    "CANCEL_REQUESTED",
	})
}

// GetRecord returns a command record by ID (useful for testing or direct access).
func (gw *CommandGatewayService) GetRecord(cmdID string) (*CommandLogRecord, bool) {
	gw.mu.RLock()
	defer gw.mu.RUnlock()
	rec, ok := gw.logStore[cmdID]
	return rec, ok
}
