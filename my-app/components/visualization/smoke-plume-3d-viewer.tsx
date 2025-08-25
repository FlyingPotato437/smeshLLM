'use client';

/**
 * 3D Smoke Plume Visualization - Client-side only component
 * Properly handles hydration and dynamic imports
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import HysplitSmokeLayer from '@/lib/layers/hysplit-smoke-layer';
import WindAwarePlumeLayer from '@/lib/layers/wind-aware-plume-layer';
import ContinuousPlumeLayer from '@/lib/layers/continuous-plume-layer';
import EnhancedSmokeBlobLayer from '@/lib/layers/enhanced-smoke-blob-layer';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { HysplitTimeline } from "@/components/ui/hysplit-timeline";
import { getSmoothAQIColor, getAQILevel, EPA_AQI_LEVELS } from "@/lib/utils";

// ============================================================================
// TYPES
// ============================================================================

interface ConcentrationPoint {
  position: [number, number, number]; // [lon, lat, elevation]
  concentration: number; // μg/m³
  uncertainty: number;
  timestamp: Date;
  source: 'hysplit' | 'ai_enhanced';
  velocity?: [number, number, number];
  temperature?: number;
}

interface SensorData {
  id: string;
  position: [number, number, number];
  pm25: number;
  status: 'active' | 'inactive';
  lastUpdate: Date;
}

interface PrescribedBurn {
  id: string;
  name: string;
  area: GeoJSON.Polygon;
  phase: string;
  startTime: Date;
  endTime?: Date;
}

interface MeteorologicalData {
  windSpeed: number;
  windDirection: number;
  temperature: number;
  humidity: number;
  mixingHeight: number;
}

interface SmokePlume3DViewerProps {
  concentrationData: ConcentrationPoint[];
  sensorData: SensorData[];
  prescribedBurns: PrescribedBurn[];
  meteorologicalData: MeteorologicalData;
  onTimeChange?: (timestamp: Date) => void;
  onAltitudeChange?: (altitude: number) => void;
  className?: string;
}

// ============================================================================
// INTERNAL VIEWER COMPONENT
// ============================================================================

function SmokePlume3DViewerInternal({
  concentrationData: initialConcentrationData,
  sensorData: initialSensorData,
  prescribedBurns: initialPrescribedBurns,
  meteorologicalData: initialMeteorologicalData,
  onTimeChange,
  onAltitudeChange,
  className = ''
}: SmokePlume3DViewerProps) {
  
  // State for dynamic imports
  const [deckComponents, setDeckComponents] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Add states before existing states
  const [concentrationData, setConcentrationData] = useState<ConcentrationPoint[]>(initialConcentrationData || [
    { position: [-122.1430, 37.4419, 100], concentration: 50, uncertainty: 5, timestamp: new Date(), source: 'hysplit' },
    { position: [-122.1400, 37.4400, 200], concentration: 80, uncertainty: 8, timestamp: new Date(), source: 'ai_enhanced' },
    // Add more points for a visible plume
    { position: [-122.1450, 37.4430, 300], concentration: 120, uncertainty: 10, timestamp: new Date(), source: 'hysplit' },
    { position: [-122.1420, 37.4420, 400], concentration: 150, uncertainty: 12, timestamp: new Date(), source: 'ai_enhanced' },
  ]);
  const [meteorologicalData, setMeteorologicalData] = useState<MeteorologicalData>(initialMeteorologicalData || {
    windSpeed: 5.0,
    windDirection: 180,
    temperature: 293.15, // 20°C in Kelvin
    humidity: 60,
    mixingHeight: 1000
  });

  // Load deck.gl components
  useEffect(() => {
    let mounted = true;
    
    const loadDeckGL = async () => {
      try {
        const [deckModule, layersModule, geoLayersModule, aggregationLayersModule, coreModule] = await Promise.all([
          import('@deck.gl/react'),
          import('@deck.gl/layers'),
          import('@deck.gl/geo-layers'),
          import('@deck.gl/aggregation-layers'),
          import('@deck.gl/core')
        ]);

        if (mounted) {
          setDeckComponents({
            DeckGL: deckModule.DeckGL,
            layers: {
              ScatterplotLayer: layersModule.ScatterplotLayer,
              ColumnLayer: layersModule.ColumnLayer,
              BitmapLayer: layersModule.BitmapLayer,
              PolygonLayer: layersModule.PolygonLayer,
              TileLayer: geoLayersModule.TileLayer,
              TerrainLayer: geoLayersModule.TerrainLayer,
              HeatmapLayer: aggregationLayersModule.HeatmapLayer
            },
            MapView: coreModule.MapView
          });
          console.log('✅ Deck.gl components loaded successfully');
          console.log('📊 Available layers:', Object.keys(layersModule || {}));
          setIsLoading(false);
        }
      } catch (error) {
        console.error('Failed to load deck.gl:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    };

    loadDeckGL();
    
    return () => {
      mounted = false;
    };
  }, []);

  // Add useEffect for logging after other useEffects (around line 285):
  useEffect(() => {
    console.log('Concentration data length:', concentrationData.length);
    console.log('Concentration data:', concentrationData);
  }, [concentrationData]);

  // State management
  // In viewState initialization, change pitch and zoom:
  const [viewState, setViewState] = useState({
    longitude: -122.1430, // Stanford area
    latitude: 37.4419,   // Stanford area  
    zoom: 13, // Good zoom level for regional view
    pitch: 45, // Angled view for 3D effect
    bearing: 0,
    maxZoom: 20,
    minZoom: 8,
    maxPitch: 85
  });

  // Log camera position for debugging
  useEffect(() => {
    console.log('📹 Camera ViewState:', viewState);
    console.log('📍 Looking at coordinates:', `${viewState.latitude.toFixed(4)}, ${viewState.longitude.toFixed(4)}`);
    console.log('🔍 Zoom level:', viewState.zoom);
  }, [viewState]);

  // In renderSettings state, change showTerrain to false:
  const [renderSettings, setRenderSettings] = useState({
    showTerrain: false,
    showSmoke: true,
    showSensors: true,
    showControls: true,
    showDataPoints: false, // Debug mode: show individual concentration points
    useRealisticPlumes: false, // Use wind-aware plumes instead of circular heatmaps
    useContinuousPlumes: false, // Use continuous interpolated heatmap plumes
    useEnhancedBlobPlumes: false, // Use enhanced blob-like smoke visualization
    heatmapRadius: 10000, // Increased for better heatmap spread
    heatmapIntensity: 3.0, // Increased intensity for visible heatmap
    concentrationThreshold: 0.5, // Lower threshold to show more data (μg/m³)
    timeWindowMinutes: 180, // Show data within this time window (3 hours for real-time mode)
    altitudeMin: 0,
    altitudeMax: 2000,
    plumeLength: 8000, // meters - how far downwind plumes extend
    crossWindSpread: 3000, // meters - cross-wind dispersion
    gridResolution: 100, // meters - spacing for interpolated grid points
    maxDataPoints: 1000, // Limit total data points for performance
    enableLOD: true, // Level of Detail optimization
    performanceMode: 'balanced' // 'fast', 'balanced', 'quality'
  });

  const [isPlaying, setIsPlaying] = useState(false);
  const [isTimelineActive, setIsTimelineActive] = useState(false);
  const [currentForecastHour, setCurrentForecastHour] = useState(0);

  // Helper constants
  const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN || '';

  // Helper functions
  const getConcentrationColor = useCallback((concentration: number): [number, number, number, number] => {
    // More dramatic color scheme with higher opacity for better visibility
    if (concentration <= 12) {
      return [100, 255, 100, 200]; // Bright Green
    } else if (concentration <= 35.4) {
      return [255, 255, 50, 220]; // Bright Yellow
    } else if (concentration <= 55.4) {
      return [255, 165, 0, 240]; // Orange
    } else if (concentration <= 100) {
      return [255, 80, 50, 250]; // Red-Orange
    } else if (concentration <= 200) {
      return [255, 20, 20, 255]; // Bright Red
    } else if (concentration <= 300) {
      return [180, 50, 180, 255]; // Purple
    } else {
      return [139, 0, 0, 255]; // Dark Red/Maroon
    }
  }, []);

  const getParticleRadius = useCallback((concentration: number): number => {
    // Enhanced radius calculation for better visibility
    const baseRadius = 120; // Increased base size
    const scaleFactor = Math.sqrt(concentration / 20) * 1.0; // Fixed scale factor
    return Math.max(50, Math.min(500, baseRadius * scaleFactor)); // Larger range
  }, []);

  // Create layers
  const plumeCenter = useMemo(() => {
    if (concentrationData.length === 0) return [-122.1697, 37.4275];
    const avgLon = concentrationData.reduce((sum, p) => sum + p.position[0], 0) / concentrationData.length;
    const avgLat = concentrationData.reduce((sum, p) => sum + p.position[1], 0) / concentrationData.length;
    return [avgLon, avgLat];
  }, [concentrationData]);

  const deckLayers = useMemo(() => {
    if (!deckComponents?.layers || !deckComponents?.MapView || isLoading) return [];

    const { layers } = deckComponents;
    const allLayers: any[] = [];

    // LAYER ORDER IS CRITICAL: First layers render underneath, last layers render on top

    // 1. Terrain layer (bottom layer)
    if (renderSettings.showTerrain) {
      console.log('🏔️ Creating TerrainLayer...');
      try {
        allLayers.push(
          new layers.TerrainLayer({
            id: 'terrain',
            minZoom: 0,
            maxZoom: 23,
            strategy: 'no-overlap',
            elevationDecoder: {
              rScaler: 6553.6,
              gScaler: 25.6,
              bScaler: 0.1,
              offset: -10000
            },
            elevationData: `https://api.mapbox.com/v4/mapbox.terrain-rgb/{z}/{x}/{y}.png?access_token=${MAPBOX_TOKEN}`,
            texture: `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.png?access_token=${MAPBOX_TOKEN}`,
            wireframe: false,
            color: [255, 255, 255],
            opacity: 0.8
          })
        );
        console.log('✅ TerrainLayer created successfully');
      } catch (error) {
        console.error('❌ Failed to create TerrainLayer:', error);
      }
    }

    // 2. HYSPLIT-based smoke concentration layer (middle layer - above terrain)
    if (renderSettings.showSmoke) {
      // Calculate current time based on timeline if active
      const currentTimeForViz = isTimelineActive 
        ? new Date(Date.now() + (currentForecastHour * 60 * 60 * 1000)) // FORWARD in time for forecast
        : new Date();
      
      // For timeline mode, show data within a reasonable window around the current forecast time
      const effectiveTimeWindow = isTimelineActive 
        ? 120 // Show 2 hours of data around the current forecast time
        : renderSettings.timeWindowMinutes; // User setting for real-time mode
        
      console.log('🌪️ Creating smoke visualization with data:', concentrationData.length, 'points');
      console.log('🕐 Current time for viz:', currentTimeForViz);
      console.log('⚙️ Settings:', {
        timeWindow: effectiveTimeWindow,
        timelineActive: isTimelineActive,
        forecastHour: currentForecastHour,
        altitudeFilter: [renderSettings.altitudeMin, renderSettings.altitudeMax],
        threshold: renderSettings.concentrationThreshold,
        useRealisticPlumes: renderSettings.useRealisticPlumes,
        useContinuousPlumes: renderSettings.useContinuousPlumes
      });

      if (renderSettings.useEnhancedBlobPlumes) {
        // Use enhanced blob-like smoke visualization for realistic cluster appearance
        console.log('🌊 Creating EnhancedSmokeBlobLayer for blob-like smoke clusters...');
        try {
          let filteredData = concentrationData.filter(point => {
            // Filter data for current time window and concentration threshold
            const timeDiff = Math.abs(currentTimeForViz.getTime() - point.timestamp.getTime()) / (1000 * 60);
            return timeDiff <= effectiveTimeWindow && point.concentration >= renderSettings.concentrationThreshold;
          });

          // Performance optimization: limit data points
          if (filteredData.length > renderSettings.maxDataPoints) {
            // Sort by concentration (highest first) and take top N points
            filteredData = filteredData
              .sort((a, b) => b.concentration - a.concentration)
              .slice(0, renderSettings.maxDataPoints);
            console.log(`🚀 Performance: Limited to ${renderSettings.maxDataPoints} highest concentration points`);
          }

          console.log('🔍 DEBUG: Filtered data for EnhancedSmokeBlobLayer:', filteredData.length, 'points');
          console.log('🔍 DEBUG: Sample filtered data:', filteredData.slice(0, 2));
          console.log('🔍 DEBUG: Concentration threshold:', renderSettings.concentrationThreshold);
          
          // Enhanced blob-specific parameters
          let plumeLength = renderSettings.plumeLength * 1.2; // Longer for better blob formation
          let crossWindSpread = renderSettings.crossWindSpread * 1.4; // Wider for blob clusters
          let gridResolution = Math.max(30, renderSettings.gridResolution * 0.6); // Finer for smooth blobs
          let heatmapRadius = renderSettings.heatmapRadius * 1.8; // Much larger for blob effect
          let heatmapIntensity = renderSettings.heatmapIntensity * 2.0; // Higher intensity for blob cores
          
          // Performance mode adjustments for enhanced blobs
          if (renderSettings.performanceMode === 'fast') {
            plumeLength *= 0.8;
            crossWindSpread *= 0.8;
            gridResolution *= 1.2; // Coarser for speed
            heatmapRadius *= 0.9;
            heatmapIntensity *= 1.1;
          } else if (renderSettings.performanceMode === 'quality') {
            plumeLength *= 1.3; // More detailed blobs
            crossWindSpread *= 1.3;
            gridResolution *= 0.8; // Finer for quality
            heatmapRadius *= 1.2;
            heatmapIntensity *= 1.1;
          }

          allLayers.push(new EnhancedSmokeBlobLayer({
            id: 'enhanced-blob-layer',
            data: filteredData as any,
            meteorologicalData: {
              windSpeed: meteorologicalData.windSpeed,
              windDirection: meteorologicalData.windDirection,
              mixingHeight: meteorologicalData.mixingHeight,
              atmosphericStability: 'D' // Neutral stability default
            },
            plumeLength,
            crossWindSpread,
            gridResolution,
            heatmapRadius,
            heatmapIntensity,
            blobCoreIntensity: heatmapIntensity * 1.6, // Extra intensity for blob cores
            opacity: 0.85,
            enableBlobClustering: true,
            minBlobSize: 100,
            blobMergeDistance: 800,
            HeatmapLayer: layers.HeatmapLayer,
            ScatterplotLayer: layers.ScatterplotLayer
          }));
          console.log('✅ EnhancedSmokeBlobLayer created successfully for blob-like smoke visualization');
        } catch (error) {
          console.error('❌ Failed to create EnhancedSmokeBlobLayer:', error);
        }
      } else if (renderSettings.useContinuousPlumes) {
        // Use continuous interpolated heatmap for smooth plume visualization
        console.log('🌊 Creating ContinuousPlumeLayer for smooth heatmap plumes...');
        try {
          let filteredData = concentrationData.filter(point => {
            // Filter data for current time window and concentration threshold
            const timeDiff = Math.abs(currentTimeForViz.getTime() - point.timestamp.getTime()) / (1000 * 60);
            return timeDiff <= effectiveTimeWindow && point.concentration >= renderSettings.concentrationThreshold;
          });

          // Performance optimization: limit data points
          if (filteredData.length > renderSettings.maxDataPoints) {
            // Sort by concentration (highest first) and take top N points
            filteredData = filteredData
              .sort((a, b) => b.concentration - a.concentration)
              .slice(0, renderSettings.maxDataPoints);
            console.log(`🚀 Performance: Limited to ${renderSettings.maxDataPoints} highest concentration points`);
          }

          // Performance mode adjustments for continuous plumes
          let plumeLength = renderSettings.plumeLength;
          let crossWindSpread = renderSettings.crossWindSpread;
          let gridResolution = renderSettings.gridResolution;
          let heatmapRadius = renderSettings.heatmapRadius;
          let heatmapIntensity = renderSettings.heatmapIntensity;
          
          if (renderSettings.performanceMode === 'fast') {
            plumeLength *= 0.8; // Reduce plume complexity
            crossWindSpread *= 0.8;
            gridResolution *= 1.5; // Coarser grid for speed
            heatmapRadius *= 0.8;
            heatmapIntensity *= 1.2; // Higher intensity to compensate
          } else if (renderSettings.performanceMode === 'quality') {
            plumeLength *= 1.3; // Increase detail
            crossWindSpread *= 1.2;
            gridResolution *= 0.7; // Finer grid for quality
            heatmapRadius *= 1.2;
            heatmapIntensity *= 0.9; // Lower intensity for smoother gradients
          }

          allLayers.push(new ContinuousPlumeLayer({
            id: 'continuous-plume-layer',
            data: filteredData as any,
            meteorologicalData: {
              windSpeed: meteorologicalData.windSpeed,
              windDirection: meteorologicalData.windDirection,
              mixingHeight: meteorologicalData.mixingHeight,
              atmosphericStability: 'D' as const // Neutral conditions default
            },
            plumeLength: plumeLength,
            crossWindSpread: crossWindSpread,
            gridResolution: gridResolution,
            heatmapRadius: heatmapRadius,
            heatmapIntensity: heatmapIntensity,
            opacity: 0.85,
            HeatmapLayer: layers.HeatmapLayer,
            ScatterplotLayer: layers.ScatterplotLayer
          }));
          console.log('✅ ContinuousPlumeLayer created successfully for smooth plume visualization');
        } catch (error) {
          console.error('❌ Failed to create ContinuousPlumeLayer:', error);
        }
      } else if (renderSettings.useRealisticPlumes) {
        // Use wind-aware plume visualization for realistic dispersion
        console.log('🌪️ Creating WindAwarePlumeLayer...');
        try {
          let filteredData = concentrationData.filter(point => {
            // Filter data for current time window and concentration threshold
            const timeDiff = Math.abs(currentTimeForViz.getTime() - point.timestamp.getTime()) / (1000 * 60);
            return timeDiff <= effectiveTimeWindow && point.concentration >= renderSettings.concentrationThreshold;
          });

          // Performance optimization: limit data points
          if (filteredData.length > renderSettings.maxDataPoints) {
            // Sort by concentration (highest first) and take top N points
            filteredData = filteredData
              .sort((a, b) => b.concentration - a.concentration)
              .slice(0, renderSettings.maxDataPoints);
            console.log(`🚀 Performance: Limited to ${renderSettings.maxDataPoints} highest concentration points`);
          }

          // Performance mode adjustments
          let plumeLength = renderSettings.plumeLength;
          let crossWindSpread = renderSettings.crossWindSpread;
          
          if (renderSettings.performanceMode === 'fast') {
            plumeLength *= 0.7; // Reduce plume complexity
            crossWindSpread *= 0.7;
          } else if (renderSettings.performanceMode === 'quality') {
            plumeLength *= 1.2; // Increase detail
            crossWindSpread *= 1.2;
          }

          allLayers.push(new WindAwarePlumeLayer({
            id: 'wind-aware-plume-layer',
            data: filteredData as any, // Type assertion to work with deck.gl props
            meteorologicalData: {
              windSpeed: meteorologicalData.windSpeed,
              windDirection: meteorologicalData.windDirection,
              mixingHeight: meteorologicalData.mixingHeight,
              atmosphericStability: 'D' as const // Neutral conditions default
            },
            plumeLength: plumeLength,
            crossWindSpread: crossWindSpread,
            opacity: 0.8,
            PolygonLayer: layers.PolygonLayer,
            ScatterplotLayer: layers.ScatterplotLayer
          }));
          console.log('✅ WindAwarePlumeLayer created successfully');
        } catch (error) {
          console.error('❌ Failed to create WindAwarePlumeLayer:', error);
        }
      } else {
        // Fallback to original circular heatmap approach
        console.log('🌪️ Creating HysplitSmokeLayer (legacy)...');
        try {
          allLayers.push(new HysplitSmokeLayer({ 
            id: 'hysplit-smoke-layer',
            data: concentrationData as any,
            currentTime: currentTimeForViz,
            timeWindowMinutes: effectiveTimeWindow,
            altitudeFilter: [renderSettings.altitudeMin, renderSettings.altitudeMax],
            concentrationThreshold: renderSettings.concentrationThreshold,
            heatmapRadius: renderSettings.heatmapRadius,
            heatmapIntensity: renderSettings.heatmapIntensity,
            showDataPoints: false, // Use separate debug layer above
            opacity: 0.9,
            HeatmapLayer: layers.HeatmapLayer,
            ScatterplotLayer: layers.ScatterplotLayer
          }));
          console.log('✅ HysplitSmokeLayer created successfully');
        } catch (error) {
          console.error('❌ Failed to create HysplitSmokeLayer:', error);
        }
      }
    }

    // 3. DEBUG: Raw data visualization (above smoke layer)
    if (renderSettings.showDataPoints) {
      console.log('🔍 DEBUG MODE: Showing raw data as ScatterplotLayer');
      console.log('📊 Raw concentration data:', concentrationData.slice(0, 3));
      console.log('📊 Total data points:', concentrationData.length);
      
      try {
        allLayers.push(new layers.ScatterplotLayer({
          id: 'debug-raw-data',
          data: concentrationData,
          getPosition: (d: ConcentrationPoint) => {
            return d.position;
          },
          getFillColor: [255, 0, 0, 255], // Bright red for visibility
          getRadius: 2000, // Large radius in meters
          radiusUnits: 'meters',
          pickable: true,
          onHover: (info: any) => {
            if (info.object) {
              console.log('🎯 Hovered particle:', info.object);
            }
          }
        }));
        console.log('✅ Debug ScatterplotLayer created successfully');
      } catch (error) {
        console.error('❌ Failed to create debug ScatterplotLayer:', error);
      }
    }

    // 4. Sensor markers (top layer - always visible)
    if (renderSettings.showSensors && initialSensorData.length > 0) {
      console.log('📡 Creating sensor markers...');
      try {
        allLayers.push(new layers.ScatterplotLayer({
          id: 'sensors',
          data: initialSensorData,
          pickable: true,
          opacity: 1.0,
          stroked: true,
          filled: true,
          radiusScale: 1,
          radiusMinPixels: 12,
          radiusMaxPixels: 20,
          lineWidthMinPixels: 2,
          getPosition: (d: SensorData) => d.position,
          getRadius: 15,
          getFillColor: (d: SensorData) => 
            d.status === 'active' ? [0, 255, 0, 255] : [255, 0, 0, 255],
          getLineColor: [255, 255, 255, 255]
        }));
        console.log('✅ Sensor markers created successfully');
      } catch (error) {
        console.error('❌ Failed to create sensor markers:', error);
      }
    }

    console.log('Creating deck layers:', allLayers.length);
    console.log('Layers:', allLayers.map(layer => ({ id: layer.id, type: layer.constructor.name })));
    console.log('HysplitSmokeLayer props:', { 
      dataPoints: concentrationData.length, 
      timeWindowMinutes: renderSettings.timeWindowMinutes,
      altitudeFilter: [renderSettings.altitudeMin, renderSettings.altitudeMax],
      concentrationThreshold: renderSettings.concentrationThreshold,
      heatmapRadius: renderSettings.heatmapRadius
    });
    console.log('Plume center:', plumeCenter);
    console.log('Concentration data sample:', concentrationData.slice(0, 3));

    return allLayers;
  }, [
    deckComponents, 
    isLoading,
    concentrationData, 
    initialSensorData, 
    renderSettings, 
    getConcentrationColor, 
    getParticleRadius,
    plumeCenter,
    meteorologicalData,
    isTimelineActive,
    currentForecastHour
  ]);

  // Event handlers
  const handleViewStateChange = useCallback((params: any) => {
    setViewState(params.viewState);
  }, []);

  const resetView = useCallback(() => {
    setViewState({
      longitude: -122.1430,
      latitude: 37.4419,
      zoom: 14, // Increase from 12
      pitch: 30, // Decrease from 60
      bearing: 0,
      maxZoom: 20,
      minZoom: 8,
      maxPitch: 85
    });
  }, []);

  const togglePlay = useCallback(() => {
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  // Live data polling
  useEffect(() => {
    const fetchData = async () => {
      try {
        console.log('🔄 Fetching HYSPLIT data from API...');
        const res = await fetch('/api/plume-predictions');
        
        if (!res.ok) {
          throw new Error(`HTTP ${res.status}: ${res.statusText}`);
        }
        
        const data = await res.json();
        console.log('📡 API Response received:', {
          success: data.success,
          dataLength: data.data?.length || 0,
          source: data.source
        });
        console.log('📊 Sample API data points:', data.data?.slice(0, 3));
        
        if (data.success && data.data && data.data.length > 0) {
          console.log('✅ Found real HYSPLIT data, converting format...');
          // Convert HYSPLIT API format to expected ConcentrationPoint format
          const convertedData = data.data.map((point: any, index: number) => {
            const converted = {
              position: [point.longitude, point.latitude, point.altitude_m],
              concentration: point.conc_pm25_ug_m3,
              uncertainty: 5.0,
              timestamp: new Date(point.prediction_ts),
              source: point.model_version?.includes('Enhanced') ? 'ai_enhanced' : 'hysplit'
            };
            
            if (index < 3) {
              console.log(`🔄 Converting API point ${index}:`, {
                from: point,
                to: converted
              });
            }
            
            return converted;
          });
          
          console.log(`✅ Successfully converted ${convertedData.length} concentration points`);
          console.log('📍 Sample converted data:', convertedData.slice(0, 2));
          
          setConcentrationData(convertedData);
        } else {
          console.log('⚠️ No real data available from API, keeping existing data');
          console.log('📊 Current concentration data length:', concentrationData.length);
        }
        
        setMeteorologicalData(data.meteo || {
          windSpeed: 5.0,
          windDirection: 180,
          temperature: 293.15,
          humidity: 60,
          mixingHeight: 1000
        });
      } catch (error) {
        console.error('❌ Failed to fetch live data:', error);
        console.log('📊 Keeping existing concentration data length:', concentrationData.length);
      }
    };

    fetchData(); // Initial fetch
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  // Calculate dispersion stats
  const dispersionStats = useMemo(() => {
    if (!concentrationData.length) return null;
    const concentrations = concentrationData.map(p => p.concentration);
    const maxConc = Math.max(...concentrations);
    const avgConc = concentrations.reduce((sum, c) => sum + c, 0) / concentrations.length;
    const plumeVolume = concentrationData.length * 1000; // Rough estimate: points * 1km^3
    return { maxConc, avgConc, plumeVolume };
  }, [concentrationData]);

  // Update wind in layer
  useEffect(() => {
    // Assuming layer instance can be accessed; may need ref
  }, [meteorologicalData]);

  // Add comprehensive metrics state after existing states:
  const [metrics, setMetrics] = useState({
    totalConcentration: 0,
    maxConcentration: 0,
    avgConcentration: 0,
    dataPoints: 0,
    plumeVolume: 0,
    windSpeed: 0,
    windDirection: 0,
    lastUpdate: new Date(),
    renderTime: 0
  });

  const [cameraPresets] = useState([
    { name: 'Overview', position: { zoom: 12, pitch: 45, bearing: 0 } },
    { name: 'Side View', position: { zoom: 14, pitch: 20, bearing: 90 } },
    { name: 'Top Down', position: { zoom: 15, pitch: 0, bearing: 0 } },
    { name: 'Close Up', position: { zoom: 16, pitch: 60, bearing: 45 } }
  ]);

  // Add metrics calculation useEffect:
  useEffect(() => {
    if (concentrationData.length > 0) {
      const concentrations = concentrationData.map((p: ConcentrationPoint) => p.concentration);
      const totalConc = concentrations.reduce((sum, c) => sum + c, 0);
      const maxConc = Math.max(...concentrations);
      const avgConc = totalConc / concentrations.length;
      
      // Estimate plume volume (rough calculation)
      const uniqueAltitudes = new Set(concentrationData.map((p: ConcentrationPoint) => p.position[2]));
      const estimatedVolume = concentrationData.length * 1000 * uniqueAltitudes.size; // km³
      
      setMetrics({
        totalConcentration: totalConc,
        maxConcentration: maxConc,
        avgConcentration: avgConc,
        dataPoints: concentrationData.length,
        plumeVolume: estimatedVolume,
        windSpeed: meteorologicalData.windSpeed || 0,
        windDirection: meteorologicalData.windDirection || 0,
        lastUpdate: new Date(),
        renderTime: performance.now() % 1000 // Simple render time estimate
      });
    }
  }, [concentrationData, meteorologicalData]);

  // Add camera preset function:
  const applyCameraPreset = useCallback((preset: any) => {
    setViewState(prev => ({
      ...prev,
      ...preset.position
    }));
  }, []);

  // Show loading state if not ready
  if (isLoading || !deckComponents?.DeckGL || !deckComponents?.layers || !deckComponents?.MapView) {
    return (
      <div className={`relative w-full h-full bg-gray-900 flex items-center justify-center ${className}`}>
        <div className="text-center text-white">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading 3D Visualization...</p>
        </div>
      </div>
    );
  }

  const { DeckGL, MapView } = deckComponents;

  return (
    <div className={`relative w-full h-full bg-gray-900 ${className}`}>
      {/* Main 3D Visualization */}
      <div className="w-full h-full">
        <DeckGL
          initialViewState={viewState}
          controller={true}
          layers={deckLayers}
          onViewStateChange={handleViewStateChange}
          views={new MapView({ repeat: true })}
          getTooltip={({ object }: any) => {
            if (object) {
              if (object.concentration !== undefined) {
                return `PM2.5: ${object.concentration.toFixed(1)} μg/m³\nSource: ${object.source}`;
              } else if (object.pm25 !== undefined) {
                return `Sensor: ${object.id}\nPM2.5: ${object.pm25.toFixed(1)} μg/m³\nStatus: ${object.status}`;
              }
            }
            return null;
          }}
        />
      </div>

      {/* Compact Left Panel - Only Essential Controls */}
      {renderSettings.showControls && (
        <div className="absolute top-4 left-4 z-10 space-y-2 max-w-48">
          {/* Camera Views */}
          <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
            <h3 className="text-xs text-white font-semibold mb-2">📷 View</h3>
            <div className="grid grid-cols-2 gap-1">
              {cameraPresets.map((preset, idx) => (
                <button
                  key={idx}
                  onClick={() => applyCameraPreset(preset)}
                  className="px-1 py-0.5 bg-gray-700 text-white text-xs rounded hover:bg-gray-600 truncate"
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <div className="flex gap-1 mt-2">
              <button
                onClick={togglePlay}
                className="px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700 flex-1"
              >
                {isPlaying ? '⏸️' : '▶️'}
              </button>
              <button
                onClick={resetView}
                className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
              >
                🔄
              </button>
            </div>
          </div>

          {/* Layer Toggles */}
          <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
            <h3 className="text-xs text-white font-semibold mb-2">🗂️ Layers</h3>
            <div className="space-y-1 text-xs">
              {[
                { key: 'showTerrain', label: '🏔️ Terrain', value: renderSettings.showTerrain },
                { key: 'showSmoke', label: '🌪️ Smoke', value: renderSettings.showSmoke },
                { key: 'showSensors', label: '📡 Sensors', value: renderSettings.showSensors },
                { key: 'useEnhancedBlobPlumes', label: '🌊 Enhanced Blobs', value: renderSettings.useEnhancedBlobPlumes },
                { key: 'useContinuousPlumes', label: '🌀 Continuous Plumes', value: renderSettings.useContinuousPlumes && !renderSettings.useEnhancedBlobPlumes },
                { key: 'useRealisticPlumes', label: '💨 Wind Plumes', value: renderSettings.useRealisticPlumes && !renderSettings.useContinuousPlumes && !renderSettings.useEnhancedBlobPlumes },
                { key: 'showDataPoints', label: '🔍 Debug', value: renderSettings.showDataPoints }
              ].map(({ key, label, value }) => (
                <label key={key} className="flex items-center justify-between text-gray-300 cursor-pointer">
                  <span className="truncate">{label}</span>
                  <input
                    type="checkbox"
                    checked={value}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, [key]: e.target.checked }))}
                    className="ml-2 scale-75"
                  />
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Right Panel - Compact Status */}
      <div className="absolute top-4 right-4 z-10 space-y-2 max-w-72">
        {/* HYSPLIT Timeline */}
        <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-white font-semibold">HYSPLIT Timeline</span>
            <label className="flex items-center gap-1 cursor-pointer">
              <input
                type="checkbox"
                checked={isTimelineActive}
                onChange={(e) => setIsTimelineActive(e.target.checked)}
                className="scale-75"
              />
              <span className="text-xs text-gray-300">Enable</span>
            </label>
          </div>
          {isTimelineActive && (
            <HysplitTimeline
              isActive={isTimelineActive}
              onTimeChange={(hour) => {
                setCurrentForecastHour(hour);
                console.log(`Timeline: Hour ${hour}`);
              }}
              className="min-w-64"
            />
          )}
        </div>

        {/* Compact Status */}
        <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
          <h3 className="text-xs text-white font-semibold mb-1">📊 Status</h3>
          <div className="text-xs text-gray-300 space-y-0.5">
            <div className="flex justify-between">
              <span>Points:</span>
              <span className="text-white">{concentrationData.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Wind:</span>
              <span className="text-cyan-400">{(meteorologicalData?.windSpeed?.toFixed(1) ?? 'N/A')} m/s</span>
            </div>
            {dispersionStats && (
              <div className="flex justify-between">
                <span>Max:</span>
                <span className="text-orange-400">{dispersionStats.maxConc.toFixed(1)} μg/m³</span>
              </div>
            )}
          </div>
        </div>

        {/* Smoke Controls - Compact */}
        <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
          <h3 className="text-xs text-white font-semibold mb-1">🌪️ Smoke</h3>
          <div className="space-y-1">
            {renderSettings.useEnhancedBlobPlumes ? (
              // Enhanced blob plume controls
              <>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Blob Length</span>
                    <span>{(renderSettings.plumeLength / 1000).toFixed(1)}km</span>
                  </label>
                  <input
                    type="range"
                    min="5000"
                    max="25000"
                    step="1000"
                    value={renderSettings.plumeLength}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, plumeLength: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Blob Spread</span>
                    <span>{(renderSettings.crossWindSpread / 1000).toFixed(1)}km</span>
                  </label>
                  <input
                    type="range"
                    min="2000"
                    max="15000"
                    step="500"
                    value={renderSettings.crossWindSpread}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, crossWindSpread: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Blob Resolution</span>
                    <span>{renderSettings.gridResolution}m</span>
                  </label>
                  <input
                    type="range"
                    min="20"
                    max="200"
                    step="10"
                    value={renderSettings.gridResolution}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, gridResolution: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Blob Radius</span>
                    <span>{(renderSettings.heatmapRadius / 1000).toFixed(1)}km</span>
                  </label>
                  <input
                    type="range"
                    min="1000"
                    max="8000"
                    step="500"
                    value={renderSettings.heatmapRadius}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, heatmapRadius: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Blob Intensity</span>
                    <span>{renderSettings.heatmapIntensity.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min="1.0"
                    max="8.0"
                    step="0.5"
                    value={renderSettings.heatmapIntensity}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, heatmapIntensity: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </>
            ) : renderSettings.useContinuousPlumes ? (
              // Continuous heatmap plume controls
              <>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Plume Length</span>
                    <span>{(renderSettings.plumeLength / 1000).toFixed(1)}km</span>
                  </label>
                  <input
                    type="range"
                    min="3000"
                    max="20000"
                    step="500"
                    value={renderSettings.plumeLength}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, plumeLength: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Cross-Wind Spread</span>
                    <span>{(renderSettings.crossWindSpread / 1000).toFixed(1)}km</span>
                  </label>
                  <input
                    type="range"
                    min="1000"
                    max="10000"
                    step="250"
                    value={renderSettings.crossWindSpread}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, crossWindSpread: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Grid Resolution</span>
                    <span>{renderSettings.gridResolution}m</span>
                  </label>
                  <input
                    type="range"
                    min="50"
                    max="300"
                    step="25"
                    value={renderSettings.gridResolution}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, gridResolution: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Heatmap Radius</span>
                    <span>{(renderSettings.heatmapRadius / 1000).toFixed(1)}km</span>
                  </label>
                  <input
                    type="range"
                    min="500"
                    max="5000"
                    step="250"
                    value={renderSettings.heatmapRadius}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, heatmapRadius: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Intensity</span>
                    <span>{renderSettings.heatmapIntensity.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min="1.0"
                    max="5.0"
                    step="0.2"
                    value={renderSettings.heatmapIntensity}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, heatmapIntensity: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </>
            ) : renderSettings.useRealisticPlumes ? (
              // Wind-aware plume controls
              <>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Plume Length</span>
                    <span>{(renderSettings.plumeLength / 1000).toFixed(1)}km</span>
                  </label>
                  <input
                    type="range"
                    min="2000"
                    max="15000"
                    step="500"
                    value={renderSettings.plumeLength}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, plumeLength: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Cross-Wind Spread</span>
                    <span>{(renderSettings.crossWindSpread / 1000).toFixed(1)}km</span>
                  </label>
                  <input
                    type="range"
                    min="1000"
                    max="8000"
                    step="250"
                    value={renderSettings.crossWindSpread}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, crossWindSpread: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </>
            ) : (
              // Legacy heatmap controls
              <>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Radius</span>
                    <span>{(renderSettings.heatmapRadius / 1000).toFixed(1)}km</span>
                  </label>
                  <input
                    type="range"
                    min="1000"
                    max="10000"
                    step="500"
                    value={renderSettings.heatmapRadius}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, heatmapRadius: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-300 flex justify-between">
                    <span>Intensity</span>
                    <span>{renderSettings.heatmapIntensity.toFixed(1)}</span>
                  </label>
                  <input
                    type="range"
                    min="0.5"
                    max="3.0"
                    step="0.1"
                    value={renderSettings.heatmapIntensity}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, heatmapIntensity: parseFloat(e.target.value) }))}
                    className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
              </>
            )}
            <div>
              <label className="text-xs text-gray-300 flex justify-between">
                <span>Threshold</span>
                <span>{renderSettings.concentrationThreshold.toFixed(1)}μg/m³</span>
              </label>
              <input
                type="range"
                min="0.5"
                max="20.0"
                step="0.5"
                value={renderSettings.concentrationThreshold}
                onChange={(e) => setRenderSettings(prev => ({ ...prev, concentrationThreshold: parseFloat(e.target.value) }))}
                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            {!isTimelineActive && (
              <div>
                <label className="text-xs text-gray-300 flex justify-between">
                  <span>Time Window</span>
                  <span>{Math.round(renderSettings.timeWindowMinutes / 60)}h</span>
                </label>
                <input
                  type="range"
                  min="60"
                  max="720"
                  step="60"
                  value={renderSettings.timeWindowMinutes}
                  onChange={(e) => setRenderSettings(prev => ({ ...prev, timeWindowMinutes: parseFloat(e.target.value) }))}
                  className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            )}
          </div>
        </div>

        {/* Performance Controls */}
        <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
          <h3 className="text-xs text-white font-semibold mb-1">⚡ Performance</h3>
          <div className="space-y-1">
            <div>
              <label className="text-xs text-gray-300 flex justify-between">
                <span>Mode</span>
                <span className="text-cyan-400">{renderSettings.performanceMode}</span>
              </label>
              <select
                value={renderSettings.performanceMode}
                onChange={(e) => setRenderSettings(prev => ({ ...prev, performanceMode: e.target.value as any }))}
                className="w-full text-xs bg-gray-700 text-white border border-gray-600 rounded px-1 py-0.5"
              >
                <option value="fast">Fast (Low detail)</option>
                <option value="balanced">Balanced</option>
                <option value="quality">Quality (High detail)</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-300 flex justify-between">
                <span>Max Points</span>
                <span>{renderSettings.maxDataPoints}</span>
              </label>
              <input
                type="range"
                min="100"
                max="3000"
                step="100"
                value={renderSettings.maxDataPoints}
                onChange={(e) => setRenderSettings(prev => ({ ...prev, maxDataPoints: parseFloat(e.target.value) }))}
                className="w-full h-1 bg-gray-600 rounded-lg appearance-none cursor-pointer"
              />
            </div>
            <div className="text-xs">
              <label className="flex items-center justify-between text-gray-300 cursor-pointer">
                <span>Enable LOD</span>
                <input
                  type="checkbox"
                  checked={renderSettings.enableLOD}
                  onChange={(e) => setRenderSettings(prev => ({ ...prev, enableLOD: e.target.checked }))}
                  className="ml-2 scale-75"
                />
              </label>
            </div>
          </div>
        </div>

        {/* EPA AQI Legend - Compact */}
        <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
          <h3 className="text-xs text-white font-semibold mb-1">AQI Scale</h3>
          <div className="space-y-0.5">
            {EPA_AQI_LEVELS.slice(0, 4).map((level, idx) => (
              <div key={idx} className="flex items-center gap-1 text-xs">
                <div 
                  className="w-2 h-2 rounded-full"
                  style={{ 
                    backgroundColor: `rgba(${level.color[0]}, ${level.color[1]}, ${level.color[2]}, 0.8)` 
                  }}
                />
                <span className="text-gray-300 text-xs truncate">{level.level}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toggle Controls */}
      <button
        onClick={() => setRenderSettings(prev => ({ ...prev, showControls: !prev.showControls }))}
        className="absolute top-4 right-4 z-10 bg-black/90 border border-gray-600 text-white p-2 rounded hover:bg-black"
      >
        {renderSettings.showControls ? '👁️' : '👁️‍🗨️'}
      </button>
    </div>
  );
}

// ============================================================================
// DYNAMIC WRAPPER FOR HYDRATION SAFETY
// ============================================================================

// Export the main component wrapped with dynamic loading to prevent hydration issues
export const SmokePlume3DViewer = dynamic(
  () => Promise.resolve(SmokePlume3DViewerInternal),
  {
    ssr: false,
    loading: () => (
      <div className="relative w-full h-full bg-gray-900 flex items-center justify-center">
        <div className="text-center text-white">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading 3D Visualization...</p>
        </div>
      </div>
    )
  }
);