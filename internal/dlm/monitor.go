package dlm

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
)

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
	return m.consumer.Subscribe("dead.letter", func(ctx context.Context, msg *kafka.Message) error {
		var entry DeadLetterEntry
		if err := json.Unmarshal(msg.Value, &entry); err != nil {
			entry.Detail = string(msg.Value)
		}
		entry.ReceivedTime = time.Now().UTC()
		return m.HandleDeadLetter(ctx, &entry)
	})
}

func (m *DeadLetterMonitor) HandleDeadLetter(ctx context.Context, entry *DeadLetterEntry) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.messages = append(m.messages, *entry)
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
	return len(m.messages)
}

func (m *DeadLetterMonitor) RecentRate() int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return len(m.rateWindow)
}
