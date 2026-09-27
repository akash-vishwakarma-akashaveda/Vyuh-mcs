package demo

import (
	"context"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/akashaveda/vyuh-mcs/internal/pipeline"
	"github.com/akashaveda/vyuh-mcs/internal/simulator"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// opssatData finds the downloaded OPS-SAT-AD dataset; the test is skipped
// without it (the file is not committed).
func opssatData(t *testing.T) string {
	t.Helper()
	p, _ := filepath.Abs("../../data/opensat/segments.csv")
	if _, err := os.Stat(p); err != nil {
		t.Skip("OPS-SAT-AD dataset not downloaded (data/opensat/segments.csv)")
	}
	return p
}

// Real ESA flight telemetry, end to end: OPS-SAT samples are packetised, framed
// by the on-board frame generator, sent over TCP to the Link Gateway, decoded
// with the OPS-SAT dictionary and arrive at a browser client as live values.
func TestOPSSATReplay_FlightDataReachesBrowser(t *testing.T) {
	data := opssatData(t)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	pipeline.Reset()

	st, err := Start(ctx, Options{TCPAddr: freeAddr(t), Sim: simulator.DefaultConfig(), ReplayData: data})
	require.NoError(t, err)
	rp := st.Sim.Replay()
	require.NotNil(t, rp)

	srv := httptestServer(t, st, ctx)
	c := dial(t, srv)
	c.until(2*time.Second, isType("HELLO"))
	c.send(map[string]any{"type": "SUBSCRIBE", "sub_id": "o", "kind": "PARAMS", "satellite": "OPSSAT-1"})

	speed := 200.0
	require.NoError(t, rp.Control(ctx, simulator.ReplayControl{Action: "start", Speed: &speed}))

	delta := c.until(20*time.Second, func(m map[string]any) bool {
		if m["type"] != "DELTA" {
			return false
		}
		_, ok := paramValue(m, "MAG_X")
		return ok
	})
	v, _ := paramValue(delta, "MAG_X")
	assert.Equal(t, "uT", v["unit"])
	eu := v["eu_value"].(float64)
	assert.True(t, eu > -110 && eu < 110, "magnetometer in µT, got %v", eu)

	time.Sleep(2 * time.Second)
	s := pipeline.Take().Stages
	t.Logf("replay %v frame %v packet %v tm %v", s["replay"], s["frame"], s["packet"], s["tm"])
	assert.Greater(t, s["replay"]["samples"], int64(40))
	assert.Greater(t, s["tm"]["packets_decoded"], int64(40))
	assert.Zero(t, s["frame"]["crc_error"], "clean link: no CRC errors")
	assert.Zero(t, s["packet"]["seq_gap"], "clean link: no packet sequence gaps")
	assert.Zero(t, s["tm"]["decom_error"])
}

func httptestServer(t *testing.T, st *Stack, ctx context.Context) string {
	t.Helper()
	srv := httptest.NewServer(st.RTG.Handler(ctx))
	t.Cleanup(srv.Close)
	return srv.URL
}
