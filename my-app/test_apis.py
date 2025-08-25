#!/usr/bin/env python3
"""
Test script to verify all APIs are working with real data
"""

import asyncio
import httpx
import json

async def test_apis():
    """Test the main APIs to ensure they return real data"""
    
    print("🔬 Testing SMeshLLM APIs for Real Data Integration")
    print("=" * 60)
    
    # Test coordinates for Santa Clara County
    lat, lon = 37.3541132, -121.955174
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        
        # Test 1: Python backend health
        print("\n1. Testing Python Backend Health...")
        try:
            response = await client.get("http://127.0.0.1:8000/health")
            if response.status_code == 200:
                health_data = response.json()
                print(f"   ✅ Backend healthy: {health_data.get('status', 'unknown')}")
                print(f"   📊 Services: {len(health_data.get('services', {}))} active")
            else:
                print(f"   ❌ Backend health check failed: {response.status_code}")
        except Exception as e:
            print(f"   ❌ Backend not accessible: {e}")
            
        # Test 2: NASA FIRMS Active Fires (Real Data)
        print("\n2. Testing NASA FIRMS Active Fire Detection...")
        try:
            payload = {
                "latitude": lat,
                "longitude": lon,
                "radius_km": 50,
                "days_back": 2
            }
            response = await client.post(
                "http://127.0.0.1:8000/nasa-firms/active-fires",
                json=payload
            )
            if response.status_code == 200:
                fires_data = response.json()
                if fires_data.get("success"):
                    fire_count = fires_data.get("data", {}).get("fire_count", 0)
                    data_source = fires_data.get("data", {}).get("data_source", "unknown")
                    print(f"   ✅ NASA FIRMS working: {fire_count} fires detected")
                    print(f"   🛰️  Data source: {data_source}")
                    if fire_count > 0:
                        sample_fire = fires_data["data"]["fires"][0]
                        print(f"   🔥 Sample fire: {sample_fire.get('brightness', 'N/A')}K brightness, {sample_fire.get('confidence', 'N/A')}% confidence")
                else:
                    print(f"   ❌ NASA FIRMS failed: {fires_data.get('error', 'Unknown error')}")
            else:
                print(f"   ❌ NASA FIRMS API error: {response.status_code}")
        except Exception as e:
            print(f"   ❌ NASA FIRMS test failed: {e}")
            
        # Test 3: Weather Data (Real Data)
        print("\n3. Testing Weather Service...")
        try:
            payload = {
                "latitude": lat,
                "longitude": lon,
                "date": "2025-07-30"
            }
            response = await client.post(
                "http://127.0.0.1:8000/weather/fire-conditions",
                json=payload
            )
            if response.status_code == 200:
                weather_data = response.json()
                if weather_data.get("success"):
                    data = weather_data.get("data", {})
                    temp = data.get("temperature_c", "N/A")
                    humidity = data.get("relative_humidity_pct", "N/A")
                    wind_speed = data.get("wind_speed_ms", "N/A")
                    print(f"   ✅ Weather service working")
                    print(f"   🌡️  Temperature: {temp}°C, Humidity: {humidity}%, Wind: {wind_speed} m/s")
                else:
                    print(f"   ❌ Weather service failed: {weather_data.get('error', 'Unknown error')}")
            else:
                print(f"   ❌ Weather API error: {response.status_code}")
        except Exception as e:
            print(f"   ❌ Weather test failed: {e}")
            
        # Test 4: OpenAQ Air Quality (Real Data)
        print("\n4. Testing OpenAQ Air Quality Data...")
        try:
            params = {
                "latitude": lat,
                "longitude": lon,
                "radius_km": 25,
                "hours_back": 24
            }
            response = await client.get(
                "http://127.0.0.1:8000/openaq/measurements",
                params=params
            )
            if response.status_code == 200:
                openaq_data = response.json()
                if openaq_data.get("success"):
                    data = openaq_data.get("data", {})
                    measurement_count = data.get("measurement_count", 0)
                    data_source = data.get("data_source", "unknown")
                    print(f"   ✅ OpenAQ working: {measurement_count} measurements")
                    print(f"   🌬️  Data source: {data_source}")
                else:
                    print(f"   ❌ OpenAQ failed: {openaq_data.get('error', 'Unknown error')}")
            else:
                print(f"   ❌ OpenAQ API error: {response.status_code}")
        except Exception as e:
            print(f"   ❌ OpenAQ test failed: {e}")
            
        # Test 5: Next.js Frontend APIs
        print("\n5. Testing Next.js Frontend APIs...")
        try:
            response = await client.get("http://localhost:3000/api/plume-predictions?hours=24")
            if response.status_code == 200:
                plume_data = response.json()
                if plume_data.get("success"):
                    count = plume_data.get("count", 0)
                    source = plume_data.get("source", "unknown")
                    print(f"   ✅ Frontend APIs working: {count} plume predictions")
                    print(f"   📈 Data source: {source}")
                else:
                    print(f"   ❌ Frontend API failed")
            else:
                print(f"   ❌ Frontend API error: {response.status_code}")
        except Exception as e:
            print(f"   ❌ Frontend test failed: {e}")
    
    print("\n" + "=" * 60)
    print("🎯 API Integration Test Complete!")
    print("If all tests show ✅, your integrations are working with real data.")
    print("If you see ❌, those APIs need attention.")

if __name__ == "__main__":
    asyncio.run(test_apis())
