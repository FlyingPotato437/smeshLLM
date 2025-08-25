-- Migration 005: Unified Sensor Readings Table
-- Strategic migration to consolidate pi_sensor_raw and meshtastic_telemetry
-- into a single, performance-optimized sensor_readings table with TimescaleDB

-- ============================================================================
-- 1. CREATE ENUM TYPE FOR DATA SOURCES
-- ============================================================================

CREATE TYPE sensor_source AS ENUM ('pi_batch', 'meshtastic_stream');

-- ============================================================================
-- 2. CREATE UNIFIED SENSOR READINGS TABLE
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
-- 3. CONVERT TO TIMESCALEDB HYPERTABLE WITH SPACE PARTITIONING
-- ============================================================================

-- Convert to hypertable with time partitioning on timestamp and space partitioning on device_id
SELECT create_hypertable('sensor_readings', 'timestamp', 'device_id', 4);

-- ============================================================================
-- 4. CREATE PERFORMANCE INDEXES
-- ============================================================================

-- Source filtering (for LLM queries: "uploaded" vs "live")
CREATE INDEX idx_sensor_readings_source ON sensor_readings(source);

-- Geospatial queries using GIST index for GEOGRAPHY type
CREATE INDEX idx_sensor_readings_location ON sensor_readings USING GIST(location);

-- UUID lookup for unique record access
CREATE UNIQUE INDEX idx_sensor_readings_id ON sensor_readings (id);

-- Core air quality metrics for fast filtering
CREATE INDEX idx_sensor_readings_pm25 ON sensor_readings(pm25_ugm3);

-- JSONB content indexing (deferred to Phase 3 based on actual query patterns)
-- CREATE INDEX idx_sensor_readings_metadata ON sensor_readings USING GIN(metadata);

-- ============================================================================
-- 5. ROW LEVEL SECURITY
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
-- 6. VALIDATION FUNCTION FOR PHASE 2
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
            -- Validate PM2.5 within tolerance
            IF ABS(COALESCE(new_record.pm25_ugm3, 0) - COALESCE(old_mesh_record.pm25_ugm3, 0)) > float_tolerance THEN
                issues := issues || 'PM2.5 values differ beyond tolerance';
            END IF;
            
            -- Validate PM10 within tolerance
            IF ABS(COALESCE(new_record.pm10_ugm3, 0) - COALESCE(old_mesh_record.pm10_ugm3, 0)) > float_tolerance THEN
                issues := issues || 'PM10 values differ beyond tolerance';
            END IF;
            
            -- Validate temperature within tolerance
            IF ABS(COALESCE(new_record.temperature_c, 0) - COALESCE(old_mesh_record.temperature_c, 0)) > float_tolerance THEN
                issues := issues || 'Temperature values differ beyond tolerance';
            END IF;
            
            -- Validate humidity within tolerance
            IF ABS(COALESCE(new_record.humidity_pct, 0) - COALESCE(old_mesh_record.relative_humidity_pct, 0)) > float_tolerance THEN
                issues := issues || 'Humidity values differ beyond tolerance';
            END IF;
            
            -- Validate pressure within tolerance (convert from hPa to Pa if needed)
            IF ABS(COALESCE(new_record.pressure_pa, 0) - COALESCE(old_mesh_record.barometric_pressure, 0)) > float_tolerance THEN
                issues := issues || 'Pressure values differ beyond tolerance';
            END IF;
            
            -- Validate location within tolerance (if both exist)
            IF new_record.location IS NOT NULL AND old_mesh_record.location IS NOT NULL THEN
                IF ST_Distance(new_record.location, old_mesh_record.location::geography) > location_tolerance THEN
                    issues := issues || 'Location differs beyond tolerance';
                END IF;
            ELSIF (new_record.location IS NULL) != (old_mesh_record.location IS NULL) THEN
                issues := issues || 'Location null status differs';
            END IF;
        END IF;
    END IF;
    
    -- Return validation result
    RETURN QUERY SELECT (array_length(issues, 1) IS NULL OR array_length(issues, 1) = 0), issues;
END;
$$;

-- ============================================================================
-- 7. HELPER FUNCTIONS FOR DATA TRANSFORMATION
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
-- 8. COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE sensor_readings IS 'Unified sensor data table consolidating pi_sensor_raw and meshtastic_telemetry with TimescaleDB optimization';
COMMENT ON COLUMN sensor_readings.source IS 'Data source: pi_batch for Raspberry Pi uploads, meshtastic_stream for live Meshtastic data';
COMMENT ON COLUMN sensor_readings.metadata IS 'JSONB field for source-specific data that does not fit in common columns';
COMMENT ON COLUMN sensor_readings.device_id IS 'Unique device identifier: pi_{uuid} for Pi sensors, mesh_{sensor_id} for Meshtastic';
COMMENT ON FUNCTION validate_sensor_migration IS 'Validates migrated data by comparing old and new records with appropriate tolerances';