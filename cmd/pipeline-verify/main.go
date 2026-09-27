// Command pipeline-verify runs the end-to-end verification of the ground
// segment against ESA OPS-SAT flight telemetry and writes a report.
//
//	go run ./cmd/pipeline-verify [-data data/opensat/segments.csv] [-out docs/verification] [-only D] [-slice 20000] [-full]
package main

import (
	"context"
	"flag"
	"fmt"
	"os"
	"os/signal"

	"github.com/akashaveda/vyuh-mcs/internal/verify"
)

func main() {
	data := flag.String("data", "data/opensat/segments.csv", "OPS-SAT-AD segments.csv")
	out := flag.String("out", "docs/verification", "report directory")
	only := flag.String("only", "", "run only scenarios whose id starts with this (D, U, M, D1…)")
	slice := flag.Int("slice", 20000, "samples per fault scenario")
	full := flag.Bool("full", false, "score the models on the whole dataset (303k samples)")
	flag.Parse()

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()
	r, err := verify.Run(ctx, verify.Options{DataPath: *data, Slice: *slice, FullModelRun: *full, Only: *only, Log: func(s string) { fmt.Println(s) }})
	if err != nil {
		fmt.Println("verification failed to run:", err)
		os.Exit(2)
	}
	path, err := r.Write(*out)
	if err != nil {
		fmt.Println("write report:", err)
		os.Exit(2)
	}
	fmt.Printf("\n%d pass · %d fail · %d gaps · %d measurements\nreport: %s\n", r.Summary[verify.Pass], r.Summary[verify.Fail], r.Summary[verify.Gap], r.Summary[verify.Info], path)
	if r.Summary[verify.Fail] > 0 {
		os.Exit(1)
	}
}
