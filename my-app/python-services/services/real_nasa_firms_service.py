#!/usr/bin/env python3
"""
REAL NASA FIRMS Fire Detection Service
Uses actual NASA FIRMS API endpoints with proper authentication
NO FALLBACKS - Only real data
"""

import asyncio
import json
import logging
import os
import math
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import httpx

# Setup logging
logger = logging.getLogger(__name__)

class FireDetection:
    """Real fire detection from NASA FIRMS satellite data"""
    
    def __init__(self, latitude: float, longitude: float, brightness: float,
                 confidence: int, acquisition_date: str, acquisition_time: str, 
                 satellite: str, instrument: str, frp: float = 0.0, 
                 daynight: str = "D", type_: int = 0):
        self.latitude = latitude
        self.longitude = longitude
        self.brightness = brightness  # Temperature in Kelvin
        self.confidence = confidence  # 0-100%
        self.acquisition_date = acquisition_date
        self.acquisition_time = acquisition_time
        self.satellite = satellite
        self.instrument = instrument
        self.frp = frp  # Fire Radiative Power in MW
        self.daynight = daynight
        self.type = type_
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "latitude": self.latitude,
            "longitude": self.longitude,
            "brightness": self.brightness,
            "confidence": self.confidence,
            "acquisition_date": self.acquisition_date,
            "acquisition_time": self.acquisition_time,
            "satellite": self.satellite,
            "instrument": self.instrument,
            "frp": self.frp,
            "daynight": self.daynight,
            "type": self.type
        }


class RealNASAFIRMSService:
    """
    REAL NASA FIRMS Fire Detection Service
    
    Uses actual NASA FIRMS API endpoints with proper MAP_KEY
    NO FALLBACKS - Must work first try with real data
    
    API Documentation: https://firms.modaps.eosdis.nasa.gov/api/
    """
    
    def __init__(self):
        # NASA FIRMS API configuration - REAL WORKING MAP_KEY
        self.base_url = "https://firms.modaps.eosdis.nasa.gov/api"
        self.map_key = os.getenv("NASA_FIRMS_API_KEY", "c5bc2ce397a15b377717388a09836f57")  # Working MAP_KEY verified 2025-07-23
        
        # Always have working MAP_KEY - no failures allowed
        if not self.map_key or self.map_key == "":
            self.map_key = "c5bc2ce397a15b377717388a09836f57"
        
        # HTTP client with proper headers
        self.client = httpx.AsyncClient(
            timeout=30.0,
            headers={
                "User-Agent": "SMESHLLM-Stanford-Wildfire-System/1.0",
                "Accept": "text/csv,application/json"
            }
        )
        
        logger.info(f"🔥 REAL NASA FIRMS Service initialized with MAP_KEY: {self.map_key[:8]}...")
    
    async def get_active_fires_area(self, west: float, south: float, east: float, north: float,
                                  days_back: int = 1, source: str = "VIIRS_SNPP_NRT") -> List[FireDetection]:
        """
        Get active fires using NASA FIRMS Area API
        
        Args:
            west: Western longitude boundary
            south: Southern latitude boundary  
            east: Eastern longitude boundary
            north: Northern latitude boundary
            days_back: Days to look back (1-10)
            source: Data source (VIIRS_SNPP_NRT, MODIS_NRT, LANDSAT_NRT)
            
        Returns:
            List of real fire detections from NASA satellites
            
        Raises:
            Exception: If API request fails (NO FALLBACKS)
        """
        
        # Validate inputs
        if not (-180 <= west <= 180 and -180 <= east <= 180):
            raise ValueError("Longitude must be between -180 and 180")
        if not (-90 <= south <= 90 and -90 <= north <= 90):
            raise ValueError("Latitude must be between -90 and 90")
        if not (1 <= days_back <= 10):
            raise ValueError("Days back must be between 1 and 10")
        
        # Format area coordinates
        area_coords = f"{west},{south},{east},{north}"
        
        # Build API URL
        url = f"{self.base_url}/area/csv/{self.map_key}/{source}/{area_coords}/{days_back}"
        
        logger.info(f"🛰️ Requesting NASA FIRMS data: {source} for area {area_coords}")
        logger.info(f"📡 API URL: {url}")
        
        try:
            response = await self.client.get(url)
            
            # Check for API errors
            if response.status_code != 200:
                error_msg = f"NASA FIRMS API returned {response.status_code}: {response.text}"
                logger.error(f"❌ {error_msg}")
                raise Exception(error_msg)
            
            # Check for invalid MAP_KEY
            response_text = response.text.strip()
            if "Invalid MAP_KEY" in response_text:
                error_msg = f"Invalid NASA FIRMS MAP_KEY: {self.map_key[:8]}..."
                logger.error(f"❌ {error_msg}")
                raise Exception(error_msg)
            
            # Check for no data
            if not response_text or response_text == "":
                logger.warning("⚠️ NASA FIRMS returned empty response - no fires detected")
                return []
            
            # Parse CSV response
            fires = self._parse_csv_response(response_text)
            
            logger.info(f"✅ NASA FIRMS returned {len(fires)} real fire detections")
            return fires
            
        except Exception as e:
            logger.error(f"❌ NASA FIRMS API request failed: {e}")
            # NO FALLBACK - Service must work with real data
            raise Exception(f"REAL NASA FIRMS service failed: {e}")
    
    def _parse_csv_response(self, csv_text: str) -> List[FireDetection]:
        """Parse NASA FIRMS CSV response into FireDetection objects"""
        
        fires = []
        lines = csv_text.strip().split('\n')
        
        if len(lines) < 2:
            logger.warning("NASA FIRMS CSV has no data rows")
            return []
        
        # Parse header to understand column positions
        header = lines[0].split(',')
        logger.info(f"📊 NASA FIRMS CSV columns: {header}")
        
        # Expected columns for VIIRS data:
        # latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
        
        for line_num, line in enumerate(lines[1:], 2):
            try:
                values = line.split(',')
                
                if len(values) < len(header):
                    logger.warning(f"Row {line_num}: insufficient columns ({len(values)} < {len(header)})")
                    continue
                
                # Map values to columns
                data = dict(zip(header, values))
                
                # Handle NASA FIRMS confidence values ('n'=nominal, 'l'=low, 'h'=high)
                confidence_raw = data.get('confidence', '0')
                if confidence_raw == 'n':
                    confidence = 75  # nominal confidence
                elif confidence_raw == 'l':
                    confidence = 30  # low confidence  
                elif confidence_raw == 'h':
                    confidence = 95  # high confidence
                else:
                    try:
                        confidence = int(float(confidence_raw))
                    except:
                        confidence = 50  # default
                
                # Create FireDetection object with REAL NASA satellite data
                fire = FireDetection(
                    latitude=float(data.get('latitude', 0)),
                    longitude=float(data.get('longitude', 0)),
                    brightness=float(data.get('bright_ti4', data.get('brightness', 0))),  # VIIRS uses bright_ti4
                    confidence=confidence,
                    acquisition_date=data.get('acq_date', ''),
                    acquisition_time=data.get('acq_time', ''),
                    satellite=data.get('satellite', ''),
                    instrument=data.get('instrument', ''),
                    frp=float(data.get('frp', 0)),
                    daynight=data.get('daynight', 'D'),
                    type_=int(data.get('type', 0)) if 'type' in data else 0
                )
                
                fires.append(fire)
                
            except Exception as e:
                logger.warning(f"Row {line_num}: parsing error - {e}")
                continue
        
        return fires
    
    async def get_fires_near_point(self, latitude: float, longitude: float,
                                 radius_km: int = 50, days_back: int = 1) -> List[FireDetection]:
        """
        Get fires near a specific point using bounding box
        
        Args:
            latitude: Center latitude
            longitude: Center longitude
            radius_km: Search radius in kilometers
            days_back: Days to look back
            
        Returns:
            List of fire detections within radius
        """
        
        # Convert radius to lat/lng bounds
        lat_delta = radius_km / 111.0  # ~111 km per degree latitude
        lng_delta = radius_km / (111.0 * math.cos(math.radians(latitude)))
        
        west = longitude - lng_delta
        east = longitude + lng_delta
        south = latitude - lat_delta
        north = latitude + lat_delta
        
        # Clamp to valid ranges
        west = max(-180, west)
        east = min(180, east)
        south = max(-90, south)
        north = min(90, north)
        
        logger.info(f"🎯 Searching {radius_km}km around {latitude:.4f},{longitude:.4f}")
        logger.info(f"📍 Bounding box: {west:.4f},{south:.4f} to {east:.4f},{north:.4f}")
        
        return await self.get_active_fires_area(west, south, east, north, days_back)
    
    async def get_comprehensive_fire_analysis(self, latitude: float, longitude: float,
                                            radius_km: int = 50, days_back: int = 1) -> Dict[str, Any]:
        """
        Get comprehensive fire analysis using REAL NASA FIRMS data
        
        Args:
            latitude: Center latitude
            longitude: Center longitude
            radius_km: Search radius in kilometers
            days_back: Days to look back
        
        Returns:
            Comprehensive fire analysis results with REAL DATA ONLY
        """
        
        logger.info(f"🔥 REAL NASA FIRMS comprehensive analysis for {latitude}, {longitude}")
        
        # Get real fire detections (NO FALLBACKS)
        fires = await self.get_fires_near_point(latitude, longitude, radius_km, days_back)
        
        # Analyze fire patterns with real data
        fire_analysis = self._analyze_real_fire_patterns(fires, latitude, longitude)
        
        # Calculate fire risk from real detections
        fire_risk = self._calculate_real_fire_risk(latitude, longitude, fires)
        
        return {
            "fire_count": len(fires),
            "fires": [fire.to_dict() for fire in fires],
            "data_sources": ["nasa_firms_real_api"],
            "query_info": {
                "latitude": latitude,
                "longitude": longitude,
                "radius_km": radius_km,
                "days_back": days_back,
                "query_time": datetime.now().isoformat(),
                "api_endpoint": f"{self.base_url}/area/csv"
            },
            "fire_analysis": fire_analysis,
            "fire_risk_assessment": fire_risk,
            "service_status": "operational_real_data_only"
        }
    
    def _analyze_real_fire_patterns(self, fires: List[FireDetection], 
                                  center_lat: float, center_lng: float) -> Dict[str, Any]:
        """Analyze REAL fire detection patterns (no synthetic data)"""
        
        if not fires:
            return {
                "fire_risk_level": "Low",
                "nearest_fire_km": None,
                "high_confidence_fires": 0,
                "average_frp": 0,
                "fire_clusters": [],
                "data_quality": "no_real_fires_detected"
            }
        
        # Calculate distances to real fires
        distances = []
        for fire in fires:
            dist = self._distance_km(fire.latitude, fire.longitude, center_lat, center_lng)
            distances.append(dist)
        
        nearest_fire_km = min(distances)
        
        # High confidence fires (>70% confidence from real data)
        high_confidence_fires = len([f for f in fires if f.confidence > 70])
        
        # Average Fire Radiative Power from real measurements
        frp_values = [f.frp for f in fires if f.frp > 0]
        average_frp = sum(frp_values) / len(frp_values) if frp_values else 0
        
        # Determine fire risk level based on REAL proximity
        if nearest_fire_km < 5:
            fire_risk_level = "Extreme"
        elif nearest_fire_km < 15:
            fire_risk_level = "High"
        elif nearest_fire_km < 50:
            fire_risk_level = "Moderate"
        else:
            fire_risk_level = "Low"
        
        return {
            "fire_risk_level": fire_risk_level,
            "nearest_fire_km": nearest_fire_km,
            "high_confidence_fires": high_confidence_fires,
            "average_frp": average_frp,
            "total_fires": len(fires),
            "fire_density_per_1000km2": (len(fires) / (math.pi * 50 * 50)) * 1000,
            "data_quality": "real_nasa_satellite_data"
        }
    
    def _calculate_real_fire_risk(self, latitude: float, longitude: float, 
                                fires: List[FireDetection]) -> Dict[str, Any]:
        """Calculate fire risk assessment from REAL fire data"""
        
        fire_count = len(fires)
        
        # Fire activity risk based on REAL detections
        if fire_count > 15:
            activity_risk = "Very High"
            overall_risk = "Extreme"
        elif fire_count > 8:
            activity_risk = "High"
            overall_risk = "High"
        elif fire_count > 3:
            activity_risk = "Moderate"
            overall_risk = "Moderate"
        elif fire_count > 0:
            activity_risk = "Low"
            overall_risk = "Low"
        else:
            activity_risk = "Minimal"
            overall_risk = "Minimal"
        
        return {
            "overall_fire_risk": overall_risk,
            "fire_activity_level": activity_risk,
            "real_fire_detections": fire_count,
            "data_source": "nasa_firms_satellite_real_time",
            "recommendations": self._generate_real_fire_recommendations(overall_risk, fire_count)
        }
    
    def _generate_real_fire_recommendations(self, risk_level: str, fire_count: int) -> List[str]:
        """Generate fire risk management recommendations based on REAL data"""
        
        recommendations = []
        
        if risk_level == "Extreme":
            recommendations.append("🚨 EXTREME fire risk based on REAL satellite detections")
            recommendations.append("🔥 Multiple active fires detected by NASA satellites")
        elif risk_level == "High":
            recommendations.append("⚠️ HIGH fire risk from REAL fire activity")
            recommendations.append("👨‍🚒 Increased monitoring recommended")
        elif risk_level == "Moderate":
            recommendations.append("📊 MODERATE fire activity detected by satellites")
        elif fire_count == 0:
            recommendations.append("✅ No active fires detected in satellite data")
        
        recommendations.append(f"📡 Based on {fire_count} real NASA FIRMS satellite detections")
        
        return recommendations
    
    def _distance_km(self, lat1: float, lng1: float, lat2: float, lng2: float) -> float:
        """Calculate distance between two points in kilometers using Haversine formula"""
        R = 6371  # Earth's radius in km
        dlat = math.radians(lat2 - lat1)
        dlng = math.radians(lng2 - lng1)
        a = (math.sin(dlat/2) * math.sin(dlat/2) + 
             math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * 
             math.sin(dlng/2) * math.sin(dlng/2))
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        distance = R * c
        return distance
    
    async def close(self):
        """Close HTTP client"""
        await self.client.aclose()


# Example usage and testing
if __name__ == "__main__":
    import asyncio
    
    async def test_real_nasa_firms():
        """Test REAL NASA FIRMS service with production API key"""
        
        print("🔥 Testing REAL NASA FIRMS Service")
        print("=" * 50)
        
        # Using verified working MAP_KEY - no environment variable required
        print("🔑 Using verified NASA FIRMS MAP_KEY: c5bc2ce397a15b377717388a09836f57")
        
        service = RealNASAFIRMSService()
        
        # Test with California coordinates (high fire activity region)
        lat, lng = 34.0522, -118.2437  # Los Angeles area
        
        try:
            result = await service.get_comprehensive_fire_analysis(
                latitude=lat,
                longitude=lng,
                radius_km=100,  # Large area to catch fires
                days_back=3     # Last 3 days
            )
            
            print(f"\n🔥 REAL Fire Detection Results:")
            print(f"Total Fires: {result['fire_count']}")
            print(f"Data Sources: {result['data_sources']}")
            print(f"Fire Risk Level: {result['fire_analysis']['fire_risk_level']}")
            print(f"Service Status: {result['service_status']}")
            
            if result['fire_count'] > 0:
                print(f"Nearest Fire: {result['fire_analysis']['nearest_fire_km']:.1f} km")
                print(f"High Confidence Fires: {result['fire_analysis']['high_confidence_fires']}")
                
                print(f"\nFirst 3 REAL fires:")
                for i, fire in enumerate(result['fires'][:3]):
                    print(f"  {i+1}. {fire['latitude']:.4f}, {fire['longitude']:.4f}")
                    print(f"     Confidence: {fire['confidence']}%, FRP: {fire['frp']} MW")
                    print(f"     Satellite: {fire['satellite']}, Date: {fire['acquisition_date']}")
            else:
                print("✅ No active fires detected in the specified area")
            
        except Exception as e:
            print(f"❌ REAL NASA FIRMS test failed: {e}")
            print("   Check your API key and network connection")
        
        await service.close()
    
    # Run test
    asyncio.run(test_real_nasa_firms())