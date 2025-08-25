// Chat Interface for SmeshLLM System
import { SmeshLLM, SmokeAnalysisQuery, SmeshResponse } from './smesh-llm';
import { VectorStore, SearchResult } from './vector-store';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    location?: { lat: number; lng: number };
    searchResults?: SearchResult[];
    confidence?: number;
  };
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  context: {
    location?: { lat: number; lng: number };
    activeRegion?: string;
  };
}

export class SmeshChatInterface {
  private smeshLLM: SmeshLLM;
  private vectorStore: VectorStore;
  private sessions: Map<string, ChatSession> = new Map();

  constructor(config: {
    supabaseUrl: string;
    supabaseKey: string;
    openaiApiKey: string;
  }) {
    this.smeshLLM = new SmeshLLM({
      supabaseUrl: config.supabaseUrl,
      supabaseKey: config.supabaseKey,
      openaiApiKey: config.openaiApiKey,
      spatialSearchRadius: 50,
      maxRetrieval: 10,
      confidenceThreshold: 0.7
    });
    
    this.vectorStore = new VectorStore(config.supabaseUrl, config.supabaseKey);
  }

  /**
   * Create a new chat session
   */
  createSession(location?: { lat: number; lng: number }): string {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    this.sessions.set(sessionId, {
      id: sessionId,
      messages: [],
      context: { location }
    });

    return sessionId;
  }

  /**
   * Process user query and generate response
   */
  async processMessage(
    sessionId: string, 
    userMessage: string,
    location?: { lat: number; lng: number }
  ): Promise<ChatMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Add user message to session
    const userChatMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: userMessage,
      timestamp: new Date(),
      metadata: { location }
    };
    session.messages.push(userChatMessage);

    try {
      // Determine query type based on user message
      const analysisType = this.determineAnalysisType(userMessage);
      
      // Enhanced RAG retrieval
      const searchResults = await this.performEnhancedRetrieval(
        userMessage, 
        location || session.context.location
      );

      // Create SmeshLLM query
      const smeshQuery: SmokeAnalysisQuery = {
        query: userMessage,
        location: location || session.context.location,
        analysisType
      };

      // Get SmeshLLM response
      const smeshResponse = await this.smeshLLM.query(smeshQuery);

      // Enhance response with RAG context
      const enhancedResponse = await this.enhanceResponseWithRAG(
        smeshResponse, 
        searchResults, 
        userMessage
      );

      // Create assistant message
      const assistantMessage: ChatMessage = {
        id: `msg_${Date.now()}_assistant`,
        role: 'assistant',
        content: enhancedResponse,
        timestamp: new Date(),
        metadata: {
          location: smeshResponse.spatialContext.location,
          searchResults,
          confidence: smeshResponse.confidence
        }
      };

      session.messages.push(assistantMessage);
      return assistantMessage;

    } catch (error) {
      console.error('Error processing message:', error);
      
      const errorMessage: ChatMessage = {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: "I apologize, but I'm having trouble analyzing your wildfire smoke query right now. Please try rephrasing your question or check back in a moment.",
        timestamp: new Date()
      };
      
      session.messages.push(errorMessage);
      return errorMessage;
    }
  }

  /**
   * Determine analysis type from user message
   */
  private determineAnalysisType(message: string): 'direction' | 'concentration' | 'risk' | 'general' {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('direction') || lowerMessage.includes('which way') || 
        lowerMessage.includes('where') && lowerMessage.includes('going')) {
      return 'direction';
    }
    
    if (lowerMessage.includes('concentration') || lowerMessage.includes('pm2.5') || 
        lowerMessage.includes('air quality') || lowerMessage.includes('how much')) {
      return 'concentration';
    }
    
    if (lowerMessage.includes('risk') || lowerMessage.includes('danger') || 
        lowerMessage.includes('safe') || lowerMessage.includes('evacuat')) {
      return 'risk';
    }
    
    return 'general';
  }

  /**
   * Enhanced RAG retrieval combining multiple search strategies
   */
  private async performEnhancedRetrieval(
    query: string, 
    location?: { lat: number; lng: number }
  ): Promise<SearchResult[]> {
    try {
      const allResults: SearchResult[] = [];

      // 1. Semantic search for scientific knowledge
      const semanticResults = await this.vectorStore.semanticSearch(query, 5, {
        type: 'research_paper'
      });
      allResults.push(...semanticResults);

      // 2. Spatial search if location is provided
      if (location) {
        const spatialResults = await this.vectorStore.spatialSearch(query, location, 50, 3);
        allResults.push(...spatialResults);
      }

      // 3. Hybrid search for comprehensive coverage
      const hybridResults = await this.vectorStore.hybridSearch(query, 5);
      allResults.push(...hybridResults);

      // Deduplicate and sort by relevance
      const uniqueResults = this.deduplicateResults(allResults);
      return uniqueResults.slice(0, 8); // Limit to top 8 results
    } catch (error) {
      console.error('Error in enhanced retrieval:', error);
      return [];
    }
  }

  /**
   * Enhance SmeshLLM response with RAG context
   */
  private async enhanceResponseWithRAG(
    smeshResponse: SmeshResponse,
    searchResults: SearchResult[],
    originalQuery: string
  ): Promise<string> {
    if (searchResults.length === 0) {
      return smeshResponse.answer;
    }

    // Extract relevant context from search results
    const ragContext = searchResults
      .filter(result => result.similarity > 0.7)
      .map(result => result.document.content)
      .join('\n\n');

    // Enhance the response with RAG context
    let enhancedResponse = smeshResponse.answer;

    // Add scientific backing if available
    const scientificSources = searchResults.filter(r => r.document.metadata.type === 'research_paper');
    if (scientificSources.length > 0) {
      enhancedResponse += `\n\n**Scientific Context:**\nThis analysis is supported by research findings including studies on ${scientificSources.map(s => s.document.metadata.source).join(', ')}.`;
    }

    // Add local knowledge if available
    const localSources = searchResults.filter(r => r.document.metadata.type === 'spatial_knowledge');
    if (localSources.length > 0) {
      enhancedResponse += `\n\n**Local Knowledge:**\nRegional expertise indicates additional factors specific to this area.`;
    }

    // Add actionable insights
    if (smeshResponse.actionableInsights.length > 0) {
      enhancedResponse += `\n\n**Key Recommendations:**\n${smeshResponse.actionableInsights.map(insight => `• ${insight}`).join('\n')}`;
    }

    return enhancedResponse;
  }

  /**
   * Deduplicate search results
   */
  private deduplicateResults(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(result => {
      if (seen.has(result.document.id)) {
        return false;
      }
      seen.add(result.document.id);
      return true;
    }).sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Get chat session
   */
  getSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Update session context
   */
  updateSessionContext(sessionId: string, context: Partial<ChatSession['context']>): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.context = { ...session.context, ...context };
    }
  }

  /**
   * Get recent context for continuing conversations
   */
  getRecentContext(sessionId: string, messageCount: number = 5): ChatMessage[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    
    return session.messages.slice(-messageCount);
  }
} 