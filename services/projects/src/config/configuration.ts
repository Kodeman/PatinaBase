export default () => ({
  app: {
    name: process.env.SERVICE_NAME || 'projects',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3004', 10),
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
    cacheTtl: parseInt(process.env.REDIS_TTL || '3600', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET ||
      (process.env.NODE_ENV === 'development'
        ? 'dev-jwt-fallback-secret-only-for-local-development-min-32-chars'
        : undefined),
    issuer: process.env.JWT_ISSUER || 'patina-user-management',
    audience: process.env.JWT_AUDIENCE || 'patina-api',
    accessTokenTtl: process.env.JWT_ACCESS_TOKEN_TTL || '1h',
  },
  oci: {
    objectStorage: {
      namespace: process.env.OCI_NAMESPACE,
      bucketName: process.env.OCI_BUCKET_NAME,
      region: process.env.OCI_REGION || 'us-ashburn-1',
    },
    streaming: {
      endpoint: process.env.OCI_STREAM_ENDPOINT,
      streamId: process.env.OCI_STREAM_OCID,
    },
  },
  services: {
    proposals: process.env.PROPOSALS_SERVICE_URL || 'http://localhost:3002',
    catalog: process.env.CATALOG_SERVICE_URL || 'http://localhost:3001',
    orders: process.env.ORDERS_SERVICE_URL || 'http://localhost:3003',
    comms: process.env.COMMS_SERVICE_URL || 'http://localhost:3005',
    media: process.env.MEDIA_SERVICE_URL || 'http://localhost:3006',
  },
  security: {
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || [],
  },
});
