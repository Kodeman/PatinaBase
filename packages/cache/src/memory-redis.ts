import { EventEmitter } from 'events';

/**
 * In-process stand-in for the subset of the ioredis API that CacheService
 * uses, for deployments with no Redis (REDIS_DISABLED=true — e.g. Cloudflare
 * Containers). Cache entries live in the instance's memory: correct for a
 * single-instance service, best-effort otherwise (a cold start or second
 * instance simply starts empty — it is a cache).
 */

interface Entry {
  value: string;
  expiresAt: number | null; // epoch ms
}

function globToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${escaped.replace(/\*/g, '.*').replace(/\?/g, '.')}$`);
}

export class MemoryRedis {
  private store = new Map<string, Entry>();

  private live(key: string): Entry | null {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt !== null && e.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return e;
  }

  async get(key: string): Promise<string | null> {
    return this.live(key)?.value ?? null;
  }

  async mget(...keys: string[]): Promise<(string | null)[]> {
    const flat = Array.isArray(keys[0]) ? (keys[0] as unknown as string[]) : keys;
    return flat.map((k) => this.live(k)?.value ?? null);
  }

  // set(key, value) | set(key, value, 'EX', seconds)
  async set(key: string, value: string, ...args: (string | number)[]): Promise<'OK'> {
    let expiresAt: number | null = null;
    const exIdx = args.findIndex((a) => String(a).toUpperCase() === 'EX');
    if (exIdx !== -1) expiresAt = Date.now() + Number(args[exIdx + 1]) * 1000;
    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  async setex(key: string, seconds: number, value: string): Promise<'OK'> {
    this.store.set(key, { value, expiresAt: Date.now() + seconds * 1000 });
    return 'OK';
  }

  async del(...keys: string[]): Promise<number> {
    let n = 0;
    for (const k of keys) if (this.store.delete(k)) n++;
    return n;
  }

  async exists(...keys: string[]): Promise<number> {
    return keys.reduce((n, k) => n + (this.live(k) ? 1 : 0), 0);
  }

  async incrby(key: string, by: number): Promise<number> {
    const cur = Number(this.live(key)?.value ?? 0) + by;
    const prev = this.live(key);
    this.store.set(key, { value: String(cur), expiresAt: prev?.expiresAt ?? null });
    return cur;
  }

  async ttl(key: string): Promise<number> {
    const e = this.live(key);
    if (!e) return -2;
    if (e.expiresAt === null) return -1;
    return Math.max(0, Math.ceil((e.expiresAt - Date.now()) / 1000));
  }

  async expire(key: string, seconds: number): Promise<number> {
    const e = this.live(key);
    if (!e) return 0;
    e.expiresAt = Date.now() + seconds * 1000;
    return 1;
  }

  scanStream(opts?: { match?: string; count?: number }): EventEmitter {
    const emitter = new EventEmitter();
    const re = opts?.match ? globToRegExp(opts.match) : null;
    setImmediate(() => {
      const keys = [...this.store.keys()].filter((k) => this.live(k) && (!re || re.test(k)));
      if (keys.length) emitter.emit('data', keys);
      emitter.emit('end');
    });
    return emitter;
  }

  pipeline(): { del: (...keys: string[]) => any; exec: () => Promise<[null, number][]> } {
    const pending: string[] = [];
    const self = this;
    const p = {
      del(...keys: string[]) {
        pending.push(...keys);
        return p;
      },
      async exec(): Promise<[null, number][]> {
        const n = await self.del(...pending);
        return [[null, n]];
      },
    };
    return p;
  }

  async flushdb(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }

  async dbsize(): Promise<number> {
    return [...this.store.keys()].filter((k) => this.live(k)).length;
  }

  async info(_section?: string): Promise<string> {
    return `used_memory_human:in-memory(${this.store.size} keys)`;
  }

  async ping(): Promise<'PONG'> {
    return 'PONG';
  }

  async quit(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }

  on(_event: string, _handler: (...args: any[]) => void): this {
    return this;
  }
}
