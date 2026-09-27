package linkgateway

import (
	"fmt"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
)

// Archive is the station recording: every frame the antenna received with a
// valid check sequence, kept for a while so Gap Replay can re-deliver frames
// the ground lost after the antenna (spool overflow, a downstream outage).
// A frame the antenna never received cleanly is not here — and Gap Replay
// then reports the gap as unrecoverable rather than inventing data.
type Archive struct {
	mu    sync.Mutex
	byKey map[string]archived
	order []string
	cap   int
}

type archived struct {
	frame []byte
	at    time.Time
}

func NewArchive(capacity int) *Archive {
	if capacity <= 0 {
		capacity = 65536
	}
	return &Archive{byKey: map[string]archived{}, cap: capacity}
}

func archiveKey(scid uint16, vcid, fc uint8) string { return fmt.Sprintf("%d:%d:%d", scid, vcid, fc) }

// Put records a frame (with ASM) if it is a valid TM frame.
func (a *Archive) Put(frame []byte, at time.Time) {
	tf, err := ccsds.ParseTMFrame(frame, true, true)
	if err != nil {
		return
	}
	k := archiveKey(tf.SpacecraftID, tf.VirtualChannelID, tf.VirtualChannelFC)
	a.mu.Lock()
	defer a.mu.Unlock()
	if _, ok := a.byKey[k]; !ok {
		a.order = append(a.order, k)
	}
	a.byKey[k] = archived{frame: append([]byte(nil), frame...), at: at}
	for len(a.order) > a.cap {
		delete(a.byKey, a.order[0])
		a.order = a.order[1:]
	}
	pipeline.Inc("archive.frames", 1)
}

// Lookup returns the recorded frame with this frame count received after
// `after` (the last good frame before the gap) and before `before` — the frame
// counter wraps every 256 frames, so a recording with the same count from
// another wrap is a different frame.
func (a *Archive) Lookup(scid uint16, vcid, fc uint8, after, before time.Time) ([]byte, bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	r, ok := a.byKey[archiveKey(scid, vcid, fc)]
	if !ok || !r.at.After(after) || r.at.After(before.Add(time.Second)) {
		return nil, false
	}
	return r.frame, true
}
