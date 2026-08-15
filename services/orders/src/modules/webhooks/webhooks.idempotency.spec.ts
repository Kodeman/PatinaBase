import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { PrismaClient } from '../../generated/prisma-client';
import { NotificationDispatchClient } from '../../infrastructure/notification-dispatch.client';
import { WebhooksService } from './webhooks.service';

type Receipt = {
  eventId: string;
  eventType: string;
  status: string;
  claimToken: string;
  attempts: number;
  processingStartedAt: Date;
  succeededAt: Date | null;
  failedAt: Date | null;
  lastErrorCode: string | null;
};

type Deferred = {
  promise: Promise<void>;
  resolve: () => void;
};

function deferred(): Deferred {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function uniqueConstraintError(): Error & { code: string } {
  return Object.assign(new Error('Unique constraint failed'), {
    code: 'P2002',
  });
}

function matchesReceiptWhere(receipt: Receipt, where: any): boolean {
  if (where.eventId !== undefined && where.eventId !== receipt.eventId) return false;
  if (where.status !== undefined && where.status !== receipt.status) return false;
  if (where.claimToken !== undefined && where.claimToken !== receipt.claimToken) return false;

  if (where.OR) {
    return where.OR.some((candidate: any) => matchesReceiptWhere(receipt, candidate));
  }

  if (
    where.processingStartedAt?.lt !== undefined &&
    !(receipt.processingStartedAt < where.processingStartedAt.lt)
  ) {
    return false;
  }

  return true;
}

function applyReceiptUpdate(receipt: Receipt, data: any): void {
  for (const [key, value] of Object.entries(data)) {
    if (key === 'attempts' && typeof value === 'object' && value !== null && 'increment' in value) {
      receipt.attempts += (value as { increment: number }).increment;
    } else {
      (receipt as any)[key] = value;
    }
  }
}

function createHarness(event: Stripe.Event, holdFirstTransaction = false) {
  const receipts = new Map<string, Receipt>();
  const claimTokens: string[] = [];
  const transactionEntered = deferred();
  const releaseTransaction = deferred();
  let transactionCount = 0;

  const updateReceipt = jest.fn(async ({ where, data }: any) => {
    const receipt = receipts.get(where.eventId);
    if (!receipt || !matchesReceiptWhere(receipt, where)) return { count: 0 };
    applyReceiptUpdate(receipt, data);
    if (data.claimToken) claimTokens.push(data.claimToken);
    return { count: 1 };
  });

  const transactionClient = {
    order: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'order-idempotency',
        orderNumber: 'ORD-IDEMPOTENCY',
        paymentIntentId: 'pi_idempotency',
        cartId: null,
        userId: 'user-idempotency',
        total: { toString: () => '100.00' },
        currency: 'USD',
      }),
      update: jest.fn().mockResolvedValue({}),
    },
    payment: {
      create: jest.fn().mockResolvedValue({}),
      findUnique: jest.fn(),
    },
    cart: { update: jest.fn() },
    refund: { findUnique: jest.fn(), create: jest.fn() },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
    address: { findUnique: jest.fn().mockResolvedValue(null) },
    stripeWebhookReceipt: { updateMany: updateReceipt },
  };

  const rootReceiptDelegate = {
    create: jest.fn(async ({ data }: any) => {
      if (receipts.has(data.eventId)) throw uniqueConstraintError();
      const receipt: Receipt = {
        ...data,
        attempts: 1,
        succeededAt: null,
        failedAt: null,
        lastErrorCode: null,
      };
      receipts.set(data.eventId, receipt);
      claimTokens.push(data.claimToken);
      return receipt;
    }),
    updateMany: updateReceipt,
    findUnique: jest.fn(async ({ where }: any) => {
      const receipt = receipts.get(where.eventId);
      return receipt ? { status: receipt.status } : null;
    }),
  };

  const prisma = {
    stripeWebhookReceipt: rootReceiptDelegate,
    $transaction: jest.fn(async (operation: (database: any) => Promise<unknown>) => {
      transactionCount += 1;
      if (holdFirstTransaction && transactionCount === 1) {
        transactionEntered.resolve();
        await releaseTransaction.promise;
      }
      return operation(transactionClient);
    }),
  };

  const stripe = {
    webhooks: { constructEvent: jest.fn().mockReturnValue(event) },
  };
  const eventsService = { publish: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    enqueue: jest.fn().mockResolvedValue({ success: true }),
  };
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_unit_test';
      return undefined;
    }),
  };

  const service = new WebhooksService(
    prisma as unknown as PrismaClient,
    config as unknown as ConfigService,
    stripe as unknown as Stripe,
    eventsService,
    notifications as unknown as NotificationDispatchClient,
  );

  return {
    service,
    receipts,
    claimTokens,
    prisma,
    transactionClient,
    eventsService,
    transactionEntered,
    releaseTransaction,
  };
}

function canceledEvent(eventId: string): Stripe.Event {
  return {
    id: eventId,
    type: 'payment_intent.canceled',
    data: {
      object: {
        id: 'pi_idempotency',
        object: 'payment_intent',
      },
    },
  } as Stripe.Event;
}

describe('WebhooksService durable Stripe receipt idempotency', () => {
  it('claims before effects and rejects a concurrent delivery until the owner succeeds', async () => {
    const event = canceledEvent('evt_concurrent_delivery');
    const harness = createHarness(event, true);

    const first = harness.service.handleStripeWebhook('valid-signature', Buffer.from('{}'));
    await harness.transactionEntered.promise;

    await expect(
      harness.service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(harness.transactionClient.order.update).not.toHaveBeenCalled();
    expect(harness.prisma.stripeWebhookReceipt.create).toHaveBeenCalledTimes(2);
    expect(harness.prisma.$transaction).toHaveBeenCalledTimes(1);

    harness.releaseTransaction.resolve();
    await expect(first).resolves.toEqual({
      received: true,
      eventId: event.id,
    });

    expect(harness.transactionClient.order.update).toHaveBeenCalledTimes(1);
    expect(harness.receipts.get(event.id)).toMatchObject({
      status: 'succeeded',
      attempts: 1,
      lastErrorCode: null,
    });
    expect(harness.prisma.stripeWebhookReceipt.create.mock.invocationCallOrder[0]).toBeLessThan(
      harness.prisma.$transaction.mock.invocationCallOrder[0],
    );

    await expect(
      harness.service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).resolves.toEqual({ received: true, eventId: event.id, duplicate: true });
    expect(harness.transactionClient.order.update).toHaveBeenCalledTimes(1);
  });

  it('marks a failed owner with a sanitized code and retries it with a new fenced claim', async () => {
    const event = {
      id: 'evt_recoverable_failure',
      type: 'payment_intent.payment_failed',
      data: {
        object: {
          id: 'pi_idempotency',
          object: 'payment_intent',
          amount: 10000,
          currency: 'usd',
          last_payment_error: { code: 'card_declined', message: 'Declined' },
        },
      },
    } as Stripe.Event;
    const harness = createHarness(event);
    harness.transactionClient.payment.create
      .mockRejectedValueOnce(new Error('database write failed'))
      .mockResolvedValueOnce({});

    await expect(
      harness.service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).rejects.toThrow('database write failed');

    expect(harness.receipts.get(event.id)).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastErrorCode: 'processing_failed',
    });

    await expect(
      harness.service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).resolves.toEqual({ received: true, eventId: event.id });

    expect(harness.receipts.get(event.id)).toMatchObject({
      status: 'succeeded',
      attempts: 2,
      failedAt: null,
      lastErrorCode: null,
    });
    expect(new Set(harness.claimTokens).size).toBe(2);
    expect(harness.transactionClient.payment.create).toHaveBeenCalledTimes(2);
    expect(harness.transactionClient.order.update).toHaveBeenCalledTimes(1);
  });

  it('reclaims an abandoned processing lease and fences the previous claim token', async () => {
    const event = canceledEvent('evt_abandoned_processing');
    const harness = createHarness(event);
    harness.receipts.set(event.id, {
      eventId: event.id,
      eventType: event.type,
      status: 'processing',
      claimToken: '00000000-0000-4000-8000-000000000001',
      attempts: 3,
      processingStartedAt: new Date(Date.now() - 6 * 60 * 1000),
      succeededAt: null,
      failedAt: null,
      lastErrorCode: null,
    });

    await expect(
      harness.service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).resolves.toEqual({ received: true, eventId: event.id });

    const receipt = harness.receipts.get(event.id)!;
    expect(receipt).toMatchObject({ status: 'succeeded', attempts: 4 });
    expect(receipt.claimToken).not.toBe('00000000-0000-4000-8000-000000000001');
    expect(harness.transactionClient.order.update).toHaveBeenCalledTimes(1);
  });

  it('does not overwrite a newer owner when completion loses its claim fence', async () => {
    const event = canceledEvent('evt_claim_fence');
    const harness = createHarness(event);
    const newerClaimToken = '00000000-0000-4000-8000-000000000002';
    harness.eventsService.publish.mockImplementationOnce(async () => {
      const receipt = harness.receipts.get(event.id)!;
      receipt.claimToken = newerClaimToken;
      receipt.processingStartedAt = new Date();
    });

    await expect(
      harness.service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).rejects.toThrow('Webhook receipt lease lost');

    expect(harness.receipts.get(event.id)).toMatchObject({
      status: 'processing',
      claimToken: newerClaimToken,
      lastErrorCode: null,
    });
  });
});
