import type { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { TokenBlacklistService } from '../token-blacklist.service';
import { CacheService } from '../cache.service';

jest.mock('ioredis');

describe('TokenBlacklistService', () => {
  let service: TokenBlacklistService;
  let cacheService: CacheService;

  const redisMock = {
    get: jest.fn(),
    setex: jest.fn().mockResolvedValue('OK'),
    set: jest.fn().mockResolvedValue('OK'),
    del: jest.fn().mockResolvedValue(1),
    keys: jest.fn(),
    mget: jest.fn(),
    pipeline: jest.fn(),
    exists: jest.fn(),
    incrby: jest.fn(),
    ttl: jest.fn(),
    expire: jest.fn(),
    on: jest.fn(),
    scanStream: jest.fn(),
    info: jest.fn(),
    dbsize: jest.fn(),
    quit: jest.fn(),
  };

  const pipeline = {
    setex: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(undefined),
  };

  interface ConfigValueMap {
    'redis.host': string;
    'redis.port': number;
    'redis.password': undefined;
    'redis.db': number;
    'redis.cacheTtl': number;
  }

  const configValues: ConfigValueMap = {
    'redis.host': 'localhost',
    'redis.port': 6379,
    'redis.password': undefined,
    'redis.db': 0,
    'redis.cacheTtl': 300,
  };

  const configService = {
    get: <T,>(key: string, defaultValue?: T): T => {
      const value = configValues[key as keyof ConfigValueMap];
      return (value !== undefined ? value : defaultValue) as T;
    },
  } as ConfigService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock implementation
    (Redis as unknown as jest.Mock).mockImplementation(() => redisMock);
    redisMock.pipeline.mockReturnValue(pipeline);

    cacheService = new CacheService(configService);
    service = new TokenBlacklistService(cacheService);

    // Reset metrics before each test
    service.resetMetrics();
  });

  describe('addToBlacklist', () => {
    it('should add token to blacklist with TTL', async () => {
      const jti = 'test-token-123';
      const ttl = 900; // 15 minutes

      redisMock.setex.mockResolvedValueOnce('OK');
      redisMock.exists.mockResolvedValueOnce(1);

      await service.addToBlacklist(jti, ttl);

      expect(redisMock.setex).toHaveBeenCalledWith(
        'token:blacklist:test-token-123',
        900,
        JSON.stringify('1')
      );

      const isBlacklisted = await service.isBlacklisted(jti);
      expect(isBlacklisted).toBe(true);
    });

    it('should not add token with empty jti', async () => {
      await service.addToBlacklist('', 900);

      expect(redisMock.setex).not.toHaveBeenCalled();
    });

    it('should not add token with invalid TTL', async () => {
      const jti = 'test-token-invalid-ttl';

      await service.addToBlacklist(jti, 0);
      await service.addToBlacklist(jti, -100);

      expect(redisMock.setex).not.toHaveBeenCalled();
    });

    it('should re-throw Redis errors for caller to handle', async () => {
      const jti = 'test-token-error';

      // Mock CacheService.set to reject
      jest.spyOn(cacheService, 'set').mockRejectedValueOnce(new Error('Redis unavailable'));

      await expect(service.addToBlacklist(jti, 900)).rejects.toThrow('Redis unavailable');
    });
  });

  describe('isBlacklisted', () => {
    it('should return true for blacklisted token', async () => {
      const jti = 'blacklisted-token';

      redisMock.exists.mockResolvedValueOnce(1);

      const result = await service.isBlacklisted(jti);

      expect(result).toBe(true);
      expect(redisMock.exists).toHaveBeenCalledWith('token:blacklist:blacklisted-token');
    });

    it('should return false for non-blacklisted token', async () => {
      const jti = 'non-blacklisted-token';

      redisMock.exists.mockResolvedValueOnce(0);

      const result = await service.isBlacklisted(jti);

      expect(result).toBe(false);
    });

    it('should return false for empty jti', async () => {
      const result = await service.isBlacklisted('');

      expect(result).toBe(false);
      expect(redisMock.exists).not.toHaveBeenCalled();
    });

    it('should fail-open (return false) if Redis is unavailable', async () => {
      const jti = 'test-token-failopen';

      redisMock.exists.mockRejectedValueOnce(new Error('Redis connection lost'));

      const result = await service.isBlacklisted(jti);

      // Should return false (fail-open) to prevent service outage
      expect(result).toBe(false);
    });

    it('should update metrics on check', async () => {
      const jti1 = 'token-1';
      const jti2 = 'token-2';

      redisMock.exists
        .mockResolvedValueOnce(1) // Hit
        .mockResolvedValueOnce(0) // Miss
        .mockResolvedValueOnce(0); // Miss

      await service.isBlacklisted(jti1); // Hit
      await service.isBlacklisted(jti2); // Miss
      await service.isBlacklisted(jti2); // Miss

      const stats = await service.getBlacklistStats();

      expect(stats.checkCount).toBe(3);
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(2);
      expect(stats.hitRate).toBeCloseTo(33.33, 1);
    });
  });

  describe('removeFromBlacklist', () => {
    it('should remove token from blacklist', async () => {
      const jti = 'removable-token';

      redisMock.del.mockResolvedValueOnce(1);

      await service.removeFromBlacklist(jti);

      expect(redisMock.del).toHaveBeenCalledWith('token:blacklist:removable-token');
    });

    it('should handle removing non-existent token', async () => {
      redisMock.del.mockResolvedValueOnce(0);

      await expect(service.removeFromBlacklist('non-existent')).resolves.not.toThrow();
    });

    it('should handle empty jti', async () => {
      await expect(service.removeFromBlacklist('')).resolves.not.toThrow();
      expect(redisMock.del).not.toHaveBeenCalled();
    });

    it('should re-throw error if Redis operation fails', async () => {
      const jti = 'error-token';

      jest.spyOn(cacheService, 'del').mockRejectedValueOnce(new Error('Redis error'));

      await expect(service.removeFromBlacklist(jti)).rejects.toThrow('Redis error');
    });
  });

  describe('getBlacklistStats', () => {
    it('should return correct statistics', async () => {
      service.resetMetrics();

      redisMock.exists
        .mockResolvedValueOnce(1) // Hit
        .mockResolvedValueOnce(0); // Miss

      await service.isBlacklisted('token-1'); // Hit
      await service.isBlacklisted('token-3'); // Miss

      redisMock.info.mockResolvedValueOnce('used_memory_human:1.5M\n');
      redisMock.dbsize.mockResolvedValueOnce(100);

      const stats = await service.getBlacklistStats();

      expect(stats.checkCount).toBe(2);
      expect(stats.hitCount).toBe(1);
      expect(stats.missCount).toBe(1);
      expect(stats.hitRate).toBe(50);
    });

    it('should handle zero checks gracefully', async () => {
      service.resetMetrics();

      redisMock.info.mockResolvedValueOnce('used_memory_human:1.5M\n');
      redisMock.dbsize.mockResolvedValueOnce(0);

      const stats = await service.getBlacklistStats();

      expect(stats.checkCount).toBe(0);
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
      expect(stats.hitRate).toBe(0);
    });

    it('should return metrics even if Redis is down', async () => {
      service.resetMetrics();

      redisMock.exists.mockResolvedValueOnce(0);

      // Perform some checks to populate metrics
      await service.isBlacklisted('token-1');

      // Mock Redis error for stats call
      redisMock.info.mockRejectedValueOnce(new Error('Redis down'));

      const stats = await service.getBlacklistStats();

      // Should still return in-memory metrics
      expect(stats.checkCount).toBe(1);
      expect(stats.count).toBe(-1); // Indicates count not available
    });
  });

  describe('resetMetrics', () => {
    it('should reset all metrics to zero', async () => {
      redisMock.exists.mockResolvedValueOnce(1);

      await service.isBlacklisted('token-1');

      service.resetMetrics();

      const stats = await service.getBlacklistStats();

      expect(stats.checkCount).toBe(0);
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('calculateRemainingTTL', () => {
    it('should calculate correct remaining TTL', () => {
      const now = Math.floor(Date.now() / 1000);
      const expInFuture = now + 900; // 15 minutes from now

      const ttl = TokenBlacklistService.calculateRemainingTTL(expInFuture);

      expect(ttl).toBeGreaterThanOrEqual(899); // Account for execution time
      expect(ttl).toBeLessThanOrEqual(900);
    });

    it('should return 0 for expired token', () => {
      const now = Math.floor(Date.now() / 1000);
      const expInPast = now - 100; // Expired 100 seconds ago

      const ttl = TokenBlacklistService.calculateRemainingTTL(expInPast);

      expect(ttl).toBe(0);
    });

    it('should return 0 for current timestamp', () => {
      const now = Math.floor(Date.now() / 1000);

      const ttl = TokenBlacklistService.calculateRemainingTTL(now);

      expect(ttl).toBe(0);
    });
  });

  describe('addBatchToBlacklist', () => {
    it('should add multiple tokens to blacklist', async () => {
      const tokens = [
        { jti: 'batch-token-1', ttl: 900 },
        { jti: 'batch-token-2', ttl: 900 },
        { jti: 'batch-token-3', ttl: 900 },
      ];

      pipeline.exec.mockResolvedValueOnce(undefined);

      await service.addBatchToBlacklist(tokens);

      expect(redisMock.pipeline).toHaveBeenCalled();
      expect(pipeline.setex).toHaveBeenCalledTimes(3);
      expect(pipeline.exec).toHaveBeenCalled();
    });

    it('should handle empty batch', async () => {
      await expect(service.addBatchToBlacklist([])).resolves.not.toThrow();
      expect(redisMock.pipeline).not.toHaveBeenCalled();
    });

    it('should handle different TTLs in batch', async () => {
      const tokens = [
        { jti: 'short-ttl', ttl: 1 },
        { jti: 'long-ttl', ttl: 3600 },
      ];

      pipeline.exec.mockResolvedValueOnce(undefined);

      await service.addBatchToBlacklist(tokens);

      expect(pipeline.setex).toHaveBeenCalledWith(
        'token:blacklist:short-ttl',
        1,
        JSON.stringify('1')
      );
      expect(pipeline.setex).toHaveBeenCalledWith(
        'token:blacklist:long-ttl',
        3600,
        JSON.stringify('1')
      );
    });

    it('should re-throw error if Redis batch operation fails', async () => {
      const tokens = [
        { jti: 'batch-error-1', ttl: 900 },
      ];

      jest.spyOn(cacheService, 'mset').mockRejectedValueOnce(new Error('Redis batch failed'));

      await expect(service.addBatchToBlacklist(tokens)).rejects.toThrow('Redis batch failed');
    });
  });

  describe('key generation', () => {
    it('should generate correct Redis keys', async () => {
      const jti = 'test-jti-123';

      redisMock.exists.mockResolvedValueOnce(0);

      await service.isBlacklisted(jti);

      expect(redisMock.exists).toHaveBeenCalledWith('token:blacklist:test-jti-123');
    });
  });
});
