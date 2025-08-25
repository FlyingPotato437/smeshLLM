#!/usr/bin/env python3
"""
Prescribed Fire PINN - Enhanced smoke dispersion modeling for controlled burns
Predicts smoke behavior, optimal burn windows, and safety recommendations
"""

import os
import torch
import torch.nn as nn
import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel
import logging
from enum import Enum

# Import base PINN
from train_pinn_n5 import StanfordAtmosphericPINN
from pinn_prediction_api import PINNPredictor

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class BurnWindow(str, Enum):
    """Prescribed burn suitability windows"""
    EXCELLENT = "excellent"
    GOOD = "good" 
    MARGINAL = "marginal"
    POOR = "poor"
    PROHIBITED = "prohibited"

class WindPattern(str, Enum):
    """Wind pattern classifications"""
    STABLE_DISPERSAL = "stable_dispersal"
    STAGNANT = "stagnant"
    GUSTY_VARIABLE = "gusty_variable"
    STRONG_DIRECTIONAL = "strong_directional"
    THERMAL_DRIVEN = "thermal_driven"

class PrescribedFireInput(BaseModel):
    """Input for prescribed fire smoke modeling"""
    # Location and fire parameters
    latitude: float = 37.4275
    longitude: float = -122.1697
    burn_area_acres: float = 100.0
    fuel_load_tons_per_acre: float = 15.0
    
    # Current weather conditions
    temperature_c: float = 18.0
    humidity_pct: float = 45.0
    wind_speed_ms: float = 3.0
    wind_direction_deg: float = 270.0
    atmospheric_pressure_mb: float = 1013.25
    
    # Forecast conditions (next 6 hours)
    forecast_temp: List[float] = [18, 19, 21, 23, 22, 20]
    forecast_humidity: List[float] = [45, 42, 38, 35, 40, 50]
    forecast_wind_speed: List[float] = [3, 4, 5, 6, 4, 3]
    forecast_wind_dir: List[float] = [270, 280, 285, 290, 275, 270]
    
    # Sensitive areas (distances in km)
    residential_distance_km: float = 2.0
    school_distance_km: float = 3.0
    hospital_distance_km: float = 5.0
    highway_distance_km: float = 1.0

class PrescribedFireOutput(BaseModel):
    """Output from prescribed fire analysis"""
    burn_window: BurnWindow
    wind_pattern: WindPattern
    
    # Smoke predictions
    smoke_dispersion: Dict[str, float]  # PM2.5 at different distances/times
    maximum_impact_area_km2: float
    smoke_duration_hours: float
    
    # Safety assessments
    residential_impact: Dict
    visibility_impact: Dict
    air_quality_forecast: List[Dict]
    
    # Recommendations
    optimal_ignition_time: str
    wind_recommendations: List[str]
    safety_precautions: List[str]
    
    # Technical details
    physics_parameters: Dict[str, float]
    confidence_score: float
    
    class Config:
        arbitrary_types_allowed = True

class PrescribedFirePINN:
    """Enhanced PINN for prescribed fire smoke dispersion modeling"""
    
    def __init__(self):
        self.base_predictor = PINNPredictor()
        self.model_loaded = False
        
    def load_model(self) -> bool:
        """Load the base PINN model"""
        success = self.base_predictor.load_model()
        self.model_loaded = success
        return success
    
    def analyze_prescribed_burn(self, input_data: PrescribedFireInput) -> PrescribedFireOutput:
        """Comprehensive prescribed fire analysis"""
        
        if not self.model_loaded:
            raise Exception("PINN model not loaded")
        
        logger.info(f"🔥 Analyzing prescribed burn: {input_data.burn_area_acres} acres")
        
        # 1. Classify wind patterns
        wind_pattern = self._classify_wind_pattern(input_data)
        
        # 2. Calculate burn window suitability
        burn_window = self._calculate_burn_window(input_data, wind_pattern)
        
        # 3. Model smoke dispersion using PINN
        smoke_dispersion = self._model_smoke_dispersion(input_data)
        
        # 4. Assess impacts on sensitive areas
        residential_impact = self._assess_residential_impact(input_data, smoke_dispersion)
        visibility_impact = self._assess_visibility_impact(input_data, smoke_dispersion)
        
        # 5. Generate air quality forecast
        aq_forecast = self._generate_air_quality_forecast(input_data)
        
        # 6. Determine optimal timing and recommendations
        optimal_time = self._find_optimal_ignition_time(input_data)
        wind_recs = self._generate_wind_recommendations(input_data, wind_pattern)
        safety_recs = self._generate_safety_precautions(input_data, wind_pattern)
        
        # 7. Calculate confidence and physics parameters
        confidence = self._calculate_confidence(input_data, wind_pattern)
        physics_params = self.base_predictor.metadata['physics_parameters'] if self.base_predictor.metadata else {}
        
        return PrescribedFireOutput(
            burn_window=burn_window,
            wind_pattern=wind_pattern,
            smoke_dispersion=smoke_dispersion,
            maximum_impact_area_km2=self._calculate_max_impact_area(smoke_dispersion),
            smoke_duration_hours=self._estimate_smoke_duration(input_data),
            residential_impact=residential_impact,
            visibility_impact=visibility_impact,
            air_quality_forecast=aq_forecast,
            optimal_ignition_time=optimal_time,
            wind_recommendations=wind_recs,
            safety_precautions=safety_recs,
            physics_parameters=physics_params,
            confidence_score=confidence
        )
    
    def _classify_wind_pattern(self, input_data: PrescribedFireInput) -> WindPattern:
        """Classify wind patterns for burn planning"""
        
        # Analyze current and forecast wind conditions
        current_speed = input_data.wind_speed_ms
        wind_speeds = input_data.forecast_wind_speed
        wind_dirs = input_data.forecast_wind_dir
        
        # Calculate wind variability
        speed_variability = np.std(wind_speeds)
        direction_variability = np.std(wind_dirs)
        
        # Classification logic
        if current_speed < 2.0 and max(wind_speeds) < 3.0:
            return WindPattern.STAGNANT
        elif speed_variability > 2.0 or direction_variability > 45:
            return WindPattern.GUSTY_VARIABLE
        elif current_speed > 8.0 or max(wind_speeds) > 10.0:
            return WindPattern.STRONG_DIRECTIONAL
        elif self._is_thermal_driven_pattern(input_data):
            return WindPattern.THERMAL_DRIVEN
        else:
            return WindPattern.STABLE_DISPERSAL
    
    def _is_thermal_driven_pattern(self, input_data: PrescribedFireInput) -> bool:
        """Detect thermal-driven wind patterns (sea breeze, mountain/valley)"""
        
        # Check for temperature-driven wind direction changes
        temp_range = max(input_data.forecast_temp) - min(input_data.forecast_temp)
        wind_dirs = input_data.forecast_wind_dir
        
        # Look for systematic wind direction shifts with temperature
        direction_shift = abs(wind_dirs[-1] - wind_dirs[0])
        
        return temp_range > 8.0 and direction_shift > 90
    
    def _calculate_burn_window(self, input_data: PrescribedFireInput, wind_pattern: WindPattern) -> BurnWindow:
        """Determine burn window suitability"""
        
        score = 100  # Start with perfect score
        
        # Wind speed assessment
        if input_data.wind_speed_ms < 1.0:
            score -= 30  # Too stagnant
        elif input_data.wind_speed_ms > 10.0:
            score -= 40  # Too windy
        elif 2.0 <= input_data.wind_speed_ms <= 6.0:
            score += 10  # Ideal range
        
        # Humidity assessment
        if input_data.humidity_pct < 20:
            score -= 50  # Too dry, high fire danger
        elif input_data.humidity_pct > 70:
            score -= 20  # Too humid, poor combustion
        elif 30 <= input_data.humidity_pct <= 50:
            score += 10  # Ideal range
        
        # Temperature assessment
        if input_data.temperature_c > 32:
            score -= 25  # Too hot
        elif input_data.temperature_c < 5:
            score -= 15  # Too cold
        elif 15 <= input_data.temperature_c <= 25:
            score += 5  # Good range
        
        # Wind pattern penalty
        pattern_penalties = {
            WindPattern.STAGNANT: -25,
            WindPattern.GUSTY_VARIABLE: -35,
            WindPattern.STRONG_DIRECTIONAL: -30,
            WindPattern.THERMAL_DRIVEN: -10,
            WindPattern.STABLE_DISPERSAL: +15
        }
        score += pattern_penalties[wind_pattern]
        
        # Proximity to sensitive areas
        if input_data.residential_distance_km < 1.0:
            score -= 20
        elif input_data.highway_distance_km < 0.5:
            score -= 15
        
        # Convert score to burn window
        if score >= 85:
            return BurnWindow.EXCELLENT
        elif score >= 70:
            return BurnWindow.GOOD
        elif score >= 50:
            return BurnWindow.MARGINAL
        elif score >= 30:
            return BurnWindow.POOR
        else:
            return BurnWindow.PROHIBITED
    
    def _model_smoke_dispersion(self, input_data: PrescribedFireInput) -> Dict[str, float]:
        """Model smoke dispersion using PINN at multiple distances and times"""
        
        results = {}
        
        # Calculate emission rate based on fuel load and burn area
        emission_rate = input_data.fuel_load_tons_per_acre * input_data.burn_area_acres * 0.1  # kg PM2.5/hour (simplified)
        
        # Model smoke at different distances and times
        distances = [0.5, 1.0, 2.0, 5.0, 10.0]  # km
        times = [1, 2, 4, 6]  # hours
        
        for distance in distances:
            for time in times:
                # Use PINN to predict concentration
                from pinn_prediction_api import PINNPredictionInput
                
                # Estimate PM1.0 background based on fire emissions
                pm1_background = emission_rate * 0.1 / (distance ** 2 + 1)  # Simplified dispersion
                
                pinn_input = PINNPredictionInput(
                    temperature_c=input_data.temperature_c,
                    humidity_pct=input_data.humidity_pct,
                    wind_speed=input_data.wind_speed_ms,
                    wind_direction=input_data.wind_direction_deg,
                    pm1_ugm3=pm1_background,
                    time_hours=time
                )
                
                prediction = self.base_predictor.predict(pinn_input)
                
                # Apply distance decay and wind direction
                wind_factor = self._calculate_wind_dispersion_factor(
                    input_data.wind_direction_deg, distance, input_data.wind_speed_ms
                )
                
                concentration = prediction.pm25_predicted * wind_factor * (emission_rate / 100)
                
                results[f"pm25_at_{distance}km_after_{time}h"] = max(0, concentration)
        
        return results
    
    def _calculate_wind_dispersion_factor(self, wind_dir: float, distance: float, wind_speed: float) -> float:
        """Calculate how wind affects smoke dispersion in a given direction"""
        
        # Simplified Gaussian plume model factor
        # Higher wind speed = better dispersion
        # Distance affects concentration
        
        dispersion_factor = (wind_speed + 1) / (distance + 1)
        
        # Add some directional spreading
        spreading_factor = 1.0 + (distance * 0.1)
        
        return dispersion_factor * spreading_factor
    
    def _assess_residential_impact(self, input_data: PrescribedFireInput, smoke_dispersion: Dict) -> Dict:
        """Assess impact on residential areas"""
        
        distance = input_data.residential_distance_km
        
        # Find closest distance key in smoke dispersion
        distance_key = None
        for key in smoke_dispersion.keys():
            if f"{distance}km" in key:
                distance_key = key
                break
        
        if not distance_key:
            # Interpolate from available data
            pm25_concentration = 10.0  # Default estimate
        else:
            pm25_concentration = smoke_dispersion[distance_key]
        
        # Health impact assessment
        if pm25_concentration < 12:
            health_level = "Good"
            recommendation = "Minimal impact expected"
        elif pm25_concentration < 35:
            health_level = "Moderate"
            recommendation = "Sensitive individuals should limit outdoor activity"
        elif pm25_concentration < 55:
            health_level = "Unhealthy for Sensitive Groups"
            recommendation = "Children, elderly, and those with respiratory conditions should stay indoors"
        else:
            health_level = "Unhealthy"
            recommendation = "All residents should limit outdoor exposure"
        
        return {
            "distance_km": distance,
            "estimated_pm25": pm25_concentration,
            "health_level": health_level,
            "recommendation": recommendation,
            "estimated_duration_hours": self._estimate_impact_duration(input_data, distance)
        }
    
    def _assess_visibility_impact(self, input_data: PrescribedFireInput, smoke_dispersion: Dict) -> Dict:
        """Assess visibility impacts on roads and aviation"""
        
        highway_distance = input_data.highway_distance_km
        
        # Estimate visibility based on PM2.5 concentration
        # Rough conversion: PM2.5 (μg/m³) to visibility (km)
        avg_concentration = np.mean(list(smoke_dispersion.values()))
        
        if avg_concentration < 15:
            visibility_km = 10.0
            impact_level = "Minimal"
        elif avg_concentration < 35:
            visibility_km = 5.0
            impact_level = "Moderate"
        elif avg_concentration < 75:
            visibility_km = 2.0
            impact_level = "Significant"
        else:
            visibility_km = 0.5
            impact_level = "Severe"
        
        return {
            "highway_distance_km": highway_distance,
            "estimated_visibility_km": visibility_km,
            "impact_level": impact_level,
            "traffic_recommendation": self._get_traffic_recommendation(visibility_km),
            "aviation_impact": "Restricted" if visibility_km < 3 else "Caution" if visibility_km < 8 else "Normal"
        }
    
    def _generate_air_quality_forecast(self, input_data: PrescribedFireInput) -> List[Dict]:
        """Generate hourly air quality forecast"""
        
        forecast = []
        
        for hour in range(6):
            # Use forecast weather conditions
            temp = input_data.forecast_temp[hour]
            humidity = input_data.forecast_humidity[hour]
            wind_speed = input_data.forecast_wind_speed[hour]
            wind_dir = input_data.forecast_wind_dir[hour]
            
            # Predict concentration for this hour
            from pinn_prediction_api import PINNPredictionInput
            
            pinn_input = PINNPredictionInput(
                temperature_c=temp,
                humidity_pct=humidity,
                wind_speed=wind_speed,
                wind_direction=wind_dir,
                pm1_ugm3=8.0,  # Background level
                time_hours=hour
            )
            
            prediction = self.base_predictor.predict(pinn_input)
            
            # Add fire contribution (decreases over time)
            fire_contribution = max(0, 25 * (1 - hour/6))  # Peak at ignition, decay
            total_pm25 = prediction.pm25_predicted + fire_contribution
            
            # AQI calculation
            aqi = self._pm25_to_aqi(total_pm25)
            
            forecast.append({
                "hour": hour,
                "temperature_c": temp,
                "humidity_pct": humidity,
                "wind_speed_ms": wind_speed,
                "wind_direction_deg": wind_dir,
                "pm25_ugm3": total_pm25,
                "aqi": aqi,
                "health_category": self._aqi_to_category(aqi)
            })
        
        return forecast
    
    def _find_optimal_ignition_time(self, input_data: PrescribedFireInput) -> str:
        """Find optimal time for ignition based on weather forecast"""
        
        best_score = -1
        best_hour = 0
        
        for hour in range(6):
            score = 100
            
            # Temperature factor (prefer moderate temps)
            temp = input_data.forecast_temp[hour]
            if 15 <= temp <= 25:
                score += 20
            elif temp > 30:
                score -= 30
            
            # Wind factor (prefer 3-6 m/s)
            wind = input_data.forecast_wind_speed[hour]
            if 3 <= wind <= 6:
                score += 25
            elif wind < 2:
                score -= 20
            elif wind > 8:
                score -= 35
            
            # Humidity factor (prefer 30-60%)
            humidity = input_data.forecast_humidity[hour]
            if 30 <= humidity <= 60:
                score += 15
            elif humidity < 20:
                score -= 40
            
            if score > best_score:
                best_score = score
                best_hour = hour
        
        current_time = datetime.now()
        optimal_time = current_time + timedelta(hours=best_hour)
        
        return optimal_time.strftime("%H:%M today" if best_hour < 12 else "%H:%M")
    
    def _generate_wind_recommendations(self, input_data: PrescribedFireInput, wind_pattern: WindPattern) -> List[str]:
        """Generate wind-specific recommendations"""
        
        recommendations = []
        
        if wind_pattern == WindPattern.STAGNANT:
            recommendations.extend([
                "⚠️ STAGNANT CONDITIONS: Smoke will linger in burn area",
                "Consider postponing burn until wind increases to 3-5 m/s",
                "If proceeding, use smaller ignition areas to limit smoke production",
                "Monitor for thermal wind development as day progresses"
            ])
        
        elif wind_pattern == WindPattern.GUSTY_VARIABLE:
            recommendations.extend([
                "🌪️ GUSTY/VARIABLE WINDS: Unpredictable smoke direction",
                "High risk - consider postponing burn",
                "If proceeding, use extreme caution with containment lines",
                "Have suppression resources pre-positioned on all sides"
            ])
        
        elif wind_pattern == WindPattern.STRONG_DIRECTIONAL:
            recommendations.extend([
                "💨 STRONG WINDS: Rapid smoke transport but potential for escape",
                f"Smoke will move quickly toward {self._degrees_to_direction(input_data.wind_direction_deg + 180)}",
                "Ensure adequate firebreaks downwind",
                "Consider reducing burn intensity or area"
            ])
        
        elif wind_pattern == WindPattern.THERMAL_DRIVEN:
            recommendations.extend([
                "🌡️ THERMAL-DRIVEN PATTERN: Wind direction will shift during burn",
                "Plan ignition sequence to account for changing wind direction",
                "Morning winds may differ significantly from afternoon",
                "Monitor weather stations for wind shifts"
            ])
        
        elif wind_pattern == WindPattern.STABLE_DISPERSAL:
            recommendations.extend([
                "✅ IDEAL CONDITIONS: Steady winds for good smoke dispersal",
                f"Consistent smoke movement toward {self._degrees_to_direction(input_data.wind_direction_deg + 180)}",
                "Good conditions for controlled ignition sequence",
                "Maintain situational awareness for wind changes"
            ])
        
        return recommendations
    
    def _generate_safety_precautions(self, input_data: PrescribedFireInput, wind_pattern: WindPattern) -> List[str]:
        """Generate safety precautions based on conditions"""
        
        precautions = [
            "Establish communication with local fire department",
            "Have suppression equipment staged and ready",
            "Monitor weather conditions continuously"
        ]
        
        # Distance-based precautions
        if input_data.residential_distance_km < 2.0:
            precautions.extend([
                "⚠️ Close to residential areas - notify neighbors in advance",
                "Have evacuation plan ready if fire escapes",
                "Consider air quality monitoring for nearby residents"
            ])
        
        if input_data.highway_distance_km < 1.0:
            precautions.extend([
                "🛣️ Close to highway - coordinate with traffic authorities",
                "Post visibility warnings if smoke affects roadway",
                "Have flaggers ready if visibility drops below 400m"
            ])
        
        # Weather-based precautions
        if input_data.humidity_pct < 25:
            precautions.append("🔥 Low humidity - increased fire danger, reduce burn intensity")
        
        if input_data.wind_speed_ms > 8:
            precautions.append("💨 High winds - consider postponing or reducing burn area")
        
        return precautions
    
    # Helper methods
    def _calculate_max_impact_area(self, smoke_dispersion: Dict) -> float:
        """Calculate maximum impact area in km²"""
        max_distance = 5.0  # Default
        for key in smoke_dispersion.keys():
            if "10km" in key and smoke_dispersion[key] > 5:  # Threshold concentration
                max_distance = 10.0
        
        return np.pi * max_distance ** 2
    
    def _estimate_smoke_duration(self, input_data: PrescribedFireInput) -> float:
        """Estimate total smoke duration"""
        # Based on fuel load and burn area
        base_duration = (input_data.fuel_load_tons_per_acre * input_data.burn_area_acres) / 50
        wind_factor = max(0.5, 8.0 / (input_data.wind_speed_ms + 1))
        return base_duration * wind_factor
    
    def _estimate_impact_duration(self, input_data: PrescribedFireInput, distance: float) -> float:
        """Estimate impact duration at given distance"""
        base_duration = self._estimate_smoke_duration(input_data)
        distance_factor = 1.0 + (distance * 0.2)
        return base_duration * distance_factor
    
    def _get_traffic_recommendation(self, visibility_km: float) -> str:
        """Get traffic recommendation based on visibility"""
        if visibility_km > 8:
            return "Normal traffic conditions"
        elif visibility_km > 3:
            return "Caution advised - reduced visibility"
        elif visibility_km > 1:
            return "Warning - significantly reduced visibility"
        else:
            return "Hazardous - consider road closure"
    
    def _pm25_to_aqi(self, pm25: float) -> int:
        """Convert PM2.5 to AQI"""
        if pm25 <= 12.0:
            return int((50/12.0) * pm25)
        elif pm25 <= 35.5:
            return int(50 + ((100-50)/(35.5-12.0)) * (pm25 - 12.0))
        elif pm25 <= 55.4:
            return int(101 + ((150-101)/(55.4-35.5)) * (pm25 - 35.5))
        else:
            return min(300, int(151 + ((200-151)/(150.4-55.4)) * (pm25 - 55.4)))
    
    def _aqi_to_category(self, aqi: int) -> str:
        """Convert AQI to health category"""
        if aqi <= 50:
            return "Good"
        elif aqi <= 100:
            return "Moderate"
        elif aqi <= 150:
            return "Unhealthy for Sensitive Groups"
        elif aqi <= 200:
            return "Unhealthy"
        else:
            return "Very Unhealthy"
    
    def _degrees_to_direction(self, degrees: float) -> str:
        """Convert wind direction degrees to compass direction"""
        directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
                     "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"]
        index = int((degrees + 11.25) / 22.5) % 16
        return directions[index]
    
    def _calculate_confidence(self, input_data: PrescribedFireInput, wind_pattern: WindPattern) -> float:
        """Calculate prediction confidence score"""
        confidence = 0.8  # Base confidence
        
        # Reduce confidence for complex wind patterns
        if wind_pattern in [WindPattern.GUSTY_VARIABLE, WindPattern.THERMAL_DRIVEN]:
            confidence -= 0.2
        
        # Reduce confidence for extreme conditions
        if input_data.wind_speed_ms > 10 or input_data.wind_speed_ms < 1:
            confidence -= 0.1
        
        return max(0.3, confidence)

# Test function
def test_prescribed_fire_analysis():
    """Test prescribed fire analysis"""
    
    print("🔥 Testing Prescribed Fire PINN Analysis")
    print("="*60)
    
    # Initialize PINN
    fire_pinn = PrescribedFirePINN()
    if not fire_pinn.load_model():
        print("❌ Failed to load PINN model")
        return
    
    # Test scenarios
    scenarios = [
        {
            "name": "Ideal Conditions",
            "input": PrescribedFireInput(
                burn_area_acres=50,
                temperature_c=20,
                humidity_pct=45,
                wind_speed_ms=4,
                wind_direction_deg=270,
                residential_distance_km=3.0
            )
        },
        {
            "name": "Marginal Conditions", 
            "input": PrescribedFireInput(
                burn_area_acres=100,
                temperature_c=28,
                humidity_pct=25,
                wind_speed_ms=8,
                wind_direction_deg=180,
                residential_distance_km=1.5
            )
        },
        {
            "name": "Poor Conditions",
            "input": PrescribedFireInput(
                burn_area_acres=200,
                temperature_c=32,
                humidity_pct=15,
                wind_speed_ms=12,
                wind_direction_deg=90,
                residential_distance_km=0.8
            )
        }
    ]
    
    for scenario in scenarios:
        print(f"\n📋 Scenario: {scenario['name']}")
        print("-" * 40)
        
        try:
            result = fire_pinn.analyze_prescribed_burn(scenario['input'])
            
            print(f"Burn Window: {result.burn_window.value.upper()}")
            print(f"Wind Pattern: {result.wind_pattern.value.replace('_', ' ').title()}")
            print(f"Optimal Time: {result.optimal_ignition_time}")
            print(f"Max Impact Area: {result.maximum_impact_area_km2:.1f} km²")
            print(f"Confidence: {result.confidence_score:.1%}")
            
            print("\nWind Recommendations:")
            for rec in result.wind_recommendations[:2]:
                print(f"  • {rec}")
            
            print(f"\nResidential Impact: {result.residential_impact['health_level']}")
            print(f"Visibility Impact: {result.visibility_impact['impact_level']}")
            
        except Exception as e:
            print(f"❌ Error: {e}")
    
    print("\n✅ Prescribed Fire PINN Analysis Complete!")

if __name__ == "__main__":
    test_prescribed_fire_analysis() 