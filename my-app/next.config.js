/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['@supabase/supabase-js'],
  // Enable React strict mode
  reactStrictMode: true,
  // Enable server components

  // Configure webpack
  turbopack: {
    resolveAlias: {
      fs: { browser: './lib/empty.js' },
      net: { browser: './lib/empty.js' },
      tls: { browser: './lib/empty.js' },
      dns: { browser: './lib/empty.js' },
      child_process: { browser: './lib/empty.js' },
      dgram: { browser: './lib/empty.js' },
      zlib: { browser: './lib/empty.js' },
      http2: { browser: './lib/empty.js' },
    },
  },
  // Environment variables that should be available to the client
  env: {
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  },
  // Configure images
  images: {
    domains: ['lh3.googleusercontent.com', 'avatars.githubusercontent.com'],
  },
  allowedDevOrigins: ['http://10.24.6.82:3000'],

  // Configure CORS
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,OPTIONS,PATCH,DELETE,POST,PUT' },
          { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
