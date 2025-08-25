-- Migration 010: Create Unified Sensor Readings Table (Final)
-- Fixed TimescaleDB hypertable constraints

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
-- 2. DROP ANY EXISTING PROBLEMATIC INDEXES
-- ============================================================================

DROP INDEX IF EXISTS idx_sensor_readings_location;
DROP INDEX IF EXISTS idx_sensor_readings_pm25;
DROP INDEX IF EXISTS idx_sensor_readings_quality;
DROP INDEX IF EXISTS idx_sensor_readings_source;
DROP INDEX IF EXISTS idx_sensor_readings_id;

-- ============================================================================
-- 3. CREATE UNIFIED SENSOR READINGS TABLE (IF NOT EXISTS)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'sensor_readings' AND table_schema = 'public') THEN
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
    END IF;
END $$;

-- ============================================================================
-- 4. CONVERT TO TIMESCALEDB HYPERTABLE (IF NOT ALREADY)
-- ============================================================================

DO $$
BEGIN
    -- Check if it's already a hypertable
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables 
        WHERE hypertable_name = 'sensor_readings'
    ) THEN
        -- Convert to hypertable with time partitioning on timestamp and space partitioning on device_id
        PERFORM create_hypertable('sensor_readings', 'timestamp', 'device_id', 4);
    END IF;
END $$;

-- ============================================================================
-- 5. CREATE PERFORMANCE INDEXES (COMPATIBLE WITH HYPERTABLES)
-- ============================================================================

-- Source filtering (for LLM queries: "uploaded" vs "live")
CREATE INDEX IF NOT EXISTS idx_sensor_readings_source ON sensor_readings(source);

-- Geospatial queries using GIST index for GEOGRAPHY type
CREATE INDEX IF NOT EXISTS idx_sensor_readings_location ON sensor_readings USING GIST(location);

-- UUID lookup - must include timestamp for hypertable compatibility
CREATE INDEX IF NOT EXISTS idx_sensor_readings_id_timestamp ON sensor_readings (id, timestamp);

-- Core air quality metrics for fast filtering
CREATE INDEX IF NOT EXISTS idx_sensor_readings_pm25 ON sensor_readings(pm25_ugm3);

-- Composite index for common LLM queries (source + timestamp)
CREATE INDEX IF NOT EXISTS idx_sensor_readings_source_timestamp ON sensor_readings(source, timestamp);

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS for security
ALTER TABLE sensor_readings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public read access" ON sensor_readings;
DROP POLICY IF EXISTS "Authenticated insert" ON sensor_readings;

-- Public read access for research transparency
CREATE POLICY "Public read access" ON sensor_readings
    FOR SELECT USING (true);

-- Authenticated insert only
CREATE POLICY "Authenticated insert" ON sensor_readings
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

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