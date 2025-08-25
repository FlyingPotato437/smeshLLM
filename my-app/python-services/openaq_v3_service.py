#!/usr/bin/env python3
"""
OpenAQ API V3 Integration Service for Real Air Quality Data
Provides live air quality data from thousands of monitoring stations worldwide
Uses OpenAQ API V3 with proper authentication and real data streams
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from dataclasses import dataclass

# FastAPI
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import uvicorn

# OpenAQ V3 Client
try:
    from openaq import OpenAQ
    OPENAQ_CLIENT_AVAILABLE = True
except ImportError:
    print("⚠️  OpenAQ client not available. Install with: pip install openaq")
    OPENAQ_CLIENT_AVAILABLE = False

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="SmeshLLM OpenAQ V3 Service",
    description="Real-time air quality data integration from OpenAQ API V3",
    version="3.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
OPENAQ_API_KEY = os.getenv("OPENAQ_API_KEY")
if not OPENAQ_API_KEY:
    logger.warning("OPENAQ_API_KEY not found in environment. Some features may not work.")

# Pydantic models for API responses
class AirQualityMeasurement(BaseModel):
    locationId: str
    locationName: str
    country: str
    city: str
    latitude: float
    longitude: float
    parameter: str
    value: float
    unit: str
    timestamp: str
    sourceName: str
    
class MonitoringLocation(BaseModel):
    locationId: str
    name: str
    country: str
    city: str
    latitude: float
    longitude: float
    sourceName: str
    parameters: List[str]
    
class OpenAQResponse(BaseModel):
    requestId: str
    totalMeasurements: int
    locationsCount: int
    measurements: List[AirQualityMeasurement]
    locations: List[MonitoringLocation]
    dataTimerange: Dict[str, str]

class NearbyResponse(BaseModel):
    centerCoordinates: Dict[str, float]
    searchRadiusKm: float
    timeRangeHours: int
    parameters: List[str]
    measurementsFound: int
    locationsFound: int
    measurements: List[AirQualityMeasurement]
    locations: List[MonitoringLocation]

# OpenAQ V3 Client wrapper
class OpenAQV3Service:
    def __init__(self):
        self.client = None
        if OPENAQ_CLIENT_AVAILABLE and OPENAQ_API_KEY:
            try:
                self.client = OpenAQ(api_key=OPENAQ_API_KEY)
                logger.info("OpenAQ V3 client initialized successfully")
            except Exception as e:
                logger.error(f"Failed to initialize OpenAQ client: {e}")
                self.client = None
        else:
            logger.warning("OpenAQ client not available - API key missing or client not installed")
    
    def is_available(self) -> bool:
        """Check if OpenAQ client is available and authenticated"""
        return self.client is not None
    
    async def get_locations_nearby(self, latitude: float, longitude: float, radius_km: float = 50) -> List[Dict]:
        """Get air quality monitoring locations near coordinates"""
        if not self.is_available():
            raise HTTPException(status_code=503, detail="OpenAQ service not available")
        
        try:
            # Use the OpenAQ V3 client to get nearby locations
            locations = self.client.locations.get(
                coordinates=(latitude, longitude),
                radius=int(radius_km * 1000),  # Convert to meters
                limit=100
            )
            
            return locations.results if hasattr(locations, 'results') else []
        except Exception as e:
            logger.error(f"Error fetching nearby locations: {e}")
            raise HTTPException(status_code=500, detail=f"OpenAQ API error: {str(e)}")
    
    async def get_latest_measurements_nearby(self, latitude: float, longitude: float, radius_km: float = 50, parameters: List[str] = None) -> List[Dict]:
        """Get latest air quality measurements near coordinates"""
        if not self.is_available():
            raise HTTPException(status_code=503, detail="OpenAQ service not available")
        
        try:
            # Default parameters if none provided
            if not parameters:
                parameters = ['pm25', 'pm10']
            
            # Get latest measurements from OpenAQ V3
            measurements = self.client.latest.get(
                coordinates=(latitude, longitude),
                radius=int(radius_km * 1000),  # Convert to meters
                parameters=parameters,
                limit=1000
            )
            
            return measurements.results if hasattr(measurements, 'results') else []
        except Exception as e:
            logger.error(f"Error fetching latest measurements: {e}")
            raise HTTPException(status_code=500, detail=f"OpenAQ API error: {str(e)}")
    
    def close(self):
        """Close the OpenAQ client"""
        if self.client:
            self.client.close()

# Global service instance
openaq_service = OpenAQV3Service()

# API endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint with real OpenAQ V3 connectivity test"""
    
    api_status = "unknown"
    api_key_configured = bool(OPENAQ_API_KEY)
    
    if openaq_service.is_available():
        try:
            # Test with a simple locations request for San Francisco
            locations = await openaq_service.get_locations_nearby(37.7749, -122.4194, radius_km=10)
            api_status = f"connected - found {len(locations)} locations"
        except Exception as e:
            api_status = f"error: {str(e)}"
    else:
        api_status = "client not available"
    
    return {
        "status": "healthy",
        "openaq_api_v3_status": api_status,
        "api_key_configured": api_key_configured,
        "openaq_client_available": OPENAQ_CLIENT_AVAILABLE,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.get("/openaq/nearby")
async def get_nearby_air_quality(
    latitude: float = Query(..., description="Latitude coordinate"),
    longitude: float = Query(..., description="Longitude coordinate"), 
    radius_km: float = Query(50, description="Search radius in kilometers"),
    parameters: Optional[str] = Query("pm25,pm10", description="Comma-separated list of parameters")
):
    """Get real-time air quality measurements near specified coordinates"""
    
    try:
        # Parse parameters
        param_list = [p.strip() for p in parameters.split(",")] if parameters else ["pm25", "pm10"]
        
        # Get locations and measurements
        locations_data = await openaq_service.get_locations_nearby(latitude, longitude, radius_km)
        measurements_data = await openaq_service.get_latest_measurements_nearby(latitude, longitude, radius_km, param_list)
        
        # Format locations
        locations = []
        for loc in locations_data:
            if loc.get('coordinates'):
                location = MonitoringLocation(
                    locationId=str(loc.get('id', '')),
                    name=loc.get('name', 'Unknown'),
                    country=loc.get('country', {}).get('name', 'Unknown'),
                    city=loc.get('city', 'Unknown'),
                    latitude=float(loc.get('coordinates', {}).get('latitude', 0)),
                    longitude=float(loc.get('coordinates', {}).get('longitude', 0)),
                    sourceName=loc.get('owner', {}).get('name', 'Unknown'),
                    parameters=[p.get('name') for p in loc.get('parameters', [])]
                )
                locations.append(location)
        
        # Format measurements
        measurements = []
        for meas in measurements_data:
            if meas.get('coordinates') and meas.get('value') is not None:
                measurement = AirQualityMeasurement(
                    locationId=str(meas.get('locationId', '')),
                    locationName=meas.get('location', {}).get('name', 'Unknown'),
                    country=meas.get('country', {}).get('name', 'Unknown'),
                    city=meas.get('location', {}).get('city', 'Unknown'),
                    latitude=float(meas.get('coordinates', {}).get('latitude', 0)),
                    longitude=float(meas.get('coordinates', {}).get('longitude', 0)),
                    parameter=meas.get('parameter', {}).get('name', 'unknown'),
                    value=float(meas.get('value', 0)),
                    unit=meas.get('parameter', {}).get('units', 'unknown'),
                    timestamp=meas.get('date', {}).get('utc', ''),
                    sourceName=meas.get('location', {}).get('owner', {}).get('name', 'Unknown')
                )
                measurements.append(measurement)
        
        return NearbyResponse(
            centerCoordinates={"latitude": latitude, "longitude": longitude},
            searchRadiusKm=radius_km,
            timeRangeHours=24,  # OpenAQ latest typically covers last 24 hours
            parameters=param_list,
            measurementsFound=len(measurements),
            locationsFound=len(locations),
            measurements=measurements,
            locations=locations
        )
        
    except Exception as e:
        logger.error(f"Error in get_nearby_air_quality: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch air quality data: {str(e)}")

@app.get("/openaq/countries")
async def get_available_countries():
    """Get available countries with air quality data"""
    
    if not openaq_service.is_available():
        raise HTTPException(status_code=503, detail="OpenAQ service not available")
    
    try:
        countries = openaq_service.client.countries.get(limit=200)
        
        formatted_countries = []
        for country in countries.results if hasattr(countries, 'results') else []:
            formatted_countries.append({
                "code": country.get('code', ''),
                "name": country.get('name', ''),
                "locationCount": country.get('locationCount', 0),
                "measurementCount": country.get('measurementCount', 0),
                "firstUpdated": country.get('firstUpdated', ''),
                "lastUpdated": country.get('lastUpdated', '')
            })
        
        return {"countries": formatted_countries}
        
    except Exception as e:
        logger.error(f"Error fetching countries: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch countries: {str(e)}")

@app.get("/openaq/parameters")
async def get_available_parameters():
    """Get available air quality parameters"""
    
    if not openaq_service.is_available():
        raise HTTPException(status_code=503, detail="OpenAQ service not available")
    
    try:
        parameters = openaq_service.client.parameters.get(limit=50)
        
        formatted_parameters = []
        for param in parameters.results if hasattr(parameters, 'results') else []:
            formatted_parameters.append({
                "id": str(param.get('id', '')),
                "name": param.get('name', ''),
                "displayName": param.get('displayName', param.get('name', '')),
                "description": param.get('description', ''),
                "preferredUnit": param.get('units', '')
            })
        
        return {"parameters": formatted_parameters}
        
    except Exception as e:
        logger.error(f"Error fetching parameters: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch parameters: {str(e)}")

@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on app shutdown"""
    openaq_service.close()

if __name__ == "__main__":
    print("🚀 Starting SmeshLLM OpenAQ V3 Service")
    print(f"OpenAQ API Key configured: {'Yes' if OPENAQ_API_KEY else 'No'}")
    print(f"OpenAQ Client Available: {OPENAQ_CLIENT_AVAILABLE}")
    
    uvicorn.run(app, host="0.0.0.0", port=8004)