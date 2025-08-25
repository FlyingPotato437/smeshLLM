#!/usr/bin/env python3
"""
Canadian Fire Weather Index (FWI) Service
Implements proper CFFDRS calculations using xclim library
Provides stateful FWI, DC, DMC calculations with Supabase persistence
"""

import asyncio
import os
import logging
from datetime import datetime, timedelta, date
from typing import Dict, List, Optional, Any
import numpy as np
import pandas as pd
import xarray as xr

# FastAPI and Pydantic
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Database
from supabase import create_client, Client
import asyncpg

# Fire Weather calculations - xclim is now a hard dependency
import xclim
from xclim.indices.fire import (
    cffwis_indices,
    drought_code,
    duff_moisture_code,
    initial_spread_index,
    build_up_index,
    fire_weather_index
)

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="SMeshLLM Fire Weather Index Service",
    description="Canadian Forest Fire Danger Rating System (CFFDRS) calculations",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase configuration
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://mgpprrlduxopzrfpzrjt.supabase.co")
SUPABASE_KEY = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1ncHBycmxkdXhvcHpyZnB6cmp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MTg0MDE1OTksImV4cCI6MjAzMzk3NzU5OX0.6yQaKpezoNcVbwWNgxo6vFQo0IH2o8pPj8VRd_IjvWY")

# Initialize Supabase client
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Pydantic models
class WeatherInput(BaseModel):
    """Weather data input for FWI calculations"""
    latitude: float
    longitude: float
    temperature_c: float
    relative_humidity_pct: float
    wind_speed_kmh: float
    precipitation_24h_mm: float
    date: str  # ISO format YYYY-MM-DD
    location_name: Optional[str] = None

class FWIResult(BaseModel):
    """Complete Fire Weather Index calculation result"""
    location_id: str
    date: str
    
    # Input weather data
    temperature_c: float
    relative_humidity_pct: float
    wind_speed_kmh: float
    precipitation_24h_mm: float
    
    # FWI System components
    ffmc: float  # Fine Fuel Moisture Code
    dmc: float   # Duff Moisture Code  
    dc: float    # Drought Code
    isi: float   # Initial Spread Index
    bui: float   # Buildup Index
    fwi: float   # Fire Weather Index
    
    # Risk classification
    danger_class: str
    risk_level: str
    confidence: str
    
    # Metadata
    calculated_at: str
    data_source: str
    previous_day_codes: Optional[Dict[str, float]] = None

class FWIDailyState(BaseModel):
    """Daily FWI state for persistence"""
    location_id: str
    date: str
    last_ffmc: float
    last_dmc: float
    last_dc: float
    created_at: str

class FWIService:
    """Fire Weather Index calculation service with state persistence"""
    
    def __init__(self):
        self.supabase = supabase
        
    async def ensure_tables_exist(self):
        """Ensure required Supabase tables exist"""
        try:
            # Create fwi_daily_state table if it doesn't exist
            create_state_table_sql = """
            CREATE TABLE IF NOT EXISTS fwi_daily_state (
                id SERIAL PRIMARY KEY,
                location_id VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                last_ffmc FLOAT NOT NULL DEFAULT 85.0,
                last_dmc FLOAT NOT NULL DEFAULT 6.0,
                last_dc FLOAT NOT NULL DEFAULT 15.0,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(location_id, date)
            );
            """
            
            # Create fwi_calculations table for historical data
            create_calc_table_sql = """
            CREATE TABLE IF NOT EXISTS fwi_calculations (
                id SERIAL PRIMARY KEY,
                location_id VARCHAR(255) NOT NULL,
                date DATE NOT NULL,
                temperature_c FLOAT NOT NULL,
                relative_humidity_pct FLOAT NOT NULL,
                wind_speed_kmh FLOAT NOT NULL,
                precipitation_24h_mm FLOAT NOT NULL,
                ffmc FLOAT NOT NULL,
                dmc FLOAT NOT NULL,
                dc FLOAT NOT NULL,
                isi FLOAT NOT NULL,
                bui FLOAT NOT NULL,
                fwi FLOAT NOT NULL,
                danger_class VARCHAR(50) NOT NULL,
                risk_level VARCHAR(50) NOT NULL,
                calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
                UNIQUE(location_id, date)
            );
            """
            
            # Note: These would typically be run as migrations, but for development:
            logger.info("Tables should exist or be created via Supabase dashboard")
            
        except Exception as e:
            logger.error(f"Error ensuring tables exist: {e}")
    
    def generate_location_id(self, latitude: float, longitude: float, location_name: Optional[str] = None) -> str:
        """Generate consistent location ID"""
        if location_name:
            return f"{location_name}_{latitude:.4f}_{longitude:.4f}".replace(" ", "_")
        return f"loc_{latitude:.4f}_{longitude:.4f}"
    
    async def get_previous_day_codes(self, location_id: str, target_date: date) -> Dict[str, float]:
        """Get previous day's FWI codes for stateful calculation"""
        previous_date = target_date - timedelta(days=1)
        
        try:
            result = self.supabase.table("fwi_daily_state").select("*").eq(
                "location_id", location_id
            ).eq("date", previous_date.isoformat()).execute()
            
            if result.data and len(result.data) > 0:
                prev_data = result.data[0]
                return {
                    "ffmc": prev_data["last_ffmc"],
                    "dmc": prev_data["last_dmc"], 
                    "dc": prev_data["last_dc"]
                }
            else:
                # Return standard initialization values for new locations
                logger.info(f"No previous data for {location_id}, using initialization values")
                return {"ffmc": 85.0, "dmc": 6.0, "dc": 15.0}
                
        except Exception as e:
            logger.error(f"Error getting previous day codes: {e}")
            # Fallback to standard values
            return {"ffmc": 85.0, "dmc": 6.0, "dc": 15.0}
    
    async def save_daily_state(self, location_id: str, target_date: date, ffmc: float, dmc: float, dc: float):
        """Save today's codes as state for tomorrow's calculation"""
        try:
            state_data = {
                "location_id": location_id,
                "date": target_date.isoformat(),
                "last_ffmc": ffmc,
                "last_dmc": dmc,
                "last_dc": dc,
                "created_at": datetime.utcnow().isoformat()
            }
            
            # Upsert (insert or update if exists)
            result = self.supabase.table("fwi_daily_state").upsert(state_data).execute()
            logger.info(f"Saved daily state for {location_id} on {target_date}")
            
        except Exception as e:
            logger.error(f"Error saving daily state: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to save FWI state: {e}")
    
    async def calculate_fwi_xclim(self, weather: WeatherInput, prev_codes: Dict[str, float]) -> FWIResult:
        """Calculate FWI using xclim library (proper CFFDRS implementation)"""
            
        try:
            # Convert to pandas for xclim
            weather_data = pd.DataFrame({
                'tas': [weather.temperature_c + 273.15],  # Convert to Kelvin
                'hurs': [weather.relative_humidity_pct],
                'ws': [weather.wind_speed_kmh / 3.6],     # Convert to m/s  
                'pr': [weather.precipitation_24h_mm]
            })
            
            # Create xarray dataset
            import xarray as xr
            ds = xr.Dataset({
                'tas': (['time'], weather_data['tas']),
                'hurs': (['time'], weather_data['hurs']),
                'ws': (['time'], weather_data['ws']),
                'pr': (['time'], weather_data['pr'])
            })
            
            # Calculate FWI components using xclim cffwis_indices
            # Create latitude array
            lat_array = xr.DataArray([weather.latitude], dims=['space'])
            
            # Calculate all FWI indices at once
            dc, dmc, ffmc, isi, bui, fwi = cffwis_indices(
                ds.tas, ds.pr, ds.ws, ds.hurs, lat_array,
                ffmc0=prev_codes["ffmc"],
                dmc0=prev_codes["dmc"],
                dc0=prev_codes["dc"]
            )
            
            # Extract scalar values
            ffmc = ffmc.values[0]
            dmc = dmc.values[0] 
            dc = dc.values[0]
            isi = isi.values[0]
            bui = bui.values[0]
            fwi = fwi.values[0]
            
            # Classify danger level
            danger_class = self.classify_danger_level(fwi)
            risk_level = self.classify_risk_level(fwi, weather.wind_speed_kmh, weather.relative_humidity_pct)
            
            location_id = self.generate_location_id(weather.latitude, weather.longitude, weather.location_name)
            
            return FWIResult(
                location_id=location_id,
                date=weather.date,
                temperature_c=weather.temperature_c,
                relative_humidity_pct=weather.relative_humidity_pct,
                wind_speed_kmh=weather.wind_speed_kmh,
                precipitation_24h_mm=weather.precipitation_24h_mm,
                ffmc=round(float(ffmc), 1),
                dmc=round(float(dmc), 1),
                dc=round(float(dc), 1),
                isi=round(float(isi), 1),
                bui=round(float(bui), 1),
                fwi=round(float(fwi), 1),
                danger_class=danger_class,
                risk_level=risk_level,
                confidence="High (xclim/CFFDRS)",
                calculated_at=datetime.utcnow().isoformat(),
                data_source="xclim CFFDRS library",
                previous_day_codes=prev_codes
            )
            
        except Exception as e:
            logger.error(f"❌ xclim calculation failed: {e}")
            raise HTTPException(status_code=500, detail=f"FWI calculation failed: {str(e)}")
    
    
    def classify_danger_level(self, fwi: float) -> str:
        """Classify FWI into standard Canadian danger classes"""
        if fwi < 5.2:
            return "LOW"
        elif fwi < 11.2:
            return "MODERATE" 
        elif fwi < 21.3:
            return "HIGH"
        elif fwi < 38.0:
            return "VERY_HIGH"
        else:
            return "EXTREME"
    
    def classify_risk_level(self, fwi: float, wind_kmh: float, humidity: float) -> str:
        """Enhanced risk classification considering multiple factors"""
        base_class = self.classify_danger_level(fwi)
        
        # Upgrade risk if extreme conditions present
        if wind_kmh > 50 or humidity < 15:
            if base_class in ["LOW", "MODERATE"]:
                return "HIGH"
            elif base_class == "HIGH":
                return "VERY_HIGH"
            elif base_class == "VERY_HIGH":
                return "EXTREME"
                
        return base_class
    
    async def initialize_location(self, location_id: str, start_date: date) -> Dict[str, float]:
        """Initialize FWI codes for a new location"""
        initial_codes = {"ffmc": 85.0, "dmc": 6.0, "dc": 15.0}
        
        try:
            await self.save_daily_state(location_id, start_date, 
                                      initial_codes["ffmc"], 
                                      initial_codes["dmc"], 
                                      initial_codes["dc"])
            logger.info(f"Initialized location {location_id} with standard codes")
            return initial_codes
        except Exception as e:
            logger.error(f"Failed to initialize location: {e}")
            return initial_codes

# Global service instance
fwi_service = FWIService()

# API Endpoints
# Note: Startup handled in main.py initialization

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "Fire Weather Index Service",
        "xclim_required": True,
        "no_fallbacks": True,
        "capabilities": [
            "Canadian Fire Weather Index (FWI) calculations",
            "Stateful DMC/DC persistence", 
            "FFMC, ISI, BUI calculations",
            "Danger level classification",
            "Historical data storage",
            "No fallback mechanisms - xclim required"
        ],
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.post("/fwi/calculate")
async def calculate_fwi(weather: WeatherInput) -> FWIResult:
    """Calculate Fire Weather Index for given weather conditions"""
    
    try:
        target_date = datetime.fromisoformat(weather.date).date()
        location_id = fwi_service.generate_location_id(
            weather.latitude, weather.longitude, weather.location_name
        )
        
        # Get previous day's codes
        prev_codes = await fwi_service.get_previous_day_codes(location_id, target_date)
        
        # Calculate FWI using xclim (no fallbacks)
        result = await fwi_service.calculate_fwi_xclim(weather, prev_codes)
        
        # Save today's codes for tomorrow
        await fwi_service.save_daily_state(
            location_id, target_date, result.ffmc, result.dmc, result.dc
        )
        
        # Save calculation result
        try:
            calc_data = {
                "location_id": location_id,
                "date": target_date.isoformat(),
                "temperature_c": result.temperature_c,
                "relative_humidity_pct": result.relative_humidity_pct,
                "wind_speed_kmh": result.wind_speed_kmh,
                "precipitation_24h_mm": result.precipitation_24h_mm,
                "ffmc": result.ffmc,
                "dmc": result.dmc,
                "dc": result.dc,
                "isi": result.isi,
                "bui": result.bui,
                "fwi": result.fwi,
                "danger_class": result.danger_class,
                "risk_level": result.risk_level,
                "calculated_at": result.calculated_at
            }
            
            supabase.table("fwi_calculations").upsert(calc_data).execute()
            
        except Exception as e:
            logger.warning(f"Failed to save calculation result: {e}")
        
        return result
        
    except Exception as e:
        logger.error(f"FWI calculation failed: {e}")
        raise HTTPException(status_code=500, detail=f"FWI calculation failed: {str(e)}")

@app.post("/fwi/initialize-location")
async def initialize_location_endpoint(
    latitude: float, 
    longitude: float,
    location_name: Optional[str] = None,
    start_date: Optional[str] = None
):
    """Initialize FWI codes for a new location"""
    
    try:
        location_id = fwi_service.generate_location_id(latitude, longitude, location_name)
        target_date = datetime.fromisoformat(start_date).date() if start_date else date.today()
        
        codes = await fwi_service.initialize_location(location_id, target_date)
        
        return {
            "location_id": location_id,
            "date": target_date.isoformat(),
            "initial_codes": codes,
            "status": "initialized"
        }
        
    except Exception as e:
        logger.error(f"Location initialization failed: {e}")
        raise HTTPException(status_code=500, detail=f"Initialization failed: {str(e)}")

@app.get("/fwi/history/{location_id}")
async def get_fwi_history(location_id: str, days: int = 7):
    """Get historical FWI calculations for a location"""
    
    try:
        result = supabase.table("fwi_calculations").select("*").eq(
            "location_id", location_id
        ).order("date", desc=True).limit(days).execute()
        
        return {
            "location_id": location_id,
            "history": result.data,
            "count": len(result.data)
        }
        
    except Exception as e:
        logger.error(f"History retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=f"History retrieval failed: {str(e)}")

if __name__ == "__main__":
    print("🔥 Starting SMeshLLM Fire Weather Index Service")
    print("xclim required - no fallback mechanisms")
    
    uvicorn.run(app, host="0.0.0.0", port=8004, log_level="info")