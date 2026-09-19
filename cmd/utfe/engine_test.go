package main

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/command"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
	"github.com/akashaveda/vyuh-mcs/internal/utfe"
	"github.com/stretchr/testify/assert"
)

func TestUTFE_EndToEndFramingAndCLCW(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	bus := kafka.NewMemoryBus()
	rClient := redis.NewMemoryClient()
	driver := &utfe.MockAntennaDriver{}

	engine := utfe.NewUTFEEngine(42, rClient, bus, bus, driver)
	assert.NoError(t, engine.Start(ctx))

	ackChan := make(chan *command.CommandAckEvent, 5)
	_ = bus.Subscribe("cmd.ack.events", func(ctx context.Context, msg *kafka.Message) error {
		var ack command.CommandAckEvent
		if err := json.Unmarshal(msg.Value, &ack); err == nil {
			ackChan <- &ack
		}
		return nil
	})

	// 1. Submit TC Space Packet to tc.packets
	tc := command.TCSpacePacket{
		CommandID:  "cmd-utfe-test",
		SCID:       42,
		APID:       100,
		SeqCount:   1,
		Ciphertext: []byte{0xAA, 0xBB, 0xCC, 0xDD},
		BypassCOP1: false, // Type-AD
	}
	_ = kafka.ProduceJSON(ctx, bus, "tc.packets", []byte{0, 42}, tc, nil)

	// Verify SENT acknowledgement
	select {
	case ack := <-ackChan:
		assert.Equal(t, "cmd-utfe-test", ack.CommandID)
		assert.Equal(t, command.StatusSent, ack.Status)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for SENT ack")
	}

	// Verify antenna driver received the frame with valid CRC
	sentFrames := driver.SentFrames()
	assert.Equal(t, 1, len(sentFrames))
	sentBytes := sentFrames[0]

	parsedFrame, err := ccsds.ParseTCFrame(sentBytes)
	assert.NoError(t, err)
	assert.Equal(t, uint16(42), parsedFrame.SpacecraftID)
	assert.Equal(t, uint8(0), parsedFrame.SeqNumber) // V(S) = 0
	sp, err := ccsds.ParseSpacePacket(parsedFrame.Data)
	assert.NoError(t, err)
	assert.Equal(t, tc.APID, sp.APID)
	assert.Equal(t, tc.SeqCount, sp.SeqCount)
	assert.Equal(t, tc.Payload(), sp.Data, "the TC space packet carries IV||ciphertext||tag")

	// 2. Spacecraft accepts frame 0 and sends CLCW report V(R)=1
	clcwEvt := map[string]any{
		"scid":       float64(42),
		"v_r":        float64(1), // next expected
		"retransmit": false,
		"wait":       false,
		"no_rf":      false,
		"no_bitlock": false,
	}
	_ = kafka.ProduceJSON(ctx, bus, "tm.clcw.v1", []byte{0, 42}, clcwEvt, nil)

	// Verify ACKNOWLEDGED status published
	select {
	case ack := <-ackChan:
		assert.Equal(t, "cmd-utfe-test", ack.CommandID)
		assert.Equal(t, command.StatusAcknowledged, ack.Status)
		assert.Equal(t, uint8(1), ack.ReportValueVR)
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for ACKNOWLEDGED event")
	}
}
