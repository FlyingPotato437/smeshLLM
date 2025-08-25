import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface MeshtasticTelemetry {
  sensor_id: string;
  timestamp: string;
  telemetry_type: 'device' | 'environment' | 'air_quality' | 'power';
  location?: {
    latitude: number;
    longitude: number;
  };
  // Device metrics
  voltage?: number;
  battery_level?: number;
  air_util_tx?: number;
  uptime_seconds?: number;
  channel_utilization?: number;
  // Environmental metrics
  temperature_c?: number;
  relative_humidity_pct?: number;
  barometric_pressure?: number;
  gas_resistance?: number;
  iaq?: number;
  wind_direction?: number;
  wind_speed?: number;
  // Air quality metrics
  pm25_ugm3?: number;
  pm10_ugm3?: number;
  pm100_ugm3?: number;
  pm1_ugm3?: number;
  // Power metrics
  ch3_voltage?: number;
  ch3_current?: number;
  // Radio metrics
  rssi?: number;
  snr?: number;
  hop_limit?: number;
  hop_start?: number;
  // Raw data
  raw_data?: any;
}

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Handle both single telemetry record and batch
    const telemetryData: MeshtasticTelemetry[] = Array.isArray(data) ? data : [data];
    
    console.log(`📡 Processing ${telemetryData.length} Meshtastic telemetry records`);
    
    // Validate and transform data for database insertion
    const dbRecords = telemetryData.map((record) => {
      // Validate required fields
      if (!record.sensor_id || !record.timestamp || !record.telemetry_type) {
        throw new Error('Missing required fields: sensor_id, timestamp, telemetry_type');
      }
      
      // Build database record
      const dbRecord: any = {
        sensor_id: record.sensor_id,
        timestamp: new Date(record.timestamp).toISOString(),
        telemetry_type: record.telemetry_type,
        raw_data: record.raw_data || {}
      };
      
      // Add location if provided
      if (record.location?.latitude && record.location?.longitude) {
        dbRecord.location = `POINT(${record.location.longitude} ${record.location.latitude})`;
      }
      
      // Add optional metrics based on telemetry type
      if (record.telemetry_type === 'device') {
        if (record.voltage !== undefined) dbRecord.voltage = record.voltage;
        if (record.battery_level !== undefined) dbRecord.battery_level = record.battery_level;
        if (record.air_util_tx !== undefined) dbRecord.air_util_tx = record.air_util_tx;
        if (record.uptime_seconds !== undefined) dbRecord.uptime_seconds = record.uptime_seconds;
        if (record.channel_utilization !== undefined) dbRecord.channel_utilization = record.channel_utilization;
      }
      
      if (record.telemetry_type === 'environment') {
        if (record.temperature_c !== undefined) dbRecord.temperature_c = record.temperature_c;
        if (record.relative_humidity_pct !== undefined) dbRecord.relative_humidity_pct = record.relative_humidity_pct;
        if (record.barometric_pressure !== undefined) dbRecord.barometric_pressure = record.barometric_pressure;
        if (record.gas_resistance !== undefined) dbRecord.gas_resistance = record.gas_resistance;
        if (record.iaq !== undefined) dbRecord.iaq = record.iaq;
        if (record.wind_direction !== undefined) dbRecord.wind_direction = record.wind_direction;
        if (record.wind_speed !== undefined) dbRecord.wind_speed = record.wind_speed;
      }
      
      if (record.telemetry_type === 'air_quality') {
        if (record.pm25_ugm3 !== undefined) dbRecord.pm25_ugm3 = record.pm25_ugm3;
        if (record.pm10_ugm3 !== undefined) dbRecord.pm10_ugm3 = record.pm10_ugm3;
        if (record.pm100_ugm3 !== undefined) dbRecord.pm100_ugm3 = record.pm100_ugm3;
        if (record.pm1_ugm3 !== undefined) dbRecord.pm1_ugm3 = record.pm1_ugm3;
      }
      
      if (record.telemetry_type === 'power') {
        if (record.ch3_voltage !== undefined) dbRecord.ch3_voltage = record.ch3_voltage;
        if (record.ch3_current !== undefined) dbRecord.ch3_current = record.ch3_current;
      }
      
      // Add radio metrics (common to all types)
      if (record.rssi !== undefined) dbRecord.rssi = record.rssi;
      if (record.snr !== undefined) dbRecord.snr = record.snr;
      if (record.hop_limit !== undefined) dbRecord.hop_limit = record.hop_limit;
      if (record.hop_start !== undefined) dbRecord.hop_start = record.hop_start;
      
      return dbRecord;
    });
    
    // Insert into Supabase
    const { data: insertedData, error } = await supabase
      .from('meshtastic_telemetry')
      .insert(dbRecords)
      .select('id, sensor_id, timestamp, telemetry_type');
    
    if (error) {
      console.error('Supabase insertion error:', error);
      return NextResponse.json(
        { 
          success: false, 
          error: 'Database insertion failed',
          details: error.message 
        },
        { status: 500 }
      );
    }
    
    console.log(`✅ Successfully inserted ${insertedData.length} Meshtastic telemetry records`);
    
    // Log telemetry types for debugging
    const typeCounts = dbRecords.reduce((acc, record) => {
      acc[record.telemetry_type] = (acc[record.telemetry_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    console.log('📊 Telemetry types processed:', typeCounts);
    
    return NextResponse.json({
      success: true,
      message: `Successfully ingested ${insertedData.length} Meshtastic telemetry records`,
      processed: insertedData.length,
      telemetry_types: typeCounts,
      data: insertedData
    });
    
  } catch (error) {
    console.error('Meshtastic ingestion error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sensor_id = searchParams.get('sensor_id');
    const telemetry_type = searchParams.get('telemetry_type');
    const limit = parseInt(searchParams.get('limit') || '100');
    const hours = parseInt(searchParams.get('hours') || '24');
    
    // Build query
    let query = supabase
      .from('meshtastic_telemetry')
      .select('*')
      .gte('timestamp', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
      .order('timestamp', { ascending: false })
      .limit(limit);
    
    if (sensor_id) {
      query = query.eq('sensor_id', sensor_id);
    }
    
    if (telemetry_type) {
      query = query.eq('telemetry_type', telemetry_type);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.error('Query error:', error);
      return NextResponse.json(
        { success: false, error: 'Query failed' },
        { status: 500 }
      );
    }
    
    return NextResponse.json({
      success: true,
      data,
      count: data.length,
      parameters: {
        sensor_id,
        telemetry_type,
        limit,
        hours
      }
    });
    
  } catch (error) {
    console.error('Meshtastic query error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
} 