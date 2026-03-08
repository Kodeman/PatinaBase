import { SetMetadata } from '@nestjs/common';

import {
  CacheKey,
  CacheTTL,
  CACHE_KEY_METADATA,
  CACHE_TTL_METADATA,
} from '../cache-key.decorator';

// Mock SetMetadata
jest.mock('@nestjs/common', () => ({
  SetMetadata: jest.fn((key, value) => {
    return (target: Record<string, unknown>, propertyKey?: string, descriptor?: PropertyDescriptor) => {
      if (!target.__metadata__) {
        target.__metadata__ = {};
      }
      (target.__metadata__ as Record<string, unknown>)[key] = value;
      return descriptor;
    };
  }),
}));

describe('Cache Decorators', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('CACHE_KEY_METADATA', () => {
    it('should export correct metadata key', () => {
      expect(CACHE_KEY_METADATA).toBe('cache:key');
    });
  });

  describe('CACHE_TTL_METADATA', () => {
    it('should export correct metadata key', () => {
      expect(CACHE_TTL_METADATA).toBe('cache:ttl');
    });
  });

  describe('CacheKey', () => {
    it('should call SetMetadata with correct parameters', () => {
      const keyPattern = 'products:list:page::page';

      CacheKey(keyPattern);

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, keyPattern);
    });

    it('should work with simple key patterns', () => {
      const _decorator = CacheKey('simple:key');

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, 'simple:key');
    });

    it('should work with complex key patterns', () => {
      const pattern = 'category::categoryId:products:page::page:limit::limit';
      const _decorator = CacheKey(pattern);

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, pattern);
    });

    it('should work with key patterns containing placeholders', () => {
      const _decorator = CacheKey('user::userId:profile');

      expect(SetMetadata).toHaveBeenCalledWith(
        CACHE_KEY_METADATA,
        'user::userId:profile',
      );
    });

    it('should work with static keys without placeholders', () => {
      const _decorator = CacheKey('static:cache:key');

      expect(SetMetadata).toHaveBeenCalledWith(
        CACHE_KEY_METADATA,
        'static:cache:key',
      );
    });

    it('should handle empty string', () => {
      const _decorator = CacheKey('');

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, '');
    });

    it('should handle keys with special characters', () => {
      const _decorator = CacheKey('products:search:query::q:filter::category');

      expect(SetMetadata).toHaveBeenCalledWith(
        CACHE_KEY_METADATA,
        'products:search:query::q:filter::category',
      );
    });

    it('should be used as a decorator on methods', () => {
      class _TestController {
        @CacheKey('test:method')
        testMethod() {
          return 'test';
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, 'test:method');
    });

    it('should support multiple decorators on different methods', () => {
      class _TestController {
        @CacheKey('method1:key')
        method1() {
          return 'test1';
        }

        @CacheKey('method2:key')
        method2() {
          return 'test2';
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, 'method1:key');
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, 'method2:key');
    });
  });

  describe('CacheTTL', () => {
    it('should call SetMetadata with correct parameters', () => {
      const ttl = 300;

      CacheTTL(ttl);

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, ttl);
    });

    it('should work with short TTL', () => {
      CacheTTL(60); // 1 minute

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 60);
    });

    it('should work with long TTL', () => {
      CacheTTL(86400); // 24 hours

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 86400);
    });

    it('should work with zero TTL', () => {
      CacheTTL(0);

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 0);
    });

    it('should work with negative TTL', () => {
      CacheTTL(-1);

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, -1);
    });

    it('should be used as a decorator on methods', () => {
      class _TestController {
        @CacheTTL(600)
        testMethod() {
          return 'test';
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 600);
    });

    it('should support multiple decorators on different methods', () => {
      class _TestController {
        @CacheTTL(300)
        method1() {
          return 'test1';
        }

        @CacheTTL(600)
        method2() {
          return 'test2';
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 300);
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 600);
    });
  });

  describe('Combined decorators', () => {
    it('should work when both CacheKey and CacheTTL are used together', () => {
      class _TestController {
        @CacheKey('products:list')
        @CacheTTL(300)
        getProducts() {
          return [];
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, 'products:list');
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 300);
    });

    it('should work in different order', () => {
      class _TestController {
        @CacheTTL(600)
        @CacheKey('users:list')
        getUsers() {
          return [];
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, 'users:list');
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 600);
    });

    it('should support multiple methods with different cache configurations', () => {
      class _TestController {
        @CacheKey('products:hot')
        @CacheTTL(60)
        getHotProducts() {
          return [];
        }

        @CacheKey('products:all')
        @CacheTTL(3600)
        getAllProducts() {
          return [];
        }

        @CacheKey('product::id')
        @CacheTTL(300)
        getProductById(_id: string) {
          return {};
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, 'products:hot');
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 60);
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, 'products:all');
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 3600);
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_KEY_METADATA, 'product::id');
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 300);
    });
  });

  describe('Real-world usage patterns', () => {
    it('should support REST API endpoint caching pattern', () => {
      class _ProductController {
        @CacheKey('products:list:page::page:limit::limit')
        @CacheTTL(300)
        getProducts(_page: number, _limit: number) {
          return [];
        }

        @CacheKey('product:detail::id')
        @CacheTTL(600)
        getProductById(_id: string) {
          return {};
        }

        @CacheKey('products:category::categoryId:page::page')
        @CacheTTL(300)
        getProductsByCategory(_categoryId: string, _page: number) {
          return [];
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(
        CACHE_KEY_METADATA,
        'products:list:page::page:limit::limit',
      );
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 300);
    });

    it('should support search endpoint caching pattern', () => {
      class _SearchController {
        @CacheKey('search:products:q::query:page::page')
        @CacheTTL(180)
        searchProducts(_query: string, _page: number) {
          return [];
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(
        CACHE_KEY_METADATA,
        'search:products:q::query:page::page',
      );
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 180);
    });

    it('should support user-specific caching pattern', () => {
      class _UserController {
        @CacheKey('user:profile::userId')
        @CacheTTL(600)
        getUserProfile(_userId: string) {
          return {};
        }

        @CacheKey('user:orders::userId:page::page')
        @CacheTTL(120)
        getUserOrders(_userId: string, _page: number) {
          return [];
        }
      }

      expect(SetMetadata).toHaveBeenCalledWith(
        CACHE_KEY_METADATA,
        'user:profile::userId',
      );
      expect(SetMetadata).toHaveBeenCalledWith(CACHE_TTL_METADATA, 600);
    });
  });
});
