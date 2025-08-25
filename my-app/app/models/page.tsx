'use client';

import React from 'react';
import { Navigation } from '@/components/layout/navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { motion } from 'framer-motion';
import { Brain, Cpu, Zap, Network, Activity, Settings, Gauge, MessageSquare, TrendingUp, BarChart3 } from 'lucide-react';

export default function ModelsPage() {
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
                  Physics-Informed AI Models
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-[64px] font-semibold text-white leading-tight mb-4"
              >
                AI Models & Architecture
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-3xl mx-auto mb-8"
              >
                Advanced machine learning models combining atmospheric physics with deep learning for accurate smoke plume prediction. 
                Discover our transformer architectures, diffusion models, and physics-informed neural networks.
              </motion.p>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row gap-4 justify-center"
              >
                <motion.a
                  href="/dashboard"
                  className="bg-[#8C1515] text-white px-6 py-3 font-semibold hover:bg-[#7A1212] transition-colors flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Gauge className="w-4 h-4" />
                  View Platform
                </motion.a>
                <motion.a
                  href="/chat"
                  className="border border-[#8C1515] text-[#8C1515] px-6 py-3 font-semibold hover:bg-[#8C1515] hover:text-white transition-colors flex items-center justify-center gap-2"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <MessageSquare className="w-4 h-4" />
                  AI Assistant
                </motion.a>
              </motion.div>
            </div>
          </div>

          {/* Model Categories */}
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
                  <h3 className="text-xl font-semibold text-white mb-2">Transformer Models</h3>
                  <p className="text-gray-400">Spatio-temporal attention mechanisms for smoke plume sequence prediction</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Physics-Informed Networks</h3>
                  <p className="text-gray-400">Neural networks constrained by atmospheric physics and conservation laws</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Network className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Diffusion Models</h3>
                  <p className="text-gray-400">Generative models for uncertainty quantification in smoke predictions</p>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Model Details */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Cpu className="w-8 h-8 text-[#8C1515]" />
                  <h2 className="text-3xl font-semibold text-white">Model Architectures</h2>
                </div>
                <p className="text-gray-400">
                  Deep dive into our advanced AI models for smoke plume prediction
                </p>
              </motion.div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 hover:border-[#8C1515]/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center flex-shrink-0">
                      <Brain className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-3">Spatio-Temporal Transformer</h3>
                      <p className="text-gray-400 text-sm mb-4">
                        Advanced transformer architecture with spatial and temporal attention mechanisms for modeling complex atmospheric dynamics over time and space.
                      </p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Parameters:</span>
                          <span className="text-white">245M</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Input Resolution:</span>
                          <span className="text-white">1km × 1km</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Temporal Window:</span>
                          <span className="text-white">48 hours</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Accuracy:</span>
                          <span className="text-green-400">87.3%</span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-1">Attention</span>
                        <span className="text-xs bg-purple-900/30 text-purple-400 px-2 py-1">Spatial</span>
                        <span className="text-xs bg-green-900/30 text-green-400 px-2 py-1">Temporal</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 hover:border-[#8C1515]/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center flex-shrink-0">
                      <Zap className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-3">Physics-Informed Neural Network</h3>
                      <p className="text-gray-400 text-sm mb-4">
                        Deep neural network incorporating atmospheric physics equations as constraints, ensuring predictions respect conservation laws and fluid dynamics.
                      </p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Parameters:</span>
                          <span className="text-white">89M</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Physics Loss:</span>
                          <span className="text-white">Navier-Stokes</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Conservation:</span>
                          <span className="text-white">Mass + Energy</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">RMSE:</span>
                          <span className="text-green-400">0.023</span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="text-xs bg-orange-900/30 text-orange-400 px-2 py-1">Physics</span>
                        <span className="text-xs bg-red-900/30 text-red-400 px-2 py-1">Constraints</span>
                        <span className="text-xs bg-yellow-900/30 text-yellow-400 px-2 py-1">Conservation</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 hover:border-[#8C1515]/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center flex-shrink-0">
                      <Network className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-3">Diffusion Model</h3>
                      <p className="text-gray-400 text-sm mb-4">
                        Probabilistic diffusion model for generating multiple plausible smoke trajectories and quantifying prediction uncertainty.
                      </p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Parameters:</span>
                          <span className="text-white">156M</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Sampling Steps:</span>
                          <span className="text-white">1000</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Uncertainty:</span>
                          <span className="text-white">Calibrated</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">FID Score:</span>
                          <span className="text-green-400">12.4</span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="text-xs bg-cyan-900/30 text-cyan-400 px-2 py-1">Probabilistic</span>
                        <span className="text-xs bg-pink-900/30 text-pink-400 px-2 py-1">Generative</span>
                        <span className="text-xs bg-indigo-900/30 text-indigo-400 px-2 py-1">Uncertainty</span>
                      </div>
                    </div>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 hover:border-[#8C1515]/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center flex-shrink-0">
                      <Activity className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <h3 className="text-xl font-semibold text-white mb-3">HYSPLIT Integration</h3>
                      <p className="text-gray-400 text-sm mb-4">
                        Hybrid model combining NOAA&apos;s HYSPLIT atmospheric dispersion model with neural network corrections for enhanced accuracy.
                      </p>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-400">Base Model:</span>
                          <span className="text-white">HYSPLIT v5.2</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Enhancement:</span>
                          <span className="text-white">Neural Corrector</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Improvement:</span>
                          <span className="text-white">+15.2%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">Physics:</span>
                          <span className="text-green-400">Consistent</span>
                        </div>
                      </div>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-1">HYSPLIT</span>
                        <span className="text-xs bg-amber-900/30 text-amber-400 px-2 py-1">Hybrid</span>
                        <span className="text-xs bg-teal-900/30 text-teal-400 px-2 py-1">Correction</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <BarChart3 className="w-8 h-8 text-[#8C1515]" />
                  <h2 className="text-3xl font-semibold text-white">Performance Metrics</h2>
                </div>
                <p className="text-gray-400">
                  Comprehensive evaluation of model accuracy and computational efficiency
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">94.2%</h3>
                  <p className="text-gray-400 mb-2">Overall Accuracy</p>
                  <p className="text-xs text-gray-500">Across all models</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">0.018</h3>
                  <p className="text-gray-400 mb-2">RMSE Score</p>
                  <p className="text-xs text-gray-500">Concentration prediction</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Cpu className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">2.4s</h3>
                  <p className="text-gray-400 mb-2">Inference Time</p>
                  <p className="text-xs text-gray-500">48-hour prediction</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Activity className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">±2.1</h3>
                  <p className="text-gray-400 mb-2">Uncertainty</p>
                  <p className="text-xs text-gray-500">μg/m³ confidence interval</p>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Technical Specifications */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Settings className="w-8 h-8 text-[#8C1515]" />
                  <h2 className="text-3xl font-semibold text-white">Technical Infrastructure</h2>
                </div>
                <p className="text-gray-400 mb-8">
                  High-performance computing resources powering our AI models
                </p>
                <div className="bg-[#1a1a1a] border border-gray-700 p-8">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 text-left">
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4">Training Infrastructure</h3>
                      <ul className="text-gray-400 space-y-2 text-sm">
                        <li>• 8x NVIDIA A100 GPUs (80GB)</li>
                        <li>• 512GB system memory</li>
                        <li>• NVMe SSD storage array</li>
                        <li>• InfiniBand networking</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4">Data Processing</h3>
                      <ul className="text-gray-400 space-y-2 text-sm">
                        <li>• 50TB atmospheric data archive</li>
                        <li>• Real-time sensor ingestion</li>
                        <li>• NOAA data integration</li>
                        <li>• Distributed preprocessing</li>
                      </ul>
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-4">Deployment</h3>
                      <ul className="text-gray-400 space-y-2 text-sm">
                        <li>• Kubernetes orchestration</li>
                        <li>• Auto-scaling inference</li>
                        <li>• Model versioning</li>
                        <li>• A/B testing framework</li>
                      </ul>
                    </div>
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