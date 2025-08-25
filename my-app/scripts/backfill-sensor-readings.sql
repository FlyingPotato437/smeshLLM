-- Backfill Script for Unified Sensor Readings Migration
-- Safely migrates data from pi_sensor_raw and meshtastic_telemetry to sensor_readings
-- Uses chunking by day and robust error handling for dirty data

-- ============================================================================
-- BACKFILL FROM PI_SENSOR_RAW
-- ============================================================================

-- Function to backfill Pi sensor data in daily chunks
CREATE OR REPLACE FUNCTION backfill_pi_sensor_data(
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
) RETURNS TABLE (
    processed_date DATE,
    records_processed INTEGER,
    records_inserted INTEGER,
    records_skipped INTEGER,
    errors TEXT[]
) LANGUAGE plpgsql AS $$
DECLARE
    current_date DATE;
    actual_start_date DATE;
    actual_end_date DATE;
    daily_processed INTEGER;
    daily_inserted INTEGER;
    daily_skipped INTEGER;
    error_messages TEXT[] := '{}';
BEGIN
    -- Determine date range if not provided
    IF start_date IS NULL THEN
        SELECT DATE(MIN(ts)) INTO actual_start_date FROM pi_sensor_raw;
    ELSE
        actual_start_date := start_date;
    END IF;
    
    IF end_date IS NULL THEN
        SELECT DATE(MAX(ts)) INTO actual_end_date FROM pi_sensor_raw;
    ELSE
        actual_end_date := end_date;
    END IF;
    
    RAISE NOTICE 'Backfilling Pi sensor data from % to %', actual_start_date, actual_end_date;
    
    -- Process day by day
    current_date := actual_start_date;
    WHILE current_date <= actual_end_date LOOP
        -- Reset counters for this day
        daily_processed := 0;
        daily_inserted := 0;
        daily_skipped := 0;
        error_messages := '{}';
        
        BEGIN
            -- Get count of records for this day
            SELECT COUNT(*) INTO daily_processed
            FROM pi_sensor_raw
            WHERE DATE(ts) = current_date;
            
            -- Insert data for this day with transformation and error handling
            WITH transformed_data AS (
                SELECT
                    ('pi_' || sensor_uuid::text) AS device_id,
                    ts AS timestamp,
                    CASE 
                        WHEN ST_X(location::geometry) IS NOT NULL AND ST_Y(location::geometry) IS NOT NULL
                        THEN safe_make_geography_point(ST_X(location::geometry), ST_Y(location::geometry))
                        ELSE NULL
                    END AS location,
                    'pi_batch'::sensor_source AS source,
                    pm25_ug_m3 AS pm25_ugm3,
                    pm10_ug_m3 AS pm10_ugm3,
                    NULL AS pm1_ugm3, -- Pi sensors don't have PM1
                    temperature_c,
                    rh_percent AS humidity_pct,
                    NULL AS pressure_pa, -- Pi sensors don't have pressure
                    jsonb_build_object(
                        'original_id', id,
                        'altitude_m', altitude_m,
                        'source_table', 'pi_sensor_raw'
                    ) AS metadata,
                    created_at
                FROM pi_sensor_raw
                WHERE DATE(ts) = current_date
                  AND sensor_uuid IS NOT NULL -- Skip records with null device identifier
                  AND ts IS NOT NULL -- Skip records with null timestamp
                ORDER BY ts ASC -- Critical for TimescaleDB performance
            )
            INSERT INTO sensor_readings (
                device_id, timestamp, location, source,
                pm25_ugm3, pm10_ugm3, pm1_ugm3, temperature_c, humidity_pct, pressure_pa,
                metadata, created_at
            )
            SELECT * FROM transformed_data
            ON CONFLICT (device_id, timestamp) DO NOTHING;
            
            -- Get number of records actually inserted (after conflict resolution)
            GET DIAGNOSTICS daily_inserted = ROW_COUNT;
            daily_skipped := daily_processed - daily_inserted;
            
            RAISE NOTICE 'Day %: Processed %, Inserted %, Skipped %', 
                        current_date, daily_processed, daily_inserted, daily_skipped;
            
        EXCEPTION
            WHEN OTHERS THEN
                error_messages := error_messages || (SQLERRM || ' for date ' || current_date::text);
                RAISE WARNING 'Error processing date %: %', current_date, SQLERRM;
        END;
        
        -- Return daily results
        RETURN QUERY SELECT current_date, daily_processed, daily_inserted, daily_skipped, error_messages;
        
        -- Move to next day
        current_date := current_date + INTERVAL '1 day';
    END LOOP;
    
    RAISE NOTICE 'Pi sensor backfill completed';
END;
$$;

-- ============================================================================
-- BACKFILL FROM MESHTASTIC_TELEMETRY  
-- ============================================================================

-- Function to backfill Meshtastic telemetry data in daily chunks
CREATE OR REPLACE FUNCTION backfill_meshtastic_data(
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
) RETURNS TABLE (
    processed_date DATE,
    records_processed INTEGER,
    records_inserted INTEGER,
    records_skipped INTEGER,
    errors TEXT[]
) LANGUAGE plpgsql AS $$
DECLARE
    current_date DATE;
    actual_start_date DATE;
    actual_end_date DATE;
    daily_processed INTEGER;
    daily_inserted INTEGER;
    daily_skipped INTEGER;
    error_messages TEXT[] := '{}';
BEGIN
    -- Determine date range if not provided
    IF start_date IS NULL THEN
        SELECT DATE(MIN(timestamp)) INTO actual_start_date FROM meshtastic_telemetry;
    ELSE
        actual_start_date := start_date;
    END IF;
    
    IF end_date IS NULL THEN
        SELECT DATE(MAX(timestamp)) INTO actual_end_date FROM meshtastic_telemetry;
    ELSE
        actual_end_date := end_date;
    END IF;
    
    RAISE NOTICE 'Backfilling Meshtastic data from % to %', actual_start_date, actual_end_date;
    
    -- Process day by day
    current_date := actual_start_date;
    WHILE current_date <= actual_end_date LOOP
        -- Reset counters for this day
        daily_processed := 0;
        daily_inserted := 0;
        daily_skipped := 0;
        error_messages := '{}';
        
        BEGIN
            -- Get count of records for this day
            SELECT COUNT(*) INTO daily_processed
            FROM meshtastic_telemetry
            WHERE DATE(timestamp) = current_date;
            
            -- Insert data for this day with transformation and error handling
            WITH transformed_data AS (
                SELECT
                    ('mesh_' || sensor_id) AS device_id,
                    timestamp,
                    CASE 
                        WHEN ST_X(location::geometry) IS NOT NULL AND ST_Y(location::geometry) IS NOT NULL
                        THEN safe_make_geography_point(ST_X(location::geometry), ST_Y(location::geometry))
                        ELSE NULL
                    END AS location,
                    'meshtastic_stream'::sensor_source AS source,
                    pm25_ugm3,
                    pm10_ugm3,
                    pm1_ugm3,
                    temperature_c,
                    relative_humidity_pct AS humidity_pct,
                    barometric_pressure AS pressure_pa, -- Assuming already in Pa, adjust if needed
                    jsonb_build_object(
                        'original_id', id,
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
                        'pm100_ugm3', pm100_ugm3,
                        'ch3_voltage', ch3_voltage,
                        'ch3_current', ch3_current,
                        'rssi', rssi,
                        'snr', snr,
                        'source_table', 'meshtastic_telemetry'
                    ) AS metadata
                FROM meshtastic_telemetry
                WHERE DATE(timestamp) = current_date
                  AND sensor_id IS NOT NULL -- Skip records with null device identifier
                  AND timestamp IS NOT NULL -- Skip records with null timestamp
                ORDER BY timestamp ASC -- Critical for TimescaleDB performance
            )
            INSERT INTO sensor_readings (
                device_id, timestamp, location, source,
                pm25_ugm3, pm10_ugm3, pm1_ugm3, temperature_c, humidity_pct, pressure_pa,
                metadata
            )
            SELECT * FROM transformed_data
            ON CONFLICT (device_id, timestamp) DO NOTHING;
            
            -- Get number of records actually inserted (after conflict resolution)
            GET DIAGNOSTICS daily_inserted = ROW_COUNT;
            daily_skipped := daily_processed - daily_inserted;
            
            RAISE NOTICE 'Day %: Processed %, Inserted %, Skipped %', 
                        current_date, daily_processed, daily_inserted, daily_skipped;
            
        EXCEPTION
            WHEN OTHERS THEN
                error_messages := error_messages || (SQLERRM || ' for date ' || current_date::text);
                RAISE WARNING 'Error processing date %: %', current_date, SQLERRM;
        END;
        
        -- Return daily results
        RETURN QUERY SELECT current_date, daily_processed, daily_inserted, daily_skipped, error_messages;
        
        -- Move to next day
        current_date := current_date + INTERVAL '1 day';
    END LOOP;
    
    RAISE NOTICE 'Meshtastic backfill completed';
END;
$$;

-- ============================================================================
-- MASTER BACKFILL FUNCTION
-- ============================================================================

-- Function to run complete backfill process
CREATE OR REPLACE FUNCTION run_complete_backfill(
    start_date DATE DEFAULT NULL,
    end_date DATE DEFAULT NULL
) RETURNS TABLE (
    phase TEXT,
    processed_date DATE,
    records_processed INTEGER,
    records_inserted INTEGER,
    records_skipped INTEGER,
    errors TEXT[]
) LANGUAGE plpgsql AS $$
BEGIN
    RAISE NOTICE 'Starting complete sensor data backfill...';
    
    -- Phase 1: Backfill Pi sensor data
    RETURN QUERY 
    SELECT 'pi_sensors'::TEXT, * FROM backfill_pi_sensor_data(start_date, end_date);
    
    -- Phase 2: Backfill Meshtastic data
    RETURN QUERY 
    SELECT 'meshtastic'::TEXT, * FROM backfill_meshtastic_data(start_date, end_date);
    
    RAISE NOTICE 'Complete backfill finished';
END;
$$;

-- ============================================================================
-- VALIDATION HELPERS
-- ============================================================================

-- Function to get backfill summary statistics
CREATE OR REPLACE FUNCTION get_backfill_summary()
RETURNS TABLE (
    source_type TEXT,
    total_records BIGINT,
    date_range_start DATE,
    date_range_end DATE
) LANGUAGE sql AS $$
    -- Summary from sensor_readings
    SELECT 'unified_sensor_readings'::TEXT, 
           COUNT(*), 
           DATE(MIN(timestamp)), 
           DATE(MAX(timestamp))
    FROM sensor_readings
    
    UNION ALL
    
    -- Pi source summary
    SELECT 'pi_batch_in_unified'::TEXT, 
           COUNT(*), 
           DATE(MIN(timestamp)), 
           DATE(MAX(timestamp))
    FROM sensor_readings 
    WHERE source = 'pi_batch'
    
    UNION ALL
    
    -- Meshtastic source summary
    SELECT 'meshtastic_stream_in_unified'::TEXT, 
           COUNT(*), 
           DATE(MIN(timestamp)), 
           DATE(MAX(timestamp))
    FROM sensor_readings 
    WHERE source = 'meshtastic_stream'
    
    UNION ALL
    
    -- Original pi_sensor_raw for comparison
    SELECT 'original_pi_sensor_raw'::TEXT, 
           COUNT(*), 
           DATE(MIN(ts)), 
           DATE(MAX(ts))
    FROM pi_sensor_raw
    
    UNION ALL
    
    -- Original meshtastic_telemetry for comparison
    SELECT 'original_meshtastic_telemetry'::TEXT, 
           COUNT(*), 
           DATE(MIN(timestamp)), 
           DATE(MAX(timestamp))
    FROM meshtastic_telemetry;
$$;

-- ============================================================================
-- EXECUTION EXAMPLE (COMMENTED OUT FOR SAFETY)
-- ============================================================================

-- To run the backfill (uncomment and adjust dates as needed):
-- SELECT * FROM run_complete_backfill();
-- 
-- To check progress:
-- SELECT * FROM get_backfill_summary();
--
-- To validate specific records:
-- SELECT * FROM validate_sensor_migration('pi_12345', '2024-01-01 12:00:00+00', 'pi_batch');