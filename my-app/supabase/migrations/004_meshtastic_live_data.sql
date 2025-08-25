-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ============================================================================
-- MESHTASTIC LIVE TELEMETRY TABLES (NEW)
-- ============================================================================

-- Live Meshtastic telemetry data (optimized for real-time ingestion)
CREATE TABLE meshtastic_telemetry (
    id BIGSERIAL,
    sensor_id TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    telemetry_type TEXT NOT NULL CHECK (telemetry_type IN ('device', 'environment', 'air_quality', 'power')),
    
    -- Location (can be device location or default)
    location GEOMETRY(POINT, 4326),
    
    -- Device metrics (voltage, battery, radio stats)
    voltage REAL,
    battery_level INTEGER,
    air_util_tx REAL,
    uptime_seconds INTEGER,
    channel_utilization REAL,
    
    -- Environmental metrics
    temperature_c REAL,
    relative_humidity_pct REAL,
    barometric_pressure REAL,
    gas_resistance REAL,
    iaq REAL,
    wind_direction REAL,
    wind_speed REAL,
    
    -- Air quality metrics
    pm25_ugm3 REAL,
    pm10_ugm3 REAL,
    pm100_ugm3 REAL,
    pm1_ugm3 REAL,
    
    -- Power metrics
    ch3_voltage REAL,
    ch3_current REAL,
    
    -- Radio signal metrics
    rssi REAL,
    snr REAL,
    hop_limit INTEGER,
    hop_start INTEGER,
    
    -- Raw data for debugging/analysis
    raw_data JSONB,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Convert to hypertable for time-series performance
SELECT create_hypertable('meshtastic_telemetry', 'timestamp', if_not_exists => TRUE);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_meshtastic_telemetry_sensor_id 
    ON meshtastic_telemetry(sensor_id);
CREATE INDEX IF NOT EXISTS idx_meshtastic_telemetry_type 
    ON meshtastic_telemetry(telemetry_type);
CREATE INDEX IF NOT EXISTS idx_meshtastic_telemetry_location 
    ON meshtastic_telemetry USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_meshtastic_telemetry_timestamp 
    ON meshtastic_telemetry(timestamp DESC);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_meshtastic_telemetry_sensor_time 
    ON meshtastic_telemetry(sensor_id, timestamp DESC);

-- Node registry (tracks active Meshtastic nodes)
CREATE TABLE IF NOT EXISTS meshtastic_nodes (
    node_id TEXT PRIMARY KEY,
    short_name TEXT,
    long_name TEXT,
    hardware_model TEXT,
    firmware_version TEXT,
    region TEXT,
    modem_preset TEXT,
    
    -- Last seen info
    last_seen_at TIMESTAMPTZ,
    last_location GEOMETRY(POINT, 4326),
    
    -- Node capabilities
    has_environmental_sensor BOOLEAN DEFAULT FALSE,
    has_air_quality_sensor BOOLEAN DEFAULT FALSE,
    has_power_sensor BOOLEAN DEFAULT FALSE,
    
    -- Activity stats
    total_packets_received INTEGER DEFAULT 0,
    total_telemetry_packets INTEGER DEFAULT 0,
    
    -- Metadata
    first_seen_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update trigger for nodes table
CREATE OR REPLACE FUNCTION update_meshtastic_nodes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER meshtastic_nodes_updated_at_trigger
    BEFORE UPDATE ON meshtastic_nodes
    FOR EACH ROW
    EXECUTE FUNCTION update_meshtastic_nodes_updated_at();

-- Function to update node registry when telemetry is received
CREATE OR REPLACE FUNCTION update_node_registry()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO meshtastic_nodes (
        node_id, 
        last_seen_at, 
        last_location,
        total_packets_received,
        total_telemetry_packets,
        has_environmental_sensor,
        has_air_quality_sensor,
        has_power_sensor
    ) VALUES (
        NEW.sensor_id,
        NEW.timestamp,
        NEW.location,
        1,
        1,
        (NEW.telemetry_type = 'environment'),
        (NEW.telemetry_type = 'air_quality'),
        (NEW.telemetry_type = 'power')
    )
    ON CONFLICT (node_id) DO UPDATE SET
        last_seen_at = NEW.timestamp,
        last_location = COALESCE(NEW.location, meshtastic_nodes.last_location),
        total_packets_received = meshtastic_nodes.total_packets_received + 1,
        total_telemetry_packets = meshtastic_nodes.total_telemetry_packets + 1,
        has_environmental_sensor = meshtastic_nodes.has_environmental_sensor OR (NEW.telemetry_type = 'environment'),
        has_air_quality_sensor = meshtastic_nodes.has_air_quality_sensor OR (NEW.telemetry_type = 'air_quality'),
        has_power_sensor = meshtastic_nodes.has_power_sensor OR (NEW.telemetry_type = 'power');
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update node registry
CREATE TRIGGER meshtastic_telemetry_node_registry_trigger
    AFTER INSERT ON meshtastic_telemetry
    FOR EACH ROW
    EXECUTE FUNCTION update_node_registry();

-- Views for common queries
CREATE OR REPLACE VIEW latest_device_metrics AS
SELECT DISTINCT ON (sensor_id)
    sensor_id,
    timestamp,
    voltage,
    battery_level,
    air_util_tx,
    uptime_seconds,
    rssi,
    snr
FROM meshtastic_telemetry
WHERE telemetry_type = 'device'
ORDER BY sensor_id, timestamp DESC;

CREATE OR REPLACE VIEW latest_environmental_data AS
SELECT DISTINCT ON (sensor_id)
    sensor_id,
    timestamp,
    temperature_c,
    relative_humidity_pct,
    barometric_pressure,
    wind_speed,
    wind_direction
FROM meshtastic_telemetry
WHERE telemetry_type = 'environment'
ORDER BY sensor_id, timestamp DESC;

CREATE OR REPLACE VIEW latest_air_quality AS
SELECT DISTINCT ON (sensor_id)
    sensor_id,
    timestamp,
    pm25_ugm3,
    pm10_ugm3,
    pm100_ugm3,
    pm1_ugm3
FROM meshtastic_telemetry
WHERE telemetry_type = 'air_quality'
ORDER BY sensor_id, timestamp DESC;

-- Function to clean old telemetry data (retention policy)
CREATE OR REPLACE FUNCTION cleanup_old_telemetry(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM meshtastic_telemetry 
    WHERE timestamp < NOW() - INTERVAL '1 day' * retention_days;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions for application access
GRANT SELECT, INSERT, UPDATE ON meshtastic_telemetry TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON meshtastic_nodes TO anon, authenticated;
GRANT SELECT ON latest_device_metrics, latest_environmental_data, latest_air_quality TO anon, authenticated;

-- RLS policies for security
ALTER TABLE meshtastic_telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE meshtastic_nodes ENABLE ROW LEVEL SECURITY;

-- Allow all operations for service role, read for authenticated users
CREATE POLICY "Allow service role full access" ON meshtastic_telemetry
    FOR ALL TO service_role;

CREATE POLICY "Allow authenticated read access" ON meshtastic_telemetry
    FOR SELECT TO authenticated;

CREATE POLICY "Allow anon read access for recent data" ON meshtastic_telemetry
    FOR SELECT TO anon
    USING (timestamp > NOW() - INTERVAL '24 hours');

CREATE POLICY "Allow service role full access" ON meshtastic_nodes
    FOR ALL TO service_role;

CREATE POLICY "Allow authenticated read access" ON meshtastic_nodes
    FOR SELECT TO authenticated;

CREATE POLICY "Allow anon read access" ON meshtastic_nodes
    FOR SELECT TO anon; 