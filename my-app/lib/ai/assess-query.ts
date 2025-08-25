// assess-query.ts
import { geocodeLocations } from './geocode-utils';

export async function assessQuery(userQuery: string, providedLocation?: string | { lat: number; lng: number }): Promise<any> {
  const spatialKeywords = [
    'near', 'around', 'in', 'at', 'location', 'area', 'region',
    'proximity', 'distance', 'coordinates', 'lat', 'lon', 'latitude', 'longitude'
  ];

  const fireKeywords = [
    'fire', 'wildfire', 'burn', 'ignition', 'spread', 'containment',
    'prescribed burn', 'fuel', 'vegetation', 'ember', 'flammability'
  ];

  const smokeKeywords = [
    'smoke', 'plume', 'dispersion', 'concentration', 'air quality',
    'pm2.5', 'pm10', 'visibility', 'atmospheric', 'wind'
  ];

  // Extract spatial elements using improved regex patterns
  const coordinatePattern = /(-?\d+\.?\d*)\s*[,°]\s*(-?\d+\.?\d*)/g;
  const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*(?:([A-Z][a-z]+\s+County)|([A-Z][A-Z]))\b/g;
  
  const coordinates = [...userQuery.matchAll(coordinatePattern)];
  const locations = [...userQuery.matchAll(locationPattern)];
  
  // Construct full location strings including state/county
  let fullLocations = locations.map(match => {
    let loc = match[1];
    if (match[2]) loc += `, ${match[2]}`;
    else if (match[3]) loc += `, ${match[3]}`;
    return loc;
  });

  // Also extract standalone location names as fallback
  const standaloneLocationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+County)?)\b/g;
  let standaloneLocations = [...userQuery.matchAll(standaloneLocationPattern)]
    .map(match => match[1])
    .filter(location => 
      !['County', 'State', 'United', 'States', 'America'].includes(location) &&
      location.length > 2
    );
  const nonLocations = ['What', 'Is', 'The', 'In', 'Risk', 'Wildfire', 'Smoke', 'Fire', 'Air', 'Quality', 'Plume', 'Dispersion', 'Wildfire Risk'];
  standaloneLocations = standaloneLocations.filter(loc => !nonLocations.some(non => loc.includes(non)));

  // Prioritize full locations, fallback to standalone
  let primaryLocations: string[] = [...new Set([...fullLocations, ...standaloneLocations])];
  let preGeocoded: { lat: number; lng: number }[] = [];
  if (providedLocation) {
    if (typeof providedLocation === 'string') {
      primaryLocations = [providedLocation, ...primaryLocations.filter(loc => loc !== providedLocation)];
    } else if (providedLocation && typeof providedLocation === 'object' && 'lat' in providedLocation && 'lng' in providedLocation) {
      preGeocoded = [providedLocation];
    }
  }

  const queryType = determineQueryType(userQuery, fireKeywords, smokeKeywords);
  
  // Geocode location names to coordinates
  const geocodedCoordinates = await geocodeLocations(primaryLocations, userQuery);
  const allCoordinates = [
    ...coordinates.map(match => ({
      lat: parseFloat(match[1]),
      lng: parseFloat(match[2])
    })),
    ...geocodedCoordinates,
    ...preGeocoded
  ];

  return {
    queryType,
    spatialElements: {
      coordinates: allCoordinates,
      namedLocations: [
        ...locations.map(match => ({
          city: match[1],
          state: match[2] || match[3]
        })),
        ...standaloneLocations.map(location => ({ location }))
      ],
      hasSpatialkeywords: spatialKeywords.some(keyword => 
        userQuery.toLowerCase().includes(keyword)
      )
    },
    informationNeeds: identifyInformationNeeds(userQuery),
    requiredTools: selectRequiredTools(userQuery, queryType)
  };
}

function determineQueryType(userQuery: string, fireKeywords: string[], smokeKeywords: string[]): string[] {
  // Implementation needed or import from elsewhere
  return [];
}

function identifyInformationNeeds(userQuery: string): string[] {
  // Implementation needed
  return [];
}

function selectRequiredTools(userQuery: string, queryType: string[]): string[] {
  // Implementation needed
  return [];
}