-- V001__init_commands.sql
-- Commands and execution log database schema for VYUH-MCS

CREATE TABLE IF NOT EXISTS command_definitions (
    id             BIGSERIAL PRIMARY KEY,
    scid           SMALLINT NOT NULL,
    apid           SMALLINT NOT NULL,
    name           VARCHAR(128) NOT NULL,
    description    TEXT,
    min_role       VARCHAR(32) NOT NULL DEFAULT 'OPERATOR',
    params_schema  JSONB NOT NULL,    -- JSON Schema for parameter validation
    constraints    JSONB,             -- constraint expressions [{param, op, value}]
    interlocks     JSONB,             -- interlock chain definitions
    enabled        BOOLEAN NOT NULL DEFAULT true,
    UNIQUE (scid, apid)
);

CREATE TABLE IF NOT EXISTS command_log (
    id             BIGSERIAL PRIMARY KEY,
    command_id     UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    scid           SMALLINT NOT NULL,
    apid           SMALLINT NOT NULL,
    command_name   VARCHAR(128),
    params         JSONB NOT NULL,
    operator_id    VARCHAR(256) NOT NULL,
    priority       VARCHAR(16) NOT NULL,
    status         VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    -- Status: PENDING | QUEUED | SENT | ACKNOWLEDGED | FAILED | REJECTED_RANGE |
    --         REJECTED_CONSTRAINT | REJECTED_INHIBITED | REJECTED_INTERLOCK | CANCELLED
    rejection_reason TEXT,
    seq_count      SMALLINT,
    retransmit_count SMALLINT DEFAULT 0,
    submitted_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    queued_at      TIMESTAMPTZ,
    sent_at        TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    failed_at      TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_cmdlog_scid_ts ON command_log(scid, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_cmdlog_status ON command_log(status) WHERE status NOT IN ('ACKNOWLEDGED', 'FAILED');

CREATE TABLE IF NOT EXISTS dead_letter_log (
    id             BIGSERIAL PRIMARY KEY,
    kafka_topic    VARCHAR(128) NOT NULL,
    kafka_partition INTEGER NOT NULL,
    kafka_offset   BIGINT NOT NULL,
    source_service VARCHAR(64) NOT NULL,
    error_type     VARCHAR(64) NOT NULL,
    scid           SMALLINT,
    payload_b64    TEXT,
    error_detail   TEXT,
    received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
