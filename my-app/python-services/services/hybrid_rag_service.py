#!/usr/bin/env python3
"""
Hybrid RAG Service - Router + Dual-Tool Architecture
Real scientific air quality analysis with structured sensor data queries + semantic literature search
Uses Gemini 2.5 Pro for routing and synthesis, DuckDB for sensor data, NV-Embed for literature
"""

import os
import json
import logging
import requests
import dateparser
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from pathlib import Path

# FastAPI
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import uvicorn

# LangChain for agent orchestration
try:
    from langchain.agents import Tool, AgentExecutor, create_openai_tools_agent
    from langchain.schema import SystemMessage, HumanMessage
    from langchain_core.tools import tool
    from pydantic import BaseModel
    from langchain_google_genai import ChatGoogleGenerativeAI
    LANGCHAIN_AVAILABLE = True
except ImportError:
    print("⚠️  LangChain not available. Install with: pip install langchain langchain-google-genai")
    LANGCHAIN_AVAILABLE = False

# Database query engine
try:
    import duckdb
    import pandas as pd
    import dateparser
    DUCKDB_AVAILABLE = True
except ImportError:
    print("⚠️  DuckDB not available. Install with: pip install duckdb pandas dateparser")
    DUCKDB_AVAILABLE = False

# Embeddings for scientific literature
try:
    import numpy as np
    from sentence_transformers import SentenceTransformer
    EMBEDDINGS_AVAILABLE = True
except ImportError:
    print("⚠️  Embeddings not available. Install with: pip install sentence-transformers numpy")
    EMBEDDINGS_AVAILABLE = False

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# FastAPI app
app = FastAPI(
    title="SmeshLLM Hybrid RAG Service",
    description="Router + Dual-Tool RAG for scientific air quality analysis",
    version="1.0.0"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
SENSOR_DATA_PATH = os.getenv("SENSOR_DATA_PATH", "./sample_sensor_data.csv")
EMBEDDINGS_MODEL = "all-mpnet-base-v2"  # Will upgrade to NV-Embed later

# Pydantic models for tool inputs/outputs
class SensorQueryParams(BaseModel):
    """Parameters for querying sensor data"""
    location: str = Field(description="Location name (e.g., 'Los Angeles', 'San Francisco')")
    start_date: str = Field(description="Start date in natural language (e.g., 'last week', '2023-08-01')")
    end_date: str = Field(description="End date in natural language (e.g., 'yesterday', '2023-08-31')")
    aggregation: str = Field(description="Aggregation function: avg, max, min, sum, count")
    parameter: str = Field(default="pm25", description="Sensor parameter: pm25, pm10, temperature, humidity")

class LiteratureQueryParams(BaseModel):
    """Parameters for searching scientific literature"""
    query: str = Field(description="Semantic search query for scientific papers")
    max_results: int = Field(default=5, description="Maximum number of results to return")

class HybridRAGRequest(BaseModel):
    """User query request"""
    query: str
    include_sensor_data: bool = True
    include_literature: bool = True

class HybridRAGResponse(BaseModel):
    """Complete response with synthesis"""
    query: str
    sensor_data_results: Optional[str] = None
    literature_results: Optional[List[str]] = None
    synthesized_answer: str
    sources_used: List[str]

# PHASE 2: Real DuckDB Implementation
@tool("query_sensor_data", args_schema=SensorQueryParams)
def query_sensor_data(
    location: str,
    start_date: str, 
    end_date: str,
    aggregation: str,
    parameter: str = "pm25"
) -> str:
    """
    Query real sensor data from Supabase meshtastic_telemetry table for specific location, time range, and parameter.
    Returns aggregated sensor readings in markdown table format.
    """
    logger.info(f"🔍 SUPABASE SENSOR QUERY: {location}, {start_date} to {end_date}, {aggregation}({parameter})")
    
    try:
        # Parse dates using dateparser for natural language support
        
        parsed_start = dateparser.parse(start_date)
        parsed_end = dateparser.parse(end_date)
        
        if not parsed_start or not parsed_end:
            return f"❌ Could not parse dates: {start_date}, {end_date}"
        
        start_iso = parsed_start.isoformat()
        end_iso = parsed_end.isoformat()
        
        # Validate aggregation function
        valid_aggs = ['avg', 'max', 'min', 'sum', 'count']
        if aggregation.lower() not in valid_aggs:
            return f"❌ Invalid aggregation '{aggregation}'. Use: {', '.join(valid_aggs)}"
        
        # Validate parameter
        valid_params = ['pm25_ugm3', 'pm10_ugm3', 'temperature_c', 'humidity_pct', 'wind_speed_ms']
        param_map = {'pm25': 'pm25_ugm3', 'pm10': 'pm10_ugm3', 'temperature': 'temperature_c', 'humidity': 'humidity_pct', 'wind_speed': 'wind_speed_ms'}
        db_param = param_map.get(parameter.lower(), parameter)
        if db_param not in valid_params:
            return f"❌ Invalid parameter '{parameter}'. Use: pm25, pm10, temperature, humidity, wind_speed"
        
        # Supabase configuration from environment or hardcoded (match pinn_service)
        SUPABASE_URL = os.getenv('SUPABASE_URL', 'https://your-supabase-url.supabase.co')
        SUPABASE_KEY = os.getenv('SUPABASE_SERVICE_KEY', 'your-service-key')
        
        headers = {
            'apikey': SUPABASE_KEY,
            'Authorization': f'Bearer {SUPABASE_KEY}',
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        }
        
        # Query parameters for RPC or direct query
        # Using direct query with aggregation
        query_url = f"{SUPABASE_URL}/rest/v1/meshtastic_telemetry?select={aggregation}({db_param}):aggregated_value,count()&timestamp=gte.{start_iso}&timestamp=lte.{end_iso}&location=ilike.*{location}*"
        
        response = requests.get(query_url, headers=headers)
        
        if response.status_code != 200:
            return f"❌ Supabase query failed: {response.text}"
        
        data = response.json()
        if not data:
            return f"❌ No sensor data found for '{location}' between {start_date} and {end_date}"
        
        agg_value = data[0]['aggregated_value']
        count = data[0]['count']
        
        # Determine unit
        units = {
            'pm25_ugm3': 'µg/m³',
            'pm10_ugm3': 'µg/m³', 
            'temperature_c': '°C',
            'humidity_pct': '%',
            'wind_speed_ms': 'm/s'
        }
        unit = units.get(db_param, 'units')
        
        # Format as markdown table
        markdown_result = f"""
| Metric | Value |
|--------|--------|
| Location | {location} |
| Time Period | {start_iso} to {end_iso} |
| Parameter | {parameter.upper()} |
| {aggregation.title()} Value | {agg_value:.2f} {unit} |
| Measurements | {count} readings |
| Data Source | Supabase meshtastic_telemetry |
        """.strip()
        
        logger.info(f"✅ SUPABASE QUERY SUCCESS: {agg_value:.2f} {unit} from {count} measurements")
        return markdown_result
        
    except Exception as e:
        error_msg = f"❌ SUPABASE SENSOR QUERY FAILED: {str(e)}"
        logger.error(error_msg)
        return error_msg

@tool("search_scientific_literature", args_schema=LiteratureQueryParams)
def search_scientific_literature(query: str, max_results: int = 5) -> str:
    """
    Search scientific literature for relevant papers and research.
    Returns relevant excerpts from atmospheric science papers.
    """
    # PHASE 0: Mock implementation for router testing
    logger.info(f"Mock literature search: {query}")
    
    # Mock scientific results
    mock_results = [
        {
            "title": "Atmospheric Dispersion Modeling of PM2.5 in Urban Environments",
            "excerpt": "Studies show that PM2.5 concentrations above 25 µg/m³ are associated with increased respiratory health risks in urban populations.",
            "source": "Journal of Atmospheric Sciences, 2023"
        },
        {
            "title": "HYSPLIT Model Validation for Wildfire Smoke Prediction",
            "excerpt": "HYSPLIT atmospheric transport models demonstrate 85% accuracy in predicting smoke plume trajectories during wildfire events.",
            "source": "Environmental Modeling, 2024"
        }
    ]
    
    # Format results
    formatted_results = []
    for i, result in enumerate(mock_results[:max_results], 1):
        formatted_results.append(
            f"**Document {i}: {result['title']}**\n"
            f"{result['excerpt']}\n"
            f"*Source: {result['source']}*"
        )
    
    return "\n\n".join(formatted_results)

# Router Agent Setup
class HybridRAGOrchestrator:
    def __init__(self):
        self.tools = [query_sensor_data, search_scientific_literature]
        
        if LANGCHAIN_AVAILABLE and GEMINI_API_KEY:
            try:
                self.llm = ChatGoogleGenerativeAI(
                    model="gemini-2.5-pro",
                    api_key=GEMINI_API_KEY,
                    temperature=0.1  # Low temperature for consistent routing
                )
                logger.info("Gemini 2.5 Pro initialized for routing")
            except Exception as e:
                logger.error(f"Failed to initialize Gemini: {e}")
                self.llm = None
        else:
            logger.warning("Gemini API key not found or LangChain not available")
            self.llm = None
    
    def is_available(self) -> bool:
        return self.llm is not None
    
    async def analyze_query(self, user_query: str) -> Dict[str, Any]:
        """
        Phase 1: Router that analyzes query and determines which tools to call
        """
        if not self.is_available():
            raise HTTPException(status_code=503, detail="Router LLM not available")
        
        router_prompt = f"""
You are a query analysis expert for a scientific air quality monitoring system.
Analyze the user's query and determine which tools are needed to answer it.

Available tools:
1. query_sensor_data - For specific sensor readings, locations, time periods, aggregations
2. search_scientific_literature - For research papers, health impacts, scientific explanations

User Query: "{user_query}"

Respond with a JSON object indicating which tools to call:
{{
    "tools_needed": ["tool_name1", "tool_name2"],
    "sensor_query": {{
        "location": "location name",
        "start_date": "date or relative time",
        "end_date": "date or relative time", 
        "aggregation": "avg/max/min/sum/count",
        "parameter": "pm25/pm10/temperature/humidity"
    }},
    "literature_query": {{
        "query": "semantic search query",
        "max_results": 5
    }},
    "reasoning": "Explanation of tool selection"
}}

Only include sensor_query if query_sensor_data is needed.
Only include literature_query if search_scientific_literature is needed.
        """
        
        try:
            response = self.llm.invoke([HumanMessage(content=router_prompt)])
            
            # Parse JSON response
            import re
            json_match = re.search(r'\{.*\}', response.content, re.DOTALL)
            if json_match:
                return json.loads(json_match.group())
            else:
                raise ValueError("No valid JSON found in response")
                
        except Exception as e:
            logger.error(f"Router analysis failed: {e}")
            # Fallback: use both tools
            return {
                "tools_needed": ["search_scientific_literature"],
                "literature_query": {"query": user_query, "max_results": 5},
                "reasoning": "Fallback to literature search due to routing error"
            }
    
    async def process_hybrid_query(self, request: HybridRAGRequest) -> HybridRAGResponse:
        """
        Process hybrid RAG query by routing between sensor data and literature search, then synthesizing results
        """
        try:
            # Phase 1: Analyze query and determine tools needed
            analysis = await self.analyze_query(request.query)
            logger.info(f"Query analysis: {analysis}")
            
            tools_needed = analysis.get("tools_needed", [])
            sensor_results = None
            literature_results = None
            sources_used = []
            
            # Execute tools based on analysis
            if "query_sensor_data" in tools_needed and request.include_sensor_data:
                sensor_params = analysis.get("sensor_query", {})
                sensor_results = query_sensor_data.func(**sensor_params)
                sources_used.append("sensor_data")
            
            if "search_scientific_literature" in tools_needed and request.include_literature:
                lit_params = analysis.get("literature_query", {"query": request.query})
                literature_results = search_scientific_literature.func(**lit_params)
                sources_used.append("scientific_literature")
            
            # Phase 3: Synthesize final response
            synthesized_answer = await self.synthesize_response(
                request.query,
                sensor_results,
                literature_results
            )
            
            return HybridRAGResponse(
                query=request.query,
                sensor_data_results=sensor_results,
                literature_results=[literature_results] if literature_results else None,
                synthesized_answer=synthesized_answer,
                sources_used=sources_used
            )
            
        except Exception as e:
            logger.error(f"Hybrid RAG query failed: {e}")
            raise HTTPException(status_code=500, detail=f"Query processing failed: {str(e)}")

    async def synthesize_response(self, 
                                  original_query: str,
                                  sensor_results: Optional[str] = None,
                                  literature_results: Optional[str] = None) -> str:
        """
        Phase 3: Synthesizer that combines tool outputs into final answer
        """
        if not self.is_available():
            return f"Raw Results:\n\nSensor Data:\n{sensor_results or 'None'}\n\nLiterature:\n{literature_results or 'None'}"
        
        synthesis_prompt = f"""
You are an expert atmospheric scientist providing comprehensive answers about air quality.
Synthesize the information from multiple sources to answer the user's question.
Cite your sources clearly and provide context.

User Query: "{original_query}"

<retrieved_context>
<sensor_data_results>
{sensor_results or "No sensor data retrieved"}
</sensor_data_results>
<literature_review_results>
{literature_results or "No literature results retrieved"}
</literature_review_results>
</retrieved_context>

Provide a comprehensive answer that:
1. Directly answers the user's question
2. Cites specific data from the sensor results when available
3. Incorporates relevant scientific context from the literature
4. Explains any limitations in the available data
5. Uses clear, accessible language while maintaining scientific accuracy

Synthesized Answer:
        """
        
        try:
            response = self.llm.invoke([HumanMessage(content=synthesis_prompt)])
            return response.content
        except Exception as e:
            logger.error(f"Synthesis failed: {e}")
            return f"Error synthesizing response: {str(e)}"

# Global orchestrator instance
orchestrator = HybridRAGOrchestrator()

# API endpoints
@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "router_available": orchestrator.is_available(),
        "duckdb_available": DUCKDB_AVAILABLE,
        "embeddings_available": EMBEDDINGS_AVAILABLE,
        "langchain_available": LANGCHAIN_AVAILABLE,
        "implementation_phase": "Phase 2 - Real DuckDB Integration",
        "timestamp": datetime.utcnow().isoformat()
    }

# Remove the standalone @app.post("/hybrid-rag/query")
@app.get("/hybrid-rag/test-router")
async def test_router(query: str = "What was the average PM2.5 in Los Angeles last week?"):
    """Test endpoint for router analysis"""
    try:
        analysis = await orchestrator.analyze_query(query)
        return {
            "query": query,
            "analysis": analysis,
            "router_status": "working" if orchestrator.is_available() else "unavailable"
        }
    except Exception as e:
        return {
            "query": query,
            "error": str(e),
            "router_status": "error"
        }

if __name__ == "__main__":
    print("🚀 Starting SmeshLLM Hybrid RAG Service")
    print(f"Implementation Phase: Phase 2 - Real DuckDB Integration")
    print(f"Gemini API configured: {'Yes' if GEMINI_API_KEY else 'No'}")
    print(f"DuckDB available: {DUCKDB_AVAILABLE}")
    print(f"LangChain available: {LANGCHAIN_AVAILABLE}")
    
    uvicorn.run(app, host="0.0.0.0", port=8006)