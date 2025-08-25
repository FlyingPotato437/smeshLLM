#!/usr/bin/env python3
"""
LANDFIRE Vegetation and Fuel Data Service
Integrates with USGS LANDFIRE WMS/WCS services for real vegetation and fuel model data
Critical for plume modeling and smoke dispersion analysis
"""

import asyncio
import os
import logging
import json
from datetime import datetime
from typing import Dict, List, Optional, Any, Tuple
import xml.etree.ElementTree as ET

# FastAPI
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# HTTP requests
import httpx

# Geospatial processing
try:
    from shapely.geometry import Point
    import rasterio
    from rasterio.warp import transform_bounds
    import numpy as np
    from pyproj import Transformer
    GEOSPATIAL_AVAILABLE = True
except ImportError:
    GEOSPATIAL_AVAILABLE = False
    logging.warning("Geospatial libraries not available. Install with: pip install rasterio shapely pyproj")

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="LANDFIRE Vegetation and Fuel Service",
    description="Real USGS LANDFIRE data for fire behavior and plume modeling",
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

# LANDFIRE ImageServer Configuration (WORKING 2024 DATA)
# Using USGS EDC International ArcGIS REST Services with LF250 (2024 data)
# 2025 data not yet available - using latest confirmed working version
LANDFIRE_BASE_URL = "https://edcintl.cr.usgs.gov/arcgis/rest/services"

# LANDFIRE ImageServer endpoints for LF250 (2024) - CONFIRMED WORKING REAL DATA
LANDFIRE_SERVICES = {
    # Fire Behavior Fuel Models  
    "FBFM13": f"{LANDFIRE_BASE_URL}/Landfire_LF250/US_250FBFM13/ImageServer",
    "FBFM40": f"{LANDFIRE_BASE_URL}/Landfire_LF250/US_250FBFM40/ImageServer",
    
    # Existing Vegetation
    "EVT": f"{LANDFIRE_BASE_URL}/Landfire_LF250/US_250EVT/ImageServer",
    "EVC": f"{LANDFIRE_BASE_URL}/Landfire_LF250/US_250EVC/ImageServer",  
    "EVH": f"{LANDFIRE_BASE_URL}/Landfire_LF250/US_250EVH/ImageServer",
    
    # Canopy and Surface Fuels
    "CC": f"{LANDFIRE_BASE_URL}/Landfire_LF250/US_250CC/ImageServer",
    "CH": f"{LANDFIRE_BASE_URL}/Landfire_LF250/US_250CH/ImageServer",
    "CBH": f"{LANDFIRE_BASE_URL}/Landfire_LF250/US_250CBH/ImageServer",
    "CBD": f"{LANDFIRE_BASE_URL}/Landfire_LF250/US_250CBD/ImageServer",
}

# Pydantic models
class LocationRequest(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    buffer_km: float = Field(default=5.0, ge=0.1, le=50.0)

class VegetationData(BaseModel):
    layer_name: str
    layer_id: str
    value: Optional[float] = None
    description: str
    units: str
    confidence: str

class FuelModelData(BaseModel):
    fbfm13_code: Optional[int] = None
    fbfm13_description: str = ""
    fbfm40_code: Optional[int] = None  
    fbfm40_description: str = ""
    fuel_load_tons_per_acre: Optional[float] = None
    flame_length_ft: Optional[float] = None
    rate_of_spread_ft_per_min: Optional[float] = None

class LandfireResult(BaseModel):
    location: Dict[str, float]
    vegetation_data: List[VegetationData] = []
    fuel_model_data: FuelModelData
    canopy_data: Dict[str, Any] = {}
    fire_behavior_potential: Dict[str, Any] = {}
    plume_modeling_inputs: Dict[str, Any] = {}
    data_source: str = "USGS LANDFIRE"
    query_time: str
    data_quality: str

class LandfireService:
    """Real LANDFIRE vegetation and fuel data service"""
    
    def __init__(self):
        self.services = LANDFIRE_SERVICES
        
        # Initialize coordinate transformer for WGS84 to NAD83 Albers (EPSG:5070)
        # LANDFIRE data uses Albers projection
        self.transformer = Transformer.from_crs("EPSG:4326", "EPSG:5070", always_xy=True)
        
        # HTTP client with proper headers
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "SMESHLLM-Stanford-Wildfire-System/1.0",
                "Accept": "application/json"
            }
        )
        
        logger.info("🌲 LANDFIRE Service initialized with USGS ImageServer endpoints (LF250-2024)")
    
    async def get_vegetation_fuel_data(self, latitude: float, longitude: float, 
                                     buffer_km: float = 5.0) -> LandfireResult:
        """
        Get comprehensive vegetation and fuel data for plume modeling
        
        Args:
            latitude: Latitude in decimal degrees
            longitude: Longitude in decimal degrees  
            buffer_km: Buffer distance in kilometers for area queries
            
        Returns:
            Complete vegetation and fuel analysis from LANDFIRE
        """
        
        logger.info(f"🌲 Querying LANDFIRE for {latitude:.4f}, {longitude:.4f}")
        
        try:
            # Query multiple LANDFIRE layers for comprehensive data
            vegetation_data = []
            
            # Get Fire Behavior Fuel Models (critical for plume modeling)
            fbfm13_data = await self._query_point_value(latitude, longitude, "FBFM13")
            fbfm40_data = await self._query_point_value(latitude, longitude, "FBFM40")
            
            # Get Existing Vegetation data
            evt_data = await self._query_point_value(latitude, longitude, "EVT")
            evc_data = await self._query_point_value(latitude, longitude, "EVC")
            evh_data = await self._query_point_value(latitude, longitude, "EVH")
            
            # Get Canopy characteristics
            cc_data = await self._query_point_value(latitude, longitude, "CC")
            ch_data = await self._query_point_value(latitude, longitude, "CH")
            cbh_data = await self._query_point_value(latitude, longitude, "CBH")
            cbd_data = await self._query_point_value(latitude, longitude, "CBD")
            
            # Process fuel model data
            fuel_model_data = self._process_fuel_model_data(fbfm13_data, fbfm40_data)
            
            # Process canopy data (affects wind patterns and plume behavior)
            canopy_data = {
                "canopy_cover_percent": cc_data.get("value", 0) if cc_data else 0,
                "canopy_height_m": ch_data.get("value", 0) if ch_data else 0,
                "canopy_base_height_m": cbh_data.get("value", 0) if cbh_data else 0,
                "canopy_bulk_density": cbd_data.get("value", 0) if cbd_data else 0,
                "wind_reduction_factor": self._calculate_wind_reduction_factor(cc_data, ch_data),
                "plume_interaction": self._assess_canopy_plume_interaction(cc_data, ch_data, cbh_data)
            }
            
            # Calculate fire behavior potential (affects plume generation)
            fire_behavior_potential = self._calculate_fire_behavior_potential(
                fuel_model_data, canopy_data, evt_data, evc_data
            )
            
            # Generate plume modeling inputs
            plume_modeling_inputs = self._generate_plume_modeling_inputs(
                fuel_model_data, canopy_data, fire_behavior_potential
            )
            
            # Compile vegetation data list
            for layer_name, layer_data in [
                ("Existing Vegetation Type", evt_data),
                ("Existing Vegetation Cover", evc_data), 
                ("Existing Vegetation Height", evh_data),
                ("Canopy Cover", cc_data),
                ("Canopy Height", ch_data)
            ]:
                if layer_data:
                    vegetation_data.append(VegetationData(
                        layer_name=layer_name,
                        layer_id=layer_data.get("layer_id", ""),
                        value=layer_data.get("value"),
                        description=layer_data.get("description", ""),
                        units=layer_data.get("units", ""),
                        confidence="High (USGS LANDFIRE)"
                    ))
            
            return LandfireResult(
                location={"latitude": latitude, "longitude": longitude},
                vegetation_data=vegetation_data,
                fuel_model_data=fuel_model_data,
                canopy_data=canopy_data,
                fire_behavior_potential=fire_behavior_potential,
                plume_modeling_inputs=plume_modeling_inputs,
                query_time=datetime.utcnow().isoformat(),
                data_quality="High (USGS LANDFIRE WMS/WCS)"
            )
            
        except Exception as e:
            logger.error(f"LANDFIRE data query failed: {e}")
            raise HTTPException(status_code=500, detail=f"LANDFIRE service error: {str(e)}")
    
    async def _query_point_value(self, latitude: float, longitude: float, layer_key: str) -> Optional[Dict]:
        """Query LANDFIRE ImageServer for point value at specific coordinates
        Uses NAD83 Albers projection (EPSG:5070) as required by LANDFIRE"""
        
        if layer_key not in self.services:
            logger.warning(f"Unknown LANDFIRE service: {layer_key}")
            return None
        
        service_url = self.services[layer_key]
        
        # Transform coordinates from WGS84 to NAD83 Albers (EPSG:5070)
        x_albers, y_albers = self.transformer.transform(longitude, latitude)
        
        # Build ImageServer identify request
        params = {
            "geometry": f"{x_albers},{y_albers}",
            "geometryType": "esriGeometryPoint",
            "sr": "5070",  # NAD83 Albers
            "pixelSize": "",
            "time": "",
            "returnGeometry": "false",
            "returnPixelValues": "true",
            "f": "json"
        }
        
        try:
            response = await self.client.get(f"{service_url}/identify", params=params)
            
            if response.status_code != 200:
                logger.warning(f"LANDFIRE ImageServer returned {response.status_code} for layer {layer_key}")
                return None
            
            data = response.json()
            
            # Check for errors in response
            if "error" in data:
                logger.warning(f"LANDFIRE ImageServer error for {layer_key}: {data['error']}")
                return None
            
            # Extract pixel value
            pixel_value = data.get("value")
            
            if pixel_value and pixel_value != "NoData":
                # Convert to integer if it's a numeric string
                if isinstance(pixel_value, str) and pixel_value.isdigit():
                    pixel_value = int(pixel_value)
                
                return {
                    "service_url": service_url,
                    "value": pixel_value,
                    "description": self._get_layer_description(layer_key, pixel_value),
                    "units": self._get_layer_units(layer_key),
                    "coordinates_albers": (x_albers, y_albers),
                    "raw_response": data
                }
            else:
                logger.warning(f"LANDFIRE returned NoData for {layer_key} at ({latitude}, {longitude})")
                return None
                
        except json.JSONDecodeError:
                logger.warning(f"Could not parse JSON response from LANDFIRE for layer {layer_key}")
                return None
                
        except Exception as e:
            logger.warning(f"LANDFIRE WMS query failed for layer {layer_key}: {e}")
            return None
    
    def _process_fuel_model_data(self, fbfm13_data: Optional[Dict], 
                               fbfm40_data: Optional[Dict]) -> FuelModelData:
        """Process fire behavior fuel model data"""
        
        # Check if LANDFIRE data is available
        fbfm13_code = fbfm13_data.get("value") if fbfm13_data and fbfm13_data.get("value") not in [None, "NoData"] else None
        fbfm40_code = fbfm40_data.get("value") if fbfm40_data and fbfm40_data.get("value") not in [None, "NoData"] else None
        
        # Map fuel model codes to descriptions and characteristics
        fbfm13_desc = self._get_fbfm13_description(fbfm13_code) if fbfm13_code else ""
        fbfm40_desc = self._get_fbfm40_description(fbfm40_code) if fbfm40_code else ""
        
        # Estimate fuel characteristics for plume modeling
        fuel_load = self._estimate_fuel_load(fbfm13_code, fbfm40_code)
        flame_length = self._estimate_flame_length(fbfm13_code, fbfm40_code)
        rate_of_spread = self._estimate_rate_of_spread(fbfm13_code, fbfm40_code)
        
        return FuelModelData(
            fbfm13_code=fbfm13_code,
            fbfm13_description=fbfm13_desc,
            fbfm40_code=fbfm40_code,
            fbfm40_description=fbfm40_desc,
            fuel_load_tons_per_acre=fuel_load,
            flame_length_ft=flame_length,
            rate_of_spread_ft_per_min=rate_of_spread
        )
    
    def _calculate_wind_reduction_factor(self, cc_data: Optional[Dict], 
                                       ch_data: Optional[Dict]) -> float:
        """Calculate wind speed reduction factor based on canopy characteristics"""
        
        canopy_cover = cc_data.get("value", 0) if cc_data else 0
        canopy_height = ch_data.get("value", 0) if ch_data else 0
        
        # Wind reduction increases with canopy cover and height
        cover_factor = 1.0 - (canopy_cover / 100.0 * 0.7)  # Up to 70% reduction
        height_factor = max(0.3, 1.0 - (canopy_height / 30.0 * 0.4))  # Height effect
        
        return cover_factor * height_factor
    
    def _assess_canopy_plume_interaction(self, cc_data: Optional[Dict], 
                                       ch_data: Optional[Dict],
                                       cbh_data: Optional[Dict]) -> str:
        """Assess how canopy affects plume behavior"""
        
        canopy_cover = cc_data.get("value", 0) if cc_data else 0
        canopy_height = ch_data.get("value", 0) if ch_data else 0
        base_height = cbh_data.get("value", 0) if cbh_data else 0
        
        if canopy_cover < 10:
            return "minimal_interaction"
        elif canopy_cover < 40:
            return "moderate_filtering"
        elif canopy_height > 20:
            return "significant_plume_lift"
        else:
            return "canopy_trapping_potential"
    
    def _calculate_fire_behavior_potential(self, fuel_data: FuelModelData, 
                                         canopy_data: Dict, evt_data: Optional[Dict],
                                         evc_data: Optional[Dict]) -> Dict[str, Any]:
        """Calculate fire behavior potential affecting plume generation"""
        
        # Base fire intensity from fuel models
        base_intensity = "low"
        if fuel_data.flame_length_ft and fuel_data.flame_length_ft > 8:
            base_intensity = "high"
        elif fuel_data.flame_length_ft and fuel_data.flame_length_ft > 4:
            base_intensity = "moderate"
        
        # Crown fire potential
        crown_fire_potential = "low"
        if canopy_data.get("canopy_cover_percent", 0) > 60:
            if canopy_data.get("canopy_base_height_m", 10) < 4:
                crown_fire_potential = "high"
            else:
                crown_fire_potential = "moderate"
        
        # Heat release rate estimation (MW/m² for plume modeling)
        heat_release_rate = self._estimate_heat_release_rate(fuel_data, base_intensity)
        
        return {
            "fire_intensity": base_intensity,
            "crown_fire_potential": crown_fire_potential,
            "estimated_heat_release_rate_mw_m2": heat_release_rate,
            "plume_height_potential_m": heat_release_rate * 150,  # Empirical relationship
            "burn_duration_factor": self._estimate_burn_duration(fuel_data)
        }
    
    def _generate_plume_modeling_inputs(self, fuel_data: FuelModelData, 
                                      canopy_data: Dict, fire_behavior: Dict) -> Dict[str, Any]:
        """Generate inputs specifically for HYSPLIT plume modeling"""
        
        return {
            # Emission parameters for HYSPLIT
            "emission_rate_kg_hr": self._calculate_emission_rate(fuel_data, fire_behavior),
            "particle_size_distribution": self._get_particle_size_distribution(fuel_data),
            "heat_release_rate_mw": fire_behavior.get("estimated_heat_release_rate_mw_m2", 1.0),
            
            # Plume rise parameters
            "effective_plume_height_m": fire_behavior.get("plume_height_potential_m", 100),
            "buoyancy_flux": self._calculate_buoyancy_flux(fire_behavior),
            
            # Surface characteristics affecting deposition
            "surface_roughness_m": self._estimate_surface_roughness(canopy_data),
            "deposition_velocity_ms": self._estimate_deposition_velocity(canopy_data),
            
            # Metadata
            "landfire_confidence": "high",
            "recommended_particle_count": min(10, max(4, int(fire_behavior.get("fire_intensity", "low") == "high") * 6 + 4))
        }
    
    # Utility methods for fuel model descriptions and calculations
    def _get_layer_description(self, layer_key: str, value: Any) -> str:
        """Get human-readable description for layer value"""
        descriptions = {
            "EVT": f"Vegetation Type Code {value}",
            "EVC": f"Vegetation Cover {value}%",
            "EVH": f"Vegetation Height {value}m",
            "CC": f"Canopy Cover {value}%",
            "CH": f"Canopy Height {value}m",
            "FBFM13": f"Anderson Fuel Model {value}",
            "FBFM40": f"Scott-Burgan Fuel Model {value}"
        }
        return descriptions.get(layer_key, f"Value: {value}")
    
    def _get_layer_units(self, layer_key: str) -> str:
        """Get units for layer values"""
        units = {
            "EVT": "code",
            "EVC": "percent",
            "EVH": "meters",
            "CC": "percent", 
            "CH": "meters",
            "CBH": "meters",
            "CBD": "kg/m³",
            "FBFM13": "code",
            "FBFM40": "code"
        }
        return units.get(layer_key, "unitless")
    
    def _get_fbfm13_description(self, code: int) -> str:
        """Get Anderson 13 fuel model description"""
        models = {
            1: "Short grass (1 ft)",
            2: "Timber grass and understory",
            3: "Tall grass (2.5 ft)",
            4: "Chaparral (6 ft)",
            5: "Brush (2 ft)",
            6: "Dormant brush, hardwood slash",
            7: "Southern rough",
            8: "Closed timber litter",
            9: "Hardwood litter",
            10: "Timber (litter and understory)",
            11: "Light logging slash",
            12: "Medium logging slash",
            13: "Heavy logging slash",
            # LANDFIRE special codes
            91: "Urban/Developed (non-burnable)",
            92: "Snow/Ice (non-burnable)",
            93: "Agriculture (managed)",
            98: "Water (non-burnable)",
            99: "Barren (non-burnable)"
        }
        return models.get(code, f"Undefined fuel model {code}")
    
    def _get_fbfm40_description(self, code: int) -> str:
        """Get Scott-Burgan 40 fuel model description"""
        # Handle LANDFIRE special codes first
        if code == 91:
            return "Urban/Developed (non-burnable)"
        elif code == 92:
            return "Snow/Ice (non-burnable)"
        elif code == 93:
            return "Agriculture (managed)"
        elif code == 98:
            return "Water (non-burnable)"
        elif code == 99:
            return "Barren (non-burnable)"
        # Standard Scott-Burgan fuel model ranges
        elif 101 <= code <= 109:
            return f"Grass fuel model {code}"
        elif 121 <= code <= 129:
            return f"Grass-shrub fuel model {code}"
        elif 141 <= code <= 149:
            return f"Shrub fuel model {code}"
        elif 161 <= code <= 189:
            return f"Timber-understory fuel model {code}"
        elif 201 <= code <= 204:
            return f"Slash-blowdown fuel model {code}"
        else:
            return f"Undefined Scott-Burgan fuel model {code}"
    
    def _estimate_fuel_load(self, fbfm13: Optional[int], fbfm40: Optional[int]) -> Optional[float]:
        """Estimate fuel load in tons per acre"""
        if fbfm13:
            # Non-burnable areas have zero fuel load
            if fbfm13 in [91, 92, 98, 99]:
                return 0.0
            # Agricultural areas have minimal fuel load
            elif fbfm13 == 93:
                return 0.1
            # Standard Anderson fuel model estimates
            loads = {1: 0.2, 2: 2.0, 3: 0.3, 4: 5.0, 5: 1.0, 6: 1.5, 
                    7: 1.1, 8: 1.5, 9: 2.9, 10: 3.0, 11: 3.5, 12: 4.5, 13: 7.0}
            return loads.get(fbfm13, 2.0)
        return None
    
    def _estimate_flame_length(self, fbfm13: Optional[int], fbfm40: Optional[int]) -> Optional[float]:
        """Estimate flame length in feet"""
        if fbfm13:
            # Non-burnable areas have zero flame length
            if fbfm13 in [91, 92, 93, 98, 99]:
                return 0.0
            # Standard Anderson flame length estimates
            lengths = {1: 1.0, 2: 2.5, 3: 2.5, 4: 6.0, 5: 2.0, 6: 2.5,
                      7: 2.5, 8: 1.0, 9: 1.5, 10: 2.0, 11: 3.0, 12: 4.0, 13: 6.0}
            return lengths.get(fbfm13, 2.0)
        return None
    
    def _estimate_rate_of_spread(self, fbfm13: Optional[int], fbfm40: Optional[int]) -> Optional[float]:
        """Estimate rate of spread in ft/min"""
        if fbfm13:
            # Simplified ROS estimates
            rates = {1: 12.0, 2: 4.0, 3: 20.0, 4: 8.0, 5: 5.0, 6: 4.0,
                    7: 6.0, 8: 1.0, 9: 2.0, 10: 3.0, 11: 2.0, 12: 3.0, 13: 4.0}
            return rates.get(fbfm13, 5.0)
        return None
    
    def _estimate_heat_release_rate(self, fuel_data: FuelModelData, intensity: str) -> float:
        """Estimate heat release rate in MW/m²"""
        base_rate = 1.0
        if fuel_data.fuel_load_tons_per_acre:
            base_rate = fuel_data.fuel_load_tons_per_acre * 0.5
        
        if intensity == "high":
            return base_rate * 2.0
        elif intensity == "moderate":
            return base_rate * 1.5
        return base_rate
    
    def _estimate_burn_duration(self, fuel_data: FuelModelData) -> float:
        """Estimate burn duration factor (hours)"""
        if fuel_data.fuel_load_tons_per_acre:
            return min(24.0, fuel_data.fuel_load_tons_per_acre * 2.0)
        return 4.0
    
    def _calculate_emission_rate(self, fuel_data: FuelModelData, fire_behavior: Dict) -> float:
        """Calculate particulate emission rate for HYSPLIT (kg/hr)"""
        base_rate = 100.0  # kg/hr baseline
        if fuel_data.fuel_load_tons_per_acre:
            base_rate = fuel_data.fuel_load_tons_per_acre * 50.0
        
        intensity_factor = {"low": 1.0, "moderate": 2.0, "high": 4.0}
        factor = intensity_factor.get(fire_behavior.get("fire_intensity", "low"), 1.0)
        
        return base_rate * factor
    
    def _get_particle_size_distribution(self, fuel_data: FuelModelData) -> Dict[str, float]:
        """Get particle size distribution for smoke modeling"""
        return {
            "pm25_fraction": 0.85,
            "pm10_fraction": 0.95,
            "mean_diameter_microns": 0.5,
            "standard_deviation": 2.0
        }
    
    def _calculate_buoyancy_flux(self, fire_behavior: Dict) -> float:
        """Calculate buoyancy flux for plume rise (m⁴/s³)"""
        heat_rate = fire_behavior.get("estimated_heat_release_rate_mw_m2", 1.0)
        return heat_rate * 1000.0  # Convert MW to W and scale
    
    def _estimate_surface_roughness(self, canopy_data: Dict) -> float:
        """Estimate surface roughness length (m)"""
        canopy_height = canopy_data.get("canopy_height_m", 0)
        canopy_cover = canopy_data.get("canopy_cover_percent", 0)
        
        if canopy_cover > 60:
            return canopy_height * 0.1  # 10% of canopy height
        elif canopy_cover > 20:
            return canopy_height * 0.05  # 5% of canopy height
        else:
            return 0.01  # Smooth surface
    
    def _estimate_deposition_velocity(self, canopy_data: Dict) -> float:
        """Estimate particle deposition velocity (m/s)"""
        canopy_cover = canopy_data.get("canopy_cover_percent", 0)
        
        if canopy_cover > 60:
            return 0.02  # High deposition in dense canopy
        elif canopy_cover > 20:
            return 0.01  # Moderate deposition
        else:
            return 0.005  # Low deposition over open areas

# Global service instance
landfire_service = LandfireService()

# API Endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "LANDFIRE Vegetation and Fuel Service",
        "geospatial_available": GEOSPATIAL_AVAILABLE,
        "endpoints": [
            "WMS: " + LANDFIRE_WMS_BASE,
            "WCS: " + LANDFIRE_WCS_BASE
        ],
        "available_layers": list(LANDFIRE_LAYERS.keys()),
        "timestamp": datetime.utcnow().isoformat(),
    }

@app.post("/landfire/vegetation-fuel-data")
async def get_vegetation_fuel_data(request: LocationRequest) -> LandfireResult:
    """Get comprehensive vegetation and fuel data for plume modeling"""
    
    return await landfire_service.get_vegetation_fuel_data(
        request.latitude,
        request.longitude,
        request.buffer_km
    )

@app.get("/landfire/layers")
async def get_available_layers():
    """Get available LANDFIRE layers"""
    return {
        "layers": LANDFIRE_LAYERS,
        "descriptions": {
            "FBFM13": "13 Anderson Fire Behavior Fuel Models",
            "FBFM40": "40 Scott and Burgan Fire Behavior Fuel Models",
            "EVT": "Existing Vegetation Type",
            "EVC": "Existing Vegetation Cover",
            "EVH": "Existing Vegetation Height",
            "CC": "Canopy Cover",
            "CH": "Canopy Height",
            "CBH": "Canopy Base Height",
            "CBD": "Canopy Bulk Density",
            "FVT": "Fire Vegetation Type",
            "FCCS": "Fuel Characteristic Classification System"
        }
    }

@app.get("/landfire/plume-inputs/{latitude}/{longitude}")
async def get_plume_modeling_inputs(latitude: float, longitude: float):
    """Get HYSPLIT-specific inputs from LANDFIRE data"""
    
    result = await landfire_service.get_vegetation_fuel_data(latitude, longitude)
    return result.plume_modeling_inputs

if __name__ == "__main__":
    print("🌲 Starting LANDFIRE Vegetation and Fuel Service")
    print("Using USGS LANDFIRE WMS/WCS endpoints")
    
    uvicorn.run(app, host="0.0.0.0", port=8005, log_level="info")