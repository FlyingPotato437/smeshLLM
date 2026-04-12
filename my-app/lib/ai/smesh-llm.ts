// @ts-nocheck
/**
 * SMeshLLM - Stanford's Wildfire Smoke-Plume Prediction and Management AI
 * Implements WildFire GPT comprehensive algorithm with advanced spatial reasoning
 * 
 * Key Features:
 * - Retrieval-Augmented Generation (RAG) with specialized wildfire knowledge base
 * - Geospatial data integration and spatial reasoning
 * - Physics-informed analysis combining HYSPLIT with AI enhancement
 * - Multi-source environmental data synthesis
 * - Scientific literature integration for evidence-based recommendations
 * - Real-time sensor network analysis and validation
 */

import { createClient } from '@supabase/supabase-js';
import { PiSensorReading, FireDetection, MeteorologicalData, PlumePrediction } from '../../types';
import OpenAI from 'openai';
import { HysplitService } from '../services/hysplit-service';
import { RAGService } from '../services/rag-service';
import { OpenAQService } from '../services/openaq-service';
import { PINNService } from '../services/pinn-service';
import { hybridRAGClient, ProcessedHybridData } from '../services/hybrid-rag-service';
import { supabase } from '../database/supabase';
import { geocodeLocations } from './geocode-utils';
import { isLikelyLocationCandidate, isLowSignalMessage } from './location-heuristics';

const PYTHON_SERVICE_BASE_URL =
  process.env.PYTHON_SERVICE_URL ||
  process.env.HYSPLIT_SERVICE_URL ||
  process.env.OPENAQ_SERVICE_URL ||
  process.env.HYBRID_RAG_SERVICE_URL ||
  'http://127.0.0.1:8000';

// Initialize Gemini 2.5 Pro client (OpenAI compatibility mode) only on server side
let geminiClient: OpenAI | null = null;

function getGeminiClient(): OpenAI {
  if (!geminiClient) {
    if (typeof window !== 'undefined') {
      throw new Error('Gemini client should not be initialized on the client side');
    }
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    
    // Using Gemini 2.5 Pro via OpenAI compatibility endpoint
    geminiClient = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      timeout: 60000 // 60 second timeout at client level
    });
    
    console.log('🧠 REAL LLM: Initialized Gemini 2.5 Pro for atmospheric intelligence');
  }
  return geminiClient;
}

// Configuration for SmeshLLM
interface SmeshLLMConfig {
  supabaseUrl: string;
  supabaseKey: string;
  openaiApiKey: string;
  spatialSearchRadius: number; // km
  maxRetrieval: number;
  confidenceThreshold: number;
}

export interface SpatialKnowledge {
  location: {
    lat: number;
    lng: number;
    elevation?: number;
    region: string;
  };
  environmentalContext: {
    topography: string;
    vegetationType: string;
    dryness: number;
    windPatterns: string[];
  };
  historicalData: {
    fireFrequency: number;
    smokePlumes: PlumePrediction[];
    seasonalPatterns: any;
  };
}

export interface SmokeAnalysisQuery {
  query: string;
  location?: { lat: number; lng: number };
  timeframe?: string;
  analysisType: 'direction' | 'concentration' | 'risk' | 'general';
}

export interface SmeshResponse {
  answer: string;
  confidence: number;
  spatialContext: SpatialKnowledge;
  sources: string[];
  visualizations?: {
    mapData?: any;
    plumePredictions?: PlumePrediction[];
  };
  actionableInsights: string[];
}

// ============================================================================
// SPATIAL REASONING AND GEOSPATIAL ANALYSIS INTERFACES
// ============================================================================

interface SpatialContext {
  location: {
    latitude: number;
    longitude: number;
    elevation?: number;
    administrativeRegion?: string;
  };
  spatialRadius: number; // Analysis radius in kilometers
  environmentalFactors: {
    topography: string;
    vegetation: string;
    landUse: string;
    climaticZone: string;
  };
  proximityAnalysis: {
    nearbyPopulation: number;
    criticalInfrastructure: string[];
    sensitiveAreas: string[];
  };
}

interface WildfireRiskAssessment {
  fireWeatherIndex: number;
  windSpeed: number;
  windDirection: number;
  humidity: number;
  temperature: number;
  droughtIndex: number;
  fuelMoisture: number;
  historicalFireProbability: number;
}

interface SmokeDispersinAnalysis {
  concentrationPrediction: {
    pm25: number[];
    pm10: number[];
    spatialDistribution: number[][];
    temporalEvolution: number[];
  };
  atmosphericConditions: {
    mixingHeight: number;
    stabilityClass: string;
    windDescription: string;
  };
  uncertaintyQuantification: {
    modelUncertainty: number;
    observationalUncertainty: number;
    propagatedUncertainty: number;
  };
}

// ============================================================================
// COMPREHENSIVE ALGORITHM IMPLEMENTATION
// ============================================================================

/**
 * WildFire GPT Comprehensive Algorithm
 * Implements the core algorithm from the research paper with spatial reasoning
 */
export class WildFireGPTAlgorithm {
  private spatialContext: SpatialContext | null = null;
  private knowledgeBase: Map<string, any> = new Map();
  private conversationMemory: any[] = [];
  
  // Real service integrations - no more mocks!
  private hysplitService: HysplitService;
  private ragService: RAGService;
  private openaqService: OpenAQService;
  private pinnService: PINNService;
  
  constructor() {
    this.hysplitService = new HysplitService();
    this.ragService = new RAGService();
    this.openaqService = new OpenAQService();
    this.pinnService = new PINNService();
  }

  /**
   * Step 1: Query Assessment and Spatial Context Extraction
   */
  async assessQuery(userQuery: string, providedLocation?: string | { lat: number; lng: number }): Promise<{
    queryType: string;
    spatialElements: any;
    informationNeeds: string[];
    requiredTools: string[];
  }> {
    const spatialKeywords = [
      'location', 'latitude', 'longitude', 'coordinates', 'area', 'region',
      'distance', 'proximity', 'nearby', 'surrounding', 'direction',
      'elevation', 'topography', 'terrain', 'watershed', 'boundary'
    ];

    const fireKeywords = [
      'fire', 'wildfire', 'burn', 'ignition', 'spread', 'containment',
      'prescribed burn', 'fuel', 'vegetation', 'ember', 'flammability'
    ];

    const smokeKeywords = [
      'smoke', 'plume', 'dispersion', 'concentration', 'air quality',
      'pm2.5', 'pm10', 'visibility', 'atmospheric', 'wind'
    ];

    // Extract spatial elements using improved regex patterns
    const coordinatePattern = /(-?\d+\.?\d*)\s*[,°]\s*(-?\d+\.?\d*)/g;
    const locationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),?\s*(?:([A-Z][a-z]+\s+County)|([A-Z][A-Z]))\b/g;
    
    const coordinates = [...userQuery.matchAll(coordinatePattern)];
    const locations = [...userQuery.matchAll(locationPattern)];
    
    // Also extract standalone location names for geocoding
    const standaloneLocationPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+County)?)\b/g;
    let standaloneLocations = [...userQuery.matchAll(standaloneLocationPattern)]
      .map(match => match[1])
      .filter(location => 
        !['County', 'State', 'United', 'States', 'America'].includes(location) &&
        location.length > 2
      );
    const nonLocations = [
      'What', 'Is', 'The', 'In', 'Risk', 'Wildfire', 'Smoke', 'Fire', 'Air', 'Quality', 'Plume', 'Dispersion',
      'Should', 'Use', 'Can', 'Today', 'Now', 'Current', 'Real', 'Data', 'Only', 'Please'
    ];
    standaloneLocations = standaloneLocations.filter(loc =>
      !nonLocations.some(non => loc.includes(non)) &&
      isLikelyLocationCandidate(userQuery, loc)
    );
    const fullLocations = [...userQuery.matchAll(locationPattern)].map(match => {
      const city = match[1];
      const county = match[2];
      const state = match[3];
      if (county) return `${city}, ${county}`;
      if (state) return `${city}, ${state}`;
      return city;
    });
    let primaryLocations: string[] = [...new Set([...fullLocations, ...standaloneLocations])];
    if (fullLocations.length > 0) {
      primaryLocations = fullLocations;
    } else {
      primaryLocations = standaloneLocations;
    }
    let preGeocoded: { lat: number; lng: number }[] = [];
    if (providedLocation) {
      if (typeof providedLocation === 'string') {
        primaryLocations = [providedLocation, ...standaloneLocations.filter(loc => loc !== providedLocation)];
      } else if (providedLocation && typeof providedLocation === 'object' && 'lat' in providedLocation && 'lng' in providedLocation) {
        preGeocoded = [providedLocation];
        primaryLocations = [];
      }
    }

    const queryType = this.determineQueryType(userQuery, fireKeywords, smokeKeywords);
    
    // Geocode location names to coordinates
    const geocodedCoordinates = preGeocoded.length > 0
      ? []
      : await geocodeLocations(primaryLocations, userQuery);
    const coordinatesFromText = coordinates.map(match => ({
        lat: parseFloat(match[1]),
        lng: parseFloat(match[2])
      }));
    const allCoordinates = preGeocoded.length > 0
      ? preGeocoded
      : [...coordinatesFromText, ...geocodedCoordinates];

    return {
      queryType,
      spatialElements: {
        coordinates: allCoordinates,
        namedLocations: [
          ...locations.map(match => ({
            city: match[1],
            state: match[2] || match[3]
          })),
          ...standaloneLocations.map(location => ({ location }))
        ],
        hasSpatialkeywords: spatialKeywords.some(keyword => 
          userQuery.toLowerCase().includes(keyword)
        )
      },
      informationNeeds: this.identifyInformationNeeds(userQuery),
      requiredTools: this.selectRequiredTools(userQuery, queryType)
    };
  }

  /**
   * Step 2: Dynamic Information Retrieval with Spatial Filtering
   */
  async retrieveContextualData(assessment: any, originalQuery?: string): Promise<any> {
    const retrievedData: any = {
      geospatialData: null,
      environmentalData: null,
      historicalData: null,
      scientificLiterature: null,
      sensorData: null,
      hybridAirQualityData: null
    };

    // Check if this is an air quality query that should use hybrid RAG
    const isAirQualityQuery = await this.assessIsAirQualityQuery(originalQuery || '', assessment);
    
    if (isAirQualityQuery) {
      console.log('🎯 AIR QUALITY QUERY DETECTED: Using hybrid RAG service');
      retrievedData.hybridAirQualityData = await this.retrieveHybridAirQualityAnalysis(
        originalQuery || '', 
        assessment.spatialElements
      );
      
      // If hybrid RAG succeeds, we have both sensor data and literature
      if (retrievedData.hybridAirQualityData) {
        console.log('✅ HYBRID RAG SUCCESS: Got real sensor data + scientific analysis');
        return retrievedData; // Skip other retrievals for air quality queries
      } else {
        console.log('⚠️ HYBRID RAG FALLBACK: Using traditional data sources');
      }
    }

    // Retrieve geospatial data if spatial elements detected
    if (assessment.spatialElements.coordinates.length > 0 || 
        assessment.spatialElements.namedLocations.length > 0) {
      retrievedData.geospatialData = await this.retrieveGeospatialData(assessment.spatialElements);
    }

    // Retrieve environmental data for fire/smoke queries with intelligent routing
    if (assessment.queryType.includes('fire') || assessment.queryType.includes('smoke')) {
      retrievedData.environmentalData = await this.retrieveEnvironmentalData(assessment.spatialElements, originalQuery);
      
      // Get real-time active fire detections from NASA FIRMS
      retrievedData.activeFireData = await this.retrieveActiveFireData(assessment.spatialElements);
      
      // Only get traditional sensor data if hybrid RAG didn't provide it
      if (!retrievedData.hybridAirQualityData) {
        retrievedData.sensorData = await this.retrieveLocalSensorData(assessment.spatialElements, originalQuery);
      }
    }

    // Retrieve historical data for trend analysis
    if (assessment.informationNeeds.includes('historical_analysis')) {
      retrievedData.historicalData = await this.retrieveHistoricalFireData(assessment.spatialElements);
    }

    // Retrieve scientific literature for evidence-based responses (if not from hybrid RAG)
    if (assessment.informationNeeds.includes('scientific_evidence') && !retrievedData.hybridAirQualityData) {
      retrievedData.scientificLiterature = await this.retrieveScientificLiterature(assessment.queryType, originalQuery);
    }

    return retrievedData;
  }

  /**
   * Step 3: Spatial Reasoning and Analysis
   */
  async performSpatialReasoning(
    userQuery: string, 
    retrievedData: any,
    assessment?: any,
    providedLocation?: { lat: number; lng: number }
  ): Promise<SpatialContext & SmokeDispersinAnalysis & WildfireRiskAssessment> {
    // Spatial context establishment using detected coordinates
    const spatialContext = await this.establishSpatialContext(retrievedData.geospatialData, assessment, providedLocation);
    
    // Perform multi-layered spatial analysis
    const riskAssessment = await this.assessWildfireRisk(spatialContext, retrievedData.environmentalData);
    const smokeAnalysis = await this.analyzeSmokeDispersion(spatialContext, retrievedData.sensorData);
    
    // Integrate physics-informed modeling
    const physicsInformedPredictions = await this.runPhysicsInformedModels(
      spatialContext, 
      riskAssessment, 
      smokeAnalysis
    );

    // Cast to any to allow additional field until types are updated
    return {
      ...spatialContext,
      ...riskAssessment,
      ...smokeAnalysis,
      physicsInformedPredictions,
    } as any;
  }

  /**
   * Step 4: Context-Aware Response Generation with Memory Integration
   */
  async generateContextualResponse(
    userQuery: string,
    assessment: any,
    retrievedData: any,
    spatialAnalysis: any
  ): Promise<string> {
    const synthesizedContext = this.synthesizeContext(
        userQuery,
        assessment,
        retrievedData,
        spatialAnalysis,
        this.conversationMemory
    );

    const systemPrompt = this.createAdvancedSystemPrompt(synthesizedContext);

    try {
        let messages = [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userQuery }
        ];

        console.log('🔧 Available tools:', this.tools.map(t => t.function.name));
        
        let response;
        let retryCount = 0;
        const maxRetries = 3;
        
        while (retryCount < maxRetries) {
            try {
                response = await getGeminiClient().chat.completions.create({
                    model: 'gemini-2.5-pro',
                    messages,
                    tools: this.tools,
                    tool_choice: 'auto'
                });
                break; // Success, exit retry loop
            } catch (error: any) {
                if (error.status === 429) {
                    retryCount++;
                    const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                    console.log(`⏳ Rate limited. Retry ${retryCount}/${maxRetries} after ${delay}ms`);
                    
                    if (retryCount >= maxRetries) {
                        throw new Error(`Rate limit exceeded after ${maxRetries} attempts. Please try again later.`);
                    }
                    
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    throw error; // Re-throw non-rate-limit errors
                }
            }
        }

        let choice = response.choices[0];
        console.log('🤖 LLM Response choice:', choice);
        
        let toolRound = 0;
        const MAX_TOOL_ROUNDS = 2;

        while (choice.message.tool_calls && toolRound < MAX_TOOL_ROUNDS) {
            toolRound++;
            console.log(`🔧 Tool calls detected (round ${toolRound}/${MAX_TOOL_ROUNDS}): ${choice.message.tool_calls.length}`);
            messages.push(choice.message);

            for (const toolCall of choice.message.tool_calls) {
                console.log('🔧 Processing tool call:', toolCall);
                const toolResult = await this.executeTool(toolCall);
                console.log('🔧 Tool result:', typeof toolResult === 'string' ? toolResult.substring(0, 200) : toolResult);
                messages.push({
                    role: 'tool',
                    tool_call_id: toolCall.id,
                    content: toolResult
                });
            }

            response = await getGeminiClient().chat.completions.create({
                model: 'gemini-2.5-pro',
                messages,
                tools: this.tools
            });

            choice = response.choices[0];
        }

        const aiResponse = choice.message.content || 'Sorry, I could not generate a response.';
        this.updateConversationMemory(userQuery, aiResponse, spatialAnalysis);
        return aiResponse;
    } catch (error) {
        console.error('❌ Gemini API Error:', error);
        return 'I apologize, but I encountered an error while processing your request.';
    }
  }

  // ============================================================================
  // HYBRID RAG INTEGRATION METHODS
  // ============================================================================

  /**
   * Assess if a query should use the hybrid RAG service for air quality analysis
   */
  private async assessIsAirQualityQuery(query: string, assessment: any): Promise<boolean> {
    const lowerQuery = query.toLowerCase();
    
    // Primary air quality keywords
    const airQualityKeywords = [
      'air quality', 'aqi', 'air pollution', 'particulate matter',
      'pm2.5', 'pm10', 'pm 2.5', 'pm 10', 'pollutant concentration',
      'air monitoring', 'ambient air', 'pollution levels'
    ];
    
    // Health impact keywords that often relate to air quality
    const healthKeywords = [
      'health effects', 'health impact', 'respiratory', 'breathing',
      'cardiovascular', 'lung health', 'exposure', 'safe levels'
    ];
    
    // Analysis keywords that work well with hybrid RAG
    const analysisKeywords = [
      'average', 'concentration', 'measurements', 'readings', 'data',
      'trends', 'comparison', 'levels in', 'current conditions'
    ];
    
    // Check for direct air quality mentions
    const hasAirQualityKeywords = airQualityKeywords.some(keyword => 
      lowerQuery.includes(keyword)
    );
    
    // Check for health + air quality context
    const hasHealthContext = healthKeywords.some(keyword => 
      lowerQuery.includes(keyword)
    ) && (lowerQuery.includes('air') || lowerQuery.includes('pollution') || lowerQuery.includes('pm'));
    
    // Check for analysis + location context (good for sensor data)
    const hasAnalysisContext = analysisKeywords.some(keyword => 
      lowerQuery.includes(keyword)
    ) && (assessment.spatialElements?.namedLocations?.length > 0 || 
         assessment.spatialElements?.coordinates?.length > 0);
    
    // Check if query type suggests air quality analysis
    const queryTypeMatch = assessment.queryType && (
      assessment.queryType.includes('smoke_analysis') ||
      assessment.queryType.includes('general_inquiry')
    );
    
    const shouldUseHybridRAG = hasAirQualityKeywords || hasHealthContext || 
      (hasAnalysisContext && queryTypeMatch);
    
    if (shouldUseHybridRAG) {
      console.log(`🎯 AIR QUALITY QUERY CLASSIFICATION: 
        - Keywords: ${hasAirQualityKeywords}
        - Health context: ${hasHealthContext}
        - Analysis context: ${hasAnalysisContext}
        - Query type: ${assessment.queryType}
      `);
    }
    
    return shouldUseHybridRAG;
  }

  /**
   * Retrieve air quality analysis using the hybrid RAG service
   */
  private async retrieveHybridAirQualityAnalysis(
    query: string, 
    spatialElements: any
  ): Promise<ProcessedHybridData | null> {
    try {
      console.log('🔗 HYBRID RAG: Connecting to real air quality analysis service');
      
      // Check if service is available first
      const isAvailable = await hybridRAGClient.isServiceAvailable();
      if (!isAvailable) {
        console.log('❌ HYBRID RAG: Service not available, falling back to traditional methods');
        return null;
      }
      
      // Prepare the request with spatial context if available
      const request = {
        query,
        include_sensor_data: true,
        include_literature: true,
        spatial_context: this.extractSpatialContext(spatialElements)
      };
      
      // Call the hybrid RAG service
      const result = await hybridRAGClient.queryAirQuality(request);
      
      if (result) {
        console.log(`✅ HYBRID RAG: Retrieved ${result.dataQuality} quality data`);
        console.log(`📊 SENSOR DATA: ${result.sensorData.length} sensor readings`);
        console.log(`📚 LITERATURE: ${result.literatureAnalysis.length} scientific sources`);
      }
      
      return result;
      
    } catch (error) {
      console.error('❌ HYBRID RAG: Error during air quality analysis:', error);
      return null;
    }
  }

  /**
   * Extract spatial context for hybrid RAG service
   */
  private extractSpatialContext(spatialElements: any) {
    // Extract coordinates if available
    if (spatialElements?.coordinates?.length > 0) {
      const coord = spatialElements.coordinates[0];
      return {
        latitude: coord.lat,
        longitude: coord.lng,
        radius_km: 50 // Default 50km radius for air quality analysis
      };
    }
    
    // If no coordinates but we have named locations, we could geocode them
    // For now, return null and let the hybrid RAG service handle it
    return undefined;
  }

  // ============================================================================
  // HELPER METHODS FOR ALGORITHM IMPLEMENTATION
  // ============================================================================

  private determineQueryType(query: string, fireKeywords: string[], smokeKeywords: string[]): string {
    const lowerQuery = query.toLowerCase();
    
    const queryTypes: string[] = [];
    
    if (fireKeywords.some(keyword => lowerQuery.includes(keyword))) {
      queryTypes.push('fire_analysis');
    }
    
    if (smokeKeywords.some(keyword => lowerQuery.includes(keyword))) {
      queryTypes.push('smoke_analysis');
    }
    
    if (lowerQuery.includes('risk') || lowerQuery.includes('probability')) {
      queryTypes.push('risk_assessment');
    }
    
    if (lowerQuery.includes('predict') || lowerQuery.includes('forecast')) {
      queryTypes.push('prediction');
    }
    
    return queryTypes.join('_') || 'general_inquiry';
  }

  private identifyInformationNeeds(query: string): string[] {
    const needs: string[] = [];
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('history') || lowerQuery.includes('past') || lowerQuery.includes('trend')) {
      needs.push('historical_analysis');
    }
    
    if (lowerQuery.includes('research') || lowerQuery.includes('study') || lowerQuery.includes('evidence')) {
      needs.push('scientific_evidence');
    }
    
    if (lowerQuery.includes('real-time') || lowerQuery.includes('current') || lowerQuery.includes('now')) {
      needs.push('real_time_data');
    }
    
    if (lowerQuery.includes('predict') || lowerQuery.includes('forecast') || lowerQuery.includes('model')) {
      needs.push('predictive_modeling');
    }
    
    return needs;
  }

  private selectRequiredTools(query: string, queryType: string): string[] {
    const tools: string[] = [];
    
    if (queryType.includes('fire')) {
      tools.push('fire_weather_index', 'fuel_moisture_calculator', 'ignition_probability');
    }
    
    if (queryType.includes('smoke')) {
      tools.push('hysplit_model', 'atmospheric_dispersion', 'air_quality_sensors');
    }
    
    if (queryType.includes('risk')) {
      tools.push('risk_assessment_matrix', 'vulnerability_analysis', 'exposure_calculation');
    }
    
    return tools;
  }

  private async retrieveGeospatialData(spatialElements: any): Promise<any> {
    try {
      // Query real geospatial data from our database
      const queries = [];
      
      if (spatialElements?.coordinates?.length > 0) {
        const coord = spatialElements.coordinates[0];
        const point = `POINT(${coord.lng || coord.longitude} ${coord.lat || coord.latitude})`;
        
        // Temporarily disable spatial filtering due to PostGIS syntax issues
        // TODO: Fix PostGIS spatial query syntax for Supabase
        /*
        // Query elevation data if available
        queries.push(
          supabase
            .from('elevation_model')
            .select('elevation_m, terrain_type')
            .rpc('find_nearby_elevation', { 
              query_lat: coord.lat, 
              query_lng: coord.lng, 
              radius_m: 1000 
            })
            .limit(1)
            .single()
        );
        
        // Query land cover data if available  
        queries.push(
          supabase
            .from('land_cover')
            .select('cover_type, vegetation_density')
            .rpc('find_intersecting_cover', {
              query_lat: coord.lat,
              query_lng: coord.lng
            })
            .limit(1)
            .single()
        );
        */
      }
      
      const results = await Promise.allSettled(queries);
      
      // Return only values supported by retrieved data (no synthetic placeholders)
      return {
        topography: results[0]?.status === 'fulfilled' 
          ? `${results[0].value?.terrain_type || 'varied terrain'} with elevation ${results[0].value?.elevation_m || 'unknown'}m`
          : 'terrain data unavailable - check GPS coordinates',
        landCover: results[1]?.status === 'fulfilled'
          ? `${results[1].value?.cover_type || 'mixed vegetation'} (density: ${results[1].value?.vegetation_density || 'unknown'})`
          : 'land cover data unavailable',
        populationDensity: null, // Would need census data integration
        infrastructure: [],
        watersheds: [],
        administrativeBoundaries: spatialElements?.administrativeRegion || null,
        dataSource: 'database_query',
        querySuccess: results.some(r => r.status === 'fulfilled')
      };
    } catch (error) {
      console.error('Error retrieving geospatial data:', error);
      return {
        topography: 'geospatial query failed',
        landCover: 'geospatial query failed', 
        populationDensity: null,
        infrastructure: [],
        watersheds: [],
        administrativeBoundaries: 'query failed',
        dataSource: 'error_real_only',
        error: error.message
      };
    }
  }

  private async retrieveEnvironmentalData(spatialElements: any, queryContext?: string): Promise<any> {
    try {
      console.log('🌡️ REAL ENV DATA: Retrieving environmental data with intelligent routing');
      
      // Intelligent data source routing based on query context
      const dataSource = this.determineDataSource(queryContext || '');
      console.log(`🧠 INTELLIGENT ROUTING: Selected data source '${dataSource}' for query context`);
      
      let environmentalData: any = {
        routingDecision: dataSource,
        dataSource: 'INTELLIGENT_ROUTING'
      };
      
      // Get real weather data with context-aware analysis if coordinates available
      if (spatialElements?.coordinates?.length > 0) {
        const coord = spatialElements.coordinates[0];
        
        try {
          console.log('🌡️ WEATHER: Fetching context-aware fire weather conditions');
          console.log(`🔍 WEATHER: Analyzing query for scenario detection: "${queryContext}"`);
          
          const weatherResponse = await fetch(`${PYTHON_SERVICE_BASE_URL}/weather/fire-conditions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              latitude: coord.lat,
              longitude: coord.lng,
              hours_forecast: 24,
              scenario_type: 'wildfire',  // Let backend detect from query
              user_query: queryContext  // Pass user query for context-aware analysis
            }),
            signal: AbortSignal.timeout(5000)
          });
          
          if (weatherResponse.ok) {
            const weatherResult = await weatherResponse.json();
            if (!weatherResult?.success || !weatherResult?.data?.fire_weather) {
              throw new Error(weatherResult?.error || 'Weather service returned no usable real-time fire weather payload');
            }
            environmentalData.fireWeather = weatherResult;
            
            // Use detected scenario from backend analysis
            environmentalData.detectedScenario = weatherResult?.data?.detected_scenario || weatherResult.detected_scenario || 'unknown';
            
            console.log(`✅ WEATHER: Context-aware analysis complete`);
            if (weatherResult.user_query) {
              console.log(`🔍 WEATHER: Query analyzed: "${weatherResult.user_query}"`);
            }
            if (environmentalData.detectedScenario) {
              console.log(`🔍 WEATHER: Detected scenario: ${environmentalData.detectedScenario}`);
            }
            if (weatherResult?.data?.fire_weather?.risk_level) {
              console.log(`📊 WEATHER: Risk/Suitability: ${weatherResult.data.fire_weather.risk_level}`);
            }
          } else {
            throw new Error(`Weather service error: ${weatherResponse.status}`);
          }
        } catch (weatherError: any) {
          console.log('⚠️ WEATHER: Python service unavailable - real weather data unavailable');
          environmentalData.fireWeather = {
            available: false,
            data: null,
            message: `Real weather service unavailable: ${weatherError?.message || 'unknown error'}`,
            timestamp: new Date().toISOString(),
            data_source: 'REAL_SERVICE_UNAVAILABLE'
          };
        }

        try {
          // Get basic elevation data  
          console.log('📍 ELEVATION: Fetching basic elevation data');
          const elevationResponse = await fetch(`${PYTHON_SERVICE_BASE_URL}/weather/elevation?latitude=${coord.lat}&longitude=${coord.lng}`, {
            signal: AbortSignal.timeout(5000)
          });
          
          if (elevationResponse.ok) {
            const elevationResult = await elevationResponse.json();
            environmentalData.topography = elevationResult;
            console.log(`✅ ELEVATION: Retrieved basic elevation data - Elevation: ${elevationResult.data?.elevation_m}m`);
          } else {
            throw new Error(`Elevation service error: ${elevationResponse.status}`);
          }
        } catch (elevationError: any) {
          console.log('⚠️ ELEVATION: Python service unavailable - real elevation data unavailable');
          environmentalData.topography = {
            available: false,
            data: null,
            message: `Real elevation service unavailable: ${elevationError?.message || 'unknown error'}`,
            data_source: 'REAL_SERVICE_UNAVAILABLE'
          };
        }
      }
      
      // Use OpenAQ for real air quality data if coordinates available
      if (spatialElements?.coordinates?.length > 0) {
        const coord = spatialElements.coordinates[0];
        
        try {
          const openaqData = await this.openaqService.getNearbyMeasurements(
            coord.lat,
            coord.lng,
            {
              radiusKm: 25,
              parameters: ['pm25', 'pm10', 'o3', 'no2'],
              hoursBack: 24
            }
          );
          
          environmentalData.realAirQuality = {
            measurementCount: openaqData.measurementsFound,
            locationCount: openaqData.locationsFound,
            recentPM25: openaqData.measurements
              .filter(m => m.parameter === 'pm25')
              .slice(0, 5)
              .map(m => ({ value: m.value, timestamp: m.timestamp, location: m.locationName }))
          };
          
          console.log(`✅ REAL DATA: Retrieved ${openaqData.measurementsFound} air quality measurements`);
          
        } catch (error) {
          console.error('❌ OpenAQ data retrieval failed:', error);
          environmentalData.airQualityError = error.message;
        }
      }
      
      // Add basic environmental context (would integrate with weather APIs in production)
      environmentalData.basicWeather = {
        message: 'Real data only mode: no synthetic weather defaults are used.',
        availableData: 'Only verified upstream services are reported',
        coordinates: spatialElements?.coordinates?.[0] || null
      };
      
      return environmentalData;
      
    } catch (error) {
      console.error('❌ Environmental data retrieval failed:', error);
      return {
        error: 'Environmental data service unavailable',
        message: error.message,
        dataSource: 'ERROR_REAL_ONLY'
      };
    }
  }

  private async retrieveLocalSensorData(spatialElements: any, queryContext?: string): Promise<any> {
    try {
      // MIGRATION PHASE CONTROL - Critical for safe phased deployment
      const MIGRATION_PHASE = process.env.SENSOR_DATA_MIGRATION_PHASE || '1';
      
      switch (MIGRATION_PHASE) {
        case '1': // LEGACY - Phase 1: Read ONLY from old tables (CURRENT STATE)
          return await this.queryLegacySensorData(spatialElements, queryContext);
          
        case '2': // SHADOW - Phase 2: Query both, compare, return old (FUTURE)
          return await this.queryShadowValidationData(spatialElements, queryContext);
          
        case '3': // LIVE - Phase 3: Query ONLY new table (FUTURE)
          return await this.queryUnifiedSensorData(spatialElements, queryContext);
          
        default:
          console.error(`Invalid MIGRATION_PHASE: ${MIGRATION_PHASE}. Defaulting to LEGACY.`);
          return await this.queryLegacySensorData(spatialElements, queryContext);
      }
    } catch (error) {
      console.error('Error in retrieveLocalSensorData:', error);
      // Fallback to legacy data on any error
      return await this.queryLegacySensorData(spatialElements, queryContext);
    }
  }

  /**
   * Phase 1 (CURRENT): Query legacy uploaded_data and meshtastic_telemetry tables
   */
  private async queryLegacySensorData(spatialElements: any, queryContext?: string): Promise<any> {
    try {
      console.log('Querying legacy uploaded_data and meshtastic_telemetry tables (Phase 1)');
      
      // Base query for recent data (last 24 hours)
      const hoursBack = 24;
      const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
      
      let query = supabase
        .from('uploaded_data')
        .select(`
          id,
          sensor_uuid,
          ts,
          location,
          pm25_ug_m3,
          pm10_ug_m3,
          temperature_c,
          rh_percent,
          created_at
        `)
        .gte('ts', startTime)
        .order('ts', { ascending: false });
      
      // TODO: Re-enable spatial filtering once PostGIS syntax is verified
      // Temporarily disabled due to syntax error: "failed to parse filter (dwithin.POINT(...))"
      // For now, we'll get all recent data and rely on other filtering mechanisms
      console.log(`📍 Spatial filtering temporarily disabled - querying all recent sensor data`);
      if (spatialElements?.coordinates?.length > 0) {
        const coord = spatialElements.coordinates[0];
        console.log(`🎯 Target coordinates: ${coord.lat}, ${coord.lng} (spatial filter will be re-enabled)`);
      }
      
      const { data: sensorReadings, error } = await query.limit(1000);
      
      if (error) {
        console.error('Error retrieving legacy sensor data:', error);
        throw error;
      }
      
      if (!sensorReadings || sensorReadings.length === 0) {
        return {
          activeSensors: 0,
          averagePM25: null,
          averagePM10: null,
          lastUpdate: null,
          sensorLocations: [],
          dataSource: 'pi_sensor_raw (legacy)',
          queryTimeRange: `${hoursBack} hours`
        };
      }
      
      // Process legacy data format
      const validPM25 = sensorReadings.filter(r => r.pm25_ug_m3 !== null).map(r => r.pm25_ug_m3);
      const validPM10 = sensorReadings.filter(r => r.pm10_ug_m3 !== null).map(r => r.pm10_ug_m3);
      const uniqueDevices = [...new Set(sensorReadings.map(r => r.sensor_uuid))];
      
      return {
        activeSensors: uniqueDevices.length,
        averagePM25: validPM25.length > 0 ? validPM25.reduce((a, b) => a + b, 0) / validPM25.length : null,
        averagePM10: validPM10.length > 0 ? validPM10.reduce((a, b) => a + b, 0) / validPM10.length : null,
        visibility: this.calculateVisibilityFromPM25(validPM25.length > 0 ? validPM25.reduce((a, b) => a + b, 0) / validPM25.length : null),
        lastUpdate: sensorReadings[0]?.ts || null,
        sensorLocations: [], // TODO: Extract locations from legacy format
        dataSource: 'pi_sensor_raw (legacy)',
        totalReadings: sensorReadings.length,
        queryTimeRange: `${hoursBack} hours`
      };
      
    } catch (error) {
      console.error('Error in queryLegacySensorData:', error);
      return {
        activeSensors: 0,
        averagePM25: null,
        averagePM10: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        dataSource: 'legacy_error'
      };
    }
  }

  /**
   * Phase 2 (FUTURE): Shadow validation - query both old and new, compare, return old
   */
  private async queryShadowValidationData(spatialElements: any, queryContext?: string): Promise<any> {
    // TODO: Implement in Phase 2
    console.log('Shadow validation mode - querying both old and new tables');
    
    try {
      // Query both systems
      const [legacyData, unifiedData] = await Promise.all([
        this.queryLegacySensorData(spatialElements, queryContext),
        this.queryUnifiedSensorData(spatialElements, queryContext)
      ]);
      
      // Async validation (don't block user response)
      this.validateMigrationData(legacyData, unifiedData).catch(console.error);
      
      // Always return legacy data during shadow mode
      return {
        ...legacyData,
        dataSource: 'legacy (shadow validated)'
      };
    } catch (error) {
      console.error('Shadow validation error, falling back to legacy:', error);
      return await this.queryLegacySensorData(spatialElements, queryContext);
    }
  }

  /**
   * Phase 3 (FUTURE): Query unified sensor_readings table only
   */
  private async queryUnifiedSensorData(spatialElements: any, queryContext?: string): Promise<any> {
    try {
      // Determine data source based on query context
      const dataSource = this.determineDataSource(queryContext || '');
      
      console.log(`Querying unified sensor_readings table (Phase 3) - source: ${dataSource}`);
      
      // Base query for recent data (last 24 hours)
      const hoursBack = 24;
      const startTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
      
      let query = supabase
        .from('sensor_readings')
        .select(`
          device_id,
          timestamp,
          location,
          source,
          pm25_ugm3,
          pm10_ugm3,
          pm1_ugm3,
          temperature_c,
          humidity_pct,
          pressure_pa,
          metadata
        `)
        .gte('timestamp', startTime)
        .order('timestamp', { ascending: false });
      
      // Filter by data source if specified
      if (dataSource !== 'all') {
        query = query.eq('source', dataSource);
      }
      
      // Temporarily disable spatial filtering due to PostGIS syntax issues
      if (spatialElements?.coordinates?.length > 0) {
        const coord = spatialElements.coordinates[0];
        console.log(`🎯 TARGET COORDINATES: ${coord.lat}, ${coord.lng} - spatial filtering temporarily disabled`);
        
        // TODO: Fix PostGIS spatial query syntax
        // For now, get all recent data and note target coordinates for reference
        /*
        const radiusKm = 50; // 50km radius
        
        // Use PostGIS spatial query for nearby sensors
        query = query.filter(
          'location',
          'dwithin',
          `POINT(${coord.lng || coord.longitude} ${coord.lat || coord.latitude})`,
          radiusKm * 1000 // Convert to meters
        );
        */
      }
      
      const { data: sensorReadings, error } = await query.limit(1000);
      
      if (error) {
        console.error('Error retrieving unified sensor data:', error);
        throw error;
      }
      
      if (!sensorReadings || sensorReadings.length === 0) {
        return {
          activeSensors: 0,
          averagePM25: null,
          averagePM10: null,
          averagePM1: null,
          lastUpdate: null,
          sensorLocations: [],
          dataSource: dataSource,
          queryTimeRange: `${hoursBack} hours`
        };
      }
      
      // Process unified data (same as before, truncated for brevity)
      const validPM25 = sensorReadings.filter(r => r.pm25_ugm3 !== null).map(r => r.pm25_ugm3);
      const validPM10 = sensorReadings.filter(r => r.pm10_ugm3 !== null).map(r => r.pm10_ugm3);
      const validPM1 = sensorReadings.filter(r => r.pm1_ugm3 !== null).map(r => r.pm1_ugm3);
      const uniqueDevices = [...new Set(sensorReadings.map(r => r.device_id))];
      
      return {
        activeSensors: uniqueDevices.length,
        averagePM25: validPM25.length > 0 ? validPM25.reduce((a, b) => a + b, 0) / validPM25.length : null,
        averagePM10: validPM10.length > 0 ? validPM10.reduce((a, b) => a + b, 0) / validPM10.length : null,
        averagePM1: validPM1.length > 0 ? validPM1.reduce((a, b) => a + b, 0) / validPM1.length : null,
        visibility: this.calculateVisibilityFromPM25(validPM25.length > 0 ? validPM25.reduce((a, b) => a + b, 0) / validPM25.length : null),
        lastUpdate: sensorReadings[0]?.timestamp || null,
        sensorLocations: [], // TODO: Parse locations from unified format
        dataSource,
        totalReadings: sensorReadings.length,
        queryTimeRange: `${hoursBack} hours`
      };
      
    } catch (error) {
      console.error('Error in queryUnifiedSensorData:', error);
      return {
        activeSensors: 0,
        averagePM25: null,
        averagePM10: null,
        error: error instanceof Error ? error.message : 'Unknown error',
        dataSource: 'unified_error'
      };
    }
  }

  /**
   * Validation method for shadow mode (Phase 2)
   */
  private async validateMigrationData(legacyData: any, unifiedData: any): Promise<void> {
    // TODO: Implement comprehensive validation logic
    console.log('Validating migration data...', {
      legacy: {
        sensors: legacyData.activeSensors,
        pm25: legacyData.averagePM25,
        source: legacyData.dataSource
      },
      unified: {
        sensors: unifiedData.activeSensors,
        pm25: unifiedData.averagePM25,
        source: unifiedData.dataSource
      }
    });
  }

  /**
   * Determine which data source to query based on user query context
   */
  private determineDataSource(queryContext: string): 'pi_batch' | 'meshtastic_stream' | 'all' {
    const lowerQuery = queryContext.toLowerCase();
    
    // Keywords that indicate uploaded/historical data preference
    const uploadedKeywords = ['uploaded', 'batch', 'historical', 'archive', 'file', 'csv', 'dataset'];
    
    // Keywords that indicate live/streaming data preference  
    const liveKeywords = ['live', 'real-time', 'current', 'now', 'streaming', 'latest', 'recent'];
    
    // Keywords that indicate Meshtastic network specifically
    const meshtasticKeywords = ['meshtastic', 'mesh', 'network', 'wireless'];
    
    // Keywords that indicate Pi sensors specifically
    const piKeywords = ['pi', 'raspberry', 'ground', 'station'];
    
    // Check for specific source indicators
    if (meshtasticKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'meshtastic_stream';
    }
    
    if (piKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'pi_batch';
    }
    
    // Check for temporal preferences
    if (uploadedKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'pi_batch'; // Uploaded data typically comes from Pi sensors
    }
    
    if (liveKeywords.some(keyword => lowerQuery.includes(keyword))) {
      return 'meshtastic_stream'; // Live data typically from Meshtastic
    }
    
    // Default to all sources if no specific preference detected
    return 'all';
  }

  /**
   * Calculate visibility from PM2.5 concentration using EPA guidelines
   */
  private calculateVisibilityFromPM25(pm25: number | null): number | null {
    if (pm25 === null) return null;
    
    // Rough formula based on EPA visibility guidelines
    // Visibility (km) = 3.912 / (PM2.5 * 0.001 + 0.02)
    // This is a simplified approximation
    if (pm25 <= 12) return 15; // Good air quality
    if (pm25 <= 35) return 10; // Moderate
    if (pm25 <= 55) return 6;  // Unhealthy for sensitive groups
    if (pm25 <= 150) return 3; // Unhealthy
    return 1.5; // Very unhealthy/hazardous
  }

  private async retrieveHistoricalFireData(spatialElements: any): Promise<any> {
    try {
      console.log(`🔥 REAL DATA: Retrieving historical air quality and fire impact data`);
      
      // If we have coordinates, get real air quality baseline from OpenAQ
      if (spatialElements?.coordinates?.length > 0) {
        const coord = spatialElements.coordinates[0];
        
        const baselineData = await this.openaqService.getNearbyMeasurements(
          coord.lat,
          coord.lng,
          {
            radiusKm: 100,
            parameters: ['pm25', 'pm10'],
            hoursBack: 168 // Last week
          }
        );
        
        // Calculate baseline air quality statistics
        const pm25Values = baselineData.measurements
          .filter(m => m.parameter === 'pm25')
          .map(m => m.value);
          
        const avgPM25 = pm25Values.length > 0 
          ? pm25Values.reduce((a, b) => a + b, 0) / pm25Values.length 
          : null;
        
        return {
          historicalAirQuality: {
            baselinePM25: avgPM25,
            measurementSites: baselineData.locationsFound,
            dataPoints: baselineData.measurementsFound,
            timeRange: 'Last 7 days'
          },
          dataSource: 'OPENAQ_REAL_MEASUREMENTS',
          coordinates: { lat: coord.lat, lng: coord.lng },
          message: 'Real historical air quality data from global monitoring network'
        };
      }
      
      // If no coordinates, use database query for general regional data
      return {
        historicalAirQuality: {
          message: 'Coordinates needed for real-time air quality baseline',
          suggestion: 'Provide latitude/longitude for OpenAQ integration'
        },
        dataSource: 'COORDINATES_REQUIRED'
      };
      
    } catch (error) {
      console.error('❌ Real historical data retrieval failed:', error);
      
      return {
        historicalAirQuality: {
          error: 'Historical data service unavailable',
          message: error.message
        },
        dataSource: 'HISTORICAL_DATA_ERROR'
      };
    }
  }

  private async retrieveScientificLiterature(queryType: string, originalQuery?: string): Promise<any> {
    try {
      console.log(`🔬 REAL SCIENCE: Retrieving literature for ${queryType}`);
      
      // Real semantic search through scientific literature
      const searchQuery = originalQuery ? `${originalQuery} ${queryType}` : queryType;
      const searchResults = await this.ragService.searchLiterature({
        query: searchQuery,
        limit: 5,
        similarityThreshold: 0.75,
        filters: {
          topics: ['wildfire', 'smoke_dispersion', 'atmospheric_modeling', 'hysplit', 'neural_networks']
        },
        includeContext: true
      });
      
      // Format for LLM consumption
      return {
        relevantStudies: searchResults.map(result => ({
          title: result.title,
          authors: result.authors.join(', '),
          key_findings: result.textChunk.substring(0, 200) + '...', // First 200 chars
          doi: result.documentId,
          similarity_score: result.similarityScore,
          section: result.sectionTitle
        })),
        consensusFindings: `Retrieved ${searchResults.length} relevant studies from real scientific literature`,
        researchGaps: 'Analysis based on semantic search across peer-reviewed publications',
        dataSource: 'RAG_REAL_LITERATURE'
      };
      
    } catch (error) {
      console.error('❌ Real literature retrieval failed:', error);
      
      // Fallback with clear indication this is not real data
      return {
        relevantStudies: [],
        consensusFindings: 'Literature retrieval service unavailable',
        researchGaps: 'Could not access scientific literature database',
        dataSource: 'RAG_ERROR_FALLBACK',
        error: error.message
      };
    }
  }

  private async retrieveActiveFireData(spatialElements: any): Promise<any> {
    try {
      console.log('🔥 REAL FIRE DATA: Retrieving active fire detections from NASA FIRMS');
      
      // Check if we have coordinates for the query
      if (!spatialElements?.coordinates?.length > 0) {
        console.log('⚠️ No coordinates provided for NASA FIRMS query');
        return {
          activeFireCount: 0,
          fires: [],
          message: 'Coordinates required for real-time fire detection',
          dataSource: 'NASA_FIRMS_NO_COORDINATES'
        };
      }
      
      const coord = spatialElements.coordinates[0];
      
      // Call NASA FIRMS service via our Python API
      const response = await fetch(`${PYTHON_SERVICE_BASE_URL}/nasa-firms/active-fires`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: coord.lat,
          longitude: coord.lng,
          radius_km: 50,
          days_back: 1
        }),
        signal: AbortSignal.timeout(8000) // Note: This is timeout, not port
      });
      
      if (!response.ok) {
        throw new Error(`NASA FIRMS API error: ${response.status}`);
      }
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || 'NASA FIRMS query failed');
      }
      
      const fireData = result.data;
      
      console.log(`✅ REAL FIRE DATA: Retrieved ${fireData.fire_count} active fire detections from NASA FIRMS`);
      
      return {
        activeFireCount: fireData.fire_count,
        fires: fireData.fires || [],
        queryInfo: fireData.query_info,
        dataSource: fireData.data_source,
        message: fireData.fire_count > 0 
          ? `${fireData.fire_count} active fires detected within 50km radius`
          : 'No active fires detected in the area',
        highConfidenceFires: fireData.fires?.filter((fire: any) => fire.confidence >= 80).length || 0,
        averageConfidence: fireData.fires?.length > 0 
          ? fireData.fires.reduce((sum: number, fire: any) => sum + fire.confidence, 0) / fireData.fires.length 
          : null
      };
      
    } catch (error) {
      console.log('⚠️ NASA FIRMS: Python service unavailable - real fire detections unavailable');
      return {
        activeFireCount: null,
        fires: [],
        queryInfo: spatialElements?.coordinates?.[0]
          ? {
              latitude: spatialElements.coordinates[0].lat,
              longitude: spatialElements.coordinates[0].lng,
              radius_km: 50,
              days_back: 1
            }
          : null,
        dataSource: 'NASA_FIRMS_UNAVAILABLE',
        message: `Real NASA FIRMS data unavailable: ${error instanceof Error ? error.message : 'unknown error'}`,
        highConfidenceFires: null,
        averageConfidence: null
      };
    }
  }

  private async establishSpatialContext(geospatialData: any, assessment?: any, providedLocation?: { lat: number; lng: number }): Promise<SpatialContext> {
    // Check for coordinates in multiple places with fallbacks
    let detectedCoords = assessment?.spatialElements?.coordinates?.[0];
    
    // Fallback 1: Use provided location directly
    if (!detectedCoords && providedLocation) {
      detectedCoords = providedLocation;
      console.log(`📍 Using provided location fallback: ${providedLocation.lat}, ${providedLocation.lng}`);
    }
    
    // Fallback 2: Check if geospatialData has coordinates
    if (!detectedCoords && geospatialData?.coordinates) {
      detectedCoords = geospatialData.coordinates;
      console.log(`📍 Using geospatial data coordinates: ${detectedCoords.lat}, ${detectedCoords.lng}`);
    }
    
    if (!detectedCoords || typeof detectedCoords.lat !== 'number' || typeof detectedCoords.lng !== 'number') {
      throw new Error('No valid coordinates provided for spatial analysis. Please specify a location in your query.');
    }
    
    const latitude = detectedCoords.lat;
    const longitude = detectedCoords.lng;

    let administrativeRegion = 'Unknown Region';
    let elevation: number | null = null;

    try {
      // Add timeout to prevent hanging on reverse geocoding
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json&addressdetails=1`, {
        headers: { 'User-Agent': 'SmeshLLM/1.0' },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (response.ok) {
        const data = await response.json();
        if (data && data.address) {
          administrativeRegion = data.address.county ? `${data.address.county}, ${data.address.state}` : data.display_name;
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.log(`⏰ Reverse geocoding timeout for ${latitude}, ${longitude}`);
      } else {
        console.log(`⚠️ Reverse geocoding error: ${error}`);
      }
    }

    console.log(`📍 SPATIAL CONTEXT: Using coordinates ${latitude}, ${longitude} in ${administrativeRegion}`);

    return {
      location: {
        latitude: latitude,
        longitude: longitude,
        elevation: elevation,
        administrativeRegion: administrativeRegion
      },
      spatialRadius: 50, // km
      environmentalFactors: {
        topography: geospatialData?.topography || 'unknown',
        vegetation: 'unknown',
        landUse: 'unknown',
        climaticZone: 'unknown'
      },
      proximityAnalysis: {
        nearbyPopulation: null as any,
        criticalInfrastructure: [],
        sensitiveAreas: []
      }
    };
  }

  private async assessWildfireRisk(spatialContext: SpatialContext, environmentalData: any): Promise<WildfireRiskAssessment> {
    const fw = this.extractFireWeatherSnapshot(environmentalData);
    const hasRealFireWeather = !!fw && typeof fw === 'object';

    if (!hasRealFireWeather) {
      return {
        fireWeatherIndex: null,
        windSpeed: null,
        windDirection: null,
        humidity: null,
        temperature: null,
        droughtIndex: null,
        fuelMoisture: null,
        historicalFireProbability: null,
        dataAvailability: {
          fireWeather: false,
          reason: environmentalData?.fireWeather?.message || 'Real fire weather data unavailable'
        }
      } as any;
    }

    return {
      fireWeatherIndex: fw.fire_weather_index ?? fw.fosberg_fire_weather_index ?? null,
      windSpeed: fw.wind_speed_ms ?? null,
      windDirection: fw.wind_direction_deg ?? null,
      humidity: fw.relative_humidity_pct ?? null,
      temperature: fw.temperature_c ?? null,
      droughtIndex: fw.drought_code ?? null,
      fuelMoisture: fw.fuel_moisture_code ?? null,
      historicalFireProbability: null
    } as any;
  }

  private async analyzeSmokeDispersion(spatialContext: SpatialContext, sensorData: any): Promise<SmokeDispersinAnalysis> {
    const avgPM25 = sensorData?.averagePM25;
    const avgPM10 = sensorData?.averagePM10;
    const hasRealSensorData =
      sensorData &&
      sensorData.activeSensors > 0 &&
      typeof avgPM25 === 'number' &&
      typeof avgPM10 === 'number';

    if (!hasRealSensorData) {
      return {
        concentrationPrediction: {
          pm25: [],
          pm10: [],
          spatialDistribution: [],
          temporalEvolution: []
        },
        atmosphericConditions: {
          mixingHeight: null,
          stabilityClass: 'unavailable',
          windDescription: 'Real-time atmospheric inputs unavailable'
        },
        uncertaintyQuantification: {
          modelUncertainty: null,
          observationalUncertainty: null,
          propagatedUncertainty: null
        },
        dataAvailability: {
          sensorData: false,
          reason: 'No live PM sensor data available for dispersion analysis'
        }
      } as any;
    }

    return {
      concentrationPrediction: {
        pm25: [avgPM25],
        pm10: [avgPM10],
        spatialDistribution: [[avgPM25]],
        temporalEvolution: [1.0]
      },
      atmosphericConditions: {
        mixingHeight: null,
        stabilityClass: 'derived-from-live-sensor-context',
        windDescription: 'Requires real wind service for directional plume projection'
      },
      uncertaintyQuantification: {
        modelUncertainty: 0.35,
        observationalUncertainty: 0.2,
        propagatedUncertainty: 0.4
      }
    } as any;
  }

  private async runPhysicsInformedModels(
    spatialContext: SpatialContext,
    riskAssessment: WildfireRiskAssessment,
    smokeAnalysis: SmokeDispersinAnalysis
  ): Promise<any> {
    try {
      console.log(`🌪️ REAL PHYSICS: Starting HYSPLIT atmospheric dispersion model`);
      
      // Validate coordinates before proceeding
      const lat = spatialContext?.location?.latitude;
      const lng = spatialContext?.location?.longitude;
      
      // Check if coordinates are valid numbers within proper ranges
      const isValidLat = typeof lat === 'number' && !isNaN(lat) && lat >= -90 && lat <= 90;
      const isValidLng = typeof lng === 'number' && !isNaN(lng) && lng >= -180 && lng <= 180;
      
      if (!isValidLat || !isValidLng) {
        console.log(`⚠️ COORDINATE VALIDATION: Invalid coordinates (lat: ${lat}, lng: ${lng}). Skipping HYSPLIT physics model.`);
        
        return {
          hysplitPredictions: {
            status: 'skipped',
            reason: 'No valid coordinates provided for physics modeling',
            message: 'HYSPLIT atmospheric dispersion requires specific latitude/longitude coordinates. For general air quality analysis, sensor data and hybrid RAG insights are still available.',
            coordinates_required: true
          },
          physicsModel: 'HYSPLIT_COORDINATES_REQUIRED',
          dataSource: 'COORDINATE_VALIDATION_FALLBACK',
          realAtmosphericPhysics: false
        };
      }
      
      console.log(`📍 COORDINATES VALIDATED: lat=${lat}, lng=${lng} - proceeding with HYSPLIT model`);
      
      // Enhanced HYSPLIT parameters for hypothetical wildfire scenarios
      const elevation = spatialContext.location.elevation || 100;
      
      const hysplitParams = {
        latitude: lat,
        longitude: lng,
        startTime: new Date(), // Date object, not ISO string
        durationHours: 48, // Extended 48-hour simulation for comprehensive analysis
        releaseHeight: elevation + 50, // Fire height above ground + terrain elevation
        meteorologicalDataSource: 'GFS' as const, // Use GFS global model
        emissionRate: 2500, // Enhanced emission rate for significant wildfire scenario
        particleCount: 2000, // Increased particles for better resolution
        outputResolution: 5, // Higher resolution (5km) for detailed analysis
        createdBy: 'WildFireGPTAlgorithm_HypotheticalScenario'
      };
      
      console.log(`🌪️ HYSPLIT SCENARIO: Modeling hypothetical wildfire at elevation ${elevation}m`);
      
      // Start enhanced HYSPLIT run for preparedness planning
      const hysplitResult = await this.hysplitService.startRun(hysplitParams);
      
      // For now, return the run ID and status - in production this would be async
      return {
        hysplitPredictions: {
          runId: hysplitResult.runId,
          status: hysplitResult.status,
          startedAt: hysplitResult.startedAt,
          message: 'Real HYSPLIT atmospheric dispersion model initiated',
          estimatedCompletion: '5-10 minutes for full physics simulation'
        },
        physicsModel: 'HYSPLIT_REAL',
        dataSource: 'NOAA_HYSPLIT_INTEGRATION',
        realAtmosphericPhysics: true
      };
      
    } catch (error) {
      console.error('❌ Real HYSPLIT model failed:', error);
      
      // Fallback with clear indication this is not real physics
      return {
        hysplitPredictions: {
          error: 'HYSPLIT service unavailable',
          message: error.message,
          status: 'failed'
        },
        physicsModel: 'HYSPLIT_ERROR_FALLBACK',
        dataSource: 'SERVICE_ERROR',
        realAtmosphericPhysics: false
      };
    }
  }

  private synthesizeContext(
    userQuery: string,
    assessment: any,
    retrievedData: any,
    spatialAnalysis: any,
    conversationMemory: any[]
  ): any {
    // Handle hybrid RAG data if available
    let sensorReadings = retrievedData.sensorData;
    let scientificEvidence = retrievedData.scientificLiterature;
    let hybridInsights = null;
    
    if (retrievedData.hybridAirQualityData) {
      // Use data from hybrid RAG service instead of traditional sources
      sensorReadings = retrievedData.hybridAirQualityData.sensorData;
      scientificEvidence = retrievedData.hybridAirQualityData.literatureAnalysis;
      hybridInsights = {
        synthesizedAnalysis: retrievedData.hybridAirQualityData.synthesizedInsights,
        dataQuality: retrievedData.hybridAirQualityData.dataQuality,
        rawResponse: retrievedData.hybridAirQualityData.rawResponse,
        sourceService: 'hybrid_rag_real_data'
      };
      
      console.log('🔬 SYNTHESIS: Using hybrid RAG data for comprehensive air quality analysis');
    }
    
    return {
      query: userQuery,
      queryType: assessment.queryType,
      spatialElements: assessment.spatialElements,
      geospatialContext: retrievedData.geospatialData,
      environmentalConditions: retrievedData.environmentalData,
      sensorReadings: sensorReadings,
      activeFireData: retrievedData.activeFireData,
      historicalContext: retrievedData.historicalData,
      scientificEvidence: scientificEvidence,
      hybridAirQualityInsights: hybridInsights,
      spatialAnalysis: spatialAnalysis,
      conversationHistory: conversationMemory.slice(-5) // Last 5 exchanges
    };
  }

  private createAdvancedSystemPrompt(context: any): string {
    // Check if we have hybrid RAG insights
    const hasHybridData = context.hybridAirQualityInsights !== null;
    
    let hybridDataSection = '';
    if (hasHybridData) {
      hybridDataSection = `

🔬 HYBRID AIR QUALITY ANALYSIS (Real Data + Scientific Literature):
Data Quality: ${context.hybridAirQualityInsights.dataQuality}
Synthesized Analysis: ${context.hybridAirQualityInsights.synthesizedAnalysis}

This query has been enhanced with real-time sensor data and scientific literature analysis from our advanced hybrid RAG system. The above analysis combines:
- Real sensor measurements from DuckDB integration
- Scientific literature review with semantic search
- Gemini 2.5 Pro intelligent synthesis
- EPA AQI classifications and health impact analysis`;
    }

    return `You are SMeshLLM, Stanford University's advanced AI system for wildfire smoke plume prediction and management. You implement the comprehensive WildFire GPT algorithm with sophisticated spatial reasoning capabilities.

CORE CAPABILITIES:
- Physics-informed analysis combining HYSPLIT atmospheric dispersion modeling with AI enhancement
- Advanced spatial reasoning and geospatial analysis with real elevation data
- Real-time sensor network integration and validation
- Context-aware fire analysis with prescribed fire vs wildfire detection from user queries
- Fire weather index calculations (FWI, FFMC, DC) and risk level assessment
- Evidence-based recommendations from scientific literature
- Uncertainty quantification and risk assessment
- Real-time meteorological data integration (temperature, humidity, wind, precipitation)
- Topographic analysis for fire spread behavior assessment
${hasHybridData ? '- ENHANCED: Hybrid RAG air quality analysis with real sensor data + scientific synthesis' : ''}

CURRENT SPATIAL CONTEXT:
Location: ${context.spatialAnalysis?.location?.latitude}°N, ${context.spatialAnalysis?.location?.longitude}°W
Administrative Region: ${context.spatialAnalysis?.location?.administrativeRegion}
Environmental Factors: ${JSON.stringify(context.spatialAnalysis?.environmentalFactors)}
Population Exposure: ${context.spatialAnalysis?.proximityAnalysis?.nearbyPopulation} people within analysis radius

ENVIRONMENTAL CONDITIONS:
${context.environmentalConditions ? this.formatEnvironmentalData(context.environmentalConditions) : 'No environmental data available'}

SENSOR NETWORK STATUS:
${context.sensorReadings ? JSON.stringify(context.sensorReadings, null, 2) : 'No sensor data available'}

NASA FIRMS ACTIVE FIRE DETECTION:
${context.activeFireData ? JSON.stringify(context.activeFireData, null, 2) : 'No active fire detection data available'}

SCIENTIFIC EVIDENCE:
${context.scientificEvidence ? JSON.stringify(context.scientificEvidence, null, 2) : 'No literature context available'}${hybridDataSection}

INSTRUCTIONS:
1. Provide scientifically accurate, evidence-based responses
2. Use spatial reasoning to contextualize your analysis
3. Quantify uncertainty and explain model limitations
4. Reference specific sensor data and environmental conditions
5. Cite relevant scientific literature when available
6. Explain the physics behind atmospheric dispersion
7. Consider both immediate and long-term impacts
8. Provide actionable recommendations for fire management
9. Use clear, professional language suitable for researchers and emergency managers
10. Always acknowledge data sources and model assumptions
11. REAL-DATA-ONLY POLICY: Never invent values, never use synthetic/fallback numbers, and never infer missing weather/fire/sensor values as if observed.
12. If required real-time data is unavailable, explicitly say "data unavailable" and limit recommendations to what can be justified by verified sources.
13. Never claim active-fire counts, FRP, confidence, or weather risk categories unless those exact values are present in the provided context payloads.
${hasHybridData ? '14. **ENHANCED ANALYSIS**: Incorporate the hybrid RAG analysis provided above, which combines real sensor data with scientific literature for comprehensive air quality insights' : ''}

Format your response as a formal markdown report with sections for Analysis, Key Findings, Recommendations, and Data Sources. Incorporate all available spatial, environmental, and scientific context.${hasHybridData ? ' Pay special attention to the hybrid air quality analysis provided above.' : ''}`;
  }

  private extractFireWeatherSnapshot(environmentalData: any): {
    risk_level: string | null;
    temperature_c: number | null;
    relative_humidity_pct: number | null;
    wind_speed_ms: number | null;
    wind_direction_deg: number | null;
    fire_weather_index: number | null;
    drought_code: number | null;
    fuel_moisture_code: number | null;
  } | null {
    const payload = environmentalData?.fireWeather?.data?.fire_weather;
    if (!payload || typeof payload !== 'object') {
      return null;
    }

    const current = payload.current || payload;
    const analysis = payload.fire_weather_analysis || {};
    const indices = analysis.fire_weather_indices || {};

    const toNumber = (value: any): number | null => (
      typeof value === 'number' && Number.isFinite(value) ? value : null
    );

    return {
      risk_level: payload.risk_level || analysis.fire_danger_rating || payload.fire_danger_rating || null,
      temperature_c: toNumber(current.temperature_c ?? current.temperature_2m),
      relative_humidity_pct: toNumber(current.relative_humidity_pct ?? current.relative_humidity_2m ?? current.humidity_percent),
      wind_speed_ms: toNumber(current.wind_speed_ms ?? current.wind_speed_10m),
      wind_direction_deg: toNumber(current.wind_direction_deg ?? current.wind_direction_10m),
      fire_weather_index: toNumber(
        indices.canadian_fire_weather_index ??
        indices.fosberg_fire_weather_index ??
        payload.fire_weather_index ??
        payload.fosberg_fire_weather_index
      ),
      drought_code: toNumber(indices.canadian_drought_code ?? payload.drought_code),
      fuel_moisture_code: toNumber(indices.canadian_fine_fuel_moisture_code ?? payload.fuel_moisture_code)
    };
  }

  private formatEnvironmentalData(environmentalData: any): string {
    if (!environmentalData) {
      return 'No environmental data available.';
    }

    let formatted = '### Environmental & Atmospheric Conditions\n\n';

    const fw = this.extractFireWeatherSnapshot(environmentalData);

    if (fw) {
      if (fw && fw.risk_level) {
        formatted += `- **Fire Risk:** ${fw.risk_level}\n`;
      }
      if (fw && fw.temperature_c !== null && fw.temperature_c !== undefined) {
        formatted += `- Temperature: ${fw.temperature_c}°C (${(fw.temperature_c * 9/5 + 32).toFixed(1)}°F)\n`;
      }
      if (fw && fw.relative_humidity_pct !== null && fw.relative_humidity_pct !== undefined) {
        formatted += `- Relative Humidity: ${fw.relative_humidity_pct}%\n`;
      }
      if (typeof fw.wind_speed_ms === 'number') {
        formatted += `- Wind Speed: ${fw.wind_speed_ms} m/s (${(fw.wind_speed_ms * 2.237).toFixed(1)} mph, ${(fw.wind_speed_ms * 3.6).toFixed(1)} km/h)\n`;
      }
      if (typeof fw.wind_direction_deg === 'number') {
        formatted += `- Wind Direction: ${fw.wind_direction_deg}°\n`;
      }
      if (fw.fire_weather_index !== null && fw.fire_weather_index !== undefined) {
        formatted += `- Fire Weather Index: ${fw.fire_weather_index}/100\n`;
      }
      if (fw.drought_code !== null && fw.drought_code !== undefined) {
        formatted += `- Drought Code: ${fw.drought_code}\n`;
      }
      if (fw.fuel_moisture_code !== null && fw.fuel_moisture_code !== undefined) {
        formatted += `- Fuel Moisture Code: ${fw.fuel_moisture_code}\n`;
      }

      // Context-specific risk assessment
      if (fw && fw.risk_level && typeof fw.risk_level === 'string') {
        if (fw.risk_level.includes('EXCELLENT')) {
          formatted += `\n- RECOMMENDATION: ✅ Excellent conditions - proceed with prescribed burn`;
        } else if (fw.risk_level.includes('GOOD')) {
          formatted += `\n- RECOMMENDATION: ✅ Good conditions - normal burn protocols`;
        } else if (fw.risk_level.includes('FAIR')) {
          formatted += `\n- RECOMMENDATION: ⚠️ Marginal conditions - experienced crews only`;
        } else if (fw.risk_level.includes('POOR')) {
          formatted += `\n- RECOMMENDATION: ❌ Poor conditions - consider delaying burn`;
        } else {
          formatted += `\n- RECOMMENDATION: ❌ Unsuitable conditions - do not burn`;
        }
      }
    } else if (environmentalData.fireWeather && environmentalData.fireWeather.available === false) {
      formatted += `- Fire weather inputs: **UNAVAILABLE** (${environmentalData.fireWeather.message || 'real service unavailable'})\n`;
    }
    
    // Topographic Data
    if (environmentalData.topography?.data) {
      const topo = environmentalData.topography.data;
      formatted += `\nELEVATION DATA:\n- Elevation: ${topo.elevation_m}m (${topo.elevation_ft}ft)\n`;
    }
    
    // Air Quality Data
    if (environmentalData.measurementsFound !== undefined) {
      formatted += `
AIR QUALITY MONITORING:
- Measurements Found: ${environmentalData.measurementsFound}
- Data Source: ${environmentalData.dataSource || 'Unknown'}
`;
    }
    
    // Routing Decision
    if (environmentalData.routingDecision) {
      formatted += `
DATA ROUTING: Selected '${environmentalData.routingDecision}' data source
`;
    }
    
    return formatted || JSON.stringify(environmentalData, null, 2);
  }

  private updateConversationMemory(userQuery: string, aiResponse: string, spatialAnalysis: any): void {
    this.conversationMemory.push({
      timestamp: new Date().toISOString(),
      userQuery,
      aiResponse,
      spatialContext: spatialAnalysis?.location,
      key_insights: this.extractKeyInsights(aiResponse)
    });

    // Keep only last 10 conversation exchanges
    if (this.conversationMemory.length > 10) {
      this.conversationMemory = this.conversationMemory.slice(-10);
    }
  }

  private extractKeyInsights(response: string): string[] {
    // Simple keyword extraction - in production, would use more sophisticated NLP
    const insights: string[] = [];
    const lowerResponse = response.toLowerCase();
    
    if (lowerResponse.includes('high risk')) insights.push('high_risk_conditions');
    if (lowerResponse.includes('smoke plume')) insights.push('smoke_dispersion_analysis');
    if (lowerResponse.includes('wind')) insights.push('meteorological_factors');
    if (lowerResponse.includes('sensor')) insights.push('sensor_validation');
    
    return insights;
  }

  // Add tool definitions
  private tools = [
      {
          type: 'function',
          function: {
              name: 'get_wind_direction',
              description: 'Get current wind direction and speed for a location to analyze smoke dispersion direction',
              parameters: {
                  type: 'object',
                  properties: {
                      latitude: { type: 'number', description: 'Latitude of the location' },
                      longitude: { type: 'number', description: 'Longitude of the location' }
                  },
                  required: ['latitude', 'longitude']
              }
          }
      },
      {
          type: 'function',
          function: {
              name: 'get_fire_weather_conditions',
              description: 'Get comprehensive fire weather conditions including temperature, humidity, wind speed, fire danger rating, and forecast',
              parameters: {
                  type: 'object',
                  properties: {
                      latitude: { type: 'number', description: 'Latitude of the location' },
                      longitude: { type: 'number', description: 'Longitude of the location' }
                  },
                  required: ['latitude', 'longitude']
              }
          }
      },
      {
          type: 'function',
          function: {
              name: 'get_active_fires',
              description: 'Get active fire detections from NASA FIRMS satellite data',
              parameters: {
                  type: 'object',
                  properties: {
                      latitude: { type: 'number', description: 'Latitude of the location' },
                      longitude: { type: 'number', description: 'Longitude of the location' },
                      radius_km: { type: 'number', description: 'Search radius in kilometers', default: 50 },
                      days_back: { type: 'number', description: 'Number of days back to search', default: 7 }
                  },
                  required: ['latitude', 'longitude']
              }
          }
      },
      {
          type: 'function',
          function: {
              name: 'get_vegetation_fuel_data',
              description: 'Get vegetation and fuel model data from LANDFIRE for fire behavior analysis',
              parameters: {
                  type: 'object',
                  properties: {
                      latitude: { type: 'number', description: 'Latitude of the location' },
                      longitude: { type: 'number', description: 'Longitude of the location' }
                  },
                  required: ['latitude', 'longitude']
              }
          }
      },
      {
          type: 'function',
          function: {
              name: 'get_integrated_wildfire_analysis',
              description: 'Get FAST wildfire analysis with essential data only (completes in <10 seconds) - real LANDFIRE fuel data + weather conditions',
              parameters: {
                  type: 'object',
                  properties: {
                      latitude: { type: 'number', description: 'Latitude of the location' },
                      longitude: { type: 'number', description: 'Longitude of the location' }
                  },
                  required: ['latitude', 'longitude']
              }
          }
      }
  ];

  // Add tool execution handler
  private async executeTool(toolCall: any): Promise<string> {
      console.log('🔧 Raw tool call object:', JSON.stringify(toolCall, null, 2));
      
      // Extract function name and arguments from the correct structure
      const name = toolCall.function?.name || toolCall.name;
      let args;
      
      try {
          // Handle different possible structures
          if (toolCall.function?.arguments) {
              args = typeof toolCall.function.arguments === 'string' 
                  ? JSON.parse(toolCall.function.arguments)
                  : toolCall.function.arguments;
          } else if (toolCall.arguments) {
              args = typeof toolCall.arguments === 'string' 
                  ? JSON.parse(toolCall.arguments)
                  : toolCall.arguments;
          } else {
              throw new Error('No arguments found in tool call');
          }
      } catch (parseError) {
          console.log('❌ Error parsing tool arguments:', parseError);
          return 'Error: Invalid tool arguments format';
      }
      
      console.log(`🔧 Executing tool: ${name} with args:`, args);
      if (name === 'get_wind_direction') {
          try {
              const response = await fetch(`${PYTHON_SERVICE_BASE_URL}/wind/analysis`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                      latitude: args.latitude,
                      longitude: args.longitude
                  }),
                  signal: AbortSignal.timeout(15000)
              });
              const data = await response.json();
              if (data.success) {
                  const result = {
                      wind_speed_ms: data.data.wind_speed_ms,
                      wind_direction_deg: data.data.wind_direction_deg,
                      wind_gusts_ms: data.data.wind_gusts_ms,
                      data_source: data.data.data_source
                  };
                  console.log('✅ Wind data retrieved successfully:', result);
                  return JSON.stringify(result);
              } else {
                  console.log('❌ Wind API error:', data.error);
                  return 'Error fetching wind data: ' + data.error;
              }
          } catch (error) {
              console.log('❌ Wind API exception:', error);
              console.log('❌ Error details:', {
                  message: error.message,
                  name: error.name,
                  stack: error.stack
              });
              return 'Error calling wind API: ' + error.message;
          }
      }
      
      if (name === 'get_fire_weather_conditions') {
          try {
              const response = await fetch(`${PYTHON_SERVICE_BASE_URL}/weather/fire-conditions`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  signal: AbortSignal.timeout(15000),
                  body: JSON.stringify({
                      latitude: args.latitude,
                      longitude: args.longitude
                  })
              });
              const data = await response.json();
              if (data.success && data?.data?.fire_weather) {
                  const weather = data.data.fire_weather;
                  console.log('✅ Fire weather data retrieved successfully');
                  
                  // Handle different response structures gracefully
                  const fireWeatherData = weather?.fire_weather_analysis || weather?.fire_weather || weather;
                  const currentConditions = weather?.current || weather;
                  const fireWeatherIndices = fireWeatherData?.fire_weather_indices || {};
                  
                  return JSON.stringify({
                      current_conditions: {
                          temperature_c: currentConditions?.temperature_2m || currentConditions?.temperature_c,
                          humidity_percent: currentConditions?.relative_humidity_2m || currentConditions?.humidity_percent,
                          wind_speed_ms: currentConditions?.wind_speed_10m || currentConditions?.wind_speed_ms,
                          wind_direction_deg: currentConditions?.wind_direction_10m || currentConditions?.wind_direction_deg,
                          pressure_hpa: currentConditions?.pressure_msl,
                          precipitation_mm: currentConditions?.precipitation
                      },
                      fire_weather: {
                          risk_level: weather?.risk_level ?? fireWeatherData?.fire_danger_rating ?? null,
                          fire_danger_rating: fireWeatherData?.fire_danger_rating ?? null,
                          canadian_fire_weather_index: fireWeatherIndices?.canadian_fire_weather_index ?? null,
                          fosberg_fire_weather_index: fireWeatherIndices?.fosberg_fire_weather_index ?? fireWeatherData?.fosberg_fire_weather_index ?? null
                      },
                      data_source: data.data?.data_source || currentConditions?.data_source || null
                  });
              } else {
                  console.log('❌ Fire weather API error:', data.error);
                  return 'Error fetching fire weather data: ' + (data.error || 'Unknown fire weather service error');
              }
          } catch (error) {
              console.log('❌ Fire weather API exception:', error);
              return 'Error calling fire weather API: ' + error.message;
          }
      }
      
      if (name === 'get_integrated_wildfire_analysis') {
          try {
              const response = await fetch(`${PYTHON_SERVICE_BASE_URL}/fusion/fast-analysis`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                      latitude: args.latitude,
                      longitude: args.longitude
                  }),
                  signal: AbortSignal.timeout(15000)
              });
              const data = await response.json();
              if (data.success) {
                  console.log('🔬 Integrated wildfire analysis completed successfully');
                  return JSON.stringify({
                      scientific_assessment: data.data.scientific_assessment,
                      data_streams: data.data.data_streams,
                      quality_metrics: data.data.quality_metrics,
                      fusion_metadata: data.data.fusion_metadata,
                      location: data.data.location
                  });
              } else {
                  console.log('❌ Integrated analysis API error:', data.error);
                  return 'Error fetching integrated wildfire analysis: ' + data.error;
              }
          } catch (error) {
              console.log('❌ Integrated analysis API exception:', error);
              return 'Error calling integrated analysis API: ' + error.message;
          }
      }
      
      if (name === 'get_active_fires') {
          try {
              const response = await fetch(`${PYTHON_SERVICE_BASE_URL}/nasa-firms/active-fires`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                      latitude: args.latitude,
                      longitude: args.longitude,
                      radius_km: args.radius_km || 50,
                      days_back: args.days_back || 7
                  }),
                  signal: AbortSignal.timeout(15000)
              });
              
              const data = await response.json();
              if (data.success) {
                  console.log('✅ NASA FIRMS fire data retrieved successfully');
                  return JSON.stringify({
                      fire_count: data.data.fire_count,
                      fires: data.data.fires,
                      query_info: data.data.query_info,
                      data_source: data.data.data_source || 'NASA FIRMS VIIRS_SNPP_NRT'
                  });
              } else {
                  console.log('❌ NASA FIRMS API error:', data.error);
                  return 'Error fetching NASA FIRMS data: ' + data.error;
              }
          } catch (error) {
              console.log('❌ NASA FIRMS API exception:', error);
              return 'Error calling NASA FIRMS API: ' + error.message;
          }
      }
      
      if (name === 'get_vegetation_fuel_data') {
          try {
              const response = await fetch(`${PYTHON_SERVICE_BASE_URL}/vegetation/fuel-model`, {
                  method: 'POST',
                  headers: {
                      'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                      latitude: args.latitude,
                      longitude: args.longitude
                  }),
                  signal: AbortSignal.timeout(15000)
              });
              
              const data = await response.json();
              if (data.success) {
                  console.log('✅ Vegetation fuel data retrieved successfully');
                  return JSON.stringify({
                      fuel_model: data.data.fuel_model,
                      vegetation_type: data.data.vegetation_type,
                      fuel_load: data.data.fuel_load,
                      data_source: data.data.data_source || 'LANDFIRE'
                  });
              } else {
                  console.log('❌ Vegetation API error:', data.error);
                  return 'Error fetching vegetation data: ' + data.error;
              }
          } catch (error) {
              console.log('❌ Vegetation API exception:', error);
              return 'Error calling vegetation API: ' + error.message;
          }
      }
      
      return 'Unknown tool';
  }
}

// ============================================================================
// MAIN CHAT PROCESSING FUNCTION
// ============================================================================

/**
 * Enhanced chat processing with WildFire GPT comprehensive algorithm
 */
export async function processWildFireGPTChat(
  message: string,
  conversationHistory: any[] = [],
  providedLocation?: string | { lat: number; lng: number }
): Promise<string> {
  // Short-circuit in local Netlify dev to avoid long external calls
  // Allow local Netlify Dev to hit real external services when FORCE_EXTERNAL=true
  const FORCE_EXTERNAL = process.env.FORCE_EXTERNAL === 'true';
  const IS_LOCAL_NETLIFY = (process.env.CONTEXT === 'dev' || process.env.NETLIFY_DEV === 'true') && !FORCE_EXTERNAL;
  if (IS_LOCAL_NETLIFY) {
    return `🧪 Local dev stub reply: simulated response for "${message}" (external services skipped)`;
  }

  // Set a timeout for the entire processing pipeline (in milliseconds)
  const PROCESSING_TIMEOUT = 120000; // 120 seconds
  
  // Create a timeout promise
  const timeoutPromise = new Promise<never>((_, reject) => 
    setTimeout(() => reject(new Error('Processing timed out after 40 seconds')), PROCESSING_TIMEOUT)
  );
  // SCIENTIFIC INTEGRITY STATUS CHECK
  const MAINTENANCE_MODE = process.env.MAINTENANCE_MODE === 'true';
  const SENSOR_DATA_MIGRATION_PHASE = process.env.SENSOR_DATA_MIGRATION_PHASE || '1';
  
  if (MAINTENANCE_MODE) {
    return `🚨 **SYSTEM MAINTENANCE NOTICE** 🚨

SMeshLLM is temporarily offline for critical updates.

**For emergency situations, please use official NOAA/NWS forecasts and local emergency management resources.**`;
  }

  // Display data connection status for transparency
  const dataStatus = {
    'sensorData': SENSOR_DATA_MIGRATION_PHASE === '3' ? '✅ Unified sensor data' : 
                 SENSOR_DATA_MIGRATION_PHASE === '2' ? '⚠️ Shadow validation mode' : 
                 '✅ Legacy sensor data (uploaded_data + meshtastic_telemetry)',
    'geospatialData': '✅ PostGIS database queries + real elevation data (if service reachable)',
    'environmentalData': '✅ Real-only weather integration (no synthetic fallback)',
    'fireDetection': '✅ Real-only NASA FIRMS integration (no synthetic fallback)',
    'hysplitModels': '✅ Real-only HYSPLIT integration (no synthetic fallback)'
  };
  
  console.log('SmeshLLM Data Status:', dataStatus);

  const algorithm = new WildFireGPTAlgorithm();
  const hasValidProvidedCoordinates =
    typeof providedLocation === 'object' &&
    !!providedLocation &&
    typeof providedLocation.lat === 'number' &&
    typeof providedLocation.lng === 'number';
  
  try {
    // Create a processing promise
    const processingPromise = (async () => {
    // Step 1: Assess query and extract spatial context
    const assessment = await algorithm.assessQuery(message, providedLocation);

    if (!hasValidProvidedCoordinates && assessment.spatialElements.coordinates.length === 0) {
      return buildLocationPromptResponse(message);
    }
    
    // Step 2: Retrieve contextual data based on query needs
    const retrievedData = await algorithm.retrieveContextualData(assessment, message);
    
    // Step 3: Perform spatial reasoning and analysis
    // Convert providedLocation to the expected format if it's a string or object
    let locationCoords: { lat: number; lng: number } | undefined;
    if (typeof providedLocation === 'object' && providedLocation && 'lat' in providedLocation && 'lng' in providedLocation) {
      locationCoords = providedLocation as { lat: number; lng: number };
    }
    const spatialAnalysis = await algorithm.performSpatialReasoning(message, retrievedData, assessment, locationCoords);
    
    // Step 4: Generate context-aware response
    const response = await algorithm.generateContextualResponse(
      message,
      assessment,
      retrievedData,
      spatialAnalysis
    );
    
      return response;
    })();
    
    // Race the processing against the timeout
    return await Promise.race([processingPromise, timeoutPromise]);
    
  } catch (error) {
    console.error('Error in WildFire GPT processing:', error);
    
    // Handle timeout specifically
    if (error instanceof Error && error.message.includes('timed out')) {
      return `⏱️ **Processing Timeout**

I apologize, but the request took too long to process. This can happen with complex queries or when our systems are under heavy load.

Please try:
1. Making your query more specific
2. Asking about a smaller geographic area
3. Trying again in a few minutes

For immediate wildfire or smoke concerns, please check official sources like your local fire department or air quality monitoring stations.`;
    }
    
    // Handle other errors
    return `⚠️ **Error Processing Request**

I encountered an issue while processing your request. As SMeshLLM with WildFire GPT capabilities, I'm designed to provide comprehensive spatial reasoning and physics-informed analysis for wildfire smoke prediction.

Please try rephrasing your question, and I'll assist you with:

- Smoke plume dispersion analysis using HYSPLIT physics models
- Spatial risk assessment and geospatial analysis  
- Real-time sensor data interpretation
- Fire weather and atmospheric conditions
- Evidence-based recommendations from scientific literature

Error details: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
}

// Legacy export for backwards compatibility
export const processSmeshLLMChat = processWildFireGPTChat;

function buildLocationPromptResponse(message: string): string {
  if (isLowSignalMessage(message)) {
    return `Hello, I am SMeshLLM, Stanford University's AI system for wildfire smoke plume prediction and management.

I can help with smoke dispersion, fire weather, active fire detection, air quality, and location-based wildfire risk analysis.

Please send a location to get started, for example:
- "Smoke outlook for Sacramento, CA"
- "Fire risk near 37.44, -122.14"
- "Air quality in Denver today"`;
  }

  return `I need a specific location before I can run spatial analysis.

Please include a city, region, or latitude/longitude in your request, for example:
- "Smoke outlook for Sacramento, CA"
- "Fire weather near Lake Tahoe"
- "Air quality at 37.44, -122.14"`;
}

export class SmeshLLM {
  private supabase;
  private config: SmeshLLMConfig;
  private spatialKnowledgeBase: Map<string, SpatialKnowledge> = new Map();

  constructor(config: SmeshLLMConfig) {
    this.config = config;
    this.supabase = createClient(config.supabaseUrl, config.supabaseKey);
    this.initializeSpatialKnowledge();
  }

  /**
   * Initialize spatial knowledge base with key locations and environmental context
   */
  private async initializeSpatialKnowledge() {
    // Key California wildfire-prone areas with detailed environmental context
    const spatialData: SpatialKnowledge[] = [
      {
        location: { lat: 37.9, lng: -122.3, elevation: 1200, region: "Mount Diablo" },
        environmentalContext: {
          topography: "steep ridges with narrow canyons",
          vegetationType: "dry chaparral and oak woodland",
          dryness: 0.85,
          windPatterns: ["Diablo winds (northeast)", "marine layer influence"]
        },
        historicalData: {
          fireFrequency: 0.3,
          smokePlumes: [],
          seasonalPatterns: { peak: "September-November", lowRisk: "January-March" }
        }
      },
      {
        location: { lat: 34.3, lng: -118.8, elevation: 800, region: "Santa Monica Mountains" },
        environmentalContext: {
          topography: "east-west trending ridges with steep south-facing slopes",
          vegetationType: "chaparral shrubland with some oak groves",
          dryness: 0.78,
          windPatterns: ["Santa Ana winds (northeast)", "sea breeze (southwest)"]
        },
        historicalData: {
          fireFrequency: 0.4,
          smokePlumes: [],
          seasonalPatterns: { peak: "October-December", lowRisk: "February-April" }
        }
      },
      {
        location: { lat: 39.6, lng: -121.6, elevation: 400, region: "Chico foothills" },
        environmentalContext: {
          topography: "rolling hills transitioning to Sierra Nevada foothills",
          vegetationType: "grassland with scattered blue oak",
          dryness: 0.82,
          windPatterns: ["North winds", "upslope/downslope thermal winds"]
        },
        historicalData: {
          fireFrequency: 0.35,
          smokePlumes: [],
          seasonalPatterns: { peak: "July-September", lowRisk: "December-February" }
        }
      },
      {
        location: { lat: 38.2, lng: -122.7, elevation: 600, region: "Pepperridge area" },
        environmentalContext: {
          topography: "dry ridges with rocky outcrops near Sonoma County",
          vegetationType: "dense manzanita and chamise chaparral",
          dryness: 0.88,
          windPatterns: ["offshore winds", "Petaluma gap winds"]
        },
        historicalData: {
          fireFrequency: 0.45,
          smokePlumes: [],
          seasonalPatterns: { peak: "August-October", lowRisk: "January-March" }
        }
      }
    ];

    // Store in knowledge base
    for (const data of spatialData) {
      const key = `${data.location.lat.toFixed(2)},${data.location.lng.toFixed(2)}`;
      this.spatialKnowledgeBase.set(key, data);
    }
  }

  /**
   * Main query interface for SmeshLLM
   */
  async query(queryInput: SmokeAnalysisQuery): Promise<SmeshResponse> {
    try {
      // Step 1: Spatial context retrieval
      const spatialContext = await this.retrieveSpatialContext(queryInput);
      
      // Step 2: Multi-modal data retrieval from Supabase
      const relevantData = await this.retrieveRelevantData(queryInput, spatialContext);
      
      // Step 3: Enhanced knowledge retrieval with spatial awareness
      const enhancedContext = await this.enhanceWithScientificKnowledge(queryInput, spatialContext);
      
      // Step 4: Generate response with spatial intelligence
      const response = await this.generateSpatiallyAwareResponse(
        queryInput, 
        spatialContext, 
        relevantData, 
        enhancedContext
      );
      
      return response;
    } catch (error) {
      console.error('SmeshLLM query error:', error);
      return {
        answer: "I apologize, but I encountered an error analyzing your wildfire smoke query. Please try again or rephrase your question.",
        confidence: 0,
        spatialContext: {} as SpatialKnowledge,
        sources: [],
        actionableInsights: []
      };
    }
  }

  /**
   * Retrieve spatial context for the query location
   */
  private async retrieveSpatialContext(query: SmokeAnalysisQuery): Promise<SpatialKnowledge> {
    if (!query.location) {
      // Default to a central California location if no specific location provided
      query.location = { lat: 37.5, lng: -120.5 };
    }

    // Find nearest spatial knowledge
    let nearestContext: SpatialKnowledge | null = null;
    let minDistance = Infinity;

    for (const [key, knowledge] of this.spatialKnowledgeBase) {
      const distance = this.calculateDistance(
        query.location.lat, query.location.lng,
        knowledge.location.lat, knowledge.location.lng
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestContext = knowledge;
      }
    }

    if (nearestContext && minDistance < this.config.spatialSearchRadius) {
      return nearestContext;
    }

    // Generate spatial context for unknown location
    return this.generateSpatialContext(query.location);
  }

  /**
   * Retrieve relevant sensor and meteorological data
   */
  private async retrieveRelevantData(
    query: SmokeAnalysisQuery, 
    spatialContext: SpatialKnowledge
  ) {
    const { lat, lng } = query.location || spatialContext.location;

    // Spatial bounds for data retrieval
    const bounds = this.calculateSpatialBounds(lat, lng, this.config.spatialSearchRadius);

    try {
      // Get recent sensor readings within spatial bounds
      const { data: sensorData } = await this.supabase
        .from('pi_sensor_raw')
        .select('*')
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      // Get fire detections
      const { data: fireData } = await this.supabase
        .from('fire_detections')
        .select('*')
        .gte('latitude', bounds.south)
        .lte('latitude', bounds.north)
        .gte('longitude', bounds.west)
        .lte('longitude', bounds.east)
        .gte('detection_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('detection_date', { ascending: false });

      // Get meteorological data
      const { data: meteoData } = await this.supabase
        .from('meteorology_grids')
        .select('*')
        .gte('lat', bounds.south)
        .lte('lat', bounds.north)
        .gte('lng', bounds.west)
        .lte('lng', bounds.east)
        .gte('timestamp', new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString())
        .order('timestamp', { ascending: false })
        .limit(50);

      return {
        sensors: sensorData || [],
        fires: fireData || [],
        meteorology: meteoData || []
      };
    } catch (error) {
      console.error('Data retrieval error:', error);
      return { sensors: [], fires: [], meteorology: [] };
    }
  }

  /**
   * Enhance context with scientific knowledge and embeddings
   */
  private async enhanceWithScientificKnowledge(
    query: SmokeAnalysisQuery,
    spatialContext: SpatialKnowledge
  ) {
    // This would integrate with a vector database of scientific literature
    // For now, return structured knowledge based on spatial context
    
    const knowledgeBase = {
      smokeDispersion: {
        factors: [
          "Wind speed and direction",
          "Atmospheric stability",
          "Topographic channeling",
          "Temperature inversions",
          "Fuel type and moisture content"
        ],
        patterns: spatialContext.environmentalContext.windPatterns
      },
      regionalFactors: {
        topography: spatialContext.environmentalContext.topography,
        vegetation: spatialContext.environmentalContext.vegetationType,
        climatology: `Historical fire frequency: ${spatialContext.historicalData.fireFrequency}`
      },
      predictions: {
        likelyDirections: this.predictSmokeDirections(spatialContext),
        riskAreas: this.identifyHighRiskAreas(spatialContext)
      }
    };

    return knowledgeBase;
  }

  /**
   * Generate spatially-aware response using environmental context
   */
  private async generateSpatiallyAwareResponse(
    query: SmokeAnalysisQuery,
    spatialContext: SpatialKnowledge,
    relevantData: any,
    enhancedContext: any
  ): Promise<SmeshResponse> {
    const { sensors, fires, meteorology } = relevantData;
    
    // Analyze current conditions
    const currentConditions = this.analyzeCurrentConditions(sensors, meteorology);
    const fireRisk = this.assessFireRisk(fires, spatialContext, meteorology);
    
    // Generate contextual response based on query type
    let answer = "";
    let actionableInsights: string[] = [];

    switch (query.analysisType) {
      case 'direction':
        answer = this.generateDirectionAnalysis(spatialContext, currentConditions, enhancedContext);
        actionableInsights = this.generateDirectionInsights(spatialContext, currentConditions);
        break;
      
      case 'concentration':
        answer = this.generateConcentrationAnalysis(sensors, spatialContext, currentConditions);
        actionableInsights = this.generateConcentrationInsights(sensors, currentConditions);
        break;
      
      case 'risk':
        answer = this.generateRiskAnalysis(fireRisk, spatialContext, currentConditions);
        actionableInsights = this.generateRiskInsights(fireRisk, spatialContext);
        break;
      
      default:
        answer = this.generateGeneralAnalysis(query, spatialContext, currentConditions, fireRisk);
        actionableInsights = this.generateGeneralInsights(spatialContext, currentConditions);
    }

    return {
      answer,
      confidence: this.calculateConfidence(relevantData, spatialContext),
      spatialContext,
      sources: [
        `${sensors.length} recent sensor readings`,
        `${fires.length} fire detections`,
        `${meteorology.length} meteorological observations`,
        "Local environmental knowledge base"
      ],
      visualizations: {
        plumePredictions: this.generatePlumePredictions(spatialContext, currentConditions)
      },
      actionableInsights
    };
  }

  /**
   * Generate smoke direction analysis
   */
  private generateDirectionAnalysis(
    spatialContext: SpatialKnowledge, 
    conditions: any, 
    enhancedContext: any
  ): string {
    const region = spatialContext.location.region;
    const topography = spatialContext.environmentalContext.topography;
    const windPatterns = spatialContext.environmentalContext.windPatterns;
    
    const currentWind = conditions.windDirection || 'variable';
    const windSpeed = conditions.windSpeed || 'light';

    return `Based on analysis of ${region}, smoke direction is primarily influenced by the local ${topography} and prevailing wind patterns including ${windPatterns.join(' and ')}.

Current conditions show ${currentWind} winds at ${windSpeed} speeds. Given the topographic features, smoke will likely:

1. **Primary Direction**: Follow the dominant wind pattern, with smoke initially moving ${this.predictPrimaryDirection(windPatterns, currentWind)}
2. **Topographic Effects**: The ${topography} will channel smoke through valleys and create updrafts on sunny slopes
3. **Secondary Patterns**: Expect smoke pooling in low-lying areas during temperature inversions, particularly in early morning hours

**Critical Factors for ${region}:**
- Elevation effects at ${spatialContext.location.elevation}ft will influence vertical smoke development
- Local wind patterns create predictable smoke corridors
- Vegetation type (${spatialContext.environmentalContext.vegetationType}) affects initial smoke production intensity`;
  }

  /**
   * Predict primary smoke direction based on wind patterns and topography
   */
  private predictPrimaryDirection(windPatterns: string[], currentWind: string): string {
    // Analyze wind patterns to predict smoke direction
    const directions = windPatterns.map(pattern => {
      if (pattern.includes('northeast') || pattern.includes('Diablo') || pattern.includes('Santa Ana')) {
        return 'southwest toward populated areas';
      } else if (pattern.includes('southwest') || pattern.includes('sea breeze')) {
        return 'northeast toward inland areas';
      } else if (pattern.includes('north')) {
        return 'south following valley drainage';
      } else {
        return 'following local terrain features';
      }
    });
    
    return directions[0] || 'following the prevailing wind direction';
  }

  /**
   * Calculate spatial bounds for data retrieval
   */
  private calculateSpatialBounds(lat: number, lng: number, radiusKm: number) {
    const kmPerDegree = 111.32; // Approximate km per degree at this latitude
    const deltaLat = radiusKm / kmPerDegree;
    const deltaLng = radiusKm / (kmPerDegree * Math.cos(lat * Math.PI / 180));
    
    return {
      north: lat + deltaLat,
      south: lat - deltaLat,
      east: lng + deltaLng,
      west: lng - deltaLng
    };
  }

  /**
   * Calculate distance between two points using Haversine formula
   */
  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Generate spatial context for unknown locations
   */
  private async generateSpatialContext(location: { lat: number; lng: number }): Promise<SpatialKnowledge> {
    // This would typically involve API calls to get topography, vegetation, etc.
    // For now, return a generic context
    return {
      location: { ...location, region: "Unknown region" },
      environmentalContext: {
        topography: "varied terrain",
        vegetationType: "mixed vegetation",
        dryness: 0.7,
        windPatterns: ["local winds"]
      },
      historicalData: {
        fireFrequency: 0.2,
        smokePlumes: [],
        seasonalPatterns: {}
      }
    };
  }

  /**
   * Analyze current environmental conditions
   */
  private analyzeCurrentConditions(sensors: PiSensorReading[], meteorology: MeteorologicalData[]) {
    if (!sensors.length && !meteorology.length) {
      return { windDirection: 'unknown', windSpeed: 'unknown', temperature: 'unknown' };
    }

    // Calculate averages from recent data
    const avgTemp = sensors.length > 0 
      ? sensors.reduce((sum, s) => sum + (s.temperature || 20), 0) / sensors.length
      : 20;

    const avgHumidity = sensors.length > 0
      ? sensors.reduce((sum, s) => sum + (s.humidity || 50), 0) / sensors.length
      : 50;

    // Determine wind conditions from meteorological data
    const recentMeteo = meteorology[0];
    const windDirection = recentMeteo?.wind_direction || 'variable';
    const windSpeed = recentMeteo?.wind_speed || 'light';

    return {
      temperature: avgTemp,
      humidity: avgHumidity,
      windDirection,
      windSpeed,
      conditions: avgHumidity < 30 ? 'dry' : avgHumidity > 70 ? 'humid' : 'moderate'
    };
  }

  /**
   * Assess fire risk based on current conditions
   */
  private assessFireRisk(fires: FireDetection[], spatialContext: SpatialKnowledge, meteorology: MeteorologicalData[]) {
    const activeFires = fires.filter(f => 
      new Date(f.detection_date) > new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    const riskFactors = {
      activeFires: activeFires.length,
      dryness: spatialContext.environmentalContext.dryness,
      historicalFrequency: spatialContext.historicalData.fireFrequency,
      currentWeather: meteorology.length > 0 ? 'monitored' : 'unknown'
    };

    const riskLevel = activeFires.length > 0 ? 'HIGH' : 
                     riskFactors.dryness > 0.8 ? 'ELEVATED' : 'MODERATE';

    return { level: riskLevel, factors: riskFactors, activeFires };
  }

  /**
   * Generate direction-specific insights
   */
  private generateDirectionInsights(spatialContext: SpatialKnowledge, conditions: any): string[] {
    const insights = [
      `Monitor ${spatialContext.location.region} for changing wind patterns`,
      `Smoke will likely follow ${spatialContext.environmentalContext.topography} features`,
    ];

    if (conditions.windSpeed === 'high') {
      insights.push("High winds will cause rapid smoke dispersal but may spread fire");
    }

    if (conditions.humidity < 30) {
      insights.push("Low humidity increases fire risk and smoke production");
    }

    return insights;
  }

  /**
   * Predict smoke directions based on environmental factors
   */
  private predictSmokeDirections(spatialContext: SpatialKnowledge): string[] {
    return spatialContext.environmentalContext.windPatterns.map(pattern => {
      if (pattern.includes('northeast')) return 'Southwest corridors';
      if (pattern.includes('southwest')) return 'Northeast valleys';
      if (pattern.includes('north')) return 'South-facing slopes';
      return 'Variable based on local conditions';
    });
  }

  /**
   * Identify high-risk areas based on spatial context
   */
  private identifyHighRiskAreas(spatialContext: SpatialKnowledge): string[] {
    const areas = [];
    
    if (spatialContext.environmentalContext.dryness > 0.8) {
      areas.push(`Dry ${spatialContext.environmentalContext.vegetationType} areas`);
    }
    
    if (spatialContext.environmentalContext.topography.includes('steep')) {
      areas.push('Steep south-facing slopes');
    }
    
    if (spatialContext.historicalData.fireFrequency > 0.3) {
      areas.push('Areas with high historical fire frequency');
    }
    
    return areas;
  }

  /**
   * Generate concentration analysis
   */
  private generateConcentrationAnalysis(
    sensors: PiSensorReading[], 
    spatialContext: SpatialKnowledge, 
    conditions: any
  ): string {
    if (sensors.length === 0) {
      return `No recent sensor data available for ${spatialContext.location.region}. Smoke concentration analysis requires real-time particulate matter measurements.`;
    }

    const avgPM25 = sensors.reduce((sum, s) => sum + (s.pm25_concentration || 0), 0) / sensors.length;
    const maxPM25 = Math.max(...sensors.map(s => s.pm25_concentration || 0));
    
    const aqiLevel = avgPM25 < 12 ? 'Good' : avgPM25 < 35 ? 'Moderate' : avgPM25 < 55 ? 'Unhealthy for Sensitive Groups' : 'Unhealthy';
    
    return `Current smoke concentration analysis for ${spatialContext.location.region}:

**PM2.5 Levels**: Average ${avgPM25.toFixed(1)} μg/m³ (Peak: ${maxPM25.toFixed(1)} μg/m³)
**Air Quality**: ${aqiLevel}

**Concentration Patterns**:
- Highest concentrations detected ${this.findHighestConcentrationArea(sensors)}
- Atmospheric conditions (${conditions.conditions}) are ${conditions.humidity < 30 ? 'promoting' : 'limiting'} smoke dispersion
- Topography (${spatialContext.environmentalContext.topography}) creating channeling effects

**Health Impact Zone**: Areas within ${this.calculateHealthImpactRadius(avgPM25)}km radius experiencing elevated particulate levels`;
  }

  /**
   * Generate other helper methods for analysis
   */
  private generateConcentrationInsights(sensors: PiSensorReading[], conditions: any): string[] {
    const insights = [];
    
    const avgPM25 = sensors.length > 0 
      ? sensors.reduce((sum, s) => sum + (s.pm25_concentration || 0), 0) / sensors.length 
      : 0;

    if (avgPM25 > 35) {
      insights.push("Air quality unhealthy for sensitive groups - recommend limiting outdoor activities");
    }
    
    if (conditions.humidity < 30) {
      insights.push("Low humidity will maintain high particulate concentrations");
    }
    
    insights.push("Monitor sensor network for concentration hotspots");
    
    return insights;
  }

  private generateRiskAnalysis(fireRisk: any, spatialContext: SpatialKnowledge, conditions: any): string {
    return `Fire and smoke risk assessment for ${spatialContext.location.region}:

**Current Risk Level**: ${fireRisk.level}
**Active Fires**: ${fireRisk.activeFires.length} detected in the area
**Environmental Dryness**: ${(spatialContext.environmentalContext.dryness * 100).toFixed(0)}%

**Risk Factors**:
- Historical fire frequency: ${(spatialContext.historicalData.fireFrequency * 100).toFixed(0)}% annual probability
- Current weather conditions favor ${conditions.humidity < 30 ? 'fire spread' : 'fire suppression'}
- Vegetation type (${spatialContext.environmentalContext.vegetationType}) provides ${spatialContext.environmentalContext.dryness > 0.8 ? 'high' : 'moderate'} fuel load`;
  }

  private generateRiskInsights(fireRisk: any, spatialContext: SpatialKnowledge): string[] {
    const insights = [];
    
    if (fireRisk.level === 'HIGH') {
      insights.push("Immediate evacuation planning may be necessary");
      insights.push("Monitor emergency communication channels");
    }
    
    if (spatialContext.environmentalContext.dryness > 0.8) {
      insights.push("Extreme fire weather conditions - avoid outdoor burning");
    }
    
    insights.push(`Focus protection efforts on ${spatialContext.location.region} high-value areas`);
    
    return insights;
  }

  private generateGeneralAnalysis(
    query: SmokeAnalysisQuery, 
    spatialContext: SpatialKnowledge, 
    conditions: any, 
    fireRisk: any
  ): string {
    return `Comprehensive wildfire smoke analysis for ${spatialContext.location.region}:

**Current Situation**: ${fireRisk.level} risk level with ${conditions.conditions} atmospheric conditions
**Spatial Context**: ${spatialContext.environmentalContext.topography} terrain affecting smoke movement
**Wind Patterns**: ${spatialContext.environmentalContext.windPatterns.join(', ')}

**Key Environmental Factors**:
- Elevation: ${spatialContext.location.elevation || 'unknown'}ft affecting vertical smoke development  
- Vegetation: ${spatialContext.environmentalContext.vegetationType}
- Dryness index: ${(spatialContext.environmentalContext.dryness * 100).toFixed(0)}%

This analysis integrates real-time sensor data, meteorological observations, and local environmental knowledge to provide spatially-aware insights for ${spatialContext.location.region}.`;
  }

  private generateGeneralInsights(spatialContext: SpatialKnowledge, conditions: any): string[] {
    return [
      `Monitor conditions in ${spatialContext.location.region} for rapid changes`,
      "Stay informed through local emergency management channels",
      "Review evacuation routes and emergency supplies",
      `Pay attention to ${spatialContext.environmentalContext.windPatterns[0]} wind shifts`
    ];
  }

  private calculateConfidence(relevantData: any, spatialContext: SpatialKnowledge): number {
    let confidence = 0.5; // Base confidence
    
    // Increase confidence based on data availability
    if (relevantData.sensors.length > 10) confidence += 0.2;
    if (relevantData.meteorology.length > 5) confidence += 0.2;
    if (relevantData.fires.length > 0) confidence += 0.1;
    
    // Spatial knowledge confidence
    if (spatialContext.location.region !== "Unknown region") confidence += 0.1;
    
    return Math.min(confidence, 0.95);
  }

  private generatePlumePredictions(spatialContext: SpatialKnowledge, conditions: any): PlumePrediction[] {
    // This would integrate with HYSPLIT or similar models
    // For now, return basic predictions based on spatial analysis
    return [{
      prediction_id: Date.now().toString(),
      fire_id: 'current',
      predicted_at: new Date(),
      prediction_horizon_hours: 24,
      plume_geometry: `Following ${spatialContext.environmentalContext.windPatterns[0]}`,
      smoke_concentration_mg_m3: conditions.humidity < 30 ? 150 : 75,
      confidence_score: this.calculateConfidence({ sensors: [], meteorology: [], fires: [] }, spatialContext),
      weather_conditions: conditions,
      model_version: 'SmeshLLM-1.0'
    }];
  }

  private findHighestConcentrationArea(sensors: PiSensorReading[]): string {
    if (sensors.length === 0) return "unknown location";
    
    const maxSensor = sensors.reduce((max, sensor) => 
      (sensor.pm25_concentration || 0) > (max.pm25_concentration || 0) ? sensor : max
    );
    
    return `near coordinates ${maxSensor.lat?.toFixed(3)}, ${maxSensor.lng?.toFixed(3)}`;
  }

  private calculateHealthImpactRadius(pm25: number): number {
    // Calculate impact radius based on concentration
    if (pm25 > 55) return 10; // Unhealthy - larger radius
    if (pm25 > 35) return 5;  // Unhealthy for sensitive groups
    return 2; // Moderate impact
  }
}
