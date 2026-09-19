package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/cmdgw"
	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/stretchr/testify/assert"
)

func TestCommandGateway_SubmitAndQuery(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	bus := kafka.NewMemoryBus()
	gw := cmdgw.NewCommandGatewayService(bus, bus)

	rawCmdChan := make(chan *command.RawCommand, 5)
	_ = bus.Subscribe("raw.commands", func(ctx context.Context, msg *kafka.Message) error {
		var rc command.RawCommand
		if err := json.Unmarshal(msg.Value, &rc); err == nil {
			rawCmdChan <- &rc
		}
		return nil
	})

	server := httptest.NewServer(gw.Routes())
	defer server.Close()

	// 1. Submit valid command
	reqBody := cmdgw.SubmitCommandRequest{
		SCID:     42,
		APID:     100,
		Priority: "HIGH",
		Params: map[string]any{
			"target_voltage": 3.3,
			"enable_heater":  true,
		},
	}
	bodyBytes, _ := json.Marshal(reqBody)

	resp, err := http.Post(server.URL+"/api/v1/commands", "application/json", bytes.NewReader(bodyBytes))
	assert.NoError(t, err)
	assert.Equal(t, http.StatusAccepted, resp.StatusCode)

	var submitResp map[string]any
	assert.NoError(t, json.NewDecoder(resp.Body).Decode(&submitResp))
	cmdID := submitResp["commandId"].(string)
	assert.NotEmpty(t, cmdID)
	assert.Equal(t, "PENDING", submitResp["status"])

	// 2. Verify command published on raw.commands
	select {
	case rc := <-rawCmdChan:
		assert.Equal(t, cmdID, rc.CommandID)
		assert.Equal(t, uint16(42), rc.SCID)
		assert.Equal(t, command.PriorityHigh, rc.Priority)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for command on raw.commands")
	}

	// 3. Query status via GET /api/v1/commands/{commandId}
	getResp, err := http.Get(server.URL + "/api/v1/commands/" + cmdID)
	assert.NoError(t, err)
	assert.Equal(t, http.StatusOK, getResp.StatusCode)

	var logRec cmdgw.CommandLogRecord
	assert.NoError(t, json.NewDecoder(getResp.Body).Decode(&logRec))
	assert.Equal(t, cmdID, logRec.CommandID)
	assert.Equal(t, command.StatusPending, logRec.Status)

	// 4. Simulate cmd.ack.events from UTFE (ACKNOWLEDGED)
	ackEvt := command.CommandAckEvent{
		CommandID: cmdID,
		SCID:      42,
		Status:    command.StatusAcknowledged,
		Timestamp: time.Now().UTC(),
	}
	_ = kafka.ProduceJSON(ctx, bus, "cmd.ack.events", []byte{0, 42}, ackEvt, nil)
	time.Sleep(50 * time.Millisecond)

	// 5. Query again and confirm ACKNOWLEDGED status
	getResp2, err := http.Get(server.URL + "/api/v1/commands/" + cmdID)
	assert.NoError(t, err)
	var logRec2 cmdgw.CommandLogRecord
	assert.NoError(t, json.NewDecoder(getResp2.Body).Decode(&logRec2))
	assert.Equal(t, command.StatusAcknowledged, logRec2.Status)
	assert.NotNil(t, logRec2.AcknowledgedAt)
}
