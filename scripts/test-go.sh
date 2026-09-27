#!/usr/bin/env bash
# Runs every Go package's tests from bin/tests/ instead of the temp folder, because
# Windows Smart App Control blocks freshly built test executables in %TEMP%.
# Usage: scripts/test-go.sh [package pattern ...]   (default ./...)
set -u
mkdir -p bin/tests
fail=0
for pkg in $(go list "${@:-./...}"); do
  name=$(echo "$pkg" | sed 's|.*/vyuh-mcs/||; s|/|_|g')
  if ! go test -c -o "bin/tests/$name.exe" "$pkg" >/dev/null 2>bin/tests/$name.build.log; then
    echo "BUILD FAIL $pkg"; cat bin/tests/$name.build.log; fail=1; continue
  fi
  [ -f "bin/tests/$name.exe" ] || continue   # package has no tests
  dir=$(go list -f '{{.Dir}}' "$pkg")
  # Smart App Control refuses some new executables at random (exit 126): fall
  # back to plain `go test`, whose temp-folder binary gets a fresh verdict.
  out=$(cd "$dir" && "$OLDPWD/bin/tests/$name.exe" 2>&1); rc=$?
  for try in 1 2; do
    [ $rc -ne 126 ] && break
    out=$(go test -count=1 "$pkg" 2>&1); rc=$?
    echo "$out" | grep -q "Application Control policy" && rc=126
  done
  if [ $rc -eq 0 ]; then
    echo "ok   $pkg"
  else
    echo "FAIL $pkg"; echo "$out" | tail -25; fail=1
  fi
done
exit $fail
