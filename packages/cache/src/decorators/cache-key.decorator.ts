import { SetMetadata } from '@nestjs/common';

export const CACHE_KEY_METADATA = 'cache:key';
export const CACHE_TTL_METADATA = 'cache:ttl';

/**
 * Decorator to specify cache key pattern for a route handler
 * @param keyPattern - Pattern for cache key (supports :param placeholders)
 * Example: @CacheKey('products:list:page::page:limit::limit')
 */
export const CacheKey = (keyPattern: string) =>
  SetMetadata(CACHE_KEY_METADATA, keyPattern);

/**
 * Decorator to specify cache TTL for a route handler
 * @param ttl - Time to live in seconds
 * Example: @CacheTTL(300) // 5 minutes
 */
export const CacheTTL = (ttl: number) => SetMetadata(CACHE_TTL_METADATA, ttl);
