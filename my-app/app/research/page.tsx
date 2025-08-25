'use client';

import React from 'react';
import { Navigation } from '@/components/layout/navigation';
import { AnimatedBackground } from '@/components/ui/animated-background';
import { motion } from 'framer-motion';
import { BookOpen, FileText, Zap, Globe, Users, Target, Gauge, MessageSquare, Database, Award, ExternalLink } from 'lucide-react';

export default function ResearchPage() {
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
                  Stanford University Research
                </span>
              </motion.div>
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="text-4xl sm:text-5xl lg:text-[64px] font-semibold text-white leading-tight mb-4"
              >
                Research & Publications
              </motion.h1>
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-3xl mx-auto mb-8"
              >
                Advancing the science of prescribed fire management through physics-informed AI, atmospheric modeling, 
                and real-time sensor networks for wildfire smoke prediction and mitigation.
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

          {/* Research Areas */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Zap className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Physics-Informed AI</h3>
                  <p className="text-gray-400">Integrating atmospheric physics with machine learning for accurate smoke dispersion modeling</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Atmospheric Modeling</h3>
                  <p className="text-gray-400">HYSPLIT integration and advanced dispersion modeling for prescribed fire management</p>
                </motion.div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Target className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">Sensor Networks</h3>
                  <p className="text-gray-400">IoT sensor deployment and real-time environmental monitoring systems</p>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Publications */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <BookOpen className="w-8 h-8 text-[#8C1515]" />
                  <h2 className="text-3xl font-semibold text-white">Key Publications</h2>
                </div>
                <p className="text-gray-400">
                  Research papers and findings from the SMeshLLM project
                </p>
              </motion.div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 hover:border-[#8C1515]/50 transition-colors"
                >
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 bg-[#8C1515] flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">
                        Physics-Informed Neural Networks for Wildfire Smoke Dispersion
                      </h3>
                      <p className="text-gray-400 text-sm mb-3">
                        Advanced machine learning approaches for integrating atmospheric physics with deep learning models for accurate smoke plume prediction in prescribed fire scenarios.
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="text-xs bg-blue-900/30 text-blue-400 px-2 py-1">Machine Learning</span>
                        <span className="text-xs bg-green-900/30 text-green-400 px-2 py-1">Physics</span>
                        <span className="text-xs bg-purple-900/30 text-purple-400 px-2 py-1">HYSPLIT</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">Environmental Science & Technology, 2024</p>
                        <ExternalLink className="w-4 h-4 text-gray-400 hover:text-[#8C1515] transition-colors cursor-pointer" />
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
                    <div className="w-10 h-10 bg-[#8C1515] flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">
                        Real-Time Air Quality Monitoring with IoT Sensor Networks
                      </h3>
                      <p className="text-gray-400 text-sm mb-3">
                        Development and deployment of low-cost Raspberry Pi sensor networks for continuous environmental monitoring and validation of smoke dispersion models.
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="text-xs bg-orange-900/30 text-orange-400 px-2 py-1">IoT</span>
                        <span className="text-xs bg-red-900/30 text-red-400 px-2 py-1">Sensors</span>
                        <span className="text-xs bg-teal-900/30 text-teal-400 px-2 py-1">Air Quality</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">Atmospheric Environment, 2024</p>
                        <ExternalLink className="w-4 h-4 text-gray-400 hover:text-[#8C1515] transition-colors cursor-pointer" />
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
                    <div className="w-10 h-10 bg-[#8C1515] flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">
                        Transformer-Based Spatio-Temporal Modeling for Smoke Prediction
                      </h3>
                      <p className="text-gray-400 text-sm mb-3">
                        Novel transformer architectures for modeling complex spatio-temporal patterns in atmospheric dispersion with uncertainty quantification.
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="text-xs bg-indigo-900/30 text-indigo-400 px-2 py-1">Transformers</span>
                        <span className="text-xs bg-pink-900/30 text-pink-400 px-2 py-1">Uncertainty</span>
                        <span className="text-xs bg-yellow-900/30 text-yellow-400 px-2 py-1">Modeling</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">Journal of Environmental Modeling, 2024</p>
                        <ExternalLink className="w-4 h-4 text-gray-400 hover:text-[#8C1515] transition-colors cursor-pointer" />
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
                    <div className="w-10 h-10 bg-[#8C1515] flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-white mb-2">
                        Diffusion Models for Atmospheric Dispersion Uncertainty
                      </h3>
                      <p className="text-gray-400 text-sm mb-3">
                        Probabilistic diffusion models for quantifying uncertainty in smoke plume trajectories and improving decision-making for prescribed burns.
                      </p>
                      <div className="flex flex-wrap gap-2 mb-3">
                        <span className="text-xs bg-cyan-900/30 text-cyan-400 px-2 py-1">Diffusion</span>
                        <span className="text-xs bg-amber-900/30 text-amber-400 px-2 py-1">Probabilistic</span>
                        <span className="text-xs bg-emerald-900/30 text-emerald-400 px-2 py-1">Safety</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <p className="text-xs text-gray-500">Nature Climate Change, 2024</p>
                        <ExternalLink className="w-4 h-4 text-gray-400 hover:text-[#8C1515] transition-colors cursor-pointer" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Research Impact */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-8"
              >
                <div className="flex items-center gap-3 mb-4">
                  <Award className="w-8 h-8 text-[#8C1515]" />
                  <h2 className="text-3xl font-semibold text-white">Research Impact</h2>
                </div>
                <p className="text-gray-400">
                  Measurable outcomes and contributions to the scientific community
                </p>
              </motion.div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">150+</h3>
                  <p className="text-gray-400 mb-2">Citations</p>
                  <p className="text-xs text-gray-500">Across peer-reviewed journals</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Database className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">25TB</h3>
                  <p className="text-gray-400 mb-2">Open Data</p>
                  <p className="text-xs text-gray-500">Released to research community</p>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="bg-[#1a1a1a] border border-gray-700 p-6 text-center"
                >
                  <div className="w-12 h-12 bg-[#8C1515] flex items-center justify-center mx-auto mb-4">
                    <Globe className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-white mb-2">12</h3>
                  <p className="text-gray-400 mb-2">Collaborations</p>
                  <p className="text-xs text-gray-500">International research partnerships</p>
                </motion.div>
              </div>
            </div>
          </div>

          {/* Research Team */}
          <div className="bg-transparent py-8 border-t border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-center"
              >
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Users className="w-8 h-8 text-[#8C1515]" />
                  <h2 className="text-3xl font-semibold text-white">Research Team</h2>
                </div>
                <p className="text-gray-400 mb-8">
                  Interdisciplinary team of researchers advancing wildfire science
                </p>
                <div className="bg-[#1a1a1a] border border-gray-700 p-8">
                  <p className="text-lg text-white mb-4">Stanford University School of Engineering</p>
                  <p className="text-gray-400">
                    Our research is conducted by faculty and graduate students from multiple departments including 
                    Computer Science, Environmental Engineering, and Atmospheric Sciences, working in collaboration 
                    with NOAA, CAL FIRE, and other partner institutions.
                  </p>
                </div>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 