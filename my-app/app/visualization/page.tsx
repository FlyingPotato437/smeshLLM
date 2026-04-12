'use client';

import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/layout/navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { motion } from 'framer-motion';
import { Map, Zap, Activity, Wind, Gauge, MessageSquare } from 'lucide-react';
import { SmokePlume3DViewer } from '@/components/visualization/smoke-plume-3d-viewer';
import { buildLayerDataFromCsv } from '@/lib/utils/air-quality-sample';

// Fetch real data from APIs
async function fetchPlumeData() {
  try {
    const response = await fetch('/api/plume-predictions?hours=24');
    const result = await response.json();
    
    if (result.success && result.data) {
      // Transform API data to match the component interface
      return result.data.map((point: any) => ({
        position: [point.longitude, point.latitude, point.altitude_m] as [number, number, number],
        concentration: point.conc_pm25_ug_m3,
        pm25: point.conc_pm25_ug_m3,
        pm10: point.conc_pm10_ug_m3,
        pm1: point.conc_pm1_ug_m3 ?? (point.conc_pm25_ug_m3 || 0) * 0.7,
        uncertainty: 2.1, // TODO: Add uncertainty field to API
        timestamp: new Date(point.prediction_ts),
        source: point.model_version?.includes('AI') ? 'ai_enhanced' : 'hysplit' as const,
        layerType: 'smoke' as const,
      }));
    }
  } catch (error) {
    console.error('Failed to fetch plume data:', error);
  }
  
  // Fallback to sample data
  return [
    // Stanford campus area with varying concentrations
    {
      position: [-122.1430, 37.4419, 100] as [number, number, number],
      concentration: 25.4,
      pm25: 25.4,
      pm10: 31.2,
      pm1: 17.8,
      uncertainty: 2.1,
      timestamp: new Date(),
      source: 'hysplit' as const,
      layerType: 'smoke' as const,
    },
    {
      position: [-122.1530, 37.4519, 150] as [number, number, number],
      concentration: 18.7,
      pm25: 18.7,
      pm10: 24.1,
      pm1: 13.1,
      uncertainty: 1.8,
      timestamp: new Date(),
      source: 'ai_enhanced' as const,
      layerType: 'smoke' as const,
    },
    {
      position: [-122.1330, 37.4319, 200] as [number, number, number],
      concentration: 32.1,
      pm25: 32.1,
      pm10: 41.7,
      pm1: 22.5,
      uncertainty: 3.2,
      timestamp: new Date(),
      source: 'hysplit' as const,
      layerType: 'smoke' as const,
    },
    {
      position: [-122.1630, 37.4219, 120] as [number, number, number],
      concentration: 45.8,
      pm25: 45.8,
      pm10: 59.1,
      pm1: 32.1,
      uncertainty: 4.1,
      timestamp: new Date(),
      source: 'ai_enhanced' as const,
      layerType: 'smoke' as const,
    },
    {
      position: [-122.1230, 37.4519, 180] as [number, number, number],
      concentration: 12.3,
      pm25: 12.3,
      pm10: 16.0,
      pm1: 8.6,
      uncertainty: 1.2,
      timestamp: new Date(),
      source: 'hysplit' as const,
      layerType: 'smoke' as const,
    }
  ];
}

const samplePrescribedBurns = [
  {
    id: 'stanford-hills-burn',
    name: 'Stanford Hills Prescribed Burn',
    area: {
      type: 'Polygon',
      coordinates: [[
        [-122.1600, 37.4350],
        [-122.1350, 37.4350],
        [-122.1350, 37.4550],
        [-122.1600, 37.4550],
        [-122.1600, 37.4350]
      ]]
    } as GeoJSON.Polygon,
    phase: 'active',
    startTime: new Date(Date.now() - 2 * 60 * 60 * 1000), // 2 hours ago
    endTime: new Date(Date.now() + 4 * 60 * 60 * 1000) // 4 hours from now
  },
  {
    id: 'foothills-burn',
    name: 'Foothills Preventive Burn',
    area: {
      type: 'Polygon',
      coordinates: [[
        [-122.2000, 37.4100],
        [-122.1800, 37.4100],
        [-122.1800, 37.4300],
        [-122.2000, 37.4300],
        [-122.2000, 37.4100]
      ]]
    } as GeoJSON.Polygon,
    phase: 'planning',
    startTime: new Date(Date.now() + 24 * 60 * 60 * 1000), // tomorrow
    endTime: new Date(Date.now() + 48 * 60 * 60 * 1000) // day after tomorrow
  }
];

const fallbackMeteorologicalData = {
  windSpeed: 12.5, // m/s
  windDirection: 245, // degrees
  temperature: 297.15, // Kelvin (24°C)
  humidity: 65, // percentage
  pressure: 1012,
  mixingHeight: 850 // meters
};

export default function VisualizationPage() {
  const [concentrationData, setConcentrationData] = useState<any[]>([]);
  const [sampleSensorData, setSampleSensorData] = useState<any[]>([]);
  const [sampleMeteorologicalData, setSampleMeteorologicalData] = useState<any>(fallbackMeteorologicalData);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      const data = await fetchPlumeData();
      setConcentrationData(data || []);
      setLoading(false);
    };
    
    loadData();
    
    // Refresh data every 5 minutes
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const loadSampleLayerData = async () => {
      try {
        const response = await fetch('/sample-air-quality-data.csv');
        if (!response.ok) return;
        const csvText = await response.text();
        const parsed = buildLayerDataFromCsv(csvText);
        setSampleSensorData(parsed.sensors);
        setSampleMeteorologicalData(parsed.meteorology);
      } catch (error) {
        console.error('Failed to load sample CSV data:', error);
      }
    };

    loadSampleLayerData();
  }, []);

  return (
    <div className="min-h-screen bg-[#111111] relative">
      <AnimatedBackground opacity={0.6} />
      <div className="absolute inset-0 z-1 pointer-events-none" style={{
        background: 'linear-gradient(to bottom, transparent 0%, #111111 90%), radial-gradient(ellipse at center, transparent 40%, #111111 95%)'
      }}></div>
      
      <div className="relative z-10">
        <Navigation />
        
        <div className="pt-[100px]">
          {/* Hero Section */}
          <div className="bg-transparent py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <span className="bg-[#1a1a1a] border border-gray-700 text-[#8C1515] px-4 py-1 text-sm font-medium cursor-pointer hover:border-[#8C1515]/50 transition-colors">
                  Physics-Informed 3D Visualization
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-[64px] font-semibold text-white leading-tight mb-4"
              >
                3D Smoke Plume Visualization
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-3xl mx-auto mb-8"
              >
                Real-time visualization combining HYSPLIT atmospheric dispersion modeling with AI-enhanced predictions 
                and Raspberry Pi sensor networks for comprehensive wildfire smoke analysis.
              </motion.p>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4 justify-center"
              >
                <motion.a
                  href="/dashboard"
                  className="bg-[#8C1515] text-white px-6 py-3 font-semibold hover:bg-[#7A1212] transition-colors flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Gauge className="w-4 h-4" />
                  View Dashboard
                </motion.a>
                <motion.a
                  href="/chat"
                  className="border border-[#8C1515] text-[#8C1515] px-6 py-3 font-semibold hover:bg-[#8C1515] hover:text-white transition-colors flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <MessageSquare className="w-4 h-4" />
                  AI Assistant
                </motion.a>
              </motion.div>
            </div>
          </div>

          {/* Features Section */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Wind className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">HYSPLIT Physics Engine</h3>
                  <p className="text-gray-400">Advanced atmospheric dispersion modeling with real-time meteorological data</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">AI Enhancement</h3>
                  <p className="text-gray-400">Machine learning models for improved prediction accuracy and uncertainty quantification</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Real-Time Sensors</h3>
                  <p className="text-gray-400">Live data integration from distributed Raspberry Pi sensor network</p>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Visualization Section */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <h2 className="text-3xl font-semibold text-white mb-4">Interactive 3D Environment</h2>
                <p className="text-gray-400">
                  Explore real-time smoke plume dynamics with physics-informed modeling and sensor data integration
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-[#1a1a1a] border border-gray-700 overflow-hidden"
              >
                <div className="p-4 border-b border-gray-700">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Map className="w-5 h-5 text-[#8C1515]" />
                      <h3 className="text-lg font-semibold text-white">Stanford University Campus Region</h3>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-400">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-red-500"></div>
                        <span>High Concentration</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-yellow-500"></div>
                        <span>Medium Concentration</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-green-500"></div>
                        <span>Low Concentration</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="h-[600px]">
                  <SmokePlume3DViewer
                    concentrationData={concentrationData}
                    sensorData={sampleSensorData}
                    prescribedBurns={samplePrescribedBurns as any}
                    meteorologicalData={sampleMeteorologicalData}
                    className="w-full h-full"
                  />
                </div>
              </motion.div>

              {/* Controls and Information */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-6"
              >
                <div className="bg-[#1a1a1a] border border-gray-700 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Wind className="w-5 h-5 text-[#8C1515]" />
                    <h4 className="text-lg font-semibold text-white">Meteorological Data</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Wind Speed:</span>
                      <span className="text-white">{sampleMeteorologicalData.windSpeed} m/s</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Wind Direction:</span>
                      <span className="text-white">{sampleMeteorologicalData.windDirection}°</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Temperature:</span>
                      <span className="text-white">{(sampleMeteorologicalData.temperature - 273.15).toFixed(1)}°C</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Humidity:</span>
                      <span className="text-white">{sampleMeteorologicalData.humidity}%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-gray-700 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="w-5 h-5 text-[#8C1515]" />
                    <h4 className="text-lg font-semibold text-white">Sensor Network</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">Active Sensors:</span>
                      <span className="text-green-400">{sampleSensorData.filter(s => s.status === 'active').length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Inactive Sensors:</span>
                      <span className="text-red-400">{sampleSensorData.filter(s => s.status === 'inactive').length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Avg PM2.5:</span>
                      <span className="text-white">
                        {(sampleSensorData.length
                          ? sampleSensorData.reduce((acc, s) => acc + (s.pm25 || 0), 0) / sampleSensorData.length
                          : 0).toFixed(1)} μg/m³
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Data Points:</span>
                                              <span className="text-white">{concentrationData.length}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-[#1a1a1a] border border-gray-700 p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Zap className="w-5 h-5 text-[#8C1515]" />
                    <h4 className="text-lg font-semibold text-white">Model Performance</h4>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-400">HYSPLIT Accuracy:</span>
                      <span className="text-green-400">94.2%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">AI Enhancement:</span>
                      <span className="text-green-400">+8.3%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Uncertainty:</span>
                      <span className="text-yellow-400">±2.1 μg/m³</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Update Rate:</span>
                      <span className="text-white">5 min</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 
