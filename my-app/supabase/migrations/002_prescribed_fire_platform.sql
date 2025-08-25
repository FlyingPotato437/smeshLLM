-- supabase/migrations/002_prescribed_fire_platform.sql
-- Comprehensive schema for Generative Physics-Informed Prescribed-Fire Platform
-- Implements PostGIS, TimescaleDB, and pgvector for spatio-temporal data

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
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Custom types for domain-specific data
CREATE TYPE fire_confidence_level AS ENUM ('low', 'nominal', 'high');
CREATE TYPE sensor_status AS ENUM ('active', 'inactive', 'maintenance', 'error');
CREATE TYPE prediction_model AS ENUM ('hysplit', 'transformer', 'diffusion', 'hybrid');
CREATE TYPE prescribed_burn_phase AS ENUM ('planning', 'ignition', 'active', 'mop_up', 'patrol', 'out');

-- ============================================================================
-- 1. RASPBERRY PI SENSOR NETWORK TABLES
-- ============================================================================

-- Raspberry Pi sensor pods (static metadata)
CREATE TABLE raspberry_pi_sensors (
    sensor_id TEXT PRIMARY KEY,
    deployment_name TEXT NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    elevation_m REAL,
    installation_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_maintenance TIMESTAMPTZ,
    status sensor_status NOT NULL DEFAULT 'active',
    hardware_version TEXT,
    firmware_version TEXT,
    communication_method TEXT DEFAULT 'LoRa',
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create spatial index for sensor locations
CREATE INDEX idx_rpi_sensors_location ON raspberry_pi_sensors USING GIST (location);
CREATE INDEX idx_rpi_sensors_status ON raspberry_pi_sensors (status);

-- Real-time sensor readings (hypertable for time-series optimization)
CREATE TABLE sensor_readings (
    reading_id BIGSERIAL,
    sensor_id TEXT NOT NULL REFERENCES raspberry_pi_sensors(sensor_id),
    timestamp TIMESTAMPTZ NOT NULL,
    location GEOMETRY(POINT, 4326), -- GPS coordinates if mobile
    
    -- Air quality measurements
    pm25_ugm3 REAL,
    pm10_ugm3 REAL,
    pm1_ugm3 REAL,
    
    -- Environmental conditions
    temperature_c REAL,
    relative_humidity_pct REAL,
    pressure_pa REAL,
    wind_speed_ms REAL,
    wind_direction_deg REAL,
    
    -- Additional smoke/fire indicators
    co_ppm REAL,
    co2_ppm REAL,
    visibility_m REAL,
    light_intensity_lux REAL,
    
    -- Data quality flags
    data_quality_score REAL DEFAULT 1.0,
    calibration_offset JSONB DEFAULT '{}'::jsonb,
    raw_data JSONB,
    
    PRIMARY KEY (sensor_id, timestamp)
);

-- Convert to hypertable (partitioned by time)
SELECT create_hypertable('sensor_readings', 'timestamp', chunk_time_interval => INTERVAL '1 hour');

-- Spatial and temporal indexes
CREATE INDEX idx_sensor_readings_location ON sensor_readings USING GIST (location);
CREATE INDEX idx_sensor_readings_pm25 ON sensor_readings (pm25_ugm3);
CREATE INDEX idx_sensor_readings_quality ON sensor_readings (data_quality_score);

-- ============================================================================
-- 2. FIRE DETECTION AND PRESCRIBED BURN MANAGEMENT
-- ============================================================================

-- Prescribed burn management
CREATE TABLE prescribed_burns (
    burn_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    burn_name TEXT NOT NULL,
    burn_area GEOMETRY(POLYGON, 4326) NOT NULL,
    planned_start TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    planned_end TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    current_phase prescribed_burn_phase NOT NULL DEFAULT 'planning',
    
    -- Burn characteristics
    fuel_type TEXT[],
    planned_acres REAL,
    burned_acres REAL,
    ignition_pattern TEXT,
    
    -- Weather conditions
    humidity_range NUMRANGE,
    wind_speed_range NUMRANGE,
    temperature_range NUMRANGE,
    
    -- Personnel and equipment
    burn_boss TEXT,
    crew_size INTEGER,
    equipment_deployed TEXT[],
    
    -- Documentation
    burn_plan_url TEXT,
    permits JSONB DEFAULT '{}'::jsonb,
    objectives TEXT[],
    success_criteria JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_prescribed_burns_area ON prescribed_burns USING GIST (burn_area);
CREATE INDEX idx_prescribed_burns_phase ON prescribed_burns (current_phase);
CREATE INDEX idx_prescribed_burns_dates ON prescribed_burns (planned_start, planned_end);

-- Fire detections from NASA FIRMS and other sources
CREATE TABLE fire_detections (
    detection_id BIGSERIAL,
    source TEXT NOT NULL, -- 'VIIRS', 'MODIS', 'GOES', 'SENTINEL'
    satellite TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    
    -- Fire characteristics
    fire_radiative_power_mw REAL,
    confidence fire_confidence_level,
    confidence_pct REAL,
    brightness_k REAL,
    scan_angle REAL,
    track REAL,
    
    -- Spatial context
    pixel_size_m REAL,
    along_scan_m REAL,
    across_scan_m REAL,
    
    -- Association with prescribed burns
    prescribed_burn_id UUID REFERENCES prescribed_burns(burn_id),
    is_prescribed_fire BOOLEAN DEFAULT FALSE,
    
    -- Processing metadata
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    quality_flags JSONB DEFAULT '{}'::jsonb,
    
    PRIMARY KEY (detection_id, timestamp)
);

-- Convert to hypertable
SELECT create_hypertable('fire_detections', 'timestamp', chunk_time_interval => INTERVAL '1 day');

CREATE INDEX idx_fire_detections_location ON fire_detections USING GIST (location);
CREATE INDEX idx_fire_detections_frp ON fire_detections (fire_radiative_power_mw);
CREATE INDEX idx_fire_detections_prescribed ON fire_detections (prescribed_burn_id, is_prescribed_fire);

-- ============================================================================
-- 3. METEOROLOGICAL DATA
-- ============================================================================

-- NOAA gridpoint meteorological data
CREATE TABLE meteorological_data (
    grid_id TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    pressure_level_pa INTEGER, -- 0 for surface, otherwise pressure level
    
    -- Wind vectors (3D)
    wind_u_ms REAL, -- eastward component
    wind_v_ms REAL, -- northward component  
    wind_w_ms REAL, -- vertical component
    wind_speed_ms REAL,
    wind_direction_deg REAL,
    
    -- Thermodynamic variables
    temperature_k REAL,
    relative_humidity_pct REAL,
    specific_humidity_kgkg REAL,
    pressure_pa REAL,
    
    -- Atmospheric stability
    mixing_height_m REAL,
    boundary_layer_height_m REAL,
    richardson_number REAL,
    
    -- Precipitation and clouds
    precipitation_rate_mmh REAL,
    cloud_cover_pct REAL,
    visibility_m REAL,
    
    -- Solar radiation
    solar_radiation_wm2 REAL,
    
    -- Data source metadata
    model_run TIMESTAMPTZ,
    forecast_hour INTEGER,
    data_source TEXT DEFAULT 'NOAA_GFS',
    
    PRIMARY KEY (grid_id, timestamp, pressure_level_pa)
);

SELECT create_hypertable('meteorological_data', 'timestamp', chunk_time_interval => INTERVAL '6 hours');

CREATE INDEX idx_met_data_location ON meteorological_data USING GIST (location);
CREATE INDEX idx_met_data_surface ON meteorological_data (pressure_level_pa) WHERE pressure_level_pa = 0;

-- ============================================================================
-- 4. SATELLITE AEROSOL OPTICAL DEPTH (AOD)
-- ============================================================================

-- Satellite AOD observations for model validation
CREATE TABLE satellite_aod (
    observation_id BIGSERIAL,
    satellite TEXT NOT NULL, -- 'GOES-ABI', 'OMPS', 'MODIS'
    sensor TEXT,
    timestamp TIMESTAMPTZ NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    
    -- AOD measurements
    aod_550nm REAL, -- Primary wavelength
    aod_470nm REAL,
    aod_660nm REAL,
    aod_870nm REAL,
    
    -- Quality assessments
    quality_flag INTEGER,
    cloud_fraction REAL,
    aerosol_type TEXT,
    angstrom_exponent REAL,
    
    -- Spatial resolution
    pixel_size_km REAL,
    viewing_angle REAL,
    solar_zenith_angle REAL,
    
    -- Processing metadata
    algorithm_version TEXT,
    processed_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (observation_id, timestamp)
);

SELECT create_hypertable('satellite_aod', 'timestamp', chunk_time_interval => INTERVAL '1 day');

CREATE INDEX idx_satellite_aod_location ON satellite_aod USING GIST (location);
CREATE INDEX idx_satellite_aod_quality ON satellite_aod (quality_flag);

-- ============================================================================
-- 5. PHYSICS-INFORMED AI PREDICTIONS
-- ============================================================================

-- HYSPLIT baseline model runs
CREATE TABLE hysplit_runs (
    run_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescribed_burn_id UUID REFERENCES prescribed_burns(burn_id),
    
    -- Model configuration
    start_time TIMESTAMPTZ NOT NULL,
    duration_hours INTEGER NOT NULL,
    release_location GEOMETRY(POINT, 4326) NOT NULL,
    release_height_m REAL NOT NULL,
    emission_rate_gps REAL, -- grams per second
    
    -- Meteorological input
    met_data_source TEXT NOT NULL,
    met_model_run TIMESTAMPTZ NOT NULL,
    
    -- Model parameters
    particle_count INTEGER DEFAULT 10000,
    vertical_levels INTEGER[],
    output_resolution_km REAL DEFAULT 1.0,
    
    -- Run metadata
    hysplit_version TEXT,
    computation_time_sec REAL,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_hysplit_runs_burn ON hysplit_runs (prescribed_burn_id);
CREATE INDEX idx_hysplit_runs_location ON hysplit_runs USING GIST (release_location);

-- HYSPLIT concentration predictions (gridded output)
CREATE TABLE hysplit_concentrations (
    run_id UUID NOT NULL REFERENCES hysplit_runs(run_id),
    timestamp TIMESTAMPTZ NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    height_m REAL NOT NULL,
    
    -- Concentration predictions
    concentration_ugm3 REAL NOT NULL,
    deposition_gm2 REAL DEFAULT 0,
    
    -- Uncertainty estimates
    concentration_std REAL,
    
    PRIMARY KEY (run_id, timestamp, location, height_m)
);

CREATE INDEX idx_hysplit_conc_spatiotemporal ON hysplit_concentrations 
    USING GIST (location, timestamp);

-- AI model predictions (transformer/diffusion corrections)
CREATE TABLE ai_model_predictions (
    prediction_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hysplit_run_id UUID REFERENCES hysplit_runs(run_id),
    prescribed_burn_id UUID REFERENCES prescribed_burns(burn_id),
    
    -- Model metadata
    model_type prediction_model NOT NULL,
    model_version TEXT NOT NULL,
    training_dataset_id TEXT,
    
    -- Prediction parameters
    prediction_time TIMESTAMPTZ NOT NULL,
    forecast_horizon_hours INTEGER NOT NULL,
    spatial_resolution_m REAL NOT NULL,
    
    -- Performance metrics
    rmse_vs_sensors REAL,
    mae_vs_sensors REAL,
    r2_vs_sensors REAL,
    rmse_vs_satellite REAL,
    
    -- Computational metadata
    inference_time_sec REAL,
    gpu_used TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI-corrected concentration grids
CREATE TABLE ai_concentrations (
    prediction_id UUID NOT NULL REFERENCES ai_model_predictions(prediction_id),
    timestamp TIMESTAMPTZ NOT NULL,
    location GEOMETRY(POINT, 4326) NOT NULL,
    height_m REAL NOT NULL,
    
    -- AI-predicted concentrations
    concentration_ugm3 REAL NOT NULL,
    uncertainty_ugm3 REAL,
    
    -- Residual corrections from baseline
    hysplit_correction_factor REAL,
    
    PRIMARY KEY (prediction_id, timestamp, location, height_m)
);

CREATE INDEX idx_ai_conc_spatiotemporal ON ai_concentrations 
    USING GIST (location, timestamp);

-- ============================================================================
-- 6. VECTOR EMBEDDINGS FOR RAG SYSTEM
-- ============================================================================

-- Knowledge base embeddings for contextual retrieval
CREATE TABLE knowledge_embeddings (
    embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content_type TEXT NOT NULL, -- 'sensor_reading', 'fire_detection', 'research_paper', etc.
    source_id TEXT NOT NULL, -- Reference to source table primary key
    
    -- Content metadata
    content_text TEXT NOT NULL,
    content_summary TEXT,
    spatial_extent GEOMETRY(POLYGON, 4326),
    temporal_extent TSTZRANGE,
    
    -- Vector embedding (OpenAI ada-002: 1536 dimensions)
    embedding vector(1536) NOT NULL,
    
    -- Contextual tags
    tags TEXT[],
    prescribed_fire_context BOOLEAN DEFAULT FALSE,
    fire_behavior_relevance REAL DEFAULT 0.5,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Vector similarity search index
CREATE INDEX idx_knowledge_embeddings_vector ON knowledge_embeddings 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_knowledge_embeddings_spatial ON knowledge_embeddings 
    USING GIST (spatial_extent);

CREATE INDEX idx_knowledge_embeddings_temporal ON knowledge_embeddings 
    USING GIST (temporal_extent);

-- ============================================================================
-- 7. STATIC GIS REFERENCE DATA
-- ============================================================================

-- USFS fuel types and characteristics
CREATE TABLE fuel_models (
    fuel_model_id INTEGER PRIMARY KEY,
    fuel_category TEXT NOT NULL,
    fuel_description TEXT,
    
    -- Anderson fire behavior fuel model parameters
    one_hour_fuel_load_tons_acre REAL,
    ten_hour_fuel_load_tons_acre REAL,
    hundred_hour_fuel_load_tons_acre REAL,
    live_herbaceous_load_tons_acre REAL,
    live_woody_load_tons_acre REAL,
    
    -- Fire behavior characteristics
    surface_area_to_volume_ratio REAL,
    fuel_bed_depth_ft REAL,
    moisture_of_extinction_pct REAL,
    heat_content_btu_lb REAL,
    
    -- Burn characteristics for prescribed fire
    typical_consumption_pct REAL,
    emission_factor_pm25 REAL, -- grams PM2.5 per kg fuel burned
    emission_factor_co REAL,
    emission_factor_co2 REAL
);

-- Digital elevation model (can be populated from USGS data)
CREATE TABLE elevation_model (
    grid_id SERIAL PRIMARY KEY,
    location GEOMETRY(POINT, 4326) NOT NULL,
    elevation_m REAL NOT NULL,
    resolution_m REAL NOT NULL,
    data_source TEXT DEFAULT 'USGS_DEM'
);

CREATE INDEX idx_elevation_location ON elevation_model USING GIST (location);

-- Land cover classifications
CREATE TABLE land_cover (
    cover_id SERIAL PRIMARY KEY,
    area GEOMETRY(POLYGON, 4326) NOT NULL,
    cover_class TEXT NOT NULL, -- NLCD codes
    cover_description TEXT,
    canopy_height_m REAL,
    biomass_kg_m2 REAL,
    data_source TEXT DEFAULT 'NLCD',
    year_classified INTEGER
);

CREATE INDEX idx_land_cover_area ON land_cover USING GIST (area);

-- ============================================================================
-- 8. REAL-TIME SYSTEM TABLES
-- ============================================================================

-- Real-time prediction status and alerts
CREATE TABLE prediction_alerts (
    alert_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prescribed_burn_id UUID REFERENCES prescribed_burns(burn_id),
    prediction_id UUID REFERENCES ai_model_predictions(prediction_id),
    
    alert_type TEXT NOT NULL, -- 'high_concentration', 'wind_shift', 'model_divergence'
    severity TEXT NOT NULL, -- 'low', 'medium', 'high', 'critical'
    
    -- Alert details
    triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    location GEOMETRY(POINT, 4326),
    affected_area GEOMETRY(POLYGON, 4326),
    
    message TEXT NOT NULL,
    recommended_actions TEXT[],
    
    -- Status tracking
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by TEXT,
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT
);

CREATE INDEX idx_prediction_alerts_burn ON prediction_alerts (prescribed_burn_id);
CREATE INDEX idx_prediction_alerts_severity ON prediction_alerts (severity, triggered_at);

-- System performance monitoring
CREATE TABLE system_performance (
    metric_id BIGSERIAL,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Model performance
    hysplit_runtime_sec REAL,
    ai_inference_time_sec REAL,
    total_prediction_latency_sec REAL,
    
    -- Data ingestion rates
    sensor_readings_per_minute INTEGER,
    fire_detections_per_hour INTEGER,
    
    -- System resources
    cpu_usage_pct REAL,
    memory_usage_pct REAL,
    database_connections INTEGER,
    
    -- Prediction accuracy (rolling metrics)
    sensor_prediction_rmse REAL,
    satellite_prediction_rmse REAL,
    
    notes TEXT,
    
    PRIMARY KEY (metric_id, timestamp)
);

SELECT create_hypertable('system_performance', 'timestamp', chunk_time_interval => INTERVAL '1 hour');

-- ============================================================================
-- 9. TRIGGER FUNCTIONS FOR AUTOMATED PROCESSING
-- ============================================================================

-- Function to update prescribed burn status based on sensor readings
CREATE OR REPLACE FUNCTION update_burn_status()
RETURNS TRIGGER AS $$
BEGIN
    -- Update burn phase based on sensor activity and fire detections
    IF NEW.pm25_ugm3 > 100 THEN
        UPDATE prescribed_burns 
        SET current_phase = 'active', 
            updated_at = NOW()
        WHERE burn_id IN (
            SELECT pb.burn_id 
            FROM prescribed_burns pb
            WHERE ST_Within(NEW.location, pb.burn_area)
            AND pb.current_phase IN ('planning', 'ignition')
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger on sensor readings to auto-update burn status
CREATE TRIGGER trigger_update_burn_status
    AFTER INSERT ON sensor_readings
    FOR EACH ROW
    EXECUTE FUNCTION update_burn_status();

-- Function to generate alerts based on concentration predictions
CREATE OR REPLACE FUNCTION check_concentration_alerts()
RETURNS TRIGGER AS $$
DECLARE
    threshold_concentration REAL := 35.0; -- PM2.5 threshold (μg/m³)
    affected_sensors INTEGER;
BEGIN
    -- Check if predicted concentrations exceed thresholds near sensor locations
    SELECT COUNT(*) INTO affected_sensors
    FROM raspberry_pi_sensors rps
    WHERE ST_DWithin(rps.location, NEW.location, 1000) -- within 1km
    AND NEW.concentration_ugm3 > threshold_concentration;
    
    IF affected_sensors > 0 THEN
        INSERT INTO prediction_alerts (
            prediction_id, alert_type, severity, location, 
            message, recommended_actions
        ) VALUES (
            NEW.prediction_id,
            'high_concentration',
            CASE 
                WHEN NEW.concentration_ugm3 > 75 THEN 'high'
                WHEN NEW.concentration_ugm3 > 50 THEN 'medium'
                ELSE 'low'
            END,
            NEW.location,
            format('Predicted PM2.5 concentration of %.1f μg/m³ near %d sensor(s)', 
                   NEW.concentration_ugm3, affected_sensors),
            ARRAY['Monitor sensor readings', 'Consider evacuation if sustained', 
                  'Adjust burn operations if possible']
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_concentration_alerts
    AFTER INSERT ON ai_concentrations
    FOR EACH ROW
    EXECUTE FUNCTION check_concentration_alerts();

-- ============================================================================
-- 10. VIEWS FOR COMMON QUERIES
-- ============================================================================

-- Real-time dashboard view combining multiple data sources
CREATE VIEW real_time_dashboard AS
SELECT 
    pb.burn_id,
    pb.burn_name,
    pb.current_phase,
    pb.burn_area,
    
    -- Latest sensor readings within burn area
    (SELECT AVG(sr.pm25_ugm3) 
     FROM sensor_readings sr 
     JOIN raspberry_pi_sensors rps ON sr.sensor_id = rps.sensor_id
     WHERE ST_Within(rps.location, pb.burn_area)
     AND sr.timestamp > NOW() - INTERVAL '15 minutes') AS avg_pm25_ugm3,
     
    -- Fire detection count in last hour
    (SELECT COUNT(*) 
     FROM fire_detections fd 
     WHERE ST_Within(fd.location, pb.burn_area)
     AND fd.timestamp > NOW() - INTERVAL '1 hour') AS recent_fire_detections,
     
    -- Active alerts
    (SELECT COUNT(*) 
     FROM prediction_alerts pa 
     WHERE pa.prescribed_burn_id = pb.burn_id
     AND pa.resolved_at IS NULL) AS active_alerts,
     
    pb.updated_at
FROM prescribed_burns pb
WHERE pb.current_phase IN ('ignition', 'active', 'mop_up');

-- Historical performance metrics view
CREATE VIEW model_performance_summary AS
SELECT 
    amp.model_type,
    amp.model_version,
    COUNT(*) as prediction_count,
    AVG(amp.rmse_vs_sensors) as avg_sensor_rmse,
    AVG(amp.mae_vs_sensors) as avg_sensor_mae,
    AVG(amp.r2_vs_sensors) as avg_sensor_r2,
    AVG(amp.rmse_vs_satellite) as avg_satellite_rmse,
    AVG(amp.inference_time_sec) as avg_inference_time_sec,
    MIN(amp.created_at) as first_prediction,
    MAX(amp.created_at) as latest_prediction
FROM ai_model_predictions amp
GROUP BY amp.model_type, amp.model_version
ORDER BY avg_sensor_rmse ASC;

-- Spatial query optimization: Create appropriate spatial partitioning
-- This is particularly important for large-scale deployments
-- Note: Retention and compression policies require TimescaleDB Enterprise license
-- SELECT add_retention_policy('sensor_readings', INTERVAL '2 years');
-- SELECT add_retention_policy('fire_detections', INTERVAL '5 years');
-- SELECT add_retention_policy('meteorological_data', INTERVAL '1 year');

-- Create compression policies for older data (Enterprise feature)
-- SELECT add_compression_policy('sensor_readings', INTERVAL '1 week');
-- SELECT add_compression_policy('meteorological_data', INTERVAL '3 days');

-- Grant appropriate permissions for application access
-- Note: In production, create specific roles with minimal required permissions
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Final comment: Schema designed for 10M+ sensor readings/day, 
-- sub-second spatial queries, and real-time ML inference pipeline
COMMENT ON SCHEMA public IS 'Prescribed Fire Platform - Production Schema v1.0'; 