-- Enable required extensions (handle version conflicts gracefully)
CREATE EXTENSION IF NOT EXISTS postgis;
-- TimescaleDB may already be loaded with different version
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        CREATE EXTENSION timescaledb;
    END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS vector;

------------------------------------------------------------------------
-- 1. Raspberry-Pi sensor telemetry (primary in-field data stream)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pi_sensor_raw (
    id                BIGSERIAL,
    sensor_uuid       UUID            NOT NULL,
    ts                TIMESTAMPTZ     NOT NULL,
    location          GEOGRAPHY(POINT, 4326) NOT NULL,
    altitude_m        REAL,
    pm25_ug_m3        REAL,
    pm10_ug_m3        REAL,
    temperature_c     REAL,
    rh_percent        REAL,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, ts)
);

-- Convert to hypertable for time-series performance
SELECT create_hypertable('pi_sensor_raw', 'ts', if_not_exists => TRUE);

-- Time-series index (must include partitioning column for hypertables)
CREATE INDEX IF NOT EXISTS idx_pi_sensor_raw_ts
        ON pi_sensor_raw(ts DESC);
CREATE INDEX IF NOT EXISTS idx_pi_sensor_raw_uuid_ts
        ON pi_sensor_raw(sensor_uuid, ts);

-- Spatial index (separate from temporal)
CREATE INDEX IF NOT EXISTS idx_pi_sensor_raw_geo
        ON pi_sensor_raw USING GIST(location);

------------------------------------------------------------------------
-- 2. NASA FIRMS VIIRS 375 m active-fire detections (moved to migration 002)
------------------------------------------------------------------------
-- Fire detections table is now defined in 002_prescribed_fire_platform.sql
-- with enhanced prescribed burn management capabilities

------------------------------------------------------------------------
-- 3. NOAA NWS Grid-point meteorology (pressure-level wind, T, RH)
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS meteorology_grids (
    id            BIGSERIAL,
    valid_ts      TIMESTAMPTZ NOT NULL,
    pressure_pa   INTEGER,                           -- pressure level
    location      GEOGRAPHY(POINT, 4326) NOT NULL,   -- grid-cell centroid
    u_wind_ms     REAL,
    v_wind_ms     REAL,
    w_wind_ms     REAL,
    temperature_k REAL,
    rh_percent    REAL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, valid_ts)
);

SELECT create_hypertable('meteorology_grids','valid_ts',if_not_exists=>TRUE);

CREATE INDEX IF NOT EXISTS idx_met_grids_geo
        ON meteorology_grids USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_met_grids_ts
        ON meteorology_grids(valid_ts DESC);

------------------------------------------------------------------------
-- 4. GOES-ABI / OMPS Aerosol Optical Depth & Index (moved to migration 002)
------------------------------------------------------------------------
-- Satellite AOD table is now defined in 002_prescribed_fire_platform.sql
-- with enhanced measurements and quality assessments

------------------------------------------------------------------------
-- 5. Hybrid physics + AI plume predictions
------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS plume_predictions (
    id               BIGSERIAL,
    prediction_ts    TIMESTAMPTZ NOT NULL,    -- time the model is valid FOR
    generated_at     TIMESTAMPTZ NOT NULL,    -- time we ran the model
    location         GEOGRAPHY(POINT, 4326) NOT NULL,
    altitude_m       REAL,
    conc_pm25_ug_m3  REAL,                    -- predicted PM2.5 conc
    conc_pm10_ug_m3  REAL,                    -- predicted PM10 conc
    model_version    TEXT     NOT NULL,
    rmse_validation  REAL,                    -- validation stats (optional)
    metadata         JSONB,
    created_at       TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, prediction_ts)
);

SELECT create_hypertable('plume_predictions','prediction_ts',if_not_exists=>TRUE);

CREATE INDEX IF NOT EXISTS idx_plume_predictions_geo
        ON plume_predictions USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_plume_predictions_ts
        ON plume_predictions(prediction_ts DESC);

------------------------------------------------------------------------
-- 6. Vector embeddings for Spatial-Aware RAG (moved to migration 002)
------------------------------------------------------------------------
-- Knowledge embeddings table and functions are now defined in 002_prescribed_fire_platform.sql
-- with enhanced contextual metadata and fire-specific features

------------------------------------------------------------------------
-- 7. Useful spatial functions for the application
------------------------------------------------------------------------

-- Function to get sensor data within bounding box
CREATE OR REPLACE FUNCTION get_sensor_data_in_bounds(
    min_lat REAL,
    max_lat REAL, 
    min_lng REAL,
    max_lng REAL
) RETURNS TABLE (
    id BIGINT,
    sensor_uuid UUID,
    ts TIMESTAMPTZ,
    latitude REAL,
    longitude REAL,
    altitude_m REAL,
    pm25_ug_m3 REAL,
    pm10_ug_m3 REAL,
    temperature_c REAL,
    rh_percent REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.sensor_uuid,
        p.ts,
        ST_Y(p.location::geometry) as latitude,
        ST_X(p.location::geometry) as longitude,
        p.altitude_m,
        p.pm25_ug_m3,
        p.pm10_ug_m3,
        p.temperature_c,
        p.rh_percent
    FROM pi_sensor_raw p
    WHERE ST_Within(
        p.location::geometry, 
        ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
    )
    ORDER BY p.ts DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get fires near sensor locations
CREATE OR REPLACE FUNCTION get_fires_near_sensors(radius_km REAL DEFAULT 50) 
RETURNS TABLE (
    fire_id BIGINT,
    sensor_id BIGINT,
    distance_km REAL,
    fire_location GEOGRAPHY,
    sensor_location GEOGRAPHY,
    fire_frp_mw REAL,
    fire_confidence TEXT,
    fire_time TIMESTAMPTZ,
    sensor_time TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        f.id as fire_id,
        s.id as sensor_id,
        ST_Distance(f.location, s.location) / 1000 as distance_km,
        f.location as fire_location,
        s.location as sensor_location,
        f.frp_mw as fire_frp_mw,
        f.confidence as fire_confidence,
        f.acquisition_ts as fire_time,
        s.ts as sensor_time
    FROM fire_detections f
    CROSS JOIN pi_sensor_raw s
    WHERE ST_DWithin(f.location, s.location, radius_km * 1000)
    AND f.acquisition_ts >= NOW() - INTERVAL '24 hours'
    AND s.ts >= NOW() - INTERVAL '24 hours'
    ORDER BY distance_km ASC;
END;
$$ LANGUAGE plpgsql;

------------------------------------------------------------------------
-- 8. Row Level Security (RLS) policies
------------------------------------------------------------------------

-- Enable RLS on sensitive tables
ALTER TABLE pi_sensor_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE plume_predictions ENABLE ROW LEVEL SECURITY;

-- Allow public read access to sensor data (for research transparency)
CREATE POLICY "Public read access" ON pi_sensor_raw
    FOR SELECT USING (true);

-- Allow public read access to predictions
CREATE POLICY "Public read access" ON plume_predictions
    FOR SELECT USING (true);

-- Only authenticated users can insert sensor data
CREATE POLICY "Authenticated insert" ON pi_sensor_raw
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Only authenticated users can insert predictions
CREATE POLICY "Authenticated insert" ON plume_predictions
    FOR INSERT WITH CHECK (auth.role() = 'authenticated'); 