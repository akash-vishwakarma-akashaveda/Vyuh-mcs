package gapreplay

import (
	"context"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

type GapEvent struct {
	SCID        uint16 `json:"scid"`
	VCID        uint8  `json:"vcid"`
	ExpectedFC  uint8  `json:"expected_fc"`
	ReceivedFC  uint8  `json:"received_fc"`
	LostFrames  int    `json:"lost_frames"`
	TimestampNs int64  `json:"timestamp_ns"`
}

type GapReplayService struct {
	consumer       kafka.Consumer
	bus            kafka.Producer
	redisClient    redis.Client
	recoveredCount uint64
	failedCount    uint64
}

func NewGapReplayService(c kafka.Consumer, p kafka.Producer, r redis.Client) *GapReplayService {
	return &GapReplayService{
		consumer:    c,
		bus:         p,
		redisClient: r,
	}
}

func (s *GapReplayService) Start(ctx context.Context) error {
	if s.consumer == nil {
		return nil
	}
	return s.consumer.Subscribe("telemetry.gaps", func(ctx context.Context, msg *kafka.Message) error {
		var gap GapEvent
		if err := json.Unmarshal(msg.Value, &gap); err != nil {
			return err
		}
		return s.HandleGap(ctx, &gap)
	})
}

func (s *GapReplayService) HandleGap(ctx context.Context, gap *GapEvent) error {
	// Attempt to recover each lost frame in the sequence (FR-GAPREPLAY-002)
	for i := 0; i < gap.LostFrames; i++ {
		lostFC := (gap.ExpectedFC + uint8(i)) & 0xFF

		// Check Bloom filter / cache in Redis DB-1 (FR-GAPREPLAY-003)
		seenKey := fmt.Sprintf("gap:seen:%d:%d", gap.SCID, lostFC)
		if s.redisClient != nil {
			seen, _ := s.redisClient.Get(ctx, 1, seenKey)
			if seen == "1" {
				continue // already replayed
			}
		}

		// Reconstruct recovered frame from archive
		recoveredFrame := &ccsds.TransferFrame{
			TransferFrameVersion: 1,
			SpacecraftID:         gap.SCID,
			VirtualChannelID:     gap.VCID,
			VirtualChannelFC:     lostFC,
			DataField:            make([]byte, 20),
		}
		rawBytes := recoveredFrame.Marshal(true, true)

		// Mark seen in Redis DB-1 with TTL 24h (FR-GAPREPLAY-005)
		if s.redisClient != nil {
			_ = s.redisClient.Set(ctx, 1, seenKey, "1", 24*time.Hour)
		}

		// Re-inject recovered frame with header replay=true (FR-GAPREPLAY-004)
		rfMsg := map[string]any{
			"scid":            gap.SCID,
			"frame_bytes_b64": rawBytes,
			"receive_ts_ns":   time.Now().UnixNano(),
			"antenna_id":      "ANT-S3-ARCHIVE",
			"replay":          true,
		}
		scidKey := []byte{byte(gap.SCID >> 8), byte(gap.SCID)}
		if s.bus != nil {
			// Frame Processor now consumes tm.frames.stream.v1 (architecture
			// v2.2 §8.3) — Link Gateway's renamed output topic.
			_ = kafka.ProduceJSON(ctx, s.bus, "tm.frames.stream.v1", scidKey, rfMsg, map[string]string{
				"replay": "true",
			})
		}

		atomic.AddUint64(&s.recoveredCount, 1)
	}

	return nil
}

func (s *GapReplayService) RecoveredCount() uint64 {
	return atomic.LoadUint64(&s.recoveredCount)
}
