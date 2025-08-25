'use client';

import React, { useState } from 'react';
import { Navigation } from '@/components/layout/navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { SmokePlume3DViewer } from '@/components/visualization/smoke-plume-3d-viewer';
import { SmeshChat } from '@/components/ui/smesh-chat';
import EnhancedAirQualityDashboard from '@/components/ui/enhanced-air-quality-dashboard';
import { CSVUpload } from '@/components/ui/csv-upload';
import { MessageSquare, Map, Database, Activity, TrendingUp, BarChart3, Gauge, Zap, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

interface PlumePoint {
  position: [number, number, number];
  concentration: number;
  uncertainty: number;
  timestamp: Date;
  source: 'hysplit' | 'ai_enhanced';
}

// Remove default hard-coded sensors – the 3D viewer will remain empty until data is uploaded
const sampleSensorData: any[] = [];

const samplePrescribedBurns = [
  {
    id: 'burn-1',
    name: 'Stanford Hills Prescribed Burn',
    area: {
      type: 'Polygon',
      coordinates: [[
        [-122.1500, 37.4400],
        [-122.1400, 37.4400],
        [-122.1400, 37.4500],
        [-122.1500, 37.4500],
        [-122.1500, 37.4400]
      ]]
    } as GeoJSON.Polygon,
    phase: 'planning',
    startTime: new Date(),
    endTime: new Date(Date.now() + 24 * 60 * 60 * 1000)
  }
];

const sampleMeteorologicalData = {
  windSpeed: 12.5,
  windDirection: 245,
  temperature: 297.15, // Kelvin
  humidity: 65,
  mixingHeight: 850
};

// We'll load plume data dynamically via API – start empty
const initialPlumeData: PlumePoint[] = [];

// Removed SetupButton - using real uploaded data only

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'chat' | 'map' | 'data'>('overview');
  const [uploadedSessionId, setUploadedSessionId] = useState<string | null>(null);
  const [realSensorData, setRealSensorData] = useState<any[]>([]);
  const [plumeData, setPlumeData] = useState<PlumePoint[]>(initialPlumeData);

  // Function to fetch uploaded sensor data from pi_sensor_raw table
  const fetchUploadedSensorData = async () => {
    try {
      console.log('🔍 Fetching uploaded sensor data from pi_sensor_raw...');
      const response = await fetch('/api/get-sensor-data');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // Convert pi_sensor_raw data to sensor format for visualization
          const sensors = result.data.map((row: any) => {
            const [lat, lng] = row.location.split(',').map((coord: string) => parseFloat(coord.trim()));
            return {
              id: row.sensor_uuid,
              position: [lng, lat, row.altitude_m || 10] as [number, number, number],
              pm25: row.pm25_ug_m3 || 0,
              status: 'active' as const,
              lastUpdate: new Date(row.ts)
            };
          });
          setRealSensorData(sensors);
          console.log('📍 Updated sensor data from uploaded CSV:', sensors.length, 'sensors');
        }
      }
    } catch (error) {
      console.error('Failed to fetch uploaded sensor data:', error);
    }
  };

  // Function to fetch session data and convert to sensor format
  const fetchSessionSensorData = async (sessionId: string) => {
    try {
      const response = await fetch(`/api/session-data?sessionId=${sessionId}`);
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // Convert CSV data to sensor format
          const sensors = result.data.map((row: any, index: number) => ({
            id: row.sensor_id || `sensor-${index}`,
            position: [
              parseFloat(row.longitude) || -122.1430,
              parseFloat(row.latitude) || 37.4419,
              parseFloat(row.altitude_m) || 10
            ] as [number, number, number],
            pm25: parseFloat(row.pm25_ugm3) || 0,
            status: 'active' as const,
            lastUpdate: new Date(row.timestamp || Date.now())
          }));
          setRealSensorData(sensors);
          console.log('📍 Updated sensor data from session:', sensors.length, 'sensors');
        }
      }
    } catch (error) {
      console.error('Failed to fetch session sensor data:', error);
    }
  };

  // Effect to fetch data when session changes
  React.useEffect(() => {
    if (uploadedSessionId) {
      fetchSessionSensorData(uploadedSessionId);
    }
  }, [uploadedSessionId]);

  // Handle CSV upload
  const handleDataUploaded = (data: any) => {
    console.log('📊 Data uploaded to dashboard:', data);
  };

  const handleSessionCreated = (sessionId: string) => {
    console.log('🔗 Session created:', sessionId);
    setUploadedSessionId(sessionId);
  };

  // ---------------------------------------------------------------
  // Fetch plume predictions when the Map tab is active
  // ---------------------------------------------------------------
  React.useEffect(() => {
    if (activeTab !== 'map') return;

    const fetchPlume = async () => {
      try {
        const res = await fetch('/api/plume-predictions?hours=24');
        const json = await res.json();
        if (json.success) {
          setPlumeData(json.data);
          console.log('🛰  Loaded plume predictions:', json.data.length);
        }
      } catch (e) {
        console.error('Failed to fetch plume predictions:', e);
      }
    };

    fetchPlume();
  }, [activeTab]);

  // Fetch uploaded sensor data when the Map tab is active
  React.useEffect(() => {
    if (activeTab !== 'map') return;

    const fetchUploadedSensorDataEffect = async () => {
      await fetchUploadedSensorData();
    };

    fetchUploadedSensorDataEffect();
  }, [activeTab]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'chat', label: 'AI Assistant', icon: MessageSquare },
    { id: 'map', label: '3D Visualization', icon: Map },
    { id: 'data', label: 'Data Explorer', icon: BarChart3 },
  ] as const;

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
                  Physics-Informed AI Dashboard
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-[64px] font-semibold text-white leading-tight mb-4"
              >
                Generative Smoke-Plume Platform
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-3xl mx-auto mb-8"
              >
                Advanced physics-informed AI platform combining HYSPLIT with deep learning for real-time prescribed fire smoke plume prediction using Raspberry Pi sensor networks and satellite data.
              </motion.p>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4 justify-center mb-8"
              >
                <motion.a
                  href="/chat"
                  className="bg-[#8C1515] text-white px-6 py-3 font-semibold hover:bg-[#7A1212] transition-colors flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <MessageSquare className="w-4 h-4" />
                  Launch AI Assistant
                </motion.a>
                <motion.a
                  href="#data"
                  onClick={() => setActiveTab('data')}
                  className="border border-[#8C1515] text-[#8C1515] px-6 py-3 font-semibold hover:bg-[#8C1515] hover:text-white transition-colors flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Database className="w-4 h-4" />
                  Upload Your Data
                </motion.a>
              </motion.div>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Gauge className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Real-Time Monitoring</h3>
                  <p className="text-gray-400">Continuous sensor data collection and analysis</p>
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
                  <h3 className="text-xl font-semibold text-white mb-2">Physics-Informed AI</h3>
                  <p className="text-gray-400">HYSPLIT integration with transformer models</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Map className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">3D Visualization</h3>
                  <p className="text-gray-400">Interactive smoke plume visualization with Deck.gl</p>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex justify-center mb-8">
                <div className="flex bg-[#1a1a1a] border border-gray-700">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-6 py-3 font-medium transition-colors ${
                          activeTab === tab.id
                            ? 'bg-[#8C1515] text-white'
                            : 'text-gray-400 hover:text-white hover:bg-gray-700/30'
                        }`}
                      >
                        <Icon className="w-4 h-4" />
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Tab Content */}
              <div className="bg-[#1a1a1a] border border-gray-700 p-6">
                {activeTab === 'overview' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <h3 className="text-2xl font-semibold text-white mb-6">System Overview</h3>
                    <EnhancedAirQualityDashboard />
                  </motion.div>
                )}

                {activeTab === 'chat' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <h3 className="text-2xl font-semibold text-white mb-6">AI Assistant</h3>
                    <SmeshChat />
                  </motion.div>
                )}

                {activeTab === 'map' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <h3 className="text-2xl font-semibold text-white mb-6">3D Visualization</h3>
                    <div className="bg-[#111111] border border-gray-700 p-4">
                      <div className="w-full h-full">
                        <SmokePlume3DViewer
                          concentrationData={plumeData}
                          sensorData={realSensorData}
                          prescribedBurns={samplePrescribedBurns}
                          meteorologicalData={sampleMeteorologicalData}
                        />
                        {/* Tooltip for sensor hover */}
                        <div id="sensor-tooltip" style={{ position: 'absolute', pointerEvents: 'none', display: 'none', zIndex: 1000 }} />
                      </div>
                      {realSensorData.length > 0 && (
                        <div className="mt-4 p-3 bg-[#8C1515]/10 border border-[#8C1515]/30">
                          <p className="text-[#8C1515] text-sm font-medium">
                            📍 Displaying {realSensorData.length} sensors from uploaded data
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                {activeTab === 'data' && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <h3 className="text-2xl font-semibold text-white mb-6">Data Explorer</h3>
                    
                    {/* Enhanced CSV Upload Section */}
                    <div className="mb-8">
                      <h4 className="text-lg font-semibold text-white mb-4">Upload Your Data</h4>
                      <CSVUpload 
                        onDataUploaded={handleDataUploaded}
                        onSessionCreated={handleSessionCreated}
                        className="mb-6"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-[#111111] border border-gray-700 p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <Activity className="w-5 h-5 text-[#8C1515]" />
                          <h4 className="text-lg font-semibold text-white">Sensor Status</h4>
                        </div>
                        <p className="text-gray-400">Monitor real-time sensor network health and data quality</p>
                      </div>
                      <div className="bg-[#111111] border border-gray-700 p-6">
                        <div className="flex items-center gap-2 mb-4">
                          <BarChart3 className="w-5 h-5 text-[#8C1515]" />
                          <h4 className="text-lg font-semibold text-white">Data Analytics</h4>
                        </div>
                        <p className="text-gray-400">Historical trends and pattern analysis with uploaded data integration</p>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 