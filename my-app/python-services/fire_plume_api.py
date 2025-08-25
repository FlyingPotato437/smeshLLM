#!/usr/bin/env python3
"""
Fire Plume Tracking API - REST API for enhanced wildfire smoke dispersion modeling
Integrates NASA FIRMS, fast HYSPLIT, vegetation fuel data for real-time plume tracking
"""

import asyncio
import json
import logging
import os
from datetime import datetime
from typing import Dict, List, Optional, Any

from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Import our services
from services.fire_plume_tracking_service import (
    FirePlumeTrackingService, 
    FirePlumeAnalysis,
    PlumePriority,
    PlumeStatus
)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="SmeshLLM Fire Plume Tracking API",
    description="Real-time wildfire smoke plume tracking and dispersion modeling",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global service instance
fire_plume_service = None

@app.on_event("startup")
async def startup_event():
    """Initialize services on startup"""
    global fire_plume_service
    fire_plume_service = FirePlumeTrackingService()
    logger.info("🔥 Fire Plume Tracking API started")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup services on shutdown"""
    global fire_plume_service
    if fire_plume_service:
        await fire_plume_service.close()
    logger.info("🔥 Fire Plume Tracking API stopped")

# Request/Response Models
class FireDetectionRequest(BaseModel):
    """Request for fire detection and plume tracking"""
    latitude: float = Field(..., ge=-90, le=90, description="Center latitude")
    longitude: float = Field(..., ge=-180, le=180, description="Center longitude")
    radius_km: int = Field(50, ge=1, le=500, description="Search radius in kilometers")
    priority_filter: Optional[str] = Field(None, description="Filter by priority: critical, high, medium, low")
    include_forecast: bool = Field(True, description="Include plume movement forecast")
    forecast_hours: int = Field(12, ge=1, le=48, description="Forecast hours ahead")

class PlumeParticleResponse(BaseModel):
    """Plume particle response model"""
    particle_id: str
    latitude: float
    longitude: float
    height: float
    age_hours: float
    concentration: float
    temperature: float
    velocity_u: float
    velocity_v: float
    velocity_w: float

class PlumeTrajectoryResponse(BaseModel):
    """Plume trajectory response model"""
    fire_id: str
    trajectory_id: str
    particles: List[PlumeParticleResponse]
    start_time: str
    last_update: str
    duration_hours: float
    status: str
    priority: str
    max_height_m: float
    max_distance_km: float
    affected_area_km2: float

class PlumeImpactZoneResponse(BaseModel):
    """Plume impact zone response model"""
    zone_type: str
    center_lat: float
    center_lng: float
    radius_km: float
    population_affected: int
    air_quality_impact: str
    visibility_impact_km: float
    duration_hours: float
    impact_severity: str

class FireDetectionResponse(BaseModel):
    """Fire detection response model"""
    latitude: float
    longitude: float
    brightness: float
    confidence: int
    acquisition_date: str
    acquisition_time: str
    satellite: str
    instrument: str
    frp: float
    daynight: str

class FirePlumeAnalysisResponse(BaseModel):
    """Complete fire plume analysis response"""
    fire_detection: FireDetectionResponse
    plume_trajectory: PlumeTrajectoryResponse
    impact_zones: List[PlumeImpactZoneResponse]
    vegetation_fuel_data: Dict[str, Any]
    weather_conditions: Dict[str, Any]
    plume_direction_degrees: float
    plume_speed_kmh: float
    estimated_duration_hours: float
    confidence_score: float
    recommendations: List[str]
    analysis_timestamp: str
    forecast: Optional[Dict[str, Any]] = None

class FireDetectionListResponse(BaseModel):
    """Response for fire detection and tracking"""
    success: bool
    message: str
    fire_count: int
    analyses: List[FirePlumeAnalysisResponse]
    generated_at: str
    processing_time_ms: float

class PlumeForecastResponse(BaseModel):
    """Plume movement forecast response"""
    success: bool
    fire_location: Dict[str, float]
    forecast_hours: int
    plume_forecast: List[Dict[str, Any]]
    generated_at: str

# API Endpoints

@app.get("/", response_model=Dict[str, str])
async def root():
    """API root endpoint"""
    return {
        "service": "SmeshLLM Fire Plume Tracking API",
        "version": "1.0.0",
        "status": "operational",
        "nasa_firms_integrated": "true",
        "hysplit_integrated": "true",
        "vegetation_data_integrated": "true",
        "docs": "/docs",
        "health": "/health"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    try:
        # Test service availability
        if fire_plume_service is None:
            raise Exception("Fire plume service not initialized")
        
        return {
            "status": "healthy",
            "timestamp": datetime.utcnow().isoformat(),
            "services": {
                "fire_plume_tracking": "operational",
                "nasa_firms": "operational",
                "hysplit": "operational",
                "vegetation_analysis": "operational",
                "weather_service": "operational"
            }
        }
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service unhealthy: {str(e)}")

@app.post("/detect-fires", response_model=FireDetectionListResponse)
async def detect_fires(request: FireDetectionRequest):
    """
    Detect active fires and analyze smoke plume dispersion
    
    This endpoint:
    1. Uses NASA FIRMS API to detect active fires
    2. Runs fast HYSPLIT particle tracking for plume movement
    3. Analyzes vegetation and fuel data for fire characteristics
    4. Generates impact zones and recommendations
    5. Optionally includes plume movement forecast
    """
    start_time = datetime.utcnow()
    
    try:
        # Validate priority filter
        priority_filter = None
        if request.priority_filter:
            try:
                priority_filter = PlumePriority(request.priority_filter.lower())
            except ValueError:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Invalid priority filter. Use: critical, high, medium, low"
                )
        
        # Detect fires and analyze plumes
        analyses = await fire_plume_service.detect_and_track_fires(
            latitude=request.latitude,
            longitude=request.longitude,
            radius_km=request.radius_km,
            priority_filter=priority_filter
        )
        
        # Convert analyses to response format
        analysis_responses = []
        for analysis in analyses:
            # Convert fire detection
            fire_response = FireDetectionResponse(
                latitude=analysis.fire_detection.latitude,
                longitude=analysis.fire_detection.longitude,
                brightness=analysis.fire_detection.brightness,
                confidence=analysis.fire_detection.confidence,
                acquisition_date=analysis.fire_detection.acquisition_date,
                acquisition_time=analysis.fire_detection.acquisition_time,
                satellite=analysis.fire_detection.satellite,
                instrument=analysis.fire_detection.instrument,
                frp=analysis.fire_detection.frp,
                daynight=analysis.fire_detection.daynight
            )
            
            # Convert particles
            particle_responses = [
                PlumeParticleResponse(
                    particle_id=p.particle_id,
                    latitude=p.latitude,
                    longitude=p.longitude,
                    height=p.height,
                    age_hours=p.age_hours,
                    concentration=p.concentration,
                    temperature=p.temperature,
                    velocity_u=p.velocity_u,
                    velocity_v=p.velocity_v,
                    velocity_w=p.velocity_w
                ) for p in analysis.plume_trajectory.particles
            ]
            
            # Convert trajectory
            trajectory_response = PlumeTrajectoryResponse(
                fire_id=analysis.plume_trajectory.fire_id,
                trajectory_id=analysis.plume_trajectory.trajectory_id,
                particles=particle_responses,
                start_time=analysis.plume_trajectory.start_time.isoformat(),
                last_update=analysis.plume_trajectory.last_update.isoformat(),
                duration_hours=analysis.plume_trajectory.duration_hours,
                status=analysis.plume_trajectory.status.value,
                priority=analysis.plume_trajectory.priority.value,
                max_height_m=analysis.plume_trajectory.max_height_m,
                max_distance_km=analysis.plume_trajectory.max_distance_km,
                affected_area_km2=analysis.plume_trajectory.affected_area_km2
            )
            
            # Convert impact zones
            impact_zone_responses = [
                PlumeImpactZoneResponse(
                    zone_type=zone.zone_type,
                    center_lat=zone.center_lat,
                    center_lng=zone.center_lng,
                    radius_km=zone.radius_km,
                    population_affected=zone.population_affected,
                    air_quality_impact=zone.air_quality_impact,
                    visibility_impact_km=zone.visibility_impact_km,
                    duration_hours=zone.duration_hours,
                    impact_severity=zone.impact_severity
                ) for zone in analysis.impact_zones
            ]
            
            # Get forecast if requested
            forecast = None
            if request.include_forecast:
                try:
                    forecast = await fire_plume_service.get_plume_forecast(
                        fire_lat=analysis.fire_detection.latitude,
                        fire_lng=analysis.fire_detection.longitude,
                        hours_ahead=request.forecast_hours
                    )
                except Exception as e:
                    logger.warning(f"Could not generate forecast: {e}")
            
            analysis_response = FirePlumeAnalysisResponse(
                fire_detection=fire_response,
                plume_trajectory=trajectory_response,
                impact_zones=impact_zone_responses,
                vegetation_fuel_data=analysis.vegetation_fuel_data,
                weather_conditions=analysis.weather_conditions,
                plume_direction_degrees=analysis.plume_direction_degrees,
                plume_speed_kmh=analysis.plume_speed_kmh,
                estimated_duration_hours=analysis.estimated_duration_hours,
                confidence_score=analysis.confidence_score,
                recommendations=analysis.recommendations,
                analysis_timestamp=analysis.analysis_timestamp.isoformat(),
                forecast=forecast
            )
            
            analysis_responses.append(analysis_response)
        
        # Calculate processing time
        end_time = datetime.utcnow()
        processing_time_ms = (end_time - start_time).total_seconds() * 1000
        
        return FireDetectionListResponse(
            success=True,
            message=f"Successfully analyzed {len(analyses)} active fires",
            fire_count=len(analyses),
            analyses=analysis_responses,
            generated_at=end_time.isoformat(),
            processing_time_ms=processing_time_ms
        )
        
    except Exception as e:
        logger.error(f"Error in fire detection: {e}")
        raise HTTPException(status_code=500, detail=f"Fire detection failed: {str(e)}")

@app.get("/plume-forecast", response_model=PlumeForecastResponse)
async def get_plume_forecast(
    fire_lat: float = Query(..., ge=-90, le=90, description="Fire latitude"),
    fire_lng: float = Query(..., ge=-180, le=180, description="Fire longitude"),
    hours_ahead: int = Query(12, ge=1, le=48, description="Forecast hours ahead")
):
    """
    Get plume movement forecast for a specific fire location
    
    This endpoint generates hourly forecasts showing expected plume movement
    based on weather forecast data and atmospheric dispersion modeling.
    """
    try:
        forecast = await fire_plume_service.get_plume_forecast(
            fire_lat=fire_lat,
            fire_lng=fire_lng,
            hours_ahead=hours_ahead
        )
        
        if "error" in forecast:
            raise HTTPException(status_code=500, detail=forecast["error"])
        
        return PlumeForecastResponse(
            success=True,
            fire_location=forecast["fire_location"],
            forecast_hours=forecast["forecast_hours"],
            plume_forecast=forecast["plume_forecast"],
            generated_at=forecast["generated_at"]
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating plume forecast: {e}")
        raise HTTPException(status_code=500, detail=f"Forecast generation failed: {str(e)}")

@app.get("/priorities", response_model=Dict[str, List[str]])
async def get_priority_options():
    """Get available priority filter options"""
    return {
        "priorities": [p.value for p in PlumePriority],
        "description": "Use these values for priority_filter parameter"
    }

@app.get("/status", response_model=Dict[str, List[str]])
async def get_status_options():
    """Get available plume status options"""
    return {
        "statuses": [s.value for s in PlumeStatus],
        "description": "Possible plume status values"
    }

# Background task for continuous monitoring
async def continuous_fire_monitoring():
    """Background task for continuous fire monitoring (placeholder)"""
    logger.info("Continuous fire monitoring would run here")
    # Implement periodic fire detection and alerting
    pass

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8003))
    
    print("🔥 Starting SmeshLLM Fire Plume Tracking API")
    print(f"📡 NASA FIRMS API Key: {os.getenv('NASA_FIRMS_API_KEY', 'Not configured')[:8]}...")
    print(f"🌐 Server starting on port {port}")
    print(f"📖 API Documentation: http://localhost:{port}/docs")
    
    uvicorn.run(
        "fire_plume_api:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
