import { CompositeLayer, LayerProps } from '@deck.gl/core';

// Enhanced smoke blob data structure
interface SmokeDataPoint {
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

// Enhanced blob grid point with clustering info
interface BlobGridPoint {
  position: [number, number];
  weight: number; // Normalized concentration for heatmap
  originalConcentration: number;
  blobId?: number; // For clustering
  distanceFromCore?: number; // Distance from blob center
}

const defaultProps = {
  id: 'enhanced-smoke-blob',
  data: { type: 'array', value: [], compare: true },
  meteorologicalData: {
    windSpeed: 5.0,
    windDirection: 270, // West wind
    mixingHeight: 1000,
    atmosphericStability: 'D' as const // Neutral conditions
  },
  // Enhanced blob parameters for better clustering
  plumeLength: 18000, // meters - longer plumes for more realistic appearance
  crossWindSpread: 8000, // meters - wider spread for blob-like appearance
  gridResolution: 25, // meters - finer resolution for smoother blobs
  heatmapRadius: 3500, // meters - much larger radius for blob effect
  heatmapIntensity: 6.0, // Higher intensity for defined blob boundaries
  blobCoreIntensity: 10.0, // Extra intensity for blob cores
  threshold: 0.03, // Lower threshold for smoother blob edges
  opacity: 0.85,
  enableBlobClustering: true, // Enable advanced blob clustering
  minBlobSize: 100, // Minimum number of points for a blob
  blobMergeDistance: 800, // Distance to merge nearby blobs (meters)
  // Dynamically loaded layer classes
  HeatmapLayer: null as any,
  ScatterplotLayer: null as any,
};

export type EnhancedSmokeBlobLayerProps = LayerProps & typeof defaultProps;

export default class EnhancedSmokeBlobLayer extends CompositeLayer<EnhancedSmokeBlobLayerProps> {
  static defaultProps = defaultProps;
  static layerName = 'EnhancedSmokeBlobLayer';

  renderLayers() {
    const { 
      data, 
      meteorologicalData,
      plumeLength,
      crossWindSpread,
      gridResolution,
      heatmapRadius,
      heatmapIntensity,
      blobCoreIntensity,
      threshold,
      opacity,
      enableBlobClustering,
      minBlobSize,
      blobMergeDistance,
      HeatmapLayer,
      ScatterplotLayer
    } = this.props;

    if (!HeatmapLayer || !ScatterplotLayer) {
      console.warn('EnhancedSmokeBlobLayer: Required layer classes not available');
      return [];
    }

    if (!Array.isArray(data) || data.length === 0) {
      return [];
    }

    console.log('🌪️ Creating enhanced smoke blob visualization with', data.length, 'sources');
    console.log('💨 Wind conditions:', meteorologicalData);
    console.log('🔍 Input data sample:', data.slice(0, 3));

    // Generate enhanced blob grid with clustering
    const blobGrid = this.generateEnhancedBlobGrid(
      data,
      meteorologicalData,
      plumeLength,
      crossWindSpread,
      gridResolution,
      enableBlobClustering,
      minBlobSize,
      blobMergeDistance
    );

    console.log('🎯 Generated', blobGrid.length, 'blob grid points with clustering');

    const layers: any[] = [];

    // Single continuous heatmap for smooth blob appearance
    if (blobGrid.length > 0) {
      console.log('🌊 Creating single continuous heatmap for smooth blob visualization');
      console.log('🎯 HeatmapLayer data sample:', blobGrid.slice(0, 3));
      console.log('📊 Weight distribution:', {
        min: Math.min(...blobGrid.map(p => p.weight)),
        max: Math.max(...blobGrid.map(p => p.weight)),
        avg: blobGrid.reduce((sum, p) => sum + p.weight, 0) / blobGrid.length
      });
      
      // Use all data points in one unified heatmap for seamless blending
      layers.push(new HeatmapLayer({
        id: `${this.props.id}-continuous-blob`,
        data: blobGrid,
        pickable: true,
        radiusMeters: 800, // Small radius for concentrated heat around points
        intensity: 10.0, // Very high intensity for strong visibility
        threshold: 0.001, // Extremely low threshold
        colorRange: [
          [0, 255, 0, 150],     // Green - more opaque
          [255, 255, 0, 180],   // Yellow - more opaque
          [255, 165, 0, 210],   // Orange - more opaque
          [255, 80, 0, 240],    // Red-Orange - more opaque
          [255, 0, 0, 255],     // Red - fully opaque
          [200, 0, 0, 255],     // Dark Red - fully opaque
        ],
        getPosition: (d: BlobGridPoint) => d.position,
        getWeight: (d: BlobGridPoint) => d.weight,
        opacity: 0.9, // Force high opacity for visibility
        parameters: {
          depthTest: false,
          blendFunc: ['SRC_ALPHA', 'ONE_MINUS_SRC_ALPHA'],
          blendEquation: 'FUNC_ADD'
        },
        updateTriggers: {
          getPosition: [blobGrid.length],
          getWeight: [blobGrid.length],
        }
      }));
      
      console.log('✅ Single continuous heatmap created for smooth blob visualization');
    }

    // DEBUG: Highly visible ScatterplotLayer to verify data flow
    layers.push(new ScatterplotLayer({
      id: `${this.props.id}-debug-sources`,
      data: data,
      pickable: true,
      opacity: 0.8, // More visible for debugging
      stroked: true,
      filled: true,
      radiusScale: 1.0,
      radiusMinPixels: 8,
      radiusMaxPixels: 16,
      lineWidthMinPixels: 2,
      getPosition: (d: SmokeDataPoint) => d.position,
      getRadius: 12,
      getFillColor: [255, 0, 255, 200], // Bright magenta debug color
      getLineColor: [255, 255, 255, 255], // White outline
    }));

    return layers;
  }

  /**
   * Generate enhanced blob grid with clustering algorithms for realistic smoke appearance
   */
  generateEnhancedBlobGrid(
    sources: SmokeDataPoint[], 
    meteo: MeteorologicalConditions,
    maxDistance: number,
    maxSpread: number,
    resolution: number,
    enableClustering: boolean,
    minBlobSize: number,
    blobMergeDistance: number
  ): BlobGridPoint[] {
    const gridPoints: BlobGridPoint[] = [];
    
    console.log('🌊 Generating enhanced blob grid with clustering...');
    
    // Convert wind direction to mathematical angle (0° = East, counterclockwise)
    const windAngleRad = ((450 - meteo.windDirection) % 360) * Math.PI / 180;
    
    // Calculate dispersion coefficients
    const { sigmaY, sigmaZ } = this.getDispersionCoefficients(meteo.atmosphericStability);
    
    sources.forEach((source, sourceIndex) => {
      const [sourceLon, sourceLat, sourceHeight] = source.position;
      
      console.log(`📍 Processing blob source ${sourceIndex}: ${sourceLon.toFixed(4)}, ${sourceLat.toFixed(4)}`);
      
      // Create dense grid for blob-like appearance
      const numStepsDownwind = Math.ceil(maxDistance / resolution);
      const numStepsCrosswind = Math.ceil((maxSpread * 2) / resolution);
      
      for (let i = 0; i <= numStepsDownwind; i++) {
        const downwindDistance = (i / numStepsDownwind) * maxDistance;
        
        // Skip points very close to source (avoid singularities)
        if (downwindDistance < 50) continue;
        
        for (let j = -numStepsCrosswind; j <= numStepsCrosswind; j++) {
          const crosswindDistance = (j / numStepsCrosswind) * maxSpread;
          
          // Calculate concentration with enhanced blob modeling
          const concentration = this.calculateEnhancedBlobConcentration(
            source.concentration,
            downwindDistance,
            crosswindDistance,
            sourceHeight,
            meteo.windSpeed,
            sigmaY,
            sigmaZ
          );
          
          // Use threshold that ensures visibility with test data
          if (concentration < 1.0) continue; // Higher threshold to ensure test data (50-150) passes
          
          // Calculate grid point position
          const downwindLon = sourceLon + (downwindDistance * Math.cos(windAngleRad)) / 111000;
          const downwindLat = sourceLat + (downwindDistance * Math.sin(windAngleRad)) / 111000;
          
          const crosswindLon = downwindLon + (crosswindDistance * Math.cos(windAngleRad + Math.PI/2)) / 111000;
          const crosswindLat = downwindLat + (crosswindDistance * Math.sin(windAngleRad + Math.PI/2)) / 111000;
          
          // Add controlled noise for natural blob boundaries
          const noiseScale = 0.00008; // Smaller noise for smoother blobs
          const noiseLon = crosswindLon + (Math.random() - 0.5) * noiseScale;
          const noiseLat = crosswindLat + (Math.random() - 0.5) * noiseScale;
          
          // Simplified weight calculation for immediate visibility
          const simpleWeight = Math.min(1.0, concentration / 100.0); // Simple linear scale
          const weight = Math.max(0.3, simpleWeight); // Force high minimum weight for visibility
          
          console.log(`🎯 Point [${noiseLon.toFixed(4)}, ${noiseLat.toFixed(4)}]: concentration=${concentration.toFixed(2)}, simpleWeight=${simpleWeight.toFixed(3)}, finalWeight=${weight.toFixed(3)}`);
          
          gridPoints.push({
            position: [noiseLon, noiseLat],
            weight: weight, // Already bounded 0.3-1.0 for visibility
            originalConcentration: concentration,
            distanceFromCore: downwindDistance
          });
        }
      }
    });
    
    // Apply blob clustering if enabled
    let finalGrid = gridPoints;
    if (enableClustering) {
      finalGrid = this.applyBlobClustering(gridPoints, blobMergeDistance, minBlobSize);
    }
    
    // Add enhanced smoothing for blob-like gradients
    const smoothedGrid = this.addEnhancedBlobSmoothing(finalGrid, resolution);
    
    console.log(`✅ Enhanced blob grid generation complete: ${smoothedGrid.length} total points`);
    console.log('🎯 Sample grid points:', smoothedGrid.slice(0, 5));
    console.log('📊 Weight range:', {
      min: Math.min(...smoothedGrid.map(p => p.weight)),
      max: Math.max(...smoothedGrid.map(p => p.weight)),
      avg: smoothedGrid.reduce((sum, p) => sum + p.weight, 0) / smoothedGrid.length
    });
    
    return smoothedGrid;
  }

  /**
   * Enhanced blob concentration calculation with better blob modeling
   */
  calculateEnhancedBlobConcentration(
    sourceStrength: number,
    downwindDistance: number,
    crossWindDistance: number,
    sourceHeight: number,
    windSpeed: number,
    sigmaY: number,
    sigmaZ: number
  ): number {
    if (downwindDistance <= 0 || windSpeed <= 0) return 0;
    
    // Standard Gaussian calculation
    const baseConcentration = this.calculateGaussianConcentration(
      sourceStrength, downwindDistance, crossWindDistance, sourceHeight, windSpeed, sigmaY, sigmaZ
    );
    
    // Enhanced blob modeling with distance-based clustering
    const blobEnhancement = this.calculateBlobEnhancement(downwindDistance, crossWindDistance);
    
    return baseConcentration * blobEnhancement;
  }

  /**
   * Calculate blob enhancement factor for more realistic blob appearance
   */
  calculateBlobEnhancement(downwindDistance: number, crossWindDistance: number): number {
    // Create blob-like concentration patterns
    const radialDistance = Math.sqrt(downwindDistance * downwindDistance + crossWindDistance * crossWindDistance);
    
    // Multi-scale blob enhancement with better clustering
    const largeBlobFactor = Math.exp(-radialDistance / 12000) * 1.5; // Larger-scale blob structure
    const mediumBlobFactor = Math.exp(-radialDistance / 4000) * 1.2; // Medium-scale blob features
    const smallBlobFactor = Math.exp(-radialDistance / 1500) * 0.8; // Small-scale blob variations
    
    // Add blob clustering effects
    const clusteringFactor = Math.exp(-Math.pow(radialDistance / 6000, 1.5)) * 0.6; // Non-linear clustering
    
    // Combine scales for more realistic blob appearance
    const combinedFactor = largeBlobFactor + mediumBlobFactor + smallBlobFactor + clusteringFactor;
    
    // Enhanced blob boundary definition
    const boundarySharpening = radialDistance < 2000 ? 1.4 : (radialDistance < 5000 ? 1.1 : 0.9);
    
    return Math.max(0.2, Math.min(3.0, combinedFactor * boundarySharpening));
  }

  /**
   * Calculate enhanced blob weight for better visualization
   */
  calculateBlobWeight(concentration: number, distance: number, maxDistance: number): number {
    // Logarithmic scaling with blob-specific adjustments
    const logWeight = Math.log10(concentration + 1) / 3;
    
    // Distance-based blob intensity (closer = more intense)
    const distanceFactor = 1 - (distance / maxDistance);
    const distanceWeight = Math.pow(distanceFactor, 0.3); // Gentle distance falloff
    
    // Blob concentration enhancement
    const blobWeight = logWeight * distanceWeight;
    
    // Add concentration-based intensity boost for blob cores
    const intensityBoost = concentration > 50 ? 1.5 : (concentration > 20 ? 1.2 : 1.0);
    
    return blobWeight * intensityBoost;
  }

  /**
   * Apply advanced blob clustering algorithms
   */
  applyBlobClustering(gridPoints: BlobGridPoint[], mergeDistance: number, minBlobSize: number): BlobGridPoint[] {
    console.log('🎯 Applying blob clustering algorithms...');
    
    // Sort points by weight (highest first) for better clustering
    const sortedPoints = [...gridPoints].sort((a, b) => b.weight - a.weight);
    const clusteredPoints: BlobGridPoint[] = [];
    let blobId = 0;
    
    // Group points into blobs
    for (const point of sortedPoints) {
      // Find nearby points to form blobs
      const nearbyPoints = sortedPoints.filter(other => {
        if (other === point) return true;
        const dx = (other.position[0] - point.position[0]) * 111000; // rough meters
        const dy = (other.position[1] - point.position[1]) * 111000;
        const distance = Math.sqrt(dx * dx + dy * dy);
        return distance <= mergeDistance;
      });
      
      // Only create blob if it has enough points
      if (nearbyPoints.length >= minBlobSize) {
        nearbyPoints.forEach(p => {
          if (!clusteredPoints.includes(p)) {
            p.blobId = blobId;
            clusteredPoints.push(p);
          }
        });
        blobId++;
      }
    }
    
    console.log(`🎯 Created ${blobId} blob clusters`);
    
    return clusteredPoints.length > 0 ? clusteredPoints : gridPoints;
  }

  /**
   * Add enhanced smoothing specifically for blob-like appearance
   */
  addEnhancedBlobSmoothing(gridPoints: BlobGridPoint[], resolution: number): BlobGridPoint[] {
    const smoothedGrid = [...gridPoints];
    const maxNewPoints = 1500; // Many more points for continuous heatmap
    let addedPoints = 0;
    
    // Enhanced interpolation for continuous blob gradients
    for (let i = 0; i < gridPoints.length && addedPoints < maxNewPoints; i++) {
      const point1 = gridPoints[i];
      
      if (point1.weight < 0.01) continue; // Include very low concentrations for maximum continuity
      
      for (let j = i + 1; j < gridPoints.length && addedPoints < maxNewPoints; j++) {
        const point2 = gridPoints[j];
        
        if (point2.weight < 0.01) continue; // Include very low concentrations for maximum continuity
        
        // Calculate distance between points
        const dx = (point2.position[0] - point1.position[0]) * 111000;
        const dy = (point2.position[1] - point1.position[1]) * 111000;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Add multiple intermediate points for smooth blob gradients
        if (distance > resolution * 0.8 && distance < resolution * 4) {
          const numIntermediatePoints = Math.min(3, Math.floor(distance / (resolution * 0.5)));
          
          for (let k = 1; k <= numIntermediatePoints; k++) {
            const ratio = k / (numIntermediatePoints + 1);
            const midLon = point1.position[0] + (point2.position[0] - point1.position[0]) * ratio;
            const midLat = point1.position[1] + (point2.position[1] - point1.position[1]) * ratio;
            
            // Enhanced weight interpolation for blob gradients
            const baseWeight = point1.weight + (point2.weight - point1.weight) * ratio;
            const gradientWeight = baseWeight * (1 - Math.abs(ratio - 0.5) * 0.3); // Slightly lower for natural gradients
            
            smoothedGrid.push({
              position: [midLon, midLat],
              weight: Math.max(0.01, gradientWeight), // Much lower minimum for continuous gradients
              originalConcentration: (point1.originalConcentration + point2.originalConcentration) / 2,
              blobId: point1.blobId === point2.blobId ? point1.blobId : undefined
            });
            
            addedPoints++;
          }
        }
      }
    }
    
    console.log(`🌊 Added ${addedPoints} blob smoothing points for enhanced gradients`);
    
    return smoothedGrid;
  }

  // Reuse existing helper methods from ContinuousPlumeLayer
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
    
    const Q = sourceStrength;
    const u = windSpeed;
    const x = downwindDistance;
    const y = crossWindDistance;
    const H = sourceHeight;
    
    const sy = sigmaY * Math.pow(x / 1000, 0.8);
    const sz = sigmaZ * Math.pow(x / 1000, 0.65);
    
    if (sy <= 0 || sz <= 0) return 0;
    
    const lateralTerm = Math.exp(-0.5 * Math.pow(y / sy, 2));
    const verticalTerm = Math.exp(-0.5 * Math.pow(H / sz, 2)) + 
                        Math.exp(-0.5 * Math.pow(-H / sz, 2));
    
    const concentration = (Q / (2 * Math.PI * u * sy * sz)) * lateralTerm * verticalTerm;
    
    return Math.max(0, concentration);
  }

  getDispersionCoefficients(stability: string) {
    const coefficients: Record<string, { sigmaY: number; sigmaZ: number }> = {
      'A': { sigmaY: 0.22, sigmaZ: 0.20 },
      'B': { sigmaY: 0.16, sigmaZ: 0.12 },
      'C': { sigmaY: 0.11, sigmaZ: 0.08 },
      'D': { sigmaY: 0.08, sigmaZ: 0.06 },
      'E': { sigmaY: 0.06, sigmaZ: 0.03 },
      'F': { sigmaY: 0.04, sigmaZ: 0.016 }
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
          blobId: info.object.blobId,
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