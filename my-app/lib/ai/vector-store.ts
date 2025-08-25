// Vector Store Service for SmeshLLM RAG System
import { createClient } from '@supabase/supabase-js';

export interface EmbeddingDocument {
  id: string;
  content: string;
  metadata: {
    type: 'research_paper' | 'sensor_data' | 'fire_report' | 'weather_data' | 'spatial_knowledge';
    location?: { lat: number; lng: number };
    timestamp?: Date;
    source: string;
  };
  embedding: number[];
}

export interface SearchResult {
  document: EmbeddingDocument;
  similarity: number;
}

export class VectorStore {
  private supabase;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Generate embeddings using OpenAI API
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: text,
          model: 'text-embedding-3-small'
        }),
      });

      const data = await response.json();
      return data.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      return [];
    }
  }

  /**
   * Store document with embedding in Supabase
   */
  async storeDocument(document: Omit<EmbeddingDocument, 'embedding'>): Promise<void> {
    try {
      const embedding = await this.generateEmbedding(document.content);
      
      const { error } = await this.supabase
        .from('knowledge_embeddings')
        .insert({
          ...document,
          embedding
        });

      if (error) throw error;
    } catch (error) {
      console.error('Error storing document:', error);
    }
  }

  /**
   * Semantic search using vector similarity
   */
  async semanticSearch(query: string, limit: number = 5, filters?: {
    type?: string;
    location?: { lat: number; lng: number; radius: number };
  }): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.generateEmbedding(query);
      
      let rpcQuery = this.supabase
        .rpc('match_documents', {
          query_embedding: queryEmbedding,
          match_threshold: 0.7,
          match_count: limit
        });

      // Apply filters if provided
      if (filters?.type) {
        rpcQuery = rpcQuery.eq('metadata->type', filters.type);
      }

      const { data, error } = await rpcQuery;
      
      if (error) throw error;

      return data?.map((doc: any) => ({
        document: doc,
        similarity: doc.similarity
      })) || [];
    } catch (error) {
      console.error('Error in semantic search:', error);
      return [];
    }
  }

  /**
   * Hybrid search combining semantic and keyword search
   */
  async hybridSearch(query: string, limit: number = 10): Promise<SearchResult[]> {
    try {
      // Get semantic results
      const semanticResults = await this.semanticSearch(query, Math.ceil(limit * 0.7));
      
      // Get keyword results using full-text search
      const { data: keywordResults } = await this.supabase
        .from('knowledge_embeddings')
        .select('*')
        .textSearch('content', query)
        .limit(Math.ceil(limit * 0.3));

      // Combine and deduplicate results
      const combinedResults = [...semanticResults];
      
      keywordResults?.forEach(doc => {
        const exists = combinedResults.find(r => r.document.id === doc.id);
        if (!exists) {
          combinedResults.push({
            document: doc,
            similarity: 0.6 // Default similarity for keyword matches
          });
        }
      });

      return combinedResults
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, limit);
    } catch (error) {
      console.error('Error in hybrid search:', error);
      return [];
    }
  }

  /**
   * Spatial-aware search for location-based queries
   */
  async spatialSearch(
    query: string, 
    location: { lat: number; lng: number }, 
    radiusKm: number = 50,
    limit: number = 5
  ): Promise<SearchResult[]> {
    try {
      const queryEmbedding = await this.generateEmbedding(query);
      
      const { data, error } = await this.supabase
        .rpc('match_documents_spatial', {
          query_embedding: queryEmbedding,
          center_lat: location.lat,
          center_lng: location.lng,
          radius_km: radiusKm,
          match_threshold: 0.65,
          match_count: limit
        });

      if (error) throw error;

      return data?.map((doc: any) => ({
        document: doc,
        similarity: doc.similarity
      })) || [];
    } catch (error) {
      console.error('Error in spatial search:', error);
      return [];
    }
  }
} 