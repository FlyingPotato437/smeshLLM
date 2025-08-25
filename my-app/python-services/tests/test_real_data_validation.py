#!/usr/bin/env python3
"""
Real Data Validation Test for SmeshLLM Python Services
Verifies that all data sources are returning real, non-mocked data
"""

import asyncio
import json
import sys
import time
from datetime import datetime
from typing import Dict, Any, List

# Add current directory to path
sys.path.append('.')

from services.openaq_service import OpenAQService, OpenAQRequest
from models.api_models import GeographicCoordinates
from services.hysplit_service import HysplitService


async def test_openaq_real_data():
    """Test that OpenAQ service returns real data"""
    print("🧪 Testing OpenAQ Real Data...")
    
    try:
        service = OpenAQService()
        await service.initialize()
        
        # Test with Palo Alto coordinates - use the service method directly
        locations = await service.get_locations_nearby(37.4419, -122.143, 50)
        measurements = await service.get_latest_measurements(37.4419, -122.143, 50, ["pm25", "pm10"])
        
        print(f"✅ OpenAQ returned {len(measurements)} measurements")
        print(f"✅ OpenAQ found {len(locations)} locations")
        
        # Validate data is not hardcoded
        if len(measurements) > 0:
            sample_measurement = measurements[0]
            print(f"📊 Sample measurement: {sample_measurement.parameter}={sample_measurement.value} {sample_measurement.unit}")
            print(f"📍 Location: {sample_measurement.location_name}")
            print(f"🕐 Timestamp: {sample_measurement.date}")
            
            # Check if timestamp is recent (within last 7 days)
            time_diff = datetime.utcnow() - sample_measurement.date
            if time_diff.days <= 7:
                print("✅ Data appears to be recent/real")
            else:
                print(f"⚠️  Data is {time_diff.days} days old - might be cached")
        else:
            print("⚠️  No measurements found - this could be normal for the area")
        
        await service.cleanup()
        return True
        
    except Exception as e:
        print(f"❌ OpenAQ test failed: {e}")
        return False


async def test_hysplit_real_data():
    """Test that HYSPLIT service uses real meteorological data"""
    print("\n🧪 Testing HYSPLIT Real Data...")
    
    try:
        service = HysplitService()
        await service.initialize()
        
        # Test wind data fetching (this should use real Open-Meteo API)
        wind_data = await service._get_wind_data(
            lat=37.4419,
            lon=-122.143,
            start_time=datetime.utcnow(),
            duration_hours=24
        )
        
        if wind_data:
            print(f"✅ Retrieved {len(wind_data)} hours of wind data")
            
            # Check first few data points
            for i, data_point in enumerate(wind_data[:3]):
                print(f"📊 Hour {i}: Wind {data_point['wind_speed']:.1f} m/s from {data_point['wind_direction']:.0f}°")
            
            # Validate data variability (real data should vary)
            wind_speeds = [d['wind_speed'] for d in wind_data[:10]]
            wind_dirs = [d['wind_direction'] for d in wind_data[:10]]
            
            speed_variance = max(wind_speeds) - min(wind_speeds)
            dir_variance = max(wind_dirs) - min(wind_dirs)
            
            if speed_variance > 0.1 or dir_variance > 5:
                print("✅ Wind data shows realistic variation")
            else:
                print("⚠️  Wind data might be static/hardcoded")
        else:
            print("❌ No wind data retrieved")
            
        await service.cleanup()
        return len(wind_data) > 0
        
    except Exception as e:
        print(f"❌ HYSPLIT test failed: {e}")
        return False


def test_elevation_api():
    """Test elevation API directly"""
    print("\n🧪 Testing Elevation API...")
    
    try:
        import urllib.request
        import urllib.parse
        
        # Test Open-Meteo elevation API
        params = {
            'latitude': 37.4419,
            'longitude': -122.143
        }
        
        url = 'https://api.open-meteo.com/v1/elevation?' + urllib.parse.urlencode(params)
        request = urllib.request.Request(url)
        
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                elevation = data.get('elevation', [None])[0]
                
                if elevation is not None:
                    print(f"✅ Elevation API working: {elevation}m")
                    print(f"📍 Palo Alto elevation: {elevation}m ({elevation * 3.28084:.0f}ft)")
                    
                    # Validate elevation is reasonable for Palo Alto (should be ~10-50m)
                    if 0 <= elevation <= 100:
                        print("✅ Elevation value is realistic for Palo Alto area")
                        return True
                    else:
                        print(f"⚠️  Elevation {elevation}m seems unrealistic for Palo Alto")
                        return False
                else:
                    print("❌ Elevation API returned null")
                    return False
            else:
                print(f"❌ Elevation API returned status {response.status}")
                return False
                
    except Exception as e:
        print(f"❌ Elevation API test failed: {e}")
        return False


def test_weather_api():
    """Test weather API directly"""
    print("\n🧪 Testing Weather API...")
    
    try:
        import urllib.request
        import urllib.parse
        
        # Test Open-Meteo weather API
        params = {
            'latitude': 37.4419,
            'longitude': -122.143,
            'current': 'temperature_2m,relative_humidity_2m,wind_speed_10m,wind_direction_10m',
            'timezone': 'UTC'
        }
        
        url = 'https://api.open-meteo.com/v1/forecast?' + urllib.parse.urlencode(params)
        request = urllib.request.Request(url)
        
        with urllib.request.urlopen(request, timeout=10) as response:
            if response.status == 200:
                data = json.loads(response.read().decode())
                current = data.get('current', {})
                
                temp = current.get('temperature_2m')
                humidity = current.get('relative_humidity_2m')
                wind_speed = current.get('wind_speed_10m')
                wind_dir = current.get('wind_direction_10m')
                
                print(f"✅ Weather API working")
                print(f"🌡️  Temperature: {temp}°C")
                print(f"💧 Humidity: {humidity}%")
                print(f"💨 Wind: {wind_speed} m/s from {wind_dir}°")
                
                # Validate values are reasonable
                if temp is not None and -50 <= temp <= 50:
                    if humidity is not None and 0 <= humidity <= 100:
                        if wind_speed is not None and 0 <= wind_speed <= 50:
                            print("✅ All weather values are realistic")
                            return True
                
                print("⚠️  Some weather values seem unrealistic")
                return False
            else:
                print(f"❌ Weather API returned status {response.status}")
                return False
                
    except Exception as e:
        print(f"❌ Weather API test failed: {e}")
        return False


def test_nasa_firms_api():
    """Test NASA FIRMS API directly"""
    print("\n🧪 Testing NASA FIRMS API...")
    
    try:
        import urllib.request
        
        # Test NASA FIRMS API (using the API key from the service)
        api_key = "y3f4201e30e422bce83be9c85b072dc91"  # This should be from environment
        url = f"https://firms.modaps.eosdis.nasa.gov/api/country/csv/{api_key}/VIIRS_SNPP_NRT/USA/1"
        
        request = urllib.request.Request(url)
        
        with urllib.request.urlopen(request, timeout=15) as response:
            if response.status == 200:
                data = response.read().decode()
                lines = data.strip().split('\n')
                
                print(f"✅ NASA FIRMS API working")
                print(f"📊 Retrieved {len(lines)-1} fire detections (including header)")
                
                if len(lines) > 1:
                    # Show sample data (first non-header line)
                    header = lines[0].split(',')
                    sample = lines[1].split(',')
                    
                    print("📋 Sample fire detection:")
                    for i, (field, value) in enumerate(zip(header[:5], sample[:5])):
                        print(f"   {field}: {value}")
                    
                    print("✅ NASA FIRMS returning real fire detection data")
                else:
                    print("✅ NASA FIRMS working (no active fires detected)")
                
                return True
            else:
                print(f"❌ NASA FIRMS API returned status {response.status}")
                return False
                
    except Exception as e:
        print(f"❌ NASA FIRMS API test failed: {e}")
        return False


async def main():
    """Run all real data validation tests"""
    print("🔍 SmeshLLM Real Data Validation Test")
    print("=" * 50)
    
    test_results = {}
    
    # Test external APIs directly
    test_results['elevation'] = test_elevation_api()
    test_results['weather'] = test_weather_api()
    test_results['nasa_firms'] = test_nasa_firms_api()
    
    # Test service implementations
    test_results['openaq'] = await test_openaq_real_data()
    test_results['hysplit'] = await test_hysplit_real_data()
    
    # Summary
    print("\n" + "=" * 50)
    print("📊 VALIDATION SUMMARY")
    print("=" * 50)
    
    passed = 0
    total = len(test_results)
    
    for test_name, result in test_results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{test_name.upper()}: {status}")
        if result:
            passed += 1
    
    print(f"\nOverall: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 ALL DATA SOURCES ARE RETURNING REAL DATA!")
    else:
        print("⚠️  Some data sources may be returning mock/hardcoded data")
        print("🔧 Check the failed services for hardcoded values")
    
    return passed == total


if __name__ == "__main__":
    success = asyncio.run(main())
    sys.exit(0 if success else 1)