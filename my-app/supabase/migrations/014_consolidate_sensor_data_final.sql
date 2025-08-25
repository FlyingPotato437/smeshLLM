-- Migration 014: Consolidate All Sensor Data into Unified Table (Final)
-- This migration consolidates 4 redundant sensor tables into the unified sensor_readings table
-- Fixed PostgreSQL syntax issues

-- ============================================================================
-- 1. DROP EXISTING VIEWS FIRST
-- ============================================================================

DROP VIEW IF EXISTS latest_air_quality CASCADE;
DROP VIEW IF EXISTS latest_device_metrics CASCADE;
DROP VIEW IF EXISTS latest_environmental_data CASCADE;

-- ============================================================================
-- 2. DATA MIGRATION - CONSOLIDATE ALL SENSOR DATA
-- ============================================================================

-- Insert data from uploaded_data (formerly pi_sensor_raw) into unified table
INSERT INTO sensor_readings (
    device_id,
    timestamp,
    location,
    source,
    pm25_ugm3,
    pm10_ugm3,
    temperature_c,
    humidity_pct,
    metadata,
    created_at
)
SELECT 
    'pi_' || sensor_uuid::text as device_id,
    ts as timestamp,
    location,
    'pi_batch'::sensor_source as source,
    pm25_ug_m3 as pm25_ugm3,
    pm10_ug_m3 as pm10_ugm3,
    temperature_c,
    rh_percent as humidity_pct,
    jsonb_build_object(
        'original_table', 'uploaded_data',
        'sensor_uuid', sensor_uuid,
        'altitude_m', altitude_m
    ) as metadata,
    created_at
FROM uploaded_data
WHERE NOT EXISTS (
    SELECT 1 FROM sensor_readings sr 
    WHERE sr.device_id = 'pi_' || uploaded_data.sensor_uuid::text 
    AND sr.timestamp = uploaded_data.ts
)
ON CONFLICT (device_id, timestamp) DO NOTHING;

-- Insert data from meshtastic_telemetry into unified table
INSERT INTO sensor_readings (
    device_id,
    timestamp,
    location,
    source,
    pm25_ugm3,
    pm10_ugm3,
    temperature_c,
    humidity_pct,
    pressure_pa,
    metadata,
    created_at
)
SELECT 
    'mesh_' || sensor_id as device_id,
    timestamp,
    location::geography as location,
    'meshtastic_stream'::sensor_source as source,
    pm25_ugm3,
    pm10_ugm3,
    temperature_c,
    relative_humidity_pct as humidity_pct,
    CASE 
        WHEN barometric_pressure IS NOT NULL 
        THEN barometric_pressure * 100 
        ELSE NULL 
    END as pressure_pa, -- Convert hPa to Pa
    jsonb_build_object(
        'original_table', 'meshtastic_telemetry',
        'telemetry_type', telemetry_type,
        'voltage', voltage,
        'battery_level', battery_level,
        'air_util_tx', air_util_tx,
        'uptime_seconds', uptime_seconds,
        'channel_utilization', channel_utilization,
        'gas_resistance', gas_resistance,
        'iaq', iaq,
        'wind_direction', wind_direction,
        'wind_speed', wind_speed,
        'pm100_ugm3', pm100_ugm3
    ) as metadata,
    created_at
FROM meshtastic_telemetry
WHERE NOT EXISTS (
    SELECT 1 FROM sensor_readings sr 
    WHERE sr.device_id = 'mesh_' || meshtastic_telemetry.sensor_id 
    AND sr.timestamp = meshtastic_telemetry.timestamp
)
ON CONFLICT (device_id, timestamp) DO NOTHING;

-- Insert data from pi_sensor_readings into unified table (if any exists and table exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pi_sensor_readings') THEN
        INSERT INTO sensor_readings (
            device_id,
            timestamp,
            location,
            source,
            pm25_ugm3,
            pm10_ugm3,
            pm1_ugm3,
            temperature_c,
            humidity_pct,
            pressure_pa,
            metadata,
            created_at
        )
        SELECT 
            sensor_id as device_id,
            timestamp,
            location::geography as location,
            'pi_batch'::sensor_source as source,
            pm25_ugm3,
            pm10_ugm3,
            pm1_ugm3,
            temperature_c,
            relative_humidity_pct as humidity_pct,
            pressure_pa,
            jsonb_build_object(
                'original_table', 'pi_sensor_readings',
                'wind_speed_ms', wind_speed_ms,
                'wind_direction_deg', wind_direction_deg,
                'co_ppm', co_ppm,
                'co2_ppm', co2_ppm,
                'visibility_m', visibility_m,
                'light_intensity_lux', light_intensity_lux,
                'data_quality_score', data_quality_score,
                'calibration_offset', calibration_offset,
                'raw_data', raw_data
            ) as metadata,
            NOW() as created_at
        FROM pi_sensor_readings
        WHERE NOT EXISTS (
            SELECT 1 FROM sensor_readings sr 
            WHERE sr.device_id = pi_sensor_readings.sensor_id 
            AND sr.timestamp = pi_sensor_readings.timestamp
        )
        ON CONFLICT (device_id, timestamp) DO NOTHING;
    END IF;
END $$;

-- ============================================================================
-- 3. RECREATE VIEWS TO USE UNIFIED TABLE
-- ============================================================================

-- Create latest_air_quality view using unified sensor_readings table
CREATE VIEW latest_air_quality AS
SELECT DISTINCT ON (device_id)
    device_id,
    source,
    timestamp,
    location,
    pm25_ugm3,
    pm10_ugm3,
    pm1_ugm3,
    temperature_c,
    humidity_pct
FROM sensor_readings
WHERE timestamp > NOW() - INTERVAL '24 hours'
  AND (pm25_ugm3 IS NOT NULL OR pm10_ugm3 IS NOT NULL)
ORDER BY device_id, timestamp DESC;

-- Create latest_device_metrics view using unified sensor_readings table  
CREATE VIEW latest_device_metrics AS
SELECT DISTINCT ON (device_id)
    device_id,
    source,
    timestamp,
    location,
    CASE 
        WHEN metadata ? 'battery_level' THEN (metadata->>'battery_level')::integer
        ELSE NULL 
    END as battery_level,
    CASE 
        WHEN metadata ? 'voltage' THEN (metadata->>'voltage')::real
        ELSE NULL 
    END as voltage
FROM sensor_readings
WHERE timestamp > NOW() - INTERVAL '24 hours'
ORDER BY device_id, timestamp DESC;

-- Create latest_environmental_data view using unified sensor_readings table
CREATE VIEW latest_environmental_data AS
SELECT DISTINCT ON (device_id)
    device_id,
    source,
    timestamp,
    location,
    temperature_c,
    humidity_pct,
    pressure_pa,
    CASE 
        WHEN metadata ? 'wind_speed' THEN (metadata->>'wind_speed')::real
        WHEN metadata ? 'wind_speed_ms' THEN (metadata->>'wind_speed_ms')::real
        ELSE NULL 
    END as wind_speed,
    CASE 
        WHEN metadata ? 'wind_direction' THEN (metadata->>'wind_direction')::real
        WHEN metadata ? 'wind_direction_deg' THEN (metadata->>'wind_direction_deg')::real
        ELSE NULL 
    END as wind_direction
FROM sensor_readings
WHERE timestamp > NOW() - INTERVAL '24 hours'
  AND (temperature_c IS NOT NULL OR humidity_pct IS NOT NULL OR pressure_pa IS NOT NULL)
ORDER BY device_id, timestamp DESC;

-- ============================================================================
-- 4. ADD PERFORMANCE INDEXES FOR UNIFIED TABLE
-- ============================================================================

-- Index for latest data queries (most common pattern)
CREATE INDEX IF NOT EXISTS idx_sensor_readings_latest 
ON sensor_readings (device_id, timestamp DESC);

-- Index for source-based queries (pi_batch vs meshtastic_stream)
CREATE INDEX IF NOT EXISTS idx_sensor_readings_source_time 
ON sensor_readings (source, timestamp DESC);

-- Spatial index for location-based queries (atmospheric modeling)
CREATE INDEX IF NOT EXISTS idx_sensor_readings_spatial_time 
ON sensor_readings USING GIST (location, timestamp);

-- Index for air quality queries
CREATE INDEX IF NOT EXISTS idx_sensor_readings_pm25_time 
ON sensor_readings (pm25_ugm3, timestamp DESC) 
WHERE pm25_ugm3 IS NOT NULL;

-- JSONB GIN index for metadata queries
CREATE INDEX IF NOT EXISTS idx_sensor_readings_metadata_gin 
ON sensor_readings USING GIN (metadata);

-- ============================================================================
-- 5. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE sensor_readings IS 'Unified sensor data table consolidating all sources: Pi batch uploads, Meshtastic live streams, and future OpenAQ integration. Optimized for atmospheric modeling with TimescaleDB and PostGIS.';
COMMENT ON COLUMN sensor_readings.source IS 'Data source: pi_batch (uploaded historical data), meshtastic_stream (live telemetry), future: openaq (external API data)';
COMMENT ON COLUMN sensor_readings.device_id IS 'Unique device identifier: pi_{uuid} for Pi sensors, mesh_{sensor_id} for Meshtastic, openaq_{station_id} for OpenAQ';
COMMENT ON COLUMN sensor_readings.metadata IS 'JSONB field storing source-specific data that does not fit in common columns. Enables flexible schema evolution.';

-- ============================================================================
-- 6. VERIFICATION QUERIES (SIMPLIFIED)
-- ============================================================================

-- Report basic migration results
DO $$
DECLARE
    unified_count INTEGER;
    uploaded_count INTEGER;
    meshtastic_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO unified_count FROM sensor_readings;
    SELECT COUNT(*) INTO uploaded_count FROM uploaded_data;
    SELECT COUNT(*) INTO meshtastic_count FROM meshtastic_telemetry;
    
    RAISE NOTICE 'SENSOR DATA CONSOLIDATION COMPLETED:';
    RAISE NOTICE 'Unified sensor_readings table now has % total records', unified_count;
    RAISE NOTICE 'Original uploaded_data had % records', uploaded_count;
    RAISE NOTICE 'Original meshtastic_telemetry had % records', meshtastic_count;
END $$;