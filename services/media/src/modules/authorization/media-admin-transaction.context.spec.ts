import { ExecutionContext } from '@nestjs/common';
import { CallHandler } from '@nestjs/common/interfaces';
import { defer, lastValueFrom } from 'rxjs';
import { Prisma } from '../../generated/prisma-client';
import { MediaAdminAuthorizationInterceptor } from './media-admin-authorization.interceptor';
import {
  createTransactionBoundPrisma,
  MediaAdminTransactionContext,
} from './media-admin-transaction.context';
import { MediaAuthorizationResolver } from './media-authorization.resolver';

const SUBJECT = '11111111-1111-4111-8111-111111111111';

describe('MediaAdminTransactionContext', () => {
  it('binds handler Prisma calls to the authorization transaction', async () => {
    const transaction = {
      mediaAsset: { findMany: jest.fn().mockResolvedValue([{ id: 'asset' }]) },
    } as unknown as Prisma.TransactionClient;
    const context = new MediaAdminTransactionContext();
    const prisma = createTransactionBoundPrisma(context);
    const authorization = {
      withAdminLease: jest.fn(async (_subject, operation) => operation(transaction)),
    } as unknown as MediaAuthorizationResolver;
    const interceptor = new MediaAdminAuthorizationInterceptor(authorization, context);
    const execution = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: {
            sub: SUBJECT,
            id: SUBJECT,
            userId: SUBJECT,
            app_metadata: { roles: ['super_admin'], permissions: ['media.admin.all'] },
          },
        }),
      }),
    } as unknown as ExecutionContext;
    const next = {
      handle: () => defer(() => prisma.mediaAsset.findMany()),
    } as CallHandler;

    await expect(lastValueFrom(interceptor.intercept(execution, next))).resolves.toEqual([
      { id: 'asset' },
    ]);
    expect(authorization.withAdminLease).toHaveBeenCalledWith(SUBJECT, expect.any(Function));
    expect(transaction.mediaAsset.findMany).toHaveBeenCalledTimes(1);
  });

  it('does not retain a transaction after success or rollback', async () => {
    const context = new MediaAdminTransactionContext();
    const prisma = createTransactionBoundPrisma(context);
    const first = {
      mediaAsset: { count: jest.fn().mockResolvedValue(1) },
    } as unknown as Prisma.TransactionClient;
    const second = {
      mediaAsset: { count: jest.fn().mockResolvedValue(2) },
    } as unknown as Prisma.TransactionClient;

    await expect(context.run(first, () => prisma.mediaAsset.count())).resolves.toBe(1);
    expect(() => prisma.mediaAsset).toThrow('Media admin transaction is unavailable');

    await expect(
      context.run(first, async () => {
        await prisma.mediaAsset.count();
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(() => prisma.mediaAsset).toThrow('Media admin transaction is unavailable');

    await expect(context.run(second, () => prisma.mediaAsset.count())).resolves.toBe(2);
    expect(first.mediaAsset.count).toHaveBeenCalledTimes(2);
    expect(second.mediaAsset.count).toHaveBeenCalledTimes(1);
  });

  describe('Nest bootstrap introspection safety', () => {
    // Nest probes every provider before any request exists: awaiting the factory result
    // reads `.then`, the lifecycle-hook scanner reads onModuleInit/onModuleDestroy/etc.,
    // and @nestjs/event-emitter's EventSubscribersLoader walks Object.prototype method
    // names (hasOwnProperty, toString, ...). None of these should throw outside a
    // transaction — a naive proxy that always calls requireClient() killed the process
    // at bootstrap, before app.listen(), which Cloudflare Containers reported as
    // "crashed while checking for ports."

    it('returns undefined for framework probes outside a transaction, without throwing', () => {
      const context = new MediaAdminTransactionContext();
      const prisma = createTransactionBoundPrisma(context);

      expect(() => (prisma as unknown as { then?: unknown }).then).not.toThrow();
      expect((prisma as unknown as { then?: unknown }).then).toBeUndefined();

      expect(() => (prisma as unknown as { onModuleInit?: unknown }).onModuleInit).not.toThrow();
      expect((prisma as unknown as { onModuleInit?: unknown }).onModuleInit).toBeUndefined();
    });

    it('behaves like a plain object for Object.prototype members outside a transaction', () => {
      const context = new MediaAdminTransactionContext();
      const prisma = createTransactionBoundPrisma(context);

      expect(() =>
        (prisma as unknown as { hasOwnProperty: (p: string) => boolean }).hasOwnProperty('x'),
      ).not.toThrow();
      expect(
        (prisma as unknown as { hasOwnProperty: (p: string) => boolean }).hasOwnProperty('x'),
      ).toBe(false);
      expect(() => (prisma as unknown as { toString: () => string }).toString()).not.toThrow();
    });

    it('still throws when a genuine Prisma delegate is accessed outside a transaction', () => {
      const context = new MediaAdminTransactionContext();
      const prisma = createTransactionBoundPrisma(context);

      expect(() => prisma.mediaAsset).toThrow('Media admin transaction is unavailable');
    });

    it('resolves a genuine delegate access to the bound transaction client inside a transaction', async () => {
      const context = new MediaAdminTransactionContext();
      const prisma = createTransactionBoundPrisma(context);
      const transaction = {
        mediaAsset: { findMany: jest.fn().mockResolvedValue([{ id: 'bound' }]) },
      } as unknown as Prisma.TransactionClient;

      await expect(context.run(transaction, () => prisma.mediaAsset.findMany())).resolves.toEqual([
        { id: 'bound' },
      ]);
      expect(transaction.mediaAsset.findMany).toHaveBeenCalledTimes(1);
    });
  });
});
