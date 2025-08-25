'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Send, Bot, User, Zap, Brain, MapPin, Wind, Thermometer, Gauge, Search, Database, Satellite, Cloud, CheckCircle, Clock, Activity } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Note: AI processing happens server-side via API routes for security

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  isTyping?: boolean;
  spatialContext?: {
    location?: string;
    coordinates?: { lat: number; lng: number };
  };
  analysisType?: string;
}

// Enhanced progress tracking
interface ProcessingStage {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  status: 'pending' | 'active' | 'completed' | 'error';
  progress: number;
  timeEstimate?: string;
  details?: string;
}

interface SmeshChatProps {
  className?: string;
}

const SAMPLE_PROMPTS = [
  {
    text: "Analyze smoke dispersion for a prescribed burn at Stanford Hills",
    icon: Wind,
    category: "Smoke Analysis"
  },
  {
    text: "What's the current wildfire risk in Santa Clara County?",
    icon: MapPin,
    category: "Risk Assessment"
  },
  {
    text: "Explain HYSPLIT physics modeling for atmospheric dispersion",
    icon: Brain,
    category: "Physics Models"
  },
  {
    text: "Show me real-time sensor data and air quality conditions",
    icon: Gauge,
    category: "Live Data"
  }
];

// Processing stages configuration
const PROCESSING_STAGES: Omit<ProcessingStage, 'status' | 'progress' | 'details'>[] = [
  {
    id: 'query_analysis',
    name: 'Query Analysis',
    description: 'Analyzing spatial context and query requirements',
    icon: Search,
    timeEstimate: '2-3s'
  },
  {
    id: 'geocoding',
    name: 'Location Processing',
    description: 'Geocoding locations and extracting coordinates',
    icon: MapPin,
    timeEstimate: '1-2s'
  },
  {
    id: 'environmental_data',
    name: 'Environmental Data',
    description: 'Retrieving weather, elevation, and fire conditions',
    icon: Cloud,
    timeEstimate: '3-5s'
  },
  {
    id: 'air_quality',
    name: 'Air Quality Data',
    description: 'Fetching real-time measurements from OpenAQ network',
    icon: Gauge,
    timeEstimate: '2-4s'
  },
  {
    id: 'fire_detection',
    name: 'Fire Detection',
    description: 'Scanning NASA FIRMS satellite data for active fires',
    icon: Satellite,
    timeEstimate: '2-3s'
  },
  {
    id: 'hysplit_analysis',
    name: 'Physics Modeling',
    description: 'Running HYSPLIT atmospheric dispersion models',
    icon: Activity,
    timeEstimate: '4-8s'
  },
  {
    id: 'spatial_reasoning',
    name: 'Spatial Analysis',
    description: 'Performing spatial reasoning and risk assessment',
    icon: Brain,
    timeEstimate: '2-3s'
  },
  {
    id: 'ai_synthesis',
    name: 'AI Synthesis',
    description: 'Generating comprehensive analysis with Gemini 2.5 Pro',
    icon: Zap,
    timeEstimate: '5-10s'
  }
];

export function SmeshChat({ className = '' }: SmeshChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Hello! I'm SMeshLLM, Stanford University's advanced AI system for wildfire smoke plume prediction and management.

I implement the **WildFire GPT comprehensive algorithm** with sophisticated spatial reasoning capabilities:

🔬 **Physics-Informed Analysis** - HYSPLIT atmospheric dispersion modeling with AI enhancement
🗺️ **Advanced Spatial Reasoning** - Geospatial analysis and environmental data synthesis  
📡 **Real-Time Integration** - Raspberry Pi sensor networks and satellite data
📚 **Scientific Evidence** - Evidence-based recommendations from research literature
🎯 **Uncertainty Quantification** - Model validation and risk assessment

Ask me about smoke plume dispersion, wildfire risk assessment, atmospheric conditions, sensor data analysis, or fire management strategies. I can analyze specific locations, explain physics models, and provide actionable insights for emergency management.`,
      timestamp: new Date(),
      analysisType: 'introduction'
    }
  ]);
  
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [processingStages, setProcessingStages] = useState<ProcessingStage[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [elapsedTime, setElapsedTime] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Timer for elapsed time
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isLoading && startTime) {
      timer = setInterval(() => {
        setElapsedTime(Date.now() - startTime);
      }, 100);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isLoading, startTime]);

  // Initialize processing stages
  const initializeProcessingStages = () => {
    const stages = PROCESSING_STAGES.map(stage => ({
      ...stage,
      status: 'pending' as const,
      progress: 0,
      details: ''
    }));
    setProcessingStages(stages);
    setOverallProgress(0);
    setStartTime(Date.now());
    setElapsedTime(0);
  };

  // Update a specific stage
  const updateStage = (stageId: string, updates: Partial<ProcessingStage>) => {
    setProcessingStages(prev => prev.map(stage => 
      stage.id === stageId ? { ...stage, ...updates } : stage
    ));
    
    // Calculate overall progress
    setProcessingStages(prev => {
      const totalStages = prev.length;
      const completedStages = prev.filter(s => s.status === 'completed').length;
      const activeStageProgress = prev.find(s => s.status === 'active')?.progress || 0;
      const newOverallProgress = ((completedStages + activeStageProgress / 100) / totalStages) * 100;
      setOverallProgress(newOverallProgress);
      return prev;
    });
  };

  // Simulate realistic progress updates
  const simulateProgressUpdates = () => {
    const stageDurations = [3000, 2000, 4000, 3000, 2500, 6000, 2500, 8000]; // milliseconds
    let currentStageIndex = 0;
    
    const processNextStage = () => {
      if (currentStageIndex >= PROCESSING_STAGES.length) return;
      
      const stage = PROCESSING_STAGES[currentStageIndex];
      const duration = stageDurations[currentStageIndex];
      
      // Mark current stage as active
      updateStage(stage.id, { 
        status: 'active', 
        progress: 0,
        details: 'Starting...'
      });
      
      // Simulate progress within the stage
      let stageProgress = 0;
      const progressInterval = setInterval(() => {
        stageProgress += Math.random() * 15 + 5; // 5-20% increments
        
        if (stageProgress >= 100) {
          stageProgress = 100;
          clearInterval(progressInterval);
          
          // Complete current stage
          updateStage(stage.id, { 
            status: 'completed', 
            progress: 100,
            details: 'Completed'
          });
          
          // Move to next stage
          currentStageIndex++;
          setTimeout(processNextStage, 200);
        } else {
          // Update progress with realistic details
          const details = getStageDetails(stage.id, stageProgress);
          updateStage(stage.id, { 
            progress: stageProgress,
            details
          });
        }
      }, duration / 15); // 15 progress updates per stage
    };
    
    processNextStage();
  };

  // Get realistic details for each stage based on progress
  const getStageDetails = (stageId: string, progress: number): string => {
    const details: Record<string, string[]> = {
      query_analysis: [
        'Parsing query intent...',
        'Extracting spatial keywords...',
        'Identifying analysis type...',
        'Spatial context extracted'
      ],
      geocoding: [
        'Locating coordinates...',
        'Validating location data...',
        'Coordinates confirmed'
      ],
      environmental_data: [
        'Connecting to weather APIs...',
        'Fetching meteorological data...',
        'Retrieving elevation data...',
        'Processing fire weather indices...',
        'Environmental data integrated'
      ],
      air_quality: [
        'Connecting to OpenAQ network...',
        'Querying nearby sensors...',
        'Processing air quality measurements...',
        'Data validation complete'
      ],
      fire_detection: [
        'Accessing NASA FIRMS...',
        'Scanning satellite imagery...',
        'Processing fire detection data...',
        'Fire analysis complete'
      ],
      hysplit_analysis: [
        'Initializing HYSPLIT model...',
        'Setting up atmospheric parameters...',
        'Running dispersion calculations...',
        'Processing model outputs...',
        'Physics simulation complete'
      ],
      spatial_reasoning: [
        'Analyzing spatial relationships...',
        'Calculating risk factors...',
        'Spatial analysis complete'
      ],
      ai_synthesis: [
        'Connecting to Gemini 2.5 Pro...',
        'Synthesizing multi-source data...',
        'Generating scientific analysis...',
        'Formatting comprehensive report...',
        'Analysis complete'
      ]
    };
    
    const stageDetails = details[stageId] || ['Processing...'];
    const index = Math.min(Math.floor((progress / 100) * stageDetails.length), stageDetails.length - 1);
    return stageDetails[index];
  };

  const formatElapsedTime = (ms: number): string => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${remainingSeconds}s`;
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    // Initialize processing stages
    initializeProcessingStages();
    simulateProgressUpdates();

    // Add a temporary "AI is thinking" message
    const tempId = `temp-${Date.now()}`;
    const tempMessage: Message = {
      id: tempId,
      role: 'assistant',
      content: 'Analyzing your request...',
      timestamp: new Date(),
      isTyping: true
    };
    
    setMessages(prev => [...prev, tempMessage]);

    try {
      // Determine the API endpoint based on the environment
      const apiUrl = process.env.NODE_ENV === 'development' 
        ? '/api/chat/chat-real' 
        : '/.netlify/functions/chat';

      // Set a timeout for the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 seconds

      // Call the chat API endpoint
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: input.trim(),
          sessionId: 'session-' + Date.now()
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        // Mark all stages as completed
        setProcessingStages(prev => prev.map(stage => ({
          ...stage,
          status: 'completed',
          progress: 100,
          details: 'Completed'
        })));
        setOverallProgress(100);
        
        // Remove the temporary message
        setMessages(prev => prev.filter(msg => msg.id !== tempId));
        
        const assistantMessage: Message = {
          id: Date.now().toString(),
          role: 'assistant',
          content: (typeof data.message === 'string' ? data.message : data.message?.content) || data.error || 'I apologize, but I encountered an issue processing your request.',
          timestamp: new Date(),
          analysisType: 'wildfire_gpt_analysis'
        };

        setMessages(prev => [...prev, assistantMessage]);
      } else {
        throw new Error(data.error || data.message || 'Failed to get a valid response from the server.');
      }
    } catch (error) {
      // Mark current active stage as error
      setProcessingStages(prev => prev.map(stage => 
        stage.status === 'active' ? { ...stage, status: 'error', details: 'Error occurred' } : stage
      ));
      
      function isError(error: any): error is Error {
        return error instanceof Error;
      }

      // Remove temporary message
      setMessages(prev => prev.filter(msg => msg.id !== tempId));
      
      let errorContent = '';
      if (isError(error) && error.name === 'AbortError') {
        errorContent = `⏱️ **Request Timeout**\n\nYour request took longer than expected to process. This can happen when:\n\n- Multiple complex API calls are required\n- External services (weather, satellite data) are slow\n- The AI model is processing a particularly complex query\n\nPlease try again with a more specific question, or try again in a moment.`;
      } else if (isError(error) && (error.message.includes('Failed to fetch') || error.message.includes('NetworkError'))) {
        errorContent = `🌐 **Connection Error**\n\nI'm having trouble connecting to the server. Please check your internet connection and try again.\n\nIf the problem persists, our systems might be temporarily unavailable.`;
      } else if (isError(error)) {
        errorContent = `⚠️ **Error Processing Request**\n\nI encountered an issue while processing your request. As SMeshLLM with WildFire GPT capabilities, I'm designed to provide comprehensive spatial reasoning and physics-informed analysis for wildfire smoke prediction.\n\nPlease try rephrasing your question, and I'll assist you with:\n- Smoke plume dispersion analysis using HYSPLIT physics models\n- Spatial risk assessment and geospatial analysis\n- Real-time sensor data interpretation`;
        
        // Only show detailed error in development
        if (process.env.NODE_ENV === 'development') {
          errorContent += `\n\n**Error Details:**\n\`\`\`\n${error.message}\n\`\`\``;
        }
      } else {
        errorContent = `⚠️ **An unexpected error occurred**\n\nI'm sorry, but something went wrong while processing your request. Please try again later.`;
      }
      
      const errorMessage: Message = {
        id: Date.now().toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      // Reset processing states after a delay
      setTimeout(() => {
        setProcessingStages([]);
        setOverallProgress(0);
        setStartTime(null);
        setElapsedTime(0);
      }, 2000);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSamplePrompt = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className={`flex flex-col h-full w-full max-w-4xl mx-auto ${className}`}>
      {/* Header */}
      <Card className="bg-[#1a1a1a] border-gray-700 rounded-t-xl rounded-b-none">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-3 text-white">
            <div className="w-8 h-8 rounded-full bg-[#8C1515] flex items-center justify-center">
              <Brain className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-lg font-semibold">SMeshLLM</div>
              <div className="text-xs text-gray-400 font-normal">Stanford's WildFire GPT Algorithm</div>
            </div>
          </CardTitle>
        </CardHeader>
      </Card>

      {/* Messages */}
      <CardContent className="flex-1 overflow-y-auto bg-[#1a1a1a] border-l border-r border-gray-700 p-4 space-y-4">
        <AnimatePresence>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex gap-3"
            >
              <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center">
                {message.role === 'user' ? (
                  <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#8C1515] flex items-center justify-center">
                    <Brain className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>

              <div className="flex-1 max-w-[80%]">
                <div className={`rounded-lg p-4 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white'
                    : 'bg-[#2a2a2a] text-gray-100 border border-gray-700'
                }`}>
                  <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {message.content}
                    </ReactMarkdown>
                  </div>
                  
                  {message.role === 'assistant' && message.analysisType === 'wildfire_gpt_analysis' && (
                    <div className="mt-3 pt-3 border-t border-gray-600">
                      <div className="flex flex-wrap gap-2 text-xs">
                        <Badge variant="outline" className="border-blue-500 text-blue-400">
                          <Brain className="w-3 h-3 mr-1" />
                          WildFire GPT
                        </Badge>
                        <Badge variant="outline" className="border-green-500 text-green-400">
                          <MapPin className="w-3 h-3 mr-1" />
                          Spatial Reasoning
                        </Badge>
                        <Badge variant="outline" className="border-purple-500 text-purple-400">
                          <Zap className="w-3 h-3 mr-1" />
                          Physics-Informed
                        </Badge>
                      </div>
                    </div>
                  )}
                  
                  <div className="mt-2 text-xs text-gray-500">
                    {message.timestamp.toLocaleTimeString()}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        
        {/* Enhanced Progress Indicator */}
        {isLoading && processingStages.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-[#2a2a2a] border border-gray-700 rounded-lg p-4 space-y-4"
          >
            {/* Overall Progress Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4 text-[#8C1515] animate-pulse" />
                <span className="text-sm font-medium text-white">Processing with WildFire GPT Algorithm</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                <Clock className="w-3 h-3" />
                <span>{formatElapsedTime(elapsedTime)}</span>
              </div>
            </div>
            
            {/* Overall Progress Bar */}
            <div className="w-full bg-gray-700 rounded-full h-2">
              <div
                className="h-2 bg-gradient-to-r from-[#8C1515] to-[#B91515] rounded-full transition-all duration-300"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            
            {/* Processing Stages */}
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {processingStages.map((stage, index) => {
                const Icon = stage.icon;
                return (
                  <div key={stage.id} className="flex items-center gap-3 p-2 rounded bg-[#1a1a1a]">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                      stage.status === 'completed' ? 'bg-green-500' :
                      stage.status === 'active' ? 'bg-[#8C1515]' :
                      stage.status === 'error' ? 'bg-red-500' :
                      'bg-gray-600'
                    }`}>
                      {stage.status === 'completed' ? (
                        <CheckCircle className="w-3 h-3 text-white" />
                      ) : (
                        <Icon className={`w-3 h-3 text-white ${stage.status === 'active' ? 'animate-pulse' : ''}`} />
                      )}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-xs font-medium ${
                          stage.status === 'completed' ? 'text-green-400' :
                          stage.status === 'active' ? 'text-white' :
                          stage.status === 'error' ? 'text-red-400' :
                          'text-gray-400'
                        }`}>
                          {stage.name}
                        </span>
                        {stage.status === 'active' && (
                          <span className="text-xs text-gray-400">{Math.round(stage.progress)}%</span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500 truncate">
                        {stage.details || stage.description}
                      </div>
                      {stage.status === 'active' && (
                        <div className="w-full bg-gray-600 rounded-full h-1 mt-1">
                          <div
                            className="h-1 bg-[#8C1515] rounded-full transition-all duration-200"
                            style={{ width: `${stage.progress}%` }}
                          />
                        </div>
                      )}
                    </div>
                    
                    {stage.status === 'pending' && (
                      <span className="text-xs text-gray-500 flex-shrink-0">{stage.timeEstimate}</span>
                    )}
                  </div>
                );
              })}
            </div>
            
            <div className="text-xs text-gray-500 text-center">
              Integrating real-time data from multiple scientific sources...
            </div>
          </motion.div>
        )}

        {isLoading && processingStages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="flex gap-3 max-w-[80%]">
              <div className="w-8 h-8 rounded-full bg-[#8C1515] flex items-center justify-center">
                <Brain className="w-4 h-4 text-white animate-pulse" />
              </div>
              <div className="bg-[#2a2a2a] border border-gray-700 rounded-lg p-4">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                  <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                </div>
                <div className="mt-2 text-xs text-gray-500">
                  Initializing WildFire GPT algorithm...
                </div>
              </div>
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </CardContent>

      {/* Sample Prompts */}
      {messages.length === 1 && !isLoading && (
        <Card className="bg-[#1a1a1a] border-gray-700 border-t-0 rounded-none">
          <CardContent className="p-4">
            <div className="text-sm text-gray-400 mb-3">Try these examples:</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {SAMPLE_PROMPTS.map((prompt, index) => {
                const Icon = prompt.icon;
                return (
                  <button
                    key={index}
                    onClick={() => handleSamplePrompt(prompt.text)}
                    className="text-left p-3 rounded-lg bg-[#2a2a2a] border border-gray-600 hover:border-[#8C1515] transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="w-4 h-4 text-[#8C1515] mt-0.5 flex-shrink-0" />
                      <div>
                        <div className="text-xs text-[#8C1515] font-medium">{prompt.category}</div>
                        <div className="text-sm text-gray-300">{prompt.text}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-[#1a1a1a] border-gray-700 rounded-b-xl rounded-t-none">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask about smoke dispersion, wildfire risk, atmospheric conditions, or sensor data..."
              className="flex-1 min-h-[50px] max-h-[120px] bg-[#2a2a2a] border-gray-600 text-white placeholder-gray-400 resize-none"
              disabled={isLoading}
            />
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="bg-[#8C1515] hover:bg-[#7A1212] text-white"
              size="lg"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Brain className="w-3 h-3" />
                <span>WildFire GPT Algorithm</span>
              </div>
              <div className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                <span>Spatial Reasoning</span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="w-3 h-3" />
                <span>Physics-Informed</span>
              </div>
            </div>
            <div>
              Press Enter to send, Shift+Enter for new line
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
} 