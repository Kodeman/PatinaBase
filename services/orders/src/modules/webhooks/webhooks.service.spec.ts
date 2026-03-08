import { Test, TestingModule } from '@nestjs/testing';
import { WebhooksService } from './webhooks.service';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { Decimal } from '../../generated/prisma-client/runtime/library';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: PrismaClient;
  let stripe: Stripe;
  let eventsService: any;

  const mockPrismaClient = {
    order: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    cart: {
      update: jest.fn(),
    },
    payment: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
    },
    refund: {
      create: jest.fn(),
      findUnique: jest.fn(),
      aggregate: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    idempotencyKey: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockStripe = {
    webhooks: {
      constructEvent: jest.fn(),
    },
  };

  const mockEventsService = {
    publish: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key) => {
      if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test_secret';
      return null;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        {
          provide: PrismaClient,
          useValue: mockPrismaClient,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: 'STRIPE_CLIENT',
          useValue: mockStripe,
        },
        {
          provide: 'EVENTS_SERVICE',
          useValue: mockEventsService,
        },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
    prisma = module.get<PrismaClient>(PrismaClient);
    stripe = module.get('STRIPE_CLIENT');
    eventsService = module.get('EVENTS_SERVICE');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('payment_intent.succeeded', () => {
    it('should process successful payment and update order status', async () => {
      const mockPaymentIntent = {
        id: 'pi_123',
        amount: 10000, // $100.00 in cents
        currency: 'usd',
        status: 'succeeded',
        metadata: { cartId: 'cart-123' },
        latest_charge: 'ch_123',
        payment_method: 'pm_123',
        charges: {
          data: [
            {
              id: 'ch_123',
              payment_method_details: {
                card: {
                  last4: '4242',
                  brand: 'visa',
                  country: 'US',
                },
              },
              outcome: {
                risk_score: 10,
                risk_level: 'normal',
              },
            },
          ],
        },
      };

      const mockOrder = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        paymentIntentId: 'pi_123',
        cartId: 'cart-123',
        status: 'created',
        paymentStatus: 'pending',
      };

      const mockEvent = {
        id: 'evt_123',
        type: 'payment_intent.succeeded',
        data: {
          object: mockPaymentIntent,
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.idempotencyKey.findUnique.mockResolvedValue(null);
      mockPrismaClient.idempotencyKey.create.mockResolvedValue({});
      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaClient.order.update.mockResolvedValue({
        ...mockOrder,
        status: 'paid',
        paymentStatus: 'captured',
        paidAt: new Date(),
      });
      mockPrismaClient.payment.create.mockResolvedValue({});
      mockPrismaClient.cart.update.mockResolvedValue({});
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      const result = await service.handleStripeWebhook(
        'test-signature',
        Buffer.from('{}'),
      );

      expect(result.received).toBe(true);
      expect(mockPrismaClient.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-123',
          status: 'succeeded',
          amount: new Decimal(100),
          currency: 'USD',
          paymentIntentId: 'pi_123',
          chargeId: 'ch_123',
          last4: '4242',
          brand: 'visa',
        }),
      });
      expect(mockPrismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 'order-123' },
        data: expect.objectContaining({
          status: 'paid',
          paymentStatus: 'captured',
        }),
      });
      expect(mockPrismaClient.cart.update).toHaveBeenCalledWith({
        where: { id: 'cart-123' },
        data: expect.objectContaining({
          status: 'converted',
        }),
      });
      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'payment.succeeded',
        expect.any(Object),
      );
    });
  });

  describe('payment_intent.payment_failed', () => {
    it('should process failed payment and update order', async () => {
      const mockPaymentIntent = {
        id: 'pi_failed',
        amount: 10000,
        currency: 'usd',
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined',
        },
      };

      const mockOrder = {
        id: 'order-failed',
        orderNumber: 'ORD-002',
        paymentIntentId: 'pi_failed',
        status: 'created',
        paymentStatus: 'pending',
      };

      const mockEvent = {
        id: 'evt_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: mockPaymentIntent,
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.idempotencyKey.findUnique.mockResolvedValue(null);
      mockPrismaClient.idempotencyKey.create.mockResolvedValue({});
      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaClient.order.update.mockResolvedValue({});
      mockPrismaClient.payment.create.mockResolvedValue({});

      await service.handleStripeWebhook('test-signature', Buffer.from('{}'));

      expect(mockPrismaClient.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-failed',
          status: 'failed',
          failureCode: 'card_declined',
          failureMessage: 'Your card was declined',
        }),
      });
      expect(mockPrismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 'order-failed' },
        data: { paymentStatus: 'failed' },
      });
      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'payment.failed',
        expect.objectContaining({
          payload: expect.objectContaining({
            failureCode: 'card_declined',
          }),
        }),
      );
    });
  });

  describe('charge.refunded', () => {
    it('should process refund and update order status', async () => {
      const mockCharge = {
        id: 'ch_123',
        payment_intent: 'pi_123',
        refunded: true,
        refunds: {
          data: [
            {
              id: 'ref_123',
              amount: 5000, // $50.00 partial refund
              currency: 'usd',
              reason: 'requested_by_customer',
              status: 'succeeded',
              created: Math.floor(Date.now() / 1000),
            },
          ],
        },
      };

      const mockOrder = {
        id: 'order-123',
        orderNumber: 'ORD-001',
        paymentIntentId: 'pi_123',
        total: new Decimal(100),
      };

      const mockPayment = {
        id: 'payment-123',
        orderId: 'order-123',
        chargeId: 'ch_123',
        paymentIntentId: 'pi_123',
      };

      const mockEvent = {
        id: 'evt_refund',
        type: 'charge.refunded',
        data: {
          object: mockCharge,
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.idempotencyKey.findUnique.mockResolvedValue(null);
      mockPrismaClient.idempotencyKey.create.mockResolvedValue({});
      mockPrismaClient.payment.findUnique.mockResolvedValue(mockPayment);
      mockPrismaClient.refund.findUnique.mockResolvedValue(null);
      mockPrismaClient.refund.create.mockResolvedValue({});
      mockPrismaClient.refund.aggregate.mockResolvedValue({
        _sum: { amount: new Decimal(50) },
      });
      mockPrismaClient.order.update.mockResolvedValue({});

      await service.handleStripeWebhook('test-signature', Buffer.from('{}'));

      expect(mockPrismaClient.refund.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: 'order-123',
          amount: new Decimal(50),
          status: 'succeeded',
          reason: 'requested_by_customer',
          providerRefundId: 'ref_123',
        }),
      });
      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'refund.succeeded',
        expect.any(Object),
      );
    });

    it('should mark order as refunded when fully refunded', async () => {
      const mockCharge = {
        id: 'ch_full_refund',
        payment_intent: 'pi_full_refund',
        refunded: true,
        refunds: {
          data: [
            {
              id: 'ref_full',
              amount: 10000, // Full $100.00 refund
              currency: 'usd',
              reason: 'duplicate',
              status: 'succeeded',
              created: Math.floor(Date.now() / 1000),
            },
          ],
        },
      };

      const mockOrder = {
        id: 'order-full-refund',
        orderNumber: 'ORD-003',
        paymentIntentId: 'pi_full_refund',
        total: new Decimal(100),
      };

      const mockPayment = {
        id: 'payment-full-refund',
        orderId: 'order-full-refund',
        chargeId: 'ch_full_refund',
        paymentIntentId: 'pi_full_refund',
        order: mockOrder,
      };

      const mockEvent = {
        id: 'evt_full_refund',
        type: 'charge.refunded',
        data: {
          object: mockCharge,
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.idempotencyKey.findUnique.mockResolvedValue(null);
      mockPrismaClient.idempotencyKey.create.mockResolvedValue({});
      mockPrismaClient.payment.findUnique.mockResolvedValue(mockPayment);
      mockPrismaClient.refund.findUnique.mockResolvedValue(null);
      mockPrismaClient.refund.create.mockResolvedValue({});

      await service.handleStripeWebhook('test-signature', Buffer.from('{}'));

      expect(mockPrismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 'order-full-refund' },
        data: {
          status: 'refunded',
          paymentStatus: 'refunded',
        },
      });
    });
  });

  describe('webhook idempotency', () => {
    it('should skip processing if webhook already handled', async () => {
      const mockEvent = {
        id: 'evt_duplicate',
        type: 'payment_intent.succeeded',
        data: { object: {} },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.idempotencyKey.findUnique.mockResolvedValue({
        id: 'idem-1',
        key: 'webhook:evt_duplicate',
        response: {},
      });

      const result = await service.handleStripeWebhook(
        'test-signature',
        Buffer.from('{}'),
      );

      expect(result.received).toBe(true);
      // Should not create new payment or update order
      expect(mockPrismaClient.payment.create).not.toHaveBeenCalled();
      expect(mockPrismaClient.order.update).not.toHaveBeenCalled();
    });
  });

  describe('checkout.session.completed', () => {
    it('should link payment intent to order', async () => {
      const mockSession = {
        id: 'cs_123',
        payment_intent: 'pi_123',
        customer: 'cus_123',
        metadata: { cartId: 'cart-123' },
        client_reference_id: 'cart-123',
      };

      const mockOrder = {
        id: 'order-session',
        orderNumber: 'ORD-SESSION',
        checkoutSessionId: 'cs_123',
        paymentIntentId: null,
        customerId: null,
      };

      const mockEvent = {
        id: 'evt_session',
        type: 'checkout.session.completed',
        data: {
          object: mockSession,
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.idempotencyKey.findUnique.mockResolvedValue(null);
      mockPrismaClient.idempotencyKey.create.mockResolvedValue({});
      mockPrismaClient.order.findUnique.mockResolvedValue(mockOrder);
      mockPrismaClient.order.update.mockResolvedValue({});

      await service.handleStripeWebhook('test-signature', Buffer.from('{}'));

      expect(mockPrismaClient.order.update).toHaveBeenCalledWith({
        where: { id: 'order-session' },
        data: {
          paymentIntentId: 'pi_123',
          customerId: 'cus_123',
        },
      });
      expect(mockEventsService.publish).toHaveBeenCalledWith(
        'checkout.completed',
        expect.any(Object),
      );
    });
  });
});
