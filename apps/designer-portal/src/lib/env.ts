/**
 * Environment variables with type safety and validation
 */

/**
 * Get API URL based on environment
 * Returns production patina.cloud URLs in production, localhost in development
 */
const getApiUrl = (serviceName: string, defaultPort: number, defaultPath: string = '/v1'): string => {
  const isDevelopment = process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development';

  // In development, use localhost
  if (isDevelopment) {
    return `http://localhost:${defaultPort}${defaultPath}`;
  }

  // In production, use patina.cloud API gateway
  return `https://api.patina.cloud/${serviceName}${defaultPath}`;
};

export const env = {
  // API URLs - Frontend should use Next.js API routes (/api/*) not backend services directly
  // API routes act as proxies with authentication handling
  apiUrl: process.env.NEXT_PUBLIC_API_URL || getApiUrl('api', 3000, ''),
  catalogApiUrl: process.env.NEXT_PUBLIC_CATALOG_API_URL || '/api/catalog',
  styleProfileApiUrl: process.env.NEXT_PUBLIC_STYLE_PROFILE_API_URL || '/api/style-profile',
  searchApiUrl: process.env.NEXT_PUBLIC_SEARCH_API_URL || '/api/search',
  ordersApiUrl: process.env.NEXT_PUBLIC_ORDERS_API_URL || '/api/orders',
  commsApiUrl: process.env.NEXT_PUBLIC_COMMS_API_URL || '/api/comms',
  projectsApiUrl: process.env.NEXT_PUBLIC_PROJECTS_API_URL || '/api/projects',
  userManagementApiUrl: process.env.NEXT_PUBLIC_USER_MANAGEMENT_API_URL || '/api/auth',
  apiTimeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000', 10),

  // OIDC Configuration
  oidc: {
    issuer: process.env.NEXT_PUBLIC_OIDC_ISSUER || '',
    clientId: process.env.NEXT_PUBLIC_OIDC_CLIENT_ID || '',
    clientSecret: process.env.OIDC_CLIENT_SECRET || '',
    redirectUri: process.env.NEXT_PUBLIC_OIDC_REDIRECT_URI || (
      (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development')
        ? 'http://designer.localhost/api/auth/callback/oci-identity-domains'
        : 'https://designer.patina.cloud/api/auth/callback/oci-identity-domains'
    ),
    scope: process.env.NEXT_PUBLIC_OIDC_SCOPE || 'openid profile email',
  },

  // NextAuth
  nextAuth: {
    url: process.env.NEXTAUTH_URL || (
      (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development')
        ? 'http://designer.localhost'
        : 'https://designer.patina.cloud'
    ),
    secret: process.env.NEXTAUTH_SECRET || '',
  },

  // Feature Flags
  features: {
    proposals: process.env.NEXT_PUBLIC_ENABLE_PROPOSALS === 'true',
    teaching: process.env.NEXT_PUBLIC_ENABLE_TEACHING === 'true',
    ruleBuilder: process.env.NEXT_PUBLIC_ENABLE_RULE_BUILDER === 'true',
    messaging: process.env.NEXT_PUBLIC_ENABLE_MESSAGING === 'true',
    exports: process.env.NEXT_PUBLIC_ENABLE_EXPORTS === 'true',
    analytics: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true',
    debug: process.env.NEXT_PUBLIC_ENABLE_DEBUG === 'true',
  },

  // WebSocket
  wsUrl: process.env.NEXT_PUBLIC_WS_URL || (
    (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development')
      ? 'ws://api.localhost/comms/ws'
      : 'wss://api.patina.cloud/comms/ws'
  ),

  // Projects WebSocket (Socket.io namespace)
  projectsWsUrl: process.env.NEXT_PUBLIC_PROJECTS_WS_URL || (
    (process.env.NODE_ENV === 'development' || process.env.NEXT_PUBLIC_ENV === 'development')
      ? 'ws://api.localhost/projects'
      : 'wss://api.patina.cloud/projects'
  ),

  // Media & CDN
  cdnUrl: process.env.NEXT_PUBLIC_CDN_URL || '',
  mediaBucket: process.env.NEXT_PUBLIC_MEDIA_BUCKET || '',

  // Environment
  nodeEnv: process.env.NODE_ENV || 'development',
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test',
  env: process.env.NEXT_PUBLIC_ENV || 'development',
} as const;

// Validate required environment variables in production RUNTIME only
// Skip validation during build phase (NEXT_PHASE will be 'phase-production-build')
// Only validate in actual production runtime when NEXT_PHASE is undefined or 'phase-production-server'
if (
  typeof window === 'undefined' &&
  env.isProduction &&
  process.env.NEXT_PHASE === 'phase-production-server'
) {
  const requiredEnvVars = [
    'NEXT_PUBLIC_OIDC_ISSUER',
    'NEXT_PUBLIC_OIDC_CLIENT_ID',
    'OIDC_CLIENT_SECRET',
    'NEXTAUTH_SECRET',
  ];

  const missing = requiredEnvVars.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
