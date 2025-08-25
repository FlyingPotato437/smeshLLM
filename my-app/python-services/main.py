#!/usr/bin/env python3
"""
Unified FastAPI server for all Python services
Integrates HYSPLIT, PINN, RAG, OpenAQ, and Hybrid RAG services
"""

import os
from dotenv import load_dotenv
load_dotenv('../.env.production')
import uuid
import asyncio
import logging
import traceback
from datetime import datetime
from typing import Dict, Any, Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# Import our service classes - conditional PINN import
try:
    from services.pinn_service import PINNTrainingRequest, PINNPredictionRequest, PINNTrainer, PINNPredictor
    PINN_AVAILABLE = True
except (ImportError, AttributeError) as e:
    print(f"WARNING: PINN service not available: {e}")
    PINN_AVAILABLE = False
    # Create stub classes to avoid NameError
    class PINNTrainingRequest:
        pass
    class PINNPredictionRequest:
        pass
try:
    from services.rag_service import RAGOrchestrator, SemanticSearchRequest
    from services.hybrid_rag_service import HybridRAGOrchestrator, HybridRAGRequest
    RAG_AVAILABLE = True
except (ImportError, RuntimeError) as e:
    print(f"WARNING: RAG services not available: {e}")
    RAG_AVAILABLE = False
    class RAGOrchestrator:
        pass
    class SemanticSearchRequest:
        pass
    class HybridRAGOrchestrator:
        pass
    class HybridRAGRequest:
        pass
from services.openaq_v3_http_service import OpenAQV3HTTPService
from services.nasa_firms_service import NASAFIRMSService, FIRMSRequest
# Import REAL DATA ONLY weather service - NO FAKE CALCULATIONS
try:
    from real_only_weather_service import RealOnlyWeatherService
    REAL_ONLY_WEATHER_AVAILABLE = True
except ImportError as e:
    try:
        # Try services subdirectory
        from services.real_weather_service import RealWeatherService as RealOnlyWeatherService
        REAL_ONLY_WEATHER_AVAILABLE = True
        print("✅ Using RealWeatherService as RealOnlyWeatherService")
    except ImportError as e2:
        print(f"WARNING: Real-only weather service not available: {e}, {e2}")
        REAL_ONLY_WEATHER_AVAILABLE = False

# NO FALLBACK SERVICES - REAL DATA ONLY
try:
    from landfire_service import LandfireService, LocationRequest as LandfireLocationRequest
    LANDFIRE_AVAILABLE = True
except (ImportError, AttributeError) as e:
    print(f"WARNING: LANDFIRE service not available: {e}")
    LANDFIRE_AVAILABLE = False
    class LandfireService:
        pass
    class LandfireLocationRequest:
        pass
from fwi_service import FWIService, WeatherInput as FWIWeatherInput  
from services.hysplit_service import execute_hysplit_run, HysplitRunRequest, LocationModel
# from services.fire_weather_service import EnhancedFireWeatherService  # Temporarily disabled due to weather_service dependency
from data_fusion_engine import get_integrated_wildfire_analysis

# Simple HYSPLIT request model to match TypeScript interface
class SimpleHysplitRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    startTime: datetime = Field(default_factory=datetime.now)
    durationHours: int = Field(default=24, ge=1, le=240)
    releaseHeight: float = Field(default=100, ge=0, le=20000)
    meteorologicalDataSource: str = Field(default="GFS")
    emissionRate: float = Field(default=1000)
    particleCount: int = Field(default=1000)
    outputResolution: float = Field(default=10)
    createdBy: str = Field(default="WildFireGPTAlgorithm")


# Weather request model
class WeatherRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="SMeshLLM Python Services",
    description="Unified API for HYSPLIT, PINN, RAG, and OpenAQ services",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3005"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Service instances
pinn_trainer = None
pinn_predictor = None
rag_orchestrator = None
hybrid_rag_orchestrator = None
openaq_service = None
nasa_firms_service = None
weather_service = None
fire_weather_service = None
landfire_service = None
fwi_service = None

# Response models
class ServiceResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.now)

class HealthResponse(BaseModel):
    status: str
    services: Dict[str, str]
    timestamp: datetime = Field(default_factory=datetime.now)

# Initialize services on startup
@app.on_event("startup")
async def startup_event():
    global pinn_trainer, pinn_predictor, rag_orchestrator, hybrid_rag_orchestrator, openaq_service, nasa_firms_service, weather_service, enhanced_fire_weather_service, landfire_service, fwi_service
    
    try:
        logger.info("Initializing SMeshLLM Python services...")
        
        # Initialize PINN services (if available)
        if PINN_AVAILABLE:
            try:
                pinn_trainer = PINNTrainer()
                pinn_predictor = PINNPredictor()
                logger.info("✅ PINN trainer and predictor initialized")
            except Exception as e:
                logger.error(f"❌ PINN services failed to initialize: {e}")
        else:
            logger.info("WARNING: PINN services skipped (PyTorch not available)")
        
        # Initialize RAG orchestrator (if available)
        if RAG_AVAILABLE:
            try:
                rag_orchestrator = RAGOrchestrator()
                logger.info("✅ RAG orchestrator initialized")
            except Exception as e:
                logger.error(f"❌ RAG orchestrator failed to initialize: {e}")
            
            # Initialize Hybrid RAG orchestrator
            try:
                hybrid_rag_orchestrator = HybridRAGOrchestrator()
                logger.info("✅ Hybrid RAG orchestrator initialized")
            except Exception as e:
                logger.error(f"❌ Hybrid RAG orchestrator failed to initialize: {e}")
        else:
            logger.info("WARNING: RAG services skipped (dependencies not available)")
        
        # Initialize OpenAQ service
        try:
            openaq_service = OpenAQV3HTTPService()
            logger.info("✅ OpenAQ V3 HTTP service initialized")
        except Exception as e:
            logger.error(f"❌ OpenAQ service failed to initialize: {e}")
        
        # Initialize NASA FIRMS service
        try:
            nasa_firms_service = NASAFIRMSService()
            logger.info("✅ NASA FIRMS fire detection service initialized")
        except Exception as e:
            logger.error(f"❌ NASA FIRMS service failed to initialize: {e}")
        
        # Initialize Weather service (REAL DATA ONLY - NO FAKE CALCULATIONS)
        try:
            if REAL_ONLY_WEATHER_AVAILABLE:
                weather_service = RealOnlyWeatherService()
                logger.info("REAL DATA ONLY weather service initialized - NO FAKE CALCULATIONS")
            else:
                raise Exception("No real weather service available - NO FALLBACKS ALLOWED")
        except Exception as e:
            logger.error(f"Weather service failed to initialize: {e}")
            weather_service = None
        
        # Initialize Enhanced Fire Weather service (DISABLED - dependency issue)
        # try:
        #     enhanced_fire_weather_service = EnhancedFireWeatherService()
        #     logger.info("✅ Enhanced Fire Weather service initialized")
        # except Exception as e:
        #     logger.error(f"❌ Fire Weather service failed to initialize: {e}")
        enhanced_fire_weather_service = None
        logger.info("⚠️ Enhanced Fire Weather service disabled due to weather_service dependency")

        # Initialize LANDFIRE vegetation and fuel data service (if available) 
        if LANDFIRE_AVAILABLE:
            try:
                global landfire_service
                landfire_service = LandfireService()
                logger.info("✅ LANDFIRE vegetation and fuel service initialized")
            except Exception as e:
                logger.error(f"❌ LANDFIRE service failed to initialize: {e}")
                landfire_service = None
        else:
            logger.info("WARNING: LANDFIRE service skipped (rasterio not available)")
            landfire_service = None

        # Initialize Fire Weather Index service
        try:
            global fwi_service
            fwi_service = FWIService()
            logger.info("✅ Fire Weather Index (CFFDRS) service initialized")
        except Exception as e:
            logger.error(f"❌ FWI service failed to initialize: {e}")
            fwi_service = None
            
        
        logger.info("🎯 SMeshLLM services startup complete")
        
    except Exception as e:
        logger.error(f"💥 Startup failed: {e}")
        logger.error(traceback.format_exc())

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check for all services"""
    services_status = {
        "hysplit": "Manual implementation (no unified service class)",
        "pinn_trainer": "✅ Ready" if pinn_trainer else "❌ Not initialized",
        "pinn_predictor": "✅ Ready" if pinn_predictor else "❌ Not initialized", 
        "rag_orchestrator": "✅ Ready" if rag_orchestrator else "❌ Not initialized",
        "hybrid_rag_orchestrator": "✅ Ready" if hybrid_rag_orchestrator else "❌ Not initialized",
        "openaq_service": "✅ Ready" if openaq_service else "❌ Not initialized",
        "nasa_firms_service": "✅ Ready" if nasa_firms_service else "❌ Not initialized",
        "weather_service": "✅ Ready" if weather_service else "❌ Not initialized"
    }
    
    return HealthResponse(
        status="healthy",
        services=services_status
    )

# HYSPLIT endpoints
@app.post("/hysplit/run", response_model=ServiceResponse)
async def run_hysplit(params: SimpleHysplitRequest, background_tasks: BackgroundTasks):
    """Start real HYSPLIT atmospheric dispersion run using PySPLIT"""
    try:
        run_id = f"hysplit_{uuid.uuid4().hex[:8]}"
        logger.info(f"Starting real HYSPLIT run {run_id}: lat={params.latitude}, lng={params.longitude}")
        
        # Map to real request model
        request = HysplitRunRequest(
            run_id=run_id,
            start_location=LocationModel(
                latitude=params.latitude,
                longitude=params.longitude,
                height=params.releaseHeight
            ),
            start_time=params.startTime.isoformat(),
            duration_hours=params.durationHours,
            meteorological_data=params.meteorologicalDataSource,
            particle_count=params.particleCount,
            output_resolution=params.outputResolution
        )
        
        # Schedule real execution
        background_tasks.add_task(execute_hysplit_run, request)
        
        return ServiceResponse(
            success=True,
            data={
                "runId": run_id,
                "status": "initiated",
                "startedAt": datetime.now().isoformat(),
                "message": "Real HYSPLIT atmospheric dispersion model initiated successfully",
                "parameters": params.model_dump()
            }
        )
    except Exception as e:
        logger.error(f"❌ HYSPLIT run failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# PINN endpoints (conditional)
if PINN_AVAILABLE:
    @app.post("/pinn/train", response_model=ServiceResponse)
    async def train_pinn(request: PINNTrainingRequest):
        """Train Physics-Informed Neural Network"""
        if not pinn_trainer:
            raise HTTPException(status_code=503, detail="PINN trainer not available")
        
        try:
            logger.info(f"🧠 Training PINN model: {request.location}")
            result = await pinn_trainer.train_model(request)
            
            return ServiceResponse(
                success=True,
                data=result
            )
            
        except Exception as e:
            logger.error(f"❌ PINN training failed: {e}")
            return ServiceResponse(
                success=False,
                error=str(e)
            )

    @app.post("/pinn/predict", response_model=ServiceResponse) 
    async def predict_pinn(request: PINNPredictionRequest):
        """Generate PINN predictions"""
        if not pinn_predictor:
            raise HTTPException(status_code=503, detail="PINN predictor not available")
        
        try:
            logger.info(f"🔮 PINN prediction: {request.location}")
            result = await pinn_predictor.predict(request)
            
            return ServiceResponse(
                success=True,
                data=result
            )
            
        except Exception as e:
            logger.error(f"❌ PINN prediction failed: {e}")
            return ServiceResponse(
                success=False,
                error=str(e)
            )

# RAG endpoints
@app.post("/rag/search", response_model=ServiceResponse)
async def search_literature(request: SemanticSearchRequest):
    """Search scientific literature"""
    if not rag_orchestrator:
        raise HTTPException(status_code=503, detail="RAG orchestrator not available")
    
    try:
        logger.info(f"🔍 Literature search: {request.query}")
        result = await rag_orchestrator.search_semantic(request)
        
        return ServiceResponse(
            success=True,
            data=result
        )
        
    except Exception as e:
        logger.error(f"❌ Literature search failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# Hybrid RAG endpoints
@app.post("/hybrid-rag/query", response_model=ServiceResponse)
async def hybrid_rag_query(request: HybridRAGRequest):
    """Process hybrid RAG query (sensor data + literature)"""
    if not hybrid_rag_orchestrator:
        raise HTTPException(status_code=503, detail="Hybrid RAG orchestrator not available")
    
    try:
        logger.info(f"🎯 Hybrid RAG query: {request.query}")
        result = await hybrid_rag_orchestrator.process_hybrid_query(request)
        
        return ServiceResponse(
            success=True,
            data=result.model_dump()
        )
        
    except Exception as e:
        logger.error(f"❌ Hybrid RAG query failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# OpenAQ endpoints
@app.get("/openaq/measurements", response_model=ServiceResponse)
async def get_air_quality_measurements(
    latitude: float,
    longitude: float,
    radius_km: int = 25,
    parameters: str = "pm25,pm10",
    hours_back: int = 24
):
    """Get air quality measurements from OpenAQ V3"""
    if not openaq_service:
        raise HTTPException(status_code=503, detail="OpenAQ service not available")
    
    try:
        logger.info(f"OpenAQ query: lat={latitude}, lng={longitude}, hours_back={hours_back}")
        
        # Get nearby locations first
        locations = openaq_service.get_locations_nearby(latitude, longitude, radius_km)
        
        # Get latest measurements
        measurements = openaq_service.get_latest_measurements(latitude, longitude, radius_km, parameters.split(","))
        
        result = {
            "measurementsFound": len(measurements),
            "locationsFound": len(locations),
            "measurements": measurements,
            "locations": locations
        }
        
        return ServiceResponse(
            success=True,
            data=result
        )
        
    except Exception as e:
        logger.error(f"❌ OpenAQ query failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# NASA FIRMS endpoints
@app.post("/nasa-firms/active-fires", response_model=ServiceResponse)
async def get_active_fires(request: FIRMSRequest):
    """Get active fire detections from NASA FIRMS"""
    if not nasa_firms_service:
        raise HTTPException(status_code=503, detail="NASA FIRMS service not available")
    
    try:
        logger.info(f"NASA FIRMS query: lat={request.latitude}, lng={request.longitude}, radius={request.radius_km}km")
        result = await nasa_firms_service.get_active_fires(request)
        
        return ServiceResponse(
            success=True,
            data={
                "fires": [fire.model_dump() for fire in result.fires],
                "fire_count": result.fire_count,
                "query_info": result.query_info,
                "data_source": result.data_source
            }
        )
        
    except Exception as e:
        logger.error(f"❌ NASA FIRMS query failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# Weather service endpoints
@app.post("/weather/fire-conditions", response_model=ServiceResponse)
async def get_fire_weather_conditions(request: WeatherRequest):
    """Get comprehensive fire weather conditions and risk assessment"""
    if not weather_service:
        raise HTTPException(status_code=503, detail="Weather service not available")
    
    try:
        logger.info(f"Weather query: lat={request.latitude}, lng={request.longitude}")
        
        # Use REAL DATA ONLY weather service
        if isinstance(weather_service, RealOnlyWeatherService):
            # Use real-only weather service
            weather_data = await weather_service.get_current_weather(request.latitude, request.longitude)
            fire_indices = await weather_service.get_fire_weather_indices(weather_data)
            
            fire_weather = {
                "current": weather_data.to_dict(),
                "fire_weather_analysis": fire_indices,
                "risk_level": fire_indices["fire_danger_rating"]
            }
        else:
            raise Exception("Only real data weather service is supported - NO FALLBACKS")
        
        result = {
            "location": {
                "latitude": request.latitude,
                "longitude": request.longitude
            },
            "fire_weather": fire_weather,
            "analysis": {
                "critical_conditions": fire_weather.get('risk_level', '').upper() in ["HIGH", "EXTREME"],
                "wind_driven_risk": fire_weather.get('current', {}).get('wind_speed_ms', fire_weather.get('current', {}).get('wind_speed_10m', 0)) > 5,
                "low_humidity_alert": fire_weather.get('current', {}).get('relative_humidity_pct', fire_weather.get('current', {}).get('relative_humidity_2m', 100)) < 30,
                "has_wind_data": 'wind_speed_ms' in fire_weather.get('current', {}) or 'wind_speed_10m' in fire_weather.get('current', {}),
                "ssl_resolved": fire_weather.get('fire_weather_analysis', {}).get('data_quality', {}).get('ssl_resolved', False),
                "data_source": fire_weather.get('current', {}).get('data_source', 'Weather API')
            },
            "timestamp": datetime.now().isoformat(),
            "data_source": fire_weather.get('current', {}).get('data_source', 'Weather API')
        }
        
        return ServiceResponse(
            success=True,
            data=result
            )
        
    except Exception as e:
        logger.error(f"❌ Weather analysis failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

@app.get("/weather/elevation", response_model=ServiceResponse)
async def get_elevation_data(latitude: float, longitude: float):
    """Get basic elevation data for geographic calculations"""
    if not weather_service:
        raise HTTPException(status_code=503, detail="Weather service not available")
    
    try:
        logger.info(f"📍 Basic elevation query: lat={latitude}, lng={longitude}")
        
        import requests
        
        # Get elevation data using Open-Meteo
        params = {
            'latitude': latitude,
            'longitude': longitude
        }
        
        ELEVATION_API_BASE = "https://api.open-meteo.com/v1/elevation"
        response = requests.get(ELEVATION_API_BASE, params=params, timeout=10)
        
        if response.status_code != 200:
            raise HTTPException(status_code=response.status_code, detail="Elevation API error")
        
        data = response.json()
        elevation_m = data['elevation'][0]
        
        result = {
            "location": {
                "latitude": latitude,
                "longitude": longitude
            },
            "elevation_m": elevation_m,
            "elevation_ft": round(elevation_m * 3.28084),
            "timestamp": datetime.now().isoformat(),
            "data_source": "Open-Meteo Elevation API"
        }
        
        return ServiceResponse(
            success=True,
            data=result
        )
        
    except Exception as e:
        logger.error(f"❌ Elevation query failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

@app.get("/wind/direction", response_model=ServiceResponse)
async def get_wind_direction(latitude: float, longitude: float, timestamp: Optional[str] = None):
    """Get current wind direction and speed for smoke dispersion analysis"""
    if not weather_service:
        raise HTTPException(status_code=503, detail="Weather service not available")
    
    try:
        if isinstance(weather_service, RealOnlyWeatherService):
            weather_data = await weather_service.get_current_weather(latitude, longitude)
            
            data = {
                "wind_direction_deg": weather_data.wind_direction_deg,
                "wind_speed_ms": weather_data.wind_speed_ms,
                "timestamp": timestamp or datetime.now().isoformat(),
                "location": {"latitude": latitude, "longitude": longitude},
                "data_source": weather_data.data_source
            }
        else:
            raise Exception("Only real data weather service is supported - NO FALLBACKS")
        
        return ServiceResponse(
            success=True,
            data=data
        )
    except Exception as e:
        logger.error(f"❌ Wind direction query failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# Enhanced Fire Weather Analysis endpoints
@app.post("/fire-weather/comprehensive-analysis", response_model=ServiceResponse)
async def get_comprehensive_fire_weather_analysis(
    latitude: float,
    longitude: float, 
    fuel_model: str = "grass"
):
    """Get comprehensive fire weather analysis for prescribed burn planning"""
    # Fire weather service disabled due to dependency issues
    raise HTTPException(status_code=503, detail="Fire weather service temporarily disabled due to weather_service dependency")
    
    try:
        logger.info(f"Comprehensive fire weather analysis: {latitude}, {longitude}")
        
        analysis = await fire_weather_service.get_comprehensive_analysis(
            latitude=latitude,
            longitude=longitude,
            fuel_model=fuel_model
        )
        
        return ServiceResponse(
            success=True,
            data=analysis.model_dump()
        )
        
    except Exception as e:
        logger.error(f"❌ Fire weather analysis failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# OpenMeteo wind analysis (replaces WindNinja)
@app.post("/wind/analysis", response_model=ServiceResponse)
async def analyze_wind_openmeteo(request: WeatherRequest):
    """Get comprehensive wind analysis using OpenMeteo data"""
    if not weather_service:
        raise HTTPException(status_code=503, detail="Weather service not available")
    
    try:
        logger.info(f"Real data wind analysis: {request.latitude}, {request.longitude}")
        
        if isinstance(weather_service, RealOnlyWeatherService):
            weather_data = await weather_service.get_current_weather(request.latitude, request.longitude)
            
            wind_analysis = {
                "wind_speed_ms": weather_data.wind_speed_ms,
                "wind_direction_deg": weather_data.wind_direction_deg, 
                "analysis_type": "real_data_only",
                "data_source": weather_data.data_source
            }
        else:
            raise Exception("Only real data weather service is supported - NO FALLBACKS")
        
        return ServiceResponse(
            success=True,
            data=wind_analysis
        )
        
    except Exception as e:
        logger.error(f"❌ Wind analysis failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

@app.get("/wind/grid", response_model=ServiceResponse)
async def get_wind_forecast_grid(
    latitude: float, 
    longitude: float, 
    grid_size: int = 10, 
    extent_km: float = 5.0
):
    """Get wind forecast grid using real data only (note: grid forecasting not available with real-only service)"""
    if not weather_service:
        raise HTTPException(status_code=503, detail="Weather service not available")
    
    try:
        logger.info(f"Wind grid request: {latitude}, {longitude} (size: {grid_size}x{grid_size}, extent: {extent_km}km)")
        
        if isinstance(weather_service, RealOnlyWeatherService):
            # Get real weather data for the center point only (no grid forecast available)
            # Note: grid_size and extent_km parameters are not used in real-data mode
            weather_data = await weather_service.get_current_weather(latitude, longitude)
            
            grid_data = {
                "center_point": {"lat": latitude, "lng": longitude},
                "current_wind": {
                    "wind_speed_ms": weather_data.wind_speed_ms,
                    "wind_direction_deg": weather_data.wind_direction_deg
                },
                "note": f"Real data only - no forecast grid available (grid_size={grid_size}, extent_km={extent_km} not applicable)",
                "data_source": weather_data.data_source
            }
        else:
            raise Exception("Only real data weather service is supported - NO FALLBACKS")
        
        return ServiceResponse(
            success=True,
            data=grid_data
        )
        
    except Exception as e:
        logger.error(f"❌ Wind grid generation failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# LANDFIRE vegetation and fuel data endpoints
@app.post("/landfire/vegetation-fuel-data", response_model=ServiceResponse)
async def get_landfire_vegetation_fuel_data(request: LandfireLocationRequest):
    """Get comprehensive vegetation and fuel data for plume modeling"""
    if not landfire_service:
        raise HTTPException(status_code=503, detail="LANDFIRE service not available")
    
    try:
        logger.info(f"🌲 LANDFIRE query: lat={request.latitude}, lng={request.longitude}")
        
        result = await landfire_service.get_vegetation_fuel_data(
            request.latitude,
            request.longitude,
            request.buffer_km
        )
        
        return ServiceResponse(
            success=True,
            data=result.model_dump()
        )
        
    except Exception as e:
        logger.error(f"❌ LANDFIRE query failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

@app.get("/landfire/plume-inputs/{latitude}/{longitude}", response_model=ServiceResponse)
async def get_landfire_plume_inputs(latitude: float, longitude: float):
    """Get HYSPLIT-specific inputs from LANDFIRE vegetation and fuel data"""
    if not landfire_service:
        raise HTTPException(status_code=503, detail="LANDFIRE service not available")
    
    try:
        logger.info(f"🌲 LANDFIRE plume inputs: lat={latitude}, lng={longitude}")
        
        result = await landfire_service.get_vegetation_fuel_data(latitude, longitude)
        
        return ServiceResponse(
            success=True,
            data={
                "plume_modeling_inputs": result.plume_modeling_inputs,
                "fuel_model_data": result.fuel_model_data.model_dump(),
                "fire_behavior_potential": result.fire_behavior_potential,
                "location": result.location,
                "data_quality": result.data_quality
            }
        )
        
    except Exception as e:
        logger.error(f"❌ LANDFIRE plume inputs query failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# Fire Weather Index (CFFDRS) endpoints
@app.post("/fwi/calculate", response_model=ServiceResponse)
async def calculate_fire_weather_index(request: FWIWeatherInput):
    """Calculate Canadian Fire Weather Index (FWI) from weather data"""
    if not fwi_service:
        raise HTTPException(status_code=503, detail="FWI service not available")
    
    try:
        logger.info(f"FWI calculation: lat={request.latitude}, lng={request.longitude}, date={request.date}")
        
        result = await fwi_service.calculate_fwi_xclim(
            request,
            await fwi_service.get_previous_day_codes(
                fwi_service.generate_location_id(request.latitude, request.longitude, request.location_name),
                datetime.fromisoformat(request.date).date()
            )
        )
        
        return ServiceResponse(
            success=True,
            data=result.model_dump()
        )
        
    except Exception as e:
        logger.error(f"❌ FWI calculation failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

@app.get("/fwi/history/{location_id}", response_model=ServiceResponse)
async def get_fwi_history(location_id: str, days: int = 7):
    """Get historical Fire Weather Index calculations for a location"""
    if not fwi_service:
        raise HTTPException(status_code=503, detail="FWI service not available")
    
    try:
        logger.info(f"FWI history: location={location_id}, days={days}")
        
        # This would need to be implemented in the FWI service
        from supabase import create_client
        SUPABASE_URL = os.getenv("SUPABASE_URL", "https://mgpprrlduxopzrfpzrjt.supabase.co")
        SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncHBycmxkdXhvcHpyZnB6cmp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTg0MDE1OTksImV4cCI6MjAzMzk3NzU5OX0.6yQaKpezoNcVbwWNgxo6vFQo0IH2o8pPj8VRd_IjvWY")
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        result = supabase.table("fwi_calculations").select("*").eq(
            "location_id", location_id
        ).order("date", desc=True).limit(days).execute()
        
        return ServiceResponse(
            success=True,
            data={
                "location_id": location_id,
                "history": result.data,
                "count": len(result.data)
            }
        )
        
    except Exception as e:
        logger.error(f"❌ FWI history retrieval failed: {e}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

# =============================================================================
# DATA FUSION ENGINE - TIMEOUT-RESISTANT INTEGRATED ANALYSIS
# =============================================================================

@app.post("/fusion/test", response_model=ServiceResponse)
async def test_data_fusion_engine(request: WeatherRequest):
    """
    Test the data fusion engine with simple mock data
    """
    try:
        logger.info(f"🧪 Testing data fusion engine for ({request.latitude}, {request.longitude})")
        
        # Simple test with mock data fetchers
        async def mock_fetcher_1(lat, lng):
            return {"data": "test_value_1", "lat": lat, "lng": lng, "source": "mock_1"}
            
        async def mock_fetcher_2(lat, lng):
            return {"data": "test_value_2", "lat": lat, "lng": lng, "source": "mock_2"}
        
        data_fetchers = {
            'test_stream_1': mock_fetcher_1,
            'test_stream_2': mock_fetcher_2
        }
        
        # Execute test with data fusion engine
        result = await get_integrated_wildfire_analysis(
            latitude=request.latitude,
            longitude=request.longitude, 
            data_fetchers=data_fetchers
        )
        
        logger.info("✅ Data fusion engine test completed successfully")
        return ServiceResponse(success=True, data=result)
        
    except Exception as e:
        logger.error(f"❌ Data fusion engine test failed: {e}")
        return ServiceResponse(success=False, error=str(e))

@app.post("/fusion/fast-analysis", response_model=ServiceResponse)
async def get_fast_wildfire_analysis(request: WeatherRequest):
    """Get fast wildfire analysis with essential data only (< 10 seconds)"""
    try:
        logger.info(f"🚀 Fast wildfire analysis for ({request.latitude}, {request.longitude})")
        
        # Use asyncio.gather with timeout for essential services only
        import asyncio
        
        async def get_essential_data():
            try:
                # Get only the most critical data with timeout
                weather_task = None
                landfire_task = None
                
                if weather_service and isinstance(weather_service, RealOnlyWeatherService):
                    weather_task = asyncio.create_task(
                        weather_service.get_current_weather(request.latitude, request.longitude)
                    )
                
                if landfire_service:
                    landfire_task = asyncio.create_task(
                        landfire_service.get_vegetation_fuel_data(request.latitude, request.longitude)
                    )
                
                # Wait for both with 8 second timeout
                results = await asyncio.wait_for(
                    asyncio.gather(weather_task, landfire_task, return_exceptions=True),
                    timeout=8.0
                )
                
                weather_data, landfire_data = results
                
                return {
                    "weather": weather_data if not isinstance(weather_data, Exception) else None,
                    "landfire": landfire_data if not isinstance(landfire_data, Exception) else None
                }
                
            except asyncio.TimeoutError:
                logger.warning("⏱️ Fast analysis timeout - returning partial data")
                return {"weather": None, "landfire": None}
            except Exception as e:
                logger.error(f"❌ Fast analysis error: {e}")
                return {"weather": None, "landfire": None}
        
        essential_data = await get_essential_data()
        
        # Build fast response
        response_data = {
            "location": {"latitude": request.latitude, "longitude": request.longitude},
            "analysis_type": "fast",
            "weather_data": None,
            "fuel_data": None,
            "fire_danger_level": "unknown",
            "analysis_summary": "Partial data retrieved",
            "data_quality": "limited",
            "timestamp": datetime.now().isoformat()
        }
        
        # Process weather data if available
        if essential_data["weather"] and hasattr(essential_data["weather"], 'temperature_c'):
            weather = essential_data["weather"]
            response_data["weather_data"] = {
                "temperature_c": weather.temperature_c,
                "humidity_pct": weather.relative_humidity_pct,
                "wind_speed_ms": weather.wind_speed_ms,
                "wind_direction_deg": weather.wind_direction_deg
            }
        
        # Process LANDFIRE data if available
        if essential_data["landfire"] and hasattr(essential_data["landfire"], 'fuel_model_data'):
            landfire = essential_data["landfire"]
            response_data["fuel_data"] = {
                "fuel_model": landfire.fuel_model_data.fbfm13_description,
                "fuel_load": landfire.fuel_model_data.fuel_load_tons_per_acre,
                "flame_length": landfire.fuel_model_data.flame_length_ft
            }
        
        # Simple fire danger assessment
        if response_data["weather_data"] and response_data["fuel_data"]:
            temp = response_data["weather_data"]["temperature_c"]
            humidity = response_data["weather_data"]["humidity_pct"]
            wind = response_data["weather_data"]["wind_speed_ms"]
            
            if temp > 30 and humidity < 30 and wind > 5:
                response_data["fire_danger_level"] = "high"
            elif temp > 25 and humidity < 50:
                response_data["fire_danger_level"] = "moderate"
            else:
                response_data["fire_danger_level"] = "low"
            
            response_data["analysis_summary"] = f"Fast analysis complete - Danger: {response_data['fire_danger_level']}"
            response_data["data_quality"] = "good"
        
        logger.info(f"✅ Fast analysis completed in <10s - Danger: {response_data['fire_danger_level']}")
        return ServiceResponse(success=True, data=response_data)
        
    except Exception as e:
        logger.error(f"❌ Fast analysis failed: {e}")
        return ServiceResponse(success=False, error=str(e))

@app.post("/fusion/integrated-analysis", response_model=ServiceResponse)
async def get_integrated_wildfire_data(request: WeatherRequest):
    """
    Get comprehensive integrated wildfire analysis using SmeshLLM Data Fusion Engine
    Prevents timeouts by using parallel processing and intelligent caching
    """
    if not weather_service or not landfire_service or not nasa_firms_service or not openaq_service:
        raise HTTPException(status_code=503, detail="One or more services not available (fire weather service temporarily disabled)")
    
    try:
        logger.info(f"🔬 Starting integrated wildfire analysis for ({request.latitude}, {request.longitude})")
        
        # Create async data fetchers for tested working services only
        async def fetch_fuel_models(lat, lng):
            try:
                logger.info(f"🌲 Fetching LANDFIRE fuel models for ({lat}, {lng})")
                result = await landfire_service.get_vegetation_fuel_data(lat, lng)
                logger.info("✅ LANDFIRE data retrieved successfully")
                return result
            except Exception as e:
                logger.warning(f"🌲 Fuel models fetch failed: {e}")
                return None
            
        async def fetch_wind_data(lat, lng):
            try:
                logger.info(f"Fetching wind data for ({lat}, {lng})")
                if isinstance(weather_service, RealOnlyWeatherService):
                    weather_data = await weather_service.get_current_weather(lat, lng)
                    result = {
                        "wind_speed_ms": weather_data.wind_speed_ms,
                        "wind_direction_deg": weather_data.wind_direction_deg, 
                        "data_source": weather_data.data_source
                    }
                    logger.info("Wind data retrieved successfully - REAL DATA")
                    return result
                else:
                    raise Exception("Only real data weather service is supported")
            except Exception as e:
                logger.warning(f"Wind data fetch failed: {e}")
                return None
        
        # Start with core services that we know work
        data_fetchers = {
            'fuel_models': fetch_fuel_models,
            'wind_data': fetch_wind_data
        }
        
        # Execute integrated analysis with data fusion engine
        result = await get_integrated_wildfire_analysis(
            latitude=request.latitude,
            longitude=request.longitude, 
            data_fetchers=data_fetchers
        )
        
        logger.info(f"✅ Integrated analysis completed successfully - Quality: {result['quality_metrics']['overall_data_quality']:.2f}")
        return ServiceResponse(
            success=True,
            data=result
        )
        
    except Exception as e:
        logger.error(f"❌ Error in integrated wildfire analysis: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        return ServiceResponse(
            success=False,
            error=str(e)
        )

if __name__ == "__main__":
    # Run the server on port 8000 to match TypeScript service expectations
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "127.0.0.1")
    
    logger.info(f"Starting SMeshLLM Python services on {host}:{port}")
    
    uvicorn.run(
        "main:app",
        host=host,
        port=port,
        reload=True,
        log_level="info"
    )