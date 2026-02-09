# SmeshLLM Project Context for AI Service Migration

## 🏗️ **SYSTEM ARCHITECTURE OVERVIEW**

**SmeshLLM** is a sophisticated wildfire smoke-plume prediction and management AI system developed at Stanford University. It combines cutting-edge atmospheric physics modeling with advanced AI to provide real-time wildfire analysis and prediction.

### Core Components:
1. **Frontend**: Next.js 15.3.4 with React 19
2. **Backend**: Python FastAPI with scientific computing stack
3. **Database**: Supabase PostgreSQL with PostGIS + TimescaleDB
4. **LLM**: Currently Gemini 2.5 Pro (OpenAI-compatible)
5. **Visualization**: Deck.gl for 3D atmospheric modeling

---

## 🧠 **CURRENT LLM INTEGRATION**

### **Primary LLM Service: Gemini 2.5 Pro**
- **Model**: `gemini-2.0-flash-exp` 
- **Interface**: OpenAI-compatible API
- **Context Window**: 2M tokens
- **Capabilities**: Function calling, multimodal, streaming

### **Key Integration Files:**
```
lib/ai/smesh-llm.ts              # Main LLM client and logic (2,200+ lines)
app/api/chat/chat-real/route.ts  # Chat API endpoint  
lib/services/hybrid-rag-service.ts # RAG integration
lib/ai/location-extractor.ts     # Geographic processing
lib/ai/geocode-utils.ts         # Coordinate handling
```

### **Function Tools (5 Custom Tools):**
1. **`get_wind_direction`** - Real-time wind analysis
2. **`get_fire_weather_conditions`** - Weather + fire risk assessment
3. **`get_active_fires`** - NASA FIRMS satellite fire detection
4. **`get_vegetation_fuel_data`** - LANDFIRE fuel model data
5. **`get_integrated_wildfire_analysis`** - Multi-source data fusion

---

## 🌐 **REAL DATA SOURCES INTEGRATION**

### **Weather & Atmospheric Data:**
- **Open-Meteo API**: Real-time weather data
- **GridMET**: 4km resolution meteorological data
- **HYSPLIT**: Atmospheric dispersion physics modeling
- **Canadian Fire Weather Index**: xclim-based calculations

### **Fire & Environmental Data:**
- **NASA FIRMS**: Satellite-based active fire detection
- **LANDFIRE**: USGS vegetation and fuel models
- **OpenAQ**: Global air quality sensor network
- **Nominatim**: OpenStreetMap geocoding

### **Scientific Literature:**
- **RAG System**: OpenAI embeddings + vector search
- **ArXiv Integration**: Scientific paper retrieval
- **Hybrid RAG**: Sensor data + literature synthesis

---

## 🗄️ **DATABASE SCHEMA (Supabase)**

### **Core Tables:**
```sql
-- Real-time sensor data
sensor_readings (device_id, timestamp, lat, lng, pm25, pm10, temp, humidity)

-- HYSPLIT model predictions  
plume_predictions (prediction_id, timestamp, lat, lng, concentration)

-- User-uploaded datasets
uploaded_data (upload_id, filename, data, processed_at)

-- Meshtastic IoT network data
meshtastic_telemetry (node_id, timestamp, sensor_data, location)

-- Physics-informed neural network models
pinn_models (model_id, version, training_data, weights, metadata)
```

### **Spatial Features:**
- **PostGIS**: Geographic queries and spatial indexing
- **TimescaleDB**: Time-series optimization for sensor data
- **Vector Search**: Semantic search for scientific literature

---

## 🛠️ **DEVELOPMENT ENVIRONMENT**

### **Frontend Dependencies (package.json):**
```json
{
  "@google/generative-ai": "^0.24.1",  // Current Gemini integration
  "@supabase/supabase-js": "^2.50.0",
  "openai": "^5.7.0",                  // OpenAI compatibility layer
  "deck.gl": "^9.1.12",               // 3D visualization
  "react-map-gl": "^8.0.4",           // Map integration
  "three": "^0.160.1",                // 3D graphics
  "next": "15.3.4"
}
```

### **Backend Dependencies (requirements.txt):**
```python
# Core Framework
fastapi==0.104.1
uvicorn[standard]==0.24.0

# Scientific Computing
numpy==1.24.3
pandas==2.0.3
xarray==2023.8.0
torch==2.1.0              # PyTorch for PINNs
tensorflow==2.14.0        # TensorFlow alternative

# Atmospheric Physics
pysplit==0.3.4           # HYSPLIT integration
netcdf4==1.6.4           # Weather data processing
cartopy==0.22.0          # Geographic projections

# LLM & AI
openai==1.3.5            # OpenAI API client
sentence-transformers==2.2.2  # Embeddings
```

---

## 🔧 **ENVIRONMENT CONFIGURATION**

### **Frontend (.env.local):**
```bash
# Current LLM Configuration
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_key_for_embeddings

# Database
NEXT_PUBLIC_SUPABASE_URL=https://vanqyqnugswokfchdhpk.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJI...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJI...

# External APIs
NASA_FIRMS_API_KEY=your_nasa_firms_key
OPENAQ_API_KEY=your_openaq_key
```

### **Backend (python-services/.env):**
```bash
# Database Connection
SUPABASE_URL=https://vanqyqnugswokfchdhpk.supabase.co
SUPABASE_KEY=eyJhbGciOiJI...

# LLM Services  
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_key_here

# Scientific APIs
NASA_FIRMS_API_KEY=your_nasa_firms_key
OPENAQ_API_KEY=your_openaq_key
```

---

## 🚀 **DEPLOYMENT ARCHITECTURE**

### **Current Deployment:**
- **Frontend**: Netlify (Next.js static/SSR)
- **Backend**: Manual Python process on port 8000
- **Database**: Supabase hosted PostgreSQL
- **Domain**: Currently localhost development

### **Production Requirements:**
- **SSL/TLS**: Required for all API calls
- **Environment Variables**: Secure key management
- **Process Management**: PM2 or Docker for Python backend
- **CDN**: Static asset optimization
- **Monitoring**: Logging and error tracking

---

## 📈 **PERFORMANCE CHARACTERISTICS**

### **Current System Performance:**
- **Average Response Time**: 13-30 seconds
- **Token Usage**: 2K-10K tokens per query  
- **Context Window Usage**: Up to 2M tokens (Gemini)
- **Function Calls**: 1-5 per user query
- **Data Sources**: 6+ real APIs per request

### **Bottlenecks & Optimizations:**
- **Python Backend**: Occasional timeouts (fixed)
- **LLM Function Calls**: Sequential execution
- **Database Queries**: Spatial optimization needed
- **API Rate Limits**: NASA FIRMS, OpenAQ quotas

---

## 🧪 **TESTING FRAMEWORK**

### **Testing Commands:**
```bash
# Frontend Tests
npm run build              # Production build test
npm run lint              # Code quality check

# Backend Tests  
python -m pytest tests/   # Unit tests
curl localhost:8000/health # Health check

# Integration Tests
curl -X POST localhost:3000/api/chat/chat-real \
  -H "Content-Type: application/json" \
  -d '{"message":"test","location":{"lat":37.4275,"lng":-122.1697}}'
```

### **Test Datasets:**
- **n5_stanford.csv**: PINN training data (6,048 records)
- **Sample sensor data**: Meshtastic network telemetry
- **Fire event data**: Historical NASA FIRMS detections

---

## 🔄 **MIGRATION CONSIDERATIONS**

### **LLM Migration Complexity:**
- **High**: Function calling format differences
- **Medium**: Context window size variations  
- **Medium**: Token usage optimization
- **Low**: Basic chat completion

### **Critical Migration Points:**
1. **Function Tool Schema**: Each LLM has different formats
2. **Streaming Responses**: Implementation varies
3. **Context Management**: Window size differences
4. **Error Handling**: API-specific error codes
5. **Rate Limiting**: Different quota systems

### **Recommended Migration Order:**
1. **OpenAI GPT-4**: Easiest (similar to current setup)
2. **Azure OpenAI**: Enterprise features + same API
3. **Claude 3.5 Sonnet**: Different function calling format
4. **Local Models**: Ollama/LM Studio integration

---

## 📚 **DOCUMENTATION & RESOURCES**

### **Key Documentation Files:**
- `MIGRATION_GUIDE.md` - Complete migration instructions
- `REAL_DATA_STATUS.md` - Data source validation
- `DEPLOYMENT_CHECKLIST.md` - Production deployment guide
- `CLAUDE.md` - Development protocol

### **Useful Commands:**
```bash
# Start Development Environment
cd my-app && npm run dev
cd python-services && source venv/bin/activate && python main.py

# Run Migration Script
./migrate-ai-service.sh [openai|claude|azure|local]

# Verify Migration
npm run verify-migration

# Rollback if needed
./rollback-migration.sh
```

---

## ⚠️ **SECURITY & COMPLIANCE**

### **API Key Management:**
- All keys stored in environment variables
- No hardcoded credentials in source code
- Separate dev/production key sets

### **Data Privacy:**
- No user PII stored in logs
- Geographic data anonymization
- Scientific data only (no personal info)

### **Network Security:**
- HTTPS for all external API calls
- CORS properly configured
- Input validation on all endpoints

---

This project represents a sophisticated integration of atmospheric science, machine learning, and modern web technologies. The current Gemini 2.5 Pro integration provides excellent performance for scientific analysis, but the modular architecture allows for flexible migration to alternative LLM providers as needed.