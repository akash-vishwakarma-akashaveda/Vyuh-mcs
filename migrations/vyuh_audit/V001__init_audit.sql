-- V001__init_audit.sql
-- Audit log and alarm incident log database schema for VYUH-MCS

CREATE TABLE IF NOT EXISTS audit_log (
    id             BIGSERIAL PRIMARY KEY,
    event_id       UUID NOT NULL DEFAULT gen_random_uuid(),
    event_type     VARCHAR(64) NOT NULL,
    -- EVENT_TYPES: CMD_SUBMIT | CMD_CANCEL | ALARM_ACK | CONFIG_CHANGE |
    --              INHIBIT_SET | INHIBIT_CLEAR | LOGIN | LOGOUT | ROLE_CHANGE
    operator_id    VARCHAR(256) NOT NULL,
    operator_role  VARCHAR(32) NOT NULL,
    scid           SMALLINT,
    resource_id    VARCHAR(256),
    resource_type  VARCHAR(64),
    detail         JSONB,
    ip_address     INET,
    session_id     VARCHAR(256),
    ts             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log USING BRIN(ts);
CREATE INDEX IF NOT EXISTS idx_audit_operator ON audit_log(operator_id, ts DESC);

CREATE TABLE IF NOT EXISTS alarm_log (
    id             BIGSERIAL PRIMARY KEY,
    alarm_id       UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    scid           SMALLINT NOT NULL,
    param_name     VARCHAR(128) NOT NULL,
    alarm_level    VARCHAR(16) NOT NULL,
    eu_value       DOUBLE PRECISION NOT NULL,
    threshold      DOUBLE PRECISION NOT NULL,
    eu_unit        VARCHAR(32),
    triggered_at   TIMESTAMPTZ NOT NULL,
    cleared_at     TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(256),
    inhibited      BOOLEAN NOT NULL DEFAULT false,
    status         VARCHAR(32) NOT NULL DEFAULT 'ACTIVE'
    -- ACTIVE | ACKNOWLEDGED | CLEARED
);
CREATE INDEX IF NOT EXISTS idx_alarmlog_scid_active ON alarm_log(scid, triggered_at DESC) WHERE status = 'ACTIVE';
