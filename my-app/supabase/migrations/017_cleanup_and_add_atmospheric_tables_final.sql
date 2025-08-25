-- Migration 017: Remove Obsolete Tables and Add Atmospheric Modeling Tables (Final)
-- This migration works with existing schema and adds missing infrastructure for real atmospheric modeling
-- Fixed TimescaleDB hypertable creation order and constraints

-- ============================================================================
-- 1. REMOVE OBSOLETE TABLES
-- ============================================================================

-- Drop obsolete meteorology table (superseded by meteorological_data)
DROP TABLE IF EXISTS meteorology_grids CASCADE;

-- Drop obsolete plume predictions table (superseded by hysplit_concentrations and ai_concentrations)
DROP TABLE IF EXISTS plume_predictions CASCADE;

-- Update RPC function to use new tables (or remove if not needed)
DROP FUNCTION IF EXISTS get_plume_predictions_with_coords(geometry) CASCADE;

-- ============================================================================
-- 2. ADD OPENAQ DATA SOURCE TO SENSOR_SOURCE ENUM
-- ============================================================================

-- Add OpenAQ as a data source for external air quality data integration
ALTER TYPE sensor_source ADD VALUE IF NOT EXISTS 'openaq';

-- ============================================================================
-- 3. ENHANCE EXISTING HYSPLIT TABLES (DON'T RECREATE)
-- ============================================================================

-- The hysplit_runs table already exists from migration 002, so just add missing columns if needed
DO $$
BEGIN
    -- Add error_message column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hysplit_runs' AND column_name = 'error_message') THEN
        ALTER TABLE hysplit_runs ADD COLUMN error_message TEXT;
    END IF;
    
    -- Add started_at column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hysplit_runs' AND column_name = 'started_at') THEN
        ALTER TABLE hysplit_runs ADD COLUMN started_at TIMESTAMPTZ;
    END IF;
    
    -- Add created_by column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hysplit_runs' AND column_name = 'created_by') THEN
        ALTER TABLE hysplit_runs ADD COLUMN created_by TEXT;
    END IF;
    
    -- Add output_files column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'hysplit_runs' AND column_name = 'output_files') THEN
        ALTER TABLE hysplit_runs ADD COLUMN output_files JSONB;
    END IF;
END $$;

-- Create additional indexes for HYSPLIT runs (if they don't exist)
CREATE INDEX IF NOT EXISTS idx_hysplit_runs_time ON hysplit_runs (start_time);
CREATE INDEX IF NOT EXISTS idx_hysplit_runs_status ON hysplit_runs (status);

-- ============================================================================
-- 4. ADD PHYSICS-INFORMED NEURAL NETWORK (PINN) TRAINING TABLES
-- ============================================================================

-- Table to track PINN model training experiments
CREATE TABLE IF NOT EXISTS pinn_training_sets (
    training_set_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Model identification
    model_name TEXT NOT NULL,
    model_version TEXT NOT NULL,
    description TEXT,
    
    -- Training data selection criteria
    data_selection_criteria JSONB NOT NULL, -- Store query parameters used to select training data
    training_start_date TIMESTAMPTZ,
    training_end_date TIMESTAMPTZ,
    
    -- Training configuration
    hyperparameters JSONB, -- Learning rate, epochs, batch size, etc.
    physics_constraints JSONB, -- Physics loss terms and weights
    
    -- Training results
    training_metrics JSONB, -- Loss values, accuracy, validation metrics
    model_artifacts JSONB, -- File paths to saved models, plots, etc.
    
    -- Execution tracking
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'training', 'completed', 'failed')),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    error_message TEXT,
    
    -- Performance metadata
    validation_accuracy REAL,
    physics_loss REAL,
    data_loss REAL,
    
    -- Housekeeping
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT
);

-- Create indexes for PINN training sets
CREATE INDEX IF NOT EXISTS idx_pinn_training_sets_model ON pinn_training_sets (model_name, model_version);
CREATE INDEX IF NOT EXISTS idx_pinn_training_sets_status ON pinn_training_sets (status);
CREATE INDEX IF NOT EXISTS idx_pinn_training_sets_performance ON pinn_training_sets (validation_accuracy DESC);

-- Table to store PINN model predictions (TimescaleDB compatible)
CREATE TABLE IF NOT EXISTS pinn_predictions (
    -- Use compound primary key that includes timestamp for TimescaleDB
    prediction_id UUID NOT NULL DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL,
    
    -- Model reference
    training_set_id UUID REFERENCES pinn_training_sets(training_set_id),
    model_version TEXT NOT NULL,
    
    -- Input data references
    hysplit_run_id UUID REFERENCES hysplit_runs(run_id),
    sensor_data_timerange TSTZRANGE, -- Time range of sensor data used as input
    
    -- Prediction outputs
    location GEOGRAPHY(POINT, 4326) NOT NULL,
    predicted_pm25_ugm3 REAL,
    predicted_pm10_ugm3 REAL,
    prediction_confidence REAL CHECK (prediction_confidence >= 0 AND prediction_confidence <= 1),
    
    -- Bias correction from HYSPLIT baseline
    hysplit_pm25_ugm3 REAL, -- Original HYSPLIT prediction
    bias_correction_pm25 REAL, -- PINN correction factor
    uncertainty_bounds JSONB, -- Upper and lower confidence bounds
    
    -- Physics-informed corrections
    physics_adjustments JSONB, -- Specific physics-based corrections applied
    
    -- Housekeeping
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- TimescaleDB requires primary key to include partitioning column
    PRIMARY KEY (prediction_id, timestamp)
);

-- Create TimescaleDB hypertable for PINN predictions (time-series data)
DO $$
BEGIN
    -- Only create hypertable if it doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables 
        WHERE hypertable_name = 'pinn_predictions'
    ) THEN
        PERFORM create_hypertable('pinn_predictions', 'timestamp', 
            chunk_time_interval => INTERVAL '1 day');
    END IF;
END $$;

-- Create indexes for PINN predictions (after hypertable creation)
CREATE INDEX IF NOT EXISTS idx_pinn_predictions_location ON pinn_predictions USING GIST (location);
CREATE INDEX IF NOT EXISTS idx_pinn_predictions_confidence ON pinn_predictions (prediction_confidence DESC);
CREATE INDEX IF NOT EXISTS idx_pinn_predictions_model ON pinn_predictions (model_version, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pinn_predictions_id_time ON pinn_predictions (prediction_id, timestamp);

-- ============================================================================
-- 5. ADD ENHANCED RAG TABLES FOR SCIENTIFIC LITERATURE
-- ============================================================================

-- Enhanced knowledge embeddings table with better metadata structure
CREATE TABLE IF NOT EXISTS scientific_documents (
    document_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Document metadata
    title TEXT NOT NULL,
    authors TEXT[],
    publication_year INTEGER,
    journal TEXT,
    doi TEXT,
    url TEXT,
    document_type TEXT CHECK (document_type IN ('research_paper', 'technical_report', 'government_doc', 'manual', 'dataset_description')),
    
    -- Content
    abstract TEXT,
    full_text TEXT,
    
    -- Classification tags
    topics TEXT[], -- e.g., ['wildfire', 'atmospheric_modeling', 'air_quality']
    geographic_regions TEXT[], -- e.g., ['california', 'western_us', 'mediterranean']
    methods TEXT[], -- e.g., ['hysplit', 'neural_network', 'field_study']
    
    -- Relevance scoring
    relevance_score REAL DEFAULT 0.5 CHECK (relevance_score >= 0 AND relevance_score <= 1),
    citation_count INTEGER DEFAULT 0,
    
    -- Processing metadata
    embedding_model TEXT, -- Model used to generate embeddings
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    processing_notes JSONB,
    
    -- Housekeeping
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for scientific documents
CREATE INDEX IF NOT EXISTS idx_scientific_documents_topics ON scientific_documents USING GIN (topics);
CREATE INDEX IF NOT EXISTS idx_scientific_documents_year ON scientific_documents (publication_year DESC);
CREATE INDEX IF NOT EXISTS idx_scientific_documents_relevance ON scientific_documents (relevance_score DESC);
CREATE INDEX IF NOT EXISTS idx_scientific_documents_type ON scientific_documents (document_type);

-- Enhanced embeddings table linked to documents
CREATE TABLE IF NOT EXISTS document_embeddings (
    embedding_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES scientific_documents(document_id) ON DELETE CASCADE,
    
    -- Embedding data
    text_chunk TEXT NOT NULL, -- The specific text chunk that was embedded
    chunk_index INTEGER NOT NULL, -- Order within the document
    embedding VECTOR(1536) NOT NULL, -- OpenAI text-embedding-3-small dimension
    
    -- Chunk metadata
    chunk_type TEXT CHECK (chunk_type IN ('title', 'abstract', 'section', 'conclusion', 'figure_caption')),
    section_title TEXT,
    
    -- Housekeeping
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    UNIQUE (document_id, chunk_index)
);

-- Create vector index for embeddings (HNSW for better performance)
CREATE INDEX IF NOT EXISTS idx_document_embeddings_vector 
ON document_embeddings USING hnsw (embedding vector_cosine_ops);

-- Create indexes for document embeddings
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document ON document_embeddings (document_id);
CREATE INDEX IF NOT EXISTS idx_document_embeddings_type ON document_embeddings (chunk_type);

-- ============================================================================
-- 6. ADD SYSTEM PERFORMANCE MONITORING TABLES
-- ============================================================================

-- Table to track system performance and model accuracy
CREATE TABLE IF NOT EXISTS model_performance_metrics (
    metric_id UUID NOT NULL DEFAULT gen_random_uuid(),
    timestamp TIMESTAMPTZ NOT NULL,
    
    -- Model identification
    model_type TEXT NOT NULL CHECK (model_type IN ('hysplit', 'pinn', 'combined')),
    model_version TEXT,
    
    -- Performance metrics
    prediction_accuracy REAL,
    mean_absolute_error REAL,
    root_mean_square_error REAL,
    bias_score REAL,
    
    -- Operational metrics
    execution_time_seconds REAL,
    memory_usage_mb REAL,
    api_response_time_ms REAL,
    
    -- Geographic and temporal context
    test_location GEOGRAPHY(POINT, 4326),
    test_timeframe TSTZRANGE,
    sample_size INTEGER,
    
    -- Metadata
    test_conditions JSONB, -- Weather conditions, fire conditions, etc.
    notes TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- TimescaleDB compatible primary key
    PRIMARY KEY (metric_id, timestamp)
);

-- Create TimescaleDB hypertable for performance metrics
DO $$
BEGIN
    -- Only create hypertable if it doesn't already exist
    IF NOT EXISTS (
        SELECT 1 FROM timescaledb_information.hypertables 
        WHERE hypertable_name = 'model_performance_metrics'
    ) THEN
        PERFORM create_hypertable('model_performance_metrics', 'timestamp', 
            chunk_time_interval => INTERVAL '1 week');
    END IF;
END $$;

-- Create indexes for performance metrics
CREATE INDEX IF NOT EXISTS idx_performance_metrics_model ON model_performance_metrics (model_type, model_version);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_accuracy ON model_performance_metrics (prediction_accuracy DESC);

-- ============================================================================
-- 7. ADD COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE pinn_training_sets IS 'Manages Physics-Informed Neural Network training experiments and hyperparameters';
COMMENT ON TABLE pinn_predictions IS 'Stores PINN model predictions with bias corrections and uncertainty bounds';
COMMENT ON TABLE scientific_documents IS 'Enhanced metadata for scientific literature used in RAG system';
COMMENT ON TABLE document_embeddings IS 'Vector embeddings of scientific document chunks for semantic search';
COMMENT ON TABLE model_performance_metrics IS 'Tracks system performance and model accuracy over time';

-- ============================================================================
-- 8. VERIFY SETUP
-- ============================================================================

DO $$
DECLARE
    table_count INTEGER;
    hypertable_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO table_count 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_type = 'BASE TABLE';
    
    SELECT COUNT(*) INTO hypertable_count
    FROM timescaledb_information.hypertables;
    
    RAISE NOTICE '';
    RAISE NOTICE '🚀 ATMOSPHERIC MODELING SCHEMA READY FOR REAL IMPLEMENTATION:';
    RAISE NOTICE '';
    RAISE NOTICE '✅ Enhanced existing HYSPLIT tables with additional columns';
    RAISE NOTICE '✅ PINN training and prediction tables created with TimescaleDB';
    RAISE NOTICE '✅ Enhanced RAG tables for scientific literature created';
    RAISE NOTICE '✅ Performance monitoring tables created with TimescaleDB';
    RAISE NOTICE '✅ OpenAQ data source added to sensor_source enum';
    RAISE NOTICE '✅ Obsolete tables removed (meteorology_grids, plume_predictions)';
    RAISE NOTICE '';
    RAISE NOTICE '📊 Database Statistics:';
    RAISE NOTICE '   • Total tables: %', table_count;
    RAISE NOTICE '   • TimescaleDB hypertables: %', hypertable_count;
    RAISE NOTICE '';
    RAISE NOTICE '🎯 Ready to implement:';
    RAISE NOTICE '   • Real HYSPLIT integration with PySPLIT';
    RAISE NOTICE '   • Physics-Informed Neural Networks for atmospheric modeling';
    RAISE NOTICE '   • Advanced RAG system for scientific literature';
    RAISE NOTICE '   • OpenAQ API integration for additional air quality data';
    RAISE NOTICE '';
END $$;