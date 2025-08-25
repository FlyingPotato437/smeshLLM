#!/usr/bin/env python3
"""
OpenAQ Service for Air Quality Data Integration
Provides standardized interface to OpenAQ API for air quality measurements
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any

import httpx
from pydantic import BaseModel

from core.base_service import BaseService
from core.error_handler import ErrorHandler, ErrorCategory, ErrorSeverity

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class AirQualityMeasurement(BaseModel):
    """Air quality measurement data"""
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
    confidence: Optional[str] = None

class OpenAQResponse(BaseModel):
    """OpenAQ API response"""
    measurements: List[AirQualityMeasurement]
    total_count: int
    locations_count: int
    data_source: str
    query_info: Dict[str, Any]

class OpenAQService(BaseService):
    """Service for querying OpenAQ air quality data"""
    
    def __init__(self):
        super().__init__("openaq")
        self.base_url = "https://api.openaq.org/v2"
        self.client = None
        self.error_handler = ErrorHandler("openaq_service")
        
    async def initialize(self):
        """Initialize the OpenAQ service"""
        try:
            self.client = httpx.AsyncClient(timeout=30.0)
            
            # Test API connectivity
            response = await self.client.get(f"{self.base_url}/countries", params={"limit": 1})
            if response.status_code == 200:
                logger.info("✅ OpenAQ API connection successful")
                self.is_initialized = True
            else:
                logger.error(f"❌ OpenAQ API test failed: {response.status_code}")
                
        except Exception as e:
            logger.error(f"❌ OpenAQ service initialization failed: {e}")
            self.error_handler.handle_error(
                e, 
                category=ErrorCategory.INITIALIZATION,
                severity=ErrorSeverity.HIGH
            )
    
    async def get_air_quality_data(self, request) -> OpenAQResponse:
        """
        Get air quality data from OpenAQ API
        
        Args:
            request: Request object with coordinates and parameters
            
        Returns:
            OpenAQResponse with air quality measurements
        """
        try:
            if not self.is_initialized:
                raise Exception("OpenAQ service not initialized")
            
            # Build query parameters
            params = {
                "limit": 1000,
                "order_by": "datetime",
                "sort": "desc"
            }
            
            # Add location filter
            if hasattr(request, 'coordinates'):
                coords = request.coordinates
                params["coordinates"] = f"{coords.latitude},{coords.longitude}"
                if hasattr(request, 'radius_km'):
                    params["radius"] = int(request.radius_km * 1000)  # Convert to meters
            
            # Add parameter filter
            if hasattr(request, 'parameters'):
                params["parameter"] = ",".join(request.parameters)
            
            # Add time filter (last 24 hours by default)
            start_time = datetime.utcnow() - timedelta(hours=24)
            params["date_from"] = start_time.isoformat() + "Z"
            
            logger.info(f"🌬️ Querying OpenAQ API with params: {params}")
            
            # Query OpenAQ API
            response = await self.client.get(f"{self.base_url}/measurements", params=params)
            
            if response.status_code == 200:
                data = response.json()
                measurements = self._parse_measurements(data.get("results", []))
                
                logger.info(f"✅ Retrieved {len(measurements)} air quality measurements")
                
                return OpenAQResponse(
                    measurements=measurements,
                    total_count=len(measurements),
                    locations_count=len(set(m.location_id for m in measurements)),
                    data_source="OpenAQ_API",
                    query_info={
                        "query_params": params,
                        "api_response_count": data.get("meta", {}).get("found", 0),
                        "timestamp": datetime.utcnow().isoformat()
                    }
                )
            else:
                logger.error(f"❌ OpenAQ API error: {response.status_code}")
                return OpenAQResponse(
                    measurements=[],
                    total_count=0,
                    locations_count=0,
                    data_source="OpenAQ_API_Error",
                    query_info={
                        "error": f"API Error {response.status_code}",
                        "timestamp": datetime.utcnow().isoformat()
                    }
                )
                
        except Exception as e:
            logger.error(f"❌ OpenAQ query failed: {e}")
            self.error_handler.handle_error(
                e,
                category=ErrorCategory.API_REQUEST,
                severity=ErrorSeverity.MEDIUM
            )
            
            return OpenAQResponse(
                measurements=[],
                total_count=0,
                locations_count=0,
                data_source="OpenAQ_Service_Error",
                query_info={
                    "error": str(e),
                    "timestamp": datetime.utcnow().isoformat()
                }
            )
    
    def _parse_measurements(self, results: List[Dict]) -> List[AirQualityMeasurement]:
        """Parse OpenAQ API results into measurement objects"""
        
        measurements = []
        
        for result in results:
            try:
                measurement = AirQualityMeasurement(
                    location_id=str(result.get("locationId", result.get("location", "unknown"))),
                    location_name=result.get("location", "Unknown"),
                    country=result.get("country", "Unknown"),
                    city=result.get("city", "Unknown"),
                    latitude=float(result.get("coordinates", {}).get("latitude", 0)),
                    longitude=float(result.get("coordinates", {}).get("longitude", 0)),
                    parameter=result.get("parameter", "unknown"),
                    value=float(result.get("value", 0)),
                    unit=result.get("unit", "unknown"),
                    timestamp=result.get("date", {}).get("utc", datetime.utcnow().isoformat()),
                    source_name=result.get("sourceName", "Unknown"),
                    confidence=self._assess_data_quality(result)
                )
                measurements.append(measurement)
                
            except (ValueError, KeyError, TypeError) as e:
                logger.warning(f"⚠️ Skipping invalid measurement: {e}")
                continue
        
        return measurements
    
    def _assess_data_quality(self, result: Dict) -> str:
        """Assess data quality based on source information"""
        
        source_name = result.get("sourceName", "").lower()
        
        if any(term in source_name for term in ["reference", "government", "epa", "official"]):
            return "high"
        elif any(term in source_name for term in ["sensor", "community", "citizen"]):
            return "medium"
        else:
            return "unknown"
    
    async def health_check(self) -> Dict[str, Any]:
        """Check service health"""
        try:
            if not self.client:
                return {"status": "unhealthy", "error": "Client not initialized"}
            
            # Test API connectivity
            response = await self.client.get(f"{self.base_url}/countries", params={"limit": 1})
            
            if response.status_code == 200:
                return {
                    "status": "healthy",
                    "api_connectivity": "ok",
                    "last_check": datetime.utcnow().isoformat()
                }
            else:
                return {
                    "status": "degraded",
                    "api_connectivity": f"error_{response.status_code}",
                    "last_check": datetime.utcnow().isoformat()
                }
                
        except Exception as e:
            return {
                "status": "unhealthy",
                "error": str(e),
                "last_check": datetime.utcnow().isoformat()
            }
    
    def get_service_info(self) -> Dict[str, Any]:
        """Get service information"""
        return {
            "service_name": "OpenAQ Air Quality Service",
            "version": "1.0.0",
            "api_base_url": self.base_url,
            "initialized": self.is_initialized,
            "capabilities": [
                "real_time_air_quality",
                "global_monitoring_stations",
                "multiple_parameters",
                "historical_data"
            ]
        }
    
    async def cleanup(self):
        """Cleanup service resources"""
        if self.client:
            await self.client.aclose()
            logger.info("🧹 OpenAQ service cleaned up")

# Example usage and testing
if __name__ == "__main__":
    async def test_openaq():
        service = OpenAQService()
        await service.initialize()
        
        # Mock request object
        class MockRequest:
            def __init__(self):
                self.coordinates = type('obj', (object,), {'latitude': 37.4419, 'longitude': -122.1430})
                self.radius_km = 50
                self.parameters = ["pm25", "pm10", "o3"]
        
        request = MockRequest()
        response = await service.get_air_quality_data(request)
        
        print(f"🌬️ Found {response.total_count} air quality measurements")
        for measurement in response.measurements[:3]:
            print(f"   📍 {measurement.location_name}: {measurement.parameter} = {measurement.value} {measurement.unit}")
        
        await service.cleanup()
    
    # Run test
    asyncio.run(test_openaq())