# @patina/cache

Shared Redis caching utilities for Patina microservices. The module wraps
ioredis and provides guard rails so individual services can adopt consistent
key conventions, TTLs, and invalidation behaviour.

## Features

- NestJS cache interceptor for automatic response caching
- Decorators for cache key patterns and TTL configuration
- Cache invalidation helpers
- Cache metrics tracking (hit/miss ratio)
- Support for batched operations (mget/mset)

## Installation

```bash
pnpm add @patina/cache
```

## Usage

### 1. Import the CacheModule

```typescript
import { CacheModule } from '@patina/cache';

@Module({
  imports: [
    ConfigModule.forRoot(),
    CacheModule, // Import globally
    // ... other modules
  ],
})
export class AppModule {}
```

### 2. Use the Cache Interceptor

```typescript
import { Controller, Get, UseInterceptors } from '@nestjs/common';
import { CacheInterceptor, CacheKey, CacheTTL } from '@patina/cache';

@Controller('products')
@UseInterceptors(CacheInterceptor)
export class ProductsController {
  @Get()
  @CacheKey('products:list:page::page:limit::limit')
  @CacheTTL(300) // 5 minutes
  async findAll(@Query('page') page: number, @Query('limit') limit: number) {
    // This response will be cached
    return this.productsService.findAll({ page, limit });
  }

  @Get(':id')
  @CacheKey('product::id')
  @CacheTTL(600) // 10 minutes
  async findOne(@Param('id') id: string) {
    // This response will be cached with the product ID in the key
    return this.productsService.findOne(id);
  }
}
```

### 3. Manual Cache Operations

```typescript
import { CacheService } from '@patina/cache';

@Injectable()
export class ProductsService {
  constructor(private readonly cacheService: CacheService) {}

  async updateProduct(id: string, data: UpdateProductDto) {
    const product = await this.prisma.product.update({
      where: { id },
      data,
    });

    // Invalidate cache after mutation
    await this.cacheService.invalidateProduct(id);

    return product;
  }

  async getPopularProducts() {
    return this.cacheService.wrap(
      'products:popular',
      async () => {
        return this.prisma.product.findMany({
          where: { status: 'published' },
          orderBy: { viewCount: 'desc' },
          take: 10,
        });
      },
      1800, // 30 minutes
    );
  }
}
```

### 4. Cache Metrics

```typescript
import { CacheService } from '@patina/cache';

@Controller('health')
export class HealthController {
  constructor(private readonly cacheService: CacheService) {}

  @Get('cache')
  async getCacheStats() {
    return this.cacheService.getStats();
  }
}
```

## Configuration

Ensure your Redis configuration is set in your environment:

```typescript
// config/redis.config.ts
export default () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    cacheTtl: parseInt(process.env.REDIS_CACHE_TTL, 10) || 3600,
  },
});
```

## Cache Key Conventions

> Keys are intentionally explicit so that on-call engineers can reason about
> hot keys directly in Redis. Avoid hashing unless the payload would exceed the
> 512 byte soft limit.

All first-party services follow the `<domain>:<scope>:<segments...>` pattern.
Use the helper builders exported by `@patina/cache` to avoid drift:

| Helper | Example output | Purpose |
| ------ | --------------- | ------- |
| `buildProductCacheKey('detail', { productId: 'prod_123' })` | `product:detail:prod_123` | Product lookups (catalog, PDP) |
| `buildProjectCacheKey('list', { userId: 'user_1', role: 'designer', filters: { status: 'active', page: 1, limit: 20 } })` | `project:list:user:user_1:role:designer`<br>`filters:{"limit":20,"page":1,"status":"active"}` | Paginated project queries |
| `buildProjectCacheKey('detail', { projectId: 'proj_42' })` | `project:detail:proj_42` | Project detail/overview |
| `buildStyleProfileCacheKey('detail', { profileId: 'profile_9' })` | `style-profile:detail:profile_9` | Style profile read models |

When a helper requires structured input (filters, pagination, etc.) the
payload is stable-sorted and JSON encoded so the same parameter set always maps
to the same key.

### TTL Guidelines

The `CacheService` applies sensible defaults, but services should set TTLs to
match data volatility. Recommended values:

| Scope | Suggested TTL | Notes |
| ----- | ------------- | ----- |
| `project:detail` | 300 seconds | Project details change infrequently; five minutes keeps dashboards responsive |
| `project:stats`, `project:progress` | 120 seconds | Aggregations that react quickly to task updates |
| `project:list` | 60 seconds | Designers expect near real-time board updates |
| `project:activity`, `project:upcoming` | 30–60 seconds | Activity feeds and upcoming milestones refresh rapidly |
| `style-profile:detail` | 300 seconds | Profile explainability rarely changes more than a few times per session |
| `style-profile:versions` | 120 seconds | Version history updates on recomputes/restores |

Prefer shorter TTLs if the endpoint has high mutation rates; longer values are
acceptable for read-only aggregates.

## Cache Builders and Invalidation

`@patina/cache` exposes deterministic builders and matching invalidation
helpers:

```typescript
import {
  buildProjectCacheKey,
  buildStyleProfileCacheKey,
  buildProductCacheKey,
  CacheService,
} from '@patina/cache';

const detailKey = buildProjectCacheKey('detail', { projectId: 'proj_42' });
const listKey = buildProjectCacheKey('list', {
  userId: 'designer_7',
  role: 'designer',
  filters: { status: 'active', page: 1, limit: 25 },
});

await cacheService.wrap(detailKey, () => this.repo.getProject('proj_42'), 300);
await cacheService.invalidateProject('proj_42');
```

The invalidation helpers fan out to the appropriate key families (`project:list:*`,
`style-profile:versions:<id>*`, etc.). This keeps mutation hooks readable while
ensuring high-traffic read paths are flushed immediately after writes.
