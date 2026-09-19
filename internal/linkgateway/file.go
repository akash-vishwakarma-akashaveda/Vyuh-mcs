package linkgateway

import (
	"context"
	"encoding/binary"
	"io"
	"os"
	"time"
)

// FileAdapter replays frames from a local file, each stored as a 4-byte
// big-endian length prefix followed by the frame bytes. With Follow set it
// polls for appended frames (a station recording being written concurrently,
// or backfill/playback replay), matching Q-06's backfill-from-recording path.
type FileAdapter struct {
	Path         string
	Follow       bool
	PollInterval time.Duration
}

func (a *FileAdapter) Name() string { return "file:" + a.Path }

func (a *FileAdapter) Start(ctx context.Context, out chan<- RawUnit) error {
	f, err := os.Open(a.Path)
	if err != nil {
		return err
	}
	defer f.Close()

	poll := a.PollInterval
	if poll <= 0 {
		poll = 500 * time.Millisecond
	}

	for {
		for {
			var lenBuf [4]byte
			if _, err := io.ReadFull(f, lenBuf[:]); err != nil {
				break // EOF or short read: wait for more data (Follow) or stop
			}
			n := binary.BigEndian.Uint32(lenBuf[:])
			frame := make([]byte, n)
			if _, err := io.ReadFull(f, frame); err != nil {
				break
			}
			out <- RawUnit{SourceAdapter: a.Name(), ReceivedAtNs: nowNs(), Payload: frame}
		}

		if !a.Follow {
			return nil
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(poll):
		}
	}
}
