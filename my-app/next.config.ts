import type { NextConfig } from "next";

// Check if running in Netlify environment
const isNetlify = process.env.NETLIFY === 'true';

const nextConfig: NextConfig = {
  // Don't use static export - we need API routes for Netlify Functions
  output: undefined,
  
  // Configure images for static export
  images: {
    unoptimized: true, // Required for static exports
  },
  
  // Required for Netlify functions
  serverExternalPackages: ['@supabase/supabase-js'],
  
  // TypeScript configuration
  typescript: {
    ignoreBuildErrors: true,
  },
  
  // ESLint configuration
  eslint: {
    // Allow production builds to complete even if there are ESLint errors.
    // We will clean the codebase incrementally without blocking builds.
    ignoreDuringBuilds: true
  },
  
  // Performance optimizations
  turbopack: {
    rules: {
      '*.ts': {
        loaders: ['swc-loader'],
        as: '*.js',
      },
    },
  },
  
  // Webpack optimizations for bundle size
  webpack: (config, { isServer, webpack }) => {
    // Optimize bundle size
    if (!isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            deck: {
              test: /[\\/]node_modules[\\/]@deck\.gl[\\/]/,
              name: 'deck-gl',
              chunks: 'all',
              priority: 10,
            },
            vendor: {
              test: /[\\/]node_modules[\\/]/,
              name: 'vendors',
              chunks: 'all',
              priority: 5,
            },
          },
        },
      };
      
      // Ignore large optional dependencies
      config.resolve.alias = {
        ...config.resolve.alias,
        '@mapbox/node-pre-gyp': false,
        'sharp': false,
      };
    }
    
    // Ignore unnecessary files to reduce bundle size
    config.plugins.push(
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      })
    );
    
    return config;
  },
  
  // Configure for large uploads
  serverRuntimeConfig: {
    maxRequestSize: 25 * 1024 * 1024, // 25MB
  },
  
  // Public runtime config
  publicRuntimeConfig: {
    maxUploadSize: '20MB'
  }
};

export default nextConfig;
