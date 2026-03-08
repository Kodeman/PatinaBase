import type { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { CacheService } from '../cache.service';

jest.mock('ioredis');

describe('CacheService', () => {
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
    on: jest.fn(),
    scanStream: jest.fn(),
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
  } as unknown as ConfigService;

  beforeEach(() => {
    Object.values(redisMock).forEach((mock) => {
      if (typeof mock?.mockReset === 'function') {
        mock.mockReset();
      }
    });
    // Re-setup default mock implementations after reset
    redisMock.setex.mockResolvedValue('OK');
    redisMock.set.mockResolvedValue('OK');
    redisMock.del.mockResolvedValue(1);

    Object.values(pipeline).forEach((mock) => mock.mockClear());
    redisMock.pipeline.mockReturnValue(pipeline);
    (Redis as unknown as jest.Mock).mockImplementation(() => redisMock);
  });

  it('stores and retrieves values with default TTL', async () => {
    const service = new CacheService(configService);
    redisMock.get.mockResolvedValueOnce(JSON.stringify({ ok: true }));

    await service.set('cache:key', { ok: true });
    const value = await service.get('cache:key');

    expect(redisMock.setex).toHaveBeenCalledWith('cache:key', 300, JSON.stringify({ ok: true }));
    expect(value).toEqual({ ok: true });
  });

  it('falls back to non-expiring set when ttl is zero', async () => {
    const service = new CacheService(configService);

    await service.set('cache:permanent', { ok: true }, 0);
    expect(redisMock.set).toHaveBeenCalledWith('cache:permanent', JSON.stringify({ ok: true }));
  });

  it('deletes keys and patterns', async () => {
    const service = new CacheService(configService);

    // Mock scanStream to return an event emitter
    const mockStream: any = {
      on: jest.fn((event: string, callback: any): any => {
        if (event === 'data') {
          // Simulate finding keys
          callback(['cache:1', 'cache:2']);
        } else if (event === 'end') {
          // Simulate stream completion
          setTimeout(() => callback(), 0);
        }
        return mockStream;
      }),
    };
    redisMock.scanStream.mockReturnValue(mockStream);

    await service.del('cache:1');
    await service.delPattern('cache:*');

    // Verify single key deletion
    expect(redisMock.del).toHaveBeenCalledWith('cache:1');
    // Verify pattern deletion (keys passed as spread arguments)
    expect(redisMock.del).toHaveBeenCalledWith('cache:1', 'cache:2');
  });

  it('supports batched get and set', async () => {
    const service = new CacheService(configService);
    redisMock.mget.mockResolvedValue([JSON.stringify({ id: 1 }), null]);

    const [first, second] = await service.mget(['a', 'b']);
    await service.mset([
      { key: 'a', value: { id: 1 } },
      { key: 'b', value: { id: 2 }, ttl: 10 },
    ]);

    expect(first).toEqual({ id: 1 });
    expect(second).toBeNull();
    expect(redisMock.pipeline).toHaveBeenCalled();
    expect(pipeline.setex).toHaveBeenCalledWith('b', 10, JSON.stringify({ id: 2 }));
  });

  it('exposes existence, increment, and ttl helpers', async () => {
    const service = new CacheService(configService);
    redisMock.exists.mockResolvedValue(1);
    redisMock.incrby.mockResolvedValue(2);
    redisMock.ttl.mockResolvedValue(120);

    expect(await service.exists('cache:key')).toBe(true);
    expect(await service.incr('cache:key')).toBe(2);
    expect(await service.ttl('cache:key')).toBe(120);
  });
});
