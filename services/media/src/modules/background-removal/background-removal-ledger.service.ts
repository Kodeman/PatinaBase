import { Inject, Injectable } from '@nestjs/common';
import {
  BackgroundRemovalOutcome,
  BackgroundRemovalStatus,
  Prisma,
  PrismaClient,
} from '../../generated/prisma-client';
import { BackgroundRemovalConfig } from './background-removal.config';
import {
  BackgroundRemovalIdempotencyConflictError,
  BackgroundRemovalLedgerTransitionError,
  BackgroundRemovalQuotaExceededError,
} from './background-removal.errors';
import {
  BACKGROUND_REMOVAL_CLOCK,
  BackgroundRemovalFailureOutcome,
  BackgroundRemovalQuota,
  ReservationResult,
  ReservationTarget,
} from './background-removal.types';

type Clock = () => Date;

interface Periods {
  studioStart: Date;
  studioReset: Date;
  globalStart: Date;
  globalReset: Date;
}

@Injectable()
export class BackgroundRemovalLedgerService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly policy: BackgroundRemovalConfig,
    @Inject(BACKGROUND_REMOVAL_CLOCK) private readonly clock: Clock,
  ) {}

  async reserve(target: ReservationTarget): Promise<ReservationResult> {
    const now = this.clock();
    const periods = this.periods(now);
    const studioLimit = this.policy.studioMonthlyLimit;
    const globalLimit = this.policy.globalDailyLimit;

    return this.prisma.$transaction(async (transaction) => {
      // One global lock followed by one studio lock gives every process and
      // container the same deterministic order. The count+insert reservation
      // is therefore race-free without retrying any paid work.
      await this.lock(transaction, 'background-removal:global');
      await this.lock(transaction, `background-removal:studio:${target.quotaOwnerId}`);

      const existing = await transaction.backgroundRemovalRequest.findUnique({
        where: {
          quotaOwnerId_idempotencyKey: {
            quotaOwnerId: target.quotaOwnerId,
            idempotencyKey: target.idempotencyKey,
          },
        },
      });

      const [studioUsed, globalUsed] = await Promise.all([
        transaction.backgroundRemovalRequest.count({
          where: this.studioUsageWhere(target.quotaOwnerId, periods.studioStart, now),
        }),
        transaction.backgroundRemovalRequest.count({
          where: this.globalUsageWhere(periods.globalStart, now),
        }),
      ]);
      const currentQuota = this.quota(periods, studioLimit, globalLimit, studioUsed, globalUsed);

      if (existing) {
        // Authorization happens before reservation. Within a quota owner, the
        // board item is the idempotency target; requestedBy records the member
        // who started the durable request and must not block an authorized
        // teammate from observing or replaying that same result.
        if (existing.boardId !== target.boardId || existing.itemId !== target.itemId) {
          throw new BackgroundRemovalIdempotencyConflictError();
        }
        if (
          existing.status === BackgroundRemovalStatus.SUCCEEDED &&
          existing.originalUrl &&
          existing.cutoutUrl
        ) {
          return {
            kind: 'succeeded',
            requestId: existing.id,
            originalUrl: existing.originalUrl,
            cutoutUrl: existing.cutoutUrl,
            quota: currentQuota,
          };
        }
        if (existing.status === BackgroundRemovalStatus.RESERVED) {
          if (existing.reservationExpiresAt > now) {
            return { kind: 'in_progress', reason: 'same_request' };
          }
          const expired = await transaction.backgroundRemovalRequest.updateMany({
            where: { id: existing.id, status: BackgroundRemovalStatus.RESERVED },
            data: {
              status: BackgroundRemovalStatus.FAILED_RELEASED,
              outcome: BackgroundRemovalOutcome.INTERNAL_FAILED,
              completedAt: now,
            },
          });
          if (expired.count !== 1) {
            const persisted = await transaction.backgroundRemovalRequest.findUnique({
              where: { id: existing.id },
            });
            if (
              persisted?.status !== BackgroundRemovalStatus.FAILED_RELEASED ||
              persisted.outcome !== BackgroundRemovalOutcome.INTERNAL_FAILED ||
              Number(persisted.creditsUsed) !== 0
            ) {
              throw new BackgroundRemovalLedgerTransitionError(existing.id, 'failed');
            }
          }
          return { kind: 'failed' };
        }
        return { kind: 'failed' };
      }

      // A partial unique index treats an expired RESERVED row as live until its
      // status is reconciled. Release stale rows for this target before checking
      // for a different-key request or creating a new reservation.
      await transaction.backgroundRemovalRequest.updateMany({
        where: {
          quotaOwnerId: target.quotaOwnerId,
          boardId: target.boardId,
          itemId: target.itemId,
          status: BackgroundRemovalStatus.RESERVED,
          reservationExpiresAt: { lte: now },
        },
        data: {
          status: BackgroundRemovalStatus.FAILED_RELEASED,
          outcome: BackgroundRemovalOutcome.INTERNAL_FAILED,
          completedAt: now,
        },
      });

      const activeTarget = await transaction.backgroundRemovalRequest.findFirst({
        where: {
          quotaOwnerId: target.quotaOwnerId,
          boardId: target.boardId,
          itemId: target.itemId,
          status: BackgroundRemovalStatus.RESERVED,
          reservationExpiresAt: { gt: now },
        },
        select: { id: true },
      });
      if (activeTarget) {
        return { kind: 'in_progress', reason: 'active_target' };
      }

      if (studioUsed >= studioLimit) {
        throw new BackgroundRemovalQuotaExceededError(
          'studio_monthly',
          studioLimit,
          periods.studioReset.toISOString(),
        );
      }
      if (globalUsed >= globalLimit) {
        throw new BackgroundRemovalQuotaExceededError(
          'global_daily',
          globalLimit,
          periods.globalReset.toISOString(),
        );
      }

      const request = await transaction.backgroundRemovalRequest.create({
        data: {
          quotaOwnerId: target.quotaOwnerId,
          studioId: target.studioId,
          requestedBy: target.requestedBy,
          boardId: target.boardId,
          itemId: target.itemId,
          idempotencyKey: target.idempotencyKey,
          studioPeriodStart: periods.studioStart,
          globalPeriodStart: periods.globalStart,
          studioLimit,
          globalLimit,
          reservationExpiresAt: new Date(now.getTime() + this.policy.reservationTtlMs),
        },
      });

      return {
        kind: 'reserved',
        requestId: request.id,
        quota: this.quota(periods, studioLimit, globalLimit, studioUsed + 1, globalUsed + 1),
      };
    });
  }

  async getQuota(quotaOwnerId: string): Promise<BackgroundRemovalQuota> {
    const now = this.clock();
    const periods = this.periods(now);
    const [studioUsed, globalUsed] = await Promise.all([
      this.prisma.backgroundRemovalRequest.count({
        where: this.studioUsageWhere(quotaOwnerId, periods.studioStart, now),
      }),
      this.prisma.backgroundRemovalRequest.count({
        where: this.globalUsageWhere(periods.globalStart, now),
      }),
    ]);
    return this.quota(
      periods,
      this.policy.studioMonthlyLimit,
      this.policy.globalDailyLimit,
      studioUsed,
      globalUsed,
    );
  }

  async markSucceeded(
    requestId: string,
    originalUrl: string,
    cutoutUrl: string,
    creditsUsed: number,
  ): Promise<void> {
    const transition = await this.prisma.backgroundRemovalRequest.updateMany({
      where: { id: requestId, status: BackgroundRemovalStatus.RESERVED },
      data: {
        status: BackgroundRemovalStatus.SUCCEEDED,
        outcome: BackgroundRemovalOutcome.SUCCEEDED,
        originalUrl,
        cutoutUrl,
        creditsUsed,
        completedAt: this.clock(),
      },
    });
    if (transition.count === 1) return;

    const persisted = await this.prisma.backgroundRemovalRequest.findUnique({
      where: { id: requestId },
    });
    if (
      persisted?.status === BackgroundRemovalStatus.SUCCEEDED &&
      persisted.outcome === BackgroundRemovalOutcome.SUCCEEDED &&
      persisted.originalUrl === originalUrl &&
      persisted.cutoutUrl === cutoutUrl &&
      Number(persisted.creditsUsed) === creditsUsed
    ) {
      return;
    }
    throw new BackgroundRemovalLedgerTransitionError(requestId, 'succeeded');
  }

  async markFailed(
    requestId: string,
    outcome: BackgroundRemovalFailureOutcome,
    options: { countAgainstQuota: boolean; creditsUsed?: number },
  ): Promise<void> {
    const creditsUsed = options.creditsUsed ?? 0;
    const status = options.countAgainstQuota
      ? BackgroundRemovalStatus.FAILED_COUNTED
      : BackgroundRemovalStatus.FAILED_RELEASED;
    const transition = await this.prisma.backgroundRemovalRequest.updateMany({
      where: { id: requestId, status: BackgroundRemovalStatus.RESERVED },
      data: {
        status,
        outcome: outcome as BackgroundRemovalOutcome,
        creditsUsed,
        completedAt: this.clock(),
      },
    });
    if (transition.count === 1) return;

    const persisted = await this.prisma.backgroundRemovalRequest.findUnique({
      where: { id: requestId },
    });
    if (
      persisted?.status === status &&
      persisted.outcome === (outcome as BackgroundRemovalOutcome) &&
      Number(persisted.creditsUsed) === creditsUsed
    ) {
      return;
    }
    throw new BackgroundRemovalLedgerTransitionError(requestId, 'failed');
  }

  private activeUsage(now: Date): Prisma.BackgroundRemovalRequestWhereInput {
    return {
      OR: [
        {
          status: {
            in: [
              BackgroundRemovalStatus.SUCCEEDED,
              BackgroundRemovalStatus.FAILED_CHARGED,
              BackgroundRemovalStatus.FAILED_COUNTED,
            ],
          },
        },
        {
          status: BackgroundRemovalStatus.RESERVED,
          reservationExpiresAt: { gt: now },
        },
      ],
    };
  }

  private studioUsageWhere(
    quotaOwnerId: string,
    studioStart: Date,
    now: Date,
  ): Prisma.BackgroundRemovalRequestWhereInput {
    return {
      quotaOwnerId,
      studioPeriodStart: studioStart,
      AND: [this.activeUsage(now)],
    };
  }

  private globalUsageWhere(
    globalStart: Date,
    now: Date,
  ): Prisma.BackgroundRemovalRequestWhereInput {
    return {
      globalPeriodStart: globalStart,
      AND: [this.activeUsage(now)],
    };
  }

  private async lock(transaction: Prisma.TransactionClient, key: string): Promise<void> {
    await transaction.$queryRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', key);
  }

  private periods(now: Date): Periods {
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth();
    const day = now.getUTCDate();
    return {
      studioStart: new Date(Date.UTC(year, month, 1)),
      studioReset: new Date(Date.UTC(year, month + 1, 1)),
      globalStart: new Date(Date.UTC(year, month, day)),
      globalReset: new Date(Date.UTC(year, month, day + 1)),
    };
  }

  private quota(
    periods: Periods,
    studioLimit: number,
    globalLimit: number,
    studioUsed: number,
    globalUsed: number,
  ): BackgroundRemovalQuota {
    return {
      studioMonthly: {
        limit: studioLimit,
        used: studioUsed,
        remaining: Math.max(0, studioLimit - studioUsed),
        resetAt: periods.studioReset.toISOString(),
      },
      globalDaily: {
        limit: globalLimit,
        used: globalUsed,
        remaining: Math.max(0, globalLimit - globalUsed),
        resetAt: periods.globalReset.toISOString(),
      },
    };
  }
}
