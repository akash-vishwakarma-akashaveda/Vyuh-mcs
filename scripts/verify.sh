#!/usr/bin/env bash
# Builds and runs the pipeline verification. A new file name per build, because
# Windows Smart App Control sometimes refuses a freshly rebuilt executable.
# Usage: scripts/verify.sh [pipeline-verify flags]   e.g. scripts/verify.sh -only D1
set -e
mkdir -p bin/verify
rm -f bin/verify/pv-*.exe 2>/dev/null || true
exe="bin/verify/pv-$RANDOM.exe"
go build -o "$exe" ./cmd/pipeline-verify
for try in 1 2 3; do
  "$exe" "$@" && exit 0 || rc=$?
  [ $rc -ne 126 ] && exit $rc
  exe="bin/verify/pv-$RANDOM.exe"; go build -ldflags "-buildid=v$RANDOM" -o "$exe" ./cmd/pipeline-verify
done
exit $rc
