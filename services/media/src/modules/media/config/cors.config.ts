import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

/**
 * CORS configuration for media service
 */
export const corsConfig: CorsOptions = {
  // Allowed origins
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Allowed origins from environment
    const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);

    // Development mode - allow all localhost/127.0.0.1
    if (process.env.NODE_ENV === 'development') {
      if (
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.includes('0.0.0.0')
      ) {
        return callback(null, true);
      }
    }

    // Production mode - check allowed origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    // Reject
    callback(new Error('Not allowed by CORS'));
  },

  // Allowed methods
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

  // Allowed headers
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Content-Type',
    'Accept',
    'Origin',
    'Idempotency-Key',
  ],

  // Exposed headers
  exposedHeaders: [
    'X-Total-Count',
    'X-Page',
    'X-Per-Page',
    'X-Total-Pages',
    'Content-Range',
    'Link',
  ],

  // Allow credentials
  credentials: true,

  // Preflight cache duration (in seconds)
  maxAge: 86400, // 24 hours
};

/**
 * File upload CORS configuration (more permissive for presigned URLs)
 */
export const uploadCorsConfig: CorsOptions = {
  ...corsConfig,
  origin: '*', // Allow all origins for upload URLs (secured by presigned URL)
  credentials: false,
};

/**
 * CDN CORS configuration (public assets)
 */
export const cdnCorsConfig: CorsOptions = {
  origin: '*', // Public CDN - allow all origins
  methods: ['GET', 'HEAD', 'OPTIONS'],
  allowedHeaders: ['Accept', 'Accept-Language', 'Content-Language', 'Range'],
  exposedHeaders: ['Accept-Ranges', 'Content-Range', 'Content-Length', 'Content-Type'],
  credentials: false,
  maxAge: 604800, // 7 days
};
