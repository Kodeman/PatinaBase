import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';

describe('PaymentsService - Stripe unconfigured (parked payment rail)', () => {
  let service: PaymentsService;
  const mockPrisma = {
    order: { findUnique: jest.fn() },
  } as unknown as PrismaClient;
  const mockEvents = { publish: jest.fn() };
  const config = { get: jest.fn() } as unknown as ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: config },
        { provide: 'STRIPE_CLIENT', useValue: null },
        { provide: 'EVENTS_SERVICE', useValue: mockEvents },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('capturePayment fails fast with 503 stripe_not_configured', async () => {
    await expect(service.capturePayment('order-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect((mockPrisma as any).order.findUnique).not.toHaveBeenCalled();
  });

  it('cancelPayment fails fast with 503 stripe_not_configured', async () => {
    await expect(service.cancelPayment('order-1')).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect((mockPrisma as any).order.findUnique).not.toHaveBeenCalled();
  });

  it('getPaymentIntent fails fast with 503 stripe_not_configured', async () => {
    const promise = service.getPaymentIntent('pi_123');
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise.catch(e => JSON.stringify(e.getResponse()))).resolves.toContain(
      'stripe_not_configured',
    );
  });

  it('findByOrder (non-Stripe) still works when Stripe is unconfigured', async () => {
    (mockPrisma as any).payment = { findMany: jest.fn().mockResolvedValue([]) };
    await expect(service.findByOrder('order-1')).resolves.toEqual([]);
  });
});
