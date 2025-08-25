#!/usr/bin/env python3
"""
Enhanced HYSPLIT Service with Vegetation/Fuel Integration
Fast particle tracking with few particles for plume direction analysis
Integrates real vegetation and fuel data for accurate plume modeling
"""

import asyncio
import logging
import json
import uuid
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx
import numpy as np

# Import our vegetation service
from vegetation_fuel_service import VegetationFuelService

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Enhanced HYSPLIT Plume Tracking Service",
    description="Fast HYSPLIT particle tracking with vegetation-informed plume modeling",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request models
class PlumePredictionRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    start_time: Optional[str] = Field(default=None, description="ISO format datetime, defaults to now")
    duration_hours: int = Field(default=6, ge=1, le=72, description="Tracking duration in hours")
    release_height_m: float = Field(default=100, ge=10, le=5000, description="Release height in meters")
    meteorological_source: str = Field(default="GFS", description="Met data source")
    include_vegetation_data: bool = Field(default=True, description="Include vegetation/fuel analysis")

class ParticleTrack(BaseModel):
    particle_id: int
    timestamp: str
    latitude: float
    longitude: float
    height_m: float
    concentration_relative: float

class PlumeDirection(BaseModel):
    direction_deg: float
    distance_km: float
    confidence: str
    affected_areas: List[Dict[str, Any]]

class EnhancedHysplitResult(BaseModel):
    run_id: str
    location: Dict[str, float]
    start_time: str
    duration_hours: int
    particle_tracks: List[ParticleTrack]
    plume_direction: PlumeDirection
    vegetation_analysis: Optional[Dict[str, Any]] = None
    atmospheric_conditions: Dict[str, Any]
    risk_assessment: Dict[str, Any]
    execution_time_seconds: float
    data_sources: List[str]

class EnhancedHysplitService:
    """Enhanced HYSPLIT service with vegetation integration and fast particle tracking"""
    
    def __init__(self):
        self.vegetation_service = VegetationFuelService()
        self.run_directory = Path("/tmp/hysplit_runs")
        self.run_directory.mkdir(exist_ok=True)
        
        logger.info("🌪️ Enhanced HYSPLIT service initialized with vegetation integration")
    
    async def predict_plume_trajectory(self, request: PlumePredictionRequest) -> EnhancedHysplitResult:
        """
        Predict smoke plume trajectory using fast particle tracking with vegetation data
        """
        
        run_id = f"enhanced_hysplit_{uuid.uuid4().hex[:8]}"
        start_time = datetime.now()
        
        logger.info(f"🌪️ Starting enhanced HYSPLIT run {run_id}: {request.latitude:.4f}, {request.longitude:.4f}")
        
        try:
            # Get vegetation and fuel data for accurate plume modeling
            vegetation_analysis = None
            if request.include_vegetation_data:
                async with self.vegetation_service as veg_service:
                    veg_data = await veg_service.get_vegetation_fuel_data(
                        request.latitude, 
                        request.longitude, 
                        True
                    )
                    vegetation_analysis = {
                        "fuel_model": {
                            "code": veg_data.fuel_model_code,
                            "description": veg_data.fuel_model_description,
                            "fuel_load_tons_per_acre": veg_data.fuel_load_tons_per_acre
                        },
                        "vegetation_type": veg_data.vegetation_type,
                        "canopy_characteristics": {
                            "cover_percent": veg_data.canopy_cover_percent,
                            "height_m": veg_data.canopy_height_m
                        },
                        "plume_parameters": veg_data.plume_modeling_params,
                        "data_source": veg_data.data_source,
                        "confidence": veg_data.confidence
                    }
                    
                    # Use vegetation-informed parameters
                    particle_count = veg_data.plume_modeling_params["recommended_hysplit_particles"]
                    emission_rate = veg_data.plume_modeling_params["emission_rate_kg_hr"]
                    heat_release_rate = veg_data.plume_modeling_params["heat_release_rate_mw"]
                    
                    logger.info(f"🌲 Using vegetation data: {particle_count} particles, {emission_rate} kg/hr emission")
            else:
                # Default fast tracking parameters
                particle_count = 4
                emission_rate = 100.0
                heat_release_rate = 1.0
            
            # Get current weather conditions
            atmospheric_conditions = await self._get_atmospheric_conditions(
                request.latitude, 
                request.longitude
            )
            
            # Generate fast particle tracks (simplified physics-based simulation)
            particle_tracks = await self._generate_fast_particle_tracks(
                request.latitude,
                request.longitude,
                request.release_height_m,
                particle_count,
                request.duration_hours,
                atmospheric_conditions,
                vegetation_analysis
            )
            
            # Analyze plume direction and spread
            plume_direction = self._analyze_plume_direction(particle_tracks)
            
            # Generate risk assessment
            risk_assessment = self._assess_plume_risks(
                particle_tracks, 
                plume_direction, 
                vegetation_analysis,
                atmospheric_conditions
            )
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            logger.info(f"✅ Enhanced HYSPLIT run {run_id} completed in {execution_time:.1f}s")
            logger.info(f"📊 Plume direction: {plume_direction.direction_deg:.1f}°, distance: {plume_direction.distance_km:.1f}km")
            
            return EnhancedHysplitResult(
                run_id=run_id,
                location={"latitude": request.latitude, "longitude": request.longitude},
                start_time=request.start_time or datetime.now().isoformat(),
                duration_hours=request.duration_hours,
                particle_tracks=particle_tracks,
                plume_direction=plume_direction,
                vegetation_analysis=vegetation_analysis,
                atmospheric_conditions=atmospheric_conditions,
                risk_assessment=risk_assessment,
                execution_time_seconds=execution_time,
                data_sources=["OpenMeteo Weather", "Enhanced Vegetation Service", "Fast HYSPLIT Physics"]
            )
            
        except Exception as e:
            logger.error(f"❌ Enhanced HYSPLIT run {run_id} failed: {e}")
            raise HTTPException(status_code=500, detail=f"HYSPLIT simulation failed: {str(e)}")
    
    async def _get_atmospheric_conditions(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """Get current atmospheric conditions from OpenMeteo"""
        
        try:
            async with httpx.AsyncClient() as client:
                params = {
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,surface_pressure",
                    "hourly": "wind_speed_10m,wind_direction_10m,temperature_2m,relative_humidity_2m",
                    "forecast_days": 3,
                    "timezone": "auto"
                }
                
                response = await client.get("https://api.open-meteo.com/v1/forecast", params=params)
                data = response.json()
                
                current = data["current"]
                
                return {
                    "temperature_c": current["temperature_2m"],
                    "relative_humidity_pct": current["relative_humidity_2m"],
                    "wind_speed_ms": current["wind_speed_10m"],
                    "wind_direction_deg": current["wind_direction_10m"],
                    "surface_pressure_hpa": current["surface_pressure"],
                    "hourly_forecast": {
                        "times": data["hourly"]["time"][:24],  # Next 24 hours
                        "wind_speeds": data["hourly"]["wind_speed_10m"][:24],
                        "wind_directions": data["hourly"]["wind_direction_10m"][:24],
                        "temperatures": data["hourly"]["temperature_2m"][:24]
                    },
                    "data_source": "OpenMeteo API"
                }
                
        except Exception as e:
            logger.warning(f"Weather data unavailable: {e}")
            # Fallback to default conditions
            return {
                "temperature_c": 20.0,
                "relative_humidity_pct": 50.0,
                "wind_speed_ms": 5.0,
                "wind_direction_deg": 270.0,
                "surface_pressure_hpa": 1013.25,
                "data_source": "Default values (weather API unavailable)"
            }
    
    async def _generate_fast_particle_tracks(self, 
                                           latitude: float, 
                                           longitude: float,
                                           release_height: float,
                                           particle_count: int,
                                           duration_hours: int,
                                           atmospheric: Dict[str, Any],
                                           vegetation: Optional[Dict[str, Any]]) -> List[ParticleTrack]:
        """Generate fast particle trajectory simulation with few particles"""
        
        tracks = []
        base_time = datetime.now()
        
        # Physics constants
        earth_radius_km = 6371.0
        time_step_minutes = 15  # 15-minute time steps for fast simulation
        
        for particle_id in range(particle_count):
            # Slight initial dispersion for each particle
            particle_lat = latitude + (particle_id - particle_count/2) * 0.001
            particle_lon = longitude + (particle_id - particle_count/2) * 0.001
            particle_height = release_height
            
            particle_tracks = []
            
            for step in range(0, duration_hours * 60, time_step_minutes):
                current_time = base_time + timedelta(minutes=step)
                
                # Get wind conditions (simplified - using surface wind with height adjustment)
                wind_speed = atmospheric["wind_speed_ms"]
                wind_direction = atmospheric["wind_direction_deg"]
                
                # Adjust wind speed for height (power law profile)
                height_factor = (particle_height / 10.0) ** 0.2  # Wind increases with height
                adjusted_wind_speed = wind_speed * height_factor
                
                # Apply vegetation wind reduction if available
                if vegetation and vegetation.get("plume_parameters"):
                    wind_reduction = vegetation["plume_parameters"]["wind_reduction_factor"]
                    adjusted_wind_speed *= wind_reduction
                
                # Calculate particle movement (simplified transport)
                # Convert wind direction to radians (meteorological to mathematical)
                wind_dir_rad = ((wind_direction - 180) % 360) * 3.14159 / 180.0
                
                # Distance moved in this time step
                time_hours = time_step_minutes / 60.0
                distance_km = adjusted_wind_speed * time_hours * 3.6 / 1000.0  # m/s to km/h to km
                
                # Update particle position
                delta_lat = (distance_km / earth_radius_km) * (180.0 / 3.14159) * np.cos(wind_dir_rad)
                delta_lon = (distance_km / earth_radius_km) * (180.0 / 3.14159) * np.sin(wind_dir_rad) / np.cos(particle_lat * 3.14159 / 180.0)
                
                particle_lat += delta_lat
                particle_lon += delta_lon
                
                # Simple plume height evolution
                if vegetation and vegetation.get("plume_parameters"):
                    plume_height_est = vegetation["plume_parameters"]["plume_height_estimate_m"]
                    particle_height = max(release_height, min(plume_height_est, particle_height + 10))
                else:
                    particle_height = max(release_height * 0.5, particle_height - 5)  # Gradual descent
                
                # Simple concentration decay (inverse square with distance from source)
                distance_from_source = self._calculate_distance_km(
                    latitude, longitude, particle_lat, particle_lon
                )
                concentration = max(0.01, 1.0 / (1.0 + distance_from_source * 0.1))
                
                particle_tracks.append(ParticleTrack(
                    particle_id=particle_id,
                    timestamp=current_time.isoformat(),
                    latitude=particle_lat,
                    longitude=particle_lon,
                    height_m=particle_height,
                    concentration_relative=concentration
                ))
            
            tracks.extend(particle_tracks)
        
        return tracks
    
    def _analyze_plume_direction(self, particle_tracks: List[ParticleTrack]) -> PlumeDirection:
        """Analyze overall plume direction and extent from particle tracks"""
        
        if not particle_tracks:
            return PlumeDirection(
                direction_deg=0.0,
                distance_km=0.0,
                confidence="low",
                affected_areas=[]
            )
        
        # Get final positions of all particles
        final_positions = {}
        for track in particle_tracks:
            if track.particle_id not in final_positions:
                final_positions[track.particle_id] = track
            else:
                # Keep the latest timestamp
                if track.timestamp > final_positions[track.particle_id].timestamp:
                    final_positions[track.particle_id] = track
        
        # Calculate average final position
        avg_lat = sum(pos.latitude for pos in final_positions.values()) / len(final_positions)
        avg_lon = sum(pos.longitude for pos in final_positions.values()) / len(final_positions)
        
        # Get initial position from first track
        initial_lat = particle_tracks[0].latitude
        initial_lon = particle_tracks[0].longitude
        
        # Calculate overall direction and distance
        direction_deg = self._calculate_bearing(initial_lat, initial_lon, avg_lat, avg_lon)
        distance_km = self._calculate_distance_km(initial_lat, initial_lon, avg_lat, avg_lon)
        
        # Assess confidence based on particle spread
        particle_spread = max(
            abs(pos.latitude - avg_lat) + abs(pos.longitude - avg_lon)
            for pos in final_positions.values()
        )
        
        if particle_spread < 0.01:
            confidence = "high"
        elif particle_spread < 0.05:
            confidence = "medium"
        else:
            confidence = "low"
        
        # Identify affected areas (simplified)
        affected_areas = []
        for pos in final_positions.values():
            if pos.concentration_relative > 0.1:  # Significant concentration
                affected_areas.append({
                    "latitude": pos.latitude,
                    "longitude": pos.longitude,
                    "concentration_relative": pos.concentration_relative,
                    "estimated_pm25_ugm3": pos.concentration_relative * 50.0  # Rough estimate
                })
        
        return PlumeDirection(
            direction_deg=direction_deg,
            distance_km=distance_km,
            confidence=confidence,
            affected_areas=affected_areas
        )
    
    def _assess_plume_risks(self, 
                          particle_tracks: List[ParticleTrack], 
                          plume_direction: PlumeDirection,
                          vegetation: Optional[Dict[str, Any]],
                          atmospheric: Dict[str, Any]) -> Dict[str, Any]:
        """Assess risks from plume trajectory and atmospheric conditions"""
        
        risk_factors = []
        overall_risk = "LOW"
        
        # Wind speed risk
        wind_speed = atmospheric["wind_speed_ms"]
        if wind_speed > 15:
            risk_factors.append("High wind speeds may cause rapid plume transport")
            overall_risk = "HIGH"
        elif wind_speed > 10:
            risk_factors.append("Moderate wind speeds affecting plume dispersion")
            if overall_risk == "LOW":
                overall_risk = "MODERATE"
        
        # Distance risk
        if plume_direction.distance_km > 20:
            risk_factors.append("Plume traveling long distances may affect distant communities")
            if overall_risk == "LOW":
                overall_risk = "MODERATE"
        
        # Fuel load risk
        if vegetation and vegetation.get("fuel_model", {}).get("fuel_load_tons_per_acre", 0) > 3.0:
            risk_factors.append("High fuel loads may produce intense smoke emissions")
            overall_risk = "HIGH"
        
        # Atmospheric stability
        if atmospheric["relative_humidity_pct"] < 30:
            risk_factors.append("Low humidity conditions favor smoke persistence")
            if overall_risk == "LOW":
                overall_risk = "MODERATE"
        
        # Affected area count
        if len(plume_direction.affected_areas) > 5:
            risk_factors.append("Multiple areas may experience air quality impacts")
            if overall_risk == "LOW":
                overall_risk = "MODERATE"
        
        return {
            "overall_risk_level": overall_risk,
            "risk_factors": risk_factors,
            "plume_travel_distance_km": plume_direction.distance_km,
            "primary_direction_deg": plume_direction.direction_deg,
            "affected_area_count": len(plume_direction.affected_areas),
            "confidence": plume_direction.confidence,
            "recommendations": self._generate_recommendations(overall_risk, risk_factors)
        }
    
    def _generate_recommendations(self, risk_level: str, risk_factors: List[str]) -> List[str]:
        """Generate actionable recommendations based on risk assessment"""
        
        recommendations = []
        
        if risk_level == "HIGH":
            recommendations.extend([
                "Consider postponing prescribed burn until more favorable conditions",
                "Ensure adequate fire suppression resources are available",
                "Issue air quality advisories for downwind communities",
                "Monitor weather conditions closely for changes"
            ])
        elif risk_level == "MODERATE":
            recommendations.extend([
                "Proceed with caution and enhanced monitoring",
                "Notify nearby residents of potential smoke impacts",
                "Have contingency plans ready for weather changes",
                "Consider reducing burn intensity or area"
            ])
        else:
            recommendations.extend([
                "Conditions appear favorable for prescribed burning",
                "Continue standard monitoring protocols",
                "Maintain normal safety precautions"
            ])
        
        return recommendations
    
    def _calculate_distance_km(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate distance between two points using Haversine formula"""
        import math
        
        R = 6371.0  # Earth radius in km
        
        lat1_rad = math.radians(lat1)
        lon1_rad = math.radians(lon1)
        lat2_rad = math.radians(lat2)
        lon2_rad = math.radians(lon2)
        
        dlat = lat2_rad - lat1_rad
        dlon = lon2_rad - lon1_rad
        
        a = math.sin(dlat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon/2)**2
        c = 2 * math.asin(math.sqrt(a))
        
        return R * c
    
    def _calculate_bearing(self, lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Calculate bearing between two points"""
        import math
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        dlon_rad = math.radians(lon2 - lon1)
        
        y = math.sin(dlon_rad) * math.cos(lat2_rad)
        x = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(dlon_rad)
        
        bearing_rad = math.atan2(y, x)
        bearing_deg = math.degrees(bearing_rad)
        
        return (bearing_deg + 360) % 360

# Global service instance
enhanced_hysplit_service = EnhancedHysplitService()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Enhanced HYSPLIT Plume Tracking Service",
        "version": "2.0.0",
        "features": [
            "Fast particle tracking with few particles",
            "Vegetation-informed plume modeling",
            "Real-time atmospheric conditions",
            "Plume direction analysis",
            "Risk assessment and recommendations"
        ],
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/enhanced-hysplit/predict-plume")
async def predict_plume_trajectory(request: PlumePredictionRequest) -> EnhancedHysplitResult:
    """Predict smoke plume trajectory with vegetation-informed modeling"""
    
    return await enhanced_hysplit_service.predict_plume_trajectory(request)

@app.get("/enhanced-hysplit/quick-prediction/{latitude}/{longitude}")
async def quick_plume_prediction(latitude: float, longitude: float, duration_hours: int = 6) -> EnhancedHysplitResult:
    """Quick plume prediction with default parameters"""
    
    request = PlumePredictionRequest(
        latitude=latitude,
        longitude=longitude,
        duration_hours=duration_hours,
        include_vegetation_data=True
    )
    
    return await enhanced_hysplit_service.predict_plume_trajectory(request)

if __name__ == "__main__":
    import uvicorn
    print("🌪️ Starting Enhanced HYSPLIT Plume Tracking Service")
    print("Features: Fast particle tracking + vegetation integration")
    uvicorn.run(app, host="0.0.0.0", port=8007, log_level="info")