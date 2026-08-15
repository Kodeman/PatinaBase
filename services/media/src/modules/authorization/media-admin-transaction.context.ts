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
  return new Proxy({} as PrismaClient, {
    get(_target, property) {
      const transaction = context.requireClient() as unknown as Record<PropertyKey, unknown>;
      const value = Reflect.get(transaction, property, transaction);
      return typeof value === 'function' ? value.bind(transaction) : value;
    },
  });
}
