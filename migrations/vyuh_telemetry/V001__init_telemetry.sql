-- V001__init_telemetry.sql
-- TimescaleDB telemetry archive schema for VYUH-MCS

CREATE TABLE IF NOT EXISTS telemetry_raw (
    time        TIMESTAMPTZ NOT NULL,
    scid        SMALLINT    NOT NULL,
    param_name  TEXT        NOT NULL,
    dn_value    BIGINT,
    eu_value    DOUBLE PRECISION,
    eu_unit     TEXT,
    quality     SMALLINT    NOT NULL DEFAULT 0,
    alarm_state SMALLINT    NOT NULL DEFAULT 0,
    apid        SMALLINT,
    packet_seq  SMALLINT,
    pass_id     TEXT,
    is_replay   BOOLEAN     NOT NULL DEFAULT false,
    PRIMARY KEY (time, scid, param_name)
);

-- Hypertable creation (if timescaledb extension is loaded)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('telemetry_raw', 'time',
            chunk_time_interval => INTERVAL '1 day',
            partitioning_column => 'scid',
            number_partitions => 64,
            if_not_exists => TRUE
        );

        -- Continuous aggregates
        IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'telemetry_1min') THEN
            CREATE MATERIALIZED VIEW telemetry_1min
                WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
            SELECT
                time_bucket('1 minute', time) AS bucket,
                scid, param_name,
                AVG(eu_value)   AS avg_val,
                MIN(eu_value)   AS min_val,
                MAX(eu_value)   AS max_val,
                COUNT(*)        AS sample_count,
                MIN(quality)    AS min_quality
            FROM telemetry_raw
            WHERE quality < 2
            GROUP BY bucket, scid, param_name
            WITH NO DATA;

            PERFORM add_continuous_aggregate_policy('telemetry_1min',
                start_offset => INTERVAL '2 minutes',
                end_offset   => INTERVAL '30 seconds',
                schedule_interval => INTERVAL '1 minute'
            );
        END IF;

        IF NOT EXISTS (SELECT 1 FROM pg_matviews WHERE matviewname = 'telemetry_1hour') THEN
            CREATE MATERIALIZED VIEW telemetry_1hour
                WITH (timescaledb.continuous, timescaledb.materialized_only = false) AS
            SELECT
                time_bucket('1 hour', bucket) AS bucket,
                scid, param_name,
                AVG(avg_val) AS avg_val,
                MIN(min_val) AS min_val,
                MAX(max_val) AS max_val,
                SUM(sample_count) AS sample_count
            FROM telemetry_1min
            GROUP BY time_bucket('1 hour', bucket), scid, param_name
            WITH NO DATA;
        END IF;
    END IF;
END $$;
