package linkgateway

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"time"
)

// AWSGSAdapter polls an AWS Ground Station Data/IP-style delivery endpoint:
// a manifest of chunks delivered for a contact, each fetched over HTTP (the
// shape AWS GS's S3/Data-delivery capability uses). No AWS credentials are
// reachable from this environment, so this is exercised against a mock
// manifest server in tests — the polling and chunk-fetch protocol is real,
// only the endpoint is substituted (FR-LGW-01).
type AWSGSAdapter struct {
	ManifestURL  string // returns []ChunkRef as JSON
	PollInterval time.Duration
	Client       *http.Client
}

type ChunkRef struct {
	ChunkID string `json:"chunk_id"`
	URL     string `json:"url"`
}

func (a *AWSGSAdapter) Name() string { return "awsgs:" + a.ManifestURL }

func (a *AWSGSAdapter) Start(ctx context.Context, out chan<- RawUnit) error {
	client := a.Client
	if client == nil {
		client = http.DefaultClient
	}
	poll := a.PollInterval
	if poll <= 0 {
		poll = 2 * time.Second
	}

	seen := make(map[string]bool)
	name := a.Name()

	for {
		select {
		case <-ctx.Done():
			return nil
		default:
		}

		chunks, err := a.fetchManifest(ctx, client)
		if err == nil {
			for _, c := range chunks {
				if seen[c.ChunkID] {
					continue
				}
				seen[c.ChunkID] = true
				if payload, err := a.fetchChunk(ctx, client, c.URL); err == nil {
					out <- RawUnit{SourceAdapter: name, ReceivedAtNs: nowNs(), Payload: payload}
				}
			}
		}

		select {
		case <-ctx.Done():
			return nil
		case <-time.After(poll):
		}
	}
}

func (a *AWSGSAdapter) fetchManifest(ctx context.Context, client *http.Client) ([]ChunkRef, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, a.ManifestURL, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var chunks []ChunkRef
	if err := json.NewDecoder(resp.Body).Decode(&chunks); err != nil {
		return nil, err
	}
	return chunks, nil
}

func (a *AWSGSAdapter) fetchChunk(ctx context.Context, client *http.Client, url string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	return io.ReadAll(resp.Body)
}
