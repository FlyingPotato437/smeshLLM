import { CompositeLayer, LayerProps } from '@deck.gl/core';

// Continuous plume data structure
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

// Grid point for interpolated concentration field
interface GridPoint {
  position: [number, number];
  weight: number; // Normalized concentration for heatmap
  originalConcentration: number;
}

const defaultProps = {
  id: 'continuous-plume',
  data: { type: 'array', value: [], compare: true },
  meteorologicalData: {
    windSpeed: 5.0,
    windDirection: 270, // West wind
    mixingHeight: 1000,
    atmosphericStability: 'D' as const // Neutral conditions
  },
  plumeLength: 12000, // meters - how far downwind the plume extends
  crossWindSpread: 4000, // meters - spread perpendicular to wind
  gridResolution: 50, // meters - spacing between interpolated points
  heatmapRadius: 1500, // meters - heatmap kernel radius
  heatmapIntensity: 3.0, // Intensity multiplier
  opacity: 0.8,
  // Dynamically loaded layer classes
  HeatmapLayer: null as any,
  ScatterplotLayer: null as any,
};

export type ContinuousPlumeLayerProps = LayerProps & typeof defaultProps;

export default class ContinuousPlumeLayer extends CompositeLayer<ContinuousPlumeLayerProps> {
  static defaultProps = defaultProps;
  static layerName = 'ContinuousPlumeLayer';

  renderLayers() {
    const { 
      data, 
      meteorologicalData,
      plumeLength,
      crossWindSpread,
      gridResolution,
      heatmapRadius,
      heatmapIntensity,
      opacity,
      HeatmapLayer,
      ScatterplotLayer
    } = this.props;

    if (!HeatmapLayer || !ScatterplotLayer) {
      console.warn('ContinuousPlumeLayer: Required layer classes not available');
      return [];
    }

    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    console.log('🌪️ Creating continuous plume heatmap with', data.length, 'sources');
    console.log('💨 Wind conditions:', meteorologicalData);

    // Generate dense interpolated concentration grid
    const interpolatedGrid = this.generateInterpolatedGrid(
      data,
      meteorologicalData,
      plumeLength,
      crossWindSpread,
      gridResolution
    );

    console.log('📊 Generated', interpolatedGrid.length, 'interpolated grid points');

    const layers: any[] = [];

    // Main continuous plume heatmap
    if (interpolatedGrid.length > 0) {
      layers.push(new HeatmapLayer({
        id: `${this.props.id}-heatmap`,
        data: interpolatedGrid,
        pickable: true,
        radiusMeters: heatmapRadius,
        intensity: heatmapIntensity,
        threshold: 0.02, // Low threshold for smooth gradients
        colorRange: [
          [0, 255, 0, 100],     // Green - Good (low concentration)
          [255, 255, 0, 140],   // Yellow - Moderate 
          [255, 165, 0, 180],   // Orange - Unhealthy for Sensitive
          [255, 80, 0, 220],    // Red-Orange - Unhealthy
          [255, 0, 0, 255],     // Red - Very Unhealthy
          [180, 0, 0, 255],     // Dark Red - Hazardous
        ],
        getPosition: (d: GridPoint) => d.position,
        getWeight: (d: GridPoint) => d.weight,
        opacity: opacity,
        parameters: {
          depthTest: false, // Ensure plume renders above terrain
          blendFunc: ['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA'],
          blendEquation: 'FUNC_ADD'
        },
        updateTriggers: {
          getPosition: [meteorologicalData],
          getWeight: [meteorologicalData],
        }
      }));
    }

    // Optional: Show source points for reference
    layers.push(new ScatterplotLayer({
      id: `${this.props.id}-sources`,
      data: data,
      pickable: true,
      opacity: 0.7,
      stroked: true,
      filled: true,
      radiusScale: 1,
      radiusMinPixels: 6,
      radiusMaxPixels: 12,
      lineWidthMinPixels: 2,
      getPosition: (d: PlumeDataPoint) => d.position,
      getRadius: 8,
      getFillColor: [255, 255, 255, 200], // White source markers
      getLineColor: [255, 0, 0, 255], // Red outline
    }));

    return layers;
  }

  /**
   * Generate dense interpolated grid for continuous plume visualization
   */
  generateInterpolatedGrid(
    sources: PlumeDataPoint[], 
    meteo: MeteorologicalConditions,
    maxDistance: number,
    maxSpread: number,
    resolution: number
  ): GridPoint[] {
    const gridPoints: GridPoint[] = [];
    
    console.log('🔄 Generating interpolated concentration grid...');
    
    // Convert wind direction to mathematical angle (0° = East, counterclockwise)
    const windAngleRad = ((450 - meteo.windDirection) % 360) * Math.PI / 180;
    
    // Calculate dispersion coefficients
    const { sigmaY, sigmaZ } = this.getDispersionCoefficients(meteo.atmosphericStability);
    
    sources.forEach((source, sourceIndex) => {
      const [sourceLon, sourceLat, sourceHeight] = source.position;
      
      console.log(`📍 Processing source ${sourceIndex}: ${sourceLon.toFixed(4)}, ${sourceLat.toFixed(4)}`);
      
      // Create grid extending downwind from each source
      const numStepsDownwind = Math.ceil(maxDistance / resolution);
      const numStepsCrosswind = Math.ceil((maxSpread * 2) / resolution);
      
      for (let i = 0; i <= numStepsDownwind; i++) {
        const downwindDistance = (i / numStepsDownwind) * maxDistance;
        
        // Skip points very close to source (avoid singularities)
        if (downwindDistance < 100) continue;
        
        for (let j = -numStepsCrosswind; j <= numStepsCrosswind; j++) {
          const crosswindDistance = (j / numStepsCrosswind) * maxSpread;
          
          // Calculate concentration at this grid point using Gaussian model
          const concentration = this.calculateGaussianConcentration(
            source.concentration,
            downwindDistance,
            crosswindDistance,
            sourceHeight,
            meteo.windSpeed,
            sigmaY,
            sigmaZ
          );
          
          // Only include significant concentrations
          if (concentration < 0.5) continue;
          
          // Calculate grid point position
          const downwindLon = sourceLon + (downwindDistance * Math.cos(windAngleRad)) / 111000; // rough deg conversion
          const downwindLat = sourceLat + (downwindDistance * Math.sin(windAngleRad)) / 111000;
          
          const crosswindLon = downwindLon + (crosswindDistance * Math.cos(windAngleRad + Math.PI/2)) / 111000;
          const crosswindLat = downwindLat + (crosswindDistance * Math.sin(windAngleRad + Math.PI/2)) / 111000;
          
          // Add noise for more natural plume boundaries
          const noiseScale = 0.0001; // Small random variation
          const noiseLon = crosswindLon + (Math.random() - 0.5) * noiseScale;
          const noiseLat = crosswindLat + (Math.random() - 0.5) * noiseScale;
          
          // Normalize concentration for heatmap weight (logarithmic scale for better visualization)
          const weight = Math.log10(concentration + 1) / 3; // Normalize to 0-1 range roughly
          
          gridPoints.push({
            position: [noiseLon, noiseLat],
            weight: Math.max(0.1, Math.min(1.0, weight)),
            originalConcentration: concentration
          });
        }
      }
    });
    
    // Add additional interpolation between nearby grid points for smoother gradients
    const smoothedGrid = this.addSmoothingPoints(gridPoints, resolution);
    
    console.log(`✅ Grid generation complete: ${smoothedGrid.length} total points`);
    
    return smoothedGrid;
  }

  /**
   * Add intermediate points for smoother gradients
   */
  addSmoothingPoints(gridPoints: GridPoint[], resolution: number): GridPoint[] {
    const smoothedGrid = [...gridPoints];
    const maxNewPoints = 500; // Limit for performance
    let addedPoints = 0;
    
    // Add interpolated points between nearby high-concentration areas
    for (let i = 0; i < gridPoints.length && addedPoints < maxNewPoints; i++) {
      const point1 = gridPoints[i];
      
      if (point1.weight < 0.3) continue; // Only interpolate significant concentrations
      
      for (let j = i + 1; j < gridPoints.length && addedPoints < maxNewPoints; j++) {
        const point2 = gridPoints[j];
        
        if (point2.weight < 0.3) continue;
        
        // Calculate distance between points
        const dx = (point2.position[0] - point1.position[0]) * 111000; // rough meters
        const dy = (point2.position[1] - point1.position[1]) * 111000;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Add intermediate point if points are reasonably close but not too close
        if (distance > resolution && distance < resolution * 3) {
          const midLon = (point1.position[0] + point2.position[0]) / 2;
          const midLat = (point1.position[1] + point2.position[1]) / 2;
          const midWeight = (point1.weight + point2.weight) / 2.2; // Slightly lower for natural gradients
          
          smoothedGrid.push({
            position: [midLon, midLat],
            weight: midWeight,
            originalConcentration: (point1.originalConcentration + point2.originalConcentration) / 2
          });
          
          addedPoints++;
        }
      }
    }
    
    console.log(`🌊 Added ${addedPoints} smoothing points for gradient continuity`);
    
    return smoothedGrid;
  }

  /**
   * Calculate Gaussian plume concentration using atmospheric dispersion model
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
    
    const Q = sourceStrength; // source strength
    const u = windSpeed; // wind speed
    const x = downwindDistance; // downwind distance (meters)
    const y = crossWindDistance; // crosswind distance (meters)
    const H = sourceHeight; // effective stack height (meters)
    
    // Calculate dispersion parameters at this distance (Pasquill-Gifford)
    const sy = sigmaY * Math.pow(x / 1000, 0.8); // Horizontal dispersion
    const sz = sigmaZ * Math.pow(x / 1000, 0.65); // Vertical dispersion
    
    // Avoid division by zero
    if (sy <= 0 || sz <= 0) return 0;
    
    // Gaussian plume concentration formula
    const lateralTerm = Math.exp(-0.5 * Math.pow(y / sy, 2));
    const verticalTerm = Math.exp(-0.5 * Math.pow(H / sz, 2)) + 
                        Math.exp(-0.5 * Math.pow(-H / sz, 2)); // ground reflection
    
    const concentration = (Q / (2 * Math.PI * u * sy * sz)) * lateralTerm * verticalTerm;
    
    return Math.max(0, concentration);
  }

  /**
   * Get Pasquill-Gifford dispersion coefficients
   */
  getDispersionCoefficients(stability: string) {
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

  getPickingInfo({ info }: any) {
    if (info.object) {
      return {
        ...info,
        object: {
          concentration: info.object.originalConcentration,
          weight: info.object.weight,
          position: info.object.position,
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