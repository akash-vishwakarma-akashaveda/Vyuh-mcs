#!/bin/sh
# Runs once, on the first start of the vyuh-postgres container
# (/docker-entrypoint-initdb.d). Creates the three relational databases and
# applies their migrations from /migrations (mounted read-only by
# docker-compose.dev.yml). POSTGRES_DB (vyuh_config) already exists by then.
set -e

for db in vyuh_config vyuh_commands vyuh_audit; do
  exists=$(psql -tA --username "$POSTGRES_USER" --dbname postgres -c "SELECT 1 FROM pg_database WHERE datname = '$db'")
  if [ "$exists" != "1" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "CREATE DATABASE $db"
  fi
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres -c "GRANT ALL PRIVILEGES ON DATABASE $db TO $POSTGRES_USER"
  for f in /migrations/$db/V*.sql; do
    [ -f "$f" ] || continue
    echo "applying $f"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" -f "$f"
  done
done
