import { BackgroundRemovalOutcome, BackgroundRemovalStatus } from '../../generated/prisma-client';
import { BackgroundRemovalConfig } from './background-removal.config';
import { BackgroundRemovalQuotaExceededError } from './background-removal.errors';
import { BackgroundRemovalLedgerService } from './background-removal-ledger.service';

const NOW = new Date('2026-08-03T19:00:00.000Z');
const STUDIO_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const BOARD_ID = '33333333-3333-4333-8333-333333333333';
const ITEM_ID = '44444444-4444-4444-8444-444444444444';

function inMemoryPrisma() {
  const rows: any[] = [];
  const lockCalls: string[] = [];
  let transactionTail = Promise.resolve();

  const active = (row: any) =>
    row.status === BackgroundRemovalStatus.SUCCEEDED ||
    row.status === BackgroundRemovalStatus.FAILED_CHARGED ||
    (row.status === BackgroundRemovalStatus.RESERVED && row.reservationExpiresAt > NOW);

  const model = {
    findUnique: jest.fn(async ({ where }: any) => {
      const key = where.quotaOwnerId_idempotencyKey;
      return (
        rows.find(
          (row) =>
            row.quotaOwnerId === key.quotaOwnerId && row.idempotencyKey === key.idempotencyKey,
        ) ?? null
      );
    }),
    count: jest.fn(
      async ({ where }: any) =>
        rows.filter((row) => {
          if (!active(row)) return false;
          if (where.quotaOwnerId && row.quotaOwnerId !== where.quotaOwnerId) return false;
          if (
            where.studioPeriodStart &&
            row.studioPeriodStart.getTime() !== where.studioPeriodStart.getTime()
          ) {
            return false;
          }
          if (
            where.globalPeriodStart &&
            row.globalPeriodStart.getTime() !== where.globalPeriodStart.getTime()
          ) {
            return false;
          }
          return true;
        }).length,
    ),
    create: jest.fn(async ({ data }: any) => {
      const row = {
        id: `55555555-5555-4555-8555-${String(rows.length + 1).padStart(12, '0')}`,
        status: BackgroundRemovalStatus.RESERVED,
        outcome: null,
        originalUrl: null,
        cutoutUrl: null,
        creditsUsed: 0,
        ...data,
      };
      rows.push(row);
      return row;
    }),
    updateMany: jest.fn(async ({ where, data }: any) => {
      let count = 0;
      for (const row of rows) {
        if (row.id === where.id && row.status === where.status) {
          Object.assign(row, data);
          count += 1;
        }
      }
      return { count };
    }),
  };

  const transaction = {
    backgroundRemovalRequest: model,
    $queryRawUnsafe: jest.fn(async (_query: string, key: string) => {
      lockCalls.push(key);
      return [{ pg_advisory_xact_lock: null }];
    }),
  };
  const prisma = {
    backgroundRemovalRequest: model,
    $transaction: jest.fn(async (callback: (client: typeof transaction) => Promise<unknown>) => {
      let release!: () => void;
      const previous = transactionTail;
      transactionTail = new Promise<void>((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        return await callback(transaction);
      } finally {
        release();
      }
    }),
  };
  return { prisma, rows, lockCalls, model };
}

function target(idempotencyKey: string) {
  return {
    quotaOwnerId: STUDIO_ID,
    studioId: STUDIO_ID,
    requestedBy: USER_ID,
    boardId: BOARD_ID,
    itemId: ITEM_ID,
    idempotencyKey,
  };
}

describe('BackgroundRemovalLedgerService', () => {
  it('serializes reservation checks and permits only one winner at the studio cap', async () => {
    const { prisma, rows, lockCalls } = inMemoryPrisma();
    const policy = {
      studioMonthlyLimit: 1,
      globalDailyLimit: 100,
      reservationTtlMs: 300_000,
    } as BackgroundRemovalConfig;
    const service = new BackgroundRemovalLedgerService(prisma as any, policy, () => new Date(NOW));

    const results = await Promise.allSettled([
      service.reserve(target('concurrent-key-a')),
      service.reserve(target('concurrent-key-b')),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const rejection = results.find(
      (result) => result.status === 'rejected',
    ) as PromiseRejectedResult;
    expect(rejection.reason).toBeInstanceOf(BackgroundRemovalQuotaExceededError);
    expect(rows).toHaveLength(1);
    expect(lockCalls).toEqual([
      'background-removal:global',
      `background-removal:studio:${STUDIO_ID}`,
      'background-removal:global',
      `background-removal:studio:${STUDIO_ID}`,
    ]);
  });

  it('returns the durable result for a duplicate key without creating another row', async () => {
    const { prisma, rows, model } = inMemoryPrisma();
    rows.push({
      ...target('duplicate-key'),
      id: '66666666-6666-4666-8666-666666666666',
      status: BackgroundRemovalStatus.SUCCEEDED,
      outcome: BackgroundRemovalOutcome.SUCCEEDED,
      originalUrl: 'https://storage.example/original.png',
      cutoutUrl: 'https://storage.example/cutout.png',
      creditsUsed: 1,
      studioPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      globalPeriodStart: new Date('2026-08-03T00:00:00.000Z'),
      reservationExpiresAt: new Date('2026-08-03T19:05:00.000Z'),
    });
    const policy = {
      studioMonthlyLimit: 25,
      globalDailyLimit: 100,
      reservationTtlMs: 300_000,
    } as BackgroundRemovalConfig;
    const service = new BackgroundRemovalLedgerService(prisma as any, policy, () => new Date(NOW));

    await expect(service.reserve(target('duplicate-key'))).resolves.toMatchObject({
      kind: 'succeeded',
      originalUrl: 'https://storage.example/original.png',
      cutoutUrl: 'https://storage.example/cutout.png',
    });
    expect(model.create).not.toHaveBeenCalled();
  });

  it('turns an expired reservation into a durable released failure', async () => {
    const { prisma, rows, model } = inMemoryPrisma();
    rows.push({
      ...target('expired-key'),
      id: '77777777-7777-4777-8777-777777777777',
      status: BackgroundRemovalStatus.RESERVED,
      outcome: null,
      originalUrl: null,
      cutoutUrl: null,
      creditsUsed: 0,
      studioPeriodStart: new Date('2026-08-01T00:00:00.000Z'),
      globalPeriodStart: new Date('2026-08-03T00:00:00.000Z'),
      reservationExpiresAt: new Date('2026-08-03T18:59:59.000Z'),
    });
    const policy = {
      studioMonthlyLimit: 25,
      globalDailyLimit: 100,
      reservationTtlMs: 300_000,
    } as BackgroundRemovalConfig;
    const service = new BackgroundRemovalLedgerService(prisma as any, policy, () => new Date(NOW));

    await expect(service.reserve(target('expired-key'))).resolves.toEqual({ kind: 'failed' });
    expect(model.updateMany).toHaveBeenCalledWith({
      where: {
        id: '77777777-7777-4777-8777-777777777777',
        status: BackgroundRemovalStatus.RESERVED,
      },
      data: {
        status: BackgroundRemovalStatus.FAILED_RELEASED,
        outcome: BackgroundRemovalOutcome.INTERNAL_FAILED,
        completedAt: NOW,
      },
    });
  });

  it('releases quota when a reserved vendor call fails without a charge', async () => {
    const { prisma } = inMemoryPrisma();
    const policy = {
      studioMonthlyLimit: 25,
      globalDailyLimit: 100,
      reservationTtlMs: 300_000,
    } as BackgroundRemovalConfig;
    const service = new BackgroundRemovalLedgerService(prisma as any, policy, () => new Date(NOW));
    const reserved = await service.reserve(target('vendor-failure'));
    if (reserved.kind !== 'reserved') throw new Error('expected reservation');

    await service.markFailed(reserved.requestId, 'VENDOR_FAILED', 0);

    await expect(service.getQuota(STUDIO_ID)).resolves.toMatchObject({
      studioMonthly: { used: 0, remaining: 25 },
      globalDaily: { used: 0, remaining: 100 },
    });
  });

  it('keeps charged storage failures inside both quota windows', async () => {
    const { prisma } = inMemoryPrisma();
    const policy = {
      studioMonthlyLimit: 25,
      globalDailyLimit: 100,
      reservationTtlMs: 300_000,
    } as BackgroundRemovalConfig;
    const service = new BackgroundRemovalLedgerService(prisma as any, policy, () => new Date(NOW));
    const reserved = await service.reserve(target('charged-failure'));
    if (reserved.kind !== 'reserved') throw new Error('expected reservation');

    await service.markFailed(reserved.requestId, 'STORAGE_FAILED', 1);

    await expect(service.getQuota(STUDIO_ID)).resolves.toMatchObject({
      studioMonthly: { used: 1, remaining: 24 },
      globalDaily: { used: 1, remaining: 99 },
    });
  });
});
