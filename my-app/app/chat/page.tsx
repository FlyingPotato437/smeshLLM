'use client';

import React from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/layout/navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { SmeshChat } from '@/components/ui/smesh-chat';
import { motion } from 'framer-motion';
import { MessageSquare, Brain, Target, Zap, Gauge, Map, HelpCircle, Activity } from 'lucide-react';

export default function ChatPage() {
  return (
    <div className="min-h-screen bg-[#111111] relative">
      <AnimatedBackground opacity={0.6} />
      <div className="absolute inset-0 z-1 pointer-events-none" style={{
        background: 'linear-gradient(to bottom, transparent 0%, #111111 90%), radial-gradient(ellipse at center, transparent 40%, #111111 95%)'
      }}></div>
      
      <div className="relative z-10">
        <Navigation />
        
        <div className="pt-[100px]">
          {/* Hero Section */}
          <div className="bg-transparent py-16">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-6"
              >
                <span className="bg-[#1a1a1a] border border-gray-700 text-[#8C1515] px-4 py-1 text-sm font-medium cursor-pointer hover:border-[#8C1515]/50 transition-colors">
                  Physics-Informed AI Assistant
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-[64px] font-semibold text-white leading-tight mb-4"
              >
                SMeshLLM AI Assistant
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-3xl mx-auto mb-8"
              >
                Ask questions about smoke conditions, fire risks, and air quality with advanced spatial reasoning. 
                Powered by real-time sensor data and physics-informed models.
              </motion.p>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4 justify-center"
              >
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link 
                    href="/dashboard"
                    className="bg-[#8C1515] text-white px-6 py-3 font-semibold hover:bg-[#7A1212] transition-colors flex items-center justify-center gap-2"
                  >
                    <Gauge className="w-4 h-4" />
                    View Dashboard
                  </Link>
                </motion.div>
                <motion.div
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Link
                    href="/visualization"
                    className="border border-[#8C1515] text-[#8C1515] px-6 py-3 font-semibold hover:bg-[#8C1515] hover:text-white transition-colors flex items-center justify-center gap-2"
                  >
                    <Map className="w-4 h-4" />
                    3D Visualization
                  </Link>
                </motion.div>
              </motion.div>
            </div>
          </div>

          {/* Features Section */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Real-Time Analysis</h3>
                  <p className="text-gray-400">Instant insights from live sensor data and environmental conditions</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Spatial Reasoning</h3>
                  <p className="text-gray-400">Advanced spatial analysis with geographic context and wind patterns</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Physics-Informed</h3>
                  <p className="text-gray-400">Responses grounded in HYSPLIT models and atmospheric science</p>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Chat Interface */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <MessageSquare className="w-8 h-8 text-[#8C1515]" />
                  <h2 className="text-3xl font-semibold text-white">Start Your Analysis</h2>
                </div>
                <p className="text-gray-400">
                  Ask questions about current conditions, risk assessments, or get predictions for prescribed burns
                </p>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="bg-[#1a1a1a] border border-gray-700 overflow-hidden mb-8"
              >
                <SmeshChat className="h-[600px] min-h-[500px]" />
              </motion.div>

              {/* Example Questions */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="mb-8"
              >
                <div className="flex items-center gap-3 mb-6">
                  <HelpCircle className="w-6 h-6 text-[#8C1515]" />
                  <h3 className="text-xl font-semibold text-white">Example Questions</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-[#1a1a1a] border border-gray-700 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Activity className="w-5 h-5 text-[#8C1515]" />
                      <h4 className="font-semibold text-white">Current Conditions</h4>
                    </div>
                    <ul className="text-sm text-gray-400 space-y-2">
                      <li>• What&apos;s the current air quality in Stanford?</li>
                      <li>• Show me PM2.5 readings from all sensors</li>
                      <li>• What are the wind conditions right now?</li>
                      <li>• Which sensors are showing elevated readings?</li>
                    </ul>
                  </div>
                  <div className="bg-[#1a1a1a] border border-gray-700 p-6">
                    <div className="flex items-center gap-2 mb-4">
                      <Target className="w-5 h-5 text-[#8C1515]" />
                      <h4 className="font-semibold text-white">Risk Assessment</h4>
                    </div>
                    <ul className="text-sm text-gray-400 space-y-2">
                      <li>• Is it safe to conduct a prescribed burn today?</li>
                      <li>• What areas would be affected by smoke?</li>
                      <li>• Run a HYSPLIT dispersion analysis</li>
                      <li>• Analyze unhealthy air quality levels</li>
                    </ul>
                  </div>
                </div>
              </motion.div>

              {/* AI Capabilities */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
                className="bg-[#1a1a1a] border border-gray-700 p-6"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Brain className="w-6 h-6 text-[#8C1515]" />
                  <h3 className="text-lg font-semibold text-white">AI Capabilities</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                  <div>
                    <h4 className="font-medium text-white mb-2">Data Analysis</h4>
                    <ul className="text-gray-400 space-y-1">
                      <li>• Real-time sensor data processing</li>
                      <li>• Statistical trend analysis</li>
                      <li>• Pattern recognition</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">Physics Modeling</h4>
                    <ul className="text-gray-400 space-y-1">
                      <li>• HYSPLIT trajectory analysis</li>
                      <li>• Atmospheric dispersion modeling</li>
                      <li>• Wind pattern interpretation</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium text-white mb-2">Spatial Analysis</h4>
                    <ul className="text-gray-400 space-y-1">
                      <li>• Geographic impact assessment</li>
                      <li>• Multi-sensor correlation</li>
                      <li>• Temporal-spatial predictions</li>
                    </ul>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 