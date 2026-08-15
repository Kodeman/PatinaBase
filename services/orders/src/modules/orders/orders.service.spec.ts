import { Test, TestingModule } from '@nestjs/testing';
import { OrdersService } from './orders.service';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrdersAuthorizationResolver } from '../../common/authorization/orders-authorization.resolver';

describe('OrdersService', () => {
  const subject = 'user-123';
  let service: OrdersService;
  let prisma: PrismaClient;
  let eventsService: any;

  const mockPrismaClient = {
    order: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  };

  const mockEventsService = {
    publish: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key, defaultValue) => defaultValue),
  };

  const mockAuthorization = {
    authorize: jest.fn(async (_subject, _action, operation) =>
      operation(
        mockPrismaClient,
        { subject, roles: [], permissions: [], organizationIds: [] },
        { userId: subject },
      ),
    ),
    requireOrder: jest.fn(async (database, _scope, where) => {
      const order = await database.order.findUnique({ where });
      if (!order) throw new NotFoundException('Order not found');
      return order;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrdersService,
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

    service = module.get<OrdersService>(OrdersService);
    prisma = module.get<PrismaClient>(PrismaClient);
    eventsService = module.get('EVENTS_SERVICE');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('State Machine Transitions', () => {
    it('should allow transition from created to paid', async () => {
      const mockOrder = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        status: 'created',
        paymentStatus: 'pending',
        paidAt: null,
        items: [],
        payments: [],
        refunds: [],
        shipments: [],
      };

      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaClient.order.update.mockResolvedValue({
        ...mockOrder,
        status: 'paid',
        paidAt: new Date(),
      });

      const result = await service.updateStatus('order-123', 'paid', subject);

      expect(result.status).toBe('paid');
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalled();
      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'order.paid',
        expect.any(Object),
      );
    });

    it('should allow transition from paid to fulfilled', async () => {
      const mockOrder = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        status: 'paid',
        paidAt: new Date(),
        fulfilledAt: null,
        fulfillmentStatus: 'unfulfilled',
        items: [],
        payments: [],
        refunds: [],
        shipments: [],
      };

      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaClient.order.update.mockResolvedValue({
        ...mockOrder,
        status: 'fulfilled',
        fulfilledAt: new Date(),
        fulfillmentStatus: 'fulfilled',
      });

      const result = await service.updateStatus('order-123', 'fulfilled', subject);

      expect(result.status).toBe('fulfilled');
      expect(result.fulfillmentStatus).toBe('fulfilled');
    });

    it('should allow transition from fulfilled to closed', async () => {
      const mockOrder = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        status: 'fulfilled',
        fulfilledAt: new Date(),
        closedAt: null,
        items: [],
        payments: [],
        refunds: [],
        shipments: [],
      };

      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaClient.order.update.mockResolvedValue({
        ...mockOrder,
        status: 'closed',
        closedAt: new Date(),
      });

      const result = await service.updateStatus('order-123', 'closed', subject);

      expect(result.status).toBe('closed');
    });

    it('should reject invalid transition from closed to paid', async () => {
      const mockOrder = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        status: 'closed',
        items: [],
        payments: [],
        refunds: [],
        shipments: [],
      };

      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);

      await expect(service.updateStatus('order-123', 'paid', subject)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject invalid transition from created to fulfilled', async () => {
      const mockOrder = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        status: 'created',
        items: [],
        payments: [],
        refunds: [],
        shipments: [],
      };

      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);

      await expect(
        service.updateStatus('order-123', 'fulfilled', subject),
      ).rejects.toThrow(BadRequestException);
    });

    it('should allow cancellation from created status', async () => {
      const mockOrder = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        status: 'created',
        paymentStatus: 'pending',
        items: [],
        payments: [],
        refunds: [],
        shipments: [],
      };

      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaClient.order.update.mockResolvedValue({
        ...mockOrder,
        status: 'canceled',
        canceledAt: new Date(),
      });

      await service.cancel('order-123', 'Customer request', subject);

      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'order.canceled',
        expect.objectContaining({
          payload: expect.objectContaining({
            reason: 'Customer request',
          }),
        }),
      );
    });

    it('should not allow cancellation of paid order without refund', async () => {
      const mockOrder = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        status: 'paid',
        paymentStatus: 'captured',
        items: [],
        payments: [],
        refunds: [],
        shipments: [],
      };

      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);

      await expect(
        service.cancel('order-123', 'Customer request', subject),
      ).rejects.toThrow('Cannot cancel paid order without refund');
    });
  });

  describe('findAll with filters', () => {
    it('should filter orders by user ID', async () => {
      const mockOrders = [
        { id: 'order-1', userId: 'user-123', status: 'paid' },
        { id: 'order-2', userId: 'user-123', status: 'fulfilled' },
      ];

      mockPrismaClient.order.findMany.mockResolvedValue(mockOrders);
      mockPrismaClient.order.count.mockResolvedValue(2);

      const result = await service.findAll({ userId: 'caller-controlled-user' }, subject);

      expect(result.data).toHaveLength(2);
      expect(result.pagination.total).toBe(2);
      expect(mockPrismaClient.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ userId: subject }, {}] },
        }),
      );
    });

    it('should filter orders by status', async () => {
      const mockOrders = [{ id: 'order-1', status: 'paid' }];

      mockPrismaClient.order.findMany.mockResolvedValue(mockOrders);
      mockPrismaClient.order.count.mockResolvedValue(1);

      const result = await service.findAll({ status: 'paid' }, subject);

      expect(result.data).toHaveLength(1);
      expect(mockPrismaClient.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { AND: [{ userId: subject }, { status: 'paid' }] },
        }),
      );
    });

    it('should filter orders by date range', async () => {
      const fromDate = new Date('2025-01-01');
      const toDate = new Date('2025-12-31');

      mockPrismaClient.order.findMany.mockResolvedValue([]);
      mockPrismaClient.order.count.mockResolvedValue(0);

      await service.findAll({ from: fromDate, to: toDate }, subject);

      expect(mockPrismaClient.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            AND: [
              { userId: subject },
              { createdAt: { gte: fromDate, lte: toDate } },
            ],
          },
        }),
      );
    });

    it('should support pagination', async () => {
      mockPrismaClient.order.findMany.mockResolvedValue([]);
      mockPrismaClient.order.count.mockResolvedValue(100);

      await service.findAll({ skip: 20, take: 10 }, subject);

      expect(mockPrismaClient.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          skip: 20,
          take: 10,
        }),
      );
    });
  });

  describe('validateStatusTransition', () => {
    const validTransitions = [
      ['created', 'paid'],
      ['created', 'canceled'],
      ['paid', 'processing'],
      ['paid', 'fulfilled'],
      ['paid', 'refunded'],
      ['processing', 'fulfilled'],
      ['fulfilled', 'closed'],
      ['refunded', 'closed'],
    ];

    validTransitions.forEach(([from, to]) => {
      it(`should allow ${from} -> ${to}`, async () => {
        const mockOrder = {
          id: 'order-123',
          orderNumber: 'ORD-001',
          status: from,
          items: [],
          payments: [],
          refunds: [],
          shipments: [],
        };

        mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);
        mockPrismaClient.order.update.mockResolvedValue({
          ...mockOrder,
          status: to,
        });

        await expect(service.updateStatus('order-123', to, subject)).resolves.toBeDefined();
      });
    });

    const invalidTransitions = [
      ['closed', 'paid'],
      ['closed', 'fulfilled'],
      ['canceled', 'paid'],
      ['created', 'fulfilled'],
      ['created', 'closed'],
    ];

    invalidTransitions.forEach(([from, to]) => {
      it(`should reject ${from} -> ${to}`, async () => {
        const mockOrder = {
          id: 'order-123',
          orderNumber: 'ORD-001',
          status: from,
          items: [],
          payments: [],
          refunds: [],
          shipments: [],
        };

        mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);

        await expect(service.updateStatus('order-123', to, subject)).rejects.toThrow(
          BadRequestException,
        );
      });
    });
  });
});
