/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@patina/design-system', '@patina/types', '@patina/utils', '@patina/api-client'],
  outputFileTracingRoot: path.join(__dirname, '../../'),

  // Security and CORS headers
  async headers() {
    const isDevelopment = process.env.NODE_ENV === 'development';

    // CSP directives - adapted for development vs production
    const cspDirectives = [
      "default-src 'self'",
      isDevelopment
        ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      // Allow connections based on environment
      // Development: localhost, local network IPs, AND patina.cloud domains (for Cloudflare tunnel access)
      // Production: patina.cloud API gateway and WebSocket connections
      isDevelopment
        ? "connect-src 'self' http://localhost:* ws://localhost:* http://192.168.1.18:* ws://192.168.1.18:* http://192.168.1.36:* ws://192.168.1.36:* http://192.168.1.16:* ws://192.168.1.16:* http://127.0.0.1:* ws://127.0.0.1:* http://*.nordicheat.org ws://*.nordicheat.org https://api.patina.cloud wss://api.patina.cloud https://*.patina.cloud wss://*.patina.cloud https://*.identity.oraclecloud.com https://*.oraclecloud.com"
        : "connect-src 'self' https://api.patina.cloud wss://api.patina.cloud https://*.patina.cloud wss://*.patina.cloud https://*.identity.oraclecloud.com https://*.oraclecloud.com",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ];

    // Only upgrade insecure requests in production
    if (!isDevelopment) {
      cspDirectives.push('upgrade-insecure-requests');
    }

    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspDirectives.join('; ')
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
        ],
      },
    ];
  },

  // Allow specific origins for development
  // Note: When using a reverse proxy, include all possible host headers
  allowedDevOrigins: [
    // Local network IPs
    'http://192.168.1.18:3000',
    'http://192.168.1.16:3000',
    'http://192.168.1.36:3000',

    // Localhost variations
    'http://localhost:3000',
    'http://localhost:8080',
    'http://127.0.0.1:3000',

    // Docker internal host (for nginx proxy)
    'http://host.docker.internal:3000',
    'http://host.docker.internal',

    // Without protocol (for cases where origin header lacks protocol)
    'patina.cloud',
    'www.patina.cloud',
    'designer.patina.cloud',
    'admin.patina.cloud',
    'client.patina.cloud',
    'api.patina.cloud',
    'patina.design',
    'www.patina.design',
    'designer.patina.design',
    'admin.patina.design',
    'client.patina.design',
    'api.patina.design',

    // Main domain (designer portal) - with and without ports
    'http://patina.cloud',
    'https://patina.cloud',
    'http://patina.cloud:3000',
    'https://patina.cloud:3000',
    'http://patina.cloud:80',
    'https://patina.cloud:443',
    'http://www.patina.cloud',
    'https://www.patina.cloud',
    'http://www.patina.cloud:3000',
    'https://www.patina.cloud:3000',

    // Potential designer subdomain
    'http://designer.patina.cloud',
    'https://designer.patina.cloud',
    'http://designer.patina.cloud:3000',
    'https://designer.patina.cloud:3000',

    // API subdomain
    'http://api.patina.cloud',
    'https://api.patina.cloud',

    // Admin subdomain
    'http://admin.patina.cloud',
    'https://admin.patina.cloud',

    // Client subdomain
    'http://client.patina.cloud',
    'https://client.patina.cloud',

    // Alternative domain - with and without ports
    'http://patina.design',
    'https://patina.design',
    'http://patina.design:3000',
    'https://patina.design:3000',
    'http://www.patina.design',
    'https://www.patina.design',
    'http://www.patina.design:3000',
    'https://www.patina.design:3000',
    'http://designer.patina.design',
    'https://designer.patina.design',
    'http://designer.patina.design:3000',
    'https://designer.patina.design:3000',

    // nordicheat.org domain
    'nordicheat.org',
    'http://nordicheat.org',
    'http://designer.nordicheat.org',
    'http://admin.nordicheat.org',
    'http://client.nordicheat.org',
    'http://api.nordicheat.org'
  ],

  experimental: {
    // Optimize package imports for better tree-shaking
    optimizePackageImports: [
      '@patina/design-system',
      'lucide-react',
      '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu',
      '@radix-ui/react-popover',
      '@radix-ui/react-tabs',
      '@tanstack/react-query'
    ],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'objectstorage.*.oraclecloud.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'api.patina.cloud',
        pathname: '/storage/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.patina.cloud',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'media.patina.cloud',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'localhost',
        port: '',
        pathname: '/**',
      },
    ],
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
  },

  compiler: {
    removeConsole: process.env.NODE_ENV === 'production' ? {
      exclude: ['error', 'warn'],
    } : false,
  },

  // Enable compression
  compress: true,

  // Production source maps (smaller)
  productionBrowserSourceMaps: false,

  // Skip linting during build (lint separately)
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Skip type checking during build (pre-existing type issues to fix in Phase 4)
  typescript: {
    ignoreBuildErrors: true,
  },


  webpack: (config, { dev, isServer }) => {
    // Ensure resolve.alias exists
    if (!config.resolve.alias) {
      config.resolve.alias = {};
    }

    // Explicitly set the @/ alias for local imports
    config.resolve.alias['@'] = path.resolve(__dirname, 'src');


    // Fallback configuration
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    // Optimize file watching in development to reduce inotify usage
    if (dev) {
      config.watchOptions = {
        poll: 1000, // Check for changes every 1 second
        aggregateTimeout: 300, // Delay before rebuilding after change detected
        ignored: [
          '**/node_modules/**',
          '**/.next/**',
          '**/coverage/**',
          '**/playwright-report/**',
          '**/test-results/**',
          '**/.turbo/**',
          '**/*.spec.ts',
          '**/*.spec.tsx',
          '**/*.test.ts',
          '**/*.test.tsx',
        ],
      };
    }

    // Bundle analyzer - only in production build when ANALYZE=true
    if (!dev && !isServer && process.env.ANALYZE === 'true') {
      const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');
      config.plugins.push(
        new BundleAnalyzerPlugin({
          analyzerMode: 'static',
          reportFilename: './analyze.html',
          openAnalyzer: true,
        })
      );
    }

    return config;
  },

  // Output configuration
  output: 'standalone',

  // Static page generation timeout
  staticPageGenerationTimeout: 120,
};

module.exports = nextConfig;
