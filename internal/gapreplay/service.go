// Package gapreplay recovers frames the ground lost after the antenna. For
// every gap the Frame Processor declares it asks the station recording for the
// missing frame counts and re-delivers the frames it finds, marked replay=true.
// It never fabricates a frame: a frame the antenna never received cleanly is
// reported as unrecoverable.
package gapreplay

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"sync/atomic"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/redis"
)

type GapEvent struct {
	SCID        uint16 `json:"scid"`
	VCID        uint8  `json:"vcid"`
	ExpectedFC  uint8  `json:"expected_fc"`
	ReceivedFC  uint8  `json:"received_fc"`
	LostFrames  int    `json:"lost_frames"`
	Reason      string `json:"reason"`
	TimestampNs int64  `json:"timestamp_ns"`
	SinceNs     int64  `json:"since_ns"` // the missing frames were received after this
}

// Lookup finds a recorded frame by spacecraft, virtual channel and frame
// count, received after `after` and no later than `before`.
type Lookup func(scid uint16, vcid, fc uint8, after, before time.Time) ([]byte, bool)

type GapReplayService struct {
	consumer    kafka.Consumer
	bus         kafka.Producer
	redisClient redis.Client
	lookup      Lookup

	recoveredCount     uint64
	unrecoverableCount uint64
}

// NewGapReplayService builds the service; lookup is the station recording
// (nil = no recording available: every gap is reported unrecoverable).
func NewGapReplayService(c kafka.Consumer, p kafka.Producer, r redis.Client, lookup Lookup) *GapReplayService {
	return &GapReplayService{consumer: c, bus: p, redisClient: r, lookup: lookup}
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
	at := time.Unix(0, gap.TimestampNs)
	if gap.TimestampNs == 0 {
		at = time.Now()
	}
	for i := 0; i < gap.LostFrames; i++ {
		lostFC := gap.ExpectedFC + uint8(i)
		pipeline.Inc("gapreplay.requested", 1)

		seenKey := fmt.Sprintf("gap:seen:%d:%d:%d:%d", gap.SCID, gap.VCID, lostFC, gap.TimestampNs/int64(time.Minute))
		if s.redisClient != nil {
			if seen, _ := s.redisClient.Get(ctx, 1, seenKey); seen == "1" {
				continue // already handled
			}
		}

		var frame []byte
		ok := false
		if s.lookup != nil {
			after := at.Add(-30 * time.Second)
			if gap.SinceNs > 0 {
				after = time.Unix(0, gap.SinceNs)
			}
			frame, ok = s.lookup(gap.SCID, gap.VCID, lostFC, after, at)
		}
		if !ok {
			atomic.AddUint64(&s.unrecoverableCount, 1)
			pipeline.Inc("gapreplay.unrecoverable", 1)
			continue
		}
		if s.redisClient != nil {
			_ = s.redisClient.Set(ctx, 1, seenKey, "1", 24*time.Hour)
		}
		rf := map[string]any{
			"scid":            gap.SCID,
			"frame_bytes_b64": base64.StdEncoding.EncodeToString(frame),
			"receive_ts_ns":   time.Now().UnixNano(),
			"antenna_id":      "ANT-ARCHIVE",
			"replay":          true,
		}
		if s.bus != nil {
			_ = kafka.ProduceJSON(ctx, s.bus, "tm.frames.stream.v1", []byte{byte(gap.SCID >> 8), byte(gap.SCID)}, rf, map[string]string{"replay": "true"})
		}
		atomic.AddUint64(&s.recoveredCount, 1)
		pipeline.Inc("gapreplay.recovered", 1)
	}
	return nil
}

func (s *GapReplayService) RecoveredCount() uint64 { return atomic.LoadUint64(&s.recoveredCount) }

func (s *GapReplayService) UnrecoverableCount() uint64 {
	return atomic.LoadUint64(&s.unrecoverableCount)
}
