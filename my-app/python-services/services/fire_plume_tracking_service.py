#!/usr/bin/env python3
"""
Fire Plume Tracking Service - Enhanced wildfire smoke dispersion modeling
Integrates NASA FIRMS fire detection, fast HYSPLIT modeling, and vegetation fuel data
for real-time plume tracking and movement prediction
"""

import asyncio
import json
import logging
import math
import os
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass
from enum import Enum

import httpx
import numpy as np
from pydantic import BaseModel, Field

# Import existing services
try:
    from .real_nasa_firms_service import RealNASAFIRMSService, FireDetection
    from .hysplit_service import HysplitRunRequest, LocationModel, ConcentrationPoint
    from .vegetation_service import VegetationService, BoundingBox
    from .real_weather_service import RealWeatherService
except ImportError:
    # Fallback for direct execution
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent))
    from real_nasa_firms_service import RealNASAFIRMSService, FireDetection
    from hysplit_service import HysplitRunRequest, LocationModel, ConcentrationPoint
    from vegetation_service import VegetationService, BoundingBox
    from real_weather_service import RealWeatherService

# Setup logging
logger = logging.getLogger(__name__)

class PlumeStatus(str, Enum):
    """Fire plume status"""
    ACTIVE = "active"
    DISSIPATING = "dissipating" 
    INTENSIFYING = "intensifying"
    STABLE = "stable"
    EXTINCT = "extinct"

class PlumePriority(str, Enum):
    """Plume tracking priority"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"

class PlumeParticle(BaseModel):
    """Individual particle for fast HYSPLIT tracking"""
    particle_id: str
    latitude: float
    longitude: float
    height: float = Field(..., description="Height in meters AGL")
    age_hours: float = Field(..., description="Particle age in hours")
    concentration: float = Field(..., description="Particle concentration")
    temperature: float = Field(..., description="Temperature in Celsius")
    velocity_u: float = Field(default=0.0, description="East-west velocity m/s")
    velocity_v: float = Field(default=0.0, description="North-south velocity m/s")
    velocity_w: float = Field(default=0.0, description="Vertical velocity m/s")

class PlumeTrajectory(BaseModel):
    """Plume trajectory path over time"""
    fire_id: str
    trajectory_id: str
    particles: List[PlumeParticle]
    start_time: datetime
    last_update: datetime
    duration_hours: float
    status: PlumeStatus
    priority: PlumePriority
    max_height_m: float
    max_distance_km: float
    affected_area_km2: float

class PlumeImpactZone(BaseModel):
    """Areas impacted by smoke plume"""
    zone_type: str = Field(..., description="residential, agricultural, highway, airport")
    center_lat: float
    center_lng: float
    radius_km: float
    population_affected: int
    air_quality_impact: str = Field(..., description="good, moderate, unhealthy, hazardous")
    visibility_impact_km: float
    duration_hours: float
    impact_severity: str = Field(..., description="low, medium, high, extreme")

class FirePlumeAnalysis(BaseModel):
    """Comprehensive fire plume analysis result"""
    fire_detection: FireDetection
    plume_trajectory: PlumeTrajectory
    impact_zones: List[PlumeImpactZone]
    vegetation_fuel_data: Dict[str, Any]
    weather_conditions: Dict[str, Any]
    plume_direction_degrees: float
    plume_speed_kmh: float
    estimated_duration_hours: float
    confidence_score: float
    recommendations: List[str]
    analysis_timestamp: datetime

@dataclass
class FastHysplitConfig:
    """Configuration for fast HYSPLIT modeling"""
    particle_count: int = 4  # Small number for speed
    time_step_minutes: int = 15  # 15-minute intervals
    max_duration_hours: int = 24  # Track for 24 hours
    vertical_levels: List[int] = None  # Height levels to track
    
    def __post_init__(self):
        if self.vertical_levels is None:
            self.vertical_levels = [100, 500, 1000, 2000]  # meters AGL

class FirePlumeTrackingService:
    """
    Enhanced fire plume tracking service integrating:
    - NASA FIRMS for fire detection
    - Fast HYSPLIT for particle tracking
    - Vegetation/fuel data for plume characteristics
    - Weather data for dispersion modeling
    """
    
    def __init__(self):
        # Initialize sub-services
        self.firms_service = RealNASAFIRMSService()
        self.vegetation_service = VegetationService()
        self.weather_service = RealWeatherService()
        
        # Fast HYSPLIT configuration
        self.hysplit_config = FastHysplitConfig()
        
        # HTTP client for external APIs
        self.client = httpx.AsyncClient(timeout=30.0)
        
        # Active plume tracking storage
        self.active_plumes: Dict[str, PlumeTrajectory] = {}
        
        logger.info("🔥 Fire Plume Tracking Service initialized")
    
    async def detect_and_track_fires(self, latitude: float, longitude: float,
                                   radius_km: int = 50, priority_filter: Optional[PlumePriority] = None
                                   ) -> List[FirePlumeAnalysis]:
        """
        Detect fires using NASA FIRMS and track their plumes
        
        Args:
            latitude: Center latitude for fire detection
            longitude: Center longitude for fire detection
            radius_km: Search radius in kilometers
            priority_filter: Filter by plume priority level
            
        Returns:
            List of fire plume analyses with tracking data
        """
        try:
            logger.info(f"🔍 Detecting fires near {latitude:.4f}, {longitude:.4f} (radius: {radius_km}km)")
            
            # 1. Detect active fires using NASA FIRMS
            fires = await self.firms_service.get_fires_near_point(
                latitude, longitude, radius_km, days_back=1
            )
            
            if not fires:
                logger.info("No active fires detected in the area")
                return []
            
            logger.info(f"🔥 Found {len(fires)} active fires")
            
            # 2. Analyze each fire for plume tracking
            plume_analyses = []
            for fire in fires:
                try:
                    analysis = await self._analyze_fire_plume(fire, priority_filter)
                    if analysis:
                        plume_analyses.append(analysis)
                except Exception as e:
                    logger.error(f"Error analyzing fire plume: {e}")
                    continue
            
            # 3. Sort by priority and confidence
            plume_analyses.sort(
                key=lambda x: (x.plume_trajectory.priority.value, -x.confidence_score)
            )
            
            logger.info(f"📊 Generated {len(plume_analyses)} plume analyses")
            return plume_analyses
            
        except Exception as e:
            logger.error(f"Error in fire detection and tracking: {e}")
            return []
    
    async def _analyze_fire_plume(self, fire: FireDetection, 
                                priority_filter: Optional[PlumePriority] = None
                                ) -> Optional[FirePlumeAnalysis]:
        """Analyze individual fire for plume characteristics and tracking"""
        try:
            fire_id = f"fire_{fire.latitude:.4f}_{fire.longitude:.4f}"
            logger.info(f"🔬 Analyzing plume for fire: {fire_id}")
            
            # 1. Get vegetation and fuel data around fire
            vegetation_data = await self._get_vegetation_fuel_data(
                fire.latitude, fire.longitude
            )
            
            # 2. Get current weather conditions
            weather_data = await self._get_weather_conditions(
                fire.latitude, fire.longitude
            )
            
            # 3. Calculate fire intensity and emission rate
            fire_intensity = self._calculate_fire_intensity(fire, vegetation_data)
            
            # 4. Determine plume priority
            priority = self._determine_plume_priority(fire, vegetation_data, weather_data)
            
            # Filter by priority if specified
            if priority_filter and priority != priority_filter:
                return None
            
            # 5. Run fast HYSPLIT particle tracking
            trajectory = await self._run_fast_hysplit(
                fire, fire_intensity, weather_data, priority
            )
            
            # 6. Calculate impact zones
            impact_zones = await self._calculate_impact_zones(trajectory, weather_data)
            
            # 7. Generate plume direction and movement analysis
            plume_direction, plume_speed = self._analyze_plume_movement(trajectory)
            
            # 8. Estimate plume duration
            duration = self._estimate_plume_duration(fire, vegetation_data, weather_data)
            
            # 9. Calculate confidence score
            confidence = self._calculate_confidence_score(
                fire, vegetation_data, weather_data, trajectory
            )
            
            # 10. Generate recommendations
            recommendations = self._generate_recommendations(
                fire, trajectory, impact_zones, weather_data
            )
            
            return FirePlumeAnalysis(
                fire_detection=fire,
                plume_trajectory=trajectory,
                impact_zones=impact_zones,
                vegetation_fuel_data=vegetation_data,
                weather_conditions=weather_data,
                plume_direction_degrees=plume_direction,
                plume_speed_kmh=plume_speed,
                estimated_duration_hours=duration,
                confidence_score=confidence,
                recommendations=recommendations,
                analysis_timestamp=datetime.utcnow()
            )
            
        except Exception as e:
            logger.error(f"Error analyzing fire plume: {e}")
            return None
    
    def _distance_km(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """Calculate distance between two points in kilometers using Haversine formula"""
        R = 6371  # Earth's radius in kilometers
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lng = math.radians(lng2 - lng1)
        
        a = (math.sin(delta_lat / 2) ** 2 +
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c

    def _estimate_plume_duration(self, fire: FireDetection, vegetation_data: Dict[str, Any],
                               weather_data: Dict[str, Any]) -> float:
        """Estimate total plume duration in hours"""
        base_duration = 6.0  # Base 6 hours
        
        # Adjust for fire intensity
        if hasattr(fire, 'frp') and fire.frp > 0:
            intensity_factor = min(2.0, fire.frp / 50.0)
        else:
            intensity_factor = max(0.5, (fire.brightness - 300) / 100.0)
        
        # Adjust for fuel load
        fuel_factor = vegetation_data.get("fuel_load_tons_per_acre", 15.0) / 15.0
        
        # Adjust for weather conditions
        wind_speed = weather_data.get("wind_speed_kmh", 10.0)
        humidity = weather_data.get("relative_humidity", 50.0)
        precipitation = weather_data.get("precipitation_mm", 0.0)
        
        weather_factor = 1.0
        if precipitation > 1.0:
            weather_factor *= 0.5  # Rain reduces duration
        if humidity > 80:
            weather_factor *= 0.7  # High humidity reduces duration
        if wind_speed > 20:
            weather_factor *= 1.3  # High wind extends duration
        
        duration = base_duration * intensity_factor * fuel_factor * weather_factor
        return max(2.0, min(48.0, duration))  # Clamp between 2-48 hours
    
    def _calculate_confidence_score(self, fire: FireDetection, vegetation_data: Dict[str, Any],
                                  weather_data: Dict[str, Any], trajectory: PlumeTrajectory) -> float:
        """Calculate prediction confidence score (0.0-1.0)"""
        confidence = 0.0
        
        # Fire detection confidence
        fire_conf = fire.confidence / 100.0
        confidence += fire_conf * 0.3
        
        # Weather data quality (assume good if we got data)
        if weather_data.get("wind_speed_kmh") is not None:
            confidence += 0.25
        
        # Vegetation data quality
        if vegetation_data.get("fuel_load_tons_per_acre") is not None:
            confidence += 0.2
        
        # Trajectory particle count
        particle_factor = min(1.0, len(trajectory.particles) / 4.0)
        confidence += particle_factor * 0.25
        
        return min(1.0, confidence)
    
    def _generate_recommendations(self, fire: FireDetection, trajectory: PlumeTrajectory,
                                impact_zones: List[PlumeImpactZone], weather_data: Dict[str, Any]
                                ) -> List[str]:
        """Generate actionable recommendations based on plume analysis"""
        recommendations = []
        
        # Priority-based recommendations
        if trajectory.priority == PlumePriority.CRITICAL:
            recommendations.append("🚨 CRITICAL: Immediate evacuation may be necessary for affected areas")
            recommendations.append("Deploy all available firefighting resources")
            recommendations.append("Establish incident command structure")
        elif trajectory.priority == PlumePriority.HIGH:
            recommendations.append("⚠️  HIGH PRIORITY: Monitor closely and prepare evacuation plans")
            recommendations.append("Deploy additional firefighting resources")
        
        # Weather-based recommendations
        wind_speed = weather_data.get("wind_speed_kmh", 0)
        if wind_speed > 25:
            recommendations.append(f"High winds ({wind_speed:.1f} km/h) - expect rapid plume movement")
            recommendations.append("Ground aircraft operations may be limited")
        
        humidity = weather_data.get("relative_humidity", 100)
        if humidity < 30:
            recommendations.append(f"Low humidity ({humidity:.1f}%) increases fire behavior")
            recommendations.append("Increase suppression foam concentrate ratio")
        
        precipitation = weather_data.get("precipitation_mm", 0)
        if precipitation > 0:
            recommendations.append(f"Precipitation ({precipitation:.1f}mm) may help suppress fire")
        
        # Impact zone recommendations
        if len(impact_zones) > 0:
            total_population = sum(zone.population_affected for zone in impact_zones)
            if total_population > 1000:
                recommendations.append(f"Large population at risk ({total_population:,}) - coordinate with emergency services")
        
        # Air quality recommendations
        recommendations.append("Issue air quality alerts for affected areas")
        recommendations.append("Advise sensitive individuals to stay indoors")
        
        # Visibility recommendations
        recommendations.append("Monitor highway visibility and issue travel advisories if needed")
        
        return recommendations[:10]  # Limit to top 10 recommendations
    
    def _distance_km(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """Calculate distance between two points in kilometers using Haversine formula"""
        R = 6371  # Earth's radius in kilometers
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        delta_lat = math.radians(lat2 - lat1)
        delta_lng = math.radians(lng2 - lng1)
        
        a = (math.sin(delta_lat / 2) ** 2 +
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lng / 2) ** 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        
        return R * c
    
    async def get_plume_forecast(self, fire_lat: float, fire_lng: float,
                               hours_ahead: int = 12) -> Dict[str, Any]:
        """Get plume movement forecast for specified hours ahead"""
        try:
            # Get weather forecast
            forecast_data = await self.weather_service.get_weather_forecast(
                fire_lat, fire_lng
            )
            
            forecast_points = []
            current_lat, current_lng = fire_lat, fire_lng
            
            for hour in range(min(hours_ahead, len(forecast_data))):
                hour_weather = forecast_data[hour]
                
                # Calculate plume movement for this hour
                wind_speed_ms = hour_weather.get("wind_speed_10m", 10.0) / 3.6
                wind_direction = hour_weather.get("wind_direction_10m", 270.0)
                
                # Calculate new position
                distance_m = wind_speed_ms * 3600  # Distance in 1 hour
                bearing_rad = math.radians(wind_direction)
                
                # Calculate new lat/lng
                lat_per_meter = 1.0 / 111320.0
                lng_per_meter = 1.0 / (111320.0 * math.cos(math.radians(current_lat)))
                
                delta_lat = distance_m * math.cos(bearing_rad) * lat_per_meter
                delta_lng = distance_m * math.sin(bearing_rad) * lng_per_meter
                
                current_lat += delta_lat
                current_lng += delta_lng
                
                forecast_points.append({
                    "hour": hour + 1,
                    "latitude": current_lat,
                    "longitude": current_lng,
                    "wind_speed_kmh": hour_weather.get("wind_speed_10m", 10.0),
                    "wind_direction": wind_direction,
                    "temperature": hour_weather.get("temperature_2m", 20.0),
                    "humidity": hour_weather.get("relative_humidity_2m", 50.0)
                })
            
            return {
                "fire_location": {"latitude": fire_lat, "longitude": fire_lng},
                "forecast_hours": hours_ahead,
                "plume_forecast": forecast_points,
                "generated_at": datetime.utcnow().isoformat()
            }
            
        except Exception as e:
            logger.error(f"Error generating plume forecast: {e}")
            return {"error": str(e)}
    
    async def close(self):
        """Close service resources"""
        await self.client.aclose()
        await self.firms_service.close()

# Test function
async def test_fire_plume_tracking():
    """Test fire plume tracking functionality"""
    service = FirePlumeTrackingService()
    
    try:
        # Test fire detection and plume tracking
        print("🔍 Testing fire detection and plume tracking...")
        analyses = await service.detect_and_track_fires(
            latitude=37.4275,  # Stanford area
            longitude=-122.1697,
            radius_km=50
        )
        
        if analyses:
            print(f"\n🔥 Found {len(analyses)} fire plume analyses:")
            for i, analysis in enumerate(analyses[:3]):
                print(f"\n--- Fire {i+1} ---")
                print(f"Location: {analysis.fire_detection.latitude:.4f}, {analysis.fire_detection.longitude:.4f}")
                print(f"Priority: {analysis.plume_trajectory.priority.value}")
                print(f"Status: {analysis.plume_trajectory.status.value}")
                print(f"Plume Direction: {analysis.plume_direction_degrees:.1f}°")
                print(f"Plume Speed: {analysis.plume_speed_kmh:.1f} km/h")
                print(f"Max Distance: {analysis.plume_trajectory.max_distance_km:.1f} km")
                print(f"Affected Area: {analysis.plume_trajectory.affected_area_km2:.1f} km²")
                print(f"Impact Zones: {len(analysis.impact_zones)}")
                print(f"Duration: {analysis.estimated_duration_hours:.1f} hours")
                print(f"Confidence: {analysis.confidence_score:.2f}")
                print(f"Particles: {len(analysis.plume_trajectory.particles)}")
                print(f"Top Recommendations:")
                for rec in analysis.recommendations[:3]:
                    print(f"  • {rec}")
        else:
            print("No active fires detected in the test area")
        
        # Test plume forecast
        print("\n🔮 Testing plume forecast...")
        forecast = await service.get_plume_forecast(
            fire_lat=37.4275,
            fire_lng=-122.1697,
            hours_ahead=6
        )
        
        if "error" not in forecast:
            print(f"Generated {len(forecast['plume_forecast'])} hour forecast")
            for point in forecast['plume_forecast'][:3]:
                print(f"  Hour {point['hour']}: {point['latitude']:.4f}, {point['longitude']:.4f} (Wind: {point['wind_speed_kmh']:.1f} km/h)")
        
    except Exception as e:
        logger.error(f"Test error: {e}")
    finally:
        await service.close()

if __name__ == "__main__":
    asyncio.run(test_fire_plume_tracking())
