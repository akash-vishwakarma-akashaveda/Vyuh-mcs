// Package linkgateway implements the Link Gateway module (architecture v2.2
// §15.2): the only component that terminates ground-station links, via a
// three-layer adapter model — Transport Adapter -> Delivery Codec -> Frame
// Protocol Codec (internal/ccsds) — so a new provider only needs a new
// Adapter/DeliveryCodec, never a change to the rest of the pipeline (FR-LGW-05).
package linkgateway

import "context"

// RawUnit is one delivery unit handed from a Transport Adapter to its
// Delivery Codec: provider-specific bytes plus what the transport already
// knows about them.
type RawUnit struct {
	SourceAdapter string
	ReceivedAtNs  int64
	Payload       []byte
}

// Quality carries per-unit delivery metadata a Delivery Codec extracts from
// provider-specific framing (SLE annotations, vendor headers, ...).
type Quality struct {
	Radiated    bool // false = provider flagged the unit as errored/uncertain
	Annotations map[string]string
}

// Adapter is a Transport Adapter: it owns one kind of link to the outside
// world (TCP, UDP, a file, an MQTT broker, an SLE association, ...) and
// pushes whatever it receives onto out. Start blocks until ctx is done or the
// adapter fails permanently.
type Adapter interface {
	Name() string
	Start(ctx context.Context, out chan<- RawUnit) error
}

// DeliveryCodec strips provider-specific delivery framing (SLE annotations,
// vendor headers, PCAP, ...) and returns the canonical frame bytes the Frame
// Protocol Codec (internal/ccsds) can parse.
type DeliveryCodec interface {
	Decode(u RawUnit) (frame []byte, q Quality, err error)
}

// PassthroughCodec is the default Delivery Codec for transports that deliver
// bare frame bytes with no extra envelope (TCP, UDP, File, MQTT).
type PassthroughCodec struct{}

func (PassthroughCodec) Decode(u RawUnit) ([]byte, Quality, error) {
	return u.Payload, Quality{Radiated: true}, nil
}
