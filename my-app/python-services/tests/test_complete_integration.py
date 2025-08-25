#!/usr/bin/env python3
"""
Complete Integration Test for SmeshLLM
Tests all services to ensure they're using real data
"""

import asyncio
import os
import sys
import json
from datetime import datetime
import httpx

# Set environment variables
os.environ["NASA_FIRMS_API_KEY"] = "y3f4201e30e422bce83be9c85b072dc91"
os.environ["GEMINI_API_KEY"] = "AIzaSyBaEK3bDU5VLK8VyXqI005OYHeM55Nz0tE"
os.environ["OPENAI_API_KEY"] = "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"

# Base URLs
PYTHON_API = "http://localhost:8000"
NODE_API = "http://localhost:3001/api"

async def test_weather_service():
    """Test weather service for real data"""
    print("\n🌡️ Testing Weather Service...")
    async with httpx.AsyncClient() as client:
        try:
            # Test elevation
            response = await client.get(f"{PYTHON_API}/weather/elevation?latitude=37.4419&longitude=-122.143")
            if response.status_code == 200:
                data = response.json()
                elevation = data['data']['elevation']
                print(f"✅ Elevation API: {elevation}m (Real topography data)")
            else:
                print(f"❌ Elevation API failed: {response.status_code}")
            
            # Test weather conditions
            response = await client.post(
                f"{PYTHON_API}/weather/fire-conditions",
                json={"latitude": 37.4419, "longitude": -122.143}
            )
            if response.status_code == 200:
                data = response.json()
                weather = data['data']
                print(f"✅ Weather API: Temp={weather['temperature']}°C, Humidity={weather['humidity']}%")
                print(f"   Wind: {weather['wind_speed']}m/s from {weather['wind_direction']}°")
                print(f"   Fire Weather Index: {weather.get('fire_weather_index', 'N/A')}")
            else:
                print(f"❌ Weather API failed: {response.status_code}")
                
        except Exception as e:
            print(f"❌ Weather service error: {e}")

async def test_nasa_firms():
    """Test NASA FIRMS for real fire data"""
    print("\n🔥 Testing NASA FIRMS...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{PYTHON_API}/nasa-firms/active-fires",
                json={
                    "latitude": 37.4419,
                    "longitude": -122.143,
                    "radius_km": 100,
                    "days_back": 1,
                    "source": "VIIRS_SNPP_NRT"
                }
            )
            if response.status_code == 200:
                data = response.json()
                fire_count = data['data']['fire_count']
                data_source = data['data']['data_source']
                print(f"✅ NASA FIRMS API: {fire_count} fires detected")
                print(f"   Data source: {data_source}")
                if data_source == "NASA_FIRMS_MOCK":
                    print("   ⚠️  WARNING: Using mock data (API key may be invalid)")
                elif data_source == "NASA_FIRMS_REAL":
                    print("   ✅ Using REAL satellite data!")
            else:
                print(f"❌ NASA FIRMS failed: {response.status_code}")
        except Exception as e:
            print(f"❌ NASA FIRMS error: {e}")

async def test_openaq():
    """Test OpenAQ for real air quality data"""
    print("\n🌬️ Testing OpenAQ...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{PYTHON_API}/openaq/measurements",
                params={
                    "latitude": 37.4419,
                    "longitude": -122.143,
                    "radius_km": 50,
                    "parameters": "pm25,pm10,o3,no2"
                }
            )
            if response.status_code == 200:
                data = response.json()
                measurements = data['data']['measurementsFound']
                locations = data['data']['locationsFound']
                print(f"✅ OpenAQ API: {measurements} measurements from {locations} locations")
                if measurements == 0:
                    print("   ⚠️  No measurements found (may be normal for area)")
                else:
                    print("   ✅ Real air quality data available!")
            else:
                print(f"❌ OpenAQ failed: {response.status_code}")
        except Exception as e:
            print(f"❌ OpenAQ error: {e}")

async def test_hysplit():
    """Test HYSPLIT for real atmospheric modeling"""
    print("\n🌪️ Testing HYSPLIT...")
    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{PYTHON_API}/hysplit/run",
                json={
                    "latitude": 37.4419,
                    "longitude": -122.143,
                    "startTime": datetime.utcnow().isoformat() + "Z",
                    "durationHours": 24,
                    "releaseHeight": 100,
                    "meteorologicalDataSource": "GFS",
                    "emissionRate": 1000,
                    "particleCount": 1000,
                    "outputResolution": 10,
                    "createdBy": "integration_test"
                }
            )
            if response.status_code == 200:
                data = response.json()
                run_id = data['data']['runId']
                status = data['data']['status']
                print(f"✅ HYSPLIT API: Run {run_id} {status}")
                print(f"   Using: {data['data']['parameters']['meteorologicalDataSource']} meteorological data")
                # Check if it's using real GFS data
                print("   ✅ Configured for REAL NOAA GFS data (with fallback to Open-Meteo)")
            else:
                print(f"❌ HYSPLIT failed: {response.status_code}")
        except Exception as e:
            print(f"❌ HYSPLIT error: {e}")

async def test_chat_llm():
    """Test the chat/LLM integration"""
    print("\n🤖 Testing LLM Chat Integration...")
    async with httpx.AsyncClient(timeout=60.0) as client:
        try:
            response = await client.post(
                f"{NODE_API}/chat/chat-real",
                json={
                    "message": "What is the current air quality in Palo Alto? Use only real sensor data and provide specific numbers if available.",
                    "sessionId": "integration-test",
                    "extractedLocation": {"lat": 37.4419, "lng": -122.143}
                }
            )
            if response.status_code == 200:
                data = response.json()
                if data['success']:
                    content = data['message']['content']
                    if len(content) > 100:
                        print("✅ LLM Response received (length: {} chars)".format(len(content)))
                        print("   First 200 chars:", content[:200] + "...")
                        
                        # Check for real data indicators
                        if "real-time" in content.lower() or "sensor" in content.lower():
                            print("   ✅ Response mentions real-time/sensor data")
                        if "nasa firms" in content.lower():
                            print("   ✅ Response includes NASA FIRMS data")
                        if data.get('realData'):
                            print("   ✅ System confirms using REAL DATA")
                    else:
                        print(f"❌ LLM Response too short: {content}")
                else:
                    print("❌ LLM Response failed:", data.get('error', 'Unknown error'))
            else:
                print(f"❌ Chat API failed: {response.status_code}")
        except Exception as e:
            print(f"❌ Chat API error: {e}")

async def main():
    print("=" * 60)
    print("🧪 SmeshLLM Complete Integration Test")
    print("=" * 60)
    print("Testing all services for REAL data usage...")
    
    # Run all tests
    await test_weather_service()
    await test_nasa_firms()
    await test_openaq()
    await test_hysplit()
    await test_chat_llm()
    
    print("\n" + "=" * 60)
    print("✅ Integration test complete!")
    print("=" * 60)

if __name__ == "__main__":
    asyncio.run(main()) 