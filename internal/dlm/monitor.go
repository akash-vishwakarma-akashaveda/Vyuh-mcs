package dlm

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
)

// keep is how many recent dead letters are held for inspection.
const keep = 1000

type DeadLetterEntry struct {
	Service      string    `json:"service"`
	ErrorType    string    `json:"error_type"`
	SCID         uint16    `json:"scid"`
	Reason       string    `json:"reason,omitempty"`
	Detail       string    `json:"detail,omitempty"`
	ReceivedTime time.Time `json:"received_time"`
}

type DeadLetterMonitor struct {
	consumer   kafka.Consumer
	messages   []DeadLetterEntry
	rateWindow []time.Time
	total      int
	lastAlert  time.Time
	mu         sync.Mutex
}

func NewDeadLetterMonitor(c kafka.Consumer) *DeadLetterMonitor {
	return &DeadLetterMonitor{
		consumer:   c,
		messages:   make([]DeadLetterEntry, 0),
		rateWindow: make([]time.Time, 0),
	}
}

func (m *DeadLetterMonitor) Start(ctx context.Context) error {
	if m.consumer == nil {
		return nil
	}
	handler := func(ctx context.Context, msg *kafka.Message) error {
		var entry DeadLetterEntry
		if err := json.Unmarshal(msg.Value, &entry); err != nil {
			entry.Detail = string(msg.Value)
		}
		if entry.ErrorType == "" {
			entry.ErrorType = "UNKNOWN"
		}
		entry.ReceivedTime = time.Now().UTC()
		return m.HandleDeadLetter(ctx, &entry)
	}
	if err := m.consumer.Subscribe("dead.letter", handler); err != nil {
		return err
	}
	// Frames the Frame Processor could not validate are dead letters too.
	return m.consumer.Subscribe("tm.ingest.quarantine.v1", handler)
}

func (m *DeadLetterMonitor) HandleDeadLetter(ctx context.Context, entry *DeadLetterEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.total++
	pipeline.Inc("deadletter.total", 1)
	pipeline.Inc("deadletter."+entry.ErrorType, 1)
	m.messages = append(m.messages, *entry)
	if len(m.messages) > keep {
		m.messages = m.messages[len(m.messages)-keep:]
	}
	now := time.Now()
	m.rateWindow = append(m.rateWindow, now)

	// Filter rate window for last 1 minute (FR-DLM-004)
	oneMinAgo := now.Add(-1 * time.Minute)
	validIdx := 0
	for i, t := range m.rateWindow {
		if t.After(oneMinAgo) {
			validIdx = i
			break
		}
	}
	m.rateWindow = m.rateWindow[validIdx:]

	// If rate > 10 msg/min, trigger alert (FR-DLM-004)
	if len(m.rateWindow) > 10 {
		fmt.Printf("[DLM ALERT] Dead letter rate exceeded 10 msgs/min (count=%d)\n", len(m.rateWindow))
	}

	return nil
}

func (m *DeadLetterMonitor) TotalCount() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.total
}

// Recent returns up to n of the most recent dead letters, newest first.
func (m *DeadLetterMonitor) Recent(n int) []DeadLetterEntry {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := make([]DeadLetterEntry, 0, n)
	for i := len(m.messages) - 1; i >= 0 && len(out) < n; i-- {
		out = append(out, m.messages[i])
	}
	return out
}

func (m *DeadLetterMonitor) RecentRate() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.rateWindow)
}
