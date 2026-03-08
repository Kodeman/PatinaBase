/**
 * CDN Manager Service
 * Orchestrates CDN operations across multiple providers with intelligent caching
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ICDNProvider,
  CDNProvider,
  PurgeOptions,
  EdgeRule,
  SecurityHeaders,
  CachePolicy,
} from './cdn-provider.interface';
import { CloudFrontCDNProvider } from './cloudfront-cdn.provider';

export interface DeliveryOptimization {
  adaptiveBitrate: boolean;
  lazyLoading: boolean;
  geoDNS: boolean;
  http3: boolean;
  brotli: boolean;
  webpAuto: boolean;
  avifAuto: boolean;
}

export interface PreloadStrategy {
  critical: string[]; // Always preload
  high: string[]; // Preload during off-peak
  low: string[]; // Preload on-demand
}

@Injectable()
export class CDNManagerService {
  private readonly logger = new Logger(CDNManagerService.name);
  private providers: Map<CDNProvider, ICDNProvider>;
  private activeProvider: CDNProvider;
  private deliveryConfig: DeliveryOptimization;

  constructor(
    private configService: ConfigService,
    private cloudFrontProvider: CloudFrontCDNProvider,
  ) {
    this.providers = new Map([[CDNProvider.CLOUDFRONT, cloudFrontProvider]]);

    this.activeProvider =
      (configService.get('CDN_PROVIDER') as CDNProvider) || CDNProvider.CLOUDFRONT;

    this.deliveryConfig = {
      adaptiveBitrate: configService.get('CDN_ADAPTIVE_BITRATE', 'true') === 'true',
      lazyLoading: configService.get('CDN_LAZY_LOADING', 'true') === 'true',
      geoDNS: configService.get('CDN_GEO_DNS', 'true') === 'true',
      http3: configService.get('CDN_HTTP3', 'true') === 'true',
      brotli: configService.get('CDN_BROTLI', 'true') === 'true',
      webpAuto: configService.get('CDN_WEBP_AUTO', 'true') === 'true',
      avifAuto: configService.get('CDN_AVIF_AUTO', 'true') === 'true',
    };
  }

  /**
   * Get optimized CDN URL for asset
   */
  getCDNUrl(
    key: string,
    options?: {
      width?: number;
      height?: number;
      format?: 'webp' | 'avif' | 'jpeg' | 'png';
      quality?: number;
      lazyLoad?: boolean;
    },
  ): string {
    const provider = this.getProvider();
    let url = provider.getCDNUrl(key);

    // Add image transformation parameters if supported
    if (options) {
      const params = new URLSearchParams();

      if (options.width) params.append('w', options.width.toString());
      if (options.height) params.append('h', options.height.toString());
      if (options.format) params.append('f', options.format);
      if (options.quality) params.append('q', options.quality.toString());

      // Add lazy loading hint
      if (options.lazyLoad && this.deliveryConfig.lazyLoading) {
        params.append('loading', 'lazy');
      }

      if (params.toString()) {
        url += `?${params.toString()}`;
      }
    }

    return url;
  }

  /**
   * Get signed URL with expiration
   */
  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const provider = this.getProvider();
    return provider.getSignedUrl(key, expiresInSeconds);
  }

  /**
   * Purge cache by various strategies
   */
  async purgeCache(options: PurgeOptions): Promise<{ invalidationId: string }> {
    const provider = this.getProvider();

    this.logger.log(
      `Purging CDN cache: ${options.purgeAll ? 'ALL' : JSON.stringify(options)}`,
    );

    return provider.purgeCache(options);
  }

  /**
   * Purge cache by tags (for tagged content)
   */
  async purgeCacheByTags(tags: string[]): Promise<{ invalidationId: string }> {
    return this.purgeCache({ tags });
  }

  /**
   * Purge cache by pattern (wildcard support)
   */
  async purgeCacheByPattern(pattern: string): Promise<{ invalidationId: string }> {
    return this.purgeCache({ pattern });
  }

  /**
   * Purge specific paths
   */
  async purgeCachePaths(paths: string[]): Promise<{ invalidationId: string }> {
    return this.purgeCache({ paths });
  }

  /**
   * Preload critical assets to edge locations
   */
  async preloadCriticalAssets(strategy: PreloadStrategy): Promise<void> {
    const provider = this.getProvider();

    // Preload critical assets immediately
    if (strategy.critical.length > 0) {
      this.logger.log(`Preloading ${strategy.critical.length} critical assets`);
      await provider.preloadContent(strategy.critical);
    }

    // Schedule high-priority assets for off-peak preload
    if (strategy.high.length > 0) {
      this.logger.log(`Scheduling ${strategy.high.length} high-priority assets for preload`);
      // In production, queue these for off-peak processing
      setTimeout(() => {
        provider.preloadContent(strategy.high);
      }, 3600000); // 1 hour delay
    }
  }

  /**
   * Configure edge computing rules
   */
  async configureEdgeRules(rules: EdgeRule[]): Promise<void> {
    const provider = this.getProvider();
    await provider.setEdgeRules(rules);
    this.logger.log(`Configured ${rules.length} edge rules`);
  }

  /**
   * Setup security headers for all content
   */
  async setupSecurityHeaders(): Promise<void> {
    const provider = this.getProvider();

    const headers: SecurityHeaders = {
      contentSecurityPolicy:
        "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'",
      strictTransportSecurity: 'max-age=31536000; includeSubDomains; preload',
      xFrameOptions: 'SAMEORIGIN',
      xContentTypeOptions: 'nosniff',
      referrerPolicy: 'strict-origin-when-cross-origin',
      permissionsPolicy: 'geolocation=(), microphone=(), camera=()',
    };

    await provider.setSecurityHeaders(headers);
    this.logger.log('Configured CDN security headers');
  }

  /**
   * Configure cache policies for different content types
   */
  async setupCachePolicies(): Promise<void> {
    const provider = this.getProvider();

    const policies = [
      // Images: Long cache with immutable for processed images
      { pattern: '/processed/images/*', policy: CachePolicy.IMMUTABLE },
      { pattern: '/thumbnails/*', policy: CachePolicy.LONG },

      // Raw uploads: Medium cache (might be reprocessed)
      { pattern: '/raw/*', policy: CachePolicy.MEDIUM },

      // 3D models: Immutable (rarely change)
      { pattern: '/processed/3d/*', policy: CachePolicy.IMMUTABLE },

      // Previews: Long cache
      { pattern: '/previews/*', policy: CachePolicy.LONG },

      // API responses: Short cache
      { pattern: '/api/*', policy: CachePolicy.SHORT },

      // Dynamic content: No cache
      { pattern: '/dynamic/*', policy: CachePolicy.NO_CACHE },
    ];

    for (const { pattern, policy } of policies) {
      await provider.setCacheBehavior(pattern, policy);
    }

    this.logger.log(`Configured ${policies.length} cache policies`);
  }

  /**
   * Enable delivery optimizations
   */
  async enableDeliveryOptimizations(): Promise<void> {
    const provider = this.getProvider();

    // Enable HTTP/3
    if (this.deliveryConfig.http3) {
      await provider.setHTTP3Support(true);
      this.logger.log('Enabled HTTP/3 support');
    }

    // Enable Brotli compression
    if (this.deliveryConfig.brotli) {
      await provider.setBrotliCompression(true);
      this.logger.log('Enabled Brotli compression');
    }

    // Configure adaptive bitrate rules
    if (this.deliveryConfig.adaptiveBitrate) {
      await this.configureAdaptiveBitrate();
    }
  }

  /**
   * Get CDN performance analytics
   */
  async getPerformanceAnalytics(
    startTime: Date,
    endTime: Date,
  ): Promise<{
    cacheHitRate: number;
    bandwidth: number;
    requests: number;
    avgLatency: number;
    edgeLocations: string[];
    recommendations: string[];
  }> {
    const provider = this.getProvider();
    const stats = await provider.getCacheStats(startTime, endTime);

    const recommendations = this.generateRecommendations(stats);

    return {
      cacheHitRate: stats.hitRate,
      bandwidth: stats.bandwidth,
      requests: stats.requests,
      avgLatency: this.calculateAvgLatency(stats),
      edgeLocations: stats.edgeLocations,
      recommendations,
    };
  }

  /**
   * Get bandwidth monitoring report
   */
  async getBandwidthReport(
    startTime: Date,
    endTime: Date,
  ): Promise<{
    totalBandwidth: number;
    costEstimate: number;
    topPaths: Array<{ path: string; bandwidth: number; percentage: number }>;
  }> {
    const provider = this.getProvider();
    const stats = await provider.getCacheStats(startTime, endTime);

    // AWS CloudFront pricing: ~$0.085/GB for first 10TB
    const costPerGB = 0.085;
    const bandwidthGB = stats.bandwidth / (1024 * 1024 * 1024);
    const costEstimate = bandwidthGB * costPerGB;

    return {
      totalBandwidth: stats.bandwidth,
      costEstimate,
      topPaths: [], // Would require detailed CloudWatch Logs analysis
    };
  }

  /**
   * Configure GeoDNS for optimal edge location routing
   */
  async configureGeoDNS(): Promise<void> {
    if (!this.deliveryConfig.geoDNS) {
      this.logger.log('GeoDNS is disabled');
      return;
    }

    // GeoDNS is typically handled at DNS level (Route 53)
    // Configure edge rules for region-specific optimizations
    const geoRules: EdgeRule[] = [
      {
        id: 'geo-apac',
        name: 'APAC Optimization',
        priority: 20,
        conditions: {
          headers: { 'CloudFront-Viewer-Country': 'JP,SG,AU,IN,CN' },
        },
        actions: {
          cachePolicy: CachePolicy.LONG,
          customHeaders: {
            'X-Edge-Region': 'APAC',
          },
        },
      },
      {
        id: 'geo-eu',
        name: 'Europe Optimization',
        priority: 21,
        conditions: {
          headers: { 'CloudFront-Viewer-Country': 'GB,DE,FR,IT,ES' },
        },
        actions: {
          cachePolicy: CachePolicy.LONG,
          customHeaders: {
            'X-Edge-Region': 'EU',
          },
        },
      },
      {
        id: 'geo-us',
        name: 'US Optimization',
        priority: 22,
        conditions: {
          headers: { 'CloudFront-Viewer-Country': 'US' },
        },
        actions: {
          cachePolicy: CachePolicy.LONG,
          customHeaders: {
            'X-Edge-Region': 'US',
          },
        },
      },
    ];

    await this.configureEdgeRules(geoRules);
    this.logger.log('Configured GeoDNS edge rules');
  }

  /**
   * Get image lazy loading hints for HTML
   */
  getImageLazyLoadingHints(key: string, width: number, height: number): {
    src: string;
    srcset: string;
    loading: 'lazy' | 'eager';
    decoding: 'async' | 'sync';
  } {
    const formats = ['avif', 'webp', 'jpeg'];
    const sizes = [
      { w: Math.floor(width * 0.5), suffix: 'sm' },
      { w: Math.floor(width * 0.75), suffix: 'md' },
      { w: width, suffix: 'lg' },
      { w: Math.floor(width * 1.5), suffix: 'xl' },
    ];

    const srcset = sizes
      .map((size) => `${this.getCDNUrl(key, { width: size.w, format: 'webp' })} ${size.w}w`)
      .join(', ');

    return {
      src: this.getCDNUrl(key, { width, height, format: 'jpeg' }),
      srcset,
      loading: this.deliveryConfig.lazyLoading ? 'lazy' : 'eager',
      decoding: 'async',
    };
  }

  private getProvider(): ICDNProvider {
    const provider = this.providers.get(this.activeProvider);
    if (!provider) {
      throw new Error(`CDN provider ${this.activeProvider} not configured`);
    }
    return provider;
  }

  private async configureAdaptiveBitrate(): Promise<void> {
    // Configure edge rules for adaptive bitrate video delivery
    const abrRules: EdgeRule[] = [
      {
        id: 'abr-high',
        name: 'High Bandwidth ABR',
        priority: 30,
        conditions: {
          pathPattern: '*.m3u8',
          headers: { 'CloudFront-Is-Desktop-Viewer': 'true' },
        },
        actions: {
          cachePolicy: CachePolicy.MEDIUM,
          customHeaders: {
            'X-ABR-Profile': 'high',
          },
        },
      },
      {
        id: 'abr-low',
        name: 'Low Bandwidth ABR',
        priority: 31,
        conditions: {
          pathPattern: '*.m3u8',
          headers: { 'CloudFront-Is-Mobile-Viewer': 'true' },
        },
        actions: {
          cachePolicy: CachePolicy.MEDIUM,
          customHeaders: {
            'X-ABR-Profile': 'low',
          },
        },
      },
    ];

    await this.configureEdgeRules(abrRules);
    this.logger.log('Configured adaptive bitrate rules');
  }

  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.hitRate < 0.7) {
      recommendations.push(
        'Cache hit rate is below 70%. Consider increasing cache TTL for static assets.',
      );
    }

    if (stats.bandwidth > 10 * 1024 * 1024 * 1024) {
      // 10GB
      recommendations.push(
        'High bandwidth usage detected. Enable Brotli compression and WebP/AVIF formats.',
      );
    }

    if (stats.requests > 1000000) {
      recommendations.push('High request volume. Consider implementing rate limiting.');
    }

    return recommendations;
  }

  private calculateAvgLatency(stats: any): number {
    // Simplified latency calculation
    // In production, pull from CloudWatch detailed metrics
    return 50; // ms
  }
}
