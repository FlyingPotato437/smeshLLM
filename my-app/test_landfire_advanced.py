#!/usr/bin/env python3
"""
Advanced LANDFIRE testing - try different coordinate systems and approaches
"""

import requests
import json
from pyproj import Transformer

# Santa Clara, CA coordinates
latitude = 37.3541132
longitude = -121.955174

# Try converting to different coordinate systems
def convert_coordinates():
    """Convert lat/lon to different coordinate systems LANDFIRE might use"""
    
    # WGS84 to NAD83 Albers (EPSG:5070) - commonly used by LANDFIRE
    transformer = Transformer.from_crs("EPSG:4326", "EPSG:5070", always_xy=True)
    x_albers, y_albers = transformer.transform(longitude, latitude)
    
    # WGS84 to Web Mercator (EPSG:3857)
    transformer_mercator = Transformer.from_crs("EPSG:4326", "EPSG:3857", always_xy=True)
    x_mercator, y_mercator = transformer_mercator.transform(longitude, latitude)
    
    return {
        "wgs84": (longitude, latitude),
        "albers": (x_albers, y_albers),
        "mercator": (x_mercator, y_mercator)
    }

def test_landfire_with_projection(service_url, coords_dict):
    """Test LANDFIRE with different coordinate projections"""
    
    for proj_name, (x, y) in coords_dict.items():
        print(f"\n--- Testing with {proj_name.upper()} coordinates: ({x:.2f}, {y:.2f}) ---")
        
        if proj_name == "wgs84":
            sr = "4326"
        elif proj_name == "albers":
            sr = "5070"
        elif proj_name == "mercator":
            sr = "3857"
        
        params = {
            'geometry': f'{x},{y}',
            'geometryType': 'esriGeometryPoint',
            'sr': sr,
            'pixelSize': '',
            'time': '',
            'returnGeometry': 'false',
            'returnPixelValues': 'true',
            'f': 'json'
        }
        
        try:
            response = requests.get(f"{service_url}/identify", params=params, timeout=10)
            
            if response.status_code == 200:
                data = response.json()
                value = data.get('value')
                if value and value != 'NoData':
                    print(f"✅ SUCCESS with {proj_name}: Value = {value}")
                    return data
                else:
                    print(f"❌ {proj_name}: {value}")
            else:
                print(f"❌ {proj_name}: HTTP {response.status_code}")
                
        except Exception as e:
            print(f"❌ {proj_name}: Error - {e}")
    
    return None

def test_landfire_alternative_services():
    """Test alternative LANDFIRE service endpoints"""
    
    # Different base URLs to try (prioritize 2025 data)
    base_urls = [
        "https://edcintl.cr.usgs.gov/arcgis/rest/services/Landfire_LF250_MoD-FIS_2025/US_250FBFM13/ImageServer",
        "https://edcintl.cr.usgs.gov/arcgis/rest/services/Landfire_LF250/US_250FBFM13/ImageServer",
        "https://edcintl.cr.usgs.gov/arcgis/rest/services/Landfire_LF240/US_240FBFM13/ImageServer",
        "https://edcintl.cr.usgs.gov/arcgis/rest/services/Landfire_LF230/US_230FBFM13/ImageServer",
        "https://edcintl.cr.usgs.gov/arcgis/rest/services/Landfire_LF220/US_220FBFM13/ImageServer",
    ]
    
    coords = convert_coordinates()
    
    for service_url in base_urls:
        print(f"\n{'='*80}")
        print(f"Testing: {service_url}")
        print(f"{'='*80}")
        
        # First check if service exists
        try:
            response = requests.get(f"{service_url}?f=json", timeout=5)
            if response.status_code != 200:
                print(f"❌ Service unavailable: HTTP {response.status_code}")
                continue
            
            service_info = response.json()
            if 'error' in service_info:
                print(f"❌ Service error: {service_info['error']}")
                continue
                
            print(f"✅ Service available: {service_info.get('name', 'Unknown')}")
            
        except Exception as e:
            print(f"❌ Service check failed: {e}")
            continue
        
        # Test with different coordinate systems
        result = test_landfire_with_projection(service_url, coords)
        if result:
            print(f"🎯 FOUND WORKING SERVICE: {service_url}")
            return service_url, result
    
    return None, None

if __name__ == "__main__":
    print("Advanced LANDFIRE Testing")
    print("=" * 50)
    
    working_service, result = test_landfire_alternative_services()
    
    if working_service:
        print(f"\n🚀 SUCCESS! Working LANDFIRE service found:")
        print(f"URL: {working_service}")
        print(f"Result: {json.dumps(result, indent=2)}")
    else:
        print(f"\n💀 All LANDFIRE services failed to return data")
        print(f"This suggests a systematic issue with USGS LANDFIRE ImageServer services")
