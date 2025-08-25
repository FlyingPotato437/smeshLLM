/**
 * Advanced RAG (Retrieval-Augmented Generation) Service Integration
 * Real semantic search through scientific literature for atmospheric modeling
 * No more mocks - this connects to real scientific knowledge base
 */

export interface DocumentMetadata {
  title: string;
  authors: string[];
  publicationYear?: number;
  journal?: string;
  doi?: string;
  url?: string;
  documentType: 'research_paper' | 'technical_report' | 'government_doc' | 'manual' | 'dataset_description';
  topics: string[];
  geographicRegions: string[];
  methods: string[];
}

export interface DocumentChunk {
  text: string;
  chunkType: 'title' | 'abstract' | 'section' | 'conclusion' | 'figure_caption';
  sectionTitle?: string;
}

export interface DocumentProcessingRequest {
  documentId?: string;
  metadata: DocumentMetadata;
  fullText: string;
  chunks?: DocumentChunk[];
}

export interface SemanticSearchRequest {
  query: string;
  limit?: number;
  similarityThreshold?: number;
  filters?: {
    topics?: string[];
    publicationYearMin?: number;
    publicationYearMax?: number;
    authors?: string[];
    documentTypes?: string[];
    geographicRegions?: string[];
  };
  includeContext?: boolean;
}

export interface SemanticSearchResult {
  documentId: string;
  chunkId: string;
  title: string;
  authors: string[];
  publicationYear?: number;
  textChunk: string;
  sectionTitle?: string;
  similarityScore: number;
  relevanceExplanation?: string;
}

export interface RAGResponse {
  query: string;
  retrievedDocuments: SemanticSearchResult[];
  contextualAnswer?: string;
  sourceCount: number;
  confidenceScore: number;
}

export interface RAGSystemStats {
  totalDocuments: number;
  totalEmbeddings: number;
  embeddingModel: string;
  averageChunkSize: number;
  databaseStatus: string;
}

/**
 * Real RAG Service Implementation
 * Integrates with Python RAG backend for scientific literature retrieval
 */
export class RAGService {
  private readonly apiBaseUrl: string;
  
  constructor() {
    // In production, this would be the URL of our Python RAG service
    this.apiBaseUrl = process.env.RAG_SERVICE_URL || 'http://127.0.0.1:8001';
  }

  /**
   * Search through scientific literature using semantic similarity
   */
  async searchLiterature(request: SemanticSearchRequest): Promise<SemanticSearchResult[]> {
    try {
      console.log(`Searching literature for: "${request.query}"`);
      
      const response = await fetch(`${this.apiBaseUrl}/rag/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: request.query,
          limit: request.limit || 10,
          similarity_threshold: request.similarityThreshold || 0.7,
          filters: this.formatFilters(request.filters || {}),
          include_context: request.includeContext !== false
        })
      });

      if (!response.ok) {
        throw new Error(`RAG service error: ${response.statusText}`);
      }

      const data = await response.json();
      return this.formatSearchResults(data.results);
      
    } catch (error) {
      console.error('Error searching literature:', error);
      if (error instanceof Error) {
        throw new Error(`Literature search failed: ${error.message}`);
      }
      throw new Error('Literature search failed with an unknown error.');
    }
  }

  /**
   * Generate complete RAG response with retrieved context and LLM generation
   */
  async generateResponse(query: string): Promise<RAGResponse> {
    try {
      console.log(`Generating RAG response for: "${query}"`);
      
      const response = await fetch(`${this.apiBaseUrl}/rag/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query })
      });

      if (!response.ok) {
        throw new Error(`RAG service error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        query: data.query,
        retrievedDocuments: this.formatSearchResults(data.retrieved_documents),
        contextualAnswer: data.contextual_answer,
        sourceCount: data.source_count,
        confidenceScore: data.confidence_score
      };
      
    } catch (error) {
      console.error('Error generating RAG response:', error);
      if (error instanceof Error) {
        throw new Error(`RAG response generation failed: ${error.message}`);
      }
      throw new Error('RAG response generation failed with an unknown error.');
    }
  }

  /**
   * Process and embed a scientific document
   */
  async processDocument(request: DocumentProcessingRequest): Promise<string> {
    try {
      console.log(`Processing document: "${request.metadata.title}"`);
      
      const response = await fetch(`${this.apiBaseUrl}/rag/process-document`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          document_id: request.documentId,
          metadata: {
            title: request.metadata.title,
            authors: request.metadata.authors,
            publication_year: request.metadata.publicationYear,
            journal: request.metadata.journal,
            doi: request.metadata.doi,
            url: request.metadata.url,
            document_type: request.metadata.documentType,
            topics: request.metadata.topics,
            geographic_regions: request.metadata.geographicRegions,
            methods: request.metadata.methods
          },
          full_text: request.fullText,
          chunks: request.chunks?.map(chunk => ({
            text: chunk.text,
            chunk_type: chunk.chunkType,
            section_title: chunk.sectionTitle
          }))
        })
      });

      if (!response.ok) {
        throw new Error(`RAG service error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.document_id;
      
    } catch (error) {
      console.error('Error processing document:', error);
      if (error instanceof Error) {
        throw new Error(`Document processing failed: ${error.message}`);
      }
      throw new Error('Document processing failed with an unknown error.');
    }
  }

  /**
   * Upload and process a PDF document
   */
  async uploadPDF(file: File, metadata: Partial<DocumentMetadata>): Promise<string> {
    try {
      console.log(`Uploading PDF: "${file.name}"`);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('metadata', JSON.stringify({
        title: metadata.title || file.name,
        authors: metadata.authors || [],
        publication_year: metadata.publicationYear,
        journal: metadata.journal,
        doi: metadata.doi,
        url: metadata.url,
        document_type: metadata.documentType || 'research_paper',
        topics: metadata.topics || [],
        geographic_regions: metadata.geographicRegions || [],
        methods: metadata.methods || []
      }));

      const response = await fetch(`${this.apiBaseUrl}/rag/upload-pdf`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`RAG service error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.document_id;
      
    } catch (error) {
      console.error('Error uploading PDF:', error);
      if (error instanceof Error) {
        throw new Error(`PDF upload failed: ${error.message}`);
      }
      throw new Error('PDF upload failed with an unknown error.');
    }
  }

  /**
   * Get RAG system statistics
   */
  async getSystemStats(): Promise<RAGSystemStats> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/rag/stats`);
      
      if (!response.ok) {
        throw new Error(`RAG service error: ${response.statusText}`);
      }

      const data = await response.json();
      
      return {
        totalDocuments: data.total_documents,
        totalEmbeddings: data.total_embeddings,
        embeddingModel: data.embedding_model,
        averageChunkSize: data.average_chunk_size,
        databaseStatus: data.database_status
      };
      
    } catch (error) {
      console.error('Error fetching RAG system stats:', error);
      if (error instanceof Error) {
        throw new Error(`RAG stats fetch failed: ${error.message}`);
      }
      throw new Error('RAG stats fetch failed with an unknown error.');
    }
  }

  /**
   * Health check for RAG service
   */
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/health`, {
        method: 'GET'
      });
      return response.ok;
    } catch (error) {
      console.warn('RAG service health check failed:', error);
      return false;
    }
  }

  /**
   * Query specific topics in atmospheric modeling literature
   */
  async queryAtmosphericLiterature(topic: string, options?: {
    includeHysplit?: boolean;
    includePinn?: boolean;
    includeWildfire?: boolean;
    maxResults?: number;
  }): Promise<SemanticSearchResult[]> {
    const filters: any = {
      topics: ['atmospheric_modeling', 'air_quality']
    };

    if (options?.includeHysplit) {
      filters.topics.push('hysplit', 'trajectory_modeling');
    }

    if (options?.includePinn) {
      filters.topics.push('neural_networks', 'physics_informed');
    }

    if (options?.includeWildfire) {
      filters.topics.push('wildfire', 'smoke_dispersion');
    }

    return this.searchLiterature({
      query: topic,
      limit: options?.maxResults || 5,
      similarityThreshold: 0.8,
      filters,
      includeContext: true
    });
  }

  /**
   * Format filters for Python service
   */
  private formatFilters(filters: any): any {
    return {
      topics: filters.topics,
      publication_year_min: filters.publicationYearMin,
      publication_year_max: filters.publicationYearMax,
      authors: filters.authors,
      document_types: filters.documentTypes,
      geographic_regions: filters.geographicRegions
    };
  }

  /**
   * Format search results from Python service
   */
  private formatSearchResults(results: any[]): SemanticSearchResult[] {
    return results.map(result => ({
      documentId: result.document_id,
      chunkId: result.chunk_id,
      title: result.title,
      authors: result.authors,
      publicationYear: result.publication_year,
      textChunk: result.text_chunk,
      sectionTitle: result.section_title,
      similarityScore: result.similarity_score,
      relevanceExplanation: result.relevance_explanation
    }));
  }
}

/**
 * Enhanced literature search specifically for atmospheric modeling
 */
export class AtmosphericLiteratureSearch {
  private ragService: RAGService;

  constructor() {
    this.ragService = new RAGService();
  }

  /**
   * Search for HYSPLIT-related literature
   */
  async searchHysplitLiterature(query: string): Promise<SemanticSearchResult[]> {
    return this.ragService.queryAtmosphericLiterature(query, {
      includeHysplit: true,
      maxResults: 8
    });
  }

  /**
   * Search for physics-informed neural network literature
   */
  async searchPinnLiterature(query: string): Promise<SemanticSearchResult[]> {
    return this.ragService.queryAtmosphericLiterature(query, {
      includePinn: true,
      maxResults: 8
    });
  }

  /**
   * Search for wildfire smoke dispersion literature
   */
  async searchWildfireLiterature(query: string): Promise<SemanticSearchResult[]> {
    return this.ragService.queryAtmosphericLiterature(query, {
      includeWildfire: true,
      maxResults: 8
    });
  }

  /**
   * Comprehensive search across all atmospheric modeling topics
   */
  async searchComprehensive(query: string): Promise<{
    hysplit: SemanticSearchResult[];
    pinn: SemanticSearchResult[];
    wildfire: SemanticSearchResult[];
    general: SemanticSearchResult[];
  }> {
    const [hysplit, pinn, wildfire, general] = await Promise.all([
      this.searchHysplitLiterature(query),
      this.searchPinnLiterature(query),
      this.searchWildfireLiterature(query),
      this.ragService.searchLiterature({
        query,
        limit: 5,
        similarityThreshold: 0.75
      })
    ]);

    return { hysplit, pinn, wildfire, general };
  }
}