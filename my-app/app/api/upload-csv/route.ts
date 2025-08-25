import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { SensorDataService } from '@/lib/database/supabase';
import { createHash } from 'crypto';
import { createClient } from '@supabase/supabase-js';

// Configure for large file uploads
export const runtime = 'nodejs';
export const maxDuration = 60; // 60 seconds timeout

// Generate deterministic UUID from sensor_id string
function sensorIdToUUID(sensorId: string): string {
  // Create MD5 hash of sensor_id and format as UUID v4
  const hash = createHash('md5').update(sensorId).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '4' + hash.slice(13, 16), // version 4
    ((parseInt(hash.slice(16, 17), 16) & 0x3) | 0x8).toString(16) + hash.slice(17, 20), // variant bits
    hash.slice(20, 32)
  ].join('-');
}

export async function POST(request: NextRequest) {
  try {
    console.log(`[upload-csv] 📦 Request received, Content-Length: ${request.headers.get('content-length')} bytes`);
    
    // First ensure the table exists
    const serviceRoleSupabase = createClient(
      process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    // Check if table exists and create if needed
    try {
      const { error: testError } = await serviceRoleSupabase
        .from('pi_sensor_raw')
        .select('id')
        .limit(1);
      
      if (testError && testError.message.includes('does not exist')) {
        console.log('[upload-csv] 🔧 Creating pi_sensor_raw table...');
        
        // Create table with basic schema
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS pi_sensor_raw (
              id                BIGSERIAL PRIMARY KEY,
              sensor_uuid       UUID            NOT NULL,
              ts                TIMESTAMPTZ     NOT NULL,
              location          TEXT            NOT NULL,
              altitude_m        REAL,
              pm25_ug_m3        REAL,
              pm10_ug_m3        REAL,
              temperature_c     REAL,
              rh_percent        REAL,
              created_at        TIMESTAMPTZ DEFAULT NOW()
          );
          
          ALTER TABLE pi_sensor_raw ENABLE ROW LEVEL SECURITY;
          CREATE POLICY IF NOT EXISTS "Public access" ON pi_sensor_raw FOR ALL USING (true) WITH CHECK (true);
        `;
        
        // Use REST API directly since RPC might not be available
        const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/exec`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
            'apikey': process.env.SUPABASE_SERVICE_ROLE_KEY!
          },
          body: JSON.stringify({ query: createTableSQL })
        });
        
        if (!response.ok) {
          console.warn('[upload-csv] ⚠️ Could not create table, continuing with upload attempt...');
        } else {
          console.log('[upload-csv] ✅ Table created successfully');
        }
      }
    } catch (setupError) {
      console.warn('[upload-csv] ⚠️ Table setup check failed, continuing with upload attempt...', setupError);
    }
    
    // Read raw text (uploaded CSV)
    const text = await request.text();
    const fileSizeMB = (text.length / (1024 * 1024)).toFixed(2);
    console.log(`[upload-csv] 📄 File size: ${fileSizeMB}MB, length: ${text.length} chars`);
    
    if (!text.trim()) {
      return NextResponse.json({ success: false, error: 'Empty CSV' }, { status: 400 });
    }

    // Check file size limit (20MB)
    if (text.length > 20 * 1024 * 1024) {
      return NextResponse.json({ 
        success: false, 
        error: `File too large (${fileSizeMB}MB). Maximum size is 20MB.` 
      }, { status: 413 });
    }

    // Parse CSV -> objects
    console.log(`[upload-csv] 🔄 Parsing CSV...`);
    const records: any[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });

    if (!records.length) {
      return NextResponse.json({ success: false, error: 'No rows parsed' }, { status: 400 });
    }

    console.log(`[upload-csv] Parsed ${records.length} records, mapping to Supabase format...`);

    // Chunked Supabase insert
    const mappedRecords = records.map(r => {
      const sensorId = r.sensor_id || r.from_node || r.from_short_name || 'csv-import';
      
      // Handle elevation with units (e.g., "503 ft")
      let elevationValue = 0;
      if (r.elevation) {
        const elevationStr = r.elevation.toString();
        if (elevationStr.includes('ft')) {
          // Convert feet to meters
          elevationValue = parseFloat(elevationStr.replace('ft', '').trim()) * 0.3048;
        } else if (elevationStr.includes('m')) {
          elevationValue = parseFloat(elevationStr.replace('m', '').trim());
        } else {
          elevationValue = parseFloat(elevationStr) || 0;
        }
      } else {
        elevationValue = parseFloat(r.altitude_m || r.altitude || 0);
      }
      
      return {
        sensor_uuid: sensorIdToUUID(sensorId),
        ts: r.timestamp || r.datetime || new Date().toISOString(),
        location: `${r.latitude || r.lat || 0},${r.longitude || r.lng || 0}`,
        altitude_m: elevationValue,
        pm25_ug_m3: parseFloat(r.pm25_ugm3 || r.pm25 || r.pm25Standard || r.pm25Environmental || 0),
        pm10_ug_m3: parseFloat(r.pm10_ugm3 || r.pm10 || r.pm10Standard || r.pm10Environmental || 0),
        temperature_c: parseFloat(r.temperature_c || r.temp || r.temperature || 0),
        rh_percent: parseFloat(r.relative_humidity_pct || r.humidity || r.rh || r.relativeHumidity || 0)
      };
    });

    console.log(`[upload-csv] Sample mapped record:`, mappedRecords[0]);

    console.log(`[upload-csv] ⬆️ Inserting ${mappedRecords.length} records to Supabase in chunks...`);
    const insertResult = await SensorDataService.insertBulkSensorReadings(mappedRecords);

    console.log(`[upload-csv] ✅ Upload complete: ${insertResult.inserted}/${records.length} records inserted`);
    return NextResponse.json({ success: true, rows: records.length, inserted: insertResult.inserted });
  } catch (err: any) {
    console.error('[upload-csv] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
} 