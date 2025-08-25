#!/usr/bin/env python3
"""
GridMET Real Weather Service
Uses GridMET 4km meteorological data with VPD integration
Provides high-resolution meteorological data for fire weather analysis
No fallback mechanisms - fail fast on data access errors
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import math

# GridMET weather service
from .gridmet_weather_service import GridMETWeatherService, GridMETWeatherData

# Setup logging
logger = logging.getLogger(__name__)

class WeatherData:
    """GridMET weather data structure following ODIN patterns with enhancements"""
    
    def __init__(self, temperature_f: float, humidity_percent: float,
                 wind_speed_mph: float, wind_direction_deg: float,
                 pressure_mb: float = 1013.25, precipitation_24h: float = 0.0,
                 vapor_pressure_deficit_kpa: Optional[float] = None,
                 fuel_moisture_100hr: Optional[float] = None,
                 fuel_moisture_1000hr: Optional[float] = None):
        self.temperature_f = temperature_f
        self.humidity_percent = humidity_percent
        self.wind_speed_mph = wind_speed_mph
        self.wind_direction_deg = wind_direction_deg
        self.pressure_mb = pressure_mb
        self.precipitation_24h = precipitation_24h
        self.vapor_pressure_deficit_kpa = vapor_pressure_deficit_kpa
        self.fuel_moisture_100hr = fuel_moisture_100hr
        self.fuel_moisture_1000hr = fuel_moisture_1000hr
        self.timestamp = datetime.now()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "temperature_f": self.temperature_f,
            "temperature_c": (self.temperature_f - 32) * 5/9,
            "humidity_percent": self.humidity_percent,
            "wind_speed_mph": self.wind_speed_mph,
            "wind_speed_ms": self.wind_speed_mph * 0.44704,
            "wind_direction_deg": self.wind_direction_deg,
            "pressure_mb": self.pressure_mb,
            "precipitation_24h": self.precipitation_24h,
            "vapor_pressure_deficit_kpa": self.vapor_pressure_deficit_kpa,
            "fuel_moisture_100hr": self.fuel_moisture_100hr,
            "fuel_moisture_1000hr": self.fuel_moisture_1000hr,
            "timestamp": self.timestamp.isoformat(),
            "data_source": "GridMET 4km + VPD"
        }

class RealWeatherService:
    """
    GridMET Real Weather Service following ODIN patterns
    
    Uses GridMET 4km meteorological data with VPD integration:
    - GridMET climatologylab.org 4km resolution data
    - VPD NetCDF files from northwestknowledge.net
    - Real fuel moisture measurements (100hr, 1000hr)
    - No fallback mechanisms - fail fast on errors
    """
    
    def __init__(self):
        # GridMET service
        self.gridmet_service = GridMETWeatherService()
        
        logger.info("🌤️ GridMET Real Weather Service initialized - no fallbacks")
    
    async def get_current_weather(self, latitude: float, longitude: float) -> WeatherData:
        """
        Get current weather conditions from GridMET
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
        
        Returns:
            Current weather data from GridMET
            
        Raises:
            Exception: If GridMET data access fails (no fallbacks)
        """
        try:
            logger.info(f"🌤️ Getting GridMET weather for {latitude}, {longitude}")
            
            # Get GridMET weather data
            gridmet_data = await self.gridmet_service.get_current_weather(latitude, longitude)
            
            # Convert GridMET data to WeatherData format for ODIN compatibility
            weather_data = self._convert_gridmet_to_weather_data(gridmet_data)
            
            logger.info("✅ Retrieved weather data from GridMET")
            return weather_data
            
        except Exception as e:
            logger.error(f"❌ GridMET weather data retrieval failed: {e}")
            raise Exception(f"GridMET weather service error: {str(e)}")
    
    def _convert_gridmet_to_weather_data(self, gridmet_data: GridMETWeatherData) -> WeatherData:
        """Convert GridMET data to ODIN-compatible WeatherData format"""
        
        return WeatherData(
            temperature_f=gridmet_data.temperature_c * 9/5 + 32,  # Convert C to F
            humidity_percent=gridmet_data.relative_humidity_pct,
            wind_speed_mph=gridmet_data.wind_speed_ms * 2.237,  # Convert m/s to mph
            wind_direction_deg=gridmet_data.wind_direction_deg,
            pressure_mb=gridmet_data.surface_pressure_pa / 100 if gridmet_data.surface_pressure_pa else 1013.25,
            precipitation_24h=gridmet_data.precipitation_mm / 25.4,  # Convert mm to inches
            vapor_pressure_deficit_kpa=gridmet_data.vapor_pressure_deficit_kpa,
            fuel_moisture_100hr=gridmet_data.fuel_moisture_100hr,
            fuel_moisture_1000hr=gridmet_data.fuel_moisture_1000hr
        )
    
    async def get_fire_weather_indices(self, weather_data: WeatherData) -> Dict[str, Any]:
        """
        Get fire weather indices using GridMET enhanced calculations
        
        Args:
            weather_data: Current weather conditions from GridMET
        
        Returns:
            Fire weather indices and risk assessment with GridMET enhancements
        """
        try:
            logger.info("🔥 Getting GridMET-enhanced fire weather indices")
            
            # Convert WeatherData back to GridMET format for analysis
            temp_c = (weather_data.temperature_f - 32) * 5/9
            gridmet_weather = GridMETWeatherData(
                temperature_c=temp_c,
                relative_humidity_pct=weather_data.humidity_percent,
                wind_speed_ms=weather_data.wind_speed_mph * 0.44704,
                precipitation_mm=weather_data.precipitation_24h * 25.4,
                vapor_pressure_deficit_kpa=weather_data.vapor_pressure_deficit_kpa,
                fuel_moisture_100hr=weather_data.fuel_moisture_100hr,
                fuel_moisture_1000hr=weather_data.fuel_moisture_1000hr
            )
            
            # Use GridMET service for enhanced fire weather calculations
            fire_indices = await self.gridmet_service.get_fire_weather_indices(gridmet_weather)
            
            # Add ODIN-compatible format
            temp_f = weather_data.temperature_f
            humidity = weather_data.humidity_percent
            wind_speed = weather_data.wind_speed_mph
            
            # Enhanced red flag conditions with VPD and real fuel moisture
            red_flag_conditions = fire_indices.get('red_flag_conditions', [])
            if weather_data.fuel_moisture_100hr and weather_data.fuel_moisture_100hr < 8:
                red_flag_conditions.append("Critical fuel moisture (<8%)")
            
            fire_danger = fire_indices.get('fire_danger_rating', 'Unknown')
            
            # Use GridMET fuel moisture if available
            if weather_data.fuel_moisture_100hr is not None:
                if weather_data.fuel_moisture_100hr > 20:
                    fuel_moisture = "High"
                elif weather_data.fuel_moisture_100hr > 12:
                    fuel_moisture = "Moderate"
                else:
                    fuel_moisture = "Low"
            else:
                fuel_moisture = "Unknown"
            
            # Return GridMET-enhanced fire weather analysis
            return {
                "fire_weather_indices": fire_indices.get('fire_weather_indices', {}),
                "fire_danger_rating": fire_danger,
                "fuel_moisture_category": fuel_moisture,
                "gridmet_fuel_analysis": fire_indices.get('gridmet_fuel_analysis', {}),
                "red_flag_conditions": red_flag_conditions,
                "fire_behavior_forecast": fire_indices.get('fire_behavior_forecast', {}),
                "data_quality": fire_indices.get('data_quality', {}),
                "recommendations": self._generate_fire_weather_recommendations(fire_danger, red_flag_conditions, wind_speed)
            }
            
        except Exception as e:
            logger.error(f"❌ GridMET fire weather indices calculation failed: {e}")
            raise Exception(f"GridMET fire weather analysis error: {str(e)}")
    
    def _generate_fire_weather_recommendations(self, fire_danger: str, 
                                             red_flag_conditions: List[str],
                                             wind_speed: float) -> List[str]:
        """Generate fire weather recommendations"""
        
        recommendations = []
        
        if fire_danger == "Extreme":
            recommendations.append("🚨 EXTREME fire danger - avoid all outdoor burning")
            recommendations.append("🔥 Aggressive fire suppression resources recommended")
        elif fire_danger == "High":
            recommendations.append("⚠️ HIGH fire danger - restrict outdoor activities")
            recommendations.append("🚒 Enhanced fire department readiness advised")
        
        if red_flag_conditions:
            recommendations.append(f"🚩 Red Flag conditions: {', '.join(red_flag_conditions)}")
        
        if wind_speed > 25:
            recommendations.append("💨 High winds - extreme fire spread potential")
        elif wind_speed > 15:
            recommendations.append("💨 Moderate winds - increased fire spread risk")
        
        if not recommendations:
            recommendations.append("✅ Current fire weather conditions within normal range")
        
        return recommendations
    
    async def get_gridmet_forecast(self, latitude: float, longitude: float,
                                 days_ahead: int = 7) -> List[WeatherData]:
        """
        Get GridMET-based forecast data
        
        Uses GridMET service for trend-based forecasting
        """
        try:
            logger.info(f"🌤️ Getting GridMET forecast for {latitude}, {longitude}")
            
            # Get GridMET forecast
            gridmet_forecast = await self.gridmet_service.get_forecast(latitude, longitude, days_ahead)
            
            # Convert to WeatherData format
            forecast = []
            for gridmet_weather in gridmet_forecast:
                weather_data = self._convert_gridmet_to_weather_data(gridmet_weather)
                forecast.append(weather_data)
            
            logger.info(f"✅ Generated {len(forecast)} day GridMET forecast")
            return forecast
            
        except Exception as e:
            logger.error(f"❌ GridMET forecast failed: {e}")
            raise Exception(f"GridMET forecast error: {str(e)}")
    
    async def get_complete_fire_weather_analysis(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """
        Get complete fire weather analysis using GridMET data
        
        Args:
            latitude: Location latitude
            longitude: Location longitude
        
        Returns:
            Complete GridMET-enhanced fire weather analysis
            
        Raises:
            Exception: If GridMET data access fails (no fallbacks)
        """
        logger.info(f"🔥 Complete GridMET fire weather analysis for {latitude}, {longitude}")
        
        try:
            # Get current weather from GridMET
            current_weather = await self.get_current_weather(latitude, longitude)
            
            # Calculate fire weather indices
            fire_indices = await self.get_fire_weather_indices(current_weather)
            
            # Get forecast
            forecast = await self.get_gridmet_forecast(latitude, longitude, 7)
            
            # Analyze forecast trends
            forecast_analysis = self._analyze_forecast_trends(forecast)
            
            return {
                "location": {
                    "latitude": latitude,
                    "longitude": longitude
                },
                "current_weather": current_weather.to_dict(),
                "fire_weather_analysis": fire_indices,
                "forecast_analysis": forecast_analysis,
                "data_sources": ["GridMET 4km", "VPD NetCDF"],
                "analysis_timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error(f"❌ Complete GridMET fire weather analysis failed: {e}")
            raise Exception(f"GridMET fire weather analysis error: {str(e)}")
    
    def _analyze_forecast_trends(self, forecast: List[WeatherData]) -> Dict[str, Any]:
        """Analyze GridMET forecast trends for fire weather"""
        
        if not forecast:
            raise Exception("No GridMET forecast data available")
        
        # Extract trends
        temps = [w.temperature_f for w in forecast]
        humidities = [w.humidity_percent for w in forecast]
        wind_speeds = [w.wind_speed_mph for w in forecast]
        
        # GridMET-specific data trends
        vpd_values = [w.vapor_pressure_deficit_kpa for w in forecast if w.vapor_pressure_deficit_kpa is not None]
        fuel_moisture_100hr = [w.fuel_moisture_100hr for w in forecast if w.fuel_moisture_100hr is not None]
        
        analysis = {
            "temperature_trend": {
                "max": max(temps),
                "min": min(temps),
                "trend": "increasing" if temps[-1] > temps[0] else "decreasing"
            },
            "humidity_trend": {
                "max": max(humidities),
                "min": min(humidities),
                "trend": "increasing" if humidities[-1] > humidities[0] else "decreasing"
            },
            "wind_trend": {
                "max": max(wind_speeds),
                "min": min(wind_speeds),
                "trend": "increasing" if wind_speeds[-1] > wind_speeds[0] else "decreasing"
            },
            "critical_periods": self._identify_critical_periods(forecast)
        }
        
        # Add GridMET-specific trends if available
        if vpd_values:
            analysis["vpd_trend"] = {
                "max": max(vpd_values),
                "min": min(vpd_values),
                "trend": "increasing" if vpd_values[-1] > vpd_values[0] else "decreasing",
                "critical_threshold": 3.0  # kPa
            }
        
        if fuel_moisture_100hr:
            analysis["fuel_moisture_trend"] = {
                "max": max(fuel_moisture_100hr),
                "min": min(fuel_moisture_100hr),
                "trend": "increasing" if fuel_moisture_100hr[-1] > fuel_moisture_100hr[0] else "decreasing",
                "critical_threshold": 12.0  # %
            }
        
        return analysis
    
    def _identify_critical_periods(self, forecast: List[WeatherData]) -> List[Dict[str, Any]]:
        """Identify critical fire weather periods in GridMET forecast"""
        
        critical_periods = []
        
        for i, weather in enumerate(forecast):
            # Check for critical conditions
            is_critical = False
            reasons = []
            
            if weather.temperature_f > 90 and weather.humidity_percent < 20:
                is_critical = True
                reasons.append("Hot and dry conditions")
            
            if weather.wind_speed_mph > 25:
                is_critical = True
                reasons.append("High wind speeds")
            
            if weather.humidity_percent < 15:
                is_critical = True
                reasons.append("Very low humidity")
            
            # GridMET-specific critical conditions
            if weather.vapor_pressure_deficit_kpa and weather.vapor_pressure_deficit_kpa > 4.0:
                is_critical = True
                reasons.append("Extreme vapor pressure deficit (>4.0 kPa)")
            
            if weather.fuel_moisture_100hr and weather.fuel_moisture_100hr < 8:
                is_critical = True
                reasons.append("Critical fuel moisture (<8%)")
            
            if is_critical:
                critical_periods.append({
                    "hour": i,
                    "conditions": weather.to_dict(),
                    "reasons": reasons
                })
        
        return critical_periods
    
    async def close(self):
        """Close GridMET weather service"""
        await self.gridmet_service.close()


# Example usage and testing
if __name__ == "__main__":
    async def test_weather_service():
        """Test GridMET weather service"""
        
        print("🌤️ Testing GridMET Real Weather Service")
        print("=" * 60)
        
        service = RealWeatherService()
        
        # Test with Santa Clara County coordinates
        lat, lng = 37.4419, -122.1430
        
        result = await service.get_complete_fire_weather_analysis(lat, lng)
        
        print(f"\n🌤️ Weather Analysis Results:")
        print(f"Location: {result['location']}")
        print(f"Current Temperature: {result['current_weather']['temperature_f']}°F")
        print(f"Humidity: {result['current_weather']['humidity_percent']}%")
        print(f"Wind: {result['current_weather']['wind_speed_mph']} mph @ {result['current_weather']['wind_direction_deg']}°")
        print(f"Fire Danger: {result['fire_weather_analysis']['fire_danger_rating']}")
        
        if result['fire_weather_analysis'].get('recommendations'):
            print(f"\nRecommendations:")
            for rec in result['fire_weather_analysis']['recommendations']:
                print(f"  {rec}")
        
        await service.close()
    
    # Run test
    asyncio.run(test_weather_service())