package kafka

import (
	"context"
	"encoding/json"
	"sync"
)

// Message encapsulates an event sent through Kafka
type Message struct {
	Topic     string
	Key       []byte
	Value     []byte
	Headers   map[string]string
	Partition int
	Offset    int64
}

// Producer produces messages to Kafka topics
type Producer interface {
	Produce(ctx context.Context, topic string, key []byte, value []byte, headers map[string]string) error
	Close() error
}

// ConsumerHandler is invoked when a message arrives
type ConsumerHandler func(ctx context.Context, msg *Message) error

// Consumer consumes messages from Kafka topics
type Consumer interface {
	Subscribe(topic string, handler ConsumerHandler) error
	Start(ctx context.Context) error
	Close() error
}

type delivery struct {
	ctx context.Context
	msg *Message
}

// subscriber owns an unbounded FIFO queue drained by one worker goroutine, so
// each subscriber sees a topic's messages in production order (the guarantee a
// Kafka partition gives) without ever blocking the producer — a handler may
// itself produce to the topic it consumes from.
type subscriber struct {
	handler ConsumerHandler
	mu      sync.Mutex
	cond    *sync.Cond
	queue   []delivery
	closed  bool
}

func newSubscriber(h ConsumerHandler) *subscriber {
	s := &subscriber{handler: h}
	s.cond = sync.NewCond(&s.mu)
	go s.run()
	return s
}

func (s *subscriber) push(d delivery) {
	s.mu.Lock()
	if !s.closed {
		s.queue = append(s.queue, d)
		s.cond.Signal()
	}
	s.mu.Unlock()
}

func (s *subscriber) close() {
	s.mu.Lock()
	s.closed = true
	s.cond.Broadcast()
	s.mu.Unlock()
}

func (s *subscriber) run() {
	for {
		s.mu.Lock()
		for len(s.queue) == 0 && !s.closed {
			s.cond.Wait()
		}
		if s.closed {
			s.mu.Unlock()
			return
		}
		d := s.queue[0]
		s.queue[0] = delivery{}
		s.queue = s.queue[1:]
		s.mu.Unlock()

		_ = s.handler(d.ctx, d.msg)
	}
}

// MemoryBus implements an in-process, asynchronous topic bus for testing and local zero-dependency run
type MemoryBus struct {
	mu          sync.RWMutex
	subscribers map[string][]*subscriber
	closed      bool
}

func NewMemoryBus() *MemoryBus {
	return &MemoryBus{
		subscribers: make(map[string][]*subscriber),
	}
}

func (b *MemoryBus) Produce(ctx context.Context, topic string, key []byte, value []byte, headers map[string]string) error {
	b.mu.RLock()
	subs := b.subscribers[topic]
	b.mu.RUnlock()

	msg := &Message{
		Topic:   topic,
		Key:     key,
		Value:   value,
		Headers: headers,
	}

	for _, s := range subs {
		s.push(delivery{ctx: ctx, msg: msg})
	}

	return nil
}

func (b *MemoryBus) Subscribe(topic string, handler ConsumerHandler) error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.subscribers[topic] = append(b.subscribers[topic], newSubscriber(handler))
	return nil
}

func (b *MemoryBus) Start(ctx context.Context) error {
	<-ctx.Done()
	return nil
}

func (b *MemoryBus) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.closed = true
	for _, subs := range b.subscribers {
		for _, s := range subs {
			s.close()
		}
	}
	return nil
}

// ProduceJSON helper to serialize struct to JSON and produce
func ProduceJSON(ctx context.Context, p Producer, topic string, key []byte, obj any, headers map[string]string) error {
	bytes, err := json.Marshal(obj)
	if err != nil {
		return err
	}
	return p.Produce(ctx, topic, key, bytes, headers)
}
