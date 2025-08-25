import { SensorDataService, FireDataService, PredictionService } from '@/lib/database/supabase';
import type { PiSensorReading, FireDetection, PlumePrediction } from '@/types';

// Generate sample sensor data around California fire-prone areas
export class DataIngestionService {
  
  // California coordinates for various fire-prone regions
  private static readonly CALIFORNIA_REGIONS = [
    { name: 'Sonoma County', lat: 38.5816, lng: -122.8047 },
    { name: 'Napa Valley', lat: 38.5025, lng: -122.2654 },
    { name: 'Santa Rosa', lat: 38.4404, lng: -122.7144 },
    { name: 'Pepperridge', lat: 38.6781, lng: -122.8181 },
    { name: 'Mount Diablo', lat: 37.8816, lng: -121.9144 },
    { name: 'Berkeley Hills', lat: 37.8919, lng: -122.2481 },
    { name: 'Santa Cruz Mountains', lat: 37.1663, lng: -122.0238 },
    { name: 'Marin Headlands', lat: 37.8324, lng: -122.4994 }
  ];

  static generateSampleSensorData(hours: number = 24): Omit<PiSensorReading, 'id'>[] {
    const data: Omit<PiSensorReading, 'id'>[] = [];
    const now = new Date();
    
    this.CALIFORNIA_REGIONS.forEach((region, regionIndex) => {
      // Create 2-3 sensors per region
      const sensorsPerRegion = 2 + Math.floor(Math.random() * 2);
      
      for (let sensorIndex = 0; sensorIndex < sensorsPerRegion; sensorIndex++) {
        const sensorId = `pi-sensor-${regionIndex}-${sensorIndex}`;
        
        // Generate hourly readings for the specified time period
        for (let hour = 0; hour < hours; hour++) {
          const timestamp = new Date(now.getTime() - (hour * 60 * 60 * 1000));
          
          // Add some spatial variation around the region center
          const latVariation = (Math.random() - 0.5) * 0.02; // ~1km variation
          const lngVariation = (Math.random() - 0.5) * 0.02;
          
          // Simulate PM2.5 levels based on time and region (higher during fire season)
          const baselinePm25 = 8 + Math.random() * 4; // Normal levels 8-12 μg/m³
          const fireInfluence = Math.random() > 0.8 ? Math.random() * 50 : 0; // Occasional fire impact
          const pm25 = baselinePm25 + fireInfluence;
          
          // PM10 is typically 1.5-2x PM2.5
          const pm10 = pm25 * (1.5 + Math.random() * 0.5);
          
          // Temperature and humidity based on California climate
          const baseTemp = 18 + Math.random() * 12; // 18-30°C
          const humidity = 30 + Math.random() * 40; // 30-70%
          
          data.push({
            datetime: timestamp.toISOString(),
            from_node: sensorId,
            pm10Standard: pm10,
            pm25Standard: pm25,
            pm100Standard: pm10 * 0.1,
            pm10Environmental: pm10,
            pm25Environmental: pm25,
            pm100Environmental: pm10 * 0.1,
            from_short_name: `${region.name}-${sensorIndex + 1}`,
            temperature: baseTemp,
            relativeHumidity: humidity,
            latitude: region.lat + latVariation,
            longitude: region.lng + lngVariation,
            elevation: `${Math.floor(100 + Math.random() * 500)} ft`,
            rxSnr: Math.random() * 20 - 10,
            rxRssi: Math.random() * -30 - 70
          });
        }
      }
    });
    
    return data;
  }

  static generateSampleFireData(hours: number = 48): Omit<FireDetection, 'id'>[] {
    const data: Omit<FireDetection, 'id'>[] = [];
    const now = new Date();
    
    // Generate 3-8 fire detections in California
    const numFires = 3 + Math.floor(Math.random() * 6);
    
    for (let i = 0; i < numFires; i++) {
      const region = this.CALIFORNIA_REGIONS[Math.floor(Math.random() * this.CALIFORNIA_REGIONS.length)];
      
      // Multiple detections for the same fire over time
      const detectionsPerFire = 2 + Math.floor(Math.random() * 4);
      
      for (let j = 0; j < detectionsPerFire; j++) {
        const hoursAgo = Math.random() * hours;
        const timestamp = new Date(now.getTime() - (hoursAgo * 60 * 60 * 1000));
        
        // Fire location with some variation
        const latVariation = (Math.random() - 0.5) * 0.01;
        const lngVariation = (Math.random() - 0.5) * 0.01;
        
        // Fire radiative power (MW) - typical range for wildfires
        const frp = 1 + Math.random() * 100;
        
        // Confidence based on detection quality
        const confidenceRand = Math.random();
        const confidence = confidenceRand > 0.7 ? 'high' : confidenceRand > 0.3 ? 'nominal' : 'low';
        
        data.push({
          acquisition_ts: timestamp.toISOString(),
          latitude: region.lat + latVariation,
          longitude: region.lng + lngVariation,
          frp_mw: frp,
          confidence
        });
      }
    }
    
    return data;
  }

  static generateSamplePredictions(hours: number = 12): Omit<PlumePrediction, 'id'>[] {
    const data: Omit<PlumePrediction, 'id'>[] = [];
    const now = new Date();
    
    // Generate predictions for next 12 hours at multiple altitudes
    const altitudes = [100, 300, 500, 1000, 1500]; // meters
    
    this.CALIFORNIA_REGIONS.forEach(region => {
      for (let hour = 1; hour <= hours; hour++) {
        const predictionTime = new Date(now.getTime() + (hour * 60 * 60 * 1000));
        
        altitudes.forEach(altitude => {
          // Simulate plume dispersion - higher concentrations closer to source, lower altitudes
          const distanceFromSource = Math.random() * 0.05; // Up to ~5km from region center
          const altitudeFactor = Math.exp(-altitude / 1000); // Exponential decay with altitude
          
          const basePm25 = 15 + Math.random() * 20; // 15-35 μg/m³
          const dispersedPm25 = basePm25 * altitudeFactor * (1 - distanceFromSource);
          const dispersedPm10 = dispersedPm25 * 1.8;
          
          // Prediction location with wind drift simulation
          const windDriftLat = (Math.random() - 0.5) * 0.02 * hour * 0.1; // Wind effect over time
          const windDriftLng = (Math.random() - 0.5) * 0.02 * hour * 0.1;
          
          data.push({
            prediction_ts: predictionTime.toISOString(),
            generated_at: now.toISOString(),
            latitude: region.lat + windDriftLat,
            longitude: region.lng + windDriftLng,
            altitude_m: altitude,
            conc_pm25_ug_m3: Math.max(0, dispersedPm25),
            conc_pm10_ug_m3: Math.max(0, dispersedPm10),
            model_version: 'HYSPLIT-Transformer-v2.1.0',
            rmse_validation: 0.1 + Math.random() * 0.2, // 0.1-0.3 RMSE
            metadata: {
              wind_speed: 2 + Math.random() * 8, // 2-10 m/s
              wind_direction: Math.random() * 360, // 0-360 degrees
              temperature: 15 + Math.random() * 15, // 15-30°C
              fire_intensity: Math.random() * 100,
              model_confidence: 0.7 + Math.random() * 0.3
            }
          });
        });
      }
    });
    
    return data;
  }

  static async ingestSampleData() {
    console.log('Starting sample data ingestion...');
    
    try {
      // Generate and insert sensor data
      console.log('Generating sensor data...');
      const sensorData = this.generateSampleSensorData(24);
      console.log(`Generated ${sensorData.length} sensor readings`);
      
      for (const reading of sensorData.slice(0, 50)) { // Limit for demo
        try {
          await SensorDataService.insertSensorReading(reading);
        } catch (error) {
          console.error('Error inserting sensor reading:', error);
        }
      }
      
      // Generate and insert fire data
      console.log('Generating fire detection data...');
      const fireData = this.generateSampleFireData(48);
      console.log(`Generated ${fireData.length} fire detections`);
      
      for (const fire of fireData.slice(0, 20)) { // Limit for demo
        try {
          await FireDataService.insertFireDetection(fire);
        } catch (error) {
          console.error('Error inserting fire detection:', error);
        }
      }
      
      // Generate and insert prediction data
      console.log('Generating prediction data...');
      const predictionData = this.generateSamplePredictions(12);
      console.log(`Generated ${predictionData.length} predictions`);
      
      for (const prediction of predictionData.slice(0, 100)) { // Limit for demo
        try {
          await PredictionService.insertPrediction(prediction);
        } catch (error) {
          console.error('Error inserting prediction:', error);
        }
      }
      
      console.log('Sample data ingestion completed successfully!');
      return { success: true, message: 'Sample data ingested successfully' };
      
    } catch (error) {
      console.error('Sample data ingestion failed:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }
} 