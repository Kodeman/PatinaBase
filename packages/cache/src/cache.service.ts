import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * Redis-based caching service for NestJS services
 * Provides smart caching with TTLs, cache invalidation, and metrics tracking
 */
@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly redis: Redis;
  private readonly defaultTtl: number;
  private readonly logger = new Logger(CacheService.name);

  // Cache metrics
  private hitCount = 0;
  private missCount = 0;
  private totalRequests = 0;

  constructor(private readonly configService: ConfigService) {
    const redisConfig = {
      host: this.configService.get<string>('REDIS_HOST') || this.configService.get<string>('redis.host', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT') || this.configService.get<number>('redis.port', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD') || this.configService.get<string>('redis.password') || 'patina_redis_password',
      db: this.configService.get<number>('REDIS_DB') || this.configService.get<number>('redis.db', 0),
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
      maxRetriesPerRequest: 3,
    };

    this.redis = new Redis(redisConfig);
    this.defaultTtl = this.configService.get<number>('REDIS_CACHE_TTL') || this.configService.get<number>('redis.cacheTtl', 3600);

    this.redis.on('error', (err) => {
      console.error('Redis Client Error:', err);
    });

    this.redis.on('connect', () => {
      console.warn('Redis Client Connected');
    });
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      this.totalRequests++;
      const value = await this.redis.get(key);

      if (!value) {
        this.missCount++;
        this.logger.debug(`[CACHE MISS] ${key}`);
        return null;
      }

      this.hitCount++;
      this.logger.debug(`[CACHE HIT] ${key}`);
      return JSON.parse(value) as T;
    } catch (error) {
      console.error(`Error getting cache key ${key}:`, error);
      this.missCount++;
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const serialized = JSON.stringify(value);
      const expiry = ttl !== undefined ? ttl : this.defaultTtl;

      if (expiry > 0) {
        await this.redis.setex(key, expiry, serialized);
      } else {
        await this.redis.set(key, serialized);
      }

      this.logger.debug(`[CACHE SET] ${key} (ttl=${expiry}s)`);
    } catch (error) {
      console.error(`Error setting cache key ${key}:`, error);
    }
  }

  /**
   * Delete a specific key
   */
  async del(key: string): Promise<void> {
    try {
      await this.redis.del(key);
      this.logger.debug(`[CACHE DEL] ${key}`);
    } catch (error) {
      console.error(`Error deleting cache key ${key}:`, error);
    }
  }

  /**
   * Delete keys matching a pattern
   * Uses SCAN instead of KEYS to avoid blocking Redis
   */
  async delPattern(pattern: string): Promise<void> {
    try {
      const keysToDelete: string[] = [];

      // Use SCAN to find keys without blocking Redis
      const stream = this.redis.scanStream({
        match: pattern,
        count: 100, // Process in batches
      });

      stream.on('data', (keys: string[]) => {
        keysToDelete.push(...keys);
      });

      await new Promise<void>((resolve, reject) => {
        stream.on('end', () => resolve());
        stream.on('error', (err) => reject(err));
      });

      // Delete keys in batches to avoid overwhelming Redis
      if (keysToDelete.length > 0) {
        const batchSize = 100;
        for (let i = 0; i < keysToDelete.length; i += batchSize) {
          const batch = keysToDelete.slice(i, i + batchSize);
          await this.redis.del(...batch);
        }
        this.logger.debug(`[CACHE DEL PATTERN] ${pattern} -> ${keysToDelete.length} keys`);
      }
    } catch (error) {
      console.error(`Error deleting cache pattern ${pattern}:`, error);
    }
  }

  /**
   * Get multiple values at once (batched)
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    try {
      if (keys.length === 0) return [];

      this.totalRequests += keys.length;
      const values = await this.redis.mget(...keys);

      return values.map((value) => {
        if (!value) {
          this.missCount++;
          return null;
        }
        try {
          this.hitCount++;
          return JSON.parse(value) as T;
        } catch {
          this.missCount++;
          return null;
        }
      });
    } catch (error) {
      console.error('Error in mget:', error);
      this.missCount += keys.length;
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values at once (batched)
   */
  async mset<T>(entries: Array<{ key: string; value: T; ttl?: number }>): Promise<void> {
    try {
      const pipeline = this.redis.pipeline();

      entries.forEach(({ key, value, ttl }) => {
        const serialized = JSON.stringify(value);
        const expiry = ttl !== undefined ? ttl : this.defaultTtl;

        if (expiry > 0) {
          pipeline.setex(key, expiry, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      });

      await pipeline.exec();
    } catch (error) {
      console.error('Error in mset:', error);
    }
  }

  /**
   * Check if a key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      console.error(`Error checking existence of key ${key}:`, error);
      return false;
    }
  }

  /**
   * Increment a counter
   */
  async incr(key: string, by: number = 1): Promise<number> {
    try {
      return await this.redis.incrby(key, by);
    } catch (error) {
      console.error(`Error incrementing key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Get TTL (time to live) of a key in seconds
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      console.error(`Error getting TTL for key ${key}:`, error);
      return -1;
    }
  }

  /**
   * Set expiry on an existing key
   */
  async expire(key: string, seconds: number): Promise<boolean> {
    try {
      const result = await this.redis.expire(key, seconds);
      return result === 1;
    } catch (error) {
      console.error(`Error setting expiry for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Cache wrapper with get-or-set pattern
   * If key exists, return cached value; otherwise execute fn and cache result
   */
  async wrap<T>(
    key: string,
    fn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const result = await fn();
    await this.set(key, result, ttl);
    return result;
  }

  /**
   * Generate cache keys for common patterns
   */
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`;
  }

  /**
   * Invalidate cache by pattern (alias for delPattern)
   */
  async invalidate(pattern: string): Promise<void> {
    await this.delPattern(pattern);
  }

  /**
   * Cache invalidation helpers
   */
  async invalidateProduct(productId: string): Promise<void> {
    await this.delPattern(`product:${productId}:*`);
    await this.del(`product:${productId}`);
    await this.delPattern(`products:*`); // Invalidate list caches
  }

  async invalidateCategory(categoryId: string): Promise<void> {
    await this.delPattern(`category:${categoryId}:*`);
    await this.del(`category:${categoryId}`);
    await this.delPattern(`categories:*`); // Invalidate list caches
    await this.delPattern(`products:*`); // Products may include category info
  }

  async invalidateUser(userId: string): Promise<void> {
    await this.delPattern(`user:${userId}:*`);
    await this.del(`user:${userId}`);
  }

  async invalidateOrder(orderId: string): Promise<void> {
    await this.del(`order:${orderId}`);
    await this.delPattern(`orders:*`); // Invalidate list caches
  }

  async invalidateCart(cartId: string): Promise<void> {
    await this.del(`cart:${cartId}`);
  }

  async invalidateProject(projectId: string): Promise<void> {
    await Promise.all([
      this.del(`project:detail:${projectId}`),
      this.del(`project:stats:${projectId}`),
      this.del(`project:progress:${projectId}`),
      this.delPattern(`project:client-view:${projectId}:*`),
      this.delPattern(`project:activity:${projectId}:*`),
      this.delPattern(`project:upcoming:${projectId}:*`),
      this.delPattern('project:list:*'),
    ]);
  }

  async invalidateStyleProfile(profileId: string): Promise<void> {
    await Promise.all([
      this.del(`style-profile:detail:${profileId}`),
      this.del(`style-profile:versions:${profileId}`),
      this.delPattern(`style-profile:versions:${profileId}:*`),
      this.delPattern(`style-profile:version:${profileId}:*`),
    ]);
  }

  /**
   * Flush all cache (use with extreme caution - disabled in production)
   * SECURITY: This method should NEVER be called in production
   * Instead, use targeted delPattern() to remove specific key patterns
   *
   * @throws Error if called in production environment
   */
  async flush(): Promise<void> {
    const env = process.env.NODE_ENV || 'development';

    if (env === 'production') {
      const errorMsg = 'SECURITY: flush() is disabled in production. Use delPattern() for targeted deletion.';
      this.logger.error(errorMsg);
      throw new Error(errorMsg);
    }

    try {
      this.logger.warn('WARNING: Flushing entire Redis database. This should only happen in development/testing.');
      await this.redis.flushdb();
      this.resetMetrics();
    } catch (error) {
      console.error('Error flushing cache:', error);
      throw error;
    }
  }

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch (error) {
      console.error('Redis ping failed:', error);
      return false;
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<{
    connected: boolean;
    keys: number;
    memory: string;
    hitCount: number;
    missCount: number;
    totalRequests: number;
    hitRate: number;
  }> {
    try {
      const info = await this.redis.info('memory');
      const dbSize = await this.redis.dbsize();
      const memoryMatch = info.match(/used_memory_human:([^\r\n]+)/);
      const memory = memoryMatch ? memoryMatch[1] : 'unknown';

      const hitRate = this.totalRequests > 0
        ? (this.hitCount / this.totalRequests) * 100
        : 0;

      return {
        connected: true,
        keys: dbSize,
        memory,
        hitCount: this.hitCount,
        missCount: this.missCount,
        totalRequests: this.totalRequests,
        hitRate: parseFloat(hitRate.toFixed(2)),
      };
    } catch {
      return {
        connected: false,
        keys: 0,
        memory: 'unknown',
        hitCount: this.hitCount,
        missCount: this.missCount,
        totalRequests: this.totalRequests,
        hitRate: 0,
      };
    }
  }

  /**
   * Reset cache metrics
   */
  resetMetrics(): void {
    this.hitCount = 0;
    this.missCount = 0;
    this.totalRequests = 0;
  }

  /**
   * Get cache metrics
   */
  getMetrics(): {
    hitCount: number;
    missCount: number;
    totalRequests: number;
    hitRate: number;
  } {
    const hitRate = this.totalRequests > 0
      ? (this.hitCount / this.totalRequests) * 100
      : 0;

    return {
      hitCount: this.hitCount,
      missCount: this.missCount,
      totalRequests: this.totalRequests,
      hitRate: parseFloat(hitRate.toFixed(2)),
    };
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }
}
