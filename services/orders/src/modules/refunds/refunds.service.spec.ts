import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { RefundsService } from './refunds.service';
import { PrismaClient } from '../../generated/prisma-client';
import { OrdersAuthorizationResolver } from '../../common/authorization/orders-authorization.resolver';

describe('RefundsService - Stripe unconfigured (parked payment rail)', () => {
  const subject = 'user-123';
  let service: RefundsService;
  const mockPrisma = {
    order: { findUnique: jest.fn() },
  } as unknown as PrismaClient;
  const mockEvents = { publish: jest.fn() };
  const mockAuthorization = {
    authorize: jest.fn(async (_subject, _action, operation) =>
      operation(
        mockPrisma,
        { subject, roles: [], permissions: [], organizationIds: [] },
        { userId: subject },
      ),
    ),
    requireOrder: jest.fn().mockResolvedValue({ id: 'order-1', userId: subject }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RefundsService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: 'STRIPE_CLIENT', useValue: null },
        { provide: 'EVENTS_SERVICE', useValue: mockEvents },
        { provide: OrdersAuthorizationResolver, useValue: mockAuthorization },
      ],
    }).compile();

    service = module.get<RefundsService>(RefundsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('createRefund fails fast with 503 stripe_not_configured', async () => {
    const promise = service.createRefund('order-1', undefined, undefined, subject);
    await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(promise.catch(e => JSON.stringify(e.getResponse()))).resolves.toContain(
      'stripe_not_configured',
    );
    expect((mockPrisma as any).order.findUnique).not.toHaveBeenCalled();
  });

  it('findByOrder (non-Stripe) still works when Stripe is unconfigured', async () => {
    (mockPrisma as any).refund = { findMany: jest.fn().mockResolvedValue([]) };
    await expect(service.findByOrder('order-1', subject)).resolves.toEqual([]);
  });
});
