-- Migration 007: Resolve sensor_readings table name conflict
-- The existing sensor_readings table from migration 002 conflicts with the unified table from migration 005/006
-- Solution: Rename the existing table to be more specific to its purpose

-- Rename the current sensor_readings table to pi_sensor_readings
-- This table is specifically for Pi sensor data with foreign key constraints to raspberry_pi_sensors
ALTER TABLE sensor_readings RENAME TO pi_sensor_readings;

-- Update any indexes that reference the old table name
-- (Index names are typically auto-updated when table is renamed, but being explicit)

-- The unified sensor_readings table from migrations 005/006 can now be created without conflict