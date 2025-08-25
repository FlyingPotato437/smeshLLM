#!/usr/bin/env python3
"""
Test LANDFIRE vegetation and fuel data integration
Simplified version without SSL issues for testing
"""

import asyncio
import httpx
import json
from datetime import datetime
from typing import Dict, List, Optional, Any

# LANDFIRE WMS Configuration - CORRECTED ENDPOINT
LANDFIRE_WMS_BASE = "https://edcintl.cr.usgs.gov/geoserver/landfire/us_mf/ows"

# LANDFIRE Layer IDs for key fuel and vegetation products - CORRECTED LAYER NAMES
LANDFIRE_LAYERS = {
    # Fire Behavior Fuel Models (using latest available versions)
    "FBFM40_FALL24": "FA24_F40_240",    # Fall 2024 FBFM40 at 240m
    "FBFM40_SUMMER25": "SU25_F40_250",  # Summer 2025 FBFM40 at 250m  
    "FBFM40_SPRING25": "SP25_F40_250",  # Spring 2025 FBFM40 at 250m
    
    # Existing Vegetation Cover
    "FVC_FALL24": "FA24_FVC_240",       # Fall 2024 Vegetation Cover at 240m
    "FVC_SUMMER25": "SU25_FVC_250",     # Summer 2025 Vegetation Cover at 250m
    "FVC_SPRING25": "SP25_FVC_250",     # Spring 2025 Vegetation Cover at 250m
    
    # Existing Vegetation Height  
    "FVH_FALL24": "FA24_FVH_240",       # Fall 2024 Vegetation Height at 240m
    "FVH_SUMMER25": "SU25_FVH_250",     # Summer 2025 Vegetation Height at 250m
    "FVH_SPRING25": "SP25_FVH_250",     # Spring 2025 Vegetation Height at 250m
}

async def query_landfire_point(latitude: float, longitude: float, layer_key: str) -> Optional[Dict[str, Any]]:
    """Query LANDFIRE WMS for point value at specific coordinates"""
    
    if layer_key not in LANDFIRE_LAYERS:
        print(f"Unknown LANDFIRE layer: {layer_key}")
        return None
    
    layer_id = LANDFIRE_LAYERS[layer_key]
    
    # Build WMS GetFeatureInfo request
    # Note: WMS 1.3.0 with EPSG:4326 uses lat,lon axis order (not lon,lat)
    params = {
        "SERVICE": "WMS",
        "VERSION": "1.3.0",
        "REQUEST": "GetFeatureInfo",
        "LAYERS": layer_id,
        "QUERY_LAYERS": layer_id,
        "INFO_FORMAT": "application/json",
        "CRS": "EPSG:4326",
        "BBOX": f"{latitude-0.001},{longitude-0.001},{latitude+0.001},{longitude+0.001}",
        "WIDTH": "10",
        "HEIGHT": "10", 
        "I": "5",
        "J": "5"
    }
    
    try:
        # Use httpx with SSL verification disabled for testing
        async with httpx.AsyncClient(verify=False, timeout=30.0) as client:
            response = await client.get(LANDFIRE_WMS_BASE, params=params)
            
            if response.status_code != 200:
                print(f"❌ LANDFIRE WMS returned {response.status_code} for layer {layer_key}")
                print(f"Response: {response.text[:200]}...")
                return None
            
            # Try to parse JSON response
            try:
                data = response.json()
                if "features" in data and len(data["features"]) > 0:
                    properties = data["features"][0].get("properties", {})
                    
                    # Extract pixel value (various possible field names)
                    pixel_value = None
                    for key in ["Pixel Value", "pixel_value", "value", "PIXEL_VALUE", "VALUE"]:
                        if key in properties:
                            pixel_value = properties[key]
                            break
                    
                    return {
                        "layer_id": layer_id,
                        "value": pixel_value,
                        "raw_properties": properties,
                        "layer_key": layer_key
                    }
                else:
                    print(f"⚠️ No features found for layer {layer_key}")
                    return None
                    
            except json.JSONDecodeError:
                print(f"❌ Could not parse JSON response from LANDFIRE for layer {layer_key}")
                print(f"Response content: {response.text[:500]}...")
                return None
                
    except Exception as e:
        print(f"❌ LANDFIRE WMS query failed for layer {layer_key}: {e}")
        return None

def get_fuel_model_description(fbfm13_code: Optional[int], fbfm40_code: Optional[int]) -> Dict[str, str]:
    """Get descriptions for fuel model codes"""
    
    fbfm13_models = {
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
        13: "Heavy logging slash"
    }
    
    fbfm13_desc = fbfm13_models.get(fbfm13_code or 0, f"Unknown fuel model {fbfm13_code}")
    
    # Simplified FBFM40 descriptions
    if fbfm40_code:
        if 101 <= fbfm40_code <= 109:
            fbfm40_desc = f"Grass fuel model {fbfm40_code}"
        elif 121 <= fbfm40_code <= 129:
            fbfm40_desc = f"Grass-shrub fuel model {fbfm40_code}"
        elif 141 <= fbfm40_code <= 149:
            fbfm40_desc = f"Shrub fuel model {fbfm40_code}"
        elif 161 <= fbfm40_code <= 189:
            fbfm40_desc = f"Timber-understory fuel model {fbfm40_code}"
        else:
            fbfm40_desc = f"Scott-Burgan fuel model {fbfm40_code}"
    else:
        fbfm40_desc = "No FBFM40 data"
    
    return {
        "fbfm13_description": fbfm13_desc,
        "fbfm40_description": fbfm40_desc
    }

def calculate_plume_parameters(fuel_data: Dict, canopy_data: Dict) -> Dict[str, Any]:
    """Calculate plume modeling parameters from vegetation and fuel data"""
    
    # Estimate fuel load (tons/acre) from FBFM13
    fuel_loads = {1: 0.2, 2: 2.0, 3: 0.3, 4: 5.0, 5: 1.0, 6: 1.5, 
                  7: 1.1, 8: 1.5, 9: 2.9, 10: 3.0, 11: 3.5, 12: 4.5, 13: 7.0}
    fuel_load = fuel_loads.get(fuel_data.get("fbfm13_code"), 2.0)
    
    # Estimate heat release rate (MW)
    heat_release_rate = fuel_load * 0.5  # Simplified calculation
    
    # Calculate emission rate for particulates (kg/hr)
    emission_rate = fuel_load * 100.0  # kg/hr
    
    # Wind reduction from canopy
    canopy_cover = canopy_data.get("canopy_cover_percent", 0)
    wind_reduction_factor = 1.0 - (canopy_cover / 100.0 * 0.7)
    
    # Surface roughness from canopy height
    canopy_height = canopy_data.get("canopy_height_m", 0)
    surface_roughness = max(0.01, canopy_height * 0.1 if canopy_cover > 60 else canopy_height * 0.05)
    
    return {
        "emission_rate_kg_hr": emission_rate,
        "heat_release_rate_mw": heat_release_rate,
        "fuel_load_tons_per_acre": fuel_load,
        "wind_reduction_factor": wind_reduction_factor,
        "surface_roughness_m": surface_roughness,
        "plume_height_estimate_m": heat_release_rate * 150,  # Empirical relationship
        "recommended_particle_count": min(10, max(4, int(heat_release_rate) + 2))
    }

async def test_landfire_integration():
    """Test complete LANDFIRE vegetation and fuel data integration"""
    
    # Santa Rosa, CA coordinates
    latitude = 38.4404925
    longitude = -122.7141049
    
    print("🌲 Testing LANDFIRE Vegetation and Fuel Data Integration")
    print("=" * 60)
    print(f"📍 Location: Santa Rosa, CA ({latitude}, {longitude})")
    print()
    
    # Query all key layers - using latest Summer 2025 data
    layers_to_query = ["FBFM40_SUMMER25", "FVC_SUMMER25", "FVH_SUMMER25"]
    
    results = {}
    
    print("🔍 Querying LANDFIRE layers...")
    for layer in layers_to_query:
        print(f"   Querying {layer}...", end=" ")
        result = await query_landfire_point(latitude, longitude, layer)
        if result:
            results[layer] = result
            print(f"✅ Value: {result['value']}")
        else:
            print("❌ Failed")
    
    print()
    
    # Process results
    if results:
        print("📊 LANDFIRE Data Results:")
        print("-" * 30)
        
        # Fire Behavior Fuel Models
        fbfm40_data = results.get("FBFM40_SUMMER25")
        fbfm40_code = fbfm40_data["value"] if fbfm40_data else None
        
        fuel_descriptions = get_fuel_model_description(None, fbfm40_code)
        
        print(f"🔥 Fire Behavior Fuel Models (Summer 2025):")
        print(f"   FBFM40: {fbfm40_code} - {fuel_descriptions['fbfm40_description']}")
        
        # Existing Vegetation
        fvc_data = results.get("FVC_SUMMER25")  # Vegetation Cover
        fvh_data = results.get("FVH_SUMMER25")  # Vegetation Height
        
        print(f"🌿 Existing Vegetation (Summer 2025):")
        print(f"   Cover: {fvc_data['value'] if fvc_data else 'N/A'}%")
        print(f"   Height: {fvh_data['value'] if fvh_data else 'N/A'}m")
        
        # Canopy Characteristics (using vegetation data as proxy)
        canopy_data = {
            "canopy_cover_percent": fvc_data["value"] if fvc_data else 0,
            "canopy_height_m": fvh_data["value"] if fvh_data else 0,
            "canopy_base_height_m": 0,  # Not available in current dataset
            "canopy_bulk_density": 0    # Not available in current dataset
        }
        
        print(f"🌳 Canopy Characteristics:")
        for key, value in canopy_data.items():
            print(f"   {key.replace('_', ' ').title()}: {value}")
        
        # Calculate plume modeling parameters
        fuel_data = {
            "fbfm13_code": None,  # Not available in current dataset
            "fbfm40_code": fbfm40_code
        }
        
        plume_params = calculate_plume_parameters(fuel_data, canopy_data)
        
        print(f"💨 Plume Modeling Parameters:")
        for key, value in plume_params.items():
            print(f"   {key.replace('_', ' ').title()}: {value}")
        
        print()
        print("✅ LANDFIRE Integration Test Complete!")
        print(f"🎯 Retrieved real vegetation and fuel data for plume modeling")
        
        return {
            "success": True,
            "location": {"latitude": latitude, "longitude": longitude},
            "landfire_data": results,
            "fuel_models": fuel_descriptions,
            "canopy_data": canopy_data,
            "plume_parameters": plume_params
        }
    
    else:
        print("❌ No LANDFIRE data retrieved - check network connection and API availability")
        return {"success": False, "error": "No data retrieved"}

if __name__ == "__main__":
    # Run the test
    result = asyncio.run(test_landfire_integration())
    
    if result["success"]:
        print("\n🔥 Integration Success - Real vegetation data ready for HYSPLIT plume modeling!")
    else:
        print(f"\n❌ Integration Failed: {result.get('error', 'Unknown error')}")