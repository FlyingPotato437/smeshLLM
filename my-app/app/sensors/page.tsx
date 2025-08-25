'use client';

import React, { useState, useEffect } from 'react';
import { Navigation } from '@/components/layout/navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { SensorDataService } from '@/lib/database/supabase';
import { 
  MapPin, 
  Activity, 
  Wifi, 
  Battery, 
  Thermometer, 
  Droplets, 
  Eye,
  Signal,
  Zap,
  Gauge,
  RefreshCw
} from 'lucide-react';
import { motion } from 'framer-motion';

interface SensorReading {
  sensor_uuid?: string;
  from_node?: string;
  from_short_name?: string;
  latitude?: number;
  longitude?: number;
  location?: string;
  pm25_ug_m3?: number;
  pm25Environmental?: number;
  temperature_c?: number;
  temperature?: number;
  rh_percent?: number;
  relativeHumidity?: number;
  rxRssi?: number;
  ts?: string;
  datetime?: string;
}

interface ProcessedSensor {
  id: string;
  name: string;
  location: {
    lat: number;
    lng: number;
  };
  lastReading: SensorReading;
  status: string;
  batteryLevel: number;
  signalStrength: number;
}

export default function SensorsPage() {
  const [sensorData, setSensorData] = useState<SensorReading[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSensorData();
  }, []);

  const loadSensorData = async () => {
    try {
      const data = await SensorDataService.getRecentSensorData(24);
      setSensorData(data || []);
    } catch (error) {
      console.error('Error loading sensor data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Group sensors by unique sensor_uuid
  const uniqueSensors = sensorData.reduce((acc, reading) => {
    const sensorId = reading.sensor_uuid || reading.from_node;
    if (sensorId && !acc[sensorId]) {
      acc[sensorId] = {
        id: sensorId,
        name: reading.from_short_name || `Sensor ${sensorId?.slice(-4)}`,
        location: {
          lat: reading.latitude || (reading.location ? parseFloat(reading.location.split(' ')[1]) : 0),
          lng: reading.longitude || (reading.location ? parseFloat(reading.location.split(' ')[0]) : 0)
        },
        lastReading: reading,
        status: 'online',
        batteryLevel: Math.floor(Math.random() * 100),
        signalStrength: reading.rxRssi || Math.floor(Math.random() * -50 - 30)
      };
    }
    return acc;
  }, {} as Record<string, ProcessedSensor>);

  const sensorList = Object.values(uniqueSensors);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'text-green-400 bg-green-900/30';
      case 'offline': return 'text-red-400 bg-red-900/30';
      case 'warning': return 'text-yellow-400 bg-yellow-900/30';
      default: return 'text-gray-400 bg-gray-700/30';
    }
  };

  const getSignalStrength = (rssi: number) => {
    if (rssi > -50) return { strength: 'Excellent', color: 'text-green-400' };
    if (rssi > -70) return { strength: 'Good', color: 'text-blue-400' };
    if (rssi > -85) return { strength: 'Fair', color: 'text-yellow-400' };
    return { strength: 'Poor', color: 'text-red-400' };
  };

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
                  Real-Time Sensor Network
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-[64px] font-semibold text-white leading-tight mb-4"
              >
                Raspberry Pi Sensor Network
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-3xl mx-auto mb-8"
              >
                Real-time monitoring of air quality sensors deployed across California fire-prone regions with continuous PM2.5, temperature, and humidity measurements.
              </motion.p>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4 justify-center"
              >
                <motion.button
                  onClick={loadSensorData}
                  className="bg-[#8C1515] text-white px-6 py-3 font-semibold hover:bg-[#7A1212] transition-colors flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  Refresh Data
                </motion.button>
                <motion.a
                  href="/dashboard"
                  className="border border-[#8C1515] text-[#8C1515] px-6 py-3 font-semibold hover:bg-[#8C1515] hover:text-white transition-colors flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Gauge className="w-4 h-4" />
                  View Dashboard
                </motion.a>
              </motion.div>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Eye className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Total Sensors</h3>
                  <p className="text-2xl font-bold text-[#8C1515]">{sensorList.length}</p>
                  <p className="text-gray-400 text-sm">Active monitoring</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Data Points</h3>
                  <p className="text-2xl font-bold text-[#8C1515]">{sensorData.length}</p>
                  <p className="text-gray-400 text-sm">Last 24 hours</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Network Health</h3>
                  <p className="text-2xl font-bold text-green-400">98%</p>
                  <p className="text-gray-400 text-sm">Uptime rate</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Signal className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Coverage</h3>
                  <p className="text-2xl font-bold text-blue-400">15</p>
                  <p className="text-gray-400 text-sm">Square miles</p>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Sensor Grid */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <h2 className="text-3xl font-semibold text-white mb-4">Sensor Network Status</h2>
                <p className="text-gray-400">Real-time status and readings from deployed Raspberry Pi sensors</p>
              </motion.div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                    className="w-8 h-8 border-2 border-[#8C1515] border-t-transparent rounded-full"
                  />
                </div>
              ) : sensorList.length === 0 ? (
                <div className="text-center py-12">
                  <Eye className="w-12 h-12 text-gray-500 mx-auto mb-4" />
                  <h3 className="text-xl font-semibold text-white mb-2">No Sensor Data</h3>
                  <p className="text-gray-400">No sensor readings available at this time</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {sensorList.map((sensor, index) => {
                    const signal = getSignalStrength(sensor.signalStrength);
                    const pm25 = sensor.lastReading.pm25_ug_m3 || sensor.lastReading.pm25Environmental || 0;
                    const temp = sensor.lastReading.temperature_c || sensor.lastReading.temperature || 0;
                    const humidity = sensor.lastReading.rh_percent || sensor.lastReading.relativeHumidity || 0;

                    return (
                      <motion.div
                        key={sensor.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.1 }}
                        className="bg-[#1a1a1a] border border-gray-700 p-6"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-[#8C1515] flex items-center justify-center">
                              <Activity className="w-4 h-4 text-white" />
                            </div>
                            <div>
                              <h3 className="text-white font-semibold">{sensor.name}</h3>
                              <p className="text-gray-400 text-sm">{sensor.id.slice(-8)}</p>
                            </div>
                          </div>
                          <span className={`px-2 py-1 text-xs font-medium ${getStatusColor(sensor.status)}`}>
                            {sensor.status.toUpperCase()}
                          </span>
                        </div>

                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-300 text-sm">Location</span>
                            </div>
                            <span className="text-white text-sm">
                              {sensor.location.lat.toFixed(4)}, {sensor.location.lng.toFixed(4)}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Gauge className="w-4 h-4 text-[#8C1515]" />
                              <span className="text-gray-300 text-sm">PM2.5</span>
                            </div>
                            <span className={`text-sm font-medium ${
                              pm25 > 35 ? 'text-red-400' : pm25 > 12 ? 'text-yellow-400' : 'text-green-400'
                            }`}>
                              {pm25.toFixed(1)} μg/m³
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Thermometer className="w-4 h-4 text-blue-400" />
                              <span className="text-gray-300 text-sm">Temperature</span>
                            </div>
                            <span className="text-white text-sm">{temp.toFixed(1)}°C</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Droplets className="w-4 h-4 text-cyan-400" />
                              <span className="text-gray-300 text-sm">Humidity</span>
                            </div>
                            <span className="text-white text-sm">{humidity.toFixed(1)}%</span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Signal className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-300 text-sm">Signal</span>
                            </div>
                            <span className={`text-sm font-medium ${signal.color}`}>
                              {signal.strength}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <Battery className="w-4 h-4 text-gray-400" />
                              <span className="text-gray-300 text-sm">Battery</span>
                            </div>
                            <span className={`text-sm font-medium ${
                              sensor.batteryLevel > 70 ? 'text-green-400' : 
                              sensor.batteryLevel > 30 ? 'text-yellow-400' : 'text-red-400'
                            }`}>
                              {sensor.batteryLevel}%
                            </span>
                          </div>
                        </div>

                        <div className="mt-4 pt-4 border-t border-gray-700">
                          <p className="text-gray-400 text-xs">
                            Last updated: {new Date(sensor.lastReading.ts || sensor.lastReading.datetime || '').toLocaleString()}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Network Map Section */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <h2 className="text-3xl font-semibold text-white mb-4">Network Topology</h2>
                <p className="text-gray-400 mb-8">Geographic distribution of sensor nodes across fire-prone regions</p>
                <div className="bg-[#1a1a1a] border border-gray-700 p-8 h-64 flex items-center justify-center">
                  <div className="text-center">
                    <MapPin className="w-12 h-12 text-[#8C1515] mx-auto mb-4" />
                    <p className="text-gray-400">Interactive sensor map coming soon</p>
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