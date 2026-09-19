package linkgateway

import (
	"bytes"
	"encoding/binary"

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
			d.buf = d.buf[idx:] // drop bytes before the marker (resync)
		}
		if len(d.buf) < d.frameLen {
			return frames // wait for the rest of this frame
		}
		frame := make([]byte, d.frameLen)
		copy(frame, d.buf[:d.frameLen])
		frames = append(frames, frame)
		d.buf = d.buf[d.frameLen:]
	}
}
