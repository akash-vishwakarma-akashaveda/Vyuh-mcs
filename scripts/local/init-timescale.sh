#!/bin/sh
# Runs once, on the first start of the vyuh-timescaledb container. Enables the
# TimescaleDB extension and applies the telemetry archive migrations.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -c "CREATE EXTENSION IF NOT EXISTS timescaledb"
for f in /migrations/vyuh_telemetry/V*.sql; do
  [ -f "$f" ] || continue
  echo "applying $f"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -f "$f"
done
