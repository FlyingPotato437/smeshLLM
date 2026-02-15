/**
 * Production Data Ingestion Service for Prescribed Fire Platform
 * Handles real-time ingestion from Raspberry Pi sensors, NASA FIRMS, NOAA, and satellite data
 * 
 * Architecture: Event-driven microservice with rate limiting, error handling, and validation
 * Performance: Designed for 10M+ readings/day with sub-second latency
 */

import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

// Lazy-initialized Supabase client with service role for data ingestion
let _supabaseClient: ReturnType<typeof createClient> | null = null;
function getSupabaseClient() {
  if (!_supabaseClient) {
    _supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _supabaseClient;
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// Enhanced datetime validation to handle multiple formats
const flexibleDatetime = z.string().transform((val, ctx) => {
  // Try various datetime formats
  const formats = [
    // ISO formats
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z?$/,
    // Standard formats
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/,
    /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/,
    /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/,
    // Date only formats (will add default time)
    /^\d{4}-\d{2}-\d{2}$/,
    /^\d{2}\/\d{2}\/\d{4}$/,
    /^\d{2}-\d{2}-\d{4}$/
  ];

  let dateValue: Date;

  try {
    // First try direct parsing
    dateValue = new Date(val);
    
    // If invalid, try manual parsing
    if (isNaN(dateValue.getTime())) {
      // Handle MM/dd/yyyy format
      if (val.match(/^\d{2}\/\d{2}\/\d{4}/)) {
        const [datePart, timePart = "00:00:00"] = val.split(' ');
        const [month, day, year] = datePart.split('/');
        dateValue = new Date(`${year}-${month}-${day}T${timePart}Z`);
      }
      // Handle dd-mm-yyyy format  
      else if (val.match(/^\d{2}-\d{2}-\d{4}/)) {
        const [datePart, timePart = "00:00:00"] = val.split(' ');
        const [day, month, year] = datePart.split('-');
        dateValue = new Date(`${year}-${month}-${day}T${timePart}Z`);
      }
      // Handle yyyy-mm-dd without time
      else if (val.match(/^\d{4}-\d{2}-\d{2}$/)) {
        dateValue = new Date(`${val}T00:00:00Z`);
      }
      else {
        throw new Error(`Invalid date format: ${val}`);
      }
    }
    
    // Validate the parsed date
    if (isNaN(dateValue.getTime())) {
      throw new Error(`Invalid date: ${val}`);
    }
    
    return dateValue.toISOString();
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid datetime format: ${val}. Expected formats: YYYY-MM-DD, YYYY-MM-DDTHH:mm:ssZ, MM/dd/yyyy, etc.`
    });
    return z.NEVER;
  }
});

// Raspberry Pi sensor reading schema
const SensorReadingSchema = z.object({
  sensor_id: z.string().min(1),
  timestamp: flexibleDatetime,
  location: z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180)
  }).optional(),
  
  // Air quality measurements
  pm25_ugm3: z.number().min(0).max(1000).optional(),
  pm10_ugm3: z.number().min(0).max(1000).optional(),
  pm1_ugm3: z.number().min(0).max(1000).optional(),
  
  // Environmental conditions
  temperature_c: z.number().min(-50).max(60).optional(),
  relative_humidity_pct: z.number().min(0).max(100).optional(),
  pressure_pa: z.number().min(80000).max(120000).optional(),
  wind_speed_ms: z.number().min(0).max(100).optional(),
  wind_direction_deg: z.number().min(0).max(360).optional(),
  
  // Additional sensors
  co_ppm: z.number().min(0).max(1000).optional(),
  co2_ppm: z.number().min(300).max(5000).optional(),
  visibility_m: z.number().min(0).max(50000).optional(),
  light_intensity_lux: z.number().min(0).optional(),
  
  // Quality metadata
  data_quality_score: z.number().min(0).max(1).default(1.0),
  calibration_offset: z.record(z.number()).optional(),
  raw_data: z.record(z.any()).optional()
});

// NASA FIRMS fire detection schema
const FireDetectionSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  scan: z.number(),
  track: z.number(),
  acq_date: z.string(),
  acq_time: z.string(),
  satellite: z.string(),
  instrument: z.string(),
  confidence: z.union([z.literal('low'), z.literal('nominal'), z.literal('high')]),
  version: z.string(),
  bright_ti4: z.number(),
  bright_ti5: z.number(),
  frp: z.number().optional(),
  daynight: z.string()
});

// NOAA meteorological data schema
const MeteorologicalSchema = z.object({
  gridId: z.string(),
  timestamp: flexibleDatetime,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  pressure_level_pa: z.number().default(0),
  
  // Wind components
  wind_u_ms: z.number().optional(),
  wind_v_ms: z.number().optional(),
  wind_w_ms: z.number().optional(),
  wind_speed_ms: z.number().optional(),
  wind_direction_deg: z.number().min(0).max(360).optional(),
  
  // Thermodynamic variables
  temperature_k: z.number().min(200).max(330).optional(),
  relative_humidity_pct: z.number().min(0).max(100).optional(),
  pressure_pa: z.number().optional(),
  
  // Atmospheric stability
  mixing_height_m: z.number().min(0).optional(),
  boundary_layer_height_m: z.number().min(0).optional(),
  
  // Additional fields
  precipitation_rate_mmh: z.number().min(0).optional(),
  cloud_cover_pct: z.number().min(0).max(100).optional(),
  visibility_m: z.number().min(0).optional(),
  solar_radiation_wm2: z.number().min(0).optional(),
  
  // Metadata
  model_run: flexibleDatetime,
  forecast_hour: z.number().min(0),
  data_source: z.string().default('NOAA_GFS')
});

// Satellite AOD schema
const SatelliteAODSchema = z.object({
  satellite: z.string(),
  sensor: z.string().optional(),
  timestamp: flexibleDatetime,
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  
  // AOD measurements
  aod_550nm: z.number().min(0).max(5).optional(),
  aod_470nm: z.number().min(0).max(5).optional(),
  aod_660nm: z.number().min(0).max(5).optional(),
  aod_870nm: z.number().min(0).max(5).optional(),
  
  // Quality metadata
  quality_flag: z.number().optional(),
  cloud_fraction: z.number().min(0).max(1).optional(),
  aerosol_type: z.string().optional(),
  pixel_size_km: z.number().min(0).optional(),
  algorithm_version: z.string().optional()
});

// ============================================================================
// RATE LIMITING AND BATCHING
// ============================================================================

class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  
  constructor(private maxRequests: number, private timeWindow: number) {}
  
  canProcess(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];
    
    // Remove old requests outside time window
    const validRequests = requests.filter(time => now - time < this.timeWindow);
    
    if (validRequests.length >= this.maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    this.requests.set(key, validRequests);
    return true;
  }
}

class BatchProcessor<T> {
  private batch: T[] = [];
  private timer: NodeJS.Timeout | null = null;
  
  constructor(
    private batchSize: number,
    private maxWaitMs: number,
    private processor: (batch: T[]) => Promise<void>
  ) {}
  
  add(item: T): void {
    this.batch.push(item);
    
    if (this.batch.length >= this.batchSize) {
      this.flush();
    } else if (this.timer === null) {
      this.timer = setTimeout(() => this.flush(), this.maxWaitMs);
    }
  }
  
  private async flush(): Promise<void> {
    if (this.batch.length === 0) return;
    
    const currentBatch = [...this.batch];
    this.batch = [];
    
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    
    try {
      await this.processor(currentBatch);
    } catch (error) {
      console.error('Batch processing error:', error);
      // In production, implement retry logic and dead letter queue
    }
  }
}

// ============================================================================
// DATA INGESTION SERVICE
// ============================================================================

export class DataIngestionService {
  private sensorRateLimiter = new RateLimiter(1000, 60000); // 1000 requests per minute
  private sensorBatchProcessor: BatchProcessor<any>;
  private fireDetectionBatchProcessor: BatchProcessor<any>;
  private meteorologicalBatchProcessor: BatchProcessor<any>;
  private aodBatchProcessor: BatchProcessor<any>;
  
  constructor() {
    // Initialize batch processors
    this.sensorBatchProcessor = new BatchProcessor(
      1, // batch size - immediate processing for testing
      1000, // max wait 1 second
      this.processSensorReadingBatch.bind(this)
    );
    
    this.fireDetectionBatchProcessor = new BatchProcessor(
      1, // immediate processing
      1000,
      this.processFireDetectionBatch.bind(this)
    );
    
    this.meteorologicalBatchProcessor = new BatchProcessor(
      200,
      15000,
      this.processMeteorologicalBatch.bind(this)
    );
    
    this.aodBatchProcessor = new BatchProcessor(
      100,
      10000,
      this.processAODBatch.bind(this)
    );
  }
  
  // ========================================================================
  // RASPBERRY PI SENSOR INGESTION
  // ========================================================================
  
  async ingestSensorReading(data: unknown): Promise<{ success: boolean; error?: string }> {
    try {
      // Validate input data
      const validated = SensorReadingSchema.parse(data);
      
      // Rate limiting per sensor
      if (!this.sensorRateLimiter.canProcess(validated.sensor_id)) {
        return { success: false, error: 'Rate limit exceeded for sensor' };
      }
      
      // Transform to database format
      const dbRecord = {
        sensor_uuid: `550e8400-e29b-41d4-a716-${validated.sensor_id.replace('0x', '').padStart(12, '0')}`,
        ts: new Date(validated.timestamp).toISOString(),
        location: validated.location ? 
          `POINT(${validated.location.longitude} ${validated.location.latitude})` : null,
        pm25_ug_m3: validated.pm25_ugm3,
        pm10_ug_m3: validated.pm10_ugm3,
        temperature_c: validated.temperature_c,
        rh_percent: validated.relative_humidity_pct
      };
      
      // Add to batch processor
      this.sensorBatchProcessor.add(dbRecord);
      
      return { success: true };
      
    } catch (error) {
      console.error('Sensor reading validation error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      };
    }
  }
  
  private async processSensorReadingBatch(batch: any[]): Promise<void> {
    try {
      // PHASE 1: Write to original table (primary write - must not fail)
      const { error } = await getSupabaseClient()
        .from('pi_sensor_raw')
        .insert(batch);
      
      if (error) {
        console.error('Sensor batch insert error:', error);
        throw error;
      }
      
      console.log(`Successfully inserted ${batch.length} sensor readings to pi_sensor_raw`);
      
      // PHASE 1: Dual-write to new unified table (non-blocking)
      try {
        const unifiedBatch = batch.map(record => this.transformToUnifiedSchema(record, 'pi_batch'));
        
        const { error: unifiedError } = await getSupabaseClient()
          .from('sensor_readings')
          .insert(unifiedBatch);
        
        if (unifiedError) {
          console.error('Unified table insert error (non-blocking):', unifiedError);
          // Log error but don't fail the main process
          console.error('Failed unified batch sample:', JSON.stringify(unifiedBatch[0], null, 2));
        } else {
          console.log(`Successfully inserted ${unifiedBatch.length} sensor readings to sensor_readings`);
        }
      } catch (transformError) {
        console.error('Data transformation error for unified table (non-blocking):', transformError);
        // Log transformation errors but continue
      }
      
      // Trigger real-time updates for active burns
      await this.triggerRealTimeUpdates('pi_sensor_raw', batch);
      
    } catch (error) {
      console.error('Sensor batch processing error:', error);
      throw error;
    }
  }

  /**
   * Transform Pi sensor data to unified sensor_readings schema
   */
  private transformToUnifiedSchema(record: any, source: 'pi_batch' | 'meshtastic_stream'): any {
    const baseTransform = {
      device_id: source === 'pi_batch' ? `pi_${record.sensor_uuid}` : `mesh_${record.sensor_id}`,
      timestamp: record.ts || record.timestamp,
      source: source,
      created_at: new Date().toISOString()
    };

    if (source === 'pi_batch') {
      return {
        ...baseTransform,
        // Handle location transformation safely
        location: record.location ? 
          (typeof record.location === 'string' ? record.location : 
           `POINT(${record.longitude || 0} ${record.latitude || 0})`) : null,
        pm25_ugm3: record.pm25_ug_m3,
        pm10_ugm3: record.pm10_ug_m3,
        pm1_ugm3: null, // Pi sensors don't have PM1
        temperature_c: record.temperature_c,
        humidity_pct: record.rh_percent,
        pressure_pa: null, // Pi sensors don't have pressure
        metadata: {
          original_id: record.id,
          altitude_m: record.altitude_m,
          source_table: 'pi_sensor_raw'
        }
      };
    } else {
      // Meshtastic transformation (for future use)
      return {
        ...baseTransform,
        location: record.location,
        pm25_ugm3: record.pm25_ugm3,
        pm10_ugm3: record.pm10_ugm3,
        pm1_ugm3: record.pm1_ugm3,
        temperature_c: record.temperature_c,
        humidity_pct: record.relative_humidity_pct,
        pressure_pa: record.barometric_pressure,
        metadata: {
          original_id: record.id,
          telemetry_type: record.telemetry_type,
          voltage: record.voltage,
          battery_level: record.battery_level,
          source_table: 'meshtastic_telemetry'
        }
      };
    }
  }
  
  // ========================================================================
  // NASA FIRMS FIRE DETECTION INGESTION
  // ========================================================================
  
  async ingestFireDetection(data: unknown): Promise<{ success: boolean; error?: string }> {
    try {
      const validated = FireDetectionSchema.parse(data);
      
      // Convert to database format (fire_detections schema)
      const dbRecord = {
        acquisition_ts: new Date(`${validated.acq_date}T${validated.acq_time.padStart(4, '0').slice(0, 2)}:${validated.acq_time.padStart(4, '0').slice(2, 4)}:00Z`).toISOString(),
        location: `POINT(${validated.longitude} ${validated.latitude})`,
        frp_mw: validated.frp,
        confidence: validated.confidence
      };
      
      this.fireDetectionBatchProcessor.add(dbRecord);
      return { success: true };
      
    } catch (error) {
      console.error('Fire detection validation error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      };
    }
  }
  
  private async processFireDetectionBatch(batch: any[]): Promise<void> {
    try {
      const { error } = await getSupabaseClient()
        .from('fire_detections')
        .insert(batch);
      
      if (error) {
        console.error('Fire detection batch insert error:', error);
        throw error;
      }
      
      console.log(`Successfully inserted ${batch.length} fire detections`);
      
      // Check for prescribed burn associations
      await this.associateWithPrescribedBurns(batch);
      
    } catch (error) {
      console.error('Fire detection batch processing error:', error);
      throw error;
    }
  }
  
  // ========================================================================
  // NOAA METEOROLOGICAL DATA INGESTION
  // ========================================================================
  
  async ingestMeteorologicalData(data: unknown): Promise<{ success: boolean; error?: string }> {
    try {
      const validated = MeteorologicalSchema.parse(data);
      
      const dbRecord = {
        ...validated,
        location: `POINT(${validated.longitude} ${validated.latitude})`,
        timestamp: new Date(validated.timestamp).toISOString(),
        model_run: new Date(validated.model_run).toISOString()
      };
      
      this.meteorologicalBatchProcessor.add(dbRecord);
      return { success: true };
      
    } catch (error) {
      console.error('Meteorological data validation error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      };
    }
  }
  
  private async processMeteorologicalBatch(batch: any[]): Promise<void> {
    try {
      const { error } = await getSupabaseClient()
        .from('meteorological_data')
        .insert(batch);
      
      if (error) {
        console.error('Meteorological batch insert error:', error);
        throw error;
      }
      
      console.log(`Successfully inserted ${batch.length} meteorological records`);
      
    } catch (error) {
      console.error('Meteorological batch processing error:', error);
      throw error;
    }
  }
  
  // ========================================================================
  // SATELLITE AOD INGESTION
  // ========================================================================
  
  async ingestSatelliteAOD(data: unknown): Promise<{ success: boolean; error?: string }> {
    try {
      const validated = SatelliteAODSchema.parse(data);
      
      const dbRecord = {
        ...validated,
        location: `POINT(${validated.longitude} ${validated.latitude})`,
        timestamp: new Date(validated.timestamp).toISOString()
      };
      
      this.aodBatchProcessor.add(dbRecord);
      return { success: true };
      
    } catch (error) {
      console.error('Satellite AOD validation error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Validation failed' 
      };
    }
  }
  
  private async processAODBatch(batch: any[]): Promise<void> {
    try {
      const { error } = await getSupabaseClient()
        .from('satellite_aod')
        .insert(batch);
      
      if (error) {
        console.error('Satellite AOD batch insert error:', error);
        throw error;
      }
      
      console.log(`Successfully inserted ${batch.length} AOD observations`);
      
    } catch (error) {
      console.error('AOD batch processing error:', error);
      throw error;
    }
  }
  
  // ========================================================================
  // UTILITY METHODS
  // ========================================================================
  
  private confidenceToPercent(confidence: string): number {
    switch (confidence) {
      case 'low': return 30;
      case 'nominal': return 75;
      case 'high': return 95;
      default: return 50;
    }
  }
  
  private async associateWithPrescribedBurns(fireDetections: any[]): Promise<void> {
    try {
      // Query for active prescribed burns
      const { data: activeBurns } = await getSupabaseClient()
        .from('prescribed_burns')
        .select('burn_id, burn_area')
        .in('current_phase', ['ignition', 'active', 'mop_up']);
      
      if (!activeBurns || activeBurns.length === 0) return;
      
      // Check each fire detection against burn areas
      for (const detection of fireDetections) {
        for (const burn of activeBurns) {
          // Use PostGIS ST_Within to check if detection is within burn area
          const { data } = await getSupabaseClient().rpc('point_within_polygon', {
            point_wkt: detection.location,
            polygon_wkt: burn.burn_area
          });
          
          if (data) {
            // Update fire detection with prescribed burn association
            await getSupabaseClient()
              .from('fire_detections')
              .update({
                prescribed_burn_id: burn.burn_id,
                is_prescribed_fire: true
              })
              .eq('location', detection.location)
              .eq('timestamp', detection.timestamp);
          }
        }
      }
    } catch (error) {
      console.error('Error associating fire detections with prescribed burns:', error);
    }
  }
  
  private async triggerRealTimeUpdates(table: string, batch: any[]): Promise<void> {
    try {
      // Publish real-time updates for dashboard
      const channel = getSupabaseClient().channel('data-updates');
      
      await channel.send({
        type: 'broadcast',
        event: 'data_update',
        payload: {
          table,
          count: batch.length,
          latest_timestamp: batch[batch.length - 1]?.timestamp,
          summary: this.generateBatchSummary(table, batch)
        }
      });
      
    } catch (error) {
      console.error('Real-time update error:', error);
    }
  }
  
  private generateBatchSummary(table: string, batch: any[]): Record<string, any> {
    switch (table) {
      case 'sensor_readings':
        return {
          avg_pm25: batch.reduce((sum, r) => sum + (r.pm25_ugm3 || 0), 0) / batch.length,
          sensor_count: new Set(batch.map(r => r.sensor_id)).size,
          max_pm25: Math.max(...batch.map(r => r.pm25_ugm3 || 0))
        };
      default:
        return { count: batch.length };
    }
  }
  
  // ========================================================================
  // HEALTH CHECK AND MONITORING
  // ========================================================================
  
  async getHealthStatus(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    metrics: Record<string, any>;
  }> {
    try {
      // Check database connectivity
      const { error } = await getSupabaseClient().from('raspberry_pi_sensors').select('count').limit(1);
      
      if (error) {
        return {
          status: 'unhealthy',
          metrics: { error: error.message }
        };
      }
      
      // Check recent data ingestion rates
      const { data: recentReadings } = await getSupabaseClient()
        .from('sensor_readings')
        .select('count')
        .gte('timestamp', new Date(Date.now() - 15 * 60 * 1000).toISOString());
      
      const readingsPerMinute = recentReadings?.[0]?.count || 0;
      
      return {
        status: readingsPerMinute > 0 ? 'healthy' : 'degraded',
        metrics: {
          recent_readings_per_minute: readingsPerMinute,
          batch_queue_sizes: {
            sensor: this.sensorBatchProcessor['batch'].length,
            fire: this.fireDetectionBatchProcessor['batch'].length,
            meteorological: this.meteorologicalBatchProcessor['batch'].length,
            aod: this.aodBatchProcessor['batch'].length
          },
          timestamp: new Date().toISOString()
        }
      };
      
    } catch (error) {
      return {
        status: 'unhealthy',
        metrics: { error: error instanceof Error ? error.message : 'Unknown error' }
      };
    }
  }
}

// Export singleton instance
export const dataIngestionService = new DataIngestionService();

// ============================================================================
// API ENDPOINT HELPERS
// ============================================================================

export async function handleSensorWebhook(request: Request): Promise<Response> {
  try {
    const data = await request.json();
    const result = await dataIngestionService.ingestSensorReading(data);
    
    return Response.json(result, {
      status: result.success ? 200 : 400
    });
    
  } catch (error) {
    console.error('Sensor webhook error:', error);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function handleFireDetectionWebhook(request: Request): Promise<Response> {
  try {
    const data = await request.json();
    
    // Handle both single detection and batch
    const detections = Array.isArray(data) ? data : [data];
    const results = await Promise.all(
      detections.map(d => dataIngestionService.ingestFireDetection(d))
    );
    
    const successCount = results.filter(r => r.success).length;
    
    return Response.json({
      success: successCount === detections.length,
      processed: successCount,
      total: detections.length,
      errors: results.filter(r => !r.success).map(r => r.error)
    });
    
  } catch (error) {
    console.error('Fire detection webhook error:', error);
    return Response.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 