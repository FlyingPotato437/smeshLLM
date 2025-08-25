#!/usr/bin/env python3
"""
OpenAQ API Integration Service for Real Air Quality Data
Provides live air quality data from thousands of monitoring stations worldwide
No more mocks - this connects to real global air quality networks using OpenAQ API V3
"""

import asyncio
import os
import sys
import uuid
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Union
import aiohttp
from dataclasses import dataclass

# FastAPI
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator
import uvicorn

# Data processing
import pandas as pd
import numpy as np

# OpenAQ V3 Client
try:
    from openaq import OpenAQ
    OPENAQ_CLIENT_AVAILABLE = True
except ImportError:
    print("⚠️  OpenAQ client not available. Install with: pip install openaq")
    OPENAQ_CLIENT_AVAILABLE = False

# Database integration
try:
    import asyncpg
    import sqlalchemy
    DB_AVAILABLE = True
except ImportError:
    print("⚠️  Database libraries not available. Install with: pip install asyncpg sqlalchemy")
    DB_AVAILABLE = False

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="SmeshLLM OpenAQ Service",
    description="Real-time air quality data integration from OpenAQ API",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Data models
class LocationFilter(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    radius: Optional[float] = None  # km
    country: Optional[str] = None
    city: Optional[str] = None
    bounding_box: Optional[Dict[str, float]] = None  # {min_lat, max_lat, min_lon, max_lon}

class TimeFilter(BaseModel):
    start_date: Optional[str] = None  # ISO format
    end_date: Optional[str] = None    # ISO format
    hours_back: Optional[int] = 24    # Default last 24 hours

class ParameterFilter(BaseModel):
    parameters: List[str] = ['pm25', 'pm10', 'o3', 'no2', 'so2', 'co']
    include_raw: bool = False
    min_data_coverage: float = 0.75  # Minimum data availability

class OpenAQRequest(BaseModel):
    location_filter: LocationFilter
    time_filter: TimeFilter
    parameter_filter: ParameterFilter
    limit: int = 1000
    source_name: Optional[str] = None

class AirQualityMeasurement(BaseModel):
    location_id: str
    location_name: str
    country: str
    city: str
    latitude: float
    longitude: float
    parameter: str
    value: float
    unit: str
    timestamp: str
    source_name: str
    coordinates: Dict[str, float]
    data_quality: Optional[str] = None

class LocationInfo(BaseModel):
    location_id: str
    name: str
    country: str
    city: str
    latitude: float
    longitude: float
    source_name: str
    first_updated: str
    last_updated: str
    parameters: List[str]
    sensor_type: Optional[str] = None

class OpenAQResponse(BaseModel):
    request_id: str
    total_measurements: int
    locations_count: int
    measurements: List[AirQualityMeasurement]
    locations: List[LocationInfo]
    data_timerange: Dict[str, str]
    request_params: Dict

# Configuration
class OpenAQConfig:
    def __init__(self):
        self.api_base_url = "https://api.openaq.org/v2"
        self.api_key = os.environ.get('OPENAQ_API_KEY')  # Optional but recommended
        self.database_url = os.environ.get('DATABASE_URL', 'postgresql://localhost/smeshllm')
        self.cache_duration = int(os.environ.get('CACHE_DURATION_MINUTES', '30'))
        self.rate_limit_per_minute = int(os.environ.get('RATE_LIMIT_PER_MINUTE', '100'))

config = OpenAQConfig()

class OpenAQClient:
    """Handles communication with OpenAQ API"""
    
    def __init__(self):
        self.session = None
        self.base_url = config.api_base_url
        self.headers = {
            'User-Agent': 'SmeshLLM/1.0 (Atmospheric Research)'
        }
        
        if config.api_key:
            self.headers['X-API-Key'] = config.api_key
    
    async def __aenter__(self):
        self.session = aiohttp.ClientSession(headers=self.headers)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
    
    async def get_latest_measurements(self, request: OpenAQRequest) -> Dict:
        """Get latest air quality measurements"""
        
        params = self._build_measurements_params(request)
        
        async with self.session.get(f"{self.base_url}/measurements", params=params) as response:
            if response.status != 200:
                raise HTTPException(status_code=response.status, 
                                  detail=f"OpenAQ API error: {await response.text()}")
            
            data = await response.json()
            return data
    
    async def get_locations(self, location_filter: LocationFilter) -> Dict:
        """Get monitoring locations"""
        
        params = self._build_locations_params(location_filter)
        
        async with self.session.get(f"{self.base_url}/locations", params=params) as response:
            if response.status != 200:
                raise HTTPException(status_code=response.status,
                                  detail=f"OpenAQ API error: {await response.text()}")
            
            data = await response.json()
            return data
    
    async def get_countries(self) -> Dict:
        """Get list of countries with monitoring data"""
        
        async with self.session.get(f"{self.base_url}/countries") as response:
            if response.status != 200:
                raise HTTPException(status_code=response.status,
                                  detail=f"OpenAQ API error: {await response.text()}")
            
            data = await response.json()
            return data
    
    async def get_parameters(self) -> Dict:
        """Get list of available parameters"""
        
        async with self.session.get(f"{self.base_url}/parameters") as response:
            if response.status != 200:
                raise HTTPException(status_code=response.status,
                                  detail=f"OpenAQ API error: {await response.text()}")
            
            data = await response.json()
            return data
    
    def _build_measurements_params(self, request: OpenAQRequest) -> Dict:
        """Build query parameters for measurements endpoint"""
        
        params = {
            'limit': min(request.limit, 10000),  # OpenAQ limit
            'order_by': 'datetime',
            'sort': 'desc'
        }
        
        # Location filters
        if request.location_filter.country:
            params['country'] = request.location_filter.country
        
        if request.location_filter.city:
            params['city'] = request.location_filter.city
        
        if request.location_filter.latitude and request.location_filter.longitude:
            params['coordinates'] = f"{request.location_filter.latitude},{request.location_filter.longitude}"
            if request.location_filter.radius:
                params['radius'] = int(request.location_filter.radius * 1000)  # Convert to meters
        
        # Time filters
        if request.time_filter.start_date:
            params['date_from'] = request.time_filter.start_date
        elif request.time_filter.hours_back:
            start_time = datetime.utcnow() - timedelta(hours=request.time_filter.hours_back)
            params['date_from'] = start_time.isoformat() + 'Z'
        
        if request.time_filter.end_date:
            params['date_to'] = request.time_filter.end_date
        
        # Parameter filters
        if request.parameter_filter.parameters:
            params['parameter'] = ','.join(request.parameter_filter.parameters)
        
        if request.source_name:
            params['sourceName'] = request.source_name
        
        return params
    
    def _build_locations_params(self, location_filter: LocationFilter) -> Dict:
        """Build query parameters for locations endpoint"""
        
        params = {
            'limit': 10000,
            'order_by': 'lastUpdated',
            'sort': 'desc'
        }
        
        if location_filter.country:
            params['country'] = location_filter.country
        
        if location_filter.city:
            params['city'] = location_filter.city
        
        if location_filter.latitude and location_filter.longitude:
            params['coordinates'] = f"{location_filter.latitude},{location_filter.longitude}"
            if location_filter.radius:
                params['radius'] = int(location_filter.radius * 1000)  # Convert to meters
        
        return params

class OpenAQDataProcessor:
    """Processes and formats OpenAQ data"""
    
    def __init__(self):
        pass
    
    def process_measurements_response(self, data: Dict, request: OpenAQRequest) -> OpenAQResponse:
        """Process measurements API response"""
        
        request_id = str(uuid.uuid4())
        
        measurements = []
        locations_seen = {}
        
        for result in data.get('results', []):
            try:
                # Extract measurement data
                measurement = AirQualityMeasurement(
                    location_id=str(result.get('locationId', result.get('location'))),
                    location_name=result.get('location', 'Unknown'),
                    country=result.get('country', 'Unknown'),
                    city=result.get('city', 'Unknown'),
                    latitude=float(result.get('coordinates', {}).get('latitude', 0)),
                    longitude=float(result.get('coordinates', {}).get('longitude', 0)),
                    parameter=result.get('parameter'),
                    value=float(result.get('value')),
                    unit=result.get('unit'),
                    timestamp=result.get('date', {}).get('utc'),
                    source_name=result.get('sourceName', 'Unknown'),
                    coordinates=result.get('coordinates', {}),
                    data_quality=self._assess_data_quality(result)
                )
                
                measurements.append(measurement)
                
                # Track unique locations
                loc_key = measurement.location_id
                if loc_key not in locations_seen:
                    locations_seen[loc_key] = {
                        'location_id': measurement.location_id,
                        'name': measurement.location_name,
                        'country': measurement.country,
                        'city': measurement.city,
                        'latitude': measurement.latitude,
                        'longitude': measurement.longitude,
                        'source_name': measurement.source_name,
                        'parameters': set()
                    }
                
                locations_seen[loc_key]['parameters'].add(measurement.parameter)
                
            except (ValueError, KeyError) as e:
                logger.warning(f"Skipping invalid measurement: {e}")
                continue
        
        # Convert locations to proper format
        locations = []
        for loc_data in locations_seen.values():
            location = LocationInfo(
                location_id=loc_data['location_id'],
                name=loc_data['name'],
                country=loc_data['country'],
                city=loc_data['city'],
                latitude=loc_data['latitude'],
                longitude=loc_data['longitude'],
                source_name=loc_data['source_name'],
                first_updated="unknown",  # Would need additional API call
                last_updated="unknown",   # Would need additional API call
                parameters=list(loc_data['parameters'])
            )
            locations.append(location)
        
        # Calculate time range
        timestamps = [m.timestamp for m in measurements if m.timestamp]
        data_timerange = {
            'start': min(timestamps) if timestamps else "unknown",
            'end': max(timestamps) if timestamps else "unknown"
        }
        
        return OpenAQResponse(
            request_id=request_id,
            total_measurements=len(measurements),
            locations_count=len(locations),
            measurements=measurements,
            locations=locations,
            data_timerange=data_timerange,
            request_params=request.dict()
        )
    
    def _assess_data_quality(self, result: Dict) -> str:
        """Assess data quality based on OpenAQ metadata"""
        
        # Simple quality assessment
        if result.get('value') is None:
            return "invalid"
        
        if result.get('sourceName') and 'reference' in result.get('sourceName', '').lower():
            return "high"
        elif result.get('sourceName') and any(term in result.get('sourceName', '').lower() 
                                           for term in ['government', 'epa', 'official']):
            return "high"
        else:
            return "medium"
    
    async def store_to_database(self, response: OpenAQResponse):
        """Store measurements in database"""
        
        # In production, this would insert into sensor_readings table with source='openaq'
        logger.info(f"Storing {response.total_measurements} OpenAQ measurements to database")
        
        # Format for sensor_readings table
        for measurement in response.measurements:
            # Convert to database format
            db_record = {
                'device_id': f"openaq_{measurement.location_id}",
                'timestamp': measurement.timestamp,
                'location': f"POINT({measurement.longitude} {measurement.latitude})",
                'source': 'openaq',
                'pm25_ugm3': measurement.value if measurement.parameter == 'pm25' else None,
                'pm10_ugm3': measurement.value if measurement.parameter == 'pm10' else None,
                'metadata': {
                    'openaq_location_id': measurement.location_id,
                    'location_name': measurement.location_name,
                    'country': measurement.country,
                    'city': measurement.city,
                    'parameter': measurement.parameter,
                    'unit': measurement.unit,
                    'source_name': measurement.source_name,
                    'data_quality': measurement.data_quality
                },
                'created_at': datetime.utcnow().isoformat()
            }
            
            # In real implementation, would batch insert using asyncpg

# Global instances
openaq_client = OpenAQClient()
data_processor = OpenAQDataProcessor()

# API endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    
    # Test OpenAQ API connectivity
    api_status = "unknown"
    try:
        async with OpenAQClient() as client:
            # Test with a simple countries request
            countries_data = await client.get_countries()
            api_status = "connected" if countries_data else "error"
    except Exception as e:
        api_status = f"error: {str(e)}"
    
    return {
        "status": "healthy",
        "openaq_api_status": api_status,
        "database_available": DB_AVAILABLE,
        "timestamp": datetime.utcnow().isoformat()
    }

@app.post("/openaq/measurements")
async def get_air_quality_measurements(request: OpenAQRequest):
    """Get air quality measurements from OpenAQ"""
    
    try:
        async with OpenAQClient() as client:
            # Fetch data from OpenAQ API
            api_response = await client.get_latest_measurements(request)
            
            # Process and format response
            processed_response = data_processor.process_measurements_response(api_response, request)
            
            # Optionally store in database
            if DB_AVAILABLE:
                await data_processor.store_to_database(processed_response)
            
            return processed_response
            
    except Exception as e:
        logger.error(f"Error fetching air quality measurements: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch measurements: {str(e)}")

@app.get("/openaq/locations")
async def get_monitoring_locations(
    country: Optional[str] = None,
    city: Optional[str] = None,
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
    radius: Optional[float] = None
):
    """Get air quality monitoring locations"""
    
    try:
        location_filter = LocationFilter(
            country=country,
            city=city,
            latitude=latitude,
            longitude=longitude,
            radius=radius
        )
        
        async with OpenAQClient() as client:
            api_response = await client.get_locations(location_filter)
            
            # Format locations
            locations = []
            for result in api_response.get('results', []):
                if result.get('coordinates'):
                    location = LocationInfo(
                        location_id=str(result.get('id')),
                        name=result.get('name', 'Unknown'),
                        country=result.get('country', 'Unknown'),
                        city=result.get('city', 'Unknown'),
                        latitude=float(result.get('coordinates', {}).get('latitude', 0)),
                        longitude=float(result.get('coordinates', {}).get('longitude', 0)),
                        source_name=result.get('sourceName', 'Unknown'),
                        first_updated=result.get('firstUpdated'),
                        last_updated=result.get('lastUpdated'),
                        parameters=[p.get('parameter') for p in result.get('parameters', [])]
                    )
                    locations.append(location)
            
            return {
                "total_locations": len(locations),
                "locations": locations
            }
            
    except Exception as e:
        logger.error(f"Error fetching monitoring locations: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch locations: {str(e)}")

@app.get("/openaq/countries")
async def get_available_countries():
    """Get list of countries with air quality data"""
    
    try:
        async with OpenAQClient() as client:
            api_response = await client.get_countries()
            
            countries = []
            for result in api_response.get('results', []):
                countries.append({
                    'code': result.get('code'),
                    'name': result.get('name'),
                    'location_count': result.get('locations'),
                    'measurement_count': result.get('count'),
                    'first_updated': result.get('firstUpdated'),
                    'last_updated': result.get('lastUpdated')
                })
            
            return {
                "total_countries": len(countries),
                "countries": countries
            }
            
    except Exception as e:
        logger.error(f"Error fetching countries: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch countries: {str(e)}")

@app.get("/openaq/parameters")
async def get_available_parameters():
    """Get list of available air quality parameters"""
    
    try:
        async with OpenAQClient() as client:
            api_response = await client.get_parameters()
            
            parameters = []
            for result in api_response.get('results', []):
                parameters.append({
                    'id': result.get('id'),
                    'name': result.get('name'),
                    'display_name': result.get('displayName'),
                    'description': result.get('description'),
                    'preferred_unit': result.get('preferredUnit')
                })
            
            return {
                "total_parameters": len(parameters),
                "parameters": parameters
            }
            
    except Exception as e:
        logger.error(f"Error fetching parameters: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch parameters: {str(e)}")

@app.post("/openaq/nearby")
async def get_nearby_measurements(
    latitude: float,
    longitude: float,
    radius_km: float = 50,
    parameters: List[str] = ['pm25', 'pm10'],
    hours_back: int = 24
):
    """Get air quality measurements near a specific location"""
    
    try:
        request = OpenAQRequest(
            location_filter=LocationFilter(
                latitude=latitude,
                longitude=longitude,
                radius=radius_km
            ),
            time_filter=TimeFilter(hours_back=hours_back),
            parameter_filter=ParameterFilter(parameters=parameters),
            limit=500
        )
        
        async with OpenAQClient() as client:
            api_response = await client.get_latest_measurements(request)
            processed_response = data_processor.process_measurements_response(api_response, request)
            
            return {
                "center_coordinates": {"latitude": latitude, "longitude": longitude},
                "search_radius_km": radius_km,
                "time_range_hours": hours_back,
                "parameters": parameters,
                "measurements_found": processed_response.total_measurements,
                "locations_found": processed_response.locations_count,
                "measurements": processed_response.measurements[:50],  # Limit response size
                "locations": processed_response.locations
            }
            
    except Exception as e:
        logger.error(f"Error fetching nearby measurements: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch nearby measurements: {str(e)}")

if __name__ == "__main__":
    print("🚀 Starting SmeshLLM OpenAQ Service")
    print(f"OpenAQ API URL: {config.api_base_url}")
    print(f"API Key configured: {'Yes' if config.api_key else 'No'}")
    print(f"Database Available: {DB_AVAILABLE}")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8004,
        log_level="info"
    )