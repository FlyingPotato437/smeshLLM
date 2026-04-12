import { NextRequest, NextResponse } from 'next/server';
import { SensorDataService } from '@/lib/database/supabase';
import { createHash } from 'crypto';

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

// In-memory session storage (in production, use Redis or similar)
const sessionDataStore = new Map<string, {
  csvData: any[];
  originalHeaders: string[];
  uploadTimestamp: number;
  filename?: string;
}>();

// Clean up expired sessions (older than 24 hours)
const EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours
setInterval(() => {
  const now = Date.now();
  for (const [sessionId, data] of sessionDataStore.entries()) {
    if (now - data.uploadTimestamp > EXPIRY_TIME) {
      sessionDataStore.delete(sessionId);
    }
  }
}, 60 * 60 * 1000); // Clean up every hour

// -------------------------------------------------------------
// Configuration & Verbose Debugging
// -------------------------------------------------------------

// Note: App Router routes always run in the Node.js runtime unless explicitly set to `edge`.
// The older `api.bodyParser.sizeLimit` config object isn't supported here, so we just keep
// things simple. Large CSV bodies (a few MB) are fine – Next streams them to our handler.
console.log('[session-data] 🛠  Route initialised')

export async function POST(request: NextRequest) {
  try {
    const { sessionId, csvData, headers, filename } = await request.json();

    if (!sessionId || !csvData || !Array.isArray(csvData)) {
      return NextResponse.json(
        { success: false, error: 'Invalid request data' },
        { status: 400 }
      );
    }

    console.log(`[session-data] 📥 Received upload – sessionId=${sessionId}, rows=${csvData.length}`)

    // Store session data in memory for immediate access
    sessionDataStore.set(sessionId, {
      csvData,
      originalHeaders: headers || [],
      uploadTimestamp: Date.now(),
      filename
    });

    // ------------------------------------------------------------------
    // OPTIONAL ‑ Persist to Supabase (best-effort, non-blocking)
    // ------------------------------------------------------------------
    try {
      const mappedReadings: any[] = csvData.slice(0, 1000) // safety limit
        .map((row: any) => {
          const sensorId = row.sensor_id || row.from_node || row.fromNode || 'csv-import';
          const latitude = parseFloat(row.latitude || row.lat || 37.4275);
          const longitude = parseFloat(row.longitude || row.lon || row.lng || -122.1697);
          return {
            // Mandatory fields for `pi_sensor_raw` table
            sensor_uuid: sensorIdToUUID(sensorId),
            ts: row.timestamp || row.datetime || row.date || new Date().toISOString(),
            location: `POINT(${Number.isFinite(longitude) ? longitude : -122.1697} ${Number.isFinite(latitude) ? latitude : 37.4275})`,
            altitude_m: parseFloat(row.altitude_m || row.elevation || 0),
            pm25_ug_m3: parseFloat(row.pm25_ugm3 || row.pm25 || row.pm25Standard || 0),
            pm10_ug_m3: parseFloat(row.pm10_ugm3 || row.pm10 || row.pm10Standard || 0),
            temperature_c: parseFloat(row.temperature_c || row.temp || row.temperature || 0),
            rh_percent: parseFloat(row.relative_humidity_pct || row.humidity || row.rh || 0)
          };
        })
        .filter(r => !isNaN(r.pm25_ug_m3) && r.location.includes('POINT'));

      if (mappedReadings.length) {
        console.log(`[session-data] ⬆️  Inserting ${mappedReadings.length} readings into Supabase…`);
        await SensorDataService.insertBulkSensorReadings(mappedReadings);
      }
    } catch (dbErr) {
      console.error('[session-data] ⚠️  Supabase insertion failed (non-fatal):', dbErr);
    }

    return NextResponse.json({
      success: true,
      message: `Stored ${csvData.length} rows for session`,
      rowCount: csvData.length,
      headers: headers || []
    });

  } catch (error) {
    console.error('Session data storage error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to store session data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID required' },
        { status: 400 }
      );
    }

    const sessionData = sessionDataStore.get(sessionId);
    if (!sessionData) {
      return NextResponse.json(
        { success: false, error: 'Session data not found' },
        { status: 404 }
      );
    }

    let filteredData = sessionData.csvData;

    // Apply date range filter if provided
    if (startDate || endDate) {
      const start = startDate ? new Date(startDate) : null;
      const end = endDate ? new Date(endDate) : null;

      filteredData = sessionData.csvData.filter(row => {
        const rowDate = new Date(row.timestamp || row.date || row.datetime);
        if (isNaN(rowDate.getTime())) return false;

        if (start && rowDate < start) return false;
        if (end && rowDate > end) return false;
        return true;
      });
    }

    return NextResponse.json({
      success: true,
      data: filteredData,
      totalRows: sessionData.csvData.length,
      filteredRows: filteredData.length,
      headers: sessionData.originalHeaders,
      filename: sessionData.filename,
      uploadTimestamp: sessionData.uploadTimestamp
    });

  } catch (error) {
    console.error('Session data retrieval error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to retrieve session data' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: 'Session ID required' },
        { status: 400 }
      );
    }

    const deleted = sessionDataStore.delete(sessionId);
    
    return NextResponse.json({
      success: deleted,
      message: deleted ? 'Session data cleared' : 'Session data not found'
    });

  } catch (error) {
    console.error('Session data deletion error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete session data' },
      { status: 500 }
    );
  }
} 
