import { Test, TestingModule } from '@nestjs/testing';
import { CheckoutService } from './checkout.service';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

class FakeStripe {} // Minimal placeholder for type compatibility

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
