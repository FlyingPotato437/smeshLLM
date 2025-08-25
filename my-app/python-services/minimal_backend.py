#!/usr/bin/env python3
"""
Minimal FastAPI backend for SmeshLLM - Quick Start Version
"""

import os
from dotenv import load_dotenv
load_dotenv('../.env.development.local')

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

# Create FastAPI app
app = FastAPI(
    title="SmeshLLM Python Services",
    description="Minimal backend for SmeshLLM - Wildfire Smoke Prediction System",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Basic models
class HealthResponse(BaseModel):
    status: str
    message: str
    services: list

@app.get("/")
async def root():
    return {"message": "SmeshLLM Python Backend is running"}

@app.get("/health", response_model=HealthResponse)
async def health_check():
    return HealthResponse(
        status="healthy",
        message="SmeshLLM Python services are operational",
        services=["FastAPI", "CORS", "Basic API"]
    )

@app.get("/api/status")
async def api_status():
    return {
        "backend": "running",
        "timestamp": "2025-07-28T16:25:34-07:00",
        "version": "1.0.0",
        "environment": "development"
    }

if __name__ == "__main__":
    print("🚀 Starting SmeshLLM Python Backend...")
    print("📡 Available endpoints:")
    print("   - http://localhost:8000/")
    print("   - http://localhost:8000/health")
    print("   - http://localhost:8000/api/status")
    print("   - http://localhost:8000/docs (API Documentation)")
    
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
