/**
 * OpenAQ API Integration Service
 * Real-time air quality data from thousands of monitoring stations worldwide
 * No more mocks - this connects to live global air quality networks
 */

import { supabase } from '../database/supabase';

export interface LocationFilter {
  latitude?: number;
  longitude?: number;
  radius?: number; // km
  country?: string;
  city?: string;
  boundingBox?: {
    minLat: number;
    maxLat: number;
    minLon: number;
    maxLon: number;
  };
}

export interface TimeFilter {
  startDate?: string; // ISO format
  endDate?: string;   // ISO format
  hoursBack?: number; // Default 24
}

export interface ParameterFilter {
  parameters: string[]; // ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co']
  includeRaw?: boolean;
  minDataCoverage?: number; // 0-1
}

export interface OpenAQRequest {
  locationFilter: LocationFilter;
  timeFilter: TimeFilter;
  parameterFilter: ParameterFilter;
  limit?: number;
  sourceName?: string;
}

export interface AirQualityMeasurement {
  locationId: string;
  locationName: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  parameter: string;
  value: number;
  unit: string;
  timestamp: string;
  sourceName: string;
  coordinates: { latitude: number; longitude: number };
  dataQuality?: string;
}

export interface MonitoringLocation {
  locationId: string;
  name: string;
  country: string;
  city: string;
  latitude: number;
  longitude: number;
  sourceName: string;
  firstUpdated: string;
  lastUpdated: string;
  parameters: string[];
  sensorType?: string;
}

export interface OpenAQResponse {
  requestId: string;
  totalMeasurements: number;
  locationsCount: number;
  measurements: AirQualityMeasurement[];
  locations: MonitoringLocation[];
  dataTimerange: {
    start: string;
    end: string;
  };
  requestParams: any;
}

export interface CountryInfo {
  code: string;
  name: string;
  locationCount: number;
  measurementCount: number;
  firstUpdated: string;
  lastUpdated: string;
}

export interface ParameterInfo {
  id: string;
  name: string;
  displayName: string;
  description: string;
  preferredUnit: string;
}

/**
 * Real OpenAQ Service Implementation
 * Integrates with Python OpenAQ backend for live air quality data
 */
export class OpenAQService {
  private readonly apiBaseUrl: string;
  
  constructor() {
    this.apiBaseUrl =
      process.env.OPENAQ_SERVICE_URL ||
      process.env.PYTHON_SERVICE_URL ||
      'http://127.0.0.1:8000';
  }

  /**
   * Get real-time air quality measurements
   */
  async getMeasurements(request: OpenAQRequest): Promise<OpenAQResponse> {
    try {
      console.log('Fetching real-time air quality measurements from OpenAQ');
      
      const response = await fetch(`${this.apiBaseUrl}/openaq/measurements`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          location_filter: {
            latitude: request.locationFilter.latitude,
            longitude: request.locationFilter.longitude,
            radius: request.locationFilter.radius,
            country: request.locationFilter.country,
            city: request.locationFilter.city,
            bounding_box: request.locationFilter.boundingBox ? {
              min_lat: request.locationFilter.boundingBox.minLat,
              max_lat: request.locationFilter.boundingBox.maxLat,
              min_lon: request.locationFilter.boundingBox.minLon,
              max_lon: request.locationFilter.boundingBox.maxLon
            } : undefined
          },
          time_filter: {
            start_date: request.timeFilter.startDate,
            end_date: request.timeFilter.endDate,
            hours_back: request.timeFilter.hoursBack || 24
          },
          parameter_filter: {
            parameters: request.parameterFilter.parameters,
            include_raw: request.parameterFilter.includeRaw || false,
            min_data_coverage: request.parameterFilter.minDataCoverage || 0.75
          },
          limit: request.limit || 1000,
          source_name: request.sourceName
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAQ service error: ${response.statusText}`);
      }

      const data = await response.json();
      return this.formatOpenAQResponse(data);
      
    } catch (error) {
      console.error('Error fetching air quality measurements:', error);
      if (error instanceof Error) {
        throw new Error(`Air quality data fetch failed: ${error.message}`);
      }
      throw new Error('Air quality data fetch failed with an unknown error.');
    }
  }

  /**
   * Get air quality monitoring locations
   */
  async getMonitoringLocations(filter: LocationFilter): Promise<MonitoringLocation[]> {
    try {
      const params = new URLSearchParams();
      
      if (filter.country) params.append('country', filter.country);
      if (filter.city) params.append('city', filter.city);
      if (filter.latitude) params.append('latitude', filter.latitude.toString());
      if (filter.longitude) params.append('longitude', filter.longitude.toString());
      if (filter.radius) params.append('radius', filter.radius.toString());

      const response = await fetch(`${this.apiBaseUrl}/openaq/locations?${params}`);

      if (!response.ok) {
        throw new Error(`OpenAQ service error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.locations.map(this.formatLocation);
      
    } catch (error) {
      console.error('Error fetching monitoring locations:', error);
      if (error instanceof Error) {
        throw new Error(`Monitoring locations fetch failed: ${error.message}`);
      }
      throw new Error('Monitoring locations fetch failed with an unknown error.');
    }
  }

  /**
   * Get nearby air quality measurements
   */
  async getNearbyMeasurements(
    latitude: number, 
    longitude: number, 
    options?: {
      radiusKm?: number;
      parameters?: string[];
      hoursBack?: number;
    }
  ): Promise<{
    centerCoordinates: { latitude: number; longitude: number };
    searchRadiusKm: number;
    timeRangeHours: number;
    parameters: string[];
    measurementsFound: number;
    locationsFound: number;
    measurements: AirQualityMeasurement[];
    locations: MonitoringLocation[];
  }> {
    try {
      // Updated to use working OpenAQ V3 service with GET parameters
      const params = new URLSearchParams({
        latitude: latitude.toString(),
        longitude: longitude.toString(),
        radius_km: (options?.radiusKm || 50).toString(),
        parameters: (options?.parameters || ['pm25', 'pm10']).join(',')
      });

      const response = await fetch(`${this.apiBaseUrl}/openaq/measurements?${params}`, {
        signal: AbortSignal.timeout(8000)
      });

      if (!response.ok) {
        throw new Error(`OpenAQ V3 service error: ${response.statusText}`);
      }

      const apiResponse = await response.json();
      
      // Handle ServiceResponse wrapper from Python FastAPI
      const data = apiResponse.success ? apiResponse.data : apiResponse;
      
      return {
        centerCoordinates: { latitude, longitude },
        searchRadiusKm: options?.radiusKm || 50,
        timeRangeHours: options?.hoursBack || 24,
        parameters: options?.parameters || ['pm25', 'pm10'],
        measurementsFound: data.measurementsFound || 0,
        locationsFound: data.locationsFound || 0,
        measurements: (data.measurements || []).map(this.formatV3Measurement),
        locations: (data.locations || []).map(this.formatV3Location)
      };
      
    } catch (error) {
      console.log('⚠️ OpenAQ: Python service unavailable - real measurements unavailable');
      return {
        centerCoordinates: { latitude, longitude },
        searchRadiusKm: options?.radiusKm || 50,
        timeRangeHours: options?.hoursBack || 24,
        parameters: options?.parameters || ['pm25', 'pm10'],
        measurementsFound: 0,
        locationsFound: 0,
        measurements: [],
        locations: []
      };
    }
  }

  /**
   * Get available countries with air quality data
   */
  async getAvailableCountries(): Promise<CountryInfo[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/openaq/countries`);

      if (!response.ok) {
        throw new Error(`OpenAQ service error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.countries.map((country: any) => ({
        code: country.code,
        name: country.name,
        locationCount: country.location_count,
        measurementCount: country.measurement_count,
        firstUpdated: country.first_updated,
        lastUpdated: country.last_updated
      }));
      
    } catch (error) {
      console.error('Error fetching available countries:', error);
      if (error instanceof Error) {
        throw new Error(`Available countries fetch failed: ${error.message}`);
      }
      throw new Error(`Available countries fetch failed with an unknown error.`);
    }
  }

  /**
   * Get available air quality parameters
   */
  async getAvailableParameters(): Promise<ParameterInfo[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/openaq/parameters`);

      if (!response.ok) {
        throw new Error(`OpenAQ service error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.parameters.map((param: any) => ({
        id: param.id,
        name: param.name,
        displayName: param.display_name,
        description: param.description,
        preferredUnit: param.preferred_unit
      }));
      
    } catch (error) {
      console.error('Error fetching available parameters:', error);
      if (error instanceof Error) {
        throw new Error(`Parameters fetch failed: ${error.message}`);
      }
      throw new Error('Parameters fetch failed with an unknown error.');
    }
  }

  /**
   * Store OpenAQ data in local database for LLM access
   */
  async storeDataLocally(measurements: AirQualityMeasurement[]): Promise<void> {
    try {
      console.log(`Storing ${measurements.length} OpenAQ measurements in local database`);
      
      const sensorReadings = measurements.map(measurement => ({
        device_id: `openaq_${measurement.locationId}`,
        timestamp: measurement.timestamp,
        location: `POINT(${measurement.coordinates.longitude} ${measurement.coordinates.latitude})`,
        source: 'openaq',
        pm25_ugm3: measurement.parameter === 'pm25' ? measurement.value : null,
        pm10_ugm3: measurement.parameter === 'pm10' ? measurement.value : null,
        metadata: {
          openaq_location_id: measurement.locationId,
          location_name: measurement.locationName,
          country: measurement.country,
          city: measurement.city,
          parameter: measurement.parameter,
          unit: measurement.unit,
          source_name: measurement.sourceName,
          data_quality: measurement.dataQuality
        }
      }));

      // Batch insert into sensor_readings table
      const { error } = await supabase
        .from('sensor_readings')
        .insert(sensorReadings);

      if (error) throw error;
      
      console.log('OpenAQ data successfully stored in local database');
      
    } catch (error) {
      console.error('Error storing OpenAQ data locally:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to store OpenAQ data: ${error.message}`);
      }
      throw new Error('Failed to store OpenAQ data with an unknown error.');
    }
  }

  /**
   * Health check for OpenAQ service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET'
      });
      return response.ok;
    } catch (error) {
      console.warn('OpenAQ service health check failed:', error);
      return false;
    }
  }

  /**
   * Format OpenAQ response from Python service
   */
  private formatOpenAQResponse(data: any): OpenAQResponse {
    return {
      requestId: data.request_id,
      totalMeasurements: data.total_measurements,
      locationsCount: data.locations_count,
      measurements: data.measurements.map(this.formatMeasurement),
      locations: data.locations.map(this.formatLocation),
      dataTimerange: {
        start: data.data_timerange.start,
        end: data.data_timerange.end
      },
      requestParams: data.request_params
    };
  }

  /**
   * Format measurement from Python service
   */
  private formatMeasurement = (measurement: any): AirQualityMeasurement => ({
    locationId: measurement.location_id,
    locationName: measurement.location_name,
    country: measurement.country,
    city: measurement.city,
    latitude: measurement.latitude,
    longitude: measurement.longitude,
    parameter: measurement.parameter,
    value: measurement.value,
    unit: measurement.unit,
    timestamp: measurement.timestamp,
    sourceName: measurement.source_name,
    coordinates: measurement.coordinates,
    dataQuality: measurement.data_quality
  });

  /**
   * Format location from Python service
   */
  private formatLocation = (location: any): MonitoringLocation => ({
    locationId: location.location_id,
    name: location.name,
    country: location.country,
    city: location.city,
    latitude: location.latitude,
    longitude: location.longitude,
    sourceName: location.source_name,
    firstUpdated: location.first_updated,
    lastUpdated: location.last_updated,
    parameters: location.parameters,
    sensorType: location.sensor_type
  });

  /**
   * Format measurement from OpenAQ V3 service
   */
  private formatV3Measurement = (measurement: any): AirQualityMeasurement => ({
    locationId: measurement.locationId || '',
    locationName: measurement.locationName || 'Unknown',
    country: measurement.country || 'Unknown',
    city: measurement.city || 'Unknown',
    latitude: measurement.latitude || 0,
    longitude: measurement.longitude || 0,
    parameter: measurement.parameter || 'unknown',
    value: measurement.value || 0,
    unit: measurement.unit || 'unknown',
    timestamp: measurement.timestamp || '',
    sourceName: measurement.sourceName || 'OpenAQ',
    coordinates: { 
      latitude: measurement.latitude || 0, 
      longitude: measurement.longitude || 0 
    },
    dataQuality: 'V3_API'
  });

  /**
   * Format location from OpenAQ V3 service  
   */
  private formatV3Location = (location: any): MonitoringLocation => ({
    locationId: location.locationId || location.id?.toString() || '',
    name: location.name || 'Unknown',
    country: location.country?.name || location.country || 'Unknown',
    city: location.city || 'Unknown',
    latitude: location.coordinates?.latitude || location.latitude || 0,
    longitude: location.coordinates?.longitude || location.longitude || 0,
    sourceName: location.sourceName || location.owner?.name || 'OpenAQ',
    firstUpdated: location.firstUpdated || location.datetimeFirst || '',
    lastUpdated: location.lastUpdated || location.datetimeLast || '',
    parameters: location.parameters || location.sensors?.map((s: any) => s.parameter?.name) || [],
    sensorType: location.sensorType || 'monitoring_station'
  });
}

/**
 * Enhanced air quality data integration specifically for atmospheric modeling
 */
export class AtmosphericAirQualityData {
  private openaqService: OpenAQService;

  constructor() {
    this.openaqService = new OpenAQService();
  }

  /**
   * Get air quality data for wildfire event analysis
   */
  async getWildfireAirQualityData(
    fireLat: number, 
    fireLon: number, 
    radiusKm: number = 200,
    daysBack: number = 7
  ): Promise<{
    upwind: AirQualityMeasurement[];
    downwind: AirQualityMeasurement[];
    impacted: AirQualityMeasurement[];
  }> {
    const hoursBack = daysBack * 24;
    
    const data = await this.openaqService.getNearbyMeasurements(
      fireLat, 
      fireLon, 
      {
        radiusKm,
        parameters: ['pm25', 'pm10'],
        hoursBack
      }
    );

    // Simple classification based on PM2.5 levels
    const upwind: AirQualityMeasurement[] = [];
    const downwind: AirQualityMeasurement[] = [];
    const impacted: AirQualityMeasurement[] = [];

    for (const measurement of data.measurements) {
      if (measurement.parameter === 'pm25') {
        if (measurement.value > 55) { // Unhealthy levels
          impacted.push(measurement);
        } else if (measurement.value > 35) { // Elevated levels
          downwind.push(measurement);
        } else {
          upwind.push(measurement);
        }
      }
    }

    return { upwind, downwind, impacted };
  }

  /**
   * Get air quality baseline for HYSPLIT model validation
   */
  async getBaselineForValidation(
    targetLat: number,
    targetLon: number,
    radiusKm: number = 50
  ): Promise<{
    baseline: AirQualityMeasurement[];
    averagePM25: number;
    averagePM10: number;
    measurementCount: number;
  }> {
    const data = await this.openaqService.getNearbyMeasurements(
      targetLat,
      targetLon,
      {
        radiusKm,
        parameters: ['pm25', 'pm10'],
        hoursBack: 48 // Last 2 days for baseline
      }
    );

    const pm25Values = data.measurements
      .filter(m => m.parameter === 'pm25')
      .map(m => m.value);
      
    const pm10Values = data.measurements
      .filter(m => m.parameter === 'pm10')
      .map(m => m.value);

    const averagePM25 = pm25Values.length > 0 
      ? pm25Values.reduce((a, b) => a + b, 0) / pm25Values.length 
      : 0;
      
    const averagePM10 = pm10Values.length > 0
      ? pm10Values.reduce((a, b) => a + b, 0) / pm10Values.length
      : 0;

    return {
      baseline: data.measurements,
      averagePM25,
      averagePM10,
      measurementCount: data.measurements.length
    };
  }

  /**
   * Continuously monitor and store air quality data for LLM access
   */
  async startContinuousMonitoring(
    locations: { lat: number; lon: number; name: string }[],
    intervalMinutes: number = 30
  ): Promise<void> {
    console.log(`Starting continuous air quality monitoring for ${locations.length} locations`);
    
    const monitor = async () => {
      for (const location of locations) {
        try {
          const data = await this.openaqService.getNearbyMeasurements(
            location.lat,
            location.lon,
            {
              radiusKm: 25,
              parameters: ['pm25', 'pm10', 'o3', 'no2'],
              hoursBack: 2
            }
          );

          // Store in local database for LLM access
          await this.openaqService.storeDataLocally(data.measurements);
          
          console.log(`Updated air quality data for ${location.name}: ${data.measurements.length} measurements`);
          
        } catch (error) {
          console.error(`Error monitoring ${location.name}:`, error);
        }
      }
    };

    // Initial monitoring
    await monitor();
    
    // Set up interval monitoring
    setInterval(monitor, intervalMinutes * 60 * 1000);
  }
}
