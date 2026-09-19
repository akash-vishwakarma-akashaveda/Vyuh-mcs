package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Client interface abstracts Redis operations used across VYUH-MCS
type Client interface {
	Get(ctx context.Context, db int, key string) (string, error)
	Set(ctx context.Context, db int, key string, value any, expiration time.Duration) error
	HSet(ctx context.Context, db int, key string, values ...any) error
	HGet(ctx context.Context, db int, key string, field string) (string, error)
	HGetAll(ctx context.Context, db int, key string) (map[string]string, error)
	ZAdd(ctx context.Context, db int, key string, score float64, member string) error
	Publish(ctx context.Context, channel string, message any) error
	// SubscribeCtx returns a channel of raw message payloads for channel,
	// closed when ctx is done. Used by Realtime Gateway to fan out Live
	// Telemetry's CVT deltas (architecture v2.2 §21.3).
	SubscribeCtx(ctx context.Context, channel string) (<-chan string, error)
	Close() error
}

// RedisClient wraps standard go-redis client pool per DB
type RedisClient struct {
	addr    string
	clients map[int]*redis.Client
	mu      sync.RWMutex
}

func NewRedisClient(addr string) *RedisClient {
	return &RedisClient{
		addr:    addr,
		clients: make(map[int]*redis.Client),
	}
}

func (r *RedisClient) getDB(db int) *redis.Client {
	r.mu.RLock()
	c, ok := r.clients[db]
	r.mu.RUnlock()
	if ok {
		return c
	}

	r.mu.Lock()
	defer r.mu.Unlock()
	if c, ok := r.clients[db]; ok {
		return c
	}

	c = redis.NewClient(&redis.Options{
		Addr: r.addr,
		DB:   db,
	})
	r.clients[db] = c
	return c
}

func (r *RedisClient) Get(ctx context.Context, db int, key string) (string, error) {
	return r.getDB(db).Get(ctx, key).Result()
}

func (r *RedisClient) Set(ctx context.Context, db int, key string, value any, expiration time.Duration) error {
	return r.getDB(db).Set(ctx, key, value, expiration).Err()
}

func (r *RedisClient) HSet(ctx context.Context, db int, key string, values ...any) error {
	return r.getDB(db).HSet(ctx, key, values...).Err()
}

func (r *RedisClient) HGet(ctx context.Context, db int, key string, field string) (string, error) {
	return r.getDB(db).HGet(ctx, key, field).Result()
}

func (r *RedisClient) HGetAll(ctx context.Context, db int, key string) (map[string]string, error) {
	return r.getDB(db).HGetAll(ctx, key).Result()
}

func (r *RedisClient) ZAdd(ctx context.Context, db int, key string, score float64, member string) error {
	return r.getDB(db).ZAdd(ctx, key, redis.Z{Score: score, Member: member}).Err()
}

func (r *RedisClient) Publish(ctx context.Context, channel string, message any) error {
	return r.getDB(0).Publish(ctx, channel, message).Err()
}

func (r *RedisClient) SubscribeCtx(ctx context.Context, channel string) (<-chan string, error) {
	sub := r.getDB(0).Subscribe(ctx, channel)
	out := make(chan string, 100)
	go func() {
		defer close(out)
		defer sub.Close()
		ch := sub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				select {
				case out <- msg.Payload:
				default:
				}
			}
		}
	}()
	return out, nil
}

func (r *RedisClient) Close() error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, c := range r.clients {
		_ = c.Close()
	}
	return nil
}

// MemoryClient provides an in-memory thread-safe implementation for tests & zero-dependency dev
type MemoryClient struct {
	mu     sync.RWMutex
	kv     map[string]string            // "db:key" -> val
	hash   map[string]map[string]string // "db:key" -> field -> val
	pubsub map[string][]chan string
}

func NewMemoryClient() *MemoryClient {
	return &MemoryClient{
		kv:     make(map[string]string),
		hash:   make(map[string]map[string]string),
		pubsub: make(map[string][]chan string),
	}
}

func (m *MemoryClient) Get(ctx context.Context, db int, key string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	k := fmt.Sprintf("%d:%s", db, key)
	val, ok := m.kv[k]
	if !ok {
		return "", redis.Nil
	}
	return val, nil
}

func (m *MemoryClient) Set(ctx context.Context, db int, key string, value any, expiration time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := fmt.Sprintf("%d:%s", db, key)
	var str string
	switch v := value.(type) {
	case string:
		str = v
	case []byte:
		str = string(v)
	default:
		b, _ := json.Marshal(v)
		str = string(b)
	}
	m.kv[k] = str
	return nil
}

func (m *MemoryClient) HSet(ctx context.Context, db int, key string, values ...any) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	k := fmt.Sprintf("%d:%s", db, key)
	if _, ok := m.hash[k]; !ok {
		m.hash[k] = make(map[string]string)
	}
	for i := 0; i < len(values); i += 2 {
		field := fmt.Sprintf("%v", values[i])
		val := fmt.Sprintf("%v", values[i+1])
		m.hash[k][field] = val
	}
	return nil
}

func (m *MemoryClient) HGet(ctx context.Context, db int, key string, field string) (string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	k := fmt.Sprintf("%d:%s", db, key)
	if h, ok := m.hash[k]; ok {
		if val, vok := h[field]; vok {
			return val, nil
		}
	}
	return "", redis.Nil
}

func (m *MemoryClient) HGetAll(ctx context.Context, db int, key string) (map[string]string, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	k := fmt.Sprintf("%d:%s", db, key)
	out := make(map[string]string)
	if h, ok := m.hash[k]; ok {
		for f, v := range h {
			out[f] = v
		}
	}
	return out, nil
}

func (m *MemoryClient) ZAdd(ctx context.Context, db int, key string, score float64, member string) error {
	// For memory client, store in hash map
	return m.HSet(ctx, db, key, member, fmt.Sprintf("%f", score))
}

func (m *MemoryClient) Publish(ctx context.Context, channel string, message any) error {
	m.mu.RLock()
	defer m.mu.RUnlock()
	b, _ := json.Marshal(message)
	msgStr := string(b)
	for _, ch := range m.pubsub[channel] {
		select {
		case ch <- msgStr:
		default:
		}
	}
	return nil
}

func (m *MemoryClient) Subscribe(channel string) chan string {
	m.mu.Lock()
	defer m.mu.Unlock()
	ch := make(chan string, 100)
	m.pubsub[channel] = append(m.pubsub[channel], ch)
	return ch
}

func (m *MemoryClient) SubscribeCtx(ctx context.Context, channel string) (<-chan string, error) {
	ch := m.Subscribe(channel)
	out := make(chan string, 100)
	go func() {
		defer close(out)
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				select {
				case out <- msg:
				default:
				}
			}
		}
	}()
	return out, nil
}

func (m *MemoryClient) Close() error {
	return nil
}
