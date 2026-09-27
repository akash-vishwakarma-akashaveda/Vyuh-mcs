package linkgateway

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"sync"
	"sync/atomic"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/kafka"
)

const TopicFrameStream = "tm.frames.stream.v1"

// FrameEnvelope is the canonical unit every adapter converges to before
// publication (architecture v2.2 §15.2's "FrameEnvelope").
type FrameEnvelope struct {
	SCID          uint16 `json:"scid"`
	FrameBytesB64 string `json:"frame_bytes_b64"`
	ReceiveTSNs   int64  `json:"receive_ts_ns"`
	AntennaID     string `json:"antenna_id"`
	PassID        string `json:"pass_id"`
	SourceAdapter string `json:"source_adapter"`
	Radiated      bool   `json:"radiated"`
	Replay        bool   `json:"replay"`
}

type Config struct {
	PodID     string
	AntennaID string
	PassID    string
	// SpoolSize bounds the write-ahead spool channel — the local substitute
	// for the NVMe WAL spool in §15.2 (see the backend plan's flagged
	// substitutions: no real fsync spool in this environment).
	SpoolSize int
}

type session struct {
	adapter Adapter
	codec   DeliveryCodec
}

// Gateway wires one or more Transport Adapters through their Delivery Codecs
// into a single spooled pump that publishes FrameEnvelopes to Kafka.
type Gateway struct {
	cfg      Config
	producer kafka.Producer
	sessions []session
	spool    chan RawUnit
	archive  *Archive

	framesReceived atomic.Uint64
	framesDropped  atomic.Uint64
	mu             sync.Mutex
}

// Archive is the station recording Gap Replay recovers lost frames from.
func (g *Gateway) Archive() *Archive { return g.archive }

func NewGateway(cfg Config, p kafka.Producer) *Gateway {
	if cfg.AntennaID == "" {
		cfg.AntennaID = "ANT-BLR-01"
	}
	if cfg.PassID == "" {
		cfg.PassID = "PASS-DEFAULT"
	}
	if cfg.SpoolSize == 0 {
		cfg.SpoolSize = 4096
	}
	return &Gateway{
		cfg:      cfg,
		producer: p,
		spool:    make(chan RawUnit, cfg.SpoolSize),
		archive:  NewArchive(0),
	}
}

// AddAdapter registers a Transport Adapter with its Delivery Codec. A nil
// codec defaults to PassthroughCodec (FR-LGW-05: new adapters plug in without
// touching the rest of the gateway).
func (g *Gateway) AddAdapter(a Adapter, codec DeliveryCodec) {
	if codec == nil {
		codec = PassthroughCodec{}
	}
	g.mu.Lock()
	g.sessions = append(g.sessions, session{adapter: a, codec: codec})
	g.mu.Unlock()
}

func (g *Gateway) FramesReceived() uint64 { return g.framesReceived.Load() }
func (g *Gateway) FramesDropped() uint64  { return g.framesDropped.Load() }

// Start runs every registered adapter and the spool pump until ctx is done.
func (g *Gateway) Start(ctx context.Context) error {
	g.mu.Lock()
	sessions := append([]session(nil), g.sessions...)
	g.mu.Unlock()

	raw := make(chan RawUnit, 256)

	var wg sync.WaitGroup
	for _, s := range sessions {
		wg.Add(1)
		go func(s session) {
			defer wg.Done()
			_ = s.adapter.Start(ctx, raw)
		}(s)
	}

	go g.spoolWriter(ctx, raw)
	go g.pump(ctx)

	<-ctx.Done()
	wg.Wait()
	return nil
}

// spoolWriter is the socket-read side: it never blocks on Kafka, only on the
// local spool channel (the WAL substitute — see Config.SpoolSize).
func (g *Gateway) spoolWriter(ctx context.Context, raw <-chan RawUnit) {
	for {
		select {
		case <-ctx.Done():
			return
		case u := <-raw:
			// The station recording keeps every clean frame, even one the
			// spool then has to drop.
			g.archive.Put(u.Payload, time.Unix(0, u.ReceivedAtNs))
			select {
			case g.spool <- u:
			default:
				g.framesDropped.Add(1) // spool full — see Q-06 note in the backend plan
				pipeline.Inc("link.spool_dropped", 1)
			}
		}
	}
}

// pump is the producer side: it drains the spool and publishes to Kafka.
func (g *Gateway) pump(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case u := <-g.spool:
			g.publish(ctx, u)
		}
	}
}

func (g *Gateway) publish(ctx context.Context, u RawUnit) {
	g.mu.Lock()
	sessions := g.sessions
	g.mu.Unlock()

	var codec DeliveryCodec = PassthroughCodec{}
	for _, s := range sessions {
		if s.adapter.Name() == u.SourceAdapter {
			codec = s.codec
			break
		}
	}

	frame, q, err := codec.Decode(u)
	if err != nil || len(frame) == 0 {
		pipeline.Inc("link.decode_error", 1)
		return
	}
	if u.ReceivedAtNs == 0 {
		u.ReceivedAtNs = nowNs() // a provider that sends no earth-receive time
	}

	var scid uint16 = 1
	if tf, err := ccsds.ParseTMFrame(frame, true, true); err == nil {
		scid = tf.SpacecraftID
	}

	g.framesReceived.Add(1)

	env := FrameEnvelope{
		SCID:          scid,
		FrameBytesB64: base64.StdEncoding.EncodeToString(frame),
		ReceiveTSNs:   u.ReceivedAtNs,
		AntennaID:     g.cfg.AntennaID,
		PassID:        g.cfg.PassID,
		SourceAdapter: u.SourceAdapter,
		Radiated:      q.Radiated,
	}

	scidKey := make([]byte, 2)
	binary.BigEndian.PutUint16(scidKey, scid)
	_ = kafka.ProduceJSON(ctx, g.producer, TopicFrameStream, scidKey, env, nil)
	pipeline.Inc("link.frames_published", 1)
	pipeline.Inc("link.bytes", int64(len(frame)))
}

func nowNs() int64 { return time.Now().UTC().UnixNano() }
