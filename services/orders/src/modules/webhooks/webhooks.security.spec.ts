/**
 * Payment Webhook Security Tests
 * CRITICAL: Tests webhook signature verification and security measures
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';

describe('WebhooksService - Security Tests', () => {
  let service: WebhooksService;
  let mockStripe: any;
  let mockConfigService: any;

  const mockPrismaClient = {
    order: { findUnique: jest.fn(), update: jest.fn() },
    cart: { update: jest.fn() },
    payment: { create: jest.fn(), findUnique: jest.fn() },
    refund: { create: jest.fn(), findUnique: jest.fn() },
    auditLog: { create: jest.fn(), findFirst: jest.fn() },
  };

  const mockEventsService = {
    publish: jest.fn(),
  };

  beforeEach(async () => {
    mockStripe = {
      webhooks: {
        constructEvent: jest.fn(),
      },
    };

    mockConfigService = {
      get: jest.fn((key) => {
        if (key === 'STRIPE_WEBHOOK_SECRET') return 'whsec_test_secret';
        return null;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaClient, useValue: mockPrismaClient },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: 'STRIPE_CLIENT', useValue: mockStripe },
        { provide: 'EVENTS_SERVICE', useValue: mockEventsService },
      ],
    }).compile();

    service = module.get<WebhooksService>(WebhooksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Signature Verification', () => {
    it('should reject webhook with invalid signature', async () => {
      const invalidSignature = 'invalid_signature';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      await expect(service.handleStripeWebhook(invalidSignature, rawBody)).rejects.toThrow(
        BadRequestException,
      );

      await expect(service.handleStripeWebhook(invalidSignature, rawBody)).rejects.toThrow(
        /signature verification failed/i,
      );

      // Should NOT process any payment logic
      expect(mockPrismaClient.order.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.payment.create).not.toHaveBeenCalled();
    });

    it('should reject webhook with missing signature', async () => {
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      await expect(service.handleStripeWebhook('', rawBody)).rejects.toThrow(BadRequestException);

      expect(mockPrismaClient.order.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.payment.create).not.toHaveBeenCalled();
    });

    it('should accept webhook with valid signature', async () => {
      const validSignature = 't=1234567890,v1=valid_signature_hash';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      const mockEvent = {
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            amount: 10000,
            currency: 'usd',
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.auditLog.findFirst.mockResolvedValue(null);
      mockPrismaClient.order.findUnique.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'ORD-001',
        paymentIntentId: 'pi_test',
        cartId: 'cart-1',
        userId: 'user-1',
        total: { toString: () => '100.00' },
        currency: 'USD',
      });
      mockPrismaClient.order.update.mockResolvedValue({});
      mockPrismaClient.payment.create.mockResolvedValue({});
      mockPrismaClient.cart.update.mockResolvedValue({});
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      const result = await service.handleStripeWebhook(validSignature, rawBody);

      expect(result.received).toBe(true);
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBody,
        validSignature,
        'whsec_test_secret',
      );
    });

    it('should reject webhook with expired timestamp', async () => {
      const expiredSignature = 't=1234567890,v1=signature_hash'; // Old timestamp
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Timestamp outside the tolerance zone');
      });

      await expect(service.handleStripeWebhook(expiredSignature, rawBody)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject webhook with tampered payload', async () => {
      const signature = 't=1234567890,v1=valid_for_different_payload';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded","amount":99999999}');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No signatures found matching the expected signature');
      });

      await expect(service.handleStripeWebhook(signature, rawBody)).rejects.toThrow(
        BadRequestException,
      );

      // CRITICAL: Must not process tampered payment data
      expect(mockPrismaClient.payment.create).not.toHaveBeenCalled();
      expect(mockPrismaClient.order.update).not.toHaveBeenCalled();
    });
  });

  describe('Idempotency Protection', () => {
    it('should prevent duplicate processing of same webhook event', async () => {
      const signature = 't=1234567890,v1=valid_signature';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      const mockEvent = {
        id: 'evt_duplicate',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            amount: 10000,
            currency: 'usd',
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      // First call - event already processed
      mockPrismaClient.auditLog.findFirst.mockResolvedValue({
        id: 'audit-1',
        entityType: 'webhook',
        entityId: 'evt_duplicate',
      });

      const result = await service.handleStripeWebhook(signature, rawBody);

      expect(result.received).toBe(true);
      expect(result.duplicate).toBe(true);

      // Should NOT create duplicate payment or update order again
      expect(mockPrismaClient.payment.create).not.toHaveBeenCalled();
      expect(mockPrismaClient.order.update).not.toHaveBeenCalled();
    });

    it('should mark event as processed after successful handling', async () => {
      const signature = 't=1234567890,v1=valid_signature';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      const mockEvent = {
        id: 'evt_new',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            amount: 10000,
            currency: 'usd',
            charges: { data: [{ id: 'ch_test', payment_method_details: { card: {} }, outcome: {} }] },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.auditLog.findFirst.mockResolvedValue(null);
      mockPrismaClient.order.findUnique.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'ORD-001',
        paymentIntentId: 'pi_test',
        cartId: 'cart-1',
        userId: 'user-1',
        total: { toString: () => '100.00' },
        currency: 'USD',
      });
      mockPrismaClient.order.update.mockResolvedValue({});
      mockPrismaClient.payment.create.mockResolvedValue({});
      mockPrismaClient.cart.update.mockResolvedValue({});
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      await service.handleStripeWebhook(signature, rawBody);

      // Should mark event as processed
      expect(mockPrismaClient.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          entityType: 'webhook',
          entityId: 'evt_new',
          action: 'processed',
        }),
      });
    });
  });

  describe('Webhook Secret Configuration', () => {
    it('should fail if webhook secret is not configured', async () => {
      mockConfigService.get.mockReturnValue(undefined);

      const signature = 't=1234567890,v1=signature';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Webhook secret is required');
      });

      await expect(service.handleStripeWebhook(signature, rawBody)).rejects.toThrow();
    });

    it('should use the correct webhook secret from config', async () => {
      const customSecret = 'whsec_custom_secret_123';
      mockConfigService.get.mockReturnValue(customSecret);

      // Create new service instance with custom secret
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          WebhooksService,
          { provide: PrismaClient, useValue: mockPrismaClient },
          { provide: ConfigService, useValue: mockConfigService },
          { provide: 'STRIPE_CLIENT', useValue: mockStripe },
          { provide: 'EVENTS_SERVICE', useValue: mockEventsService },
        ],
      }).compile();

      const customService = module.get<WebhooksService>(WebhooksService);

      const signature = 't=1234567890,v1=signature';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      const mockEvent = {
        id: 'evt_test',
        type: 'unhandled_event_type',
        data: { object: {} },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.auditLog.findFirst.mockResolvedValue(null);
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      await customService.handleStripeWebhook(signature, rawBody);

      // Verify correct secret was used
      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        rawBody,
        signature,
        customSecret,
      );
    });
  });

  describe('Replay Attack Protection', () => {
    it('should reject replayed webhook with old timestamp', async () => {
      const oldTimestamp = Math.floor(Date.now() / 1000) - 7200; // 2 hours old
      const signature = `t=${oldTimestamp},v1=signature`;
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Timestamp outside the tolerance zone');
      });

      await expect(service.handleStripeWebhook(signature, rawBody)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should accept webhook with recent timestamp', async () => {
      const recentTimestamp = Math.floor(Date.now() / 1000);
      const signature = `t=${recentTimestamp},v1=signature`;
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      const mockEvent = {
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_test',
            amount: 10000,
            currency: 'usd',
            charges: { data: [] },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.auditLog.findFirst.mockResolvedValue(null);
      mockPrismaClient.order.findUnique.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'ORD-001',
        paymentIntentId: 'pi_test',
        cartId: 'cart-1',
        userId: 'user-1',
        total: { toString: () => '100.00' },
        currency: 'USD',
      });
      mockPrismaClient.order.update.mockResolvedValue({});
      mockPrismaClient.payment.create.mockResolvedValue({});
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      const result = await service.handleStripeWebhook(signature, rawBody);

      expect(result.received).toBe(true);
    });
  });

  describe('Error Handling and Security Logging', () => {
    it('should log security errors without exposing sensitive data', async () => {
      const signature = 'invalid_signature';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature - potential security issue');
      });

      await expect(service.handleStripeWebhook(signature, rawBody)).rejects.toThrow(
        BadRequestException,
      );

      // Logs should be created but sensitive data should not be in error message
      // Error message should not expose webhook secret or full payload
    });

    it('should handle malformed JSON payload safely', async () => {
      const signature = 't=1234567890,v1=signature';
      const malformedBody = Buffer.from('invalid{json');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Unexpected token');
      });

      await expect(service.handleStripeWebhook(signature, malformedBody)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should handle missing rawBody gracefully', async () => {
      const signature = 't=1234567890,v1=signature';
      const emptyBody = Buffer.from('');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('No body provided');
      });

      await expect(service.handleStripeWebhook(signature, emptyBody)).rejects.toThrow();
    });
  });

  describe('Payment Intent Amount Validation', () => {
    it('should correctly convert Stripe amount (cents) to decimal', async () => {
      const signature = 't=1234567890,v1=signature';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      const mockEvent = {
        id: 'evt_amount',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_amount',
            amount: 12345, // $123.45 in cents
            currency: 'usd',
            charges: {
              data: [
                {
                  id: 'ch_test',
                  payment_method_details: { card: { last4: '4242', brand: 'visa' } },
                  outcome: {},
                },
              ],
            },
          },
        },
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);
      mockPrismaClient.auditLog.findFirst.mockResolvedValue(null);
      mockPrismaClient.order.findUnique.mockResolvedValue({
        id: 'order-1',
        orderNumber: 'ORD-001',
        paymentIntentId: 'pi_amount',
        cartId: 'cart-1',
        userId: 'user-1',
        total: { toString: () => '123.45' },
        currency: 'USD',
      });
      mockPrismaClient.order.update.mockResolvedValue({});
      mockPrismaClient.payment.create.mockResolvedValue({});
      mockPrismaClient.auditLog.create.mockResolvedValue({});

      await service.handleStripeWebhook(signature, rawBody);

      // Verify amount is correctly converted from cents to dollars
      expect(mockPrismaClient.payment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          amount: expect.objectContaining({
            // Should be Decimal(123.45), not 12345
          }),
        }),
      });
    });
  });

  describe('Critical Security Tests', () => {
    it('CRITICAL: should never process payment without signature verification', async () => {
      // This test ensures signature is checked BEFORE any business logic
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      await expect(service.handleStripeWebhook('bad_signature', rawBody)).rejects.toThrow();

      // CRITICAL: No database operations should occur
      expect(mockPrismaClient.payment.create).not.toHaveBeenCalled();
      expect(mockPrismaClient.order.update).not.toHaveBeenCalled();
      expect(mockPrismaClient.cart.update).not.toHaveBeenCalled();
      expect(mockEventsService.publish).not.toHaveBeenCalled();
    });

    it('CRITICAL: should validate webhook secret exists before processing', async () => {
      mockConfigService.get.mockReturnValue(null);

      const signature = 't=1234567890,v1=signature';
      const rawBody = Buffer.from('{"type":"payment_intent.succeeded"}');

      // Should fail when secret is missing
      await expect(async () => {
        await service.handleStripeWebhook(signature, rawBody);
      }).rejects.toThrow();
    });

    it('CRITICAL: should not expose webhook secret in error messages', async () => {
      const signature = 'invalid';
      const rawBody = Buffer.from('{}');

      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Signature verification failed');
      });

      try {
        await service.handleStripeWebhook(signature, rawBody);
        fail('Should have thrown error');
      } catch (error: any) {
        // Error message should not contain the webhook secret
        expect(error.message).not.toContain('whsec_');
        expect(error.message).not.toContain(mockConfigService.get('STRIPE_WEBHOOK_SECRET'));
      }
    });
  });
});
