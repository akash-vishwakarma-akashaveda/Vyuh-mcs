package linkgateway

import (
	"bytes"
	"encoding/binary"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
)

var asmBytes = func() []byte {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, ccsds.CCSDS_ASM)
	return b
}()

// Deframer is the bitstream frame-sync Delivery Codec (§15.2): it cuts a raw
// byte stream (TCP does not preserve write boundaries) into fixed-length TM
// frames by locking onto the Attached Sync Marker, and resynchronises after
// garbage or a lost byte. Each returned frame starts with the ASM.
type Deframer struct {
	frameLen int // total frame length including the 4-byte ASM
	buf      []byte
}

func NewDeframer(frameLen int) *Deframer { return &Deframer{frameLen: frameLen} }

// Push appends stream bytes and returns every complete frame now available.
func (d *Deframer) Push(b []byte) [][]byte {
	d.buf = append(d.buf, b...)
	var frames [][]byte
	for {
		idx := bytes.Index(d.buf, asmBytes)
		if idx < 0 {
			// No marker: keep only a possible partial marker at the tail.
			if keep := len(asmBytes) - 1; len(d.buf) > keep {
				d.buf = append([]byte(nil), d.buf[len(d.buf)-keep:]...)
			}
			return frames
		}
		if idx > 0 {
			pipeline.Inc("link.sync_slip_bytes", int64(idx))
			d.buf = d.buf[idx:] // drop bytes before the marker (resync)
		}
		if len(d.buf) < d.frameLen {
			return frames // wait for the rest of this frame
		}
		// A frame whose check sequence fails but that contains another sync
		// marker was cut short (receiver dropout): the marker inside is the real
		// start of the next frame. Drop the truncated frame and resync there,
		// instead of swallowing the next frame too.
		if !fecfOK(d.buf[4:d.frameLen]) {
			if inner := bytes.Index(d.buf[1:d.frameLen], asmBytes); inner >= 0 {
				pipeline.Inc("link.truncated_frames", 1)
				d.buf = d.buf[1+inner:]
				continue
			}
		}
		frame := make([]byte, d.frameLen)
		copy(frame, d.buf[:d.frameLen])
		frames = append(frames, frame)
		d.buf = d.buf[d.frameLen:]
	}
}

// fecfOK checks a TM frame's CRC-16 frame error control field (frame without ASM).
func fecfOK(f []byte) bool {
	if len(f) < 3 {
		return false
	}
	return ccsds.ComputeCRC16CCITT(f[:len(f)-2]) == binary.BigEndian.Uint16(f[len(f)-2:])
}
