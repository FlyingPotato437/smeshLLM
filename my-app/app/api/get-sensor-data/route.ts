import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export async function GET(_request: NextRequest) {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
    console.log('[get-sensor-data] 📡 Fetching sensor data from uploaded_data and meshtastic_telemetry...');
    
    // Query both historical uploaded data and live meshtastic telemetry
    const [uploadedResult, meshtasticResult] = await Promise.allSettled([
      // Historical uploaded data (CSV uploads)
      supabase
        .from('uploaded_data')
        .select('sensor_uuid, ts, location, altitude_m, pm25_ug_m3, pm10_ug_m3, temperature_c, rh_percent')
        .order('ts', { ascending: false })
        .limit(2500),
      
      // Live meshtastic telemetry data
      supabase
        .from('meshtastic_telemetry')
        .select(`
          sensor_id as sensor_uuid,
          timestamp as ts,
          location,
          pm25_ugm3 as pm25_ug_m3,
          pm10_ugm3 as pm10_ug_m3,
          temperature_c,
          humidity_percent as rh_percent
        `)
        .eq('telemetry_type', 'air_quality')
        .order('timestamp', { ascending: false })
        .limit(2500)
    ]);
    
    // Combine results from both sources
    let combinedData: any[] = [];
    let errorMessages: string[] = [];
    
    if (uploadedResult.status === 'fulfilled' && uploadedResult.value.data) {
      combinedData.push(...uploadedResult.value.data);
      console.log(`[get-sensor-data] ✅ Retrieved ${uploadedResult.value.data.length} uploaded sensor readings`);
    } else if (uploadedResult.status === 'rejected') {
      errorMessages.push(`uploaded_data error: ${uploadedResult.reason}`);
      console.error('[get-sensor-data] ❌ uploaded_data error:', uploadedResult.reason);
    }
    
    if (meshtasticResult.status === 'fulfilled' && meshtasticResult.value.data) {
      combinedData.push(...meshtasticResult.value.data);
      console.log(`[get-sensor-data] ✅ Retrieved ${meshtasticResult.value.data.length} meshtastic telemetry readings`);
    } else if (meshtasticResult.status === 'rejected') {
      errorMessages.push(`meshtastic_telemetry error: ${meshtasticResult.reason}`);
      console.error('[get-sensor-data] ❌ meshtastic_telemetry error:', meshtasticResult.reason);
    }
    
    // Sort combined data by timestamp
    combinedData.sort((a, b) => new Date(b.ts || b.timestamp).getTime() - new Date(a.ts || a.timestamp).getTime());
    
    console.log(`[get-sensor-data] ✅ Combined total: ${combinedData.length} sensor readings from both sources`);
    
    // Log sample of the data for debugging
    if (combinedData && combinedData.length > 0) {
      console.log('[get-sensor-data] 📊 Sample data:', JSON.stringify(combinedData.slice(0, 3), null, 2));
    } else {
      console.log('[get-sensor-data] ⚠️ No data found in uploaded_data or meshtastic_telemetry tables');
      if (errorMessages.length > 0) {
        console.log('[get-sensor-data] ❌ Errors:', errorMessages);
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      data: combinedData,
      count: combinedData.length,
      sources: {
        uploaded_data: uploadedResult.status === 'fulfilled' ? uploadedResult.value.data?.length || 0 : 0,
        meshtastic_telemetry: meshtasticResult.status === 'fulfilled' ? meshtasticResult.value.data?.length || 0 : 0
      },
      errors: errorMessages.length > 0 ? errorMessages : undefined
    });
    
  } catch (err: any) {
    console.error('[get-sensor-data] ❌ Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
