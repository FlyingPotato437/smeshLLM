'use client';

import React, { useEffect, useState } from 'react';
import { Navigation } from '@/components/layout/navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { SmeshChat } from '@/components/ui/smesh-chat';
import EnhancedAirQualityDashboard from '@/components/ui/enhanced-air-quality-dashboard';
import { CSVUpload } from '@/components/ui/csv-upload';
import { SmokePlume3DViewer } from '@/components/visualization/smoke-plume-3d-viewer';
import { buildLayerDataFromCsv } from '@/lib/utils/air-quality-sample';
import { MessageSquare, Map as MapIcon, Database, Activity, TrendingUp, BarChart3, Gauge, Zap, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

interface PlumePoint {
  position: [number, number, number];
  concentration: number;
  pm25?: number;
  pm10?: number;
  pm1?: number;
  uncertainty: number;
  timestamp: Date;
  source: 'hysplit' | 'ai_enhanced';
  layerType?: 'smoke';
}

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
  const [sampleLayerData, setSampleLayerData] = useState<{
    sensors: any[];
    smokePoints: PlumePoint[];
    meteorology: any;
  } | null>(null);
  const [meteorologicalData, setMeteorologicalData] = useState(sampleMeteorologicalData);

  const dedupeLatestSensors = (sensors: any[]) => {
    const latestById = new globalThis.Map<string, any>();
    sensors.forEach((sensor) => {
      const prev = latestById.get(sensor.id);
      const currTs = new Date(sensor.lastUpdate).getTime();
      const prevTs = prev ? new Date(prev.lastUpdate).getTime() : -1;
      if (!prev || currTs >= prevTs) {
        latestById.set(sensor.id, sensor);
      }
    });
    return Array.from(latestById.values());
  };

  const getFallbackSensor = (sensorId: string) =>
    sampleLayerData?.sensors.find((sensor) => sensor.id === sensorId);

  const parseSensorPosition = (locationValue: any, sensorId: string, altitude: number | undefined) => {
    const fallback = getFallbackSensor(sensorId);

    if (typeof locationValue === 'string' && locationValue.includes('POINT(')) {
      const match = locationValue.match(/POINT\(([+-]?\d*\.?\d+)\s+([+-]?\d*\.?\d+)\)/);
      if (match) {
        return [parseFloat(match[1]), parseFloat(match[2]), altitude ?? fallback?.position?.[2] ?? 12] as [number, number, number];
      }
    }

    if (typeof locationValue === 'string' && locationValue.includes(',')) {
      const [latRaw, lonRaw] = locationValue.split(',').map((coord) => parseFloat(coord.trim()));
      if (Number.isFinite(latRaw) && Number.isFinite(lonRaw)) {
        return [lonRaw, latRaw, altitude ?? fallback?.position?.[2] ?? 12] as [number, number, number];
      }
    }

    if (fallback) return fallback.position;
    return [-122.1697, 37.4275, altitude ?? 12];
  };

  useEffect(() => {
    const loadSampleLayerData = async () => {
      try {
        const response = await fetch('/sample-air-quality-data.csv');
        if (!response.ok) return;
        const csvText = await response.text();
        const sampleData = buildLayerDataFromCsv(csvText);
        setSampleLayerData({
          sensors: sampleData.sensors,
          smokePoints: sampleData.smokePoints as PlumePoint[],
          meteorology: sampleData.meteorology,
        });
        setMeteorologicalData(sampleData.meteorology);
        setRealSensorData((prev) => (prev.length ? prev : sampleData.sensors));
        setPlumeData((prev) => (prev.length ? prev : (sampleData.smokePoints as PlumePoint[])));
      } catch (error) {
        console.error('Failed to load sample layer data:', error);
      }
    };

    loadSampleLayerData();
  }, []);

  // Function to fetch uploaded sensor data from pi_sensor_raw table
  const fetchUploadedSensorData = async () => {
    try {
      console.log('🔍 Fetching uploaded sensor data from pi_sensor_raw...');
      const response = await fetch('/api/get-sensor-data');
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // Convert pi_sensor_raw data to sensor format for visualization
          const sensors = result.data.map((row: any, index: number) => {
            const sensorId = row.sensor_uuid || row.from_node || `sensor-${index}`;
            const fallback = getFallbackSensor(sensorId);
            const position = parseSensorPosition(row.location, sensorId, row.altitude_m);
            const pm25 = row.pm25_ug_m3 || row.pm25Environmental || row.pm25 || 0;
            const pm10 = row.pm10_ug_m3 || row.pm10Environmental || row.pm10 || 0;
            const pm1 = row.pm1_ug_m3 || row.pm1 || pm25 * 0.7;
            return {
              id: sensorId,
              sensorName: fallback?.sensorName || `Sensor ${sensorId.toString().slice(-4)}`,
              position,
              pm25,
              pm10,
              pm1,
              status: 'active' as const,
              lastUpdate: new Date(row.ts || row.timestamp || Date.now()),
              bme: {
                temperatureC: row.temperature_c || row.temperature || fallback?.bme?.temperatureC || 0,
                humidityPct: row.rh_percent || row.relativeHumidity || fallback?.bme?.humidityPct || 0,
                pressureHpa: row.barometric_pressure || row.barometricPressure || fallback?.bme?.pressureHpa || 0,
              },
              battery: {
                percent: row.battery_level || fallback?.battery?.percent || 0,
                voltage: row.voltage || fallback?.battery?.voltage || 0,
              },
              electronics: {
                rxSnr: row.rxSnr || fallback?.electronics?.rxSnr || 0,
                rxRssi: row.rxRssi || fallback?.electronics?.rxRssi || 0,
                rxTime: row.rxTime || fallback?.electronics?.rxTime || 0,
                hopStart: row.hopStart || fallback?.electronics?.hopStart || 0,
                hopLimit: row.hopLimit || fallback?.electronics?.hopLimit || 0,
              },
              layerType: 'sensor' as const,
            };
          });
          setRealSensorData(dedupeLatestSensors(sensors));
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
          const sensors = result.data.map((row: any, index: number) => {
            const sensorId = row.sensor_id || row.fromNode || row.from_node || `sensor-${index}`;
            const fallback = getFallbackSensor(sensorId);
            const position = parseSensorPosition(
              row.location || `${row.latitude || row.lat || ''},${row.longitude || row.lon || row.lng || ''}`,
              sensorId,
              parseFloat(row.altitude_m || row.altitude || row.elevation || 0) || undefined
            );
            const pm25 = parseFloat(row.pm25_ugm3 || row.pm25Environmental || row.pm25Standard || row.pm25 || 0);
            const pm10 = parseFloat(row.pm10_ugm3 || row.pm10Environmental || row.pm10Standard || row.pm10 || 0);
            const pm1 = parseFloat(row.pm1_ugm3 || row.pm1 || pm25 * 0.7);

            return {
              id: sensorId,
              sensorName: fallback?.sensorName || `Sensor ${sensorId.toString().slice(-4)}`,
              position,
              pm25,
              pm10,
              pm1,
              status: 'active' as const,
              lastUpdate: new Date(row.timestamp || row.datetime || Date.now()),
              bme: {
                temperatureC: parseFloat(row.temperature_c || row.temperature || row.temp || fallback?.bme?.temperatureC || 0),
                humidityPct: parseFloat(row.relative_humidity_pct || row.rh_percent || row.humidity || fallback?.bme?.humidityPct || 0),
                pressureHpa: parseFloat(row.barometric_pressure || row.pressure || fallback?.bme?.pressureHpa || 0),
              },
              battery: {
                percent: parseFloat(row.battery_level || fallback?.battery?.percent || 0),
                voltage: parseFloat(row.voltage || fallback?.battery?.voltage || 0),
              },
              electronics: {
                rxSnr: parseFloat(row.rxSnr || fallback?.electronics?.rxSnr || 0),
                rxRssi: parseFloat(row.rxRssi || fallback?.electronics?.rxRssi || 0),
                rxTime: parseFloat(row.rxTime || fallback?.electronics?.rxTime || 0),
                hopStart: parseFloat(row.hopStart || fallback?.electronics?.hopStart || 0),
                hopLimit: parseFloat(row.hopLimit || fallback?.electronics?.hopLimit || 0),
              },
              layerType: 'sensor' as const,
            };
          });
          setRealSensorData(dedupeLatestSensors(sensors));
          console.log('📍 Updated sensor data from session:', sensors.length, 'sensors');
        }
      }
    } catch (error) {
      console.error('Failed to fetch session sensor data:', error);
    }
  };

  // Effect to fetch data when session changes
  useEffect(() => {
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
  useEffect(() => {
    if (activeTab !== 'map') return;

    const fetchPlume = async () => {
      try {
        const res = await fetch('/api/plume-predictions?hours=24');
        const json = await res.json();
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          const mappedPlumes: PlumePoint[] = json.data.map((point: any) => ({
            position: [
              point.longitude ?? -122.1697,
              point.latitude ?? 37.4275,
              point.altitude_m ?? 80,
            ] as [number, number, number],
            concentration: point.conc_pm25_ug_m3 ?? 0,
            pm25: point.conc_pm25_ug_m3 ?? 0,
            pm10: point.conc_pm10_ug_m3 ?? 0,
            pm1: point.conc_pm1_ug_m3 ?? (point.conc_pm25_ug_m3 ?? 0) * 0.7,
            uncertainty: point.rmse_validation ?? Math.max(0.5, (point.conc_pm25_ug_m3 ?? 0) * 0.08),
            timestamp: new Date(point.prediction_ts ?? Date.now()),
            source: point.model_version?.includes('AI') ? 'ai_enhanced' : 'hysplit',
            layerType: 'smoke',
          }));
          setPlumeData(mappedPlumes);
          console.log('🛰  Loaded plume predictions:', mappedPlumes.length);
        } else if (sampleLayerData?.smokePoints?.length) {
          setPlumeData(sampleLayerData.smokePoints);
        }
      } catch (e) {
        console.error('Failed to fetch plume predictions:', e);
        if (sampleLayerData?.smokePoints?.length) {
          setPlumeData(sampleLayerData.smokePoints);
        }
      }
    };

    fetchPlume();
  }, [activeTab, sampleLayerData]);

  // Fetch uploaded sensor data when the Map tab is active
  useEffect(() => {
    if (activeTab !== 'map') return;

    const fetchUploadedSensorDataEffect = async () => {
      await fetchUploadedSensorData();
    };

    fetchUploadedSensorDataEffect();
  }, [activeTab]);

  const tabs = [
    { id: 'overview', label: 'Overview', icon: TrendingUp },
    { id: 'chat', label: 'AI Assistant', icon: MessageSquare },
    { id: 'map', label: '3D Visualization', icon: MapIcon },
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
                    <MapIcon className="w-6 h-6 text-white" />
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
                      <div className="w-full h-[560px] border border-gray-700 bg-[#0f0f0f]">
                        <SmokePlume3DViewer
                          concentrationData={plumeData}
                          sensorData={(realSensorData.length ? realSensorData : sampleLayerData?.sensors || []) as any}
                          prescribedBurns={samplePrescribedBurns as any}
                          meteorologicalData={meteorologicalData}
                          className="w-full h-full"
                        />
                      </div>
                      {(realSensorData.length > 0 || sampleLayerData?.sensors?.length) && (
                        <div className="mt-4 p-3 bg-[#8C1515]/10 border border-[#8C1515]/30">
                          <p className="text-[#8C1515] text-sm font-medium">
                            📍 Displaying {(realSensorData.length || sampleLayerData?.sensors?.length || 0)} sensors
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
