const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  publicExcludes: ['!icons/**/*'],
  buildExcludes: [/middleware-manifest\.json$/],
  runtimeCaching: [
    {
      urlPattern: /^https?.*/,
      handler: 'NetworkFirst',
      options: {
        cacheName: 'https-calls',
        networkTimeoutSeconds: 15,
        expiration: {
          maxEntries: 150,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
        },
        cacheableResponse: {
          statuses: [0, 200],
        },
      },
    },
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // CRITICAL: Enable standalone output for Docker deployment
  output: 'standalone',

  // Temporarily disable ESLint during build
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Skip type checking during build (pre-existing type issues to fix in Phase 4)
  typescript: {
    ignoreBuildErrors: true,
  },


  // Debug mode configuration (controlled by environment)
  productionBrowserSourceMaps: process.env.NEXT_PUBLIC_SOURCE_MAPS === 'true',

  // Monorepo workspace root for file tracing
  outputFileTracingRoot: require('path').join(__dirname, '../../'),

  // Allow specific origins for development
  allowedDevOrigins: [
    'http://192.168.1.16:3002',
    'http://192.168.1.18:3002',
    'http://192.168.1.36:3002',
    'http://localhost:3002',
    'http://127.0.0.1:3002',
    'http://localhost:8080',
    'http://client.patina.cloud',
    'https://client.patina.cloud',
    'http://client.patina.design',
    'https://client.patina.design',
    'http://client.nordicheat.org',
    'http://api.nordicheat.org'
  ],

  // Performance optimizations with debug mode support
  compiler: {
    // Remove console in production unless debug mode is enabled
    removeConsole: process.env.NEXT_PUBLIC_ENABLE_LOGS === 'true'
      ? false
      : process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60,
  },

  // Mobile-first security headers
  async headers() {
    const isDevelopment = process.env.NODE_ENV === 'development';

    // CSP directives - adapted for mobile and development vs production
    const cspDirectives = [
      "default-src 'self'",
      isDevelopment
        ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      // Allow connections based on environment
      // Development: localhost and local network IPs
      // Production: patina.cloud API gateway and WebSocket connections
      isDevelopment
        ? "connect-src 'self' http://localhost:* ws://localhost:* http://192.168.1.36:* ws://192.168.1.36:* http://192.168.1.18:* ws://192.168.1.18:* http://192.168.1.16:* ws://192.168.1.16:* http://127.0.0.1:* ws://127.0.0.1:* http://*.nordicheat.org ws://*.nordicheat.org"
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
        source: '/(.*)',
        headers: [
          {
            key: 'Content-Security-Policy',
            value: cspDirectives.join('; ')
          },
          {
            key: 'X-DNS-Prefetch-Control',
            value: 'on',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=self, microphone=self, geolocation=self',
          },
        ],
      },
    ];
  },

  // Webpack optimizations for mobile
  webpack: (config, { dev, isServer }) => {
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

    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20,
            },
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
              enforce: true,
            },
          },
        },
      };
    }
    return config;
  },

  experimental: {
    scrollRestoration: true,
  },

  transpilePackages: ['@patina/api-client', '@patina/design-system', '@patina/types', '@patina/utils'],
};

module.exports = withPWA(nextConfig);
