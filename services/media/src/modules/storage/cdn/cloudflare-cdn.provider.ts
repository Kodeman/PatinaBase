/**
 * Cloudflare CDN Provider
 * Uses Cloudflare API for cache management and R2 public buckets for delivery.
 *
 * Cloudflare handles Brotli, HTTP/3, and edge compression automatically —
 * those methods are no-ops here. Cache purge uses the Cloudflare Zone API.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ICDNProvider,
  PurgeOptions,
  EdgeRule,
  SecurityHeaders,
  CacheStats,
  CachePolicy,
} from './cdn-provider.interface';

@Injectable()
export class CloudflareCDNProvider implements ICDNProvider {
  private readonly logger = new Logger(CloudflareCDNProvider.name);
  private readonly zoneId: string;
  private readonly apiToken: string;
  private readonly domainName: string;
  private readonly apiBase = 'https://api.cloudflare.com/client/v4';

  constructor(private configService: ConfigService) {
    this.zoneId = this.configService.get('CF_ZONE_ID') || '';
    this.apiToken = this.configService.get('CF_API_TOKEN') || '';
    this.domainName = this.configService.get('CDN_DOMAIN', 'cdn.patina.cloud') || 'cdn.patina.cloud';
  }

  async purgeCache(options: PurgeOptions): Promise<{ invalidationId: string }> {
    try {
      const body: Record<string, any> = {};

      if (options.purgeAll) {
        body.purge_everything = true;
      } else if (options.paths && options.paths.length > 0) {
        // Cloudflare expects full URLs for file purge
        body.files = options.paths.map((p) => {
          const cleanPath = p.startsWith('/') ? p.substring(1) : p;
          return `https://${this.domainName}/${cleanPath}`;
        });
      } else if (options.tags && options.tags.length > 0) {
        // Cache Tags purge (Enterprise only, but include for interface compliance)
        body.tags = options.tags;
      } else if (options.pattern) {
        // Prefix purge (Enterprise) — fall back to wildcard URL
        const cleanPattern = options.pattern.startsWith('/') ? options.pattern.substring(1) : options.pattern;
        body.files = [`https://${this.domainName}/${cleanPattern}`];
      } else {
        body.purge_everything = true;
      }

      const response = await fetch(`${this.apiBase}/zones/${this.zoneId}/purge_cache`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const result = await response.json() as any;

      if (!result.success) {
        const errors = result.errors?.map((e: any) => e.message).join(', ') || 'Unknown error';
        throw new Error(`Cloudflare cache purge failed: ${errors}`);
      }

      const invalidationId = result.result?.id || `cf-purge-${Date.now()}`;
      this.logger.log(`Purged Cloudflare cache: ${invalidationId}`);

      return { invalidationId };
    } catch (error) {
      this.logger.error(`Failed to purge Cloudflare cache: ${error.message}`, error.stack);
      throw error;
    }
  }

  async preloadContent(paths: string[]): Promise<void> {
    // Warm the cache by issuing HEAD requests to the CDN
    this.logger.log(`Preloading ${paths.length} paths to Cloudflare edge`);

    const fetchPromises = paths.map(async (path) => {
      try {
        const url = this.getCDNUrl(path);
        const response = await fetch(url, { method: 'HEAD' });
        this.logger.debug(`Preloaded ${path}: ${response.status}`);
      } catch (error) {
        this.logger.warn(`Failed to preload ${path}: ${error.message}`);
      }
    });

    await Promise.allSettled(fetchPromises);
  }

  getCDNUrl(key: string, options?: { protocol?: 'http' | 'https' }): string {
    const protocol = options?.protocol || 'https';
    const cleanKey = key.startsWith('/') ? key.substring(1) : key;
    return `${protocol}://${this.domainName}/${cleanKey}`;
  }

  async getSignedUrl(key: string, _expiresIn: number): Promise<string> {
    // R2 presigned URLs are generated at the storage layer (S3-compatible),
    // not at the CDN layer. For public R2 buckets, return the plain CDN URL.
    // For private buckets, the media service generates S3 presigned URLs directly.
    return this.getCDNUrl(key);
  }

  async setEdgeRules(_rules: EdgeRule[]): Promise<void> {
    // Cloudflare edge rules are managed via Workers, Page Rules, or Transform Rules
    // in the Cloudflare dashboard/API. This is not configurable via this provider
    // at runtime — configure via wrangler or the dashboard.
    this.logger.warn(
      'Cloudflare edge rules should be configured via Workers or Page Rules in the dashboard',
    );
  }

  async setSecurityHeaders(_headers: SecurityHeaders): Promise<void> {
    // Security headers on Cloudflare are handled by:
    // 1. Cloudflare Managed Headers (automatic)
    // 2. Transform Rules (dashboard)
    // 3. Workers (for custom logic)
    // The Cloudflare Tunnel config already sets security headers.
    this.logger.warn(
      'Cloudflare security headers should be configured via Transform Rules or Workers',
    );
  }

  async getCacheStats(startTime: Date, endTime: Date): Promise<CacheStats> {
    try {
      // Use Cloudflare GraphQL Analytics API
      const query = `
        query {
          viewer {
            zones(filter: { zoneTag: "${this.zoneId}" }) {
              httpRequests1dGroups(
                limit: 100,
                filter: {
                  date_geq: "${startTime.toISOString().split('T')[0]}",
                  date_leq: "${endTime.toISOString().split('T')[0]}"
                }
              ) {
                sum {
                  requests
                  bytes
                  cachedRequests
                  cachedBytes
                }
              }
            }
          }
        }
      `;

      const response = await fetch('https://api.cloudflare.com/client/v4/graphql', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      });

      const result = await response.json() as any;
      const groups = result.data?.viewer?.zones?.[0]?.httpRequests1dGroups || [];

      let totalRequests = 0;
      let totalBytes = 0;
      let cachedRequests = 0;

      for (const group of groups) {
        totalRequests += group.sum.requests;
        totalBytes += group.sum.bytes;
        cachedRequests += group.sum.cachedRequests;
      }

      const hitRate = totalRequests > 0 ? cachedRequests / totalRequests : 0;

      return {
        hitRate,
        missRate: 1 - hitRate,
        bandwidth: totalBytes,
        requests: totalRequests,
        edgeLocations: [
          // Cloudflare has 300+ edge locations — representative subset
          'IAD (Ashburn, VA)',
          'DFW (Dallas, TX)',
          'LAX (Los Angeles, CA)',
          'LHR (London, UK)',
          'FRA (Frankfurt, Germany)',
          'SIN (Singapore)',
          'NRT (Tokyo, Japan)',
          'SYD (Sydney, Australia)',
        ],
      };
    } catch (error) {
      this.logger.error(`Failed to get Cloudflare cache stats: ${error.message}`, error.stack);

      return {
        hitRate: 0,
        missRate: 1,
        bandwidth: 0,
        requests: 0,
        edgeLocations: [],
      };
    }
  }

  async setCacheBehavior(_pathPattern: string, _policy: CachePolicy): Promise<void> {
    // Cache behavior on Cloudflare is managed via:
    // 1. Cache Rules (dashboard/API)
    // 2. Page Rules (legacy)
    // 3. Workers (programmatic)
    this.logger.warn(
      'Cloudflare cache behaviors should be configured via Cache Rules in the dashboard',
    );
  }

  async setBrotliCompression(_enabled: boolean): Promise<void> {
    // Cloudflare enables Brotli automatically for all plans.
    this.logger.debug('Brotli compression is automatic on Cloudflare — no action needed');
  }

  async setHTTP3Support(_enabled: boolean): Promise<void> {
    // Cloudflare enables HTTP/3 (QUIC) automatically.
    this.logger.debug('HTTP/3 is automatic on Cloudflare — no action needed');
  }
}
