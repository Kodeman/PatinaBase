/**
 * Stripe Checkout Integration Tests
 *
 * STRATEGY: Uses in-memory Stripe mock for CI/CD
 *
 * To run with real Stripe test API (local development):
 *   RUN_REAL_INTEGRATION_TESTS=true STRIPE_SECRET_KEY=sk_test_xxx npm test -- stripe-checkout.e2e.spec.ts
 *
 * To run with mock (CI/CD default):
 *   npm test -- stripe-checkout.e2e.spec.ts
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../../src/generated/prisma-client';
import Stripe from 'stripe';
import { AppModule } from '../../src/app.module';
import { createMockStripeClient } from '@patina/testing';

// Determine test strategy
const USE_REAL_STRIPE = process.env.RUN_REAL_INTEGRATION_TESTS === 'true' && process.env.STRIPE_SECRET_KEY;

// Mock Stripe for CI/CD
if (!USE_REAL_STRIPE) {
  jest.mock('stripe', () => createMockStripeClient());
}

describe('Stripe Checkout Integration (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let stripe: Stripe;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get<PrismaClient>(PrismaClient);

    if (USE_REAL_STRIPE) {
      stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2023-10-16',
      });
    } else {
      // Get mocked Stripe client
      stripe = new (Stripe as any)('sk_test_mock', { apiVersion: '2023-10-16' });
    }
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    // Clean up test data
    await prisma.payment.deleteMany();
    await prisma.order.deleteMany();
    await prisma.cart.deleteMany();

    // Reset mock if using mock
    if (!USE_REAL_STRIPE && (stripe as any)._mockClient) {
      (stripe as any)._mockClient.reset();
    }
  });

  describe('Complete Checkout Flow', () => {
    let cartId: string;
    let orderId: string;
    let checkoutSessionId: string;

    it('should create a cart with items', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/carts')
        .send({
          userId: 'test-user-1',
          currency: 'USD',
        })
        .expect(201);

      cartId = response.body.id;
      expect(cartId).toBeDefined();
    });

    it('should add items to cart', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/carts/${cartId}/items`)
        .send({
          productId: 'prod_test_123',
          variantId: 'var_test_456',
          qty: 2,
        })
        .expect(201);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.total).toBeGreaterThan(0);
    });

    it('should apply discount code', async () => {
      // First create a discount
      await prisma.discount.create({
        data: {
          code: 'TEST10',
          name: 'Test 10% Off',
          kind: 'percent',
          value: 10,
          active: true,
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/v1/carts/${cartId}/discount`)
        .send({ code: 'TEST10' })
        .expect(200);

      expect(response.body.discountCode).toBe('TEST10');
      expect(parseFloat(response.body.discountAmount)).toBeGreaterThan(0);
    });

    it('should create checkout session with Stripe', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/checkout')
        .send({
          cartId,
          returnUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
          customerEmail: 'test@example.com',
        })
        .expect(201);

      expect(response.body.sessionId).toBeDefined();
      expect(response.body.sessionUrl).toContain('checkout.stripe.com');
      expect(response.body.orderNumber).toBeDefined();

      checkoutSessionId = response.body.sessionId;

      // Verify order was created
      const order = await prisma.order.findFirst({
        where: { checkoutSessionId },
      });

      orderId = order!.id;
      expect(order).toBeDefined();
      expect(order!.status).toBe('created');
      expect(order!.paymentStatus).toBe('pending');
    });

    it('should handle checkout.session.completed webhook', async () => {
      // Retrieve the actual checkout session
      const session = await stripe.checkout.sessions.retrieve(checkoutSessionId);

      // Simulate Stripe completing the session in mock
      if (!USE_REAL_STRIPE && (stripe as any)._mockClient) {
        (stripe as any)._mockClient.simulateCheckoutComplete(checkoutSessionId);
      }

      // Construct webhook event
      const eventPayload = {
        id: 'evt_test_' + Date.now(),
        type: 'checkout.session.completed',
        data: { object: session },
      };

      // Send webhook (in real scenario this comes from Stripe)
      const response = await request(app.getHttpServer())
        .post('/v1/webhooks/stripe')
        .set('stripe-signature', 'test_signature')
        .send(eventPayload)
        .expect(200);

      // Verify order was updated
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      expect(order).toBeDefined();
      if (session.payment_intent) {
        expect(order!.paymentIntentId).toBe(session.payment_intent as string);
      }
    });
  });

  describe('Payment Intent Flow', () => {
    let cartId: string;
    let paymentIntentId: string;

    it('should create payment intent for direct card processing', async () => {
      // Create cart
      const cartResponse = await request(app.getHttpServer())
        .post('/v1/carts')
        .send({ userId: 'test-user-2', currency: 'USD' })
        .expect(201);

      cartId = cartResponse.body.id;

      // Add item
      await request(app.getHttpServer())
        .post(`/v1/carts/${cartId}/items`)
        .send({
          productId: 'prod_test_789',
          qty: 1,
        })
        .expect(201);

      // Create payment intent
      const response = await request(app.getHttpServer())
        .post('/v1/checkout/payment-intent')
        .send({ cartId })
        .expect(201);

      expect(response.body.clientSecret).toBeDefined();
      expect(response.body.paymentIntentId).toBeDefined();

      paymentIntentId = response.body.paymentIntentId;
    });

    it('should handle successful payment', async () => {
      // Simulate payment success using Stripe test card
      const paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: 'pm_card_visa',
        }
      );

      expect(paymentIntent.status).toBe('succeeded');

      // Verify payment was recorded
      const payment = await prisma.payment.findFirst({
        where: { paymentIntentId },
      });

      expect(payment).toBeDefined();
      expect(payment!.status).toBe('succeeded');
    });
  });

  describe('Refund Processing', () => {
    let orderId: string;

    beforeEach(async () => {
      // Create a paid order
      const cart = await prisma.cart.create({
        data: {
          userId: 'test-user-3',
          currency: 'USD',
          total: 100.0,
          subtotal: 100.0,
          status: 'active',
        },
      });

      const paymentIntent = await stripe.paymentIntents.create({
        amount: 10000,
        currency: 'usd',
        payment_method: 'pm_card_visa',
        confirm: true,
        metadata: { cartId: cart.id },
      });

      const order = await prisma.order.create({
        data: {
          orderNumber: 'TEST-' + Date.now(),
          userId: 'test-user-3',
          cartId: cart.id,
          status: 'paid',
          paymentStatus: 'captured',
          currency: 'USD',
          total: 100.0,
          subtotal: 100.0,
          paymentIntentId: paymentIntent.id,
          snapshot: {},
        },
      });

      orderId = order.id;
    });

    it('should create partial refund', async () => {
      const refundAmount = 30.0;

      const response = await request(app.getHttpServer())
        .post(`/v1/orders/${orderId}/refunds`)
        .send({
          amount: refundAmount,
          reason: 'requested_by_customer',
        })
        .expect(201);

      expect(response.body.amount).toBe(refundAmount.toString());
      expect(response.body.status).toBe('succeeded');

      // Verify order status
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      expect(order!.paymentStatus).toBe('partially_refunded');
    });

    it('should create full refund for remaining amount', async () => {
      // First refund
      await request(app.getHttpServer())
        .post(`/v1/orders/${orderId}/refunds`)
        .send({ amount: 30.0 })
        .expect(201);

      // Second refund (remaining)
      const refundAmount = 70.0;

      const response = await request(app.getHttpServer())
        .post(`/v1/orders/${orderId}/refunds`)
        .send({ amount: refundAmount })
        .expect(201);

      expect(response.body.amount).toBe(refundAmount.toString());

      // Verify order status
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      expect(order!.status).toBe('refunded');
      expect(order!.paymentStatus).toBe('refunded');
    });
  });

  describe('Idempotency', () => {
    it('should return same response for duplicate checkout request', async () => {
      const cart = await prisma.cart.create({
        data: {
          userId: 'test-user-4',
          currency: 'USD',
          total: 50.0,
          subtotal: 50.0,
          status: 'active',
        },
      });

      const idempotencyKey = 'test-' + Date.now();

      // First request
      const response1 = await request(app.getHttpServer())
        .post('/v1/checkout')
        .set('idempotency-key', idempotencyKey)
        .send({
          cartId: cart.id,
          returnUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
        .expect(201);

      // Duplicate request with same key
      const response2 = await request(app.getHttpServer())
        .post('/v1/checkout')
        .set('idempotency-key', idempotencyKey)
        .send({
          cartId: cart.id,
          returnUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
        .expect(201);

      // Should return exact same response
      expect(response1.body.sessionId).toBe(response2.body.sessionId);
      expect(response1.body.orderNumber).toBe(response2.body.orderNumber);
    });
  });

  describe('3DS Payment Flow', () => {
    it('should handle payment requiring 3DS authentication', async () => {
      const cart = await prisma.cart.create({
        data: {
          userId: 'test-user-5',
          currency: 'USD',
          total: 75.0,
          subtotal: 75.0,
          status: 'active',
        },
      });

      // Create payment intent
      const response = await request(app.getHttpServer())
        .post('/v1/checkout/payment-intent')
        .send({ cartId: cart.id })
        .expect(201);

      const paymentIntentId = response.body.paymentIntentId;

      // Confirm with 3DS test card
      const paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: 'pm_card_threeDSecure2Required',
        }
      );

      // Should require action
      expect(paymentIntent.status).toBe('requires_action');
      expect(paymentIntent.next_action?.type).toBe('use_stripe_sdk');
    });
  });
});
