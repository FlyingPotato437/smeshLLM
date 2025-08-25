// geocode-utils.ts
import { PiSensorReading, FireDetection, MeteorologicalData, PlumePrediction } from '../../types';

/**
 * Geocode location names to coordinates using Nominatim
 */
export async function geocodeLocations(locations: string[], query: string): Promise<{ lat: number; lng: number }[]> {
  const coordinates: { lat: number; lng: number }[] = [];

  for (const location of locations) {
    if (typeof location !== 'string') {
      console.log(`⚠️ Skipping non-string location: ${JSON.stringify(location)}`);
      continue;
    }

    // Removed hardcoded locationMap and partial/context matching
    // Directly use Nominatim

    try {
      // Add timeout to prevent hanging requests
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      let nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&limit=1`;
      // Parse for structured query if location has city, state format
      const match = location.match(/^([^,]+),\s*([A-Z]{2})$/);
      if (match) {
        const [, city, state] = match;
        nominatimUrl += `&city=${encodeURIComponent(city.trim())}&state=${encodeURIComponent(state.trim())}&country=US`;
      } else {
        nominatimUrl += `&q=${encodeURIComponent(location)}`;
      }
      
      const response = await fetch(nominatimUrl, {
        headers: { 'User-Agent': 'SmeshLLM/1.0' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      if (data && data[0]) {
        const { lat, lon } = data[0];
        coordinates.push({ lat: parseFloat(lat), lng: parseFloat(lon) });
        console.log(`📍 GEOCODED via Nominatim: ${location} → ${lat}, ${lon}`);
      } else {
        console.log(`⚠️ Nominatim could not geocode: ${location}`);
      }
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          console.log(`⏰ Geocoding timeout for: ${location}`);
        } else {
          console.log(`⚠️ Geocoding error for ${location}: ${error.message}`);
        }
      } else {
        console.log(`⚠️ Unknown geocoding error for ${location}: ${error}`);
      }
    }
  }

  return coordinates;
}