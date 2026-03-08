export default () => ({
  app: {
    name: process.env.SERVICE_NAME || 'orders',
    env: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3002', 10),
  },
  database: {
    url: process.env.DATABASE_URL,
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '2', 10),
    cacheTtl: parseInt(process.env.REDIS_CACHE_TTL || '900', 10),
  },
  jwt: {
    secret: process.env.JWT_SECRET ||
      (process.env.NODE_ENV === 'development'
        ? 'dev-jwt-fallback-secret-only-for-local-development-min-32-chars'
        : undefined),
    issuer: process.env.JWT_ISSUER || 'patina-user-management',
    audience: process.env.JWT_AUDIENCE || 'patina-api',
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    apiVersion: process.env.STRIPE_API_VERSION || '2023-10-16',
  },
  oci: {
    region: process.env.OCI_REGION || 'us-ashburn-1',
    tenancyId: process.env.OCI_TENANCY_ID,
    userId: process.env.OCI_USER_ID,
    fingerprint: process.env.OCI_FINGERPRINT,
    privateKeyPath: process.env.OCI_PRIVATE_KEY_PATH,
    compartmentId: process.env.OCI_COMPARTMENT_ID,
    streaming: {
      endpoint: process.env.OCI_STREAM_ENDPOINT,
      streamIdOrder: process.env.OCI_STREAM_ID_ORDER,
      streamIdPayment: process.env.OCI_STREAM_ID_PAYMENT,
      streamIdRefund: process.env.OCI_STREAM_ID_REFUND,
    },
    objectStorage: {
      namespace: process.env.OCI_NAMESPACE,
      bucketReceipts: process.env.OCI_BUCKET_RECEIPTS,
      bucketExports: process.env.OCI_BUCKET_EXPORTS,
    },
    vault: {
      vaultId: process.env.OCI_VAULT_ID,
      secretStripeKey: process.env.OCI_SECRET_STRIPE_KEY,
      secretWebhook: process.env.OCI_SECRET_WEBHOOK,
    },
  },
  apiGateway: {
    url: process.env.API_GATEWAY_URL,
    useApiGateway: process.env.USE_API_GATEWAY === 'true',
  },
  cart: {
    expiryDays: parseInt(process.env.CART_EXPIRY_DAYS || '30', 10),
    cacheTtlSeconds: parseInt(process.env.CART_CACHE_TTL_SECONDS || '3600', 10),
  },
  order: {
    numberPrefix: process.env.ORDER_NUMBER_PREFIX || 'ORD',
    paymentTimeoutMinutes: parseInt(process.env.PAYMENT_TIMEOUT_MINUTES || '30', 10),
  },
  reconciliation: {
    cron: process.env.RECONCILIATION_CRON || '0 */6 * * *',
    windowHours: parseInt(process.env.RECONCILIATION_WINDOW_HOURS || '24', 10),
  },
  shipping: {
    carrierProvider: process.env.CARRIER_PROVIDER || 'easypost',
    easypost: {
      apiKey: process.env.EASYPOST_API_KEY,
      webhookSecret: process.env.EASYPOST_WEBHOOK_SECRET,
      mode: process.env.EASYPOST_MODE || 'test',
      defaultFromAddressId: process.env.EASYPOST_DEFAULT_FROM_ADDRESS_ID,
    },
  },
  rateLimit: {
    ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
    limit: parseInt(process.env.THROTTLE_LIMIT || '60', 10),
  },
  observability: {
    logLevel: process.env.LOG_LEVEL || 'info',
    logFormat: process.env.LOG_FORMAT || 'json',
    otelEndpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    otelServiceName: process.env.OTEL_SERVICE_NAME || 'patina-orders',
    otelTracesSampler: process.env.OTEL_TRACES_SAMPLER || 'parentbased_traceidratio',
    otelTracesSamplerArg: parseFloat(process.env.OTEL_TRACES_SAMPLER_ARG || '0.1'),
  },
  security: {
    corsOrigins: process.env.CORS_ORIGINS?.split(',') || [],
  },
});
