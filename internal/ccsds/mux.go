package ccsds

// VCMux turns a stream of space packets into fixed-length TM transfer frames
// for one virtual channel, the way an on-board frame generator does
// (CCSDS 132.0 §4.1.2.7): packets are laid end to end across frames, the first
// header pointer marks where the first packet starts in each frame (0x7FF when
// a frame only continues a packet), and when there is nothing to send an idle
// frame (FHP 0x7FE) keeps the link busy.
type VCMux struct {
	SCID      uint16
	VCID      uint8
	FrameLen  int // total bytes on the wire including ASM, OCF and FECF
	WithOCF   bool
	OCF       func() uint32 // CLCW to embed, called per frame
	mcfc      *uint8        // shared master channel counter (all VCs of one spacecraft)
	vcfc      uint8
	queue     []byte // packet bytes not yet framed
	pktStarts []int  // offsets in queue where packets begin
}

// NewVCMux builds a mux; mcfc may be shared by several VCMux of the same spacecraft.
func NewVCMux(scid uint16, vcid uint8, frameLen int, withOCF bool, mcfc *uint8) *VCMux {
	if mcfc == nil {
		mcfc = new(uint8)
	}
	return &VCMux{SCID: scid, VCID: vcid, FrameLen: frameLen, WithOCF: withOCF, mcfc: mcfc}
}

// DataFieldLen is the payload capacity of one frame.
func (m *VCMux) DataFieldLen() int {
	n := m.FrameLen - 4 - 6 - 2 // ASM, primary header, FECF
	if m.WithOCF {
		n -= 4
	}
	return n
}

// Push queues one encoded space packet.
func (m *VCMux) Push(packet []byte) {
	m.pktStarts = append(m.pktStarts, len(m.queue))
	m.queue = append(m.queue, packet...)
}

// Pending reports how many packet bytes are waiting.
func (m *VCMux) Pending() int { return len(m.queue) }

// Next builds one frame. With idleFill, a frame that is not full is completed
// with an idle packet; otherwise Next returns nil until a full frame is ready.
// With nothing queued and idleFill set, an idle frame is returned.
func (m *VCMux) Next(idleFill bool) []byte {
	capacity := m.DataFieldLen()
	if len(m.queue) < capacity && !idleFill {
		return nil
	}

	// First header pointer: offset of the first packet header that starts
	// within the framed bytes (limit), else 0x7FF.
	firstHeader := func(limit int) uint16 {
		if len(m.pktStarts) > 0 && m.pktStarts[0] < limit {
			return uint16(m.pktStarts[0])
		}
		return FHP_NO_PACKET_HEADER
	}

	var fhp uint16
	var field []byte
	switch {
	case len(m.queue) == 0:
		fhp = FHP_IDLE_DATA
		field = idleBytes(capacity)
	case len(m.queue) >= capacity:
		fhp = firstHeader(capacity)
		field = m.take(capacity)
	default:
		// Close the frame with an idle packet after the last queued packet.
		// Packets are contiguous in the packet stream: an idle packet may only
		// start between packets, never inside one. When there is room for a
		// whole idle packet (7+ bytes) it fills the frame exactly; with less
		// room the idle packet starts here and runs on into the next frame.
		n := len(m.queue)
		rest := capacity - n
		if rest >= 7 {
			if fhp = firstHeader(n); fhp == FHP_NO_PACKET_HEADER {
				fhp = uint16(n) // the idle packet is the first header in this frame
			}
			field = m.take(n)
			idle := &SpacePacket{APID: 0x7FF, SeqFlags: 3, Data: idleBytes(rest - 6)}
			field = append(field, idle.Marshal()...)
		} else {
			m.Push((&SpacePacket{APID: 0x7FF, SeqFlags: 3, Data: idleBytes(7)}).Marshal())
			fhp = firstHeader(capacity)
			field = m.take(capacity)
		}
	}

	var ocf *uint32
	if m.WithOCF {
		w := uint32(0)
		if m.OCF != nil {
			w = m.OCF()
		}
		ocf = &w
	}
	f := &TransferFrame{
		SpacecraftID:            m.SCID,
		VirtualChannelID:        m.VCID,
		OperationalControlField: m.WithOCF,
		MasterChannelFC:         *m.mcfc,
		VirtualChannelFC:        m.vcfc,
		FirstHeaderPointer:      fhp,
		DataField:               field,
		OCF:                     ocf,
	}
	*m.mcfc++
	m.vcfc++
	return f.Marshal(true, true)
}

func (m *VCMux) take(n int) []byte {
	out := append([]byte(nil), m.queue[:n]...)
	m.queue = m.queue[n:]
	starts := m.pktStarts[:0]
	for _, s := range m.pktStarts {
		if s >= n {
			starts = append(starts, s-n)
		}
	}
	m.pktStarts = starts
	return out
}

func idleBytes(n int) []byte {
	b := make([]byte, n)
	for i := range b {
		b[i] = 0x55
	}
	return b
}
