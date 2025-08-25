import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/database/supabase';

// Cache for API responses
const responseCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 30000; // 30 seconds

function getCachedResponse(key: string) {
  const cached = responseCache.get(key);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.data;
  }
  responseCache.delete(key);
  return null;
}

function setCachedResponse(key: string, data: any) {
  responseCache.set(key, { data, timestamp: Date.now() });
  // Cleanup old entries
  if (responseCache.size > 20) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) {
      responseCache.delete(oldestKey);
    }
  }
}

// GET /api/plume-predictions?hours=24&minLat=..&maxLat=..&minLng=..&maxLng=..
// Returns data shaped for <SmokePlume3DViewer> (see ConcentrationPoint interface)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const hours = parseInt(searchParams.get('hours') || '24');
    const minLat = parseFloat(searchParams.get('minLat') || '36');
    const maxLat = parseFloat(searchParams.get('maxLat') || '38');
    const minLng = parseFloat(searchParams.get('minLng') || '-123');
    const maxLng = parseFloat(searchParams.get('maxLng') || '-121');

    // Check cache first for performance
    const cacheKey = `plume_${hours}_${minLat}_${maxLat}_${minLng}_${maxLng}`;
    const cachedResponse = getCachedResponse(cacheKey);
    if (cachedResponse) {
      console.log(`[plume-predictions] Using cached response`);
      return NextResponse.json(cachedResponse);
    }

    console.log(`[plume-predictions] Fetching predictions for last ${hours} hours`);
    console.log(`[plume-predictions] Bounds: lat(${minLat}, ${maxLat}), lng(${minLng}, ${maxLng})`);

    // Try to fetch from Supabase first
    let predictionData: Array<{
      id: number;
      prediction_ts: string;
      latitude: number;
      longitude: number;
      altitude_m: number;
      conc_pm25_ug_m3: number;
      conc_pm10_ug_m3: number;
      model_version: string;
    }> = [];
    try {
      const { data, error } = await supabase
        .from('plume_predictions')
        .select(`
          id,
          prediction_ts,
          location,
          altitude_m,
          conc_pm25_ug_m3,
          conc_pm10_ug_m3,
          model_version
        `)
        .gte('prediction_ts', new Date(Date.now() - hours * 60 * 60 * 1000).toISOString())
        .order('prediction_ts', { ascending: false })
        .limit(1000);

      if (error) {
        console.warn('[plume-predictions] Supabase query failed:', error.message);
        throw error;
      }

      // Parse geography data and filter by bounds
      predictionData = (data || [])
        .map(row => {
          // Parse PostGIS POINT geometry from location field
          let latitude = 37.4275, longitude = -122.1697; // default Stanford coordinates
          
          if (row.location && typeof row.location === 'object') {
            // Handle GeoJSON format
            if (row.location.coordinates) {
              longitude = row.location.coordinates[0];
              latitude = row.location.coordinates[1];
            }
          } else if (typeof row.location === 'string') {
            // Handle WKT format like "POINT(-122.1697 37.4275)"
            const match = row.location.match(/POINT\(([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\)/);
            if (match) {
              longitude = parseFloat(match[1]);
              latitude = parseFloat(match[2]);
            }
          }

          return {
            id: row.id,
            prediction_ts: row.prediction_ts,
            latitude,
            longitude,
            altitude_m: row.altitude_m || 100,
            conc_pm25_ug_m3: row.conc_pm25_ug_m3 || 0,
            conc_pm10_ug_m3: row.conc_pm10_ug_m3 || 0,
            model_version: row.model_version || 'HYSPLIT-AI-v1.0'
          };
        })
        .filter(point => 
          point.latitude >= minLat && point.latitude <= maxLat &&
          point.longitude >= minLng && point.longitude <= maxLng
        );

      console.log(`[plume-predictions] Found ${predictionData.length} predictions from Supabase`);

    } catch (dbError: any) {
      console.warn('[plume-predictions] Database error, falling back to mock data:', dbError.message);
    }

    // If no real data, do NOT fabricate synthetic data
    // Enforce scientific integrity: return an empty dataset with clear source
    if (predictionData.length === 0) {
      console.warn('[plume-predictions] No real plume data available in the requested window/bounds');
    }

    // Prepare response object
    const responseData = {
      success: true,
      data: predictionData,
      count: predictionData.length,
      source: predictionData.length > 0 ? 'supabase' : 'none'
    };

    // Cache the response for performance
    setCachedResponse(cacheKey, responseData);

    return NextResponse.json(responseData);
  } catch (err: any) {
    console.error('[plume-predictions] Error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
} 