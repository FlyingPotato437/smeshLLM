#!/usr/bin/env python3
"""
Verification script to ensure SmeshLLM weather system only returns real data
NO fake data generation, NO fallback calculations, FAIL FAST on no real data
"""

import asyncio
import sys
import traceback

async def test_real_data_only():
    """Test that the system only returns real data and fails fast otherwise"""
    
    print("="*80)
    print("SMESHLLM WEATHER SYSTEM VERIFICATION")
    print("Ensuring ZERO fake data, NO fallback calculations")
    print("="*80)
    
    tests_passed = 0
    tests_total = 0
    
    # Test 1: Real-only weather service fails fast (no fake data)
    print("\n[TEST 1] Real-only weather service fails fast when no real data available")
    tests_total += 1
    
    try:
        from real_only_weather_service import RealOnlyWeatherService
        service = RealOnlyWeatherService()
        
        try:
            # This should fail fast without generating fake data
            weather = await service.get_current_weather(37.4419, -122.1430)
            print("❌ FAILURE: Service returned data when it should have failed fast")
        except Exception as e:
            if "NO REAL WEATHER DATA AVAILABLE" in str(e) and "NO FAKE DATA GENERATED" in str(e):
                print("✅ SUCCESS: Service correctly failed fast with no fake data")
                tests_passed += 1
            else:
                print(f"❌ FAILURE: Service failed but not with expected message: {e}")
                
    except Exception as e:
        print(f"❌ ERROR: Could not test real-only weather service: {e}")
    
    # Test 2: Backup services with fake data are removed
    print("\n[TEST 2] Fake data services are properly removed/backed up")
    tests_total += 1
    
    try:
        import os
        fake_services_removed = True
        
        # Check that backup files exist (services were moved, not deleted)
        backup_files = [
            "robust_gridmet_service.py.backup",
            "weather_service.py.backup", 
            "services/gridmet_weather_service.py.backup",
            "services/weather_service.py.backup"
        ]
        
        for backup_file in backup_files:
            if not os.path.exists(backup_file):
                print(f"⚠️  Backup file missing: {backup_file}")
        
        # Check that original fake data services are gone
        fake_files = [
            "robust_gridmet_service.py",
            "weather_service.py",
            "services/gridmet_weather_service.py", 
            "services/weather_service.py"
        ]
        
        for fake_file in fake_files:
            if os.path.exists(fake_file):
                print(f"❌ FAILURE: Fake data service still exists: {fake_file}")
                fake_services_removed = False
        
        if fake_services_removed:
            print("✅ SUCCESS: Fake data services properly removed/backed up")
            tests_passed += 1
        else:
            print("❌ FAILURE: Some fake data services still exist")
            
    except Exception as e:
        print(f"❌ ERROR: Could not verify fake service removal: {e}")
    
    # Test 3: Main.py imports correctly with real-only weather service
    print("\n[TEST 3] Main.py configured for real-only weather service")
    tests_total += 1
    
    try:
        # Check that main.py imports the real-only service
        with open("main.py", "r") as f:
            main_content = f.read()
        
        if "from real_only_weather_service import RealOnlyWeatherService" in main_content:
            if "NO FALLBACK SERVICES - REAL DATA ONLY" in main_content:
                if "Only real data weather service is supported - NO FALLBACKS" in main_content:
                    print("✅ SUCCESS: Main.py properly configured for real-only weather")
                    tests_passed += 1
                else:
                    print("❌ FAILURE: Main.py missing NO FALLBACKS enforcement")
            else:
                print("❌ FAILURE: Main.py missing real data only comment")
        else:
            print("❌ FAILURE: Main.py not importing real-only weather service")
            
    except Exception as e:
        print(f"❌ ERROR: Could not verify main.py configuration: {e}")
    
    # Test 4: Real-only weather service has no emojis in code
    print("\n[TEST 4] Real-only weather service has no emojis in code")
    tests_total += 1
    
    try:
        with open("real_only_weather_service.py", "r") as f:
            service_content = f.read()
        
        # Check for common emojis that were in the original code
        emoji_patterns = ["🌤️", "📡", "🌐", "🔥", "❌", "✅", "⚠️", "💨", "🌪️", "🌡️", "📍"]
        emojis_found = []
        
        for emoji in emoji_patterns:
            if emoji in service_content:
                emojis_found.append(emoji)
        
        if len(emojis_found) == 0:
            print("✅ SUCCESS: No emojis found in real-only weather service code")
            tests_passed += 1
        else:
            print(f"❌ FAILURE: Emojis still found in code: {emojis_found}")
            
    except Exception as e:
        print(f"❌ ERROR: Could not verify emoji removal: {e}")
    
    # Summary
    print("\n" + "="*80)
    print("VERIFICATION SUMMARY")
    print("="*80)
    print(f"Tests Passed: {tests_passed}/{tests_total}")
    
    if tests_passed == tests_total:
        print("✅ ALL TESTS PASSED - System configured for REAL DATA ONLY")
        print("✅ NO fake data generation")
        print("✅ NO fallback calculations") 
        print("✅ FAIL FAST when real data unavailable")
        print("✅ Clean, professional code without emojis")
        return True
    else:
        print(f"❌ {tests_total - tests_passed} TESTS FAILED - Issues need to be resolved")
        return False

if __name__ == "__main__":
    try:
        success = asyncio.run(test_real_data_only())
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"❌ VERIFICATION FAILED: {e}")
        print(traceback.format_exc())
        sys.exit(1)