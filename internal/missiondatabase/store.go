// Package missiondatabase implements Mission Database (architecture v2.2
// §18.1, FR-MDB-*): import, validate, compile and release spacecraft
// dictionaries as versioned bundles, so every telemetry sample and command
// can record exactly which dictionary version produced it.
//
// Two substitutions from the spec (see the backend plan's flagged
// substitutions): bundles are versioned JSON, not FlatBuffers (no
// FlatBuffers/buf toolchain available here), signed with a SHA-256 checksum
// instead of cosign; and "import" accepts a JSON payload shaped like
// pkg/xtce.ParameterSet directly rather than parsing real XTCE XML — no XTCE
// XML importer exists anywhere in this codebase yet (pkg/xtce only holds the
// compiled runtime decoder), and writing one is separate, larger work.
// A satellite's dictionary is one ParameterSet per subsystem APID.
package missiondatabase

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"github.com/akashaveda/vyuh-mcs/pkg/xtce"
)

type Status string

const (
	StatusDraft      Status = "DRAFT"
	StatusVerified   Status = "VERIFIED"
	StatusReleased   Status = "RELEASED"
	StatusRolledBack Status = "ROLLED_BACK"
)

// Bundle is one compiled, versioned dictionary release for one satellite.
type Bundle struct {
	SCID          uint16               `json:"scid"`
	Version       int                  `json:"version"`
	Status        Status               `json:"status"`
	ParameterSets []*xtce.ParameterSet `json:"parameter_sets"` // one per subsystem APID
	Checksum      string               `json:"checksum"`       // SHA-256 of the compiled parameter sets
	CreatedAt     time.Time            `json:"created_at"`
	EffectiveAtNs int64                `json:"effective_at_ns,omitempty"`
}

// Store holds every dictionary version per satellite, in memory and mirrored
// to disk under dataDir (the file-backed substitute for object storage).
type Store struct {
	mu      sync.RWMutex
	dataDir string
	bundles map[uint16][]*Bundle // sorted by Version ascending
}

func NewStore(dataDir string) *Store {
	if dataDir != "" {
		_ = os.MkdirAll(dataDir, 0o755)
	}
	return &Store{dataDir: dataDir, bundles: make(map[uint16][]*Bundle)}
}

// Import validates and compiles a new DRAFT version for scid (FR-MDB-01/02:
// import + validate).
func (s *Store) Import(scid uint16, sets []*xtce.ParameterSet) (*Bundle, error) {
	if err := validate(sets); err != nil {
		return nil, err
	}
	for _, ps := range sets {
		ps.SCID = scid
		for _, p := range ps.Parameters {
			p.SCID = scid
			if err := p.Compile(); err != nil {
				return nil, fmt.Errorf("compile parameter %s: %w", p.Name, err)
			}
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	version := len(s.bundles[scid]) + 1
	b := &Bundle{
		SCID:          scid,
		Version:       version,
		Status:        StatusDraft,
		ParameterSets: sets,
		Checksum:      checksum(sets),
		CreatedAt:     time.Now().UTC(),
	}
	s.bundles[scid] = append(s.bundles[scid], b)
	s.persist(b)
	return b, nil
}

// validate checks every parameter set: no duplicate parameter names across
// the dictionary and no overlapping bit ranges inside one APID — a compiled
// bundle with overlapping parameters would silently corrupt decommutation.
func validate(sets []*xtce.ParameterSet) error {
	if len(sets) == 0 {
		return fmt.Errorf("mission database: dictionary has no parameter sets")
	}
	names := make(map[string]bool)
	apids := make(map[uint16]bool)
	for _, ps := range sets {
		if len(ps.Parameters) == 0 {
			return fmt.Errorf("mission database: APID %d has no parameters", ps.APID)
		}
		if apids[ps.APID] {
			return fmt.Errorf("mission database: duplicate APID %d", ps.APID)
		}
		apids[ps.APID] = true

		type span struct{ lo, hi int }
		var spans []span
		for _, p := range ps.Parameters {
			if names[p.Name] {
				return fmt.Errorf("mission database: duplicate parameter name %q", p.Name)
			}
			names[p.Name] = true
			spans = append(spans, span{lo: p.BitOffset, hi: p.BitOffset + p.BitLength})
		}
		sort.Slice(spans, func(i, j int) bool { return spans[i].lo < spans[j].lo })
		for i := 1; i < len(spans); i++ {
			if spans[i].lo < spans[i-1].hi {
				return fmt.Errorf("mission database: bit-layout overlap at offset %d in APID %d", spans[i].lo, ps.APID)
			}
		}
	}
	return nil
}

func checksum(sets []*xtce.ParameterSet) string {
	b, _ := json.Marshal(sets)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// Release marks a DRAFT (or VERIFIED) bundle RELEASED with an effective time
// (FR-MDB-05). Two-reviewer approval (§18.1) is out of scope for Phase 1 —
// flagged, not simulated.
func (s *Store) Release(scid uint16, version int, effectiveAtNs int64) (*Bundle, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	b := s.find(scid, version)
	if b == nil {
		return nil, fmt.Errorf("mission database: no version %d for satellite %d", version, scid)
	}
	b.Status = StatusReleased
	b.EffectiveAtNs = effectiveAtNs
	s.persist(b)
	return b, nil
}

// Active returns the highest-version RELEASED bundle for scid whose
// effective time has passed, or nil if none has been released yet.
func (s *Store) Active(scid uint16, asOfNs int64) *Bundle {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var active *Bundle
	for _, b := range s.bundles[scid] {
		if b.Status == StatusReleased && b.EffectiveAtNs <= asOfNs {
			if active == nil || b.Version > active.Version {
				active = b
			}
		}
	}
	return active
}

// Versions returns every version of scid's dictionary, oldest first.
func (s *Store) Versions(scid uint16) []*Bundle {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return append([]*Bundle(nil), s.bundles[scid]...)
}

func (s *Store) Get(scid uint16, version int) *Bundle {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.find(scid, version)
}

func (s *Store) find(scid uint16, version int) *Bundle {
	for _, b := range s.bundles[scid] {
		if b.Version == version {
			return b
		}
	}
	return nil
}

func (s *Store) persist(b *Bundle) {
	if s.dataDir == "" {
		return
	}
	dir := filepath.Join(s.dataDir, fmt.Sprintf("%d", b.SCID))
	_ = os.MkdirAll(dir, 0o755)
	path := filepath.Join(dir, fmt.Sprintf("v%d.json", b.Version))
	data, err := json.MarshalIndent(b, "", "  ")
	if err != nil {
		return
	}
	_ = os.WriteFile(path, data, 0o644)
}
