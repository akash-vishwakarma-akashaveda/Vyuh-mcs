// Package config holds the demo constellation definition shared by every
// backend service and the console: which satellite id (AKV-03) is which
// spacecraft id (SCID 3), and the compiled platform dictionary. Embedded so
// no service depends on a runtime file path.
package config

import (
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/akashaveda/vyuh-mcs/pkg/xtce"
)

//go:embed satellites.json
var satellitesJSON []byte

//go:embed dictionaries/platform.json
var platformDictionaryJSON []byte

//go:embed dictionaries/sim-model.json
var simModelJSON []byte

// SimParam is how the spacecraft simulator behaves for one parameter: a
// baseline it wanders around by up to ~8 drifts, or a monotonic counter.
type SimParam struct {
	Subsystem string  `json:"subsystem"`
	APID      uint16  `json:"apid"`
	Base      float64 `json:"base"`
	Drift     float64 `json:"drift"`
	Kind      string  `json:"kind"` // analog | state | counter
	Wrap      float64 `json:"wrap,omitempty"` // counters restart at Base on reaching this
}

// SimModel returns the simulator behaviour model keyed by parameter name.
func SimModel() (map[string]SimParam, error) {
	var m map[string]SimParam
	if err := json.Unmarshal(simModelJSON, &m); err != nil {
		return nil, fmt.Errorf("config: sim model: %w", err)
	}
	return m, nil
}

type Satellite struct {
	SatID  string `json:"sat_id"`
	SCID   uint16 `json:"scid"`
	Tenant string `json:"tenant"`
}

type Fleet struct {
	list   []Satellite
	bySCID map[uint16]Satellite
	bySat  map[string]Satellite
}

func NewFleet(list []Satellite) *Fleet {
	f := &Fleet{list: list, bySCID: map[uint16]Satellite{}, bySat: map[string]Satellite{}}
	for _, s := range list {
		f.bySCID[s.SCID] = s
		f.bySat[s.SatID] = s
	}
	return f
}

// DefaultFleet returns the embedded 12-satellite demo constellation.
func DefaultFleet() *Fleet {
	var list []Satellite
	if err := json.Unmarshal(satellitesJSON, &list); err != nil {
		panic(fmt.Sprintf("config: embedded satellites.json is invalid: %v", err))
	}
	return NewFleet(list)
}

func (f *Fleet) All() []Satellite { return f.list }

func (f *Fleet) BySCID(scid uint16) (Satellite, bool) {
	s, ok := f.bySCID[scid]
	return s, ok
}

func (f *Fleet) BySatID(id string) (Satellite, bool) {
	s, ok := f.bySat[id]
	return s, ok
}

// PlatformDictionary returns the telemetry dictionary shared by every
// satellite of the platform: one ParameterSet per subsystem APID. Callers
// stamp each set with the SCID they import it for.
func PlatformDictionary() ([]*xtce.ParameterSet, error) {
	var sets []*xtce.ParameterSet
	if err := json.Unmarshal(platformDictionaryJSON, &sets); err != nil {
		return nil, fmt.Errorf("config: platform dictionary: %w", err)
	}
	return sets, nil
}

// ForSCID returns a deep copy of the platform dictionary stamped for scid.
func ForSCID(sets []*xtce.ParameterSet, scid uint16) []*xtce.ParameterSet {
	b, _ := json.Marshal(sets)
	var out []*xtce.ParameterSet
	_ = json.Unmarshal(b, &out)
	for _, ps := range out {
		ps.SCID = scid
		for _, p := range ps.Parameters {
			p.SCID = scid
		}
	}
	return out
}
