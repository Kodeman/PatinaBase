import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { CacheService } from '../cache.service';
import { CACHE_KEY_METADATA, CACHE_TTL_METADATA } from '../decorators/cache-key.decorator';

/**
 * NestJS interceptor for automatic response caching
 * Works with @CacheKey and @CacheTTL decorators
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest();
    const method = request.method;

    // Only cache GET requests
    if (method !== 'GET') {
      return next.handle();
    }

    const keyPattern = this.reflector.get<string>(
      CACHE_KEY_METADATA,
      context.getHandler(),
    );

    const ttl = this.reflector.get<number>(
      CACHE_TTL_METADATA,
      context.getHandler(),
    );

    // If no cache key pattern is defined, skip caching
    if (!keyPattern) {
      return next.handle();
    }

    const cacheKey = this.buildCacheKey(keyPattern, request);

    // Try to get cached response
    const cachedResponse = await this.cacheService.get(cacheKey);
    if (cachedResponse !== null) {
      return of(cachedResponse);
    }

    // If no cached response, execute handler and cache result
    return next.handle().pipe(
      tap(async (response) => {
        if (response !== null && response !== undefined) {
          await this.cacheService.set(cacheKey, response, ttl);
        }
      }),
    );
  }

  /**
   * Build cache key from pattern and request
   * Supports :param placeholders for route params and :query for query params
   */
  private buildCacheKey(
    pattern: string,
    request: Record<string, unknown> & {
      params?: Record<string, string>;
      query?: Record<string, string>;
    },
  ): string {
    let key = pattern;

    // Replace route params (e.g., :id)
    if (request.params) {
      Object.keys(request.params).forEach((param) => {
        key = key.replace(`:${param}`, request.params![param]);
      });
    }

    // Replace query params (e.g., :page, :limit)
    if (request.query) {
      Object.keys(request.query).forEach((param) => {
        key = key.replace(`:${param}`, request.query![param]);
      });
    }

    // Remove any remaining placeholders (optional params that weren't provided)
    key = key.replace(/::[\w]+/g, '');

    return key;
  }
}
