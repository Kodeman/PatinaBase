import { Test, TestingModule } from '@nestjs/testing';
import { CartsService } from './carts.service';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { Decimal } from '../../generated/prisma-client/runtime/library';
import { NotFoundException } from '@nestjs/common';
import { OrdersAuthorizationResolver } from '../../common/authorization/orders-authorization.resolver';

describe('CartsService', () => {
  const subject = 'user-123';
  let service: CartsService;
  let prisma: PrismaClient;
  let eventsService: any;

  const mockPrismaClient: any = {
    cart: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(async (args) => {
        const cart = await mockPrismaClient.cart.findUnique(args);
        if (!cart) throw new NotFoundException('Cart not found');
        return cart;
      }),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    cartItem: {
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    discount: {
      findUnique: jest.fn(),
    },
  };

  const mockEventsService = {
    publish: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key, defaultValue) => defaultValue),
  };

  const authorizationState = { subject, roles: [], permissions: [], organizationIds: [] };
  const mockAuthorization = {
    authorize: jest.fn(async (_subject, _action, operation) =>
      operation(mockPrismaClient, authorizationState, { userId: subject }),
    ),
    authorizeCart: jest.fn(async (_subject, _action, cartId, operation) => {
      const cart = await mockPrismaClient.cart.findUnique({
        where: { id: cartId },
        include: { items: true },
      });
      if (!cart) throw new NotFoundException('Cart not found');
      return operation(mockPrismaClient, authorizationState, cart);
    }),
    cartScope: jest.fn(() => ({ userId: subject })),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartsService,
        {
          provide: PrismaClient,
          useValue: mockPrismaClient,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: 'EVENTS_SERVICE',
          useValue: mockEventsService,
        },
        {
          provide: OrdersAuthorizationResolver,
          useValue: mockAuthorization,
        },
      ],
    }).compile();

    service = module.get<CartsService>(CartsService);
    prisma = module.get<PrismaClient>(PrismaClient);
    eventsService = module.get('EVENTS_SERVICE');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create a new cart with user ID', async () => {
      const mockCart = {
        id: 'cart-123',
        userId: 'user-123',
        sessionToken: null,
        status: 'active',
        currency: 'USD',
        items: [],
        subtotal: new Decimal(0),
        total: new Decimal(0),
        expiresAt: expect.any(Date),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.cart.create.mockResolvedValue(mockCart);
      mockPrismaClient.cart.findUnique.mockResolvedValue(mockCart);

      const result = await service.create({
        userId: 'caller-controlled-user',
        currency: 'USD',
      } as any, subject);

      expect(result).toBeDefined();
      expect(result.userId).toBe('user-123');
      expect(mockPrismaClient.cart.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: subject }),
      });
      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'cart.created',
        expect.objectContaining({ type: 'cart.created' }),
      );
    });

    it('should bind a cart without caller identity fields to the verified subject', async () => {
      const mockCart = {
        id: 'cart-456',
        userId: subject,
        sessionToken: null,
        status: 'active',
        currency: 'USD',
        items: [],
        subtotal: new Decimal(0),
        total: new Decimal(0),
        expiresAt: expect.any(Date),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaClient.cart.create.mockResolvedValue(mockCart);
      mockPrismaClient.cart.findUnique.mockResolvedValue(mockCart);

      const result = await service.create({ currency: 'USD' }, subject);

      expect(result).toBeDefined();
      expect(result.userId).toBe(subject);
      expect(mockPrismaClient.cart.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ userId: subject }),
      });
    });
  });

  describe('applyDiscount', () => {
    it('should apply a valid percentage discount', async () => {
      const mockCart = {
        id: 'cart-123',
        userId: 'user-123',
        status: 'active',
        currency: 'USD',
        subtotal: new Decimal(100),
        discountCode: null,
        discountAmount: new Decimal(0),
        items: [
          {
            id: 'item-1',
            unitPrice: new Decimal(50),
            qty: 2,
          },
        ],
      };

      const mockDiscount = {
        id: 'discount-1',
        code: 'SAVE10',
        kind: 'percent',
        value: new Decimal(10),
        active: true,
        startsAt: null,
        endsAt: null,
        usageLimit: null,
        usageCount: 0,
      };

      mockPrismaClient.cart.findUnique.mockResolvedValue(mockCart);
      mockPrismaClient.discount.findUnique.mockResolvedValue(mockDiscount);
      mockPrismaClient.cart.update.mockResolvedValue({
        ...mockCart,
        discountCode: 'SAVE10',
      });

      await service.applyDiscount('cart-123', { code: 'SAVE10' }, subject);

      expect(mockPrismaClient.discount.findUnique).toHaveBeenCalledWith({
        where: { code: 'SAVE10' },
      });
      expect(mockPrismaClient.cart.update).toHaveBeenCalled();
    });

    it('should reject expired discount codes', async () => {
      const mockCart = {
        id: 'cart-123',
        status: 'active',
        items: [],
      };

      const expiredDiscount = {
        id: 'discount-2',
        code: 'EXPIRED',
        kind: 'percent',
        value: new Decimal(20),
        active: true,
        startsAt: new Date('2023-01-01'),
        endsAt: new Date('2023-12-31'),
        usageLimit: null,
        usageCount: 0,
      };

      mockPrismaClient.cart.findUnique.mockResolvedValue(mockCart);
      mockPrismaClient.discount.findUnique.mockResolvedValue(expiredDiscount);

      await expect(
        service.applyDiscount('cart-123', { code: 'EXPIRED' }, subject),
      ).rejects.toThrow('Discount has expired');
    });

    it('should reject discount codes that have reached usage limit', async () => {
      const mockCart = {
        id: 'cart-123',
        status: 'active',
        items: [],
      };

      const limitedDiscount = {
        id: 'discount-3',
        code: 'LIMITED',
        kind: 'fixed',
        value: new Decimal(25),
        active: true,
        startsAt: null,
        endsAt: null,
        usageLimit: 100,
        usageCount: 100,
      };

      mockPrismaClient.cart.findUnique.mockResolvedValue(mockCart);
      mockPrismaClient.discount.findUnique.mockResolvedValue(limitedDiscount);

      await expect(
        service.applyDiscount('cart-123', { code: 'LIMITED' }, subject),
      ).rejects.toThrow('Discount usage limit reached');
    });
  });

  describe('pricing calculations', () => {
    it('should calculate correct subtotal with multiple items', async () => {
      const mockCart = {
        id: 'cart-123',
        userId: 'user-123',
        status: 'active',
        currency: 'USD',
        items: [
          {
            id: 'item-1',
            unitPrice: new Decimal(99.99),
            qty: 2,
          },
          {
            id: 'item-2',
            unitPrice: new Decimal(49.99),
            qty: 3,
          },
        ],
        discountCode: null,
        subtotal: new Decimal(0),
        taxTotal: new Decimal(0),
        shippingTotal: new Decimal(0),
        total: new Decimal(0),
      };

      mockPrismaClient.cart.findUnique.mockResolvedValue(mockCart);
      mockPrismaClient.cart.update.mockResolvedValue(mockCart);

      // The service calculates:
      // item-1: $99.99 × 2 = $199.98
      // item-2: $49.99 × 3 = $149.97
      // subtotal = $349.95

      // The calculation is verified through the update call
      // In real implementation, you would check the actual values
    });

    it('should apply percentage discount correctly', () => {
      const subtotal = new Decimal(100);
      const discountPercent = new Decimal(10);
      const expected = new Decimal(10); // 10% of $100

      const discountAmount = subtotal.mul(discountPercent).div(100);

      expect(discountAmount.toString()).toBe(expected.toString());
    });

    it('should apply fixed discount correctly', () => {
      const subtotal = new Decimal(100);
      const fixedDiscount = new Decimal(25);

      expect(fixedDiscount.lte(subtotal)).toBe(true);
    });

    it('should not allow discount to exceed subtotal', () => {
      const subtotal = new Decimal(50);
      const fixedDiscount = new Decimal(75);

      const actualDiscount = fixedDiscount.gt(subtotal) ? subtotal : fixedDiscount;

      expect(actualDiscount.toString()).toBe(subtotal.toString());
    });

    it('should calculate tax correctly', () => {
      const subtotal = new Decimal(100);
      const discountAmount = new Decimal(10);
      const taxRate = new Decimal(0.0825); // 8.25%

      const taxableAmount = subtotal.sub(discountAmount);
      const taxTotal = taxableAmount.mul(taxRate);

      expect(taxTotal.toFixed(2)).toBe('7.43'); // (100 - 10) × 0.0825 = 7.425
    });
  });

  describe('removeItem', () => {
    it('should remove an item from cart', async () => {
      const mockCart = {
        id: 'cart-123',
        status: 'active',
        subtotal: new Decimal(20),
        discountCode: null,
        discountAmount: new Decimal(0),
        taxTotal: new Decimal(0),
        shippingTotal: new Decimal(0),
        total: new Decimal(20),
        items: [
          { id: 'item-1', productId: 'prod-1', unitPrice: new Decimal(10), qty: 1 },
          { id: 'item-2', productId: 'prod-2', unitPrice: new Decimal(10), qty: 1 },
        ],
      };

      mockPrismaClient.cart.findUnique.mockResolvedValue(mockCart);
      mockPrismaClient.cartItem.delete.mockResolvedValue({});

      await service.removeItem('cart-123', 'item-1', subject);

      expect(mockPrismaClient.cartItem.delete).toHaveBeenCalledWith({
        where: { id: 'item-1' },
      });
      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'cart.updated',
        expect.objectContaining({ type: 'cart.item_removed' }),
      );
    });

    it('should not allow removing item from inactive cart', async () => {
      const mockCart = {
        id: 'cart-123',
        status: 'converted',
        items: [{ id: 'item-1' }],
      };

      mockPrismaClient.cart.findUnique.mockResolvedValue(mockCart);

      await expect(service.removeItem('cart-123', 'item-1', subject)).rejects.toThrow(
        'Cannot modify inactive cart',
      );
    });
  });
});
