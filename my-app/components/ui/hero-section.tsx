"use client";

import React from 'react';
import { motion, type Variants } from 'framer-motion';
import { SimpleRotatingText } from './simple-rotating-text';
import { AnimatedBackground } from './animated-background';

const ShinyText: React.FC<{ text: string; className?: string }> = ({ text, className = "" }) => (
  <span className={`relative overflow-hidden inline-block ${className}`}>
    {text}
    <span style={{
      position: 'absolute',
      inset: 0,
      background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
      animation: 'shine 2s infinite linear',
      opacity: 0.5,
      pointerEvents: 'none'
    }}></span>
    <style>{`
      @keyframes shine {
        0% { transform: translateX(-100%); }
        100% { transform: translateX(100%); }
      }
    `}</style>
  </span>
);

const HeroSection: React.FC = () => {
  const contentDelay = 0.3;
  const itemDelayIncrement = 0.1;

  const bannerVariants: Variants = {
    hidden: { opacity: 0, y: -10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, delay: contentDelay } }
  };

  const headlineVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5, delay: contentDelay + itemDelayIncrement } }
  };

  const subHeadlineVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: contentDelay + itemDelayIncrement * 2 } }
  };

  const formVariants: Variants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.5, delay: contentDelay + itemDelayIncrement * 3 } }
  };

  const trialTextVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5, delay: contentDelay + itemDelayIncrement * 4 } }
  };

  const worksWithVariants: Variants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: { duration: 0.5, delay: contentDelay + itemDelayIncrement * 5 } }
  };

  const imageVariants: Variants = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0, 
      transition: { 
        duration: 0.6, 
        delay: contentDelay + itemDelayIncrement * 6, 
        ease: [0.16, 1, 0.3, 1] 
      } 
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Handle form submission here
    console.log('Form submitted');
  };

  return (
    <div className="pt-[100px] relative bg-[#111111] text-gray-300 min-h-screen flex flex-col overflow-x-hidden">
      <AnimatedBackground opacity={0.8} />
      
      <div className="absolute inset-0 z-1 pointer-events-none" style={{
        background: 'linear-gradient(to bottom, transparent 0%, #111111 90%), radial-gradient(ellipse at center, transparent 40%, #111111 95%)'
      }}></div>

      <main className="flex-grow flex flex-col items-center justify-center text-center px-4 pt-8 pb-16 relative z-10">
        
        <motion.div
          variants={bannerVariants}
          initial="hidden"
          animate="visible"
          className="mb-6"
        >
          <ShinyText 
            text="Physics-Informed AI for Prescribed Fire Management" 
            className="bg-[#1a1a1a] border border-gray-700 text-[#8C1515] px-4 py-1 rounded-full text-xs sm:text-sm font-medium cursor-pointer hover:border-[#8C1515]/50 transition-colors" 
          />
        </motion.div>

        <motion.h1
          variants={headlineVariants}
          initial="hidden"
          animate="visible"
          className="text-4xl sm:text-5xl lg:text-[64px] font-semibold text-white leading-tight max-w-4xl mb-4"
        >
          Generative Smoke-Plume<br />{' '}
          <SimpleRotatingText
            texts={['Prediction', 'Modeling', 'Simulation', 'Tracking', 'Visualization']}
            className="text-[#8C1515] mx-1"
            interval={2200}
          />
        </motion.h1>

        <motion.p
          variants={subHeadlineVariants}
          initial="hidden"
          animate="visible"
          className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-2xl mx-auto mb-8"
        >
          Advanced physics-informed AI platform combining HYSPLIT with deep learning for real-time prescribed fire smoke plume prediction using Raspberry Pi sensor networks and satellite data.
        </motion.p>

        <motion.div
          variants={formVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full max-w-lg mx-auto mb-3"
        >
          <motion.a
            href="/dashboard"
            className="w-full sm:w-auto bg-[#8C1515] text-white px-6 py-3 rounded-md text-sm font-semibold hover:bg-opacity-90 transition-colors duration-200 whitespace-nowrap shadow-sm hover:shadow-md flex-shrink-0 text-center"
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            Launch Platform
          </motion.a>
          <motion.a
            href="/chat"
            className="w-full sm:w-auto border border-[#8C1515] text-[#8C1515] px-6 py-3 rounded-md text-sm font-semibold hover:bg-[#8C1515] hover:text-white transition-colors duration-200 whitespace-nowrap flex-shrink-0 text-center"
            whileHover={{ scale: 1.03, y: -1 }}
            whileTap={{ scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 15 }}
          >
            AI Assistant
          </motion.a>
        </motion.div>

        <motion.p
          variants={trialTextVariants}
          initial="hidden"
          animate="visible"
          className="text-xs text-gray-500 mb-10"
        >
          Stanford University Research Platform - Open Access
        </motion.p>

        <motion.div
          variants={worksWithVariants}
          initial="hidden"
          animate="visible"
          className="flex flex-col items-center justify-center space-y-2 mb-10"
        >
          <span className="text-xs uppercase text-gray-500 tracking-wider font-medium">Integrates with</span>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-gray-400">
            <span className="flex items-center whitespace-nowrap">NOAA HYSPLIT</span>
            <span className="flex items-center whitespace-nowrap">NASA FIRMS</span>
            <span className="flex items-center whitespace-nowrap">GOES-ABI</span>
            <span className="flex items-center whitespace-nowrap">Supabase PostGIS</span>
            <span className="flex items-center whitespace-nowrap">Raspberry Pi</span>
            <span className="flex items-center whitespace-nowrap">Deck.gl</span>
          </div>
        </motion.div>

        <motion.div
          variants={imageVariants}
          initial="hidden"
          animate="visible"
          className="w-full max-w-4xl mx-auto px-4 sm:px-0"
        >
          <img
            src="https://images.unsplash.com/photo-1446776653964-20c1d3a81b06?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2070&q=80"
            alt="3D smoke plume visualization and sensor network for prescribed fire monitoring"
            width={1024}
            height={640}
            className="w-full h-auto object-contain rounded-lg shadow-xl border border-gray-700/50"
            loading="lazy"
          />
        </motion.div>
      </main>
    </div>
  );
};

export { HeroSection }; 