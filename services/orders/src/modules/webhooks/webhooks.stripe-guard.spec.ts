import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebhooksService } from './webhooks.service';
import { PrismaClient } from '../../generated/prisma-client';
import { NotificationDispatchClient } from '../../infrastructure/notification-dispatch.client';

describe('WebhooksService - Stripe unconfigured (parked payment rail)', () => {
  let service: WebhooksService;
  const mockPrisma = {} as unknown as PrismaClient;
  const mockEvents = { publish: jest.fn() };
  const mockNotifications = { enqueue: jest.fn() };
  const config = {
    get: jest.fn((key: string) => (key === 'STRIPE_WEBHOOK_SECRET' ? 'whsec_test' : undefined)),
  } as unknown as ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: config },
        { provide: 'STRIPE_CLIENT', useValue: null },
        { provide: 'EVENTS_SERVICE', useValue: mockEvents },
        { provide: NotificationDispatchClient, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('handleStripeWebhook fails fast with 503 stripe_not_configured', async () => {
    const promise = service.handleStripeWebhook('sig', Buffer.from('{}'));

    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise.catch(e => JSON.stringify(e.getResponse()))).resolves.toContain(
      'stripe_not_configured',
    );
  });
});
