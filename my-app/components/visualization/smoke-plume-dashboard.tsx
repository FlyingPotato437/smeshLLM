'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { 
  Wind, 
  Thermometer, 
  Droplets, 
  Activity, 
  MapPin, 
  AlertTriangle,
  Eye,
  Zap,
  RefreshCw
} from 'lucide-react';
import { SensorDataService, FireDataService, PredictionService } from '@/lib/database/supabase';
import type { PiSensorReading, FireDetection, PlumePrediction } from '@/types';
import dynamic from 'next/dynamic';
import { SmokePlume3DViewer } from './smoke-plume-3d-viewer'; // Adjust path if needed

interface DashboardProps {
  className?: string;
}

interface SensorMetrics {
  avgPm25: number;
  avgPm10: number;
  avgTemperature: number;
  avgHumidity: number;
  activeSensors: number;
  lastUpdated: string;
}

interface AlertLevel {
  level: 'good' | 'moderate' | 'unhealthy' | 'hazardous';
  color: string;
  message: string;
}

export function SmokePlumeDashboard({ className }: DashboardProps) {
  const [sensorData, setSensorData] = useState<PiSensorReading[]>([]);
  const [fireData, setFireData] = useState<FireDetection[]>([]);
  const [predictions, setPredictions] = useState<PlumePrediction[]>([]);
  const [metrics, setMetrics] = useState<SensorMetrics | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [selectedRegion, setSelectedRegion] = useState<string>('california');
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadDashboardData();
    
    // Set up real-time updates every 30 seconds
    const interval = setInterval(loadDashboardData, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadDashboardData = async () => {
    try {
      setIsLoading(true);
      
      // Load recent sensor data (last 6 hours)
      const recentSensors = await SensorDataService.getRecentSensorData(6);
      const mappedSensors = recentSensors?.map((s: any) => ({
        id: s.id,
        datetime: s.ts || new Date().toISOString(),
        from_node: s.sensor_uuid || 'unknown',
        pm10Standard: s.pm10_ug_m3 || 0,
        pm25Standard: s.pm25_ug_m3 || 0,
        pm100Standard: s.pm100_ug_m3 || 0,
        pm10Environmental: s.pm10_ug_m3 || 0,
        pm25Environmental: s.pm25_ug_m3 || 0,
        pm100Environmental: s.pm100_ug_m3 || 0,
        from_short_name: 'Default',
        temperature: s.temperature_c || 0,
        relativeHumidity: s.rh_percent || 0,
        barometricPressure: s.barometric_pressure || 0,
        latitude: s.location?.coordinates[1] || 0,
        longitude: s.location?.coordinates[0] || 0,
        elevation: String(s.altitude_m ?? 0),
      })) || [];
      setSensorData(mappedSensors);
      
      // Load recent fire detections
      const recentFires = await FireDataService.getActiveFiresNearSensors(100);
      setFireData(recentFires || []);
      
      // Load latest predictions
      const latestPredictions = await PredictionService.getLatestPredictions(6);
      setPredictions(latestPredictions || []);
      
      // Calculate metrics
      if (mappedSensors && mappedSensors.length > 0) {
        const avgPm25 = mappedSensors.reduce((sum: number, s: any) => sum + s.pm25Environmental, 0) / mappedSensors.length;
        const avgPm10 = mappedSensors.reduce((sum: number, s: any) => sum + s.pm10Environmental, 0) / mappedSensors.length;
        const avgTemp = mappedSensors.reduce((sum: number, s: any) => sum + s.temperature, 0) / mappedSensors.length;
        const avgHumidity = mappedSensors.reduce((sum: number, s: any) => sum + s.relativeHumidity, 0) / mappedSensors.length;
        
        setMetrics({
          avgPm25: Math.round(avgPm25 * 10) / 10,
          avgPm10: Math.round(avgPm10 * 10) / 10,
          avgTemperature: Math.round(avgTemp * 10) / 10,
          avgHumidity: Math.round(avgHumidity * 10) / 10,
          activeSensors: new Set(mappedSensors.map((s: any) => s.from_node)).size,
          lastUpdated: new Date().toISOString()
        });
      }
      
      setLastRefresh(new Date());
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getAirQualityLevel = (pm25: number): AlertLevel => {
    if (pm25 <= 12) return { level: 'good', color: 'text-green-600', message: 'Air quality is good' };
    if (pm25 <= 35) return { level: 'moderate', color: 'text-yellow-600', message: 'Moderate air quality' };
    if (pm25 <= 55) return { level: 'unhealthy', color: 'text-orange-600', message: 'Unhealthy for sensitive groups' };
    return { level: 'hazardous', color: 'text-red-600', message: 'Hazardous air quality' };
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const currentAlert = metrics ? getAirQualityLevel(metrics.avgPm25) : null;

  return (
    <div className={`p-6 space-y-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Smoke Plume Dashboard</h1>
          <p className="text-gray-600 mt-1">Real-time wildfire smoke monitoring and prediction</p>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-500">
            Last updated: {formatTime(lastRefresh.toISOString())}
          </div>
          <button
            onClick={loadDashboardData}
            disabled={isLoading}
            className="flex items-center gap-2 px-4 py-2 bg-[#8C1515] text-white rounded-lg hover:bg-[#7A1212] disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Alert Banner */}
      {currentAlert && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-3 p-4 rounded-lg border-l-4 ${
            currentAlert.level === 'good' ? 'bg-green-50 border-green-500' :
            currentAlert.level === 'moderate' ? 'bg-yellow-50 border-yellow-500' :
            currentAlert.level === 'unhealthy' ? 'bg-orange-50 border-orange-500' :
            'bg-red-50 border-red-500'
          }`}
        >
          <AlertTriangle className={`w-5 h-5 ${currentAlert.color}`} />
          <div>
            <div className={`font-semibold ${currentAlert.color}`}>
              Air Quality Alert: {currentAlert.level.toUpperCase()}
            </div>
            <div className="text-sm text-gray-600">{currentAlert.message}</div>
          </div>
        </motion.div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="PM2.5 Concentration"
          value={metrics?.avgPm25 || 0}
          unit="μg/m³"
          icon={<Activity className="w-5 h-5" />}
          trend="stable"
          color={currentAlert?.color || 'text-gray-600'}
        />
        
        <MetricCard
          title="Active Sensors"
          value={metrics?.activeSensors || 0}
          unit="devices"
          icon={<Eye className="w-5 h-5" />}
          trend="up"
          color="text-blue-600"
        />
        
        <MetricCard
          title="Temperature"
          value={metrics?.avgTemperature || 0}
          unit="°C"
          icon={<Thermometer className="w-5 h-5" />}
          trend="stable"
          color="text-orange-600"
        />
        
        <MetricCard
          title="Humidity"
          value={metrics?.avgHumidity || 0}
          unit="%"
          icon={<Droplets className="w-5 h-5" />}
          trend="down"
          color="text-cyan-600"
        />
      </div>

      {/* Map Placeholder */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
          <MapPin className="w-5 h-5" />
          Real-time Smoke Plume Visualization
        </h2>
        
        <div 
          ref={mapRef}
          className="h-96 bg-gradient-to-br from-blue-50 to-green-50 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center"
        >
          <SmokePlume3DViewer
            concentrationData={predictions.map(p => ({
              position: [p.longitude, p.latitude, p.altitude_m],
              concentration: p.conc_pm25_ug_m3,
              uncertainty: p.rmse_validation || 0,
              timestamp: new Date(p.prediction_ts),
              source: 'ai_enhanced'
            }))}
            sensorData={sensorData.map(s => ({
              id: s.from_node,
              position: [s.longitude, s.latitude, parseFloat(s.elevation) || 0],
              pm25: s.pm25Environmental,
              status: 'active',
              lastUpdate: new Date(s.datetime)
            }))}
            prescribedBurns={fireData.map(f => ({
              id: f.id || '',
              name: 'Fire',
              area: { type: 'Polygon', coordinates: [[[f.longitude, f.latitude]]] }, // Simplified
              phase: f.confidence,
              startTime: new Date(f.acquisition_ts)
            }))}
            meteorologicalData={{ // Use averaged or latest
              windSpeed: 5.0, // TODO: Fetch real
              windDirection: 180,
              temperature: metrics?.avgTemperature || 293.15,
              humidity: metrics?.avgHumidity || 60,
              mixingHeight: 1000
            }}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Data Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sensor Readings */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Sensor Readings</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2">Sensor</th>
                  <th className="text-left py-2">PM2.5</th>
                  <th className="text-left py-2">Temp</th>
                  <th className="text-left py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {sensorData.slice(0, 5).map((reading, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 font-mono text-xs">
                      {reading.from_node?.toString().slice(-8)}
                    </td>
                    <td className="py-2">
                      <span className={getAirQualityLevel(reading.pm25Environmental).color}>
                        {reading.pm25Environmental?.toFixed(1) || 'N/A'}
                      </span>
                    </td>
                    <td className="py-2">{reading.temperature?.toFixed(1) || 'N/A'}°C</td>
                    <td className="py-2 text-gray-500">
                      {formatTime(reading.datetime)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Fire Detections */}
        <div className="bg-white rounded-xl shadow-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Active Fire Detections</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-2">Location</th>
                  <th className="text-left py-2">Power</th>
                  <th className="text-left py-2">Confidence</th>
                  <th className="text-left py-2">Time</th>
                </tr>
              </thead>
              <tbody>
                {fireData.slice(0, 5).map((fire, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2 font-mono text-xs">
                      {(fire as any).location ? 'Fire Site' : `${fire.latitude?.toFixed(2)},${fire.longitude?.toFixed(2)}`}
                    </td>
                    <td className="py-2">{fire.frp_mw?.toFixed(1) || 'N/A'} MW</td>
                    <td className="py-2">
                      <span className={
                        fire.confidence === 'high' ? 'text-red-600' :
                        fire.confidence === 'nominal' ? 'text-yellow-600' :
                        'text-gray-600'
                      }>
                        {fire.confidence || 'N/A'}
                      </span>
                    </td>
                    <td className="py-2 text-gray-500">
                      {formatTime(fire.acquisition_ts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

interface MetricCardProps {
  title: string;
  value: number;
  unit: string;
  icon: React.ReactNode;
  trend: 'up' | 'down' | 'stable';
  color: string;
}

function MetricCard({ title, value, unit, icon, trend, color }: MetricCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-xl shadow-lg p-6"
    >
      <div className="flex items-center justify-between mb-3">
        <div className={`p-2 rounded-lg bg-gray-50 ${color}`}>
          {icon}
        </div>
        <div className={`text-xs px-2 py-1 rounded-full ${
          trend === 'up' ? 'bg-green-100 text-green-700' :
          trend === 'down' ? 'bg-red-100 text-red-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {trend === 'up' ? '↗' : trend === 'down' ? '↘' : '→'}
        </div>
      </div>
      
      <div className="space-y-1">
        <h3 className="text-sm font-medium text-gray-600">{title}</h3>
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-bold ${color}`}>
            {typeof value === 'number' ? value.toFixed(1) : '0.0'}
          </span>
          <span className="text-sm text-gray-500">{unit}</span>
        </div>
      </div>
    </motion.div>
  );
} 