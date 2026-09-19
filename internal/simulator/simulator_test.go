package simulator

import (
	"bytes"
	"context"
	"encoding/binary"
	"sync"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/config"
	"github.com/akashaveda/vyuh-mcs/internal/ccsds"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func stepAll(s *Simulator, from time.Time, seconds int) time.Time {
	t := from
	for i := 0; i < seconds; i++ {
		t = t.Add(time.Second)
		for _, st := range s.sats {
			st.step(s.cfg.Model, t, 1.0)
		}
	}
	return t
}

// The frame must decode with the very dictionary the ground segment uses:
// that symmetry is what makes the demo telemetry path honest.
func TestBuildFrame_DecodesWithPlatformDictionary(t *testing.T) {
	now := time.Now().UTC()
	cfg := DefaultConfig()
	cfg.Now = func() time.Time { return now }
	sim := NewSimulator(cfg)
	stepAll(sim, now, 1)

	frame, err := sim.BuildFrame("AKV-03", 0) // POWER
	require.NoError(t, err)
	assert.Len(t, frame, cfg.FrameLength)

	tf, err := ccsds.ParseTMFrame(frame, true, true)
	require.NoError(t, err)
	assert.Equal(t, uint16(3), tf.SpacecraftID)

	pkt, err := ccsds.ParseSpacePacket(tf.DataField)
	require.NoError(t, err)
	assert.Equal(t, uint16(100), pkt.APID)

	dict, err := config.PlatformDictionary()
	require.NoError(t, err)
	ps := config.ForSCID(dict, 3)[0]

	// On-board time header decodes to (approximately) now.
	var ticks uint64
	for _, b := range pkt.Data[:ps.TimeHeaderBytes] {
		ticks = ticks<<8 | uint64(b)
	}
	epoch, _ := time.Parse(time.RFC3339, ps.TimeEpoch)
	obt := epoch.Add(time.Duration(float64(ticks) / ps.TimeTicksPerSec * float64(time.Second)))
	assert.WithinDuration(t, now, obt, 100*time.Millisecond)

	params, err := ps.Decommutate(pkt.Data, now, pkt.SeqCount)
	require.NoError(t, err)
	got := map[string]float64{}
	for _, p := range params {
		got[p.ParamName] = p.EUValue
	}
	assert.InDelta(t, 29.36, got["BUS_VOLTAGE"], 1.5)
	assert.InDelta(t, 18.5, got["BAT_TEMP"], 2.0)
	assert.Len(t, got, 10, "all POWER parameters present")
}

func TestEveryFrameIsFixedLength(t *testing.T) {
	sim := NewSimulator(DefaultConfig())
	stepAll(sim, time.Now(), 1)
	for _, sat := range sim.cfg.Satellites {
		for k := 0; k < 6; k++ {
			frame, err := sim.BuildFrame(sat.SatID, k)
			require.NoError(t, err)
			assert.Len(t, frame, sim.cfg.FrameLength, "%s subsystem %d", sat.SatID, k)
		}
	}
}

// Demo story: heater A fails, the battery cools through warning into
// critical; commanding heater B recovers it.
func TestHeaterAFailAndRecovery(t *testing.T) {
	sim := NewSimulator(DefaultConfig())
	now := time.Now()
	now = stepAll(sim, now, 3)

	require.NoError(t, sim.Apply("AKV-03", FaultHeaterAFail))
	now = stepAll(sim, now, 60)

	temp, _ := sim.Value("AKV-03", "BAT_TEMP")
	duty, _ := sim.Value("AKV-03", "HTR_A_DUTY")
	assert.Less(t, temp, 4.0, "battery should be below the critical low limit")
	assert.Less(t, duty, 1.0, "failed heater draws no duty")
	assert.Equal(t, map[string]string{"AKV-03": FaultHeaterAFail}, sim.ActiveFaults())

	other, _ := sim.Value("AKV-04", "BAT_TEMP")
	assert.Greater(t, other, 15.0, "other satellites are unaffected")

	require.NoError(t, sim.Apply("AKV-03", "HTR_B_ON"))
	stepAll(sim, now, 60)
	temp, _ = sim.Value("AKV-03", "BAT_TEMP")
	state, _ := sim.Value("AKV-03", "HTR_B_STATE")
	assert.Greater(t, temp, 15.0)
	assert.Equal(t, 1.0, state)

	assert.Error(t, sim.Apply("NOPE-99", FaultHeaterAFail))
}

func TestFARM1_ReportedInCLCW(t *testing.T) {
	sim := NewSimulator(DefaultConfig())
	stepAll(sim, time.Now(), 1)

	readVR := func() uint8 {
		frame, err := sim.BuildFrame("AKV-03", 0)
		require.NoError(t, err)
		tf, err := ccsds.ParseTMFrame(frame, true, true)
		require.NoError(t, err)
		require.NotNil(t, tf.OCF)
		b := make([]byte, 4)
		binary.BigEndian.PutUint32(b, *tf.OCF)
		clcw, err := ccsds.ParseCLCW(b)
		require.NoError(t, err)
		return clcw.ReportValue
	}

	assert.Equal(t, uint8(0), readVR())
	sim.AcceptTCFrame(3, 0) // in sequence: V(R) advances
	assert.Equal(t, uint8(1), readVR())
	sim.AcceptTCFrame(3, 5) // out of sequence: V(R) holds
	assert.Equal(t, uint8(1), readVR())
}

type lockedBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.buf.Write(p)
}

func (l *lockedBuffer) Len() int {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.buf.Len()
}

func TestRunStream_EmitsFramesForEverySatellite(t *testing.T) {
	cfg := DefaultConfig()
	cfg.Cycle = 60 * time.Millisecond
	sim := NewSimulator(cfg)

	ctx, cancel := context.WithTimeout(context.Background(), 400*time.Millisecond)
	defer cancel()
	var out lockedBuffer
	_ = sim.RunStream(ctx, &out)

	// 12 satellites x 6 packets per cycle, several cycles.
	assert.Greater(t, out.Len(), 12*6*cfg.FrameLength)
	assert.Zero(t, out.Len()%cfg.FrameLength, "stream is a whole number of fixed-length frames")
}
