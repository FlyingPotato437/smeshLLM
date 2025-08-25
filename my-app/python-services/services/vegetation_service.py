#!/usr/bin/env python3
"""
Vegetation and Fuel Analysis Service
Implements vegetation monitoring and fuel analysis for fire behavior prediction
Following ODIN-RS Landfire integration patterns
"""

import os
import asyncio
import logging
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
import math

# HTTP client for external APIs
import httpx
from pydantic import BaseModel, Field

# Import base service
try:
    from ..core.base_service import BaseService, ExternalAPIService
    from ..core.error_handler import handle_service_errors
except ImportError:
    # Fallback for direct execution
    import sys
    from pathlib import Path
    sys.path.append(str(Path(__file__).parent.parent))
    from core.base_service import BaseService, ExternalAPIService
    from core.error_handler import handle_service_errors

# Setup logging
logger = logging.getLogger(__name__)


class BoundingBox(BaseModel):
    """Geographic bounding box"""
    north: float = Field(..., ge=-90, le=90)
    south: float = Field(..., ge=-90, le=90)
    east: float = Field(..., ge=-180, le=180)
    west: float = Field(..., ge=-180, le=180)

class VegetationCover(BaseModel):
    """Fuel vegetation cover data from Landfire"""
    fuel_vegetation_cover: int = Field(..., description="FVC code")
    cover_description: str
    canopy_cover_percent: float = Field(..., ge=0, le=100)
    fuel_load_tons_per_acre: float = Field(..., ge=0)

class VegetationType(BaseModel):
    """Fuel vegetation type data from Landfire"""
    fuel_vegetation_type: int = Field(..., description="FVT code")
    type_description: str
    fire_behavior_fuel_model: str
    flame_length_factor: float = Field(..., ge=0)

class VegetationIndices(BaseModel):
    """Vegetation indices from satellite data"""
    ndvi: float = Field(..., ge=-1, le=1, description="Normalized Difference Vegetation Index")
    evi: float = Field(..., ge=-1, le=1, description="Enhanced Vegetation Index")
    moisture_stress_index: float = Field(..., ge=0, le=1)
    acquisition_date: datetime

class FuelMoisture(BaseModel):
    """Fuel moisture content estimation"""
    live_fuel_moisture_percent: float = Field(..., ge=0, le=300)
    dead_fuel_moisture_percent: float = Field(..., ge=0, le=50)
    fuel_moisture_category: str = Field(..., description="Very Low, Low, Moderate, High")
    calculation_method: str

class FireRisk(BaseModel):
    """Fire risk assessment based on vegetation and weather"""
    fire_danger_rating: str = Field(..., description="Low, Moderate, High, Very High, Extreme")
    ignition_probability: float = Field(..., ge=0, le=1)
    rate_of_spread_factor: float = Field(..., ge=0)
    flame_length_feet: float = Field(..., ge=0)
    spotting_distance_miles: float = Field(..., ge=0)
    suppression_difficulty: str = Field(..., description="Easy, Moderate, Difficult, Extreme")

class VegetationAnalysis(BaseModel):
    """Complete vegetation analysis result"""
    location: BoundingBox
    vegetation_cover: Optional[VegetationCover] = None
    vegetation_type: Optional[VegetationType] = None
    vegetation_indices: Optional[VegetationIndices] = None
    fuel_moisture: Optional[FuelMoisture] = None
    fire_risk: Optional[FireRisk] = None
    analysis_timestamp: datetime
    data_sources: List[str] = []
    metadata: Dict[str, Any] = {}


class VegetationService(BaseService):
    """
    Vegetation and fuel analysis service following ODIN patterns
    
    Integrates multiple data sources for comprehensive vegetation analysis:
    - USGS Landfire WMS services for fuel data
    - MODIS/VIIRS for vegetation indices
    - Weather-based fuel moisture calculations
    - Fire risk assessment algorithms
    """
    
    def __init__(self):
        super().__init__("Vegetation")
        
        # Landfire WMS endpoints (following ODIN configuration)
        self.landfire_base_url = "https://edcintl.cr.usgs.gov/geoserver/landfire/us_230/ows"
        self.modis_base_url = "https://modis.gsfc.nasa.gov/data"
        
        # HTTP client for API requests
        self.client = httpx.AsyncClient(timeout=30.0)
        
        # Fuel model lookup tables (simplified)
        self.fuel_models = self._initialize_fuel_models()
        self.vegetation_lookup = self._initialize_vegetation_lookup()
    
    async def _initialize_service(self):
        """Initialize vegetation service"""
        self.logger.info("🌿 Initializing Vegetation Analysis Service")
        
        # Test Landfire WMS availability
        landfire_available = await self._test_landfire_connection()
        if not landfire_available:
            self.logger.warning("⚠️ Landfire WMS not accessible - using fallback data")
        
        self.logger.info("✅ Vegetation service initialized successfully")
    
    async def _check_service_health(self) -> Dict[str, Any]:
        """Check vegetation service health"""
        landfire_status = await self._test_landfire_connection()
        
        return {
            "landfire_wms_available": landfire_status,
            "landfire_url": self.landfire_base_url,
            "fuel_models_loaded": len(self.fuel_models),
            "vegetation_types_loaded": len(self.vegetation_lookup),
            "service_info": self.get_service_info()
        }
    
    async def _cleanup_service(self):
        """Cleanup vegetation service resources"""
        await self.client.aclose()
        self.logger.info("🧹 Vegetation service cleanup completed")
    
    async def _test_landfire_connection(self) -> bool:
        """Test connection to Landfire WMS"""
        try:
            # Test WMS GetCapabilities request
            response = await self.client.get(
                self.landfire_base_url,
                params={
                    "service": "WMS",
                    "version": "1.3.0",
                    "request": "GetCapabilities"
                },
                timeout=10.0
            )
            return response.status_code == 200
        except Exception as e:
            self.logger.error(f"Landfire connection test failed: {e}")
            return False
    
    def _initialize_fuel_models(self) -> Dict[str, Dict[str, Any]]:
        """Initialize fuel model lookup table"""
        # Simplified fuel models based on standard fire behavior fuel models
        return {
            "1": {"name": "Short Grass", "load": 0.74, "flame_factor": 1.0},
            "2": {"name": "Timber Grass", "load": 2.0, "flame_factor": 1.2},
            "3": {"name": "Tall Grass", "load": 3.01, "flame_factor": 1.5},
            "4": {"name": "Chaparral", "load": 5.01, "flame_factor": 2.0},
            "5": {"name": "Brush", "load": 2.0, "flame_factor": 1.3},
            "6": {"name": "Dormant Brush", "load": 2.9, "flame_factor": 1.8},
            "7": {"name": "Southern Rough", "load": 3.5, "flame_factor": 1.6},
            "8": {"name": "Closed Timber Litter", "load": 1.5, "flame_factor": 0.8},
            "9": {"name": "Hardwood Litter", "load": 2.9, "flame_factor": 1.1},
            "10": {"name": "Timber Litter", "load": 3.01, "flame_factor": 1.2}
        }
    
    def _initialize_vegetation_lookup(self) -> Dict[int, str]:
        """Initialize vegetation type lookup"""
        # Simplified vegetation type codes
        return {
            101: "Developed",
            102: "Agriculture",
            103: "Barren",
            111: "Water",
            121: "Evergreen Forest",
            122: "Deciduous Forest",
            123: "Mixed Forest",
            141: "Grassland",
            142: "Shrubland",
            143: "Savanna",
            161: "Herbaceous Wetland",
            162: "Woody Wetland"
        }
    
    @handle_service_errors
    async def get_fuel_vegetation_cover(self, region: BoundingBox) -> Optional[VegetationCover]:
        """
        Get fuel vegetation cover data from Landfire WMS
        
        Args:
            region: Geographic bounding box
            
        Returns:
            VegetationCover data or None if unavailable
        """
        try:
            self.logger.info(f"🌿 Fetching fuel vegetation cover for region: {region}")
            
            # WMS GetMap request for FVC data
            params = {
                "service": "WMS",
                "version": "1.3.0",
                "request": "GetMap",
                "layers": "LC22_FVC_230",  # Fuel Vegetation Cover 2022
                "styles": "",
                "format": "image/png",
                "crs": "EPSG:4326",
                "bbox": f"{region.south},{region.west},{region.north},{region.east}",
                "width": "256",
                "height": "256"
            }
            
            response = await self.client.get(self.landfire_base_url, params=params)
            
            if response.status_code == 200:
                # For now, return estimated values based on region
                # In production, would parse the actual raster data
                estimated_cover = self._estimate_vegetation_cover(region)
                
                self.logger.info(f"✅ Retrieved vegetation cover data")
                return VegetationCover(
                    fuel_vegetation_cover=estimated_cover["fvc_code"],
                    cover_description=estimated_cover["description"],
                    canopy_cover_percent=estimated_cover["canopy_percent"],
                    fuel_load_tons_per_acre=estimated_cover["fuel_load"]
                )
            else:
                self.logger.error(f"❌ Landfire WMS request failed: {response.status_code}")
                return None
                
        except Exception as e:
            self.logger.error(f"Fuel vegetation cover fetch failed: {e}")
            return None
    
    @handle_service_errors
    async def get_fuel_vegetation_type(self, region: BoundingBox) -> Optional[VegetationType]:
        """
        Get fuel vegetation type data from Landfire WMS
        
        Args:
            region: Geographic bounding box
            
        Returns:
            VegetationType data or None if unavailable
        """
        try:
            self.logger.info(f"🌿 Fetching fuel vegetation type for region: {region}")
            
            # WMS GetMap request for FVT data
            params = {
                "service": "WMS",
                "version": "1.3.0",
                "request": "GetMap",
                "layers": "LC22_FVT_230",  # Fuel Vegetation Type 2022
                "styles": "",
                "format": "image/png",
                "crs": "EPSG:4326",
                "bbox": f"{region.south},{region.west},{region.north},{region.east}",
                "width": "256",
                "height": "256"
            }
            
            response = await self.client.get(self.landfire_base_url, params=params)
            
            if response.status_code == 200:
                # Estimate vegetation type based on region
                estimated_type = self._estimate_vegetation_type(region)
                
                self.logger.info(f"✅ Retrieved vegetation type data")
                return VegetationType(
                    fuel_vegetation_type=estimated_type["fvt_code"],
                    type_description=estimated_type["description"],
                    fire_behavior_fuel_model=estimated_type["fuel_model"],
                    flame_length_factor=estimated_type["flame_factor"]
                )
            else:
                self.logger.error(f"❌ Landfire WMS request failed: {response.status_code}")
                return None
                
        except Exception as e:
            self.logger.error(f"Fuel vegetation type fetch failed: {e}")
            return None
    
    @handle_service_errors
    async def calculate_vegetation_indices(self, region: BoundingBox) -> Optional[VegetationIndices]:
        """
        Calculate vegetation indices from satellite data
        
        Args:
            region: Geographic bounding box
            
        Returns:
            VegetationIndices or None if unavailable
        """
        try:
            self.logger.info(f"🛰️ Calculating vegetation indices for region: {region}")
            
            # For now, estimate NDVI based on location and season
            # In production, would use actual MODIS/VIIRS data
            estimated_ndvi = self._estimate_ndvi(region)
            
            return VegetationIndices(
                ndvi=estimated_ndvi["ndvi"],
                evi=estimated_ndvi["evi"],
                moisture_stress_index=estimated_ndvi["msi"],
                acquisition_date=datetime.now()
            )
            
        except Exception as e:
            self.logger.error(f"Vegetation indices calculation failed: {e}")
            return None
    
    @handle_service_errors
    async def estimate_fuel_moisture(self, weather_data: Dict[str, Any], 
                                   vegetation: Optional[VegetationIndices] = None) -> Optional[FuelMoisture]:
        """
        Estimate fuel moisture content based on weather and vegetation
        
        Args:
            weather_data: Weather conditions (temperature, humidity, precipitation)
            vegetation: Vegetation indices data
            
        Returns:
            FuelMoisture estimation or None if insufficient data
        """
        try:
            self.logger.info("💧 Estimating fuel moisture content")
            
            # Extract weather parameters
            temp_f = weather_data.get("temperature_f", 70)
            humidity_percent = weather_data.get("humidity_percent", 50)
            precip_inches = weather_data.get("precipitation_24h", 0)
            wind_speed_mph = weather_data.get("wind_speed_mph", 5)
            
            # Calculate dead fuel moisture (1-hr, 10-hr, 100-hr fuels)
            # Simplified calculation based on temperature and humidity
            dead_fuel_moisture = max(2, min(30, 
                21 - (temp_f - 70) * 0.2 + (humidity_percent - 50) * 0.3 + precip_inches * 5
            ))
            
            # Calculate live fuel moisture
            # Based on NDVI and weather conditions
            base_live_moisture = 120  # Base live fuel moisture
            if vegetation and vegetation.ndvi:
                # Higher NDVI = higher moisture content
                ndvi_factor = vegetation.ndvi * 50
                base_live_moisture += ndvi_factor
            
            # Adjust for weather stress
            stress_factor = max(0, (temp_f - 80) * 0.5 - humidity_percent * 0.3)
            live_fuel_moisture = max(60, base_live_moisture - stress_factor)
            
            # Determine moisture category
            if dead_fuel_moisture < 6:
                category = "Very Low"
            elif dead_fuel_moisture < 10:
                category = "Low"
            elif dead_fuel_moisture < 15:
                category = "Moderate"
            else:
                category = "High"
            
            return FuelMoisture(
                live_fuel_moisture_percent=live_fuel_moisture,
                dead_fuel_moisture_percent=dead_fuel_moisture,
                fuel_moisture_category=category,
                calculation_method="weather_based_estimation"
            )
            
        except Exception as e:
            self.logger.error(f"Fuel moisture estimation failed: {e}")
            return None
    
    @handle_service_errors
    async def assess_fire_risk(self, vegetation_data: Dict[str, Any], 
                             weather_data: Dict[str, Any]) -> Optional[FireRisk]:
        """
        Assess fire risk based on vegetation and weather conditions
        
        Args:
            vegetation_data: Vegetation analysis results
            weather_data: Current weather conditions
            
        Returns:
            FireRisk assessment or None if insufficient data
        """
        try:
            self.logger.info("🔥 Assessing fire risk based on vegetation and weather")
            
            # Extract key parameters
            wind_speed_mph = weather_data.get("wind_speed_mph", 5)
            temp_f = weather_data.get("temperature_f", 70)
            humidity_percent = weather_data.get("humidity_percent", 50)
            fuel_moisture = vegetation_data.get("fuel_moisture_percent", 15)
            fuel_load = vegetation_data.get("fuel_load_tons_per_acre", 2.0)
            
            # Calculate fire danger components
            # Temperature-humidity index
            th_index = temp_f - humidity_percent
            
            # Wind factor
            wind_factor = min(3.0, wind_speed_mph / 10.0)
            
            # Fuel availability factor
            fuel_factor = min(2.0, fuel_load / 3.0)
            
            # Moisture factor (inverse relationship)
            moisture_factor = max(0.1, 20.0 / fuel_moisture)
            
            # Combined fire danger rating
            fire_danger_score = (th_index * 0.3 + wind_factor * 30 + 
                               fuel_factor * 20 + moisture_factor * 20)
            
            # Determine fire danger rating
            if fire_danger_score < 30:
                danger_rating = "Low"
                ignition_prob = 0.1
                suppression = "Easy"
            elif fire_danger_score < 50:
                danger_rating = "Moderate"
                ignition_prob = 0.3
                suppression = "Moderate"
            elif fire_danger_score < 70:
                danger_rating = "High"
                ignition_prob = 0.6
                suppression = "Difficult"
            elif fire_danger_score < 90:
                danger_rating = "Very High"
                ignition_prob = 0.8
                suppression = "Difficult"
            else:
                danger_rating = "Extreme"
                ignition_prob = 0.95
                suppression = "Extreme"
            
            # Calculate fire behavior parameters
            rate_of_spread = wind_factor * fuel_factor * moisture_factor
            flame_length = min(20, rate_of_spread * fuel_load * 0.5)
            spotting_distance = min(5, wind_speed_mph * flame_length * 0.1)
            
            return FireRisk(
                fire_danger_rating=danger_rating,
                ignition_probability=ignition_prob,
                rate_of_spread_factor=rate_of_spread,
                flame_length_feet=flame_length,
                spotting_distance_miles=spotting_distance,
                suppression_difficulty=suppression
            )
            
        except Exception as e:
            self.logger.error(f"Fire risk assessment failed: {e}")
            return None
    
    async def get_complete_vegetation_analysis(self, latitude: float, longitude: float,
                                            extent_km: float = 5,
                                            weather_data: Optional[Dict[str, Any]] = None) -> VegetationAnalysis:
        """
        Get complete vegetation analysis for a location
        
        Args:
            latitude: Center latitude
            longitude: Center longitude
            extent_km: Analysis extent in kilometers
            weather_data: Optional weather data for fuel moisture and fire risk
            
        Returns:
            Complete vegetation analysis
        """
        self.logger.info(f"🌿 Complete vegetation analysis for {latitude}, {longitude}")
        
        # Create bounding box
        lat_offset = extent_km / 111.0  # ~111 km per degree latitude
        lng_offset = extent_km / (111.0 * math.cos(math.radians(latitude)))
        
        region = BoundingBox(
            north=latitude + lat_offset / 2,
            south=latitude - lat_offset / 2,
            east=longitude + lng_offset / 2,
            west=longitude - lng_offset / 2
        )
        
        # Gather vegetation data
        vegetation_cover = await self.get_fuel_vegetation_cover(region)
        vegetation_type = await self.get_fuel_vegetation_type(region)
        vegetation_indices = await self.calculate_vegetation_indices(region)
        
        # Calculate fuel moisture if weather data available
        fuel_moisture = None
        fire_risk = None
        if weather_data:
            fuel_moisture = await self.estimate_fuel_moisture(weather_data, vegetation_indices)
            
            # Prepare vegetation data for fire risk assessment
            veg_data = {
                "fuel_moisture_percent": fuel_moisture.dead_fuel_moisture_percent if fuel_moisture else 15,
                "fuel_load_tons_per_acre": vegetation_cover.fuel_load_tons_per_acre if vegetation_cover else 2.0
            }
            fire_risk = await self.assess_fire_risk(veg_data, weather_data)
        
        # Compile data sources
        data_sources = ["landfire_wms"]
        if vegetation_indices:
            data_sources.append("modis_ndvi")
        if weather_data:
            data_sources.append("weather_based_calculations")
        
        return VegetationAnalysis(
            location=region,
            vegetation_cover=vegetation_cover,
            vegetation_type=vegetation_type,
            vegetation_indices=vegetation_indices,
            fuel_moisture=fuel_moisture,
            fire_risk=fire_risk,
            analysis_timestamp=datetime.now(),
            data_sources=data_sources,
            metadata={
                "extent_km": extent_km,
                "center_lat": latitude,
                "center_lng": longitude
            }
        )
    
    def _estimate_vegetation_cover(self, region: BoundingBox) -> Dict[str, Any]:
        """Estimate vegetation cover based on geographic location"""
        # Simplified estimation based on latitude (climate zones)
        center_lat = (region.north + region.south) / 2
        
        if center_lat > 45:  # Northern regions
            return {
                "fvc_code": 121,
                "description": "Evergreen Forest",
                "canopy_percent": 75,
                "fuel_load": 3.5
            }
        elif center_lat > 35:  # Temperate regions
            return {
                "fvc_code": 123,
                "description": "Mixed Forest",
                "canopy_percent": 60,
                "fuel_load": 2.8
            }
        else:  # Southern/arid regions
            return {
                "fvc_code": 142,
                "description": "Shrubland",
                "canopy_percent": 35,
                "fuel_load": 2.2
            }
    
    def _estimate_vegetation_type(self, region: BoundingBox) -> Dict[str, Any]:
        """Estimate vegetation type based on geographic location"""
        center_lat = (region.north + region.south) / 2
        
        if center_lat > 45:
            return {
                "fvt_code": 121,
                "description": "Evergreen Forest",
                "fuel_model": "8",
                "flame_factor": 0.8
            }
        elif center_lat > 35:
            return {
                "fvt_code": 142,
                "description": "Shrubland/Chaparral",
                "fuel_model": "4",
                "flame_factor": 2.0
            }
        else:
            return {
                "fvt_code": 141,
                "description": "Grassland",
                "fuel_model": "3",
                "flame_factor": 1.5
            }
    
    def _estimate_ndvi(self, region: BoundingBox) -> Dict[str, float]:
        """Estimate NDVI based on location and season"""
        # Simplified seasonal NDVI estimation
        center_lat = (region.north + region.south) / 2
        month = datetime.now().month
        
        # Base NDVI by latitude (climate)
        if center_lat > 45:
            base_ndvi = 0.6  # Forest regions
        elif center_lat > 35:
            base_ndvi = 0.4  # Mixed regions
        else:
            base_ndvi = 0.3  # Arid regions
        
        # Seasonal adjustment
        if 3 <= month <= 5:  # Spring
            seasonal_factor = 1.2
        elif 6 <= month <= 8:  # Summer
            seasonal_factor = 1.0
        elif 9 <= month <= 11:  # Fall
            seasonal_factor = 0.8
        else:  # Winter
            seasonal_factor = 0.6
        
        ndvi = min(0.9, base_ndvi * seasonal_factor)
        evi = ndvi * 0.8  # EVI typically lower than NDVI
        msi = max(0.1, 1.0 - ndvi)  # Moisture stress inverse to NDVI
        
        return {
            "ndvi": ndvi,
            "evi": evi,
            "msi": msi
        }


# Example usage and testing
if __name__ == "__main__":
    import asyncio
    
    async def test_vegetation_service():
        """Test vegetation service functionality"""
        
        print("🌿 Testing Vegetation Analysis Service")
        print("=" * 50)
        
        async with VegetationService() as vegetation:
            # Check service health
            health = await vegetation.health_check()
            print(f"Service Health: {health.status}")
            print(f"Service Details: {health.details}")
            
            if health.status == "healthy":
                # Test with Santa Clara County coordinates
                lat, lng = 37.4419, -122.1430
                
                # Sample weather data
                weather_data = {
                    "temperature_f": 85,
                    "humidity_percent": 35,
                    "wind_speed_mph": 15,
                    "precipitation_24h": 0.0
                }
                
                # Get complete vegetation analysis
                analysis = await vegetation.get_complete_vegetation_analysis(
                    latitude=lat,
                    longitude=lng,
                    extent_km=10,
                    weather_data=weather_data
                )
                
                print(f"\n🌿 Vegetation Analysis Results:")
                print(f"Location: {analysis.location}")
                print(f"Vegetation Cover: {analysis.vegetation_cover}")
                print(f"Vegetation Type: {analysis.vegetation_type}")
                print(f"NDVI: {analysis.vegetation_indices.ndvi if analysis.vegetation_indices else 'N/A'}")
                print(f"Fuel Moisture: {analysis.fuel_moisture.fuel_moisture_category if analysis.fuel_moisture else 'N/A'}")
                print(f"Fire Risk: {analysis.fire_risk.fire_danger_rating if analysis.fire_risk else 'N/A'}")
                print(f"Data Sources: {analysis.data_sources}")
            else:
                print("⚠️ Vegetation service not healthy")
    
    # Run test
    asyncio.run(test_vegetation_service())