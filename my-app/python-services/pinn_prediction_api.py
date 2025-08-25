#!/usr/bin/env python3
"""
PINN Prediction API - Simple test endpoint
Test the trained Stanford PINN model with real atmospheric data
"""

import os
import torch
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import Dict, List, Optional
import logging

# Import our PINN model
from train_pinn_n5 import StanfordAtmosphericPINN

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(title="PINN Prediction API", version="1.0.0")

class PINNPredictionInput(BaseModel):
    """Input for PINN prediction"""
    temperature_c: float = 15.0  # Temperature in Celsius
    humidity_pct: float = 60.0   # Relative humidity %
    wind_speed: float = 3.0      # Wind speed m/s
    wind_direction: float = 270.0  # Wind direction degrees
    pm1_ugm3: float = 5.0        # Background PM1.0 concentration
    time_hours: float = 0.0      # Time since start (hours)
    
class PINNPredictionOutput(BaseModel):
    """Output from PINN prediction"""
    pm25_predicted: float
    pm10_predicted: float
    input_conditions: Dict
    physics_parameters: Dict
    model_confidence: str

class PINNPredictor:
    """PINN prediction service"""
    
    def __init__(self):
        self.model = None
        self.metadata = None
        self.model_loaded = False
        
    def load_model(self, model_id: str = "stanford_pinn_20250718_103012") -> bool:
        """Load the trained PINN model"""
        
        try:
            model_path = f"models/{model_id}.pth"
            if not os.path.exists(model_path):
                logger.error(f"Model file not found: {model_path}")
                return False
            
            # Load model package
            model_package = torch.load(model_path, map_location=torch.device('cpu'))
            
            # Initialize model
            self.model = StanfordAtmosphericPINN(hidden_layers=[128, 128, 64, 32])
            self.model.load_state_dict(model_package['model_state_dict'])
            self.model.eval()
            
            # Store metadata
            self.metadata = {
                'feature_means': np.array(model_package['feature_means']),
                'feature_stds': np.array(model_package['feature_stds']),
                'physics_parameters': model_package['physics_parameters']
            }
            
            self.model_loaded = True
            logger.info(f"✅ PINN model loaded: {model_id}")
            return True
            
        except Exception as e:
            logger.error(f"❌ Failed to load PINN model: {e}")
            return False
    
    def predict(self, input_data: PINNPredictionInput) -> PINNPredictionOutput:
        """Make prediction using PINN model"""
        
        if not self.model_loaded:
            raise HTTPException(status_code=503, detail="PINN model not loaded")
        
        try:
            # Prepare input features [x, y, t, temp, humidity, wind_speed, wind_dir, pm1, source]
            raw_features = np.array([
                0.0,  # x coordinate (relative)
                0.0,  # y coordinate (relative)
                input_data.time_hours,
                input_data.temperature_c,
                input_data.humidity_pct,
                input_data.wind_speed,
                np.deg2rad(input_data.wind_direction),  # Convert to radians
                input_data.pm1_ugm3,
                input_data.pm1_ugm3 + np.random.normal(0, 0.5)  # Source intensity
            ])
            
            # Normalize features using training statistics
            normalized_features = (raw_features - self.metadata['feature_means']) / self.metadata['feature_stds']
            
            # Convert to tensor
            input_tensor = torch.FloatTensor(normalized_features).unsqueeze(0)
            
            # Make prediction
            with torch.no_grad():
                prediction = self.model(input_tensor)
                pm25_pred = prediction[0, 0].item()
                pm10_pred = prediction[0, 1].item()
            
            # Assess confidence based on input ranges
            confidence = self._assess_confidence(input_data)
            
            return PINNPredictionOutput(
                pm25_predicted=max(0.0, pm25_pred),  # Ensure positive
                pm10_predicted=max(0.0, pm10_pred),  # Ensure positive
                input_conditions={
                    'temperature_c': input_data.temperature_c,
                    'humidity_pct': input_data.humidity_pct,
                    'wind_speed': input_data.wind_speed,
                    'wind_direction': input_data.wind_direction,
                    'pm1_background': input_data.pm1_ugm3
                },
                physics_parameters=self.metadata['physics_parameters'],
                model_confidence=confidence
            )
            
        except Exception as e:
            logger.error(f"❌ Prediction failed: {e}")
            raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")
    
    def _assess_confidence(self, input_data: PINNPredictionInput) -> str:
        """Assess prediction confidence based on input ranges"""
        
        # Check if inputs are within reasonable training ranges
        temp_ok = 5 <= input_data.temperature_c <= 30
        humidity_ok = 20 <= input_data.humidity_pct <= 100
        wind_ok = 0 <= input_data.wind_speed <= 15
        pm1_ok = 0 <= input_data.pm1_ugm3 <= 50
        
        conditions_met = sum([temp_ok, humidity_ok, wind_ok, pm1_ok])
        
        if conditions_met == 4:
            return "High"
        elif conditions_met >= 3:
            return "Medium"
        else:
            return "Low"

# Initialize predictor
predictor = PINNPredictor()

@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    success = predictor.load_model()
    if not success:
        logger.error("Failed to load PINN model on startup")

@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": predictor.model_loaded,
        "service": "PINN Prediction API"
    }

@app.post("/predict", response_model=PINNPredictionOutput)
async def predict_concentrations(input_data: PINNPredictionInput):
    """Predict PM2.5 and PM10 concentrations using PINN model"""
    
    return predictor.predict(input_data)

@app.get("/test-predictions")
async def test_predictions():
    """Test the PINN model with various atmospheric conditions"""
    
    test_cases = [
        # Clear day
        PINNPredictionInput(
            temperature_c=20.0,
            humidity_pct=50.0,
            wind_speed=5.0,
            wind_direction=270.0,
            pm1_ugm3=3.0
        ),
        # Humid conditions
        PINNPredictionInput(
            temperature_c=25.0,
            humidity_pct=80.0,
            wind_speed=2.0,
            wind_direction=90.0,
            pm1_ugm3=8.0
        ),
        # Cold, stagnant conditions
        PINNPredictionInput(
            temperature_c=5.0,
            humidity_pct=70.0,
            wind_speed=1.0,
            wind_direction=180.0,
            pm1_ugm3=12.0
        ),
        # Windy conditions
        PINNPredictionInput(
            temperature_c=15.0,
            humidity_pct=60.0,
            wind_speed=10.0,
            wind_direction=315.0,
            pm1_ugm3=5.0
        )
    ]
    
    results = []
    for i, test_case in enumerate(test_cases):
        try:
            prediction = predictor.predict(test_case)
            results.append({
                f"test_case_{i+1}": {
                    "scenario": ["clear_day", "humid", "cold_stagnant", "windy"][i],
                    "input": test_case.dict(),
                    "prediction": prediction.dict()
                }
            })
        except Exception as e:
            results.append({
                f"test_case_{i+1}": {"error": str(e)}
            })
    
    return {
        "test_results": results,
        "model_id": "stanford_pinn_20250718_103012",
        "physics_informed": True
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001) 