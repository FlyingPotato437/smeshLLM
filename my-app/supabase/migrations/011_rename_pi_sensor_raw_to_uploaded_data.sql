-- Migration 011: Rename pi_sensor_raw to uploaded_data
-- User requested to rename the Pi upload table to better reflect its purpose

-- Rename the table
ALTER TABLE pi_sensor_raw RENAME TO uploaded_data;

-- Update sequence name to match
ALTER SEQUENCE pi_sensor_raw_id_seq RENAME TO uploaded_data_id_seq;

-- Update the sequence ownership
ALTER SEQUENCE uploaded_data_id_seq OWNED BY uploaded_data.id;

-- Add comment to clarify purpose
COMMENT ON TABLE uploaded_data IS 'Historical sensor data uploaded in batches from Raspberry Pi devices';
COMMENT ON COLUMN uploaded_data.sensor_uuid IS 'UUID of the Pi sensor device that collected this data';
COMMENT ON COLUMN uploaded_data.ts IS 'Timestamp when the sensor measurement was taken';
COMMENT ON COLUMN uploaded_data.location IS 'GPS coordinates of the sensor at time of measurement';