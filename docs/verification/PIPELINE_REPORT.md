# VYUH-MCS pipeline verification report

Generated 2026-09-27T01:30:10Z · windows/amd64 · in-memory bus and Redis, single process (cmd/vyuh-mcs wiring)

Telemetry source: OPS-SAT-AD (ESA OPS-SAT, Zenodo 12588359, CC-BY-4.0). Real on-board ADCS measurements (3 magnetometer, 6 sun-sensor channels) with anomalies labelled by ESA engineers, packetised and framed as CCSDS 133.0 / 132.0 by the replay satellite OPSSAT-1 and sent through the real ground segment.

**Checks:** 152 pass · 0 fail · 1 capability gaps · 30 measurements

| ID | Scenario | Result | Samples | Delivered | Time |
|---|---|---|---|---|---|
| D01 | Clean link, as fast as possible | PASS | 20000 | 100.00 % | 2.2 s |
| D02 | Clean link at 1x (real time) | PASS | 300 | 100.00 % | 71.7 s |
| D03 | Clean link at 10x | PASS | 2000 | 100.00 % | 47.7 s |
| D04 | Clean link at 100x | PASS | 10000 | 100.00 % | 26.6 s |
| D10 | Bit errors (BER 1e-4) | PASS | 20000 | 80.49 % | 2.9 s |
| D11 | Random frame loss (2 %) | PASS | 20000 | 97.92 % | 2.2 s |
| D12 | Fades (burst loss) | PASS | 20000 | 89.95 % | 2.2 s |
| D13 | Duplicate frames (two stations) | PASS | 20000 | 100.00 % | 2.2 s |
| D14 | Out-of-order frames | PASS | 20000 | 100.00 % | 2.3 s |
| D15 | Garbage between frames (sync slip) | PASS | 20000 | 100.00 % | 2.3 s |
| D16 | Damaged sync marker | PASS | 20000 | 98.88 % | 2.2 s |
| D17 | Truncated frames (receiver dropout) | PASS | 20000 | 98.88 % | 2.3 s |
| D18 | Frames from an unknown spacecraft | PASS | 20000 | 97.92 % | 2.2 s |
| D20 | Spacecraft counter reset (reboot) | PASS | 2500 | 99.24 % | 29.1 s |
| D21 | On-board time jump | PASS | 2500 | 100.00 % | 29.1 s |
| D22 | Packets with an unknown APID | PASS | 2500 | 100.00 % | 29.1 s |
| D23 | Malformed packets | PASS | 2500 | 99.24 % | 29.1 s |
| D24 | Station outage (3 s stall) | PASS | 20000 | 100.00 % | 5.3 s |
| D30 | A bad pass: everything at once | PASS | 20000 | 96.10 % | 2.2 s |
| U01 | Routine command, console to spacecraft and back | PASS | 0 | — | 0.0 s |
| U09 | Command the spacecraft accepts but cannot perform | PASS | 0 | — | 0.0 s |
| U02 | Out-of-range command stopped before uplink | PASS | 0 | — | 0.0 s |
| U03 | Command to a spacecraft the ground does not fly | PASS | 0 | — | 0.0 s |
| U04 | Lost telecommand frame, no later traffic | PASS | 0 | — | 0.0 s |
| U05 | Lost telecommand frame, next command arrives | PASS | 0 | — | 0.0 s |
| U06 | Burst of 20 commands to one spacecraft | PASS | 0 | — | 0.0 s |
| U07 | Cancel a command just after submission | PASS | 0 | — | 0.0 s |
| U08 | Commands while the downlink is interrupted | PASS | 0 | — | 0.0 s |
| M01 | Limit alarms and anomaly model against ESA labels | GAP | 303493 | — | 9.3 s |

## D01 · Clean link, as fast as possible — PASS

Setup: 20000 samples, speed max, no faults

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| end-to-end | Every sample delivered | 20000 | 20000 | PASS | 100.00% delivered |
| link | Frames received = frames sent | 1307 | 1307 | PASS |  |
| frame | Frames valid = frames received | 1307 | 1307 | PASS |  |
| frame | No frame lost | 0 | 0 | PASS |  |
| packet | Packets forwarded = samples sent | 20000 | 20000 | PASS | space packets reassembled across frames |
| packet | No packet sequence gap | 0 | 0 | PASS |  |
| tm | Packets decoded = packets forwarded | 20000 | 20000 | PASS |  |
| tm | No decommutation error | 0 | 0 | PASS |  |
| tm | No uncertain timestamps | 0 | 0 | PASS | time correlation valid |
| cvt | CVT updated for every sample (or held back as older) | 20000 | 20000 | PASS |  |
| end-to-end | Throughput at full speed | — | 9035 samples/s, 590 frames/s | INFO | the link is paced by TCP backpressure from the ground |
| browser | Live DELTA frames received | >= 1 | 17 | PASS |  |
| browser | Last live value shown = last value the spacecraft sent (per parameter) | 0 | 0 | PASS | 7 parameters compared |
| browser | Snapshot for a newly opened console = latest values | 0 | 0 | PASS |  |
| browser | Alarm frames delivered | — | 24 ALARM frames for 12 alarms raised, 12 cleared | INFO |  |

Latency ground receive → browser: p50 14.9 ms · p95 116.3 ms · p99 116.3 ms · max 116.3 ms (17 samples)

## D02 · Clean link at 1x (real time) — PASS

Setup: 300 samples at 1x

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| end-to-end | Every sample delivered | 300 | 300 | PASS | 100.00% delivered |
| link | Frames received = frames sent | 72 | 72 | PASS |  |
| frame | Frames valid = frames received | 72 | 72 | PASS |  |
| frame | No frame lost | 0 | 0 | PASS |  |
| packet | Packets forwarded = samples sent | 300 | 300 | PASS | space packets reassembled across frames |
| packet | No packet sequence gap | 0 | 0 | PASS |  |
| tm | Packets decoded = packets forwarded | 300 | 300 | PASS |  |
| tm | No decommutation error | 0 | 0 | PASS |  |
| tm | No uncertain timestamps | 0 | 0 | PASS | time correlation valid |
| cvt | CVT updated for every sample (or held back as older) | 300 | 300 | PASS |  |
| browser | Ground receive to browser latency p95 < 250 ms | < 250 ms (production budget 100 ms) | p50 21.4 / p95 128.3 / p99 677.8 / max 677.8 ms | PASS |  |
| end-to-end | Throughput | — | 4 samples/s | INFO |  |

Latency ground receive → browser: p50 21.4 ms · p95 128.3 ms · p99 677.8 ms · max 677.8 ms (72 samples)

## D03 · Clean link at 10x — PASS

Setup: 2 000 samples at 10x

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| end-to-end | Every sample delivered | 2000 | 2000 | PASS | 100.00% delivered |
| link | Frames received = frames sent | 224 | 224 | PASS |  |
| frame | Frames valid = frames received | 224 | 224 | PASS |  |
| frame | No frame lost | 0 | 0 | PASS |  |
| packet | Packets forwarded = samples sent | 2000 | 2000 | PASS | space packets reassembled across frames |
| packet | No packet sequence gap | 0 | 0 | PASS |  |
| tm | Packets decoded = packets forwarded | 2000 | 2000 | PASS |  |
| tm | No decommutation error | 0 | 0 | PASS |  |
| tm | No uncertain timestamps | 0 | 0 | PASS | time correlation valid |
| cvt | CVT updated for every sample (or held back as older) | 2000 | 2000 | PASS |  |
| browser | Ground receive to browser latency p95 < 250 ms | < 250 ms (production budget 100 ms) | p50 40.7 / p95 170.5 / p99 172.2 / max 410.0 ms | PASS |  |
| end-to-end | Throughput | — | 42 samples/s | INFO |  |

Latency ground receive → browser: p50 40.7 ms · p95 170.5 ms · p99 172.2 ms · max 410.0 ms (349 samples)

## D04 · Clean link at 100x — PASS

Setup: 10 000 samples at 100x

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| end-to-end | Every sample delivered | 10000 | 10000 | PASS | 100.00% delivered |
| link | Frames received = frames sent | 644 | 644 | PASS |  |
| frame | Frames valid = frames received | 644 | 644 | PASS |  |
| frame | No frame lost | 0 | 0 | PASS |  |
| packet | Packets forwarded = samples sent | 10000 | 10000 | PASS | space packets reassembled across frames |
| packet | No packet sequence gap | 0 | 0 | PASS |  |
| tm | Packets decoded = packets forwarded | 10000 | 10000 | PASS |  |
| tm | No decommutation error | 0 | 0 | PASS |  |
| tm | No uncertain timestamps | 0 | 0 | PASS | time correlation valid |
| cvt | CVT updated for every sample (or held back as older) | 10000 | 10000 | PASS |  |
| browser | Ground receive to browser latency p95 < 250 ms | < 250 ms (production budget 100 ms) | p50 45.7 / p95 95.6 / p99 122.4 / max 241.6 ms | PASS |  |
| end-to-end | Throughput | — | 376 samples/s | INFO |  |

Latency ground receive → browser: p50 45.7 ms · p95 95.6 ms · p99 122.4 ms · max 241.6 ms (465 samples)

## D10 · Bit errors (BER 1e-4) — PASS

Setup: BER 1e-4 on every frame

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| frame | Corrupted frames rejected by the CRC | ~243 (all but those whose sync marker was hit) | 242 | PASS | CRC-16/CCITT FECF |
| frame | Rejected frames reported as lost (gaps) | 242 (±4) | 243 | PASS | every corrupted frame leaves a counted hole in the sequence |
| end-to-end | Samples delivered | — | 80.49% | INFO | samples in rejected frames, and packets spanning them, are lost — never delivered wrong |
| end-to-end | Throughput at full speed | — | 6871 samples/s, 366 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 20.7 ms · p95 769.8 ms · p99 769.8 ms · max 769.8 ms (19 samples)

## D11 · Random frame loss (2 %) — PASS

Setup: 2 % of frames dropped

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| frame | Lost frames counted exactly | 26 (±2) | 26 | PASS | a frame lost at the very end of the run cannot be seen |
| frame | Gap events raised | >= 1 | 26 | PASS |  |
| end-to-end | Throughput at full speed | — | 8974 samples/s, 575 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 41.2 ms · p95 130.1 ms · p99 130.1 ms · max 130.1 ms (14 samples)

## D12 · Fades (burst loss) — PASS

Setup: 1 % chance of a 10-frame fade

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| frame | Frames lost in fades counted | 132 (±10) | 130 | PASS |  |
| frame | Gaps declared by window vs timeout | — | 13 events | INFO | a fade longer than the reorder window is released when the window fills |
| end-to-end | Throughput at full speed | — | 8928 samples/s, 525 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 21.5 ms · p95 52.0 ms · p99 52.0 ms · max 52.0 ms (10 samples)

## D13 · Duplicate frames (two stations) — PASS

Setup: 5 % of frames delivered twice

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| frame | Every duplicate dropped | 63 | 63 | PASS | content fingerprint window |
| end-to-end | Every sample delivered | 20000 | 20000 | PASS |  |
| end-to-end | Throughput at full speed | — | 9001 samples/s, 588 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 21.1 ms · p95 138.0 ms · p99 138.0 ms · max 138.0 ms (19 samples)

## D14 · Out-of-order frames — PASS

Setup: 5 % of frames delayed by 3 frames

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| frame | No gap declared for a late-but-in-window frame | 0 | 0 | PASS |  |
| end-to-end | Every sample delivered | 20000 (±0) | 20000 | PASS |  |
| frame | Frames held for reordering | — | 158 | INFO |  |
| end-to-end | Throughput at full speed | — | 8591 samples/s, 561 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 31.9 ms · p95 146.5 ms · p99 146.5 ms · max 146.5 ms (18 samples)

## D15 · Garbage between frames (sync slip) — PASS

Setup: 5 % of frames preceded by 1-40 random bytes

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| link | Garbage bytes skipped by frame sync | 1353 | 1353 | PASS |  |
| end-to-end | Every sample delivered | 20000 | 20000 | PASS |  |
| end-to-end | Throughput at full speed | — | 8615 samples/s, 563 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 20.8 ms · p95 156.6 ms · p99 156.6 ms · max 156.6 ms (20 samples)

## D16 · Damaged sync marker — PASS

Setup: 1 % of frames with a corrupted ASM

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| frame | Frames without a findable marker reported lost | 14 (±2) | 14 | PASS |  |
| end-to-end | Throughput at full speed | — | 8973 samples/s, 580 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 42.2 ms · p95 125.6 ms · p99 125.6 ms · max 125.6 ms (14 samples)

## D17 · Truncated frames (receiver dropout) — PASS

Setup: 1 % of frames cut short

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| link | Truncated frames detected by frame sync | 14 | 14 | PASS | CRC-checked resync on the inner marker |
| frame | Only the truncated frame is lost, not its neighbour | 14 (±2) | 14 | PASS |  |
| end-to-end | Throughput at full speed | — | 8842 samples/s, 572 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 21.1 ms · p95 118.3 ms · p99 118.3 ms · max 118.3 ms (17 samples)

## D18 · Frames from an unknown spacecraft — PASS

Setup: 2 % of frames re-addressed to SCID 999 (valid CRC)

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| frame | Foreign frames refused (SCID whitelist) | 26 | 26 | PASS |  |
| deadletter | Each written to the dead-letter log | 26 | 26 | PASS |  |
| end-to-end | Throughput at full speed | — | 9046 samples/s, 579 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 20.4 ms · p95 119.5 ms · p99 119.5 ms · max 119.5 ms (17 samples)

## D20 · Spacecraft counter reset (reboot) — PASS

Setup: frame counters restart mid-run (2 500 samples at 250x)

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| frame | Counter reset recognised | 1 | 1 | PASS | the new count landed behind the old one |
| end-to-end | Stream followed after the reset (>= 99 % delivered) | >= 2475 | 2481 | PASS | a few frames before detection can be dropped |
| browser | Ground receive to browser latency p95 < 250 ms | < 250 ms (production budget 100 ms) | p50 59.4 / p95 170.1 / p99 171.8 / max 582.0 ms | PASS |  |
| end-to-end | Throughput | — | 86 samples/s | INFO |  |

Latency ground receive → browser: p50 59.4 ms · p95 170.1 ms · p99 171.8 ms · max 582.0 ms (258 samples)

## D21 · On-board time jump — PASS

Setup: on-board clock jumps +2 h mid-run

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| tm | Time jump detected per packet stream | >= 1 | 1 | PASS |  |
| end-to-end | Samples still delivered | 2500 | 2500 | PASS | a time jump is flagged, not dropped |
| browser | Ground receive to browser latency p95 < 250 ms | < 250 ms (production budget 100 ms) | p50 58.5 / p95 167.9 / p99 169.8 / max 609.5 ms | PASS |  |
| end-to-end | Throughput | — | 86 samples/s | INFO |  |

Latency ground receive → browser: p50 58.5 ms · p95 167.9 ms · p99 169.8 ms · max 609.5 ms (285 samples)

## D22 · Packets with an unknown APID — PASS

Setup: 25 packets with an APID the dictionary lacks

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| tm | Unknown APIDs refused by the decoder | 25 | 25 | PASS |  |
| deadletter | Written to the dead-letter log | >= 25 | 25 | PASS |  |
| end-to-end | Other samples unaffected | 2500 | 2500 | PASS |  |
| browser | Ground receive to browser latency p95 < 250 ms | < 250 ms (production budget 100 ms) | p50 52.4 / p95 162.1 / p99 171.7 / max 603.1 ms | PASS |  |
| end-to-end | Throughput | — | 86 samples/s | INFO |  |

Latency ground receive → browser: p50 52.4 ms · p95 162.1 ms · p99 171.7 ms · max 603.1 ms (236 samples)

## D23 · Malformed packets — PASS

Setup: 5 packets with an invalid version field, 1.2 s apart

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| packet | Malformed packet headers detected | >= 5 | 5 | PASS |  |
| end-to-end | Samples lost while resynchronising | — | 19 | INFO | after a bad header the stream resyncs at the next first-header pointer |
| browser | Ground receive to browser latency p95 < 250 ms | < 250 ms (production budget 100 ms) | p50 52.5 / p95 161.7 / p99 171.7 / max 602.2 ms | PASS |  |
| end-to-end | Throughput | — | 86 samples/s | INFO |  |

Latency ground receive → browser: p50 52.5 ms · p95 161.7 ms · p99 171.7 ms · max 602.2 ms (288 samples)

## D24 · Station outage (3 s stall) — PASS

Setup: downlink stops for 3 s mid-run

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| end-to-end | Nothing lost across the outage | 20000 | 20000 | PASS |  |
| frame | No false gap declared | 0 | 0 | PASS |  |
| end-to-end | Throughput at full speed | — | 3807 samples/s, 249 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 22.4 ms · p95 136.1 ms · p99 136.1 ms · max 136.1 ms (16 samples)

## D30 · A bad pass: everything at once — PASS

Setup: BER 1e-5, 1 % loss, 2 % duplicates, 2 % reordering, 1 % garbage, 0.5 % truncation

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| end-to-end | No corrupted value delivered | 0 | 0 | PASS | largest decode error 0.0005 (quantisation step bound) |
| end-to-end | No sample delivered twice | 0 | 0 | PASS |  |
| end-to-end | Samples delivered in order | 0 | 0 | PASS |  |
| frame | Every lost frame explained (dropped + CRC-rejected + truncated) | 49 (±4) | 48 | PASS | residual = frames whose sync marker was hit by a bit error |
| frame | Every duplicate that arrived was dropped | 23 (±3) | 22 | PASS | a duplicated frame that was also truncated or corrupted never reaches the processor |
| end-to-end | Samples delivered | — | 96.10% | INFO |  |
| end-to-end | Throughput at full speed | — | 8965 samples/s, 564 frames/s | INFO | the link is paced by TCP backpressure from the ground |

Latency ground receive → browser: p50 40.9 ms · p95 127.4 ms · p99 127.4 ms · max 127.4 ms (14 samples)

## U01 · Routine command, console to spacecraft and back — PASS

Setup: HK_RATE_SET RATE_HZ=2 to AKV-03

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| command-gw | Accepted by the gateway | 202 | 202 | PASS |  |
| uplink | Acknowledged by the spacecraft (CLCW) | ACKNOWLEDGED or later | COMPLETED | PASS |  |
| uplink | Time to acknowledgement | — | 50 ms | INFO | includes waiting for the next downlink frame's CLCW |
| spacecraft | Authenticated, decrypted and executed on board | executed | true | PASS |  |
| browser | Console saw the statuses in lifecycle order, never backwards | PENDING → … → SENT → (ACKNOWLEDGED) → ACCEPTED → COMPLETED | [PENDING QUEUED SENT ACCEPTED COMPLETED COMPLETED] | PASS | CLCW acknowledgement and PUS-1 acceptance share a frame and may arrive in either order |
| verification | Spacecraft reported acceptance and completion (PUS-1) | ACCEPTED (TM 1,1) then COMPLETED (TM 1,7) | [PENDING QUEUED SENT ACCEPTED COMPLETED COMPLETED] | PASS | matched to the command by its TC packet request ID |
| verification | Time to completion report | — | 50 ms | INFO |  |

## U09 · Command the spacecraft accepts but cannot perform — PASS

Setup: HTR_SWITCH HEATER=C (no such heater) to AKV-02

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| verification | Execution failure reported by the spacecraft (TM 1,8) | EXECUTION_FAILED with the on-board reason | EXECUTION_FAILED · execution failed on board: the spacecraft could not perform it | PASS | not marked done just because the frame was acknowledged |

## U02 · Out-of-range command stopped before uplink — PASS

Setup: SET_HTR_SETPOINT SETPOINT=99 (range 5-25)

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| upe | Rejected by the L1 range check | FAILED | FAILED | PASS |  |
| spacecraft | Never reached the spacecraft | 0 | 0 | PASS |  |

## U03 · Command to a spacecraft the ground does not fly — PASS

Setup: SCID 200

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| command-gw | Refused at submission | 4xx | 422, then "" | PASS | an unknown SCID should never be accepted |

## U04 · Lost telecommand frame, no later traffic — PASS

Setup: forward link loses the next TC frame

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| cop1 | Retransmitted by COP-1 (T1 timer) and acknowledged | ACKNOWLEDGED within 12 s | COMPLETED | PASS | FOP-1 must retransmit on T1 expiry |

## U05 · Lost telecommand frame, next command arrives — PASS

Setup: first TC frame lost, second sent 300 ms later

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| cop1 | Both acknowledged after retransmission | both ACKNOWLEDGED | COMPLETED / COMPLETED | PASS | CLCW retransmit flag → FOP resends the window |

## U06 · Burst of 20 commands to one spacecraft — PASS

Setup: 20 HK_RATE_SET to AKV-07 back to back (COP-1 window 10)

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| uplink | All 20 acknowledged | 20 | 20 | PASS | not acknowledged, by last status: map[] |
| browser | No status went backwards on the console | 0 | 0 | PASS | QUEUED arriving after SENT |

## U07 · Cancel a command just after submission — PASS

Setup: submit to AKV-08 then cancel immediately

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| uplink | Cancel outcome is consistent | withdrawn before uplink, or reported as too late (already radiated) | cancel HTTP 202 · executed 0 · status CANCELLED · cancelled before uplink | PASS |  |
| uplink | A command still queued is withdrawn | CANCELLED | CANCELLED | PASS | queued behind a full COP-1 window while the downlink was stalled |

## U08 · Commands while the downlink is interrupted — PASS

Setup: downlink stalled 4 s, 12 commands to AKV-09 meanwhile (window 10)

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| cop1 | All 12 acknowledged once the downlink returns | 12 | 12 | PASS | final statuses map[COMPLETED:12] |

## M01 · Limit alarms and anomaly model against ESA labels — GAP

Setup: full OPS-SAT-AD dataset: 303493 samples, 2123 segments (434 labelled anomalous), clean link

| Stage | Check | Expected | Observed | Result | Note |
|---|---|---|---|---|---|
| model | Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | — | precision 0.33 · recall 0.03 · F1 0.06 (TP 15 FP 31 FN 419 TN 1658) | INFO | limits set from nominal training data; sun sensors have no limits (nominal data saturates at π/2) |
| model | Anomaly model (spike / noise / flat / gap, unsupervised) | — | precision 0.31 · recall 0.65 · F1 0.42 (TP 282 FP 624 FN 152 TN 1065) | INFO | no labels used; rolling median-MAD, spread ratio and sample-interval tests |
| model | Limits + anomaly model | — | precision 0.30 · recall 0.66 · F1 0.42 (TP 285 FP 652 FN 149 TN 1037) | INFO | either flags the segment |
| model | Limits catch magnetometer excursions | > 0 true positives on MAG_* | 15 | PASS |  |
| model | Supervised anomaly model trained on the labels | published ESA baselines reach F1 ≈ 0.6-0.9 with supervised models | best unsupervised F1 here 0.42 | GAP | a trained model (ESA's training split) is the next step for the Anomaly advisories screen |

## Model scores (per segment, against ESA labels)

303493 samples, 2123 segments, 434 anomalous. Anomaly model detections by kind: map[FLAT:3178 GAP:297 NOISE:491 SPIKE:1163]. Limit alarm events: 78.

| Model | Split | Precision | Recall | F1 | Accuracy | TP | FP | FN | TN |
|---|---|---|---|---|---|---|---|---|---|
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | all | 0.33 | 0.03 | 0.06 | 0.79 | 15 | 31 | 419 | 1658 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | all | 0.31 | 0.65 | 0.42 | 0.63 | 282 | 624 | 152 | 1065 |
| Limits + anomaly model | all | 0.30 | 0.66 | 0.42 | 0.62 | 285 | 652 | 149 | 1037 |
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | test | 0.25 | 0.02 | 0.03 | 0.78 | 2 | 6 | 111 | 410 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | test | 0.31 | 0.64 | 0.42 | 0.62 | 72 | 159 | 41 | 257 |
| Limits + anomaly model | test | 0.31 | 0.64 | 0.41 | 0.61 | 72 | 164 | 41 | 252 |

Per channel (all segments):

| Model | Channel | TP | FP | FN | TN | Recall |
|---|---|---|---|---|---|---|
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | MAG_X | 7 | 11 | 124 | 404 | 0.05 |
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | MAG_Y | 4 | 13 | 101 | 475 | 0.04 |
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | MAG_Z | 4 | 7 | 65 | 118 | 0.06 |
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | PD1_THETA | 0 | 0 | 0 | 158 | 0.00 |
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | PD2_THETA | 0 | 0 | 3 | 8 | 0.00 |
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | PD3_THETA | 0 | 0 | 60 | 192 | 0.00 |
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | PD4_THETA | 0 | 0 | 11 | 3 | 0.00 |
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | PD5_THETA | 0 | 0 | 34 | 177 | 0.00 |
| Limit alarms (MAG ±47/±52 µT, 3-sample confirmation) | PD6_THETA | 0 | 0 | 21 | 123 | 0.00 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | MAG_X | 68 | 50 | 63 | 365 | 0.52 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | MAG_Y | 68 | 52 | 37 | 436 | 0.65 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | MAG_Z | 55 | 22 | 14 | 103 | 0.80 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | PD1_THETA | 0 | 79 | 0 | 79 | 0.00 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | PD2_THETA | 0 | 5 | 3 | 3 | 0.00 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | PD3_THETA | 29 | 124 | 31 | 68 | 0.48 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | PD4_THETA | 9 | 3 | 2 | 0 | 0.82 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | PD5_THETA | 33 | 175 | 1 | 2 | 0.97 |
| Anomaly model (spike / noise / flat / gap, unsupervised) | PD6_THETA | 20 | 114 | 1 | 9 | 0.95 |
| Limits + anomaly model | MAG_X | 68 | 60 | 63 | 355 | 0.52 |
| Limits + anomaly model | MAG_Y | 69 | 63 | 36 | 425 | 0.66 |
| Limits + anomaly model | MAG_Z | 57 | 29 | 12 | 96 | 0.83 |
| Limits + anomaly model | PD1_THETA | 0 | 79 | 0 | 79 | 0.00 |
| Limits + anomaly model | PD2_THETA | 0 | 5 | 3 | 3 | 0.00 |
| Limits + anomaly model | PD3_THETA | 29 | 124 | 31 | 68 | 0.48 |
| Limits + anomaly model | PD4_THETA | 9 | 3 | 2 | 0 | 0.82 |
| Limits + anomaly model | PD5_THETA | 33 | 175 | 1 | 2 | 0.97 |
| Limits + anomaly model | PD6_THETA | 20 | 114 | 1 | 9 | 0.95 |
