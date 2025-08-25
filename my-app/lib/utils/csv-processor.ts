import type { PiSensorReading } from '@/types';

/**
 * Processes raw CSV data from Pi sensors into typed sensor readings
 */
export class CSVProcessor {
  static parsePiSensorReading(csvRow: string): PiSensorReading | null {
    try {
      const columns = csvRow.split(',');
      
      // Skip malformed rows
      if (columns.length < 20) {
        console.warn('Skipping malformed CSV row:', csvRow);
        return null;
      }

      const reading: PiSensorReading = {
        datetime: columns[0]?.trim() || '',
        from_node: columns[1]?.trim() || '',
        pm10Standard: parseFloat(columns[2]) || 0,
        pm25Standard: parseFloat(columns[3]) || 0,
        pm100Standard: parseFloat(columns[4]) || 0,
        pm10Environmental: parseFloat(columns[5]) || 0,
        pm25Environmental: parseFloat(columns[6]) || 0,
        pm100Environmental: parseFloat(columns[7]) || 0,
        rxSnr: columns[8] ? parseFloat(columns[8]) : undefined,
        hopLimit: columns[9] ? parseFloat(columns[9]) : undefined,
        rxRssi: columns[10] ? parseFloat(columns[10]) : undefined,
        hopStart: columns[11] ? parseFloat(columns[11]) : undefined,
        from_short_name: columns[12]?.trim() || '',
        temperature: columns[13] ? parseFloat(columns[13]) : undefined,
        relativeHumidity: columns[14] ? parseFloat(columns[14]) : undefined,
        barometricPressure: columns[15] ? parseFloat(columns[15]) : undefined,
        gasResistance: columns[16] ? parseFloat(columns[16]) : undefined,
        iaq: columns[17] ? parseFloat(columns[17]) : undefined,
        latitude: parseFloat(columns[18]) || 0,
        longitude: parseFloat(columns[19]) || 0,
        elevation: columns[20]?.trim() || '0 ft'
      };

      // Validate essential fields
      if (!reading.datetime || !reading.from_node || !reading.latitude || !reading.longitude) {
        console.warn('Skipping reading with missing essential fields:', reading);
        return null;
      }

      return reading;
    } catch (error) {
      console.error('Error parsing CSV row:', error, csvRow);
      return null;
    }
  }

  /**
   * Processes a full CSV file content into sensor readings
   */
  static async processCsvFile(csvContent: string): Promise<PiSensorReading[]> {
    const lines = csvContent.split('\n');
    const readings: PiSensorReading[] = [];

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i]?.trim();
      if (!line) continue;

      const reading = this.parsePiSensorReading(line);
      if (reading) {
        readings.push(reading);
      }
    }

    return readings;
  }

  /**
   * Creates mock sensor data for testing the visualization
   */
  static generateMockData(count: number = 100): PiSensorReading[] {
    const readings: PiSensorReading[] = [];
    const baseTime = new Date();
    
    // California coordinates around prescribed burn areas
    const baseLatitude = 38.6;
    const baseLongitude = -122.73;
    
    for (let i = 0; i < count; i++) {
      const timestamp = new Date(baseTime.getTime() - (i * 5 * 60 * 1000)); // 5-minute intervals
      
      // Add some spatial variation
      const latOffset = (Math.random() - 0.5) * 0.02; // ~1km variation
      const lngOffset = (Math.random() - 0.5) * 0.02;
      
      // Simulate varying PM concentrations (higher during fire events)
      const isFireEvent = Math.random() > 0.7;
      const basePM25 = isFireEvent ? 50 + Math.random() * 100 : 5 + Math.random() * 15;
      
      readings.push({
        datetime: timestamp.toISOString(),
        from_node: `0x433b${String(i % 10).padStart(4, '0')}`,
        pm10Standard: basePM25 * 1.2,
        pm25Standard: basePM25,
        pm100Standard: basePM25 * 1.5,
        pm10Environmental: basePM25 * 1.15,
        pm25Environmental: basePM25 * 0.95,
        pm100Environmental: basePM25 * 1.45,
        rxSnr: -10 + Math.random() * 20,
        hopLimit: 3,
        rxRssi: -100 + Math.random() * 40,
        hopStart: 3,
        from_short_name: String(i % 10).padStart(4, '0'),
        temperature: 15 + Math.random() * 20, // Celsius
        relativeHumidity: 30 + Math.random() * 50,
        barometricPressure: 1013 + Math.random() * 20,
        gasResistance: 50000 + Math.random() * 100000,
        iaq: 50 + Math.random() * 100,
        latitude: baseLatitude + latOffset,
        longitude: baseLongitude + lngOffset,
        elevation: `${Math.floor(400 + Math.random() * 200)} ft`
      });
    }

    return readings.sort((a, b) => new Date(b.datetime).getTime() - new Date(a.datetime).getTime());
  }

  /**
   * Converts sensor readings to visualization-friendly format
   */
  static toVisualizationPoints(readings: PiSensorReading[]) {
    return readings.map(reading => ({
      position: [reading.longitude, reading.latitude, parseFloat(reading.elevation.replace(' ft', '')) * 0.3048] as [number, number, number],
      concentration: reading.pm25Environmental,
      timestamp: reading.datetime,
      source: 'sensor' as const,
      color: this.concentrationToColor(reading.pm25Environmental)
    }));
  }

  /**
   * Maps PM2.5 concentration to color (RGBA)
   */
  private static concentrationToColor(pm25: number): [number, number, number, number] {
    // AQI color scale
    if (pm25 <= 12) return [0, 255, 0, 180]; // Good - Green
    if (pm25 <= 35) return [255, 255, 0, 180]; // Moderate - Yellow  
    if (pm25 <= 55) return [255, 126, 0, 180]; // Unhealthy for Sensitive - Orange
    if (pm25 <= 150) return [255, 0, 0, 180]; // Unhealthy - Red
    if (pm25 <= 250) return [143, 63, 151, 180]; // Very Unhealthy - Purple
    return [126, 0, 35, 180]; // Hazardous - Maroon
  }
} 