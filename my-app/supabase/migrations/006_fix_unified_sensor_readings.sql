-- Migration 006: Fix Unified Sensor Readings Table
-- Handle existing sensor_readings table and create our unified schema

-- ============================================================================
-- 1. CREATE ENUM TYPE FOR DATA SOURCES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'sensor_source') THEN
        CREATE TYPE sensor_source AS ENUM ('pi_batch', 'meshtastic_stream');
    END IF;
END $$;

-- ============================================================================
-- 2. CHECK AND HANDLE EXISTING SENSOR_READINGS TABLE
-- ============================================================================

-- Check if the table has data we need to preserve
DO $$
DECLARE
    record_count INTEGER;
BEGIN
    -- Count existing records
    SELECT COUNT(*) INTO record_count FROM sensor_readings;
    
    IF record_count > 0 THEN
        -- If data exists, backup the table
        DROP TABLE IF EXISTS sensor_readings_backup;
        CREATE TABLE sensor_readings_backup AS SELECT * FROM sensor_readings;
        RAISE NOTICE 'Backed up % records to sensor_readings_backup', record_count;
    END IF;
    
    -- Drop the existing table
    DROP TABLE IF EXISTS sensor_readings CASCADE;
    
    RAISE NOTICE 'Dropped existing sensor_readings table';
END $$;

-- ============================================================================
-- 3. CREATE NEW UNIFIED SENSOR READINGS TABLE
-- ============================================================================

CREATE TABLE sensor_readings (
    id UUID NOT NULL DEFAULT gen_random_uuid(),
    device_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    location GEOGRAPHY(POINT, 4326),
    source sensor_source NOT NULL,
    
    -- Core air quality metrics (common across sources)
    pm25_ugm3 REAL,
    pm10_ugm3 REAL,
    pm1_ugm3 REAL,
    temperature_c REAL,
    humidity_pct REAL,
    
    -- Common environmental
    pressure_pa REAL,
    
    -- Variable/source-specific data stored as JSONB
    metadata JSONB DEFAULT '{}',
    
    -- Housekeeping
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- TimescaleDB requires primary key to include time-partitioning column
    PRIMARY KEY (device_id, timestamp)
);

-- ============================================================================
-- 4. CONVERT TO TIMESCALEDB HYPERTABLE WITH SPACE PARTITIONING
-- ============================================================================

-- Convert to hypertable with time partitioning on timestamp and space partitioning on device_id
SELECT create_hypertable('sensor_readings', 'timestamp', 'device_id', 4);

-- ============================================================================
-- 5. CREATE PERFORMANCE INDEXES
-- ============================================================================

-- Source filtering (for LLM queries: "uploaded" vs "live")
CREATE INDEX idx_sensor_readings_source ON sensor_readings(source);

-- Geospatial queries using GIST index for GEOGRAPHY type
CREATE INDEX idx_sensor_readings_location ON sensor_readings USING GIST(location);

-- UUID lookup for unique record access
CREATE UNIQUE INDEX idx_sensor_readings_id ON sensor_readings (id);

-- Core air quality metrics for fast filtering
CREATE INDEX idx_sensor_readings_pm25 ON sensor_readings(pm25_ugm3);

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS for security
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

-- Public read access for research transparency
CREATE POLICY "Public read access" ON sensor_readings
    FOR SELECT USING (true);

-- Authenticated insert only
CREATE POLICY "Authenticated insert" ON sensor_readings
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- ============================================================================
-- 7. VALIDATION FUNCTION FOR PHASE 2
-- ============================================================================

-- Function to compare old vs new records with appropriate tolerances
CREATE OR REPLACE FUNCTION validate_sensor_migration(
    check_device_id TEXT,
    check_timestamp TIMESTAMPTZ,
    check_source sensor_source
) RETURNS TABLE (
    is_valid BOOLEAN,
    validation_issues TEXT[]
) LANGUAGE plpgsql AS $$
DECLARE
    new_record sensor_readings%ROWTYPE;
    old_pi_record pi_sensor_raw%ROWTYPE;
    old_mesh_record meshtastic_telemetry%ROWTYPE;
    issues TEXT[] := '{}';
    float_tolerance REAL := 0.001;
    location_tolerance REAL := 1.0; -- meters
BEGIN
    -- Get the new record
    SELECT * INTO new_record 
    FROM sensor_readings 
    WHERE device_id = check_device_id AND timestamp = check_timestamp;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT false, ARRAY['New record not found'];
        RETURN;
    END IF;
    
    -- Compare based on source
    IF check_source = 'pi_batch' THEN
        -- Get corresponding pi_sensor_raw record
        SELECT * INTO old_pi_record 
        FROM pi_sensor_raw 
        WHERE ('pi_' || sensor_uuid::text) = check_device_id AND ts = check_timestamp;
        
        IF NOT FOUND THEN
            issues := issues || 'Old pi_sensor_raw record not found';
        ELSE
            -- Validate PM2.5 within tolerance
            IF ABS(COALESCE(new_record.pm25_ugm3, 0) - COALESCE(old_pi_record.pm25_ug_m3, 0)) > float_tolerance THEN
                issues := issues || 'PM2.5 values differ beyond tolerance';
            END IF;
            
            -- Validate PM10 within tolerance
            IF ABS(COALESCE(new_record.pm10_ugm3, 0) - COALESCE(old_pi_record.pm10_ug_m3, 0)) > float_tolerance THEN
                issues := issues || 'PM10 values differ beyond tolerance';
            END IF;
            
            -- Validate temperature within tolerance
            IF ABS(COALESCE(new_record.temperature_c, 0) - COALESCE(old_pi_record.temperature_c, 0)) > float_tolerance THEN
                issues := issues || 'Temperature values differ beyond tolerance';
            END IF;
            
            -- Validate humidity within tolerance
            IF ABS(COALESCE(new_record.humidity_pct, 0) - COALESCE(old_pi_record.rh_percent, 0)) > float_tolerance THEN
                issues := issues || 'Humidity values differ beyond tolerance';
            END IF;
            
            -- Validate location within tolerance (if both exist)
            IF new_record.location IS NOT NULL AND old_pi_record.location IS NOT NULL THEN
                IF ST_Distance(new_record.location, old_pi_record.location::geography) > location_tolerance THEN
                    issues := issues || 'Location differs beyond tolerance';
                END IF;
            ELSIF (new_record.location IS NULL) != (old_pi_record.location IS NULL) THEN
                issues := issues || 'Location null status differs';
            END IF;
        END IF;
        
    ELSIF check_source = 'meshtastic_stream' THEN
        -- Get corresponding meshtastic_telemetry record
        SELECT * INTO old_mesh_record 
        FROM meshtastic_telemetry 
        WHERE ('mesh_' || sensor_id) = check_device_id AND timestamp = check_timestamp;
        
        IF NOT FOUND THEN
            issues := issues || 'Old meshtastic_telemetry record not found';
        ELSE
            -- Similar validation for meshtastic data
            IF ABS(COALESCE(new_record.pm25_ugm3, 0) - COALESCE(old_mesh_record.pm25_ugm3, 0)) > float_tolerance THEN
                issues := issues || 'PM2.5 values differ beyond tolerance';
            END IF;
        END IF;
    END IF;
    
    -- Return validation result
    RETURN QUERY SELECT (array_length(issues, 1) IS NULL OR array_length(issues, 1) = 0), issues;
END;
$$;

-- ============================================================================
-- 8. HELPER FUNCTIONS FOR DATA TRANSFORMATION
-- ============================================================================

-- Function to safely create geography point from lat/lon
CREATE OR REPLACE FUNCTION safe_make_geography_point(longitude REAL, latitude REAL)
RETURNS GEOGRAPHY AS $$
BEGIN
    IF longitude IS NULL OR latitude IS NULL OR 
       longitude < -180 OR longitude > 180 OR 
       latitude < -90 OR latitude > 90 THEN
        RETURN NULL;
    END IF;
    
    RETURN ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography;
EXCEPTION
    WHEN OTHERS THEN
        RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 9. MONITORING VIEW FOR DUAL-WRITE TRACKING
-- ============================================================================

-- Create enhanced monitoring view to track dual-write progress with replication lag
CREATE OR REPLACE VIEW dual_write_monitor AS
SELECT 
    'Dual-Write Status' as metric,
    NOW() as check_time,
    
    -- Count from old tables (last hour)
    (SELECT COUNT(*) FROM pi_sensor_raw WHERE created_at > NOW() - INTERVAL '1 hour') as pi_raw_recent,
    (SELECT COUNT(*) FROM meshtastic_telemetry WHERE timestamp > NOW() - INTERVAL '1 hour') as mesh_recent,
    
    -- Count from new table (last hour)
    (SELECT COUNT(*) FROM sensor_readings WHERE created_at > NOW() - INTERVAL '1 hour') as unified_recent,
    (SELECT COUNT(*) FROM sensor_readings WHERE source = 'pi_batch' AND created_at > NOW() - INTERVAL '1 hour') as unified_pi,
    (SELECT COUNT(*) FROM sensor_readings WHERE source = 'meshtastic_stream' AND created_at > NOW() - INTERVAL '1 hour') as unified_mesh,
    
    -- Critical: Replication lag detection
    (SELECT MAX(ts) FROM pi_sensor_raw) - (SELECT MAX(timestamp) FROM sensor_readings WHERE source = 'pi_batch') as pi_replication_lag,
    (SELECT MAX(timestamp) FROM meshtastic_telemetry) - (SELECT MAX(timestamp) FROM sensor_readings WHERE source = 'meshtastic_stream') as mesh_replication_lag,
    
    -- Overall health indicators
    CASE 
        WHEN (SELECT COUNT(*) FROM sensor_readings WHERE created_at > NOW() - INTERVAL '10 minutes') > 0 
        THEN 'HEALTHY' 
        ELSE 'STALE' 
    END as unified_table_status;

-- ============================================================================
-- 10. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE sensor_readings IS 'Unified sensor data table consolidating pi_sensor_raw and meshtastic_telemetry with TimescaleDB optimization';
COMMENT ON COLUMN sensor_readings.source IS 'Data source: pi_batch for Raspberry Pi uploads, meshtastic_stream for live Meshtastic data';
COMMENT ON COLUMN sensor_readings.metadata IS 'JSONB field for source-specific data that does not fit in common columns';
COMMENT ON COLUMN sensor_readings.device_id IS 'Unique device identifier: pi_{uuid} for Pi sensors, mesh_{sensor_id} for Meshtastic';
COMMENT ON FUNCTION validate_sensor_migration IS 'Validates migrated data by comparing old and new records with appropriate tolerances';