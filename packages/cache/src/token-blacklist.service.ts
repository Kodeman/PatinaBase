import { Injectable, Logger } from '@nestjs/common';
import { CacheService } from './cache.service';

/**
 * Token Blacklist Service
 *
 * Provides Redis-based token blacklist functionality for global session revocation.
 * When a session is revoked, tokens are added to the blacklist with TTL matching
 * their remaining lifetime, ensuring revoked tokens cannot be used until expiry.
 *
 * Key Features:
 * - Fast blacklist checks (<5ms P95 target)
 * - Automatic TTL expiration (matches JWT expiry)
 * - Graceful degradation if Redis unavailable
 * - Comprehensive metrics for monitoring
 *
 * @example
 * ```typescript
 * // Add token to blacklist
 * await tokenBlacklist.addToBlacklist('abc123', 900); // 15 min TTL
 *
 * // Check if token is blacklisted
 * const isBlacklisted = await tokenBlacklist.isBlacklisted('abc123');
 * ```
 */
@Injectable()
export class TokenBlacklistService {
  private readonly logger = new Logger(TokenBlacklistService.name);
  private readonly keyPrefix = 'token:blacklist';

  // Metrics
  private checkCount = 0;
  private hitCount = 0;
  private missCount = 0;

  constructor(private readonly cacheService: CacheService) {}

  /**
   * Add a token to the blacklist
   *
   * @param jti - JWT ID (unique token identifier)
   * @param ttlSeconds - Time to live in seconds (should match remaining JWT lifetime)
   * @throws Error if Redis operation fails (caller should handle gracefully)
   */
  async addToBlacklist(jti: string, ttlSeconds: number): Promise<void> {
    if (!jti) {
      this.logger.warn('Attempted to blacklist empty jti');
      return;
    }

    if (ttlSeconds <= 0) {
      this.logger.warn(`Invalid TTL for jti ${jti}: ${ttlSeconds}s (must be > 0)`);
      return;
    }

    try {
      const key = this.generateKey(jti);
      // Store "1" as a marker value (we only care about key existence)
      await this.cacheService.set(key, '1', ttlSeconds);

      this.logger.log(`Token blacklisted: ${jti} (TTL: ${ttlSeconds}s)`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to blacklist token ${jti}: ${errorMessage}`);
      // Re-throw to allow caller to handle (e.g., log to DB as fallback)
      throw error;
    }
  }

  /**
   * Check if a token is blacklisted
   *
   * @param jti - JWT ID to check
   * @returns true if token is blacklisted, false otherwise
   *
   * IMPORTANT: If Redis is unavailable, this returns FALSE (fail-open)
   * to prevent service outage. A warning is logged for monitoring.
   */
  async isBlacklisted(jti: string): Promise<boolean> {
    if (!jti) {
      return false;
    }

    this.checkCount++;

    try {
      const key = this.generateKey(jti);
      const exists = await this.cacheService.exists(key);

      if (exists) {
        this.hitCount++;
        this.logger.debug(`Blacklist HIT: ${jti}`);
      } else {
        this.missCount++;
        this.logger.debug(`Blacklist MISS: ${jti}`);
      }

      return exists;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `Blacklist check failed for ${jti}, allowing request (fail-open): ${errorMessage}`
      );
      this.missCount++;

      // Fail-open: If Redis is down, allow the request
      // This prevents cascading failures but means revoked tokens
      // may work until Redis recovers (acceptable trade-off)
      return false;
    }
  }

  /**
   * Remove a token from the blacklist (primarily for testing)
   *
   * @param jti - JWT ID to remove
   */
  async removeFromBlacklist(jti: string): Promise<void> {
    if (!jti) {
      return;
    }

    try {
      const key = this.generateKey(jti);
      await this.cacheService.del(key);
      this.logger.debug(`Token removed from blacklist: ${jti}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to remove token ${jti} from blacklist: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Get blacklist statistics
   *
   * Returns metrics for monitoring and alerting:
   * - count: Total blacklisted tokens currently in Redis
   * - hitRate: Percentage of checks that found blacklisted tokens
   * - checkCount: Total number of blacklist checks performed
   * - hitCount: Number of blacklist hits (token was blacklisted)
   * - missCount: Number of blacklist misses (token not blacklisted)
   */
  async getBlacklistStats(): Promise<{
    count: number;
    hitRate: number;
    checkCount: number;
    hitCount: number;
    missCount: number;
  }> {
    try {
      // Count keys matching our pattern
      // Note: SCAN is used internally by CacheService to avoid blocking
      let count = 0;
      const pattern = `${this.keyPrefix}:*`;

      // Get approximate count using Redis KEYS (only safe in dev/test with low volume)
      // Production should use separate monitoring
      const stats = await this.cacheService.getStats();

      // For production, we'd use a counter key that increments on add/decrements on expire
      // For now, return -1 to indicate "not tracked" in production
      count = -1;

      const hitRate = this.checkCount > 0
        ? (this.hitCount / this.checkCount) * 100
        : 0;

      return {
        count,
        hitRate: parseFloat(hitRate.toFixed(2)),
        checkCount: this.checkCount,
        hitCount: this.hitCount,
        missCount: this.missCount,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to get blacklist stats: ${errorMessage}`);

      // Return current in-memory metrics even if Redis is down
      const hitRate = this.checkCount > 0
        ? (this.hitCount / this.checkCount) * 100
        : 0;

      return {
        count: -1,
        hitRate: parseFloat(hitRate.toFixed(2)),
        checkCount: this.checkCount,
        hitCount: this.hitCount,
        missCount: this.missCount,
      };
    }
  }

  /**
   * Reset metrics (primarily for testing)
   */
  resetMetrics(): void {
    this.checkCount = 0;
    this.hitCount = 0;
    this.missCount = 0;
    this.logger.debug('Blacklist metrics reset');
  }

  /**
   * Generate Redis key for a token
   */
  private generateKey(jti: string): string {
    return `${this.keyPrefix}:${jti}`;
  }

  /**
   * Calculate remaining TTL for a JWT token
   *
   * @param expTimestamp - JWT exp claim (seconds since epoch)
   * @returns TTL in seconds, or 0 if token already expired
   */
  static calculateRemainingTTL(expTimestamp: number): number {
    const now = Math.floor(Date.now() / 1000);
    const remaining = expTimestamp - now;
    return Math.max(0, remaining);
  }

  /**
   * Bulk add tokens to blacklist (for session family revocation)
   *
   * @param tokens - Array of { jti, ttl } objects
   */
  async addBatchToBlacklist(tokens: Array<{ jti: string; ttl: number }>): Promise<void> {
    if (!tokens || tokens.length === 0) {
      return;
    }

    try {
      // Use Redis pipeline for atomic batch operation
      const entries = tokens.map(({ jti, ttl }) => ({
        key: this.generateKey(jti),
        value: '1',
        ttl,
      }));

      await this.cacheService.mset(entries);

      this.logger.log(`Batch blacklisted ${tokens.length} tokens`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to batch blacklist tokens: ${errorMessage}`);
      throw error;
    }
  }
}
