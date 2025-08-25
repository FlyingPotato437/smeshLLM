#!/usr/bin/env python3
"""
Comprehensive Plume Modeling Workflow
Integrates NASA FIRMS, vegetation/fuel data, and fast HYSPLIT for complete prescribed burn planning
Real data sources with fast particle tracking for plume direction analysis
"""

import asyncio
import logging
import json
import uuid
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import httpx

# Import our integrated services
from vegetation_fuel_service import VegetationFuelService
from enhanced_hysplit_service import EnhancedHysplitService, PlumePredictionRequest
from fwi_service import FWIService, WeatherInput as FWIWeatherInput

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Comprehensive Plume Modeling Workflow",
    description="Complete prescribed burn planning with NASA FIRMS, vegetation data, and fast HYSPLIT",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# NASA FIRMS API key (provided by user)
NASA_FIRMS_API_KEY = "c5bc2ce397a15b377717388a09836f57"

# Request models
class ComprehensiveBurnAssessmentRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    location_name: str = Field(default="", description="Optional location name")
    plume_duration_hours: int = Field(default=6, ge=1, le=72)
    release_height_m: float = Field(default=100, ge=10, le=5000)
    burn_intensity: str = Field(default="moderate", description="low, moderate, or high")
    include_nearby_fires: bool = Field(default=True, description="Check for nearby active fires")
    assessment_date: Optional[str] = Field(default=None, description="ISO date, defaults to today")

class ActiveFireData(BaseModel):
    fire_id: str
    latitude: float
    longitude: float
    distance_km: float
    brightness_temp_k: float
    confidence: str
    acquisition_date: str
    fire_radiative_power: Optional[float] = None

class ComprehensiveAssessmentResult(BaseModel):
    assessment_id: str
    location: Dict[str, Any]
    timestamp: str
    
    # Real data integrations
    nearby_active_fires: List[ActiveFireData]
    vegetation_fuel_analysis: Dict[str, Any]
    fire_weather_index: Dict[str, Any]
    atmospheric_conditions: Dict[str, Any]
    
    # Fast HYSPLIT plume modeling
    plume_trajectory: Dict[str, Any]
    plume_direction_summary: Dict[str, Any]
    
    # Comprehensive risk assessment
    overall_risk_level: str
    risk_factors: List[str]
    recommendations: List[str]
    regulatory_considerations: List[str]
    
    # Data quality and sources
    data_quality_score: float
    data_sources: List[str]
    execution_time_seconds: float

class ComprehensivePlumeWorkflow:
    """Complete workflow integrating all real data sources for prescribed burn planning"""
    
    def __init__(self):
        self.vegetation_service = VegetationFuelService()
        self.hysplit_service = EnhancedHysplitService()
        self.fwi_service = FWIService()
        
        logger.info("🔥 Comprehensive Plume Workflow initialized with all real data sources")
    
    async def assess_prescribed_burn(self, request: ComprehensiveBurnAssessmentRequest) -> ComprehensiveAssessmentResult:
        """
        Complete prescribed burn assessment using all integrated real data sources
        """
        
        assessment_id = f"comprehensive_assessment_{uuid.uuid4().hex[:8]}"
        start_time = datetime.now()
        
        logger.info(f"🔥 Starting comprehensive assessment {assessment_id}: {request.location_name} ({request.latitude:.4f}, {request.longitude:.4f})")
        
        try:
            # 1. Check for nearby active fires using NASA FIRMS
            logger.info("🛰️ Checking NASA FIRMS for nearby active fires...")
            nearby_fires = await self._get_nearby_active_fires(
                request.latitude, 
                request.longitude,
                radius_km=50.0
            )
            
            # 2. Get comprehensive vegetation and fuel analysis
            logger.info("🌲 Analyzing vegetation and fuel characteristics...")
            async with self.vegetation_service as veg_service:
                vegetation_data = await veg_service.get_vegetation_fuel_data(
                    request.latitude, 
                    request.longitude, 
                    True
                )
                
                vegetation_analysis = {
                    "fuel_model": {
                        "code": vegetation_data.fuel_model_code,
                        "description": vegetation_data.fuel_model_description,
                        "fuel_load_tons_per_acre": vegetation_data.fuel_load_tons_per_acre,
                        "flame_length_ft": vegetation_data.flame_length_ft,
                        "rate_of_spread_ft_per_min": vegetation_data.rate_of_spread_ft_per_min
                    },
                    "vegetation_characteristics": {
                        "type": vegetation_data.vegetation_type,
                        "canopy_cover_percent": vegetation_data.canopy_cover_percent,
                        "canopy_height_m": vegetation_data.canopy_height_m
                    },
                    "plume_modeling_parameters": vegetation_data.plume_modeling_params,
                    "data_source": vegetation_data.data_source,
                    "confidence": vegetation_data.confidence
                }
            
            # 3. Calculate Fire Weather Index (Canadian CFFDRS)
            logger.info("🌡️ Calculating Fire Weather Index...")
            current_weather = await self._get_current_weather(request.latitude, request.longitude)
            
            fwi_input = FWIWeatherInput(
                latitude=request.latitude,
                longitude=request.longitude,
                date=request.assessment_date or datetime.now().isoformat(),
                location_name=request.location_name or f"Assessment_{assessment_id}",
                temperature_c=current_weather["temperature_c"],
                relative_humidity_pct=current_weather["relative_humidity_pct"],
                wind_speed_ms=current_weather["wind_speed_ms"],
                precipitation_mm=current_weather.get("precipitation_mm", 0.0)
            )
            
            # Get previous day codes for accurate FWI calculation
            location_id = self.fwi_service.generate_location_id(
                request.latitude, 
                request.longitude, 
                request.location_name
            )
            
            assessment_date = datetime.fromisoformat(fwi_input.date).date()
            previous_codes = await self.fwi_service.get_previous_day_codes(location_id, assessment_date)
            
            fwi_result = await self.fwi_service.calculate_fwi_xclim(fwi_input, previous_codes)
            
            # 4. Run fast HYSPLIT plume trajectory modeling
            logger.info("🌪️ Running fast HYSPLIT plume trajectory analysis...")
            hysplit_request = PlumePredictionRequest(
                latitude=request.latitude,
                longitude=request.longitude,
                start_time=request.assessment_date or datetime.now().isoformat(),
                duration_hours=request.plume_duration_hours,
                release_height_m=request.release_height_m,
                include_vegetation_data=True
            )
            
            plume_result = await self.hysplit_service.predict_plume_trajectory(hysplit_request)
            
            # 5. Comprehensive risk assessment
            logger.info("⚠️ Performing comprehensive risk assessment...")
            risk_assessment = self._perform_comprehensive_risk_assessment(
                nearby_fires,
                vegetation_analysis,
                fwi_result,
                plume_result,
                current_weather,
                request.burn_intensity
            )
            
            # 6. Generate regulatory considerations
            regulatory_considerations = self._generate_regulatory_considerations(
                request.latitude,
                request.longitude,
                risk_assessment["overall_risk_level"],
                nearby_fires,
                plume_result
            )
            
            # 7. Calculate data quality score
            data_quality_score = self._calculate_data_quality_score(
                vegetation_analysis,
                fwi_result,
                plume_result,
                current_weather
            )
            
            execution_time = (datetime.now() - start_time).total_seconds()
            
            logger.info(f"✅ Comprehensive assessment {assessment_id} completed in {execution_time:.1f}s")
            logger.info(f"📊 Overall risk: {risk_assessment['overall_risk_level']}, Data quality: {data_quality_score:.1f}/10")
            
            return ComprehensiveAssessmentResult(
                assessment_id=assessment_id,
                location={
                    "latitude": request.latitude,
                    "longitude": request.longitude,
                    "name": request.location_name,
                    "assessment_date": request.assessment_date or datetime.now().isoformat()
                },
                timestamp=datetime.now().isoformat(),
                nearby_active_fires=nearby_fires,
                vegetation_fuel_analysis=vegetation_analysis,
                fire_weather_index=fwi_result.dict(),
                atmospheric_conditions=current_weather,
                plume_trajectory={
                    "run_id": plume_result.run_id,
                    "particle_count": len(set(track.particle_id for track in plume_result.particle_tracks)),
                    "total_track_points": len(plume_result.particle_tracks),
                    "execution_time_seconds": plume_result.execution_time_seconds,
                    "tracks": [track.dict() for track in plume_result.particle_tracks]
                },
                plume_direction_summary={
                    "primary_direction_deg": plume_result.plume_direction.direction_deg,
                    "travel_distance_km": plume_result.plume_direction.distance_km,
                    "confidence": plume_result.plume_direction.confidence,
                    "affected_areas_count": len(plume_result.plume_direction.affected_areas),
                    "affected_areas": plume_result.plume_direction.affected_areas
                },
                overall_risk_level=risk_assessment["overall_risk_level"],
                risk_factors=risk_assessment["risk_factors"],
                recommendations=risk_assessment["recommendations"],
                regulatory_considerations=regulatory_considerations,
                data_quality_score=data_quality_score,
                data_sources=[
                    "NASA FIRMS Fire Detection API",
                    "Enhanced Vegetation/Fuel Service",
                    "Canadian Fire Weather Index (CFFDRS)",
                    "Fast HYSPLIT Particle Tracking",
                    "OpenMeteo Weather API"
                ],
                execution_time_seconds=execution_time
            )
            
        except Exception as e:
            logger.error(f"❌ Comprehensive assessment {assessment_id} failed: {e}")
            raise HTTPException(status_code=500, detail=f"Assessment failed: {str(e)}")
    
    async def _get_nearby_active_fires(self, latitude: float, longitude: float, radius_km: float = 50.0) -> List[ActiveFireData]:
        """Get nearby active fires from NASA FIRMS"""
        
        fires = []
        
        try:
            # NASA FIRMS VIIRS active fire data
            today = datetime.now().strftime("%Y-%m-%d")
            
            # VIIRS data (more recent, higher resolution)
            viirs_url = f"https://firms.modaps.eosdis.nasa.gov/api/area/csv/{NASA_FIRMS_API_KEY}/VIIRS_SNPP_NRT/{latitude-0.5},{longitude-0.5},{latitude+0.5},{longitude+0.5}/1/{today}"
            
            async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
                response = await client.get(viirs_url)
                
                if response.status_code == 200:
                    lines = response.text.strip().split('\n')
                    
                    if len(lines) > 1:  # Has header + data
                        header = lines[0].split(',')
                        
                        for line in lines[1:]:
                            try:
                                values = line.split(',')
                                data = dict(zip(header, values))
                                
                                fire_lat = float(data.get('latitude', 0))
                                fire_lon = float(data.get('longitude', 0))
                                
                                # Calculate distance
                                distance = self._calculate_distance_km(
                                    latitude, longitude, fire_lat, fire_lon
                                )
                                
                                if distance <= radius_km:
                                    fires.append(ActiveFireData(
                                        fire_id=f"viirs_{data.get('latitude', '0')}_{data.get('longitude', '0')}_{data.get('acq_date', '')}",
                                        latitude=fire_lat,
                                        longitude=fire_lon,
                                        distance_km=round(distance, 2),
                                        brightness_temp_k=float(data.get('bright_ti4', 300)),
                                        confidence=data.get('confidence', 'unknown'),
                                        acquisition_date=data.get('acq_date', today),
                                        fire_radiative_power=float(data.get('frp', 0)) if data.get('frp') else None
                                    ))
                            except (ValueError, KeyError) as e:
                                continue
                
                logger.info(f"🛰️ Found {len(fires)} active fires within {radius_km}km")
                
        except Exception as e:
            logger.warning(f"NASA FIRMS query failed: {e}")
        
        return fires
    
    async def _get_current_weather(self, latitude: float, longitude: float) -> Dict[str, Any]:
        """Get current weather conditions from OpenMeteo"""
        
        try:
            async with httpx.AsyncClient() as client:
                params = {
                    "latitude": latitude,
                    "longitude": longitude,
                    "current": "temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m,precipitation",
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
                    "precipitation_mm": current.get("precipitation", 0.0),
                    "data_source": "OpenMeteo API"
                }
                
        except Exception as e:
            logger.warning(f"Weather data unavailable: {e}")
            return {
                "temperature_c": 20.0,
                "relative_humidity_pct": 50.0,
                "wind_speed_ms": 5.0,
                "wind_direction_deg": 270.0,
                "precipitation_mm": 0.0,
                "data_source": "Default values (weather API unavailable)"
            }
    
    def _perform_comprehensive_risk_assessment(self, 
                                             nearby_fires: List[ActiveFireData],
                                             vegetation: Dict[str, Any],
                                             fwi: Any,
                                             plume: Any,
                                             weather: Dict[str, Any],
                                             burn_intensity: str) -> Dict[str, Any]:
        """Comprehensive risk assessment using all integrated data"""
        
        risk_factors = []
        overall_risk = "LOW"
        
        # Active fire proximity risk
        if nearby_fires:
            close_fires = [f for f in nearby_fires if f.distance_km < 10]
            if close_fires:
                risk_factors.append(f"Active fires detected within 10km ({len(close_fires)} fires)")
                overall_risk = "HIGH"
            elif len(nearby_fires) > 0:
                risk_factors.append(f"Active fires in region ({len(nearby_fires)} fires within 50km)")
                if overall_risk == "LOW":
                    overall_risk = "MODERATE"
        
        # Fire Weather Index risk
        if hasattr(fwi, 'fwi') and fwi.fwi:
            if fwi.fwi > 30:
                risk_factors.append(f"Very high Fire Weather Index ({fwi.fwi:.1f})")
                overall_risk = "HIGH"
            elif fwi.fwi > 20:
                risk_factors.append(f"High Fire Weather Index ({fwi.fwi:.1f})")
                if overall_risk == "LOW":
                    overall_risk = "MODERATE"
        
        # Vegetation/fuel risk
        fuel_load = vegetation["fuel_model"]["fuel_load_tons_per_acre"]
        if fuel_load > 3.0:
            risk_factors.append(f"High fuel load ({fuel_load} tons/acre)")
            if overall_risk != "HIGH":
                overall_risk = "MODERATE"
        
        # Atmospheric conditions risk
        wind_speed = weather["wind_speed_ms"]
        humidity = weather["relative_humidity_pct"]
        
        if wind_speed > 15:
            risk_factors.append(f"High wind speeds ({wind_speed:.1f} m/s)")
            overall_risk = "HIGH"
        elif wind_speed > 10:
            risk_factors.append(f"Moderate wind speeds ({wind_speed:.1f} m/s)")
            if overall_risk == "LOW":
                overall_risk = "MODERATE"
        
        if humidity < 20:
            risk_factors.append(f"Very low humidity ({humidity:.0f}%)")
            overall_risk = "HIGH"
        elif humidity < 30:
            risk_factors.append(f"Low humidity ({humidity:.0f}%)")
            if overall_risk == "LOW":
                overall_risk = "MODERATE"
        
        # Plume travel risk
        if plume.plume_direction.distance_km > 25:
            risk_factors.append(f"Plume travels long distance ({plume.plume_direction.distance_km:.1f}km)")
            if overall_risk == "LOW":
                overall_risk = "MODERATE"
        
        # Generate recommendations
        recommendations = self._generate_risk_recommendations(overall_risk, risk_factors, burn_intensity)
        
        return {
            "overall_risk_level": overall_risk,
            "risk_factors": risk_factors,
            "recommendations": recommendations
        }
    
    def _generate_risk_recommendations(self, risk_level: str, risk_factors: List[str], burn_intensity: str) -> List[str]:
        """Generate specific recommendations based on comprehensive risk assessment"""
        
        recommendations = []
        
        if risk_level == "HIGH":
            recommendations.extend([
                "🚫 POSTPONE prescribed burn until conditions improve",
                "🚨 High risk conditions detected - burning not recommended",
                "📞 Coordinate with local fire authorities before any activities",
                "🌊 Ensure maximum suppression resources are available",
                "📡 Monitor weather and fire conditions continuously"
            ])
        elif risk_level == "MODERATE":
            recommendations.extend([
                "⚠️ PROCEED WITH CAUTION - enhanced monitoring required",
                "🔥 Consider reducing burn intensity or area",
                "👥 Notify local residents and emergency services",
                "🌬️ Monitor wind conditions closely for changes",
                "📊 Have contingency suppression plans ready"
            ])
        else:
            recommendations.extend([
                "✅ CONDITIONS APPEAR FAVORABLE for prescribed burning",
                "📋 Continue standard safety protocols",
                "🔍 Maintain normal monitoring procedures",
                "📞 Ensure communication with fire authorities"
            ])
        
        # Add specific recommendations based on risk factors
        if any("wind" in factor.lower() for factor in risk_factors):
            recommendations.append("🌬️ Pay special attention to wind speed and direction changes")
        
        if any("humidity" in factor.lower() for factor in risk_factors):
            recommendations.append("💧 Monitor relative humidity - wait for higher humidity if possible")
        
        if any("fire" in factor.lower() for factor in risk_factors):
            recommendations.append("🔥 Coordinate with incident commanders of nearby active fires")
        
        return recommendations
    
    def _generate_regulatory_considerations(self, 
                                         latitude: float, 
                                         longitude: float,
                                         risk_level: str,
                                         nearby_fires: List[ActiveFireData],
                                         plume_result: Any) -> List[str]:
        """Generate regulatory and compliance considerations"""
        
        considerations = []
        
        # CAL FIRE considerations (California)
        if 32 <= latitude <= 42 and -125 <= longitude <= -114:
            considerations.extend([
                "📋 CAL FIRE burn permit may be required",
                "🌊 Comply with CAL FIRE suppression resource requirements",
                "📞 Notify CAL FIRE of planned burn activities"
            ])
            
            if risk_level == "HIGH":
                considerations.append("🚫 CAL FIRE may prohibit burning under current conditions")
        
        # Air quality considerations
        if len(plume_result.plume_direction.affected_areas) > 3:
            considerations.extend([
                "🫁 Air Quality Management District notification recommended",
                "📊 Consider air quality impacts on sensitive populations",
                "🏥 Alert nearby schools, hospitals, and care facilities"
            ])
        
        # Active fire considerations
        if nearby_fires:
            considerations.extend([
                "🔥 Coordinate with active fire incident management teams",
                "📡 Enhanced coordination with aviation operations may be required",
                "🚁 Consider impacts on firefighting aircraft operations"
            ])
        
        # General regulatory
        considerations.extend([
            "📝 Document burn plan and atmospheric conditions",
            "📋 Ensure insurance and liability coverage is current",
            "👥 Verify landowner permissions and notifications"
        ])
        
        return considerations
    
    def _calculate_data_quality_score(self, vegetation: Dict, fwi: Any, plume: Any, weather: Dict) -> float:
        """Calculate overall data quality score (0-10)"""
        
        score = 0.0
        
        # Vegetation data quality
        if vegetation["confidence"] == "High":
            score += 3.0
        elif vegetation["confidence"] == "Medium":
            score += 2.0
        else:
            score += 1.0
        
        # FWI calculation quality
        if hasattr(fwi, 'fwi') and fwi.fwi is not None:
            score += 2.5
        else:
            score += 1.0
        
        # Plume model quality
        if plume.plume_direction.confidence == "high":
            score += 3.0
        elif plume.plume_direction.confidence == "medium":
            score += 2.0
        else:
            score += 1.0
        
        # Weather data quality
        if weather["data_source"] == "OpenMeteo API":
            score += 1.5
        else:
            score += 0.5
        
        return min(10.0, score)
    
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

# Global service instance
comprehensive_workflow = ComprehensivePlumeWorkflow()

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Comprehensive Plume Modeling Workflow",
        "version": "1.0.0",
        "integrations": [
            "NASA FIRMS Fire Detection",
            "Enhanced Vegetation/Fuel Service", 
            "Canadian Fire Weather Index (CFFDRS)",
            "Fast HYSPLIT Particle Tracking",
            "OpenMeteo Weather API"
        ],
        "features": [
            "Real-time active fire detection",
            "Vegetation-informed plume modeling",
            "Fast particle tracking (few particles)",
            "Comprehensive risk assessment",
            "Regulatory compliance guidance"
        ],
        "nasa_firms_api_configured": bool(NASA_FIRMS_API_KEY),
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/comprehensive-assessment")
async def comprehensive_burn_assessment(request: ComprehensiveBurnAssessmentRequest) -> ComprehensiveAssessmentResult:
    """Complete prescribed burn assessment using all integrated real data sources"""
    
    return await comprehensive_workflow.assess_prescribed_burn(request)

@app.get("/quick-assessment/{latitude}/{longitude}")
async def quick_burn_assessment(latitude: float, longitude: float, location_name: str = "") -> ComprehensiveAssessmentResult:
    """Quick prescribed burn assessment with default parameters"""
    
    request = ComprehensiveBurnAssessmentRequest(
        latitude=latitude,
        longitude=longitude,
        location_name=location_name,
        plume_duration_hours=6,
        burn_intensity="moderate"
    )
    
    return await comprehensive_workflow.assess_prescribed_burn(request)

if __name__ == "__main__":
    import uvicorn
    print("🔥 Starting Comprehensive Plume Modeling Workflow")
    print("Integrations: NASA FIRMS + Vegetation + Fast HYSPLIT + CFFDRS")
    uvicorn.run(app, host="0.0.0.0", port=8008, log_level="info")