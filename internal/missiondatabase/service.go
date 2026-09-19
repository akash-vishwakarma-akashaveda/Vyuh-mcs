package missiondatabase

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/kafka"
	"github.com/akashaveda/vyuh-mcs/pkg/xtce"
)

const TopicReleases = "mdb.releases.v1"

// ReleaseEvent is published on mdb.releases.v1 (compacted: latest release
// per satellite) so TM Processor and other consumers can hot-swap their
// dictionary (§18.1's "why compile instead of runtime lookups").
type ReleaseEvent struct {
	SCID          uint16 `json:"scid"`
	Version       int    `json:"version"`
	Checksum      string `json:"checksum"`
	EffectiveAtNs int64  `json:"effective_at_ns"`
}

type Service struct {
	store *Store
	bus   kafka.Producer
}

func NewService(store *Store, bus kafka.Producer) *Service {
	return &Service{store: store, bus: bus}
}

func (s *Service) Routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /v1/dictionaries/{scid}/import", s.handleImport)
	mux.HandleFunc("POST /v1/dictionaries/{scid}/{version}/release", s.handleRelease)
	mux.HandleFunc("GET /v1/dictionaries/{scid}", s.handleList)
	mux.HandleFunc("GET /v1/dictionaries/{scid}/active", s.handleActive)
	mux.HandleFunc("GET /v1/dictionaries/{scid}/{version}", s.handleGet)
	return mux
}

func (s *Service) handleImport(w http.ResponseWriter, r *http.Request) {
	scid, err := pathUint16(r, "scid")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	raw, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, `{"error":"unreadable body"}`, http.StatusBadRequest)
		return
	}
	// Accept one ParameterSet object or an array of them (a full dictionary).
	var sets []*xtce.ParameterSet
	if trimmed := bytes.TrimSpace(raw); len(trimmed) > 0 && trimmed[0] == '[' {
		err = json.Unmarshal(trimmed, &sets)
	} else {
		var one xtce.ParameterSet
		if err = json.Unmarshal(trimmed, &one); err == nil {
			sets = []*xtce.ParameterSet{&one}
		}
	}
	if err != nil {
		http.Error(w, `{"error":"invalid parameter set json"}`, http.StatusBadRequest)
		return
	}

	b, err := s.store.Import(scid, sets)
	if err != nil {
		http.Error(w, jsonErr(err), http.StatusUnprocessableEntity)
		return
	}

	writeJSON(w, http.StatusCreated, b)
}

func (s *Service) handleRelease(w http.ResponseWriter, r *http.Request) {
	scid, err := pathUint16(r, "scid")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	version, err := strconv.Atoi(r.PathValue("version"))
	if err != nil {
		http.Error(w, `{"error":"invalid version"}`, http.StatusBadRequest)
		return
	}

	var body struct {
		EffectiveAtNs int64 `json:"effective_at_ns"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)

	b, err := s.store.Release(scid, version, body.EffectiveAtNs)
	if err != nil {
		http.Error(w, jsonErr(err), http.StatusNotFound)
		return
	}

	_ = kafka.ProduceJSON(context.Background(), s.bus, TopicReleases, []byte{byte(scid >> 8), byte(scid)}, ReleaseEvent{
		SCID: b.SCID, Version: b.Version, Checksum: b.Checksum, EffectiveAtNs: b.EffectiveAtNs,
	}, nil)

	writeJSON(w, http.StatusOK, b)
}

func (s *Service) handleList(w http.ResponseWriter, r *http.Request) {
	scid, err := pathUint16(r, "scid")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	type row struct {
		Version       int    `json:"version"`
		Status        Status `json:"status"`
		Checksum      string `json:"checksum"`
		EffectiveAtNs int64  `json:"effective_at_ns,omitempty"`
	}
	rows := []row{}
	for _, b := range s.store.Versions(scid) {
		rows = append(rows, row{b.Version, b.Status, b.Checksum, b.EffectiveAtNs})
	}
	writeJSON(w, http.StatusOK, rows)
}

func (s *Service) handleActive(w http.ResponseWriter, r *http.Request) {
	scid, err := pathUint16(r, "scid")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	b := s.store.Active(scid, time.Now().UnixNano())
	if b == nil {
		http.Error(w, `{"error":"no active release"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func (s *Service) handleGet(w http.ResponseWriter, r *http.Request) {
	scid, err := pathUint16(r, "scid")
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	version, err := strconv.Atoi(r.PathValue("version"))
	if err != nil {
		http.Error(w, `{"error":"invalid version"}`, http.StatusBadRequest)
		return
	}
	b := s.store.Get(scid, version)
	if b == nil {
		http.Error(w, `{"error":"not found"}`, http.StatusNotFound)
		return
	}
	writeJSON(w, http.StatusOK, b)
}

func pathUint16(r *http.Request, name string) (uint16, error) {
	v, err := strconv.Atoi(r.PathValue(name))
	if err != nil || v < 0 || v > 0xFFFF {
		return 0, strErr(`{"error":"invalid ` + name + `"}`)
	}
	return uint16(v), nil
}

type strErr string

func (e strErr) Error() string { return string(e) }

func jsonErr(err error) string {
	msg := strings.ReplaceAll(err.Error(), `"`, `'`)
	return `{"error":"` + msg + `"}`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
