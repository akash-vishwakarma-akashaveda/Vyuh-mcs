package tmprocessor

import (
	"sync"
	"time"
)

// CorrelationEntry maps a satellite's on-board clock (CUC-style raw ticks)
// to TAI (FR-TMP-02: "OBT (CUC/CDS) -> TAI/UTC using the satellite's
// time-correlation table; flag samples when correlation is stale").
type CorrelationEntry struct {
	EpochTAI    time.Time
	TicksPerSec float64
	SetAt       time.Time
}

// TimeCorrelator holds one correlation entry per satellite. A real ground
// system periodically updates this from spacecraft time-correlation packets;
// Phase 1 here accepts a table set directly (e.g. from Mission Database's
// dictionary defaults) and flags a sample as stale-correlated once its entry
// is older than StaleAfter.
type TimeCorrelator struct {
	mu         sync.RWMutex
	table      map[uint16]CorrelationEntry
	StaleAfter time.Duration
}

func NewTimeCorrelator() *TimeCorrelator {
	return &TimeCorrelator{table: make(map[uint16]CorrelationEntry), StaleAfter: 24 * time.Hour}
}

func (t *TimeCorrelator) Set(scid uint16, epoch time.Time, ticksPerSec float64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	t.table[scid] = CorrelationEntry{EpochTAI: epoch, TicksPerSec: ticksPerSec, SetAt: time.Now()}
}

// Correlate converts obtRaw ticks to a TAI time for scid. When obtRaw is 0
// (no real OBT was extracted from the packet — see this package's doc
// comment) or no correlation entry exists yet, it falls back to the ground
// receive time and reports stale=true so downstream consumers know the
// timestamp is receive-time, not spacecraft time.
func (t *TimeCorrelator) Correlate(scid uint16, obtRaw uint64, receiveTime time.Time) (tai time.Time, stale bool) {
	if obtRaw == 0 {
		return receiveTime, true
	}

	t.mu.RLock()
	entry, ok := t.table[scid]
	t.mu.RUnlock()
	if !ok || entry.TicksPerSec <= 0 {
		return receiveTime, true
	}

	offset := time.Duration(float64(obtRaw) / entry.TicksPerSec * float64(time.Second))
	stale = time.Since(entry.SetAt) > t.StaleAfter
	return entry.EpochTAI.Add(offset), stale
}
