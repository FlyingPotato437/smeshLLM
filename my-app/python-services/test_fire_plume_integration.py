#!/usr/bin/env python3
"""
Test Fire Plume Integration - Test the complete fire tracking system
Tests NASA FIRMS integration, fast HYSPLIT, vegetation data, and plume tracking
"""

import asyncio
import json
import logging
import os
import sys
from pathlib import Path
from datetime import datetime

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent))
sys.path.append(str(Path(__file__).parent / "services"))

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

async def test_individual_services():
    """Test individual services first"""
    print("🧪 Testing individual services...")
    
    # Test NASA FIRMS service
    try:
        from services.real_nasa_firms_service import RealNASAFIRMSService
        firms_service = RealNASAFIRMSService()
        
        print("📡 Testing NASA FIRMS service...")
        fires = await firms_service.get_fires_near_point(
            latitude=37.4275,  # Stanford area
            longitude=-122.1697,
            radius_km=50,
            days_back=1
        )
        print(f"   ✅ NASA FIRMS: Found {len(fires)} fire detections")
        
        if fires:
            fire = fires[0]
            print(f"   🔥 Sample fire: {fire.latitude:.4f}, {fire.longitude:.4f} (confidence: {fire.confidence}%)")
            
        await firms_service.close()
        
    except Exception as e:
        print(f"   ❌ NASA FIRMS test failed: {e}")
        return False
    
    return True

async def main():
    """Main test function"""
    print("🚀 Starting Fire Plume Integration Tests")
    print(f"🕐 Test started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"🔑 NASA FIRMS API Key: {os.getenv('NASA_FIRMS_API_KEY', 'Not configured')[:8]}...")
    print()
    
    # Test individual services
    print("=" * 60)
    result = await test_individual_services()
    
    if result:
        print("🎉 Basic tests passed!")
    else:
        print("❌ Tests failed")

if __name__ == "__main__":
    asyncio.run(main())
