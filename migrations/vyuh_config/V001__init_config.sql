-- V001__init_config.sql
-- Configuration database schema for VYUH-MCS

CREATE TABLE IF NOT EXISTS satellite_config (
    scid           SMALLINT PRIMARY KEY,
    name           VARCHAR(64) NOT NULL UNIQUE,
    enabled        BOOLEAN NOT NULL DEFAULT true,
    tle_line1      VARCHAR(70),
    tle_line2      VARCHAR(70),
    antennas       TEXT[],
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vcid_config (
    scid           SMALLINT NOT NULL REFERENCES satellite_config(scid),
    vcid           SMALLINT NOT NULL,
    description    VARCHAR(128),
    frame_rate_hz  REAL,
    PRIMARY KEY (scid, vcid)
);

CREATE TABLE IF NOT EXISTS xtce_parameters (
    id             BIGSERIAL PRIMARY KEY,
    scid           SMALLINT NOT NULL REFERENCES satellite_config(scid),
    apid           SMALLINT NOT NULL,
    param_name     VARCHAR(128) NOT NULL,
    description    TEXT,
    data_type      VARCHAR(32) NOT NULL,    -- UINT, INT, FLOAT, BOOL, STRING
    bit_offset     INTEGER NOT NULL,
    bit_length     INTEGER NOT NULL,
    byte_order     VARCHAR(16) NOT NULL DEFAULT 'BIG_ENDIAN',
    eu_unit        VARCHAR(32),
    -- Calibration
    calib_type     VARCHAR(16),             -- POLYNOMIAL, SPLINE, LUT, NONE
    calib_data     JSONB,                   -- coefficients, breakpoints, or LUT table
    -- Alarm limits
    low_low_limit  DOUBLE PRECISION,
    low_limit      DOUBLE PRECISION,
    high_limit     DOUBLE PRECISION,
    high_high_limit DOUBLE PRECISION,
    alarm_enabled  BOOLEAN NOT NULL DEFAULT true,
    version        INTEGER NOT NULL DEFAULT 1,
    UNIQUE (scid, apid, param_name)
);
CREATE INDEX IF NOT EXISTS idx_xtce_scid_apid ON xtce_parameters(scid, apid);

CREATE TABLE IF NOT EXISTS obt_correlation (
    id             BIGSERIAL UNIQUE,
    scid           SMALLINT NOT NULL REFERENCES satellite_config(scid),
    pass_id        VARCHAR(64) NOT NULL,
    valid_from     TIMESTAMPTZ NOT NULL,
    coeff_a0       DOUBLE PRECISION NOT NULL,  -- UTC = a0 + a1*OBT + a2*OBT^2
    coeff_a1       DOUBLE PRECISION NOT NULL,
    coeff_a2       DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (scid, pass_id)
);

CREATE TABLE IF NOT EXISTS alarm_definitions (
    id             BIGSERIAL PRIMARY KEY,
    scid           SMALLINT NOT NULL REFERENCES satellite_config(scid),
    param_name     VARCHAR(128) NOT NULL,
    low_low_limit  DOUBLE PRECISION,
    low_limit      DOUBLE PRECISION,
    high_limit     DOUBLE PRECISION,
    high_high_limit DOUBLE PRECISION,
    hysteresis_pct REAL NOT NULL DEFAULT 1.0,
    enabled        BOOLEAN NOT NULL DEFAULT true,
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_by     VARCHAR(128),
    UNIQUE (scid, param_name)
);
