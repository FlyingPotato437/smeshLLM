import { createClient } from '@supabase/supabase-js';
import type { 
  PiSensorReading, 
  FireDetection, 
  MeteorologicalData, 
  SatelliteAOD, 
  PlumePrediction 
} from '@/types';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://vanqyqnugswokfchdhpk.supabase.co';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZhbnF5cW51Z3N3b2tmY2hkaHBrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3MDE0NDEsImV4cCI6MjA2NjI3NzQ0MX0.2GnvaZf7cZgnzV7VxMzJ0xxJsSe5jyWCf1LnRMoc9vk';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Service role client for admin operations
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?
  createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY) : null;

// Health check function
export async function testDatabaseConnection() {
  try {
    const { data, error } = await supabase.from('uploaded_data').select('count').limit(1);
    if (error) throw error;
    console.log('✅ Database connection successful');
    return { success: true, message: 'Database connected successfully' };
  } catch (error: any) {
    console.error('❌ Database connection failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Test function for comprehensive database operations
export async function runComprehensiveTests() {
  console.log('🧪 Starting comprehensive database tests...\n');
  
  const results = {
    connection: false,
    tables: {} as Record<string, boolean>,
    extensions: {} as Record<string, boolean>,
    functions: {} as Record<string, boolean>
  };

  // Test 1: Basic connection
  try {
    const connectionTest = await testDatabaseConnection();
    results.connection = connectionTest.success;
    console.log('1. Connection Test:', results.connection ? '✅ PASS' : '❌ FAIL');
  } catch (error) {
    console.log('1. Connection Test: ❌ FAIL');
  }

  // Test 2: Table existence
  const tables = [
    'uploaded_data', 
    'fire_detections', 
    'meteorology_grids', 
    'satellite_aod', 
    'plume_predictions',
    'knowledge_embeddings',
    'raspberry_pi_sensors',
    'sensor_readings',
    'prescribed_burns'
  ];
  
  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('count').limit(1);
      results.tables[table] = !error;
      console.log(`2. Table ${table}:`, results.tables[table] ? '✅ EXISTS' : '❌ MISSING');
    } catch (error) {
      results.tables[table] = false;
      console.log(`2. Table ${table}: ❌ MISSING`);
    }
  }

  // Test 3: Extensions
  const extensions = ['postgis', 'timescaledb', 'vector'];
  for (const ext of extensions) {
    try {
      const { error } = await supabase.rpc('check_extension', { extension_name: ext });
      results.extensions[ext] = !error;
      console.log(`3. Extension ${ext}:`, results.extensions[ext] ? '✅ ENABLED' : '❌ DISABLED');
    } catch (error) {
      // Try alternative method for checking extensions
      results.extensions[ext] = false;
      console.log(`3. Extension ${ext}: ❌ UNKNOWN`);
    }
  }

  // Test 4: Spatial functions
  try {
    const { error } = await supabase.rpc('get_sensor_data_in_bounds', {
      min_lat: 37.0,
      max_lat: 38.0,
      min_lng: -122.0,
      max_lng: -121.0
    });
    results.functions['spatial_bounds'] = !error;
    console.log('4. Spatial Functions:', results.functions['spatial_bounds'] ? '✅ WORKING' : '❌ FAILED');
  } catch (error) {
    results.functions['spatial_bounds'] = false;
    console.log('4. Spatial Functions: ❌ FAILED');
  }

  // Test 5: Vector similarity (if available)
  try {
    const { error } = await supabase.rpc('match_documents', {
      query_embedding: Array(1536).fill(0.001),
      match_threshold: 0.1,
      match_count: 5
    });
    results.functions['vector_similarity'] = !error;
    console.log('5. Vector Similarity:', results.functions['vector_similarity'] ? '✅ WORKING' : '❌ FAILED');
  } catch (error) {
    results.functions['vector_similarity'] = false;
    console.log('5. Vector Similarity: ❌ FAILED');
  }

  console.log('\n📊 Test Summary:');
  console.log('==================');
  console.log(`Connection: ${results.connection ? '✅' : '❌'}`);
  console.log(`Tables: ${Object.values(results.tables).filter(Boolean).length}/${Object.keys(results.tables).length} ✅`);
  console.log(`Extensions: ${Object.values(results.extensions).filter(Boolean).length}/${Object.keys(results.extensions).length} ✅`);
  console.log(`Functions: ${Object.values(results.functions).filter(Boolean).length}/${Object.keys(results.functions).length} ✅`);
  
  return results;
}

// Insert mock data for testing
export async function insertMockData() {
  console.log('🎭 Inserting mock data for testing...\n');
  
  try {
    // Mock Raspberry Pi sensor data
    const mockSensorData = {
      sensor_uuid: '550e8400-e29b-41d4-a716-446655440000',
      ts: new Date().toISOString(),
      location: 'POINT(-122.4194 37.7749)',
      altitude_m: 150.5,
      pm25_ug_m3: 25.3,
      pm10_ug_m3: 45.7,
      temperature_c: 22.5,
      rh_percent: 65.2
    };

    const { data: sensorResult, error: sensorError } = await supabase
      .from('uploaded_data')
      .insert([mockSensorData])
      .select();

    if (sensorError) throw new Error(`Sensor insert failed: ${sensorError.message}`);
    console.log('✅ Mock sensor data inserted:', sensorResult?.[0]?.id);

    // Mock fire detection
    const mockFireData = {
      acquisition_ts: new Date().toISOString(),
      location: 'POINT(-122.4094 37.7849)',
      frp_mw: 15.8,
      confidence: 'high'
    };

    const { data: fireResult, error: fireError } = await supabase
      .from('fire_detections')
      .insert([mockFireData])
      .select();

    if (fireError) throw new Error(`Fire insert failed: ${fireError.message}`);
    console.log('✅ Mock fire data inserted:', fireResult?.[0]?.id);

    // Mock plume prediction
    const mockPredictionData = {
      prediction_ts: new Date(Date.now() + 3600000).toISOString(), // 1 hour in future
      generated_at: new Date().toISOString(),
      location: 'POINT(-122.4294 37.7649)',
      altitude_m: 200.0,
      conc_pm25_ug_m3: 18.5,
      conc_pm10_ug_m3: 32.1,
      model_version: 'hybrid-v1.0',
      rmse_validation: 0.85
    };

    const { data: predictionResult, error: predictionError } = await supabase
      .from('plume_predictions')
      .insert([mockPredictionData])
      .select();

    if (predictionError) throw new Error(`Prediction insert failed: ${predictionError.message}`);
    console.log('✅ Mock prediction data inserted:', predictionResult?.[0]?.id);

    return { success: true, message: 'All mock data inserted successfully' };
  } catch (error: any) {
    console.error('❌ Mock data insertion failed:', error.message);
    return { success: false, error: error.message };
  }
}

// Simple in-memory cache for performance
const dataCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

// Database operations for Pi sensor data
export class SensorDataService {
  static getCache(key: string) {
    const cached = dataCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
      return cached.data;
    }
    dataCache.delete(key);
    return null;
  }

  static setCache(key: string, data: any) {
    dataCache.set(key, { data, timestamp: Date.now() });
    // Cleanup old entries
    if (dataCache.size > 50) {
      const oldestKey = dataCache.keys().next().value;
      if (oldestKey) {
        dataCache.delete(oldestKey);
      }
    }
  }

  static async insertSensorReading(reading: Omit<PiSensorReading, 'id'>) {
    const { data, error } = await supabase
      .from('uploaded_data')
      .insert([reading])
      .select();
    
    if (error) {
      console.error('Failed to insert sensor reading:', error.message);
      throw error;
    }
    
    return data?.[0];
  }

  static async getRecentSensorData(hours: number = 24, maxRows: number = 5000) {
    console.log(`[SensorDataService] Fetching live meshtastic data (${hours}h, max ${maxRows} rows)`);
    
    // Simple in-memory cache for 30 seconds to reduce DB load
    const cacheKey = `sensor_data_${hours}_${maxRows}`;
    const cachedData = this.getCache(cacheKey);
    if (cachedData) {
      console.log(`[SensorDataService] Using cached data (${cachedData.length} records)`);
      return cachedData;
    }
    
    try {
      // Optimized query - only select needed columns to reduce data transfer
      const selectColumns = 'id,sensor_id,timestamp,location,pm25_ugm3,pm10_ugm3,pm100_ugm3,pm1_ugm3,temperature_c,relative_humidity_pct,wind_direction,wind_speed,voltage,battery_level';
      const timeFilter = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
      
      // Single optimized query with batch processing
      const [meshtasticResult, airQualityResult] = await Promise.all([
        supabase
          .from('meshtastic_telemetry')
          .select(selectColumns)
          .gte('timestamp', timeFilter)
          .not('pm25_ugm3', 'is', null)
          .order('timestamp', { ascending: false })
          .limit(maxRows),
        
        supabase
          .from('latest_air_quality')
          .select('sensor_id,timestamp,pm25_ugm3,pm10_ugm3,pm100_ugm3,pm1_ugm3')
          .gte('timestamp', timeFilter)
          .order('timestamp', { ascending: false })
          .limit(Math.min(maxRows, 1000)) // Limit air quality to reasonable amount
      ]);
      
      if (meshtasticResult.error) {
        console.error('[SensorDataService] Meshtastic query error:', meshtasticResult.error);
        throw meshtasticResult.error;
      }

      if (airQualityResult.error) {
        console.warn('[SensorDataService] Air quality query warning:', airQualityResult.error);
      }

      // Transform meshtastic data to match expected format (optimized)
      const meshtasticData = meshtasticResult.data || [];
      const airQualityData = airQualityResult.data || [];
      
      const transformedData = meshtasticData.map(record => ({
        id: record.id,
        sensor_uuid: record.sensor_id,
        ts: record.timestamp,
        location: record.location,
        altitude_m: null, // Not available in meshtastic data
        pm25_ug_m3: record.pm25_ugm3,
        pm10_ug_m3: record.pm10_ugm3,
        pm100_ug_m3: record.pm100_ugm3,
        pm1_ug_m3: record.pm1_ugm3,
        temperature_c: record.temperature_c,
        rh_percent: record.relative_humidity_pct,
        barometric_pressure: null, // Removed for performance
        gas_resistance: null, // Removed for performance
        iaq: null, // Removed for performance
        wind_direction: record.wind_direction,
        wind_speed: record.wind_speed,
        voltage: record.voltage,
        battery_level: record.battery_level,
        rssi: null, // Removed for performance
        snr: null, // Removed for performance
        source: 'meshtastic_live'
      }));

      // Combine with air quality data if available
      const combinedData = [...transformedData];
      
      if (airQualityData && airQualityData.length > 0) {
        const airQualityTransformed = airQualityData.map(record => ({
          id: `aq_${record.sensor_id}_${Date.now()}`,
          sensor_uuid: record.sensor_id,
          ts: record.timestamp,
          location: null,
          altitude_m: null,
          pm25_ug_m3: record.pm25_ugm3,
          pm10_ug_m3: record.pm10_ugm3,
          pm100_ug_m3: record.pm100_ugm3,
          pm1_ug_m3: record.pm1_ugm3,
          temperature_c: null,
          rh_percent: null,
          barometric_pressure: null,
          gas_resistance: null,
          iaq: null,
          wind_direction: null,
          wind_speed: null,
          voltage: null,
          battery_level: null,
          rssi: null,
          snr: null,
          source: 'air_quality_latest'
        }));
        
        combinedData.push(...airQualityTransformed);
      }

      console.log(`[SensorDataService] Retrieved ${combinedData.length} live sensor readings`);
      
      // Cache the result for performance
      this.setCache(cacheKey, combinedData);
      
      return combinedData;

    } catch (error) {
      console.error('[SensorDataService] Failed to fetch live sensor data:', error);
      throw error;
    }
  }

  // LEGACY: Keep for backwards compatibility, but now queries live data
  static async getRecentSensorDataLegacy(hours: number = 24, maxRows: number = 100000) {
    const { data, error } = await supabase
      .from('uploaded_data')
      .select('*')
      .gte('ts', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
      .order('ts', { ascending: false })
      .limit(maxRows);
    
    if (error) throw error;
    return data;
  }

  static async getSensorDataInBounds(
    minLat: number, 
    maxLat: number, 
    minLng: number, 
    maxLng: number
  ) {
    const { data, error } = await supabase
      .rpc('get_sensor_data_in_bounds', {
        min_lat: minLat,
        max_lat: maxLat,
        min_lng: minLng,
        max_lng: maxLng
      });
    
    if (error) throw error;
    return data;
  }

  /**
   * Bulk insertion helper for CSV ingestion
   * Chunks the payload to stay within PostgREST limits (~10k rows per request)
   */
  static async insertBulkSensorReadings(readings: any[]) {
    if (!readings.length) return { inserted: 0 };

    const chunkSize = 1000; // safe default
    let inserted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (let i = 0; i < readings.length; i += chunkSize) {
      const chunk = readings.slice(i, i + chunkSize);
      console.log(`[SensorDataService] Inserting chunk ${Math.floor(i/chunkSize) + 1}/${Math.ceil(readings.length/chunkSize)} (${chunk.length} rows)`);
      
      const { data, error } = await supabase.from('uploaded_data').insert(chunk);
      if (error) {
        console.error(`Bulk insert chunk ${Math.floor(i/chunkSize) + 1} failed:`, error.message);
        failed += chunk.length;
        errors.push(`Chunk ${Math.floor(i/chunkSize) + 1}: ${error.message}`);
      } else {
        inserted += chunk.length;
        console.log(`✅ Chunk ${Math.floor(i/chunkSize) + 1} inserted successfully`);
      }
    }

    console.log(`[SensorDataService] Bulk insert complete: ${inserted} inserted, ${failed} failed`);
    
    if (errors.length > 0) {
      console.error('Bulk insert errors:', errors);
    }
    
    return { inserted, failed, errors };
  }
}

// Database operations for fire detections
export class FireDataService {
  static async insertFireDetection(detection: Omit<FireDetection, 'id'>) {
    const { data, error } = await supabase
      .from('fire_detections')
      .insert([{
        acquisition_ts: detection.acquisition_ts,
        location: `POINT(${detection.longitude} ${detection.latitude})`,
        frp_mw: detection.frp_mw,
        confidence: detection.confidence
      }])
      .select();
    
    if (error) throw error;
    return data;
  }

  static async getActiveFiresNearSensors(radiusKm: number = 50) {
    const { data, error } = await supabase
      .rpc('get_fires_near_sensors', { radius_km: radiusKm });
    
    if (error) throw error;
    return data;
  }
}

// Database operations for plume predictions
export class PredictionService {
  static async insertPrediction(prediction: Omit<PlumePrediction, 'id'>) {
    const { data, error } = await supabase
      .from('plume_predictions')
      .insert([{
        prediction_ts: prediction.prediction_ts,
        generated_at: prediction.generated_at,
        location: `POINT(${prediction.longitude} ${prediction.latitude})`,
        altitude_m: prediction.altitude_m,
        conc_pm25_ug_m3: prediction.conc_pm25_ug_m3,
        conc_pm10_ug_m3: prediction.conc_pm10_ug_m3,
        model_version: prediction.model_version,
        rmse_validation: prediction.rmse_validation,
        metadata: prediction.metadata
      }])
      .select();
    
    if (error) throw error;
    return data;
  }

  static async getLatestPredictions(hours: number = 6) {
    const { data, error } = await supabase
      .from('plume_predictions')
      .select('*')
      .gte('prediction_ts', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
      .order('generated_at', { ascending: false });
    
    if (error) throw error;
    return data;
  }
}

// Real-time subscriptions
export class RealtimeService {
  static subscribeToSensorData(callback: (payload: any) => void) {
    return supabase
      .channel('sensor-data')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'uploaded_data' },
        callback
      )
      .subscribe();
  }

  static subscribeToFireDetections(callback: (payload: any) => void) {
    return supabase
      .channel('fire-data')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'fire_detections' },
        callback
      )
      .subscribe();
  }

  static subscribeToPredictions(callback: (payload: any) => void) {
    return supabase
      .channel('predictions')
      .on('postgres_changes', 
        { event: 'INSERT', schema: 'public', table: 'plume_predictions' },
        callback
      )
      .subscribe();
  }
}

// Add utility to fetch all rows from a table in paginated chunks (works around PostgREST 1k row cap)
export async function fetchAllRows<T = any>(
  table: string,
  selectColumns: string = '*',
  orderColumn: string = 'id',
  ascending: boolean = true,
  batchSize: number = 1000,
  maxRows: number = 200000
): Promise<T[]> {
  let allData: T[] = [];
  let from = 0;

  while (true) {
    // Request the next page using range
    const { data, error } = await supabase
      .from(table)
      .select(selectColumns)
      .order(orderColumn, { ascending })
      .range(from, from + batchSize - 1);

    if (error) {
      throw new Error(`Failed to fetch rows from ${table}: ${error.message}`);
    }

    if (data && data.length > 0) {
      allData = allData.concat(data as T[]);
      from += batchSize;

      // Break if we received fewer rows than requested (end of table) or hit maxRows safeguard
      if (data.length < batchSize || allData.length >= maxRows) {
        break;
      }
    } else {
      break; // No more rows
    }
  }

  return allData.slice(0, maxRows);
}

export async function getSensorStatistics(hours: number = 24): Promise<{
  maxPm25: number;
  maxPm25SensorId: string | null;
  maxPm25Timestamp: string | null;
  meanPm25: number;
  count: number;
}> {
  // Restrict to recent window to avoid scanning full history unless needed
  const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

  // Get max PM2.5 row
  const { data: maxRows, error: maxErr } = await supabase
    .from('uploaded_data')
    .select('sensor_uuid, ts, pm25_ug_m3')
    .gte('ts', since)
    .order('pm25_ug_m3', { ascending: false })
    .limit(1);

  if (maxErr) throw new Error(`Failed to compute max PM2.5: ${maxErr.message}`);

  const maxRow = maxRows?.[0];

  // Get mean and count in one query using PostgREST aggregation
  const { data: avgRows, error: avgErr } = await supabase
    .from('uploaded_data')
    .select('avg_pm25:avg(pm25_ug_m3),count')
    .gte('ts', since);

  if (avgErr) throw new Error(`Failed to compute avg PM2.5: ${avgErr.message}`);

  const avgRow = avgRows?.[0] as any;

  return {
    maxPm25: Number(maxRow?.pm25_ug_m3) || 0,
    maxPm25SensorId: maxRow?.sensor_uuid || null,
    maxPm25Timestamp: maxRow?.ts || null,
    meanPm25: Number(avgRow?.avg_pm25) || 0,
    count: Number(avgRow?.count) || 0
  };
} 