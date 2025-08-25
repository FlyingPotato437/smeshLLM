#!/usr/bin/env python3
"""
NASA FIRMS (Fire Information for Resource Management System) Service
Real-time active fire detection from MODIS and VIIRS satellites
"""

import asyncio
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import os

# HTTP client for NASA FIRMS API
try:
    import httpx
except ImportError:
    # Fallback for missing httpx
    import requests as httpx
    
from pydantic import BaseModel, Field

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class FireDetection(BaseModel):
    """Active fire detection from NASA FIRMS"""
    latitude: float
    longitude: float
    brightness: float  # Temperature in Kelvin
    scan: float = Field(..., description="Pixel size in km")
    track: float = Field(..., description="Pixel size in km")
    acquisition_date: str
    acquisition_time: str
    satellite: str = Field(..., description="A = Aqua, T = Terra, S = Suomi NPP")
    instrument: str = Field(..., description="MODIS or VIIRS")
    confidence: int = Field(..., description="0-100% confidence")
    version: str
    bright_t31: float = Field(..., description="Brightness temperature I-4 channel")
    frp: float = Field(..., description="Fire Radiative Power in MW")
    daynight: str = Field(..., description="D=day, N=night")

class FIRMSRequest(BaseModel):
    """Request parameters for NASA FIRMS API"""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    radius_km: int = Field(default=50, ge=1, le=1000)
    days_back: int = Field(default=1, ge=1, le=10)
    source: str = Field(default="VIIRS_SNPP_NRT", description="VIIRS_SNPP_NRT or MODIS_NRT")

class FIRMSResponse(BaseModel):
    """Response from NASA FIRMS query"""
    fires: List[FireDetection]
    fire_count: int
    query_info: Dict[str, Any]
    data_source: str

class NASAFIRMSService:
    """Service for querying NASA FIRMS active fire data"""
    
    def __init__(self):
        self.base_url = "https://firms.modaps.eosdis.nasa.gov/api"
        self.map_key = os.getenv("NASA_FIRMS_API_KEY", "")
        
        if not self.map_key:
            logger.warning("⚠️ NASA FIRMS API KEY not found. Set NASA_FIRMS_API_KEY environment variable.")
            logger.warning("   Get your free key at: https://firms.modaps.eosdis.nasa.gov/api/")
        else:
            logger.info(f"✅ NASA FIRMS API key loaded: {self.map_key[:8]}...")
            # Note: The API key y3f4201e30e422bce83be9c85b072dc91 appears to be invalid
            # Users need to register for their own key at https://firms.modaps.eosdis.nasa.gov/api/
        
        # HTTP client with timeout
        self.client = httpx.AsyncClient(timeout=30.0)
        
        logger.info("🔥 NASA FIRMS service initialized")
    
    async def get_active_fires(self, request: FIRMSRequest) -> FIRMSResponse:
        """
        Get active fire detections within radius of coordinates
        
        Args:
            request: FIRMS request parameters
            
        Returns:
            FIRMSResponse with active fire detections
        """
        try:
            logger.info(f"🛰️ Querying NASA FIRMS: lat={request.latitude}, lng={request.longitude}, radius={request.radius_km}km")
            
            if not self.map_key:
                logger.error("❌ NASA FIRMS API key not available - cannot proceed without real data")
                return FIRMSResponse(
                    fires=[],
                    fire_count=0,
                    query_info={
                        "latitude": request.latitude,
                        "longitude": request.longitude,
                        "radius_km": request.radius_km,
                        "days_back": request.days_back,
                        "source": request.source,
                        "query_time": datetime.now().isoformat(),
                        "error": "No API key - register at https://firms.modaps.eosdis.nasa.gov/api/"
                    },
                    data_source="NASA_FIRMS_NO_KEY"
                )
            
            # Calculate bounding box: west, south, east, north
            import math
            R = 6371  # Earth radius in km
            dlat = (request.radius_km / R) * (180 / math.pi)
            dlon = dlat / math.cos(math.radians(request.latitude))
            west = request.longitude - dlon
            south = request.latitude - dlat
            east = request.longitude + dlon
            north = request.latitude + dlat
            area_coords = f"{west},{south},{east},{north}"
            
            # Use correct FIRMS API format from documentation
            url = f"{self.base_url}/area/{self.map_key}/{request.source}/{area_coords}/{request.days_back}"
            
            logger.info(f"🌐 NASA FIRMS API URL: {url}")
            
            # Query NASA FIRMS API
            response = await self.client.get(url)
            
            if response.status_code == 200:
                # Parse CSV response
                fires = self._parse_csv_response(response.text, request)
                
                logger.info(f"✅ Retrieved {len(fires)} active fire detections from NASA FIRMS")
                
                return FIRMSResponse(
                    fires=fires,
                    fire_count=len(fires),
                    query_info={
                        "latitude": request.latitude,
                        "longitude": request.longitude,
                        "radius_km": request.radius_km,
                        "days_back": request.days_back,
                        "source": request.source,
                        "query_time": datetime.now().isoformat()
                    },
                    data_source="NASA_FIRMS_REAL"
                )
            else:
                logger.error(f"❌ NASA FIRMS API error: {response.status_code} - {response.text}")
                return FIRMSResponse(
                    fires=[],
                    fire_count=0,
                    query_info={
                        "latitude": request.latitude,
                        "longitude": request.longitude,
                        "radius_km": request.radius_km,
                        "days_back": request.days_back,
                        "source": request.source,
                        "query_time": datetime.now().isoformat(),
                        "error": f"API Error {response.status_code}: {response.text}"
                    },
                    data_source="NASA_FIRMS_ERROR"
                )
                
        except Exception as e:
            logger.error(f"❌ NASA FIRMS query failed: {e}")
            return FIRMSResponse(
                fires=[],
                fire_count=0,
                query_info={
                    "latitude": request.latitude,
                    "longitude": request.longitude,
                    "radius_km": request.radius_km,
                    "days_back": request.days_back,
                    "source": request.source,
                    "query_time": datetime.now().isoformat(),
                    "error": str(e)
                },
                data_source="NASA_FIRMS_EXCEPTION"
            )
    
    def _parse_csv_response(self, csv_text: str, request: FIRMSRequest) -> List[FireDetection]:
        """Parse CSV response from NASA FIRMS API"""
        fires = []
        lines = csv_text.strip().split('\n')
        
        if len(lines) < 2:
            return fires
        
        # Parse header to get column indices
        header = lines[0].split(',')
        
        # Column mapping for VIIRS
        col_map = {
            'latitude': header.index('latitude') if 'latitude' in header else 0,
            'longitude': header.index('longitude') if 'longitude' in header else 1,
            'brightness': header.index('bright_ti4') if 'bright_ti4' in header else 2,
            'scan': header.index('scan') if 'scan' in header else 3,
            'track': header.index('track') if 'track' in header else 4,
            'acq_date': header.index('acq_date') if 'acq_date' in header else 5,
            'acq_time': header.index('acq_time') if 'acq_time' in header else 6,
            'satellite': header.index('satellite') if 'satellite' in header else 7,
            'instrument': header.index('instrument') if 'instrument' in header else 8,
            'confidence': header.index('confidence') if 'confidence' in header else 9,
            'version': header.index('version') if 'version' in header else 10,
            'bright_t31': header.index('bright_ti5') if 'bright_ti5' in header else 11,
            'frp': header.index('frp') if 'frp' in header else 12,
            'daynight': header.index('daynight') if 'daynight' in header else 13
        }
        
        # Parse data rows
        for line in lines[1:]:
            try:
                cols = line.split(',')
                if len(cols) < max(col_map.values()) + 1:
                    continue
                
                lat = float(cols[col_map['latitude']])
                lng = float(cols[col_map['longitude']])
                
                # Filter by radius
                if self._distance_km(lat, lng, request.latitude, request.longitude) <= request.radius_km:
                    fire = FireDetection(
                        latitude=lat,
                        longitude=lng,
                        brightness=float(cols[col_map['brightness']]) if cols[col_map['brightness']] else 0.0,
                        scan=float(cols[col_map['scan']]) if cols[col_map['scan']] else 0.0,
                        track=float(cols[col_map['track']]) if cols[col_map['track']] else 0.0,
                        acquisition_date=cols[col_map['acq_date']],
                        acquisition_time=cols[col_map['acq_time']],
                        satellite=cols[col_map['satellite']],
                        instrument=cols[col_map['instrument']],
                        confidence=int(cols[col_map['confidence']]) if cols[col_map['confidence']].isdigit() else 0,
                        version=cols[col_map['version']],
                        bright_t31=float(cols[col_map['bright_t31']]) if cols[col_map['bright_t31']] else 0.0,
                        frp=float(cols[col_map['frp']]) if cols[col_map['frp']] else 0.0,
                        daynight=cols[col_map['daynight']]
                    )
                    fires.append(fire)
                    
            except (ValueError, IndexError) as e:
                logger.warning(f"⚠️ Skipping malformed CSV line: {e}")
                continue
        
        return fires
    
    def _distance_km(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """Calculate distance between two points in kilometers"""
        import math
        
        # Haversine formula
        R = 6371  # Earth's radius in km
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = (math.sin(dlat/2) * math.sin(dlat/2) + 
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
             math.sin(dlng/2) * math.sin(dlng/2))
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        distance = R * c
        return distance
    
    # REMOVED: No more mock data - only real NASA FIRMS data or clear error messages
    
    def _create_error_response(self, request: FIRMSRequest, error: str) -> FIRMSResponse:
        """Create error response"""
        return FIRMSResponse(
            fires=[],
            fire_count=0,
            query_info={
                "latitude": request.latitude,
                "longitude": request.longitude,
                "radius_km": request.radius_km,
                "days_back": request.days_back,
                "source": request.source,
                "query_time": datetime.now().isoformat(),
                "error": error
            },
            data_source="NASA_FIRMS_ERROR"
        )
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()

# Example usage and testing
if __name__ == "__main__":
    async def test_firms():
        service = NASAFIRMSService()
        
        # Test with Santa Clara County coordinates
        request = FIRMSRequest(
            latitude=37.4419,
            longitude=-122.1430,
            radius_km=50,
            days_back=1
        )
        
        response = await service.get_active_fires(request)
        
        print(f"🔥 Found {response.fire_count} active fires")
        for fire in response.fires[:3]:  # Show first 3
            print(f"   📍 {fire.latitude:.4f}, {fire.longitude:.4f} - {fire.brightness}K - {fire.confidence}% confidence")
        
        await service.close()
    
    # Run test
    asyncio.run(test_firms())