// next-pwa wraps the Next config with a webpack plugin (InjectManifest/
// GenerateSW) that writes a service worker into `public/` during the build.
// The @opennextjs/cloudflare adapter runs its own `next build` and then
// repackages the output for Workers; next-pwa's build-time fs writes and
// webpack-plugin assumptions aren't part of that adapter's tested surface,
// and losing the service worker is an acceptable regression, but a broken
// Workers build is not. Skip the wrap entirely for Cloudflare builds
// (`OPEN_NEXT=true`, set by the deploy invocation — see wrangler.jsonc /
// deploy notes) and fall back to an identity function.
const withPWA =
  process.env.OPEN_NEXT === 'true'
    ? (config) => config
    : require('next-pwa')({
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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'cdn.patina.cloud',
        pathname: '/**',
      },
    ],
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
        : "script-src 'self' 'unsafe-inline' https://us-assets.i.posthog.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https: blob:",
      "font-src 'self' data:",
      // Allow connections based on environment
      // Development: localhost and local network IPs
      // Production: patina.cloud API gateway and WebSocket connections
      isDevelopment
        ? "connect-src 'self' http://localhost:* ws://localhost:* http://192.168.1.36:* ws://192.168.1.36:* http://192.168.1.18:* ws://192.168.1.18:* http://192.168.1.16:* ws://192.168.1.16:* http://127.0.0.1:* ws://127.0.0.1:* http://*.nordicheat.org ws://*.nordicheat.org"
        : "connect-src 'self' https://bkvcixdmuyejfzcijpdg.supabase.co wss://bkvcixdmuyejfzcijpdg.supabase.co https://api.patina.cloud wss://api.patina.cloud https://*.patina.cloud wss://*.patina.cloud https://*.sanity.io wss://*.sanity.io https://us.i.posthog.com https://us-assets.i.posthog.com https://*.posthog.com",
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

  // F3 — `@patina/help-system` joins the transpilePackages list so Next can
  // process the workspace package's TS sources directly (no dist build step).
  // Mirrors the designer-portal + admin-portal wiring from Sprint 2 C6/F1.
  transpilePackages: [
    '@patina/api-client',
    '@patina/design-system',
    '@patina/help-system',
    '@patina/types',
    '@patina/utils',
  ],

  experimental: {
    // Default Server Actions body limit is 1MB. The no-login field page
    // (src/app/field/[token]/) lets guests attach a phone camera photo
    // (2-6MB raw) to a Problem report via a Server Action — the default
    // limit rejects the request during body parsing, before the action
    // handler runs, which surfaces the root error boundary. The client
    // already downscales the photo before submit (field-actions.tsx), but
    // this raises the ceiling as the backstop for whatever gets through.
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
};

module.exports = withPWA(nextConfig);
