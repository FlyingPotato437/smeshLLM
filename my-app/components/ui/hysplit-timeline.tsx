"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Button } from './button';
import { Slider } from './slider';
import { Card, CardContent, CardHeader, CardTitle } from './card';
import { Badge } from './badge';
import { Play, Pause, SkipBack, SkipForward, Calendar, Wind, Thermometer } from 'lucide-react';

interface HysplitTimelineProps {
  isActive: boolean;
  onTimeChange: (hour: number) => void;
  forecastData?: any;
  className?: string;
}

interface ForecastTimeStep {
  hour: number;
  timestamp: Date;
  windDirection: number;
  windSpeed: number;
  temperature: number;
  plumeVolume: number;
  maxConcentration: number;
  description: string;
}

const MOCK_FORECAST_DATA: ForecastTimeStep[] = Array.from({ length: 73 }, (_, i) => {
  const baseTime = new Date();
  baseTime.setHours(baseTime.getHours() + i);
  
  return {
    hour: i,
    timestamp: baseTime,
    windDirection: 45 + Math.sin(i * 0.1) * 30, // Varying wind direction
    windSpeed: 8 + Math.sin(i * 0.05) * 4, // Wind speed 4-12 mph
    temperature: 72 + Math.sin(i * 0.08) * 15, // Temperature variation
    plumeVolume: Math.max(0, 100 + Math.sin(i * 0.03) * 80 + i * 2), // Growing plume
    maxConcentration: Math.max(0, 25 + Math.sin(i * 0.07) * 20 + Math.random() * 10),
    description: i < 6 ? 'Initial burn' : i < 24 ? 'Active spread' : i < 48 ? 'Peak dispersion' : 'Dissipating'
  };
});

export function HysplitTimeline({ isActive, onTimeChange, forecastData, className }: HysplitTimelineProps) {
  const [currentHour, setCurrentHour] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState(1); // 1x, 2x, 4x speed
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const forecastSteps = forecastData || MOCK_FORECAST_DATA;
  const currentStep = forecastSteps[currentHour] || forecastSteps[0];

  // Auto-play functionality
  useEffect(() => {
    if (isPlaying && isActive) {
      intervalRef.current = setInterval(() => {
        setCurrentHour(prev => {
          const next = prev + 1;
          if (next >= forecastSteps.length) {
            setIsPlaying(false);
            return 0; // Loop back to start
          }
          // Use setTimeout to avoid setState during render
          setTimeout(() => onTimeChange(next), 0);
          return next;
        });
      }, 1000 / playSpeed); // Adjust speed based on playSpeed
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isPlaying, isActive, playSpeed, forecastSteps.length, onTimeChange]);

  const handleSliderChange = (value: number[]) => {
    const newHour = value[0];
    setCurrentHour(newHour);
    onTimeChange(newHour);
  };

  const togglePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const skipToStart = () => {
    setCurrentHour(0);
    onTimeChange(0);
    setIsPlaying(false);
  };

  const skipToEnd = () => {
    const lastHour = forecastSteps.length - 1;
    setCurrentHour(lastHour);
    onTimeChange(lastHour);
    setIsPlaying(false);
  };

  const formatDateTime = (date: Date) => {
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });
  };

  const getWindDirection = (degrees: number) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    return directions[Math.round(degrees / 22.5) % 16];
  };

  if (!isActive) {
    return (
      <Card className={`w-full ${className}`}>
        <CardContent className="p-4">
          <div className="text-center text-gray-500">
            <Calendar className="w-8 h-8 mx-auto mb-2" />
            <p>Enable HYSPLIT forecast to see timeline</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={`w-full ${className}`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Calendar className="w-5 h-5" />
            HYSPLIT 72-Hour Forecast
          </span>
          <Badge variant={isPlaying ? "destructive" : "secondary"}>
            {isPlaying ? "LIVE" : "PAUSED"}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Current Time Display */}
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium">
              Hour {currentHour} of {forecastSteps.length - 1}
            </span>
            <span className="text-sm text-gray-600">
              {formatDateTime(currentStep.timestamp)}
            </span>
          </div>
          <div className="text-lg font-bold">{currentStep.description}</div>
        </div>

        {/* Timeline Slider */}
        <div className="space-y-2">
          <Slider
            value={[currentHour]}
            onValueChange={handleSliderChange}
            max={forecastSteps.length - 1}
            step={1}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500">
            <span>Now</span>
            <span>+24h</span>
            <span>+48h</span>
            <span>+72h</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" onClick={skipToStart}>
            <SkipBack className="w-4 h-4" />
          </Button>
          <Button 
            variant={isPlaying ? "destructive" : "default"} 
            size="sm" 
            onClick={togglePlayPause}
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </Button>
          <Button variant="outline" size="sm" onClick={skipToEnd}>
            <SkipForward className="w-4 h-4" />
          </Button>
          <select 
            value={playSpeed} 
            onChange={(e) => setPlaySpeed(Number(e.target.value))}
            className="ml-2 px-2 py-1 text-xs border rounded"
          >
            <option value={0.5}>0.5x</option>
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={4}>4x</option>
          </select>
        </div>

        {/* Current Conditions */}
        <div className="grid grid-cols-3 gap-4 pt-2 border-t">
          <div className="text-center">
            <Wind className="w-5 h-5 mx-auto mb-1 text-blue-500" />
            <div className="text-xs text-gray-600">Wind</div>
            <div className="font-semibold">
              {getWindDirection(currentStep.windDirection)} {Math.round(currentStep.windSpeed)} mph
            </div>
          </div>
          <div className="text-center">
            <Thermometer className="w-5 h-5 mx-auto mb-1 text-orange-500" />
            <div className="text-xs text-gray-600">Temperature</div>
            <div className="font-semibold">{Math.round(currentStep.temperature)}°F</div>
          </div>
          <div className="text-center">
            <div className="w-5 h-5 mx-auto mb-1 bg-gray-400 rounded-full"></div>
            <div className="text-xs text-gray-600">Max PM2.5</div>
            <div className="font-semibold">{Math.round(currentStep.maxConcentration)} µg/m³</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
            style={{ width: `${(currentHour / (forecastSteps.length - 1)) * 100}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
} 