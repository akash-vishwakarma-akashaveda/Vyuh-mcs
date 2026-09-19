#!/bin/sh
set -e

# Initialize multiple PostgreSQL databases in the local dev container
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE vyuh_config;
    CREATE DATABASE vyuh_commands;
    CREATE DATABASE vyuh_audit;
    GRANT ALL PRIVILEGES ON DATABASE vyuh_config TO vyuh;
    GRANT ALL PRIVILEGES ON DATABASE vyuh_commands TO vyuh;
    GRANT ALL PRIVILEGES ON DATABASE vyuh_audit TO vyuh;
EOSQL
