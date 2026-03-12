const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,

  // CRITICAL: Enable standalone output for Docker deployment
  output: 'standalone',

  // Monorepo workspace root for file tracing
  outputFileTracingRoot: require('path').join(__dirname, '../../'),

  // Transpile monorepo packages
  transpilePackages: ['@patina/design-system', '@patina/types', '@patina/utils', '@patina/api-client', '@patina/api-routes', '@patina/supabase'],

  // Typed routes (moved from experimental in Next.js 15)
  typedRoutes: true,

  // Debug mode configuration (controlled by environment)
  productionBrowserSourceMaps: process.env.NEXT_PUBLIC_SOURCE_MAPS === 'true',

  // Compiler options for debug mode
  compiler: {
    // Remove console in production unless debug mode is enabled
    removeConsole: process.env.NEXT_PUBLIC_ENABLE_LOGS === 'true'
      ? false
      : process.env.NODE_ENV === 'production'
        ? { exclude: ['error', 'warn'] }
        : false,
  },

  // Skip ESLint during build due to ESLint 8 incompatibility with flat config
  // ESLint will still run with 'pnpm lint' using the root eslint.config.js
  eslint: {
    ignoreDuringBuilds: true,
  },

  // Allow specific origins for development
  allowedDevOrigins: [
    'http://192.168.1.16:3001',
    'http://192.168.1.18:3001',
    'http://192.168.1.36:3001',
    'http://localhost:3001',
    'http://localhost:8080',
    'http://admin.patina.cloud',
    'https://admin.patina.cloud',
    'http://admin.patina.design',
    'https://admin.patina.design',
    'http://admin.nordicheat.org',
    'http://api.nordicheat.org'
  ],

  // Image optimization
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'objectstorage.*.oraclecloud.com',
      },
    ],
    formats: ['image/avif', 'image/webp'],
  },

  // Security and CORS headers
  async headers() {
    const isDevelopment = process.env.NODE_ENV === 'development';

    // CSP directives - remove upgrade-insecure-requests in development
    const cspDirectives = [
      "default-src 'self'",
      isDevelopment
        ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
        : "script-src 'self' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data: http://192.168.1.36:* http://192.168.1.18:* http://192.168.1.16:* http://localhost:* http://127.0.0.1:*",
      // Allow connections based on environment
      // Development: localhost, local network IPs, AND patina.cloud domains (for Cloudflare tunnel access)
      // Production: patina.cloud API gateway and WebSocket connections
      isDevelopment
        ? "connect-src 'self' http://localhost:* ws://localhost:* http://*.localhost ws://*.localhost http://192.168.1.36:* ws://192.168.1.36:* http://192.168.1.18:* ws://192.168.1.18:* http://192.168.1.16:* ws://192.168.1.16:* http://127.0.0.1:* ws://127.0.0.1:* http://*.nordicheat.org ws://*.nordicheat.org https://api.patina.cloud wss://api.patina.cloud https://*.patina.cloud wss://*.patina.cloud https://*.identity.oraclecloud.com https://*.oraclecloud.com"
        : "connect-src 'self' https://api.patina.cloud wss://api.patina.cloud https://*.patina.cloud wss://*.patina.cloud https://*.identity.oraclecloud.com https://*.oraclecloud.com",
      "media-src 'self' blob:",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "block-all-mixed-content",
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
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },

  // Webpack configuration
  webpack: (config, { dev, isServer }) => {
    config.resolve.alias = {
      ...config.resolve.alias,
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

    // Exclude canvas from client-side bundles (used by jsdom in isomorphic-dompurify)
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
        fs: false,
        module: false,
      };

      // Externalize problematic dependencies
      config.externals = config.externals || [];
      config.externals.push({
        canvas: 'canvas',
      });
    }

    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
