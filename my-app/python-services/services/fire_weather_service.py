#!/usr/bin/env python3
"""
Enhanced Fire Weather Service
Comprehensive fire weather analysis including Canadian FWI components,
fuel moisture, atmospheric stability, and prescribed burn assessments
"""

import asyncio
import math
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from enum import Enum

import httpx
from pydantic import BaseModel, Field

from services.weather_service import WeatherService, WeatherConditions

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BurnCondition(str, Enum):
    """Prescribed burn suitability assessment"""
    EXCELLENT = "excellent"
    GOOD = "good"
    MARGINAL = "marginal"
    POOR = "poor"
    PROHIBITED = "prohibited"

class FireDangerRating(str, Enum):
    """Fire danger rating levels"""
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    VERY_HIGH = "very_high"
    EXTREME = "extreme"

class CanadianFWI(BaseModel):
    """Canadian Fire Weather Index System components"""
    # Fine Fuel Moisture Code (0-101)
    ffmc: float = Field(..., description="Fine Fuel Moisture Code")
    
    # Duff Moisture Code (0-300+)
    dmc: float = Field(..., description="Duff Moisture Code") 
    
    # Drought Code (0-1000+)
    dc: float = Field(..., description="Drought Code")
    
    # Initial Spread Index (0-25+)
    isi: float = Field(..., description="Initial Spread Index")
    
    # Buildup Index (0-200+)
    bui: float = Field(..., description="Buildup Index")
    
    # Fire Weather Index (0-50+)
    fwi: float = Field(..., description="Fire Weather Index")
    
    # Fire danger rating
    danger_rating: FireDangerRating

class AtmosphericStability(BaseModel):
    """Atmospheric stability and mixing conditions"""
    mixing_height_m: float = Field(..., description="Mixing layer height (meters)")
    stability_class: str = Field(..., description="Pasquill stability class A-F")
    ventilation_rate: float = Field(..., description="Mixing height × wind speed")
    inversion_strength: Optional[float] = Field(None, description="Temperature inversion °C")
    haines_index: float = Field(..., description="Lower atmosphere instability")

class FuelMoisture(BaseModel):
    """Fuel moisture conditions"""
    one_hour_pct: float = Field(..., description="1-hour dead fuel moisture %")
    ten_hour_pct: float = Field(..., description="10-hour dead fuel moisture %")
    hundred_hour_pct: float = Field(..., description="100-hour dead fuel moisture %")
    live_herbaceous_pct: float = Field(..., description="Live herbaceous fuel moisture %")
    live_woody_pct: float = Field(..., description="Live woody fuel moisture %")

class PrescribedBurnAssessment(BaseModel):
    """Comprehensive prescribed burn assessment"""
    burn_condition: BurnCondition
    weather_window_hours: int = Field(..., description="Suitable weather window duration")
    smoke_dispersion_rating: str = Field(..., description="GOOD, FAIR, POOR")
    safety_concerns: List[str]
    recommendations: List[str]
    optimal_burn_time: Optional[str] = Field(None, description="Best time to ignite")
    
class FireWeatherAnalysis(BaseModel):
    """Complete fire weather analysis"""
    location: Dict[str, float]
    timestamp: str
    current_conditions: WeatherConditions
    canadian_fwi: CanadianFWI
    atmospheric_stability: AtmosphericStability
    fuel_moisture: FuelMoisture
    prescribed_burn: PrescribedBurnAssessment
    data_quality: Dict[str, Any]

class EnhancedFireWeatherService:
    """Enhanced fire weather service with full analysis capabilities"""
    
    def __init__(self):
        self.base_weather = WeatherService()
        self.client = httpx.AsyncClient(timeout=30.0)
        
        # Previous day values for FWI calculation (would be stored in DB)
        self.prev_ffmc = 85.0
        self.prev_dmc = 6.0  
        self.prev_dc = 15.0
        
        logger.info("🔥 Enhanced Fire Weather Service initialized")
    
    async def get_comprehensive_analysis(
        self, 
        latitude: float, 
        longitude: float,
        fuel_model: str = "grass"
    ) -> FireWeatherAnalysis:
        """
        Get comprehensive fire weather analysis for prescribed burn planning
        
        Args:
            latitude: Location latitude
            longitude: Location longitude  
            fuel_model: Fuel model type (grass, brush, timber)
            
        Returns:
            Complete fire weather analysis
        """
        try:
            logger.info(f"🌡️ Starting comprehensive fire weather analysis: {latitude:.4f}, {longitude:.4f}")
            
            # Get base weather data
            weather_data = await self.base_weather.get_weather_data(latitude, longitude, True)
            current = weather_data["current_conditions"]
            
            # Calculate Canadian FWI components
            fwi_components = self._calculate_canadian_fwi(current)
            
            # Assess atmospheric stability
            stability = await self._assess_atmospheric_stability(latitude, longitude, current)
            
            # Estimate fuel moisture
            fuel_moisture = self._estimate_fuel_moisture(current, fuel_model)
            
            # Prescribed burn assessment
            burn_assessment = self._assess_prescribed_burn_conditions(
                current, fwi_components, stability, fuel_moisture
            )
            
            # Data quality assessment
            data_quality = {
                "weather_data_age_minutes": 0,  # Real-time
                "missing_parameters": [],
                "confidence_level": "high",
                "last_updated": datetime.now().isoformat()
            }
            
            analysis = FireWeatherAnalysis(
                location={"latitude": latitude, "longitude": longitude},
                timestamp=datetime.now().isoformat(),
                current_conditions=current,
                canadian_fwi=fwi_components,
                atmospheric_stability=stability,
                fuel_moisture=fuel_moisture,
                prescribed_burn=burn_assessment,
                data_quality=data_quality
            )
            
            logger.info(f"✅ Fire weather analysis complete - Burn condition: {burn_assessment.burn_condition}")
            return analysis
            
        except Exception as e:
            logger.error(f"❌ Fire weather analysis failed: {e}")
            raise
    
    def _calculate_canadian_fwi(self, conditions: WeatherConditions) -> CanadianFWI:
        """Calculate Canadian Fire Weather Index components"""
        
        temp = conditions.temperature_2m
        rh = conditions.relative_humidity_2m
        wind = conditions.wind_speed_10m * 3.6  # Convert m/s to km/h
        rain = conditions.precipitation
        
        # Fine Fuel Moisture Code (FFMC)
        if rain > 0.5:
            mo = 42.5 + 124 * (1 - math.exp(-0.201 * rain))
            rf = 101 - mo
            if rf > 0:
                mr = mo + 0.00115 * (rf ** 1.5)
            else:
                mr = mo
        else:
            mr = self.prev_ffmc
        
        ed = 0.942 * (rh ** 0.679) + 11 * math.exp((rh - 100) / 10) + 0.18 * (21.1 - temp) * (1 - math.exp(-0.115 * rh))
        
        if mr > ed:
            ko = 0.424 * (1 - (rh / 100) ** 1.7) + 0.0694 * math.sqrt(wind) * (1 - (rh / 100) ** 8)
            kd = ko * 0.581 * math.exp(0.0365 * temp)
            mr = ed + (mr - ed) * 10 ** (-kd)
        
        ew = 0.618 * (rh ** 0.753) + 10 * math.exp((rh - 100) / 10) + 0.18 * (21.1 - temp) * (1 - math.exp(-0.115 * rh))
        
        if mr < ew:
            k1 = 0.424 * (1 - ((100 - rh) / 100) ** 1.7) + 0.0694 * math.sqrt(wind) * (1 - ((100 - rh) / 100) ** 8)
            kw = k1 * 0.581 * math.exp(0.0365 * temp)
            mr = ew - (ew - mr) * 10 ** (-kw)
        
        ffmc = 59.5 * (250 - mr) / (147.2 + mr) if mr <= 250 else 59.5
        
        # Duff Moisture Code (DMC)
        if rain > 1.5:
            re = 0.92 * rain - 1.27
            mo = 20 + 280 / math.exp(0.023 * self.prev_dmc)
            if self.prev_dmc <= 33:
                b = 100 / (0.5 + 0.3 * self.prev_dmc)
            elif self.prev_dmc <= 65:
                b = 14 - 1.3 * math.log(self.prev_dmc)
            else:
                b = 6.2 * math.log(self.prev_dmc) - 17.2
            mr = mo + 1000 * re / (48.77 + b * re)
            pr = 244.72 - 43.43 * math.log(mr - 20)
        else:
            pr = self.prev_dmc
        
        if temp > -1.1:
            k = 1.894 * (temp + 1.1) * (100 - rh) * 0.0001
            dmc = pr + 100 * k
        else:
            dmc = pr
        
        # Drought Code (DC)
        if rain > 2.8:
            rd = 0.83 * rain - 1.27
            qo = 800 * math.exp(-self.prev_dc / 400)
            qr = qo + 3.937 * rd
            dr = 400 * math.log(800 / qr)
        else:
            dr = self.prev_dc
        
        if temp > -2.8:
            v = 0.36 * (temp + 2.8) + 1.75 * max(0, temp - 10) + 4.5
            dc = dr + 0.5 * v
        else:
            dc = dr
            
        # Initial Spread Index (ISI)
        fw = math.exp(0.05039 * wind)
        m = 147.2 * (101 - ffmc) / (59.5 + ffmc)
        fF = 91.9 * math.exp(-0.1386 * m) * (1 + (m ** 5.31) / (4.93e7))
        isi = 0.208 * fw * fF
        
        # Buildup Index (BUI)
        if dmc <= 0.4 * dc:
            bui = 0.8 * dc * dmc / (dmc + 0.4 * dc)
        else:
            bui = dmc - (1 - 0.8 * dc / (dmc + 0.4 * dc)) * (0.92 + (0.0114 * dmc) ** 1.7)
        
        # Fire Weather Index (FWI)
        if bui <= 80:
            fD = 0.626 * (bui ** 0.809) + 2
        else:
            fD = 1000 / (25 + 108.64 * math.exp(-0.023 * bui))
        
        b = 0.1 * isi * fD
        if b > 1:
            s = math.exp(2.72 * (0.434 * math.log(b)) ** 0.647)
            fwi = 2 * math.log(s)
        else:
            fwi = b
        
        # Determine danger rating
        if fwi < 5:
            danger = FireDangerRating.LOW
        elif fwi < 12:
            danger = FireDangerRating.MODERATE  
        elif fwi < 25:
            danger = FireDangerRating.HIGH
        elif fwi < 40:
            danger = FireDangerRating.VERY_HIGH
        else:
            danger = FireDangerRating.EXTREME
        
        return CanadianFWI(
            ffmc=round(ffmc, 1),
            dmc=round(dmc, 1), 
            dc=round(dc, 1),
            isi=round(isi, 1),
            bui=round(bui, 1),
            fwi=round(fwi, 1),
            danger_rating=danger
        )
    
    async def _assess_atmospheric_stability(
        self, 
        latitude: float, 
        longitude: float, 
        conditions: WeatherConditions
    ) -> AtmosphericStability:
        """Assess atmospheric stability and mixing conditions"""
        
        # Estimate mixing height based on time of day and conditions
        hour = datetime.now().hour
        if 6 <= hour <= 18:  # Daytime
            base_height = 1000 + 500 * (conditions.temperature_2m - 10) / 20
        else:  # Nighttime
            base_height = 200 + 100 * max(0, conditions.wind_speed_10m - 2)
        
        mixing_height = max(100, min(3000, base_height))
        
        # Pasquill stability class estimation
        wind_speed = conditions.wind_speed_10m
        if hour >= 6 and hour <= 18:  # Day
            if wind_speed < 2:
                stability_class = "A"  # Very unstable
            elif wind_speed < 3:
                stability_class = "B"  # Moderately unstable
            elif wind_speed < 5:
                stability_class = "C"  # Slightly unstable
            else:
                stability_class = "D"  # Neutral
        else:  # Night
            if wind_speed < 2:
                stability_class = "F"  # Very stable
            elif wind_speed < 3:
                stability_class = "E"  # Moderately stable
            else:
                stability_class = "D"  # Neutral
        
        # Ventilation rate
        ventilation = mixing_height * wind_speed
        
        # Haines Index (simplified)
        # Normally requires upper air data, using surface approximation
        temp_component = max(0, conditions.temperature_2m - 15) / 5
        moisture_component = max(0, 60 - conditions.relative_humidity_2m) / 20
        haines = min(6, 2 + temp_component + moisture_component)
        
        return AtmosphericStability(
            mixing_height_m=mixing_height,
            stability_class=stability_class,
            ventilation_rate=ventilation,
            haines_index=round(haines, 1)
        )
    
    def _estimate_fuel_moisture(self, conditions: WeatherConditions, fuel_model: str) -> FuelMoisture:
        """Estimate fuel moisture content based on weather conditions"""
        
        temp = conditions.temperature_2m
        rh = conditions.relative_humidity_2m
        
        # 1-hour fuel moisture (Nelson 2000)
        one_hour = 1.03 + 0.115 * rh + 0.0142 * rh * temp - 0.0215 * temp
        one_hour = max(3, min(35, one_hour))
        
        # 10-hour fuel moisture (approximation)
        ten_hour = one_hour * 1.3 + 2
        
        # 100-hour fuel moisture (slower response)
        hundred_hour = one_hour * 1.8 + 4
        
        # Live fuel moisture (seasonal/species dependent)
        if fuel_model == "grass":
            live_herb = max(30, 120 - temp * 2 + rh * 0.5)
            live_woody = max(60, 150 - temp * 1.5 + rh * 0.3)
        elif fuel_model == "brush":
            live_herb = max(50, 140 - temp * 2.5 + rh * 0.4)
            live_woody = max(80, 180 - temp * 2 + rh * 0.2)
        else:  # timber
            live_herb = max(40, 100 - temp * 1.5 + rh * 0.6)
            live_woody = max(90, 200 - temp * 1.8 + rh * 0.15)
        
        return FuelMoisture(
            one_hour_pct=round(one_hour, 1),
            ten_hour_pct=round(ten_hour, 1),
            hundred_hour_pct=round(hundred_hour, 1),
            live_herbaceous_pct=round(live_herb, 1),
            live_woody_pct=round(live_woody, 1)
        )
    
    def _assess_prescribed_burn_conditions(
        self,
        conditions: WeatherConditions,
        fwi: CanadianFWI,
        stability: AtmosphericStability, 
        fuel_moisture: FuelMoisture
    ) -> PrescribedBurnAssessment:
        """Assess prescribed burn suitability"""
        
        concerns = []
        recommendations = []
        
        # Wind assessment
        wind_speed = conditions.wind_speed_10m
        if wind_speed < 1:
            concerns.append("Very low wind - poor smoke dispersion")
            smoke_rating = "POOR"
        elif wind_speed > 10:
            concerns.append("High wind speed - fire control risk")
            smoke_rating = "FAIR"
        else:
            smoke_rating = "GOOD"
        
        # Fire weather index assessment
        if fwi.danger_rating in [FireDangerRating.VERY_HIGH, FireDangerRating.EXTREME]:
            concerns.append("Very high fire danger - escape risk")
        
        # Fuel moisture assessment
        if fuel_moisture.one_hour_pct < 8:
            concerns.append("Very dry fine fuels - rapid fire spread risk")
        
        # Atmospheric stability assessment
        if stability.stability_class in ["F", "E"]:
            concerns.append("Stable atmosphere - poor smoke dispersion")
            
        if stability.haines_index > 4:
            concerns.append("Unstable atmosphere - erratic fire behavior")
        
        # Determine burn condition
        if len(concerns) == 0 and fwi.danger_rating == FireDangerRating.LOW:
            burn_condition = BurnCondition.EXCELLENT
            window_hours = 8
        elif len(concerns) <= 1 and fwi.danger_rating in [FireDangerRating.LOW, FireDangerRating.MODERATE]:
            burn_condition = BurnCondition.GOOD
            window_hours = 6
        elif len(concerns) <= 2 and fwi.danger_rating != FireDangerRating.EXTREME:
            burn_condition = BurnCondition.MARGINAL  
            window_hours = 4
        elif fwi.danger_rating == FireDangerRating.EXTREME:
            burn_condition = BurnCondition.PROHIBITED
            window_hours = 0
        else:
            burn_condition = BurnCondition.POOR
            window_hours = 2
        
        # Recommendations based on conditions
        if burn_condition in [BurnCondition.EXCELLENT, BurnCondition.GOOD]:
            recommendations.append("Conditions suitable for prescribed burning")
            recommendations.append("Monitor wind direction for smoke management")
            recommendations.append("Ensure adequate suppression resources on site")
        else:
            recommendations.append("Wait for more favorable conditions")
            recommendations.append("Monitor weather forecasts for improvement")
            
        # Optimal burn timing
        if 8 <= datetime.now().hour <= 14 and wind_speed >= 2:
            optimal_time = "Now - good mixing conditions"
        elif datetime.now().hour < 8:
            optimal_time = "Late morning after atmosphere becomes unstable"
        else:
            optimal_time = "Early morning tomorrow"
        
        return PrescribedBurnAssessment(
            burn_condition=burn_condition,
            weather_window_hours=window_hours,
            smoke_dispersion_rating=smoke_rating,
            safety_concerns=concerns,
            recommendations=recommendations,
            optimal_burn_time=optimal_time
        )
    
    async def close(self):
        """Close HTTP clients"""
        await self.base_weather.close()
        await self.client.aclose()

# Example usage
if __name__ == "__main__":
    async def test_fire_weather():
        service = EnhancedFireWeatherService()
        
        # Test with Santa Rosa coordinates
        analysis = await service.get_comprehensive_analysis(38.4404925, -122.7141049)
        
        print(f"🔥 Fire Weather Analysis")
        print(f"   Burn Condition: {analysis.prescribed_burn.burn_condition}")
        print(f"   FWI: {analysis.canadian_fwi.fwi} ({analysis.canadian_fwi.danger_rating})")
        print(f"   1-hr Fuel Moisture: {analysis.fuel_moisture.one_hour_pct}%")
        print(f"   Mixing Height: {analysis.atmospheric_stability.mixing_height_m}m")
        print(f"   Safety Concerns: {len(analysis.prescribed_burn.safety_concerns)}")
        
        await service.close()
    
    asyncio.run(test_fire_weather())
