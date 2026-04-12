/**
 * Hybrid RAG Service Client for Air Quality Analysis
 * Connects to the real hybrid RAG service with DuckDB sensor data + scientific literature
 */

export interface HybridRAGRequest {
  query: string;
  include_sensor_data?: boolean;
  include_literature?: boolean;
  spatial_context?: {
    latitude?: number;
    longitude?: number;
    radius_km?: number;
  };
}

export interface HybridRAGResponse {
  query: string;
  sensor_data_results?: string;
  literature_results?: string[];
  synthesized_answer: string;
  sources_used: string[];
  confidence_score?: number;
}

export interface ProcessedHybridData {
  sensorData: any[];
  literatureAnalysis: any[];
  synthesizedInsights: string;
  rawResponse: HybridRAGResponse;
  dataQuality: 'high' | 'medium' | 'low';
}

export class HybridRAGServiceClient {
  private baseUrl: string;
  private timeout: number;

  constructor() {
    this.baseUrl =
      process.env.HYBRID_RAG_SERVICE_URL ||
      process.env.PYTHON_SERVICE_URL ||
      'http://127.0.0.1:8000';
    this.timeout = 8000; // 8 second timeout for complex queries
  }

  /**
   * Query the hybrid RAG service for air quality analysis
   */
  async queryAirQuality(request: HybridRAGRequest): Promise<ProcessedHybridData | null> {
    try {
      console.log('🔗 HYBRID RAG: Calling real service for air quality analysis');
      console.log(`📍 Query: "${request.query.substring(0, 100)}..."`);
      
      const response = await fetch(`${this.baseUrl}/hybrid-rag/query`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query: request.query,
          include_sensor_data: request.include_sensor_data ?? true,
          include_literature: request.include_literature ?? true
        }),
        signal: AbortSignal.timeout(this.timeout)
      });

      if (!response.ok) {
        console.error(`❌ Hybrid RAG service returned error: ${response.status} ${response.statusText}`);
        return null;
      }

      const data: HybridRAGResponse = await response.json();
      
      // Process the response into the format expected by WildFireGPTAlgorithm
      return this.processHybridResponse(data);
      
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        console.error('⏰ Hybrid RAG service timeout - complex analysis taking too long');
      } else if (error instanceof Error && error.name === 'AbortError') {
        console.error('🚫 Hybrid RAG service request aborted');
      } else {
        console.error('❌ Failed to connect to hybrid RAG service:', error);
      }
      return null;
    }
  }

  /**
   * Check if the hybrid RAG service is available
   */
  async isServiceAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000) // 5 second timeout for health check
      });
      
      if (response.ok) {
        const health = await response.json();
        console.log(`✅ Hybrid RAG service healthy - Phase: ${health.implementation_phase}`);
        return health.router_available && health.duckdb_available;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Hybrid RAG service health check failed:', error);
      return false;
    }
  }

  /**
   * Process the hybrid RAG response into structured data for WildFireGPTAlgorithm
   */
  private processHybridResponse(response: HybridRAGResponse): ProcessedHybridData {
    // Extract sensor data from the structured response
    const sensorData = this.extractSensorData(response.sensor_data_results);
    
    // Extract literature insights
    const literatureAnalysis = this.extractLiteratureAnalysis(response.literature_results);
    
    // Determine data quality based on sources and completeness
    const dataQuality = this.assessDataQuality(response);
    
    return {
      sensorData,
      literatureAnalysis,
      synthesizedInsights: response.synthesized_answer,
      rawResponse: response,
      dataQuality
    };
  }

  /**
   * Extract structured sensor data from the markdown table response
   */
  private extractSensorData(sensorResults?: string): any[] {
    if (!sensorResults) return [];
    
    try {
      // Parse the markdown table to extract structured data
      const lines = sensorResults.split('\n').filter(line => line.trim());
      const dataLines = lines.filter(line => line.includes('|') && !line.includes('-----'));
      
      const sensorData: any = {};
      
      for (const line of dataLines) {
        const cells = line.split('|').map(cell => cell.trim()).filter(cell => cell);
        if (cells.length >= 2) {
          const [key, value] = cells;
          
          // Extract numeric values where possible
          if (key.includes('Value') && value.includes('µg/m³')) {
            const numericValue = parseFloat(value.match(/[\d.]+/)?.[0] || '0');
            sensorData.pm25_concentration = numericValue;
            sensorData.unit = 'µg/m³';
          } else if (key.includes('Location')) {
            sensorData.location = value;
          } else if (key.includes('Parameter')) {
            sensorData.parameter = value.toLowerCase();
          } else if (key.includes('Measurements')) {
            sensorData.measurement_count = parseInt(value.match(/\d+/)?.[0] || '0');
          }
        }
      }
      
      return [sensorData]; // Return as array for consistency
      
    } catch (error) {
      console.error('Error parsing sensor data:', error);
      return [];
    }
  }

  /**
   * Extract structured literature analysis
   */
  private extractLiteratureAnalysis(literatureResults?: string[]): any[] {
    if (!literatureResults || literatureResults.length === 0) return [];
    
    return literatureResults.map((result, index) => ({
      id: `lit_${index}`,
      content: result,
      source: 'hybrid_rag_literature',
      relevance_score: 0.8 // Default high relevance since it's from targeted search
    }));
  }

  /**
   * Assess the quality of the hybrid RAG response
   */
  private assessDataQuality(response: HybridRAGResponse): 'high' | 'medium' | 'low' {
    let qualityScore = 0;
    
    // Check if we have sensor data
    if (response.sensor_data_results && response.sensor_data_results.includes('Real sensor data')) {
      qualityScore += 3;
    }
    
    // Check if we have literature results
    if (response.literature_results && response.literature_results.length > 0) {
      qualityScore += 2;
    }
    
    // Check if synthesis was successful
    if (response.synthesized_answer && response.synthesized_answer.length > 100) {
      qualityScore += 2;
    }
    
    // Check sources used
    if (response.sources_used && response.sources_used.includes('sensor_data')) {
      qualityScore += 1;
    }
    
    if (qualityScore >= 6) return 'high';
    if (qualityScore >= 3) return 'medium';
    return 'low';
  }
}

// Singleton instance for use throughout the application
export const hybridRAGClient = new HybridRAGServiceClient();
