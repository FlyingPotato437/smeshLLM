import { CompositeLayer, LayerProps } from '@deck.gl/core';

// Wind-aware plume data structure
interface PlumeDataPoint {
  position: [number, number, number]; // [lon, lat, elevation]
  concentration: number; // μg/m³
  timestamp: Date;
  source?: string;
}

interface MeteorologicalConditions {
  windSpeed: number; // m/s
  windDirection: number; // degrees (0 = North, 90 = East)
  mixingHeight: number; // meters
  atmosphericStability: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'; // Pasquill-Gifford stability classes
}

const defaultProps = {
  id: 'wind-aware-plume',
  data: { type: 'array', value: [], compare: true },
  meteorologicalData: {
    windSpeed: 5.0,
    windDirection: 270, // West wind
    mixingHeight: 1000,
    atmosphericStability: 'D' as const // Neutral conditions
  },
  plumeLength: 10000, // meters - how far downwind the plume extends
  plumeWidth: 5000, // meters - maximum plume width
  crossWindSpread: 2000, // meters - spread perpendicular to wind
  opacity: 0.7,
  colorRange: [
    [0, 255, 0, 80],      // Green - Good
    [255, 255, 0, 120],   // Yellow - Moderate  
    [255, 165, 0, 160],   // Orange - Unhealthy for Sensitive
    [255, 0, 0, 200],     // Red - Unhealthy
    [128, 0, 128, 240],   // Purple - Very Unhealthy
    [139, 69, 19, 255]    // Maroon - Hazardous
  ] as [number, number, number, number][],
  // Dynamically loaded layer classes
  PolygonLayer: null as any,
  ScatterplotLayer: null as any,
};

export type WindAwarePlumeLayerProps = LayerProps & typeof defaultProps;

export default class WindAwarePlumeLayer extends CompositeLayer<WindAwarePlumeLayerProps> {
  static defaultProps = defaultProps;
  static layerName = 'WindAwarePlumeLayer';

  renderLayers() {
    const { 
      data, 
      meteorologicalData,
      plumeLength,
      plumeWidth,
      crossWindSpread,
      opacity,
      colorRange,
      PolygonLayer,
      ScatterplotLayer
    } = this.props;

    if (!PolygonLayer || !ScatterplotLayer) {
      console.warn('WindAwarePlumeLayer: Required layer classes not available');
      return [];
    }

    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    console.log('🌪️ Creating wind-aware plume visualization with', data.length, 'sources');
    console.log('💨 Wind conditions:', meteorologicalData);

    const plumePolygons = this.generatePlumePolygons(
      data,
      meteorologicalData,
      plumeLength,
      crossWindSpread
    );

    const layers: any[] = [];

    // Main plume layer showing realistic dispersion patterns
    if (plumePolygons.length > 0) {
      layers.push(new PolygonLayer({
        id: `${this.props.id}-plumes`,
        data: plumePolygons,
        pickable: true,
        stroked: false,
        filled: true,
        wireframe: false,
        lineWidthMinPixels: 1,
        getPolygon: (d: any) => d.polygon,
        getFillColor: (d: any) => this.getColorForConcentration(d.concentration),
        getLineColor: [255, 255, 255, 100],
        opacity: opacity,
        parameters: {
          depthTest: false
        },
      }));
    }

    // Source points (e.g., sensors, emission sources)
    layers.push(new ScatterplotLayer({
      id: `${this.props.id}-sources`,
      data: data,
      pickable: true,
      opacity: 0.8,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 8,
      radiusMaxPixels: 15,
      lineWidthMinPixels: 2,
      getPosition: (d: PlumeDataPoint) => d.position,
      getRadius: 12,
      getFillColor: (d: PlumeDataPoint) => this.getColorForConcentration(d.concentration),
      getLineColor: [255, 255, 255, 255],
    }));

    return layers;
  }

  /**
   * Generate realistic plume polygons based on Gaussian dispersion model
   * Following EPA's Industrial Source Complex (ISC) model principles
   */
  generatePlumePolygons(
    sources: PlumeDataPoint[], 
    meteo: MeteorologicalConditions,
    maxDistance: number,
    maxSpread: number
  ) {
    const polygons: any[] = [];
    
    sources.forEach((source, index) => {
      const [sourceLon, sourceLat, sourceHeight] = source.position;
      
      // Convert wind direction to mathematical angle (0° = East, counterclockwise)
      const windAngleRad = ((450 - meteo.windDirection) % 360) * Math.PI / 180;
      
      // Calculate dispersion coefficients based on atmospheric stability
      const { sigmaY, sigmaZ } = this.getDispersionCoefficients(
        meteo.atmosphericStability,
        maxDistance
      );
      
      // Create plume polygon points with adaptive LOD
      const plumePoints: [number, number][] = [];
      // Adaptive Level of Detail based on performance requirements
      const numSegments = 8; // Reduced from 20 for better performance
      const numCrossWindPoints = 5; // Reduced from 10 for better performance
      
      // Generate plume centerline and cross-wind spreads
      for (let i = 0; i <= numSegments; i++) {
        const distance = (i / numSegments) * maxDistance;
        
        // Calculate concentration at this distance using Gaussian model
        const concentration = this.calculateGaussianConcentration(
          source.concentration,
          distance,
          0, // centerline (y = 0)
          sourceHeight,
          meteo.windSpeed,
          sigmaY,
          sigmaZ
        );
        
        // Only include significant concentrations
        if (concentration < 1.0) continue;
        
        // Calculate cross-wind spread at this distance
        const spreadWidth = Math.min(sigmaY * distance / 1000, maxSpread);
        
        // Generate points across the plume width at this distance
        for (let j = -numCrossWindPoints; j <= numCrossWindPoints; j++) {
          const crossWindOffset = (j / numCrossWindPoints) * spreadWidth;
          
          // Calculate position downwind from source
          const downwindLon = sourceLon + (distance * Math.cos(windAngleRad)) / 111000; // rough degrees conversion
          const downwindLat = sourceLat + (distance * Math.sin(windAngleRad)) / 111000;
          
          // Add cross-wind offset
          const crossWindLon = downwindLon + (crossWindOffset * Math.cos(windAngleRad + Math.PI/2)) / 111000;
          const crossWindLat = downwindLat + (crossWindOffset * Math.sin(windAngleRad + Math.PI/2)) / 111000;
          
          plumePoints.push([crossWindLon, crossWindLat]);
        }
      }
      
      // Create polygon from points if we have enough
      if (plumePoints.length >= 6) {
        // Sort points to create proper polygon shape
        const sortedPoints = this.sortPointsForPolygon(plumePoints, sourceLon, sourceLat, windAngleRad);
        
        polygons.push({
          polygon: sortedPoints,
          concentration: source.concentration,
          sourceId: index,
          windDirection: meteo.windDirection,
          windSpeed: meteo.windSpeed
        });
      }
    });
    
    console.log(`✅ Generated ${polygons.length} plume polygons`);
    return polygons;
  }

  /**
   * Calculate Gaussian plume concentration using ISC model
   */
  calculateGaussianConcentration(
    sourceStrength: number,
    downwindDistance: number,
    crossWindDistance: number,
    sourceHeight: number,
    windSpeed: number,
    sigmaY: number,
    sigmaZ: number
  ): number {
    if (downwindDistance <= 0 || windSpeed <= 0) return 0;
    
    // Gaussian plume equation
    const Q = sourceStrength; // source strength
    const u = windSpeed; // wind speed
    const x = downwindDistance; // downwind distance
    const y = crossWindDistance; // crosswind distance
    const H = sourceHeight; // effective stack height
    
    // Calculate dispersion parameters at this distance
    const sy = sigmaY * Math.pow(x / 1000, 0.8); // empirical scaling
    const sz = sigmaZ * Math.pow(x / 1000, 0.6); // empirical scaling
    
    // Gaussian concentration formula
    const lateralTerm = Math.exp(-0.5 * Math.pow(y / sy, 2));
    const verticalTerm = Math.exp(-0.5 * Math.pow(H / sz, 2)) + 
                        Math.exp(-0.5 * Math.pow(-H / sz, 2)); // reflection term
    
    const concentration = (Q / (2 * Math.PI * u * sy * sz)) * lateralTerm * verticalTerm;
    
    return Math.max(0, concentration);
  }

  /**
   * Get Pasquill-Gifford dispersion coefficients
   */
  getDispersionCoefficients(stability: string, distance: number) {
    // Simplified Pasquill-Gifford coefficients (real implementation would use tables)
    const coefficients: Record<string, { sigmaY: number; sigmaZ: number }> = {
      'A': { sigmaY: 0.22, sigmaZ: 0.20 }, // Very unstable
      'B': { sigmaY: 0.16, sigmaZ: 0.12 }, // Moderately unstable  
      'C': { sigmaY: 0.11, sigmaZ: 0.08 }, // Slightly unstable
      'D': { sigmaY: 0.08, sigmaZ: 0.06 }, // Neutral
      'E': { sigmaY: 0.06, sigmaZ: 0.03 }, // Slightly stable
      'F': { sigmaY: 0.04, sigmaZ: 0.016 } // Moderately stable
    };
    
    return coefficients[stability] || coefficients['D'];
  }

  /**
   * Sort points to create a proper polygon shape
   */
  sortPointsForPolygon(points: [number, number][], sourceLon: number, sourceLat: number, windAngle: number) {
    // Simple convex hull approach - for production, use a proper algorithm
    const center = points.reduce(
      (acc, point) => [acc[0] + point[0] / points.length, acc[1] + point[1] / points.length],
      [0, 0]
    );
    
    return points.sort((a, b) => {
      const angleA = Math.atan2(a[1] - center[1], a[0] - center[0]);
      const angleB = Math.atan2(b[1] - center[1], b[0] - center[0]);
      return angleA - angleB;
    });
  }

  /**
   * Get EPA AQI color for concentration
   */
  getColorForConcentration(concentration: number): [number, number, number, number] {
    if (concentration <= 12.0) {
      return [0, 255, 0, 120]; // Good - Green
    } else if (concentration <= 35.4) {
      return [255, 255, 0, 160]; // Moderate - Yellow
    } else if (concentration <= 55.4) {
      return [255, 165, 0, 200]; // Unhealthy for Sensitive - Orange
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
          concentration: info.object.concentration,
          windDirection: info.object.windDirection,
          windSpeed: info.object.windSpeed,
          sourceId: info.object.sourceId,
          aqiLevel: this.getAQILevel(info.object.concentration)
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