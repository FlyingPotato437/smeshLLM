import { CompositeLayer, LayerProps } from '@deck.gl/core';

// HYSPLIT concentration data structure (from API)
interface HysplitConcentrationPoint {
  id?: number;
  latitude: number;
  longitude: number;
  altitude_m: number;
  conc_pm25_ug_m3: number;
  conc_pm10_ug_m3: number;
  prediction_ts: string;
  model_version?: string;
}

// Legacy concentration point structure for backward compatibility
interface ConcentrationPoint {
  position: [number, number, number]; // [lon, lat, elevation]
  concentration: number; // μg/m³
  uncertainty?: number;
  timestamp?: Date;
  source?: string;
}

const defaultProps = {
  id: 'hysplit-smoke',
  data: { type: 'array', value: [], compare: true },
  currentTime: new Date(),
  timeWindowMinutes: 60, // Show data within this time window
  altitudeFilter: null as [number, number] | null, // [min, max] altitude filter in meters
  concentrationThreshold: 5.0, // Minimum concentration to display (μg/m³)
  heatmapRadius: 2000, // Heatmap influence radius in meters
  heatmapIntensity: 1.0,
  showDataPoints: false, // Show individual data points for debugging
  opacity: 0.8,
  colorRange: [
    [0, 255, 0, 80],      // Green - Good (0-12 μg/m³)
    [255, 255, 0, 120],   // Yellow - Moderate (12-35 μg/m³)
    [255, 165, 0, 160],   // Orange - Unhealthy for Sensitive (35-55 μg/m³)
    [255, 0, 0, 200],     // Red - Unhealthy (55-150 μg/m³)
    [128, 0, 128, 240],   // Purple - Very Unhealthy (150-250 μg/m³)
    [139, 69, 19, 255]    // Maroon - Hazardous (250+ μg/m³)
  ] as [number, number, number, number][],
  // Dynamically loaded layer classes
  HeatmapLayer: null as any,
  ScatterplotLayer: null as any,
};

export type HysplitSmokeLayerProps = LayerProps & typeof defaultProps;

export default class HysplitSmokeLayer extends CompositeLayer<HysplitSmokeLayerProps> {
  static defaultProps = defaultProps;
  static layerName = 'HysplitSmokeLayer';

  renderLayers() {
    const { 
      data, 
      currentTime, 
      timeWindowMinutes, 
      altitudeFilter, 
      concentrationThreshold,
      heatmapRadius,
      heatmapIntensity,
      showDataPoints,
      opacity,
      colorRange,
      HeatmapLayer,
      ScatterplotLayer
    } = this.props;

    // Handle both HYSPLIT data format and legacy format
    const processedData = this.processHysplitData(
      Array.isArray(data) ? data : [], 
      currentTime, 
      timeWindowMinutes, 
      altitudeFilter,
      concentrationThreshold
    );

    if (!processedData || processedData.length === 0) {
      return [];
    }

    // Check if layer classes are available
    if (!HeatmapLayer || !ScatterplotLayer) {
      console.warn('HysplitSmokeLayer: Required layer classes not available');
      return [];
    }

    const layers: any[] = [];

    // Main heatmap layer showing concentration field
    console.log('🔥 Creating HeatmapLayer with', processedData.length, 'data points');
    
    // Enhanced configuration for better visibility
    const enhancedIntensity = heatmapIntensity * 2; // Higher intensity 
    const enhancedRadius = heatmapRadius * 1.5; // Larger radius for better coverage
    
    console.log('🔥 Creating HeatmapLayer with enhanced configuration');
    const heatmapLayer = new HeatmapLayer({
      id: `${this.props.id}-heatmap`,
      data: processedData,
      pickable: true,
      radiusMeters: enhancedRadius,
      intensity: enhancedIntensity,
      threshold: 0.01, // Low threshold for good visibility
      colorRange: [
        [0, 255, 0, 120],     // Green - Good 
        [255, 255, 0, 160],   // Yellow - Moderate 
        [255, 165, 0, 200],   // Orange - Unhealthy for Sensitive
        [255, 0, 0, 240],     // Red - Unhealthy
        [128, 0, 128, 255],   // Purple - Very Unhealthy
        [139, 69, 19, 255]    // Maroon - Hazardous
      ],
      getPosition: (d: any) => [d.longitude, d.latitude],
      getWeight: (d: any) => Math.max(0.1, d.weight * 2), // Enhanced weights
      opacity: Math.min(1.0, opacity),
      // Simple fallback for terrain visibility - disable depth testing
      parameters: {
        depthTest: false
      },
      updateTriggers: {
        getPosition: [currentTime, altitudeFilter],
        getWeight: [currentTime, concentrationThreshold],
      }
    });
    
    console.log('✅ HeatmapLayer created with enhanced visibility:', {
      intensity: enhancedIntensity,
      radius: enhancedRadius,
      dataPoints: processedData.length
    });
    
    layers.push(heatmapLayer);

    // Optional: Show individual data points for debugging/validation
    if (showDataPoints) {
      layers.push(new ScatterplotLayer({
        id: `${this.props.id}-points`,
        data: processedData,
        pickable: true,
        opacity: 0.6,
        stroked: true,
        filled: true,
        radiusScale: 1,
        radiusMinPixels: 3,
        radiusMaxPixels: 8,
        lineWidthMinPixels: 1,
        getPosition: (d: any) => [d.longitude, d.latitude],
        getRadius: (d: any) => Math.sqrt(d.weight) * 2,
        getFillColor: (d: any) => this.getColorForConcentration(d.originalConcentration),
        getLineColor: [255, 255, 255, 200],
        updateTriggers: {
          getPosition: [currentTime, altitudeFilter],
          getFillColor: [currentTime],
        }
      }));
    }

    return layers;
  }

  /**
   * Process HYSPLIT concentration data for visualization
   */
  processHysplitData(
    rawData: any[], 
    currentTime: Date, 
    timeWindowMinutes: number,
    altitudeFilter: [number, number] | null,
    concentrationThreshold: number
  ) {
    console.log('🔍 DEBUGGING HysplitSmokeLayer.processHysplitData');
    console.log('📊 Input rawData length:', rawData.length);
    console.log('📊 Sample raw data points:', rawData.slice(0, 3));
    console.log('🕐 Current time:', currentTime);
    console.log('⚙️ Time window:', timeWindowMinutes, 'minutes');
    console.log('⚙️ Altitude filter:', altitudeFilter);
    console.log('⚙️ Concentration threshold:', concentrationThreshold);

    // Handle both HYSPLIT format and legacy ConcentrationPoint format
    const processedPoints: any[] = [];
    let validDataCount = 0;
    let timeFilteredOut = 0;
    let altitudeFilteredOut = 0;
    let concentrationFilteredOut = 0;

    rawData.forEach((point, index) => {
      let longitude: number, latitude: number, altitude: number, concentration: number, timestamp: Date;

      if ('latitude' in point && 'longitude' in point) {
        // HYSPLIT format from API
        longitude = point.longitude;
        latitude = point.latitude;
        altitude = point.altitude_m || 0;
        concentration = point.conc_pm25_ug_m3 || 0;
        timestamp = new Date(point.prediction_ts || currentTime);
        validDataCount++;
        if (index < 3) {
          console.log(`📍 HYSPLIT format point ${index}:`, {longitude, latitude, altitude, concentration, timestamp});
        }
      } else if ('position' in point) {
        // Legacy ConcentrationPoint format
        [longitude, latitude, altitude] = point.position;
        concentration = point.concentration || 0;
        timestamp = point.timestamp || currentTime;
        validDataCount++;
        if (index < 3) {
          console.log(`📍 Legacy format point ${index}:`, {longitude, latitude, altitude, concentration, timestamp});
        }
      } else {
        console.warn('❌ Unknown data format for point:', point);
        return;
      }

      // Time filtering
      const timeDiffMinutes = Math.abs(currentTime.getTime() - timestamp.getTime()) / (1000 * 60);
      if (timeDiffMinutes > timeWindowMinutes) {
        timeFilteredOut++;
        if (timeFilteredOut <= 3) {
          console.log(`⏰ Time filtered out (${timeDiffMinutes.toFixed(1)}min > ${timeWindowMinutes}min):`, {timestamp, currentTime});
        }
        return;
      }

      // Altitude filtering
      if (altitudeFilter) {
        const [minAlt, maxAlt] = altitudeFilter;
        if (altitude < minAlt || altitude > maxAlt) {
          altitudeFilteredOut++;
          if (altitudeFilteredOut <= 3) {
            console.log(`🏔️ Altitude filtered out (${altitude}m not in ${minAlt}-${maxAlt}m)`);
          }
          return;
        }
      }

      // Concentration threshold filtering
      if (concentration < concentrationThreshold) {
        concentrationFilteredOut++;
        if (concentrationFilteredOut <= 3) {
          console.log(`🌡️ Concentration filtered out (${concentration} < ${concentrationThreshold})`);
        }
        return;
      }

      // Calculate weight for heatmap (normalize concentration for better visualization)
      // HYSPLIT concentrations can vary widely, so we use a logarithmic scale for better visual distribution
      const weight = concentration > 0 ? Math.log10(concentration + 1) : 0;

      const processedPoint = {
        longitude,
        latitude,
        altitude,
        weight,
        originalConcentration: concentration,
        timestamp,
        id: `point-${index}`
      };

      if (processedPoints.length < 3) {
        console.log(`✅ Processed point ${processedPoints.length}:`, processedPoint);
      }

      processedPoints.push(processedPoint);
    });

    // Summary logging
    console.log('📊 FILTERING SUMMARY:');
    console.log(`  📊 Valid data points: ${validDataCount}/${rawData.length}`);
    console.log(`  ⏰ Time filtered out: ${timeFilteredOut}`);
    console.log(`  🏔️ Altitude filtered out: ${altitudeFilteredOut}`);
    console.log(`  🌡️ Concentration filtered out: ${concentrationFilteredOut}`);
    console.log(`  ✅ Final processed points: ${processedPoints.length}`);
    
    if (processedPoints.length > 0) {
      const concentrations = processedPoints.map(p => p.originalConcentration);
      const weights = processedPoints.map(p => p.weight);
      console.log(`📊 Concentration range: ${Math.min(...concentrations).toFixed(1)} - ${Math.max(...concentrations).toFixed(1)} μg/m³`);
      console.log(`📊 Weight range: ${Math.min(...weights).toFixed(3)} - ${Math.max(...weights).toFixed(3)}`);
      
      // Check coordinate ranges
      const lons = processedPoints.map(p => p.longitude);
      const lats = processedPoints.map(p => p.latitude);
      console.log(`📍 Longitude range: ${Math.min(...lons).toFixed(4)} - ${Math.max(...lons).toFixed(4)}`);
      console.log(`📍 Latitude range: ${Math.min(...lats).toFixed(4)} - ${Math.max(...lats).toFixed(4)}`);
    } else {
      console.log('❌ NO POINTS SURVIVED FILTERING!');
    }

    return processedPoints;
  }

  /**
   * Get EPA AQI color for a given PM2.5 concentration
   */
  getColorForConcentration(concentration: number): [number, number, number, number] {
    if (concentration <= 12.0) {
      return [0, 255, 0, 180]; // Good - Green
    } else if (concentration <= 35.4) {
      return [255, 255, 0, 200]; // Moderate - Yellow
    } else if (concentration <= 55.4) {
      return [255, 165, 0, 220]; // Unhealthy for Sensitive - Orange
    } else if (concentration <= 150.4) {
      return [255, 0, 0, 240]; // Unhealthy - Red
    } else if (concentration <= 250.4) {
      return [128, 0, 128, 255]; // Very Unhealthy - Purple
    } else {
      return [139, 69, 19, 255]; // Hazardous - Maroon
    }
  }

  getPickingInfo({ info }: any) {
    if (info.object) {
      return {
        ...info,
        object: {
          concentration: info.object.originalConcentration,
          position: [info.object.longitude, info.object.latitude, info.object.altitude],
          timestamp: info.object.timestamp,
          weight: info.object.weight,
          aqiLevel: this.getAQILevel(info.object.originalConcentration)
        }
      };
    }
    return info;
  }

  getAQILevel(concentration: number): string {
    if (concentration <= 12.0) return 'Good';
    if (concentration <= 35.4) return 'Moderate';
    if (concentration <= 55.4) return 'Unhealthy for Sensitive Groups';
    if (concentration <= 150.4) return 'Unhealthy';
    if (concentration <= 250.4) return 'Very Unhealthy';
    return 'Hazardous';
  }
}