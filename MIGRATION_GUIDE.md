# SmeshLLM AI Service Migration Guide

## Project Overview

**SmeshLLM** is a Stanford University wildfire smoke-plume prediction and management AI system that combines:
- Physics-informed neural networks (PINNs)  
- Real-time atmospheric dispersion modeling (HYSPLIT)
- Multi-source environmental data fusion
- Retrieval-augmented generation (RAG) with scientific literature
- Real-time sensor network integration

## Current Architecture

### Frontend (Next.js 15.3.4)
- **Location**: `/my-app/`
- **Framework**: React 19, Next.js App Router
- **Key Dependencies**:
  - `@google/generative-ai` - Gemini 2.5 Pro integration
  - `@supabase/supabase-js` - Database integration
  - `openai` - OpenAI API compatibility layer
  - `deck.gl` - 3D visualization layers
  - `react-map-gl` - Mapbox/MapLibre integration

### Backend (Python FastAPI)
- **Location**: `/my-app/python-services/`
- **Framework**: FastAPI 0.104.1, Uvicorn
- **Port**: 8000
- **Key Services**: HYSPLIT, PINN, RAG, OpenAQ, NASA FIRMS, Weather

### Database (Supabase/PostgreSQL)
- **Type**: PostgreSQL with PostGIS, TimescaleDB
- **Features**: Vector search, real-time subscriptions
- **Tables**: sensor_readings, plume_predictions, uploaded_data, meshtastic_telemetry

## Current LLM Integration

### Primary LLM Service: **Gemini 2.5 Pro**
- **Implementation**: OpenAI-compatible endpoint
- **Location**: `lib/ai/smesh-llm.ts`
- **Features**: Function calling, 2M context, multimodal
- **Tools**: 5 custom tools for environmental data

### Key Integration Points:

1. **Chat API Endpoint**
   - File: `app/api/chat/chat-real/route.ts`
   - Handles user queries with location context
   - Integrates with Python backend services

2. **LLM Client Configuration**
   ```typescript
   // lib/ai/smesh-llm.ts
   const geminiClient = new OpenAI({
     apiKey: process.env.GEMINI_API_KEY,
     baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
     timeout: 60000
   });
   ```

3. **Function Tools**
   - `get_wind_direction` - Real wind analysis
   - `get_fire_weather_conditions` - Weather + fire risk
   - `get_active_fires` - NASA FIRMS fire detection
   - `get_vegetation_fuel_data` - LANDFIRE fuel models
   - `get_integrated_wildfire_analysis` - Data fusion

## Data Sources (All Real APIs)

### Environmental Data
- **Weather**: Open-Meteo API + GridMET 4km resolution
- **Fire Detection**: NASA FIRMS satellite data
- **Fuel Models**: USGS LANDFIRE ImageServer
- **Air Quality**: OpenAQ global network
- **Atmospheric Physics**: HYSPLIT dispersion modeling

### Scientific Literature
- **RAG System**: OpenAI embeddings + vector search
- **Literature Sources**: ArXiv, scientific journals
- **Hybrid RAG**: Sensor data + literature synthesis

## Environment Variables

### Frontend (.env.local)
```bash
# LLM Configuration
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_key_here  # Fallback/embeddings

# Database
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# External APIs
NASA_FIRMS_API_KEY=your_nasa_firms_key
OPENAQ_API_KEY=your_openaq_key
```

### Backend (python-services/.env)
```bash
# Database
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your_service_role_key

# LLM Services
GEMINI_API_KEY=your_gemini_api_key_here
OPENAI_API_KEY=your_openai_key_here

# External APIs
NASA_FIRMS_API_KEY=your_nasa_firms_key
OPENAQ_API_KEY=your_openaq_key
```

## Migration Script Templates

### 1. To OpenAI GPT-4 Turbo

```typescript
// Replace in lib/ai/smesh-llm.ts
function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    openaiClient = new OpenAI({
      apiKey: apiKey,
      timeout: 60000
    });
  }
  return openaiClient;
}
```

### 2. To Anthropic Claude

```typescript
import Anthropic from '@anthropic-ai/sdk';

function getAnthropicClient(): Anthropic {
  if (!anthropicClient) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY environment variable is required');
    }
    
    anthropicClient = new Anthropic({
      apiKey: apiKey,
      timeout: 60000
    });
  }
  return anthropicClient;
}

// Tool calling adaptation needed - Claude uses different format
```

### 3. To Azure OpenAI

```typescript
import { OpenAIApi, Configuration } from 'openai';

const configuration = new Configuration({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  basePath: `https://${process.env.AZURE_OPENAI_ENDPOINT}.openai.azure.com/openai/deployments/${process.env.AZURE_DEPLOYMENT_NAME}`,
  baseOptions: {
    headers: {
      'api-key': process.env.AZURE_OPENAI_API_KEY,
    },
    params: {
      'api-version': process.env.AZURE_API_VERSION || '2024-02-15-preview'
    }
  }
});
```

## Critical Files to Modify

### Core LLM Integration
1. `lib/ai/smesh-llm.ts` - Main LLM client and logic
2. `app/api/chat/chat-real/route.ts` - Chat API endpoint
3. `lib/services/hybrid-rag-service.ts` - RAG integration

### Service Connections
4. `lib/services/hysplit-service.ts` - Physics modeling
5. `lib/services/openaq-service.ts` - Air quality data
6. `lib/services/pinn-service.ts` - Neural network predictions

### Configuration
7. `.env.local` - Frontend environment variables
8. `python-services/.env` - Backend environment variables
9. `package.json` - Dependencies (add new LLM SDKs)

## Migration Steps

### Phase 1: Preparation
1. **Backup current system**: `git commit -am "Pre-migration backup"`
2. **Install new LLM SDK**: `npm install @anthropic-ai/sdk` or similar
3. **Update environment variables** with new API keys
4. **Test API connectivity** with simple requests

### Phase 2: Core Migration
1. **Replace LLM client initialization** in `smesh-llm.ts`
2. **Adapt function calling format** (each LLM has different schemas)
3. **Update timeout and error handling** 
4. **Modify streaming responses** if applicable

### Phase 3: Testing & Validation
1. **Unit test LLM responses**: `npm run test`
2. **Integration test with backend**: Test `/api/chat/chat-real`
3. **End-to-end testing**: Full wildfire analysis queries
4. **Performance benchmarking**: Response times, token usage

### Phase 4: Deployment
1. **Update production environment variables**
2. **Deploy backend changes**: Python services restart
3. **Deploy frontend**: Next.js build and deploy
4. **Monitor logs and metrics**

## Function Calling Adaptation

### Current Gemini Format
```typescript
const tools = [{
  type: "function",
  function: {
    name: "get_wind_direction",
    description: "Get current wind direction and speed",
    parameters: {
      type: "object",
      properties: {
        latitude: { type: "number" },
        longitude: { type: "number" }
      },
      required: ["latitude", "longitude"]
    }
  }
}];
```

### OpenAI Format (similar)
```typescript
// Same format as Gemini - OpenAI compatible
```

### Claude Format (different)
```typescript
const tools = [{
  name: "get_wind_direction",
  description: "Get current wind direction and speed",
  input_schema: {
    type: "object",
    properties: {
      latitude: { type: "number" },
      longitude: { type: "number" }
    },
    required: ["latitude", "longitude"]
  }
}];
```

## Performance Considerations

### Current System Performance
- **Average response time**: 13-30 seconds
- **Token usage**: ~2K-10K tokens per query
- **Context window**: 2M tokens (Gemini)
- **Function calls**: 1-5 per query

### Migration Impact Assessment
- **GPT-4 Turbo**: Similar performance, 128K context
- **Claude 3.5 Sonnet**: Potentially faster, 200K context  
- **Azure OpenAI**: Similar to GPT-4, enterprise features

## Testing Checklist

- [ ] Basic chat functionality
- [ ] Wind direction analysis
- [ ] Fire weather conditions
- [ ] Active fire detection  
- [ ] Vegetation fuel data
- [ ] Integrated wildfire analysis
- [ ] Error handling and timeouts
- [ ] Performance benchmarks
- [ ] Production deployment

## Rollback Plan

1. **Revert git changes**: `git reset --hard HEAD~1`
2. **Restore environment variables**
3. **Restart services**: Backend + Frontend
4. **Verify original functionality**

## Support Contacts

- **Technical Lead**: [Your contact info]
- **Database Admin**: [Supabase admin]
- **DevOps**: [Deployment team]
- **API Keys**: [Key management team]