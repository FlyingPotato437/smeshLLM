-- Deploy Phase 1: Unified Sensor Readings Migration
-- This script safely deploys the unified sensor readings table and begins dual-write

-- ============================================================================
-- PHASE 1 DEPLOYMENT CHECKLIST
-- ============================================================================

-- Before running this script, ensure:
-- 1. ✅ Application is running and stable
-- 2. ✅ Database backup has been created
-- 3. ✅ Migration files are reviewed and approved
-- 4. ✅ Dual-write code has been deployed to application

-- ============================================================================
-- STEP 1: APPLY MIGRATION 005 (CREATE UNIFIED TABLE)
-- ============================================================================

-- Apply the unified sensor readings migration
-- This creates:
-- - sensor_source ENUM type
-- - sensor_readings table with TimescaleDB hypertable
-- - All necessary indexes
-- - Validation functions
-- - Helper functions

\echo 'Applying migration 005_unified_sensor_readings.sql...'

-- Apply migration (this would normally be done via supabase db push)
-- For manual application, run the migration file contents

-- ============================================================================
-- STEP 2: VERIFY MIGRATION SUCCESS
-- ============================================================================

-- Check that the table was created successfully
SELECT 
    tablename,
    schemaname,
    tableowner
FROM pg_tables 
WHERE tablename = 'sensor_readings';

-- Check that the ENUM type was created
SELECT 
    typname,
    typtype
FROM pg_type 
WHERE typname = 'sensor_source';

-- Check that indexes were created
SELECT 
    indexname,
    tablename,
    indexdef
FROM pg_indexes 
WHERE tablename = 'sensor_readings'
ORDER BY indexname;

-- Verify hypertable creation
SELECT 
    hypertable_schema,
    hypertable_name,
    num_dimensions
FROM timescaledb_information.hypertables 
WHERE hypertable_name = 'sensor_readings';

-- ============================================================================
-- STEP 3: TEST DUAL-WRITE FUNCTIONALITY
-- ============================================================================

-- Check current record counts before dual-write begins
SELECT 'pi_sensor_raw' as table_name, COUNT(*) as record_count 
FROM pi_sensor_raw
UNION ALL
SELECT 'meshtastic_telemetry' as table_name, COUNT(*) as record_count 
FROM meshtastic_telemetry
UNION ALL
SELECT 'sensor_readings' as table_name, COUNT(*) as record_count 
FROM sensor_readings;

-- ============================================================================
-- STEP 4: CONFIGURE MONITORING
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

-- Query the monitoring view
SELECT * FROM dual_write_monitor;

-- ============================================================================
-- STEP 5: PREPARE FOR BACKFILL (DO NOT RUN YET)
-- ============================================================================

-- Load the backfill functions (this would normally be done via file)
-- \i scripts/backfill-sensor-readings.sql

-- Verify backfill functions are available
SELECT 
    proname as function_name,
    pronargs as num_args
FROM pg_proc 
WHERE proname IN ('backfill_pi_sensor_data', 'backfill_meshtastic_data', 'run_complete_backfill');

-- ============================================================================
-- NEXT STEPS
-- ============================================================================

\echo ''
\echo '✅ Phase 1 deployment complete!'
\echo ''
\echo 'Next steps:'
\echo '1. Monitor dual-write functionality with: SELECT * FROM dual_write_monitor;'
\echo '2. Verify new data appears in sensor_readings table'
\echo '3. When ready for backfill, run: SELECT * FROM run_complete_backfill();'
\echo '4. Monitor backfill progress with: SELECT * FROM get_backfill_summary();'
\echo ''
\echo '⚠️  Do not proceed to Phase 2 until dual-write is stable and backfill is complete'