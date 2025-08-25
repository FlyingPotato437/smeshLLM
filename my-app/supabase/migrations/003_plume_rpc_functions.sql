-- Function to get plume predictions with extracted coordinates
CREATE OR REPLACE FUNCTION get_plume_predictions_with_coords(
  hours_back INTEGER DEFAULT 24,
  max_results INTEGER DEFAULT 1000
)
RETURNS TABLE (
  id BIGINT,
  prediction_ts TIMESTAMPTZ,
  generated_at TIMESTAMPTZ,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  altitude_m REAL,
  conc_pm25_ug_m3 REAL,
  conc_pm10_ug_m3 REAL,
  model_version TEXT,
  rmse_validation REAL,
  metadata JSONB,
  created_at TIMESTAMPTZ
)
LANGUAGE sql STABLE
AS $$
  SELECT
    p.id,
    p.prediction_ts,
    p.generated_at,
    ST_Y(p.location::geometry) as latitude,
    ST_X(p.location::geometry) as longitude,
    p.altitude_m,
    p.conc_pm25_ug_m3,
    p.conc_pm10_ug_m3,
    p.model_version,
    p.rmse_validation,
    p.metadata,
    p.created_at
  FROM plume_predictions p
  WHERE p.prediction_ts >= NOW() - (hours_back || ' hours')::INTERVAL
  ORDER BY p.prediction_ts DESC
  LIMIT max_results;
$$; 