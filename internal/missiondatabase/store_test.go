package missiondatabase

import (
	"testing"

	"github.com/akashaveda/vyuh-mcs/pkg/xtce"
)

func TestImportReleaseActive(t *testing.T) {
	s := NewStore(t.TempDir())

	ps := &xtce.ParameterSet{
		APID: 100,
		Parameters: []*xtce.Parameter{
			{Name: "BUS_VOLTAGE", DataType: "UINT", BitOffset: 0, BitLength: 16, CalibType: "NONE"},
			{Name: "BATT_TEMP", DataType: "UINT", BitOffset: 16, BitLength: 8, CalibType: "NONE"},
		},
	}

	b, err := s.Import(42, []*xtce.ParameterSet{ps})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	if b.Status != StatusDraft || b.Version != 1 {
		t.Fatalf("unexpected bundle after import: %+v", b)
	}

	if active := s.Active(42, 0); active != nil {
		t.Fatalf("a draft bundle must not be active, got %+v", active)
	}

	released, err := s.Release(42, 1, 0)
	if err != nil {
		t.Fatalf("release: %v", err)
	}
	if released.Status != StatusReleased {
		t.Fatalf("status after release = %s, want RELEASED", released.Status)
	}

	active := s.Active(42, 0)
	if active == nil || active.Version != 1 {
		t.Fatalf("active bundle = %+v, want version 1", active)
	}
}

func TestImportRejectsOverlappingBitLayout(t *testing.T) {
	s := NewStore("")
	ps := &xtce.ParameterSet{
		APID: 100,
		Parameters: []*xtce.Parameter{
			{Name: "A", DataType: "UINT", BitOffset: 0, BitLength: 16, CalibType: "NONE"},
			{Name: "B", DataType: "UINT", BitOffset: 8, BitLength: 8, CalibType: "NONE"}, // overlaps A
		},
	}
	if _, err := s.Import(42, []*xtce.ParameterSet{ps}); err == nil {
		t.Fatal("expected an overlap validation error, got nil")
	}
}
