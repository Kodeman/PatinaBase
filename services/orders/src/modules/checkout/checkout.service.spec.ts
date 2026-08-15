import { Test, TestingModule } from '@nestjs/testing';
import { ServiceUnavailableException } from '@nestjs/common';
import { CheckoutService } from './checkout.service';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { OrdersAuthorizationResolver } from '../../common/authorization/orders-authorization.resolver';

class FakeStripe {} // Minimal placeholder for type compatibility

const subject = 'user-123';
const mockAuthorization = {
  authorizeCart: jest.fn(),
};

describe('CheckoutService - Order Numbers', () => {
  let service: CheckoutService;
  const mockPrisma = {} as unknown as PrismaClient;
  const mockEvents = { publish: jest.fn() };
  const config = {
    get: jest.fn((key: string, defaultValue?: string) => {
      if (key === 'ORDER_NUMBER_PREFIX') {
        return 'ORD';
      }
      return defaultValue;
    }),
  } as unknown as ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: config },
        { provide: 'STRIPE_CLIENT', useValue: new FakeStripe() as unknown as Stripe },
        { provide: 'EVENTS_SERVICE', useValue: mockEvents },
        { provide: OrdersAuthorizationResolver, useValue: mockAuthorization },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should generate order numbers with expected format and entropy', async () => {
    const numbers = await Promise.all(
      Array.from({ length: 5 }).map(() => (service as any).generateOrderNumber()),
    );

    numbers.forEach(orderNumber => {
      expect(orderNumber).toMatch(/^ORD-\d{8}-[0-9A-Z]{4}$/);
    });

    expect(new Set(numbers).size).toBe(numbers.length);
  });
});

describe('CheckoutService - Stripe unconfigured (parked payment rail)', () => {
  let service: CheckoutService;
  const mockPrisma = {
    cart: { findUnique: jest.fn() },
  } as unknown as PrismaClient;
  const mockEvents = { publish: jest.fn() };
  const config = { get: jest.fn() } as unknown as ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckoutService,
        { provide: PrismaClient, useValue: mockPrisma },
        { provide: ConfigService, useValue: config },
        { provide: 'STRIPE_CLIENT', useValue: null },
        { provide: 'EVENTS_SERVICE', useValue: mockEvents },
        { provide: OrdersAuthorizationResolver, useValue: mockAuthorization },
      ],
    }).compile();

    service = module.get<CheckoutService>(CheckoutService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('createCheckoutSession fails fast with 503 stripe_not_configured', async () => {
    await expect(service.createCheckoutSession({ cartId: 'cart-1' } as any, subject)).rejects.toMatchObject(
      {
        status: 503,
      },
    );

    try {
      await service.createCheckoutSession({ cartId: 'cart-1' } as any, subject);
      fail('expected createCheckoutSession to throw');
    } catch (error: any) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      expect(JSON.stringify(error.getResponse())).toContain('stripe_not_configured');
    }

    // Must fail before touching the database.
    expect((mockPrisma as any).cart.findUnique).not.toHaveBeenCalled();
  });

  it('createPaymentIntent fails fast with 503 stripe_not_configured', async () => {
    await expect(service.createPaymentIntent({ cartId: 'cart-1' } as any, subject)).rejects.toMatchObject({
      status: 503,
    });

    expect((mockPrisma as any).cart.findUnique).not.toHaveBeenCalled();
  });
});
