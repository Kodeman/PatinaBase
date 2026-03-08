import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CacheService } from './cache.service';
import { TokenBlacklistService } from './token-blacklist.service';

/**
 * Global cache module that provides Redis caching services
 * Import this module in your app.module.ts to enable caching
 *
 * Note: CacheInterceptor is exported from this package but should be applied
 * at the controller/method level using @UseInterceptors(CacheInterceptor)
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [CacheService, TokenBlacklistService],
  exports: [CacheService, TokenBlacklistService],
})
export class CacheModule {}
