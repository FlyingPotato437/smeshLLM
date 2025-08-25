"use client";

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence, useScroll, useMotionValueEvent, type Variants } from 'framer-motion';
import { Menu, X, ChevronDown, ExternalLink } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavLinkProps, DropdownMenuProps, DropdownItemProps } from '@/types';

const NavLink: React.FC<NavLinkProps> = ({ 
  href = "#", 
  children, 
  hasDropdown = false, 
  className = "", 
  onClick 
}) => (
  <motion.a
    href={href}
    onClick={onClick}
    className={cn(
      "relative group text-sm font-medium text-gray-300 hover:text-white transition-colors duration-200 flex items-center py-1", 
      className
    )}
    whileHover="hover"
  >
    {children}
    {hasDropdown && <ChevronDown className="w-3 h-3 ml-1 transition-transform duration-200 group-hover:rotate-180" />}
    {!hasDropdown && (
      <motion.div
        className="absolute bottom-[-2px] left-0 right-0 h-[1px] bg-[#8C1515]"
        variants={{ initial: { scaleX: 0, originX: 0.5 }, hover: { scaleX: 1, originX: 0.5 } }}
        initial="initial"
        transition={{ duration: 0.3, ease: "easeOut" }}
      />
    )}
  </motion.a>
);

const DropdownMenu: React.FC<DropdownMenuProps> = ({ children, isOpen }) => (
  <AnimatePresence>
    {isOpen && (
      <motion.div
        initial={{ opacity: 0, y: 10, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 10, scale: 0.95, transition: { duration: 0.15 } }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 w-56 origin-top z-40"
      >
        <div className="bg-[#111111] border border-gray-700/50 rounded-md shadow-xl p-2">
          {children}
        </div>
      </motion.div>
    )}
  </AnimatePresence>
);

const DropdownItem: React.FC<DropdownItemProps> = ({ href = "#", children, icon }) => (
  <a
    href={href}
    className="group flex items-center justify-between w-full px-3 py-2 text-sm text-gray-300 hover:bg-gray-700/30 hover:text-white rounded-md transition-colors duration-150"
  >
    <span>{children}</span>
    {icon && React.cloneElement(icon as React.ReactElement<any>, { 
      className: "w-4 h-4 ml-1 opacity-70 group-hover:opacity-100 transition-opacity" 
    })}
  </a>
);

interface NavigationProps {
  className?: string;
}

const Navigation: React.FC<NavigationProps> = ({ className = "" }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState<boolean>(false);

  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", (latest) => {
    setIsScrolled(latest > 10);
  });

  React.useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [isMobileMenuOpen]);

  const headerVariants: Variants = {
    top: {
      backgroundColor: "rgba(17, 17, 17, 0.8)",
      borderBottomColor: "rgba(55, 65, 81, 0.5)",
      position: 'fixed',
      boxShadow: 'none',
    },
    scrolled: {
      backgroundColor: "rgba(17, 17, 17, 0.95)",
      borderBottomColor: "rgba(75, 85, 99, 0.7)",
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
      position: 'fixed'
    }
  };

  const mobileMenuVariants: Variants = {
    hidden: { opacity: 0, y: -20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.2, ease: "easeOut" } },
    exit: { opacity: 0, y: -20, transition: { duration: 0.15, ease: "easeIn" } }
  };

  return (
    <motion.header
      variants={headerVariants}
      initial="top"
      animate={isScrolled ? "scrolled" : "top"}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className={cn("px-6 w-full md:px-10 lg:px-16 sticky top-0 z-30 backdrop-blur-md border-b", className)}
    >
      <nav className="flex justify-between items-center max-w-screen-xl mx-auto h-[70px]">
        {/* Logo */}
        <Link href="/" className="flex items-center flex-shrink-0 hover:opacity-80 transition-opacity">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="#8C1515" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="#8C1515" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="#8C1515" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-xl font-bold text-white ml-2">SMesh</span>
          <span className="text-xs text-gray-400 ml-2">Stanford University</span>
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center justify-center flex-grow space-x-6 lg:space-x-8 px-4">
          <NavLink href="/dashboard">Dashboard</NavLink>

          <div
            className="relative"
            onMouseEnter={() => setOpenDropdown('models')}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <NavLink href="/models" hasDropdown>AI Models</NavLink>
            <DropdownMenu isOpen={openDropdown === 'models'}>
              <DropdownItem href="/models">HYSPLIT Integration</DropdownItem>
              <DropdownItem href="/models">Transformer Corrector</DropdownItem>
              <DropdownItem href="/models">Diffusion Models</DropdownItem>
              <DropdownItem href="/chat">Try in Chat</DropdownItem>
            </DropdownMenu>
          </div>

          <div
            className="relative"
            onMouseEnter={() => setOpenDropdown('research')}
            onMouseLeave={() => setOpenDropdown(null)}
          >
            <NavLink href="/research" hasDropdown>Research</NavLink>
            <DropdownMenu isOpen={openDropdown === 'research'}>
              <DropdownItem href="/research" icon={<ExternalLink />}>Publications</DropdownItem>
              <DropdownItem href="/research">Datasets</DropdownItem>
              <DropdownItem href="/research">Methodology</DropdownItem>
              <DropdownItem href="/research">API Reference</DropdownItem>
            </DropdownMenu>
          </div>

          <NavLink href="/sensors">Pi Sensors</NavLink>
          <NavLink href="/visualization">3D Visualization</NavLink>
        </div>

        {/* Mobile Menu */}
        <div className="flex items-center flex-shrink-0">
          <motion.button
            className="md:hidden text-gray-300 hover:text-white z-50"
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            aria-label="Toggle menu"
            whileHover={{ scale: 1.1 }} 
            whileTap={{ scale: 0.9 }}
          >
            {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </motion.button>
        </div>
      </nav>

      {/* Mobile Menu */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            key="mobile-menu"
            variants={mobileMenuVariants} 
            initial="hidden" 
            animate="visible" 
            exit="exit"
            className="md:hidden absolute top-full left-0 right-0 bg-[#111111]/95 backdrop-blur-sm shadow-lg py-4 border-t border-gray-800/50"
          >
            <div className="flex flex-col items-center space-y-4 px-6">
              <NavLink href="/dashboard" onClick={() => setIsMobileMenuOpen(false)}>Dashboard</NavLink>
              <NavLink href="/models" onClick={() => setIsMobileMenuOpen(false)}>AI Models</NavLink>
              <NavLink href="/research" onClick={() => setIsMobileMenuOpen(false)}>Research</NavLink>
              <NavLink href="/sensors" onClick={() => setIsMobileMenuOpen(false)}>Pi Sensors</NavLink>
              <NavLink href="/visualization" onClick={() => setIsMobileMenuOpen(false)}>3D Visualization</NavLink>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.header>
  );
};

export { Navigation }; 