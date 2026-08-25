import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';
import { Prisma, PrismaClient } from '../../generated/prisma-client';

@Injectable()
export class MediaAdminTransactionContext {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  run<T>(transaction: Prisma.TransactionClient, operation: () => Promise<T>): Promise<T> {
    return this.storage.run(transaction, operation);
  }

  requireClient(): Prisma.TransactionClient {
    const transaction = this.storage.getStore();
    if (!transaction) throw new Error('Media admin transaction is unavailable');
    return transaction;
  }
}

export function createTransactionBoundPrisma(context: MediaAdminTransactionContext): PrismaClient {
  // Nest probes every provider before any request exists — awaiting the factory result
  // (reads `.then`), the lifecycle-hook scanner (reads onModuleInit etc.), and
  // @nestjs/event-emitter's EventSubscribersLoader (walks Object.prototype method names).
  // A naive proxy that always calls requireClient() throws on those bootstrap-time reads
  // (no request transaction exists yet), which used to kill the process before
  // app.listen(8080) — Cloudflare Containers then reports "crashed while checking for
  // ports." These framework introspection probes must see plain-object behavior; only a
  // genuine Prisma delegate access should hit the requireClient() guard below.
  const introspectionProbes = new Set<PropertyKey>([
    'then',
    'onModuleInit',
    'onModuleDestroy',
    'onApplicationBootstrap',
    'beforeApplicationShutdown',
    'onApplicationShutdown',
    ...Object.getOwnPropertyNames(Object.prototype),
  ]);
  return new Proxy({} as PrismaClient, {
    get(target, property) {
      if (typeof property === 'symbol' || introspectionProbes.has(property)) {
        return Reflect.get(target, property, target);
      }
      const transaction = context.requireClient() as unknown as Record<PropertyKey, unknown>;
      const value = Reflect.get(transaction, property, transaction);
      return typeof value === 'function' ? value.bind(transaction) : value;
    },
  });
}
