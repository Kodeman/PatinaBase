/**
 * CDN Provider Interface
 * Defines common interface for CDN providers (CloudFront, Fastly, etc.)
 */

export enum CDNProvider {
  CLOUDFRONT = 'CLOUDFRONT',
  FASTLY = 'FASTLY',
  CLOUDFLARE = 'CLOUDFLARE',
  AKAMAI = 'AKAMAI',
}

export enum CachePolicy {
  NO_CACHE = 'NO_CACHE',
  SHORT = 'SHORT', // 5 minutes
  MEDIUM = 'MEDIUM', // 1 hour
  LONG = 'LONG', // 24 hours
  IMMUTABLE = 'IMMUTABLE', // 1 year
}

export interface PurgeOptions {
  paths?: string[];
  tags?: string[];
  pattern?: string;
  purgeAll?: boolean;
}

export interface EdgeRule {
  id: string;
  name: string;
  priority: number;
  conditions: {
    pathPattern?: string;
    queryString?: Record<string, string>;
    headers?: Record<string, string>;
  };
  actions: {
    cachePolicy?: CachePolicy;
    customHeaders?: Record<string, string>;
    redirect?: { url: string; statusCode: number };
    rewrite?: string;
  };
}

export interface SecurityHeaders {
  contentSecurityPolicy?: string;
  strictTransportSecurity?: string;
  xFrameOptions?: string;
  xContentTypeOptions?: string;
  referrerPolicy?: string;
  permissionsPolicy?: string;
}

export interface CacheStats {
  hitRate: number;
  missRate: number;
  bandwidth: number;
  requests: number;
  edgeLocations: string[];
}

export interface ICDNProvider {
  /**
   * Purge cached content
   */
  purgeCache(options: PurgeOptions): Promise<{ invalidationId: string }>;

  /**
   * Preload content to edge locations
   */
  preloadContent(paths: string[]): Promise<void>;

  /**
   * Get CDN URL for a given key
   */
  getCDNUrl(key: string, options?: { protocol?: 'http' | 'https' }): string;

  /**
   * Get signed URL with time-based access control
   */
  getSignedUrl(key: string, expiresIn: number): Promise<string>;

  /**
   * Configure edge computing rules
   */
  setEdgeRules(rules: EdgeRule[]): Promise<void>;

  /**
   * Configure security headers
   */
  setSecurityHeaders(headers: SecurityHeaders): Promise<void>;

  /**
   * Get cache statistics
   */
  getCacheStats(startTime: Date, endTime: Date): Promise<CacheStats>;

  /**
   * Configure cache behavior for path pattern
   */
  setCacheBehavior(pathPattern: string, policy: CachePolicy): Promise<void>;

  /**
   * Enable/disable Brotli compression
   */
  setBrotliCompression(enabled: boolean): Promise<void>;

  /**
   * Enable/disable HTTP/3 support
   */
  setHTTP3Support(enabled: boolean): Promise<void>;
}
