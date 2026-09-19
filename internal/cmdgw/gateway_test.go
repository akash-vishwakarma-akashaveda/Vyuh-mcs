package cmdgw

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
)

func TestCommandGateway_SubmitAndRetrieve(t *testing.T) {
	bus := kafka.NewMemoryBus()
	gw := NewCommandGatewayService(bus, bus)
	handler := gw.Routes()

	// 1. Submit valid command
	body := map[string]any{
		"scid":     42,
		"apid":     100,
		"priority": "HIGH",
		"params": map[string]any{
			"heater_state": 1,
			"target_temp":  25.5,
		},
		"bypass_cop1": false,
	}
	bodyBytes, _ := json.Marshal(body)

	req := httptest.NewRequest("POST", "/api/v1/commands", bytes.NewReader(bodyBytes))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Operator-ID", "operator:akash")
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d: %s", rec.Code, rec.Body.String())
	}

	var res map[string]any
	if err := json.NewDecoder(rec.Body).Decode(&res); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	cmdID, ok := res["commandId"].(string)
	if !ok || cmdID == "" {
		t.Fatalf("missing or invalid commandId: %v", res)
	}

	// 2. Query command by ID
	reqGet := httptest.NewRequest("GET", "/api/v1/commands/"+cmdID, nil)
	recGet := httptest.NewRecorder()
	handler.ServeHTTP(recGet, reqGet)

	if recGet.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", recGet.Code, recGet.Body.String())
	}

	var logRec CommandLogRecord
	if err := json.NewDecoder(recGet.Body).Decode(&logRec); err != nil {
		t.Fatalf("failed to decode log record: %v", err)
	}
	if logRec.CommandID != cmdID {
		t.Errorf("expected command ID %s, got %s", cmdID, logRec.CommandID)
	}
	if logRec.SCID != 42 || logRec.APID != 100 {
		t.Errorf("unexpected SCID/APID: %d/%d", logRec.SCID, logRec.APID)
	}
	if logRec.Status != command.StatusPending {
		t.Errorf("expected status PENDING, got %s", logRec.Status)
	}

	// 3. Simulate ACK event
	ack := command.CommandAckEvent{
		CommandID: cmdID,
		SCID:      42,
		Status:    command.StatusAcknowledged,
		Timestamp: time.Now().UTC(),
	}
	gw.UpdateCommandStatus(&ack)

	updatedRec, found := gw.GetRecord(cmdID)
	if !found {
		t.Fatalf("command record not found")
	}
	if updatedRec.Status != command.StatusAcknowledged {
		t.Errorf("expected status ACKNOWLEDGED, got %s", updatedRec.Status)
	}
	if updatedRec.AcknowledgedAt == nil {
		t.Errorf("expected AcknowledgedAt to be populated")
	}
}

func TestCommandGateway_Cancel(t *testing.T) {
	bus := kafka.NewMemoryBus()
	gw := NewCommandGatewayService(bus, bus)
	handler := gw.Routes()

	// Submit command
	body := map[string]any{
		"scid": 42,
		"apid": 100,
	}
	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/v1/commands", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	var res map[string]any
	_ = json.NewDecoder(rec.Body).Decode(&res)
	cmdID := res["commandId"].(string)

	// Cancel command
	cancelReq := httptest.NewRequest("POST", "/api/v1/commands/"+cmdID+"/cancel", nil)
	cancelRec := httptest.NewRecorder()
	handler.ServeHTTP(cancelRec, cancelReq)

	if cancelRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d: %s", cancelRec.Code, cancelRec.Body.String())
	}

	cancelledRec, _ := gw.GetRecord(cmdID)
	if cancelledRec.Status != command.StatusCancelled {
		t.Errorf("expected status CANCELLED, got %s", cancelledRec.Status)
	}
}

func TestCommandGateway_Validation(t *testing.T) {
	bus := kafka.NewMemoryBus()
	gw := NewCommandGatewayService(bus, bus)
	handler := gw.Routes()

	// Missing SCID / APID
	body := map[string]any{}
	bodyBytes, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/api/v1/commands", bytes.NewReader(bodyBytes))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %d", rec.Code)
	}
}
