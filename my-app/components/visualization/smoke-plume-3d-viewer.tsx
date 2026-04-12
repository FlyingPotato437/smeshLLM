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
  pm25?: number;
  pm10?: number;
  pm1?: number;
  uncertainty: number;
  timestamp: Date;
  source: 'hysplit' | 'ai_enhanced';
  velocity?: [number, number, number];
  temperature?: number;
  layerType?: 'smoke';
}

interface SensorData {
  id: string;
  sensorName?: string;
  position: [number, number, number];
  pm1?: number;
  pm25: number;
  pm10?: number;
  pm100?: number;
  status: 'active' | 'inactive';
  lastUpdate: Date;
  bme?: {
    temperatureC?: number;
    humidityPct?: number;
    pressureHpa?: number;
  };
  battery?: {
    percent?: number;
    voltage?: number;
  };
  electronics?: {
    rxSnr?: number;
    rxRssi?: number;
    rxTime?: number;
    hopStart?: number;
    hopLimit?: number;
  };
  layerType?: 'sensor';
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
  pressure?: number;
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
    { position: [-122.1430, 37.4419, 100], concentration: 50, pm25: 50, pm10: 65, pm1: 35, uncertainty: 5, timestamp: new Date(), source: 'hysplit', layerType: 'smoke' },
    { position: [-122.1400, 37.4400, 200], concentration: 80, pm25: 80, pm10: 104, pm1: 56, uncertainty: 8, timestamp: new Date(), source: 'ai_enhanced', layerType: 'smoke' },
    // Add more points for a visible plume
    { position: [-122.1450, 37.4430, 300], concentration: 120, pm25: 120, pm10: 156, pm1: 84, uncertainty: 10, timestamp: new Date(), source: 'hysplit', layerType: 'smoke' },
    { position: [-122.1420, 37.4420, 400], concentration: 150, pm25: 150, pm10: 195, pm1: 105, uncertainty: 12, timestamp: new Date(), source: 'ai_enhanced', layerType: 'smoke' },
  ]);
  const [meteorologicalData, setMeteorologicalData] = useState<MeteorologicalData>(initialMeteorologicalData || {
    windSpeed: 5.0,
    windDirection: 180,
    temperature: 293.15, // 20°C in Kelvin
    humidity: 60,
    pressure: 1012,
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

  // Render settings
  const [renderSettings, setRenderSettings] = useState({
    showTerrain: false,
    showSmoke: true,
    showSensors: true,
    showMeteorology: true,
    showControls: true,
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
      } catch (error) {
        console.error('Failed to create TerrainLayer:', error);
      }
    }

    // 2. Smoke layer - PM2.5, PM10, PM1
    if (renderSettings.showSmoke) {
      const currentTimeForViz = isTimelineActive
        ? new Date(Date.now() + (currentForecastHour * 60 * 60 * 1000))
        : new Date();

      const effectiveTimeWindow = isTimelineActive
        ? 120
        : renderSettings.timeWindowMinutes;

      if (renderSettings.useEnhancedBlobPlumes) {
        try {
          let filteredData = concentrationData.filter(point => {
            const timeDiff = Math.abs(currentTimeForViz.getTime() - point.timestamp.getTime()) / (1000 * 60);
            return timeDiff <= effectiveTimeWindow && point.concentration >= renderSettings.concentrationThreshold;
          });

          if (filteredData.length > renderSettings.maxDataPoints) {
            filteredData = filteredData
              .sort((a, b) => b.concentration - a.concentration)
              .slice(0, renderSettings.maxDataPoints);
          }
          
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
        } catch (error) {
          console.error('Failed to create EnhancedSmokeBlobLayer:', error);
        }
      } else if (renderSettings.useContinuousPlumes) {
        try {
          let filteredData = concentrationData.filter(point => {
            const timeDiff = Math.abs(currentTimeForViz.getTime() - point.timestamp.getTime()) / (1000 * 60);
            return timeDiff <= effectiveTimeWindow && point.concentration >= renderSettings.concentrationThreshold;
          });

          if (filteredData.length > renderSettings.maxDataPoints) {
            filteredData = filteredData
              .sort((a, b) => b.concentration - a.concentration)
              .slice(0, renderSettings.maxDataPoints);
          }
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
          // ContinuousPlumeLayer created
        } catch (error) {
          console.error('Failed to create ContinuousPlumeLayer:', error);
        }
      } else if (renderSettings.useRealisticPlumes) {
        try {
          let filteredData = concentrationData.filter(point => {
            const timeDiff = Math.abs(currentTimeForViz.getTime() - point.timestamp.getTime()) / (1000 * 60);
            return timeDiff <= effectiveTimeWindow && point.concentration >= renderSettings.concentrationThreshold;
          });

          if (filteredData.length > renderSettings.maxDataPoints) {
            filteredData = filteredData
              .sort((a, b) => b.concentration - a.concentration)
              .slice(0, renderSettings.maxDataPoints);
          }

          let plumeLength = renderSettings.plumeLength;
          let crossWindSpread = renderSettings.crossWindSpread;

          if (renderSettings.performanceMode === 'fast') {
            plumeLength *= 0.7;
            crossWindSpread *= 0.7;
          } else if (renderSettings.performanceMode === 'quality') {
            plumeLength *= 1.2;
            crossWindSpread *= 1.2;
          }

          allLayers.push(new WindAwarePlumeLayer({
            id: 'wind-aware-plume-layer',
            data: filteredData as any,
            meteorologicalData: {
              windSpeed: meteorologicalData.windSpeed,
              windDirection: meteorologicalData.windDirection,
              mixingHeight: meteorologicalData.mixingHeight,
              atmosphericStability: 'D' as const
            },
            plumeLength,
            crossWindSpread,
            opacity: 0.8,
            PolygonLayer: layers.PolygonLayer,
            ScatterplotLayer: layers.ScatterplotLayer
          }));
        } catch (error) {
          console.error('Failed to create WindAwarePlumeLayer:', error);
        }
      } else {
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
            showDataPoints: false,
            opacity: 0.9,
            HeatmapLayer: layers.HeatmapLayer,
            ScatterplotLayer: layers.ScatterplotLayer
          }));
        } catch (error) {
          console.error('Failed to create HysplitSmokeLayer:', error);
        }
      }
    }

    // 3. Meteorological layer - Temperature, Humidity, Pressure
    if (renderSettings.showMeteorology) {
      allLayers.push(new layers.ScatterplotLayer({
        id: 'meteorological-layer',
        data: [{
          layerType: 'meteorological',
          position: [plumeCenter[0], plumeCenter[1], 50],
          temperatureC: meteorologicalData.temperature - 273.15,
          humidityPct: meteorologicalData.humidity,
          pressureHpa: meteorologicalData.pressure ?? 1012,
          windSpeed: meteorologicalData.windSpeed,
          windDirection: meteorologicalData.windDirection,
        }],
        pickable: true,
        radiusMinPixels: 10,
        radiusMaxPixels: 18,
        getPosition: (d: any) => d.position,
        getRadius: 16,
        getFillColor: [56, 189, 248, 240],
        getLineColor: [255, 255, 255, 255],
        stroked: true,
        lineWidthMinPixels: 2,
      }));
    }

    // 4. Sensor markers - Name, Status, PM, Electronics
    if (renderSettings.showSensors && initialSensorData.length > 0) {
      try {
        allLayers.push(new layers.ScatterplotLayer({
          id: 'sensors',
          data: initialSensorData.map((sensor) => ({ ...sensor, layerType: 'sensor' as const })),
          pickable: true,
          opacity: 1.0,
          stroked: true,
          filled: true,
          radiusUnits: 'pixels',
          radiusMinPixels: 10,
          radiusMaxPixels: 26,
          lineWidthMinPixels: 2,
          billboard: true,
          parameters: { depthTest: false },
          getPosition: (d: SensorData) => d.position,
          getRadius: 9,
          getFillColor: (d: SensorData) =>
            d.status === 'active' ? [0, 255, 0, 255] : [255, 0, 0, 255],
          getLineColor: [255, 255, 255, 255]
        }));
      } catch (error) {
        console.error('Failed to create sensor markers:', error);
      }
    }

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
        const res = await fetch('/api/plume-predictions');
        if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);

        const data = await res.json();

        if (data.success && data.data && data.data.length > 0) {
          const convertedData = data.data.map((point: any) => ({
            position: [point.longitude, point.latitude, point.altitude_m],
            concentration: point.conc_pm25_ug_m3,
            uncertainty: 5.0,
            timestamp: new Date(point.prediction_ts),
            source: point.model_version?.includes('Enhanced') ? 'ai_enhanced' : 'hysplit',
            pm25: point.conc_pm25_ug_m3,
            pm10: point.conc_pm10_ug_m3,
            pm1: point.conc_pm1_ug_m3 ?? (point.conc_pm25_ug_m3 || 0) * 0.7,
            layerType: 'smoke' as const,
          }));
          setConcentrationData(convertedData);
        }

        setMeteorologicalData(data.meteo || {
          windSpeed: 5.0,
          windDirection: 180,
          temperature: 293.15,
          humidity: 60,
          pressure: 1012,
          mixingHeight: 1000
        });
      } catch (error) {
        console.error('Failed to fetch live data:', error);
      }
    };

    fetchData();
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
            if (!object) return null;

            const tooltipStyle = {
              background: 'rgba(15,15,20,0.95)',
              color: '#e5e7eb',
              border: '1px solid rgba(100,100,120,0.4)',
              borderRadius: '8px',
              padding: '0',
              fontSize: '12px',
              fontFamily: 'system-ui, -apple-system, sans-serif',
              maxHeight: '280px',
              overflowY: 'auto',
              maxWidth: '260px',
              lineHeight: '1.4',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
            };

            if (object.layerType === 'sensor' || object.sensorName || object.electronics) {
              const row = (label: string, value: string) =>
                `<div style="display:flex;justify-content:space-between;gap:8px"><span style="color:#9ca3af">${label}</span><span style="font-weight:500">${value}</span></div>`;

              const section = (title: string, rows: string) =>
                `<div style="padding:6px 10px;border-bottom:1px solid rgba(100,100,120,0.25)"><div style="font-weight:600;color:#d1d5db;margin-bottom:2px;font-size:11px;text-transform:uppercase;letter-spacing:0.5px">${title}</div>${rows}</div>`;

              const pm1Val = object.pm10 ?? object.pm1 ?? 0;
              const pm25Val = object.pm25 ?? 0;
              const pm100Val = object.pm100 ?? 0;

              const html = `<div>
                <div style="padding:8px 10px;border-bottom:1px solid rgba(100,100,120,0.4);font-weight:700;font-size:13px;color:#fff">${object.sensorName || object.id}<span style="float:right;font-size:11px;font-weight:400;color:${object.status === 'active' ? '#34d399' : '#f87171'}">${object.status || 'unknown'}</span></div>
                ${section('Particulate Matter', [
                  row('PM 1.0', `${pm1Val} ug/m3`),
                  row('PM 2.5', `${pm25Val} ug/m3`),
                  row('PM 10', `${pm100Val} ug/m3`),
                ].join(''))}
                ${section('Radio', [
                  row('RSSI', `${(object.electronics?.rxRssi ?? 0).toFixed(0)} dBm`),
                  row('SNR', `${(object.electronics?.rxSnr ?? 0).toFixed(1)} dB`),
                  row('Hop', `${object.electronics?.hopStart ?? 0}/${object.electronics?.hopLimit ?? 0}`),
                ].join(''))}
              </div>`;
              return { html, style: tooltipStyle };
            }

            if (object.layerType === 'smoke' || object.pm25 !== undefined || object.concentration !== undefined) {
              const pm25 = object.pm25 ?? object.concentration ?? 0;
              const pm10 = object.pm10 ?? pm25 * 1.3;
              const pm1 = object.pm1 ?? pm25 * 0.7;
              const html = `<div style="padding:8px 10px">
                <div style="font-weight:700;margin-bottom:4px;color:#fff">Smoke</div>
                <div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">PM 2.5</span><span>${pm25.toFixed(1)} ug/m3</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">PM 10</span><span>${pm10.toFixed(1)} ug/m3</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">PM 1</span><span>${pm1.toFixed(1)} ug/m3</span></div>
              </div>`;
              return { html, style: tooltipStyle };
            }

            if (object.layerType === 'meteorological') {
              const html = `<div style="padding:8px 10px">
                <div style="font-weight:700;margin-bottom:4px;color:#fff">Meteorological</div>
                <div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">Temp</span><span>${(object.temperatureC ?? 0).toFixed(1)} C</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">Humidity</span><span>${(object.humidityPct ?? 0).toFixed(1)}%</span></div>
                <div style="display:flex;justify-content:space-between"><span style="color:#9ca3af">Pressure</span><span>${(object.pressureHpa ?? 0).toFixed(0)} hPa</span></div>
              </div>`;
              return { html, style: tooltipStyle };
            }

            return null;
          }}
        />
      </div>

      {/* Left Panel - Layer Controls */}
      {renderSettings.showControls && (
        <div className="absolute top-4 left-4 z-10 space-y-2 max-w-52">
          {/* Camera Views */}
          <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
            <h3 className="text-xs text-white font-semibold mb-2">View</h3>
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
                {isPlaying ? 'Pause' : 'Play'}
              </button>
              <button
                onClick={resetView}
                className="px-2 py-1 bg-gray-600 text-white text-xs rounded hover:bg-gray-700"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Data Layers */}
          <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
            <h3 className="text-xs text-white font-semibold mb-2">Layers</h3>
            <div className="space-y-1.5 text-xs">
              {/* Sensor Layer */}
              <div>
                <label className="flex items-center justify-between text-gray-300 cursor-pointer font-medium">
                  <span>Sensors</span>
                  <input
                    type="checkbox"
                    checked={renderSettings.showSensors}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, showSensors: e.target.checked }))}
                    className="ml-2 scale-75"
                  />
                </label>
                <p className="text-gray-500 text-[10px] ml-1">Name, Status, PM, Electronics</p>
              </div>

              {/* Smoke Layer */}
              <div>
                <label className="flex items-center justify-between text-gray-300 cursor-pointer font-medium">
                  <span>Smoke</span>
                  <input
                    type="checkbox"
                    checked={renderSettings.showSmoke}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, showSmoke: e.target.checked }))}
                    className="ml-2 scale-75"
                  />
                </label>
                <p className="text-gray-500 text-[10px] ml-1">PM 2.5, PM 10, PM 1</p>
                {renderSettings.showSmoke && (
                  <div className="ml-2 mt-1 space-y-0.5">
                    {[
                      { key: 'useEnhancedBlobPlumes', label: 'Enhanced Blobs', value: renderSettings.useEnhancedBlobPlumes },
                      { key: 'useContinuousPlumes', label: 'Continuous', value: renderSettings.useContinuousPlumes && !renderSettings.useEnhancedBlobPlumes },
                      { key: 'useRealisticPlumes', label: 'Wind-Aware', value: renderSettings.useRealisticPlumes && !renderSettings.useContinuousPlumes && !renderSettings.useEnhancedBlobPlumes },
                    ].map(({ key, label, value }) => (
                      <label key={key} className="flex items-center justify-between text-gray-400 cursor-pointer">
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
                )}
              </div>

              {/* Meteorological Layer */}
              <div>
                <label className="flex items-center justify-between text-gray-300 cursor-pointer font-medium">
                  <span>Meteorological</span>
                  <input
                    type="checkbox"
                    checked={renderSettings.showMeteorology}
                    onChange={(e) => setRenderSettings(prev => ({ ...prev, showMeteorology: e.target.checked }))}
                    className="ml-2 scale-75"
                  />
                </label>
                <p className="text-gray-500 text-[10px] ml-1">Temp, Humidity, Pressure</p>
              </div>

              {/* Terrain Layer */}
              <label className="flex items-center justify-between text-gray-400 cursor-pointer">
                <span>Terrain</span>
                <input
                  type="checkbox"
                  checked={renderSettings.showTerrain}
                  onChange={(e) => setRenderSettings(prev => ({ ...prev, showTerrain: e.target.checked }))}
                  className="ml-2 scale-75"
                />
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Right Panel - Status & Timeline */}
      <div className="absolute top-12 right-4 z-10 space-y-2 max-w-72">
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
              onTimeChange={(hour) => setCurrentForecastHour(hour)}
              className="min-w-64"
            />
          )}
        </div>

        {/* Status */}
        <div className="bg-black/90 border border-gray-600 backdrop-blur-sm p-2 rounded">
          <h3 className="text-xs text-white font-semibold mb-1">Status</h3>
          <div className="text-xs text-gray-300 space-y-0.5">
            <div className="flex justify-between">
              <span>Data Points:</span>
              <span className="text-white">{concentrationData.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Sensors:</span>
              <span className="text-green-400">{initialSensorData.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Wind:</span>
              <span className="text-cyan-400">{(meteorologicalData?.windSpeed?.toFixed(1) ?? 'N/A')} m/s</span>
            </div>
            {dispersionStats && (
              <div className="flex justify-between">
                <span>Max PM2.5:</span>
                <span className="text-orange-400">{dispersionStats.maxConc.toFixed(1)} μg/m³</span>
              </div>
            )}
          </div>
        </div>

        {/* AQI Legend */}
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

      {/* Toggle Controls Button - top right, above the right panel */}
      <button
        onClick={() => setRenderSettings(prev => ({ ...prev, showControls: !prev.showControls }))}
        className="absolute top-4 right-4 z-20 bg-black/90 border border-gray-600 text-white px-2 py-1 rounded text-xs hover:bg-black"
      >
        {renderSettings.showControls ? 'Hide Controls' : 'Show Controls'}
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
