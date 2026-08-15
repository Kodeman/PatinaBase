import { randomUUID } from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Prisma, PrismaClient } from '../../generated/prisma-client';
import { NotificationDispatchClient } from '../../infrastructure/notification-dispatch.client';
import { WebhooksService } from './webhooks.service';

const databaseUrl =
  process.env.ORDERS_WEBHOOK_TEST_DATABASE_URL ??
  process.env.ORDERS_AUTHZ_TEST_DATABASE_URL;
const isLocalDatabase = Boolean(databaseUrl && /(?:127\.0\.0\.1|localhost)/.test(databaseUrl));
const describeLocal = isLocalDatabase ? describe : describe.skip;

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

describeLocal('Stripe webhook receipt idempotency with local Postgres', () => {
  jest.setTimeout(30_000);

  const receiptIds: string[] = [];
  const outboxIds: string[] = [];
  let prisma: PrismaClient;
  let currentEvent: Stripe.Event;
  let service: WebhooksService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl! } } });
    await prisma.$connect();

    const stripe = {
      webhooks: {
        constructEvent: jest.fn(() => currentEvent),
      },
    };
    const config = {
      get: jest.fn((key: string) =>
        key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_local_receipt_test' : undefined,
      ),
    };

    service = new WebhooksService(
      prisma,
      config as unknown as ConfigService,
      stripe as unknown as Stripe,
      { publish: jest.fn().mockResolvedValue(undefined) },
      { enqueue: jest.fn().mockResolvedValue({ success: true }) } as unknown as NotificationDispatchClient,
    );
  });

  afterEach(async () => {
    await prisma.outboxEvent.deleteMany({ where: { id: { in: outboxIds.splice(0) } } });
    await prisma.stripeWebhookReceipt.deleteMany({
      where: { eventId: { in: receiptIds.splice(0) } },
    });
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  function setProcessor(
    processor: (event: Stripe.Event, database: Prisma.TransactionClient) => Promise<void>,
  ): void {
    (service as unknown as { processEvent: typeof processor }).processEvent = processor;
  }

  it('serializes a real concurrent claim and acknowledges only after the owner succeeds', async () => {
    const eventId = `evt_worker_receipt_race_${randomUUID()}`;
    receiptIds.push(eventId);
    currentEvent = {
      id: eventId,
      type: 'customer.created',
      data: { object: {} },
    } as Stripe.Event;

    const transactionEntered = deferred();
    const releaseTransaction = deferred();
    let effectAttempts = 0;
    setProcessor(async () => {
      effectAttempts += 1;
      transactionEntered.resolve();
      await releaseTransaction.promise;
    });

    const first = service.handleStripeWebhook('valid-signature', Buffer.from('{}'));
    await transactionEntered.promise;

    await expect(
      service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);

    expect(effectAttempts).toBe(1);
    expect(await prisma.stripeWebhookReceipt.findUnique({ where: { eventId } })).toMatchObject({
      status: 'processing',
      attempts: 1,
    });

    releaseTransaction.resolve();
    await expect(first).resolves.toEqual({ received: true, eventId });

    expect(await prisma.stripeWebhookReceipt.findUnique({ where: { eventId } })).toMatchObject({
      status: 'succeeded',
      attempts: 1,
      failedAt: null,
      lastErrorCode: null,
    });
    await expect(
      service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).resolves.toEqual({ received: true, eventId, duplicate: true });
    expect(effectAttempts).toBe(1);
  });

  it('rolls back transactional effects, marks failed, and reclaims on the next delivery', async () => {
    const eventId = `evt_worker_receipt_retry_${randomUUID()}`;
    const outboxId = randomUUID();
    receiptIds.push(eventId);
    outboxIds.push(outboxId);
    currentEvent = {
      id: eventId,
      type: 'customer.created',
      data: { object: {} },
    } as Stripe.Event;

    let attempt = 0;
    setProcessor(async (_event, database) => {
      attempt += 1;
      await database.outboxEvent.create({
        data: {
          id: outboxId,
          type: 'webhook.receipt.integration',
          payload: { eventId },
        },
      });
      if (attempt === 1) throw new Error('forced transactional rollback');
    });

    await expect(
      service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).rejects.toThrow('forced transactional rollback');

    expect(await prisma.outboxEvent.findUnique({ where: { id: outboxId } })).toBeNull();
    expect(await prisma.stripeWebhookReceipt.findUnique({ where: { eventId } })).toMatchObject({
      status: 'failed',
      attempts: 1,
      lastErrorCode: 'processing_failed',
    });

    await expect(
      service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).resolves.toEqual({ received: true, eventId });

    expect(await prisma.outboxEvent.findUnique({ where: { id: outboxId } })).toMatchObject({
      type: 'webhook.receipt.integration',
      published: false,
    });
    expect(await prisma.stripeWebhookReceipt.findUnique({ where: { eventId } })).toMatchObject({
      status: 'succeeded',
      attempts: 2,
      failedAt: null,
      lastErrorCode: null,
    });
  });

  it('reclaims an abandoned processing lease with a new token', async () => {
    const eventId = `evt_worker_receipt_stale_${randomUUID()}`;
    const abandonedClaimToken = randomUUID();
    receiptIds.push(eventId);
    currentEvent = {
      id: eventId,
      type: 'customer.created',
      data: { object: {} },
    } as Stripe.Event;
    await prisma.stripeWebhookReceipt.create({
      data: {
        eventId,
        eventType: currentEvent.type,
        status: 'processing',
        claimToken: abandonedClaimToken,
        attempts: 4,
        processingStartedAt: new Date(Date.now() - 6 * 60 * 1000),
      },
    });
    setProcessor(async () => undefined);

    await expect(
      service.handleStripeWebhook('valid-signature', Buffer.from('{}')),
    ).resolves.toEqual({ received: true, eventId });

    const receipt = await prisma.stripeWebhookReceipt.findUnique({ where: { eventId } });
    expect(receipt).toMatchObject({ status: 'succeeded', attempts: 5 });
    expect(receipt?.claimToken).not.toBe(abandonedClaimToken);
  });
});
