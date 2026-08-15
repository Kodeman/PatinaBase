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
});
