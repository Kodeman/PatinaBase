import { CallHandler, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';

import { CacheService } from '../../cache.service';
import { CacheInterceptor } from '../cache.interceptor';

describe('CacheInterceptor', () => {
  let interceptor: CacheInterceptor;
  let cacheService: jest.Mocked<CacheService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
    };

    const mockReflector = {
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CacheInterceptor,
        {
          provide: CacheService,
          useValue: mockCacheService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    interceptor = module.get<CacheInterceptor>(CacheInterceptor);
    cacheService = module.get(CacheService) as jest.Mocked<CacheService>;
    reflector = module.get(Reflector) as jest.Mocked<Reflector>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const createMockExecutionContext = (
    method: string = 'GET',
    params: Record<string, unknown> = {},
    query: Record<string, unknown> = {},
  ): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          params,
          query,
        }),
      }),
      getHandler: jest.fn(),
    } as unknown as ExecutionContext;
  };

  const createMockCallHandler = (data: unknown): CallHandler => {
    return {
      handle: jest.fn().mockReturnValue(of(data)),
    } as unknown as CallHandler;
  };

  describe('intercept', () => {
    it('should skip caching for non-GET requests', async () => {
      const context = createMockExecutionContext('POST');
      const handler = createMockCallHandler({ data: 'test' });

      await interceptor.intercept(context, handler);

      expect(handler.handle).toHaveBeenCalled();
      expect(cacheService.get).not.toHaveBeenCalled();
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should skip caching when no cache key is defined', async () => {
      reflector.get.mockReturnValue(undefined);
      const context = createMockExecutionContext('GET');
      const handler = createMockCallHandler({ data: 'test' });

      await interceptor.intercept(context, handler);

      expect(handler.handle).toHaveBeenCalled();
      expect(cacheService.get).not.toHaveBeenCalled();
    });

    it('should return cached response when available', async () => {
      const cachedData = { id: 1, name: 'Cached' };
      reflector.get.mockReturnValueOnce('products:list'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(cachedData);

      const context = createMockExecutionContext('GET');
      const handler = createMockCallHandler({ id: 2, name: 'Fresh' });

      const result = await interceptor.intercept(context, handler);

      const data = await new Promise((resolve) => {
        result.subscribe(resolve);
      });

      expect(cacheService.get).toHaveBeenCalledWith('products:list');
      expect(data).toEqual(cachedData);
      expect(handler.handle).not.toHaveBeenCalled();
    });

    it('should execute handler and cache result when not cached', async () => {
      const freshData = { id: 2, name: 'Fresh' };
      reflector.get.mockReturnValueOnce('products:list'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(300); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const context = createMockExecutionContext('GET');
      const handler = createMockCallHandler(freshData);

      const result = await interceptor.intercept(context, handler);

      const data = await new Promise((resolve) => {
        result.subscribe(resolve);
      });

      expect(cacheService.get).toHaveBeenCalledWith('products:list');
      expect(handler.handle).toHaveBeenCalled();
      expect(data).toEqual(freshData);

      // Wait for async cache set
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(cacheService.set).toHaveBeenCalledWith('products:list', freshData, 300);
    });

    it('should not cache null responses', async () => {
      reflector.get.mockReturnValueOnce('products:list'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);

      const context = createMockExecutionContext('GET');
      const handler = createMockCallHandler(null);

      const result = await interceptor.intercept(context, handler);

      await new Promise((resolve) => {
        result.subscribe(resolve);
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should not cache undefined responses', async () => {
      reflector.get.mockReturnValueOnce('products:list'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);

      const context = createMockExecutionContext('GET');
      const handler = createMockCallHandler(undefined);

      const result = await interceptor.intercept(context, handler);

      await new Promise((resolve) => {
        result.subscribe(resolve);
      });

      // Wait for async operations
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(cacheService.set).not.toHaveBeenCalled();
    });

    it('should replace route params in cache key', async () => {
      reflector.get.mockReturnValueOnce('product:detail::id'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const context = createMockExecutionContext('GET', { id: '123' });
      const handler = createMockCallHandler({ id: 123 });

      await interceptor.intercept(context, handler);

      expect(cacheService.get).toHaveBeenCalledWith('product:detail:123');
    });

    it('should replace query params in cache key', async () => {
      reflector.get.mockReturnValueOnce('products::page::limit'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const context = createMockExecutionContext('GET', {}, { page: '1', limit: '10' });
      const handler = createMockCallHandler([]);

      await interceptor.intercept(context, handler);

      expect(cacheService.get).toHaveBeenCalledWith('products:1:10');
    });

    it('should replace both route and query params in cache key', async () => {
      reflector.get.mockReturnValueOnce('category::categoryId:products::page'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const context = createMockExecutionContext(
        'GET',
        { categoryId: '456' },
        { page: '2' },
      );
      const handler = createMockCallHandler([]);

      await interceptor.intercept(context, handler);

      expect(cacheService.get).toHaveBeenCalledWith('category:456:products:2');
    });

    it('should remove optional params that are not provided', async () => {
      reflector.get.mockReturnValueOnce('products::page::limit'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const context = createMockExecutionContext('GET', {}, { page: '1' }); // No limit
      const handler = createMockCallHandler([]);

      await interceptor.intercept(context, handler);

      // Pattern 'products::page::limit' with page=1 and no limit
      // After replacing :page -> 1, :limit removed by regex
      expect(cacheService.get).toHaveBeenCalledWith('products:1');
    });

    it('should use custom TTL when specified', async () => {
      const freshData = { id: 1 };
      reflector.get.mockReturnValueOnce('test:key'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(600); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const context = createMockExecutionContext('GET');
      const handler = createMockCallHandler(freshData);

      const result = await interceptor.intercept(context, handler);

      await new Promise((resolve) => {
        result.subscribe(resolve);
      });

      // Wait for async cache set
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(cacheService.set).toHaveBeenCalledWith('test:key', freshData, 600);
    });

    it('should handle complex nested response data', async () => {
      const complexData = {
        items: [
          { id: 1, name: 'Item 1', metadata: { tags: ['a', 'b'] } },
          { id: 2, name: 'Item 2', metadata: { tags: ['c', 'd'] } },
        ],
        pagination: {
          page: 1,
          limit: 10,
          total: 50,
        },
      };

      reflector.get.mockReturnValueOnce('products:complex'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);
      cacheService.set.mockResolvedValue(undefined);

      const context = createMockExecutionContext('GET');
      const handler = createMockCallHandler(complexData);

      const result = await interceptor.intercept(context, handler);

      const data = await new Promise((resolve) => {
        result.subscribe(resolve);
      });

      expect(data).toEqual(complexData);

      // Wait for async cache set
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(cacheService.set).toHaveBeenCalledWith(
        'products:complex',
        complexData,
        undefined,
      );
    });
  });

  describe('buildCacheKey', () => {
    it('should handle keys with no placeholders', async () => {
      reflector.get.mockReturnValueOnce('static:key'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue({ cached: true });

      const context = createMockExecutionContext('GET');
      const handler = createMockCallHandler({ fresh: true });

      await interceptor.intercept(context, handler);

      expect(cacheService.get).toHaveBeenCalledWith('static:key');
    });

    it('should handle empty params and query', async () => {
      reflector.get.mockReturnValueOnce('test:key'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue({ cached: true });

      const context = createMockExecutionContext('GET', {}, {});
      const handler = createMockCallHandler({ fresh: true });

      await interceptor.intercept(context, handler);

      expect(cacheService.get).toHaveBeenCalledWith('test:key');
    });

    it('should replace first occurrence of param in cache key', async () => {
      reflector.get.mockReturnValueOnce('user::userId:profile'); // CACHE_KEY_METADATA
      reflector.get.mockReturnValueOnce(undefined); // CACHE_TTL_METADATA
      cacheService.get.mockResolvedValue(null);

      const context = createMockExecutionContext('GET', { userId: '789' });
      const handler = createMockCallHandler({});

      await interceptor.intercept(context, handler);

      expect(cacheService.get).toHaveBeenCalledWith('user:789:profile');
    });
  });
});
