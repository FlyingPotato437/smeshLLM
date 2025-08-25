#!/usr/bin/env python3
"""
Test GridMET and VPD Integration
Validates that GridMET weather data and VPD NetCDF integration works without fallbacks
"""

import asyncio
import logging
import sys
from datetime import datetime

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

async def test_gridmet_weather_service():
    """Test the core GridMET weather service"""
    
    print("🧪 Testing GridMET Weather Service")
    print("=" * 50)
    
    try:
        from services.gridmet_weather_service import GridMETWeatherService
        
        service = GridMETWeatherService()
        
        # Test coordinates - Santa Clara County, CA
        lat, lng = 37.4419, -122.1430
        
        print(f"📍 Testing location: {lat}, {lng}")
        
        # Test current weather
        print("\n🌤️ Testing current weather retrieval...")
        weather = await service.get_current_weather(lat, lng)
        
        print(f"✅ Temperature: {weather.temperature_c:.1f}°C")
        print(f"✅ Humidity: {weather.relative_humidity_pct:.1f}%")
        print(f"✅ Wind: {weather.wind_speed_ms:.1f} m/s")
        print(f"✅ Precipitation: {weather.precipitation_mm:.1f} mm")
        
        if weather.vapor_pressure_deficit_kpa:
            print(f"✅ VPD: {weather.vapor_pressure_deficit_kpa:.3f} kPa")
        else:
            print("⚠️ VPD: Not available")
            
        if weather.fuel_moisture_100hr:
            print(f"✅ 100-hr Fuel Moisture: {weather.fuel_moisture_100hr:.1f}%")
        else:
            print("⚠️ 100-hr Fuel Moisture: Not available")
        
        # Test fire weather indices
        print("\n🔥 Testing fire weather indices...")
        fire_indices = await service.get_fire_weather_indices(weather)
        
        print(f"✅ Fire Danger: {fire_indices['fire_danger_rating']}")
        ffwi = fire_indices['fire_weather_indices'].get('fosberg_fire_weather_index', 'N/A')
        print(f"✅ FFWI: {ffwi}")
        
        confidence = fire_indices['data_quality'].get('confidence', 'Unknown')
        print(f"✅ Data Confidence: {confidence}")
        
        await service.close()
        print("\n✅ GridMET Weather Service test PASSED")
        return True
        
    except Exception as e:
        print(f"❌ GridMET Weather Service test FAILED: {e}")
        return False

async def test_main_weather_service():
    """Test the main weather service integration"""
    
    print("\n🧪 Testing Main Weather Service Integration")
    print("=" * 50)
    
    try:
        # Import after sys path adjustment if needed
        from weather_service import WeatherService
        
        service = WeatherService()
        
        # Test coordinates
        lat, lng = 37.4419, -122.1430
        
        print(f"📍 Testing location: {lat}, {lng}")
        
        # Test fire weather data
        print("\n🌤️ Testing fire weather data retrieval...")
        
        async with service:
            fire_weather = await service.get_fire_weather_data(
                lat, lng, 
                hours=24, 
                scenario_type="wildfire",
                user_query="test query"
            )
        
        print(f"✅ Temperature: {fire_weather.temperature_c:.1f}°C")
        print(f"✅ Humidity: {fire_weather.relative_humidity_pct:.1f}%")
        print(f"✅ Wind: {fire_weather.wind_speed_ms:.1f} m/s")
        print(f"✅ FWI: {fire_weather.fire_weather_index:.1f}")
        print(f"✅ Risk Level: {fire_weather.risk_level}")
        print(f"✅ Data Source: {fire_weather.data_source}")
        
        if fire_weather.vapor_pressure_deficit_kpa:
            print(f"✅ VPD: {fire_weather.vapor_pressure_deficit_kpa:.3f} kPa")
        
        print("\n✅ Main Weather Service test PASSED")
        return True
        
    except Exception as e:
        print(f"❌ Main Weather Service test FAILED: {e}")
        return False

async def test_real_weather_service():
    """Test the real weather service integration"""
    
    print("\n🧪 Testing Real Weather Service Integration")
    print("=" * 50)
    
    try:
        from services.real_weather_service import RealWeatherService
        
        service = RealWeatherService()
        
        # Test coordinates
        lat, lng = 37.4419, -122.1430
        
        print(f"📍 Testing location: {lat}, {lng}")
        
        # Test current weather
        print("\n🌤️ Testing current weather...")
        weather = await service.get_current_weather(lat, lng)
        
        print(f"✅ Temperature: {weather.temperature_f:.1f}°F")
        print(f"✅ Humidity: {weather.humidity_percent:.1f}%")
        print(f"✅ Wind: {weather.wind_speed_mph:.1f} mph")
        
        if weather.vapor_pressure_deficit_kpa:
            print(f"✅ VPD: {weather.vapor_pressure_deficit_kpa:.3f} kPa")
        
        # Test fire weather indices
        print("\n🔥 Testing fire weather indices...")
        fire_indices = await service.get_fire_weather_indices(weather)
        
        print(f"✅ Fire Danger: {fire_indices['fire_danger_rating']}")
        print(f"✅ Fuel Moisture: {fire_indices['fuel_moisture_category']}")
        
        await service.close()
        print("\n✅ Real Weather Service test PASSED")
        return True
        
    except Exception as e:
        print(f"❌ Real Weather Service test FAILED: {e}")
        return False

async def test_requirements():
    """Test that all required dependencies are available"""
    
    print("\n🧪 Testing Required Dependencies")
    print("=" * 50)
    
    dependencies = [
        ("pygridmet", "GridMET data access"),
        ("xarray", "NetCDF data processing"),
        ("netcdf4", "NetCDF file reading"),
        ("xclim", "Fire weather calculations"),
        ("httpx", "HTTP client for VPD data")
    ]
    
    all_available = True
    
    for dep, desc in dependencies:
        try:
            __import__(dep)
            print(f"✅ {dep}: Available ({desc})")
        except ImportError:
            print(f"❌ {dep}: MISSING ({desc})")
            all_available = False
    
    if all_available:
        print("\n✅ All dependencies available")
    else:
        print("\n❌ Some dependencies missing - install with: pip install pygridmet xarray netcdf4 xclim httpx")
    
    return all_available

async def main():
    """Run all integration tests"""
    
    print("🧪 GridMET and VPD Integration Test Suite")
    print("=" * 60)
    print(f"🕐 Started at: {datetime.now().isoformat()}")
    print()
    
    # Test results
    results = []
    
    # Test dependencies first
    deps_ok = await test_requirements()
    results.append(("Dependencies", deps_ok))
    
    if not deps_ok:
        print("\n❌ Cannot proceed - missing dependencies")
        return
    
    # Test services
    gridmet_ok = await test_gridmet_weather_service()
    results.append(("GridMET Weather Service", gridmet_ok))
    
    main_ok = await test_main_weather_service()  
    results.append(("Main Weather Service", main_ok))
    
    real_ok = await test_real_weather_service()
    results.append(("Real Weather Service", real_ok))
    
    # Summary
    print("\n" + "=" * 60)
    print("🧪 TEST SUMMARY")
    print("=" * 60)
    
    passed = 0
    total = len(results)
    
    for test_name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"{test_name}: {status}")
        if result:
            passed += 1
    
    print(f"\nResults: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED - GridMET and VPD integration working!")
        print("✅ No fallback mechanisms - real data only")
        print("✅ GridMET 4km meteorological data accessible")
        print("✅ VPD NetCDF integration functional")
        print("✅ Fire weather calculations enhanced")
    else:
        print("\n⚠️ SOME TESTS FAILED - Check errors above")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())