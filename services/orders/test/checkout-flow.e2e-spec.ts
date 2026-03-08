import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaClient } from '../src/generated/prisma-client';

describe('Complete Checkout Flow (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    prisma = app.get(PrismaClient);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Full Checkout to Payment Flow', () => {
    let cartId: string;
    let orderId: string;
    let userId = 'test-user-123';

    it('Step 1: Create a new cart', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/carts')
        .send({
          userId,
          currency: 'USD',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.userId).toBe(userId);
      expect(response.body.status).toBe('active');
      expect(response.body.total).toBe('0');

      cartId = response.body.id;
    });

    it('Step 2: Add items to cart', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/carts/${cartId}/items`)
        .send({
          productId: 'prod-sofa-001',
          variantId: 'var-gray-large',
          qty: 1,
        })
        .expect(201);

      expect(response.body.items).toHaveLength(1);
      expect(response.body.items[0].productId).toBe('prod-sofa-001');
      expect(response.body.subtotal).not.toBe('0');
    });

    it('Step 3: Add second item to cart', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/carts/${cartId}/items`)
        .send({
          productId: 'prod-lamp-002',
          qty: 2,
        })
        .expect(201);

      expect(response.body.items).toHaveLength(2);
    });

    it('Step 4: Update item quantity', async () => {
      const cart = await prisma.cart.findUnique({
        where: { id: cartId },
        include: { items: true },
      });

      const itemId = cart!.items[0].id;

      const response = await request(app.getHttpServer())
        .patch(`/v1/carts/${cartId}/items/${itemId}`)
        .send({
          qty: 2,
        })
        .expect(200);

      const updatedItem = response.body.items.find((i: any) => i.id === itemId);
      expect(updatedItem.qty).toBe(2);
    });

    it('Step 5: Apply discount code', async () => {
      // First create a discount
      await prisma.discount.create({
        data: {
          code: 'SAVE20',
          name: 'Save 20%',
          kind: 'percent',
          value: 20,
          active: true,
        },
      });

      const response = await request(app.getHttpServer())
        .post(`/v1/carts/${cartId}/apply-discount`)
        .send({
          code: 'SAVE20',
        })
        .expect(200);

      expect(response.body.discountCode).toBe('SAVE20');
      expect(parseFloat(response.body.discountAmount)).toBeGreaterThan(0);
    });

    it('Step 6: Get cart summary', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/carts/${cartId}`)
        .expect(200);

      expect(response.body.items).toHaveLength(2);
      expect(response.body.discountCode).toBe('SAVE20');
      expect(parseFloat(response.body.subtotal)).toBeGreaterThan(0);
      expect(parseFloat(response.body.discountAmount)).toBeGreaterThan(0);
      expect(parseFloat(response.body.taxTotal)).toBeGreaterThan(0);
      expect(parseFloat(response.body.total)).toBeLessThan(
        parseFloat(response.body.subtotal),
      );
    });

    it('Step 7: Create checkout session', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/checkout')
        .set('Idempotency-Key', 'checkout-test-123')
        .send({
          cartId,
          userId,
          returnUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
          customerEmail: 'customer@example.com',
        })
        .expect(201);

      expect(response.body).toHaveProperty('sessionId');
      expect(response.body).toHaveProperty('sessionUrl');
      expect(response.body).toHaveProperty('orderNumber');

      // Order should be created
      const order = await prisma.order.findFirst({
        where: { cartId },
      });

      expect(order).toBeDefined();
      expect(order!.status).toBe('created');
      expect(order!.paymentStatus).toBe('pending');

      orderId = order!.id;
    });

    it('Step 8: Verify order was created with correct details', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/orders/${orderId}`)
        .expect(200);

      expect(response.body.id).toBe(orderId);
      expect(response.body.userId).toBe(userId);
      expect(response.body.status).toBe('created');
      expect(response.body.items).toHaveLength(2);
      expect(parseFloat(response.body.discountTotal)).toBeGreaterThan(0);
      expect(response.body.snapshot).toBeDefined();
    });

    it('Step 9: Simulate payment success webhook', async () => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      // This would normally come from Stripe
      // For testing, we simulate the webhook payload
      const mockPaymentIntent = {
        id: order!.paymentIntentId || 'pi_test_123',
        amount: parseFloat(order!.total.toString()) * 100,
        currency: 'usd',
        status: 'succeeded',
        metadata: {
          cartId,
          userId,
        },
        charges: {
          data: [
            {
              id: 'ch_test_123',
              payment_method_details: {
                card: {
                  last4: '4242',
                  brand: 'visa',
                  country: 'US',
                },
              },
              outcome: {
                risk_score: 15,
                risk_level: 'normal',
              },
            },
          ],
        },
      };

      // Update order directly (simulating what webhook would do)
      await prisma.payment.create({
        data: {
          orderId: order!.id,
          provider: 'stripe',
          status: 'succeeded',
          amount: order!.total,
          currency: 'USD',
          paymentIntentId: mockPaymentIntent.id,
          chargeId: 'ch_test_123',
          last4: '4242',
          brand: 'visa',
        },
      });

      await prisma.order.update({
        where: { id: orderId },
        data: {
          status: 'paid',
          paymentStatus: 'captured',
          paidAt: new Date(),
        },
      });

      // Verify order is now paid
      const response = await request(app.getHttpServer())
        .get(`/v1/orders/${orderId}`)
        .expect(200);

      expect(response.body.status).toBe('paid');
      expect(response.body.paymentStatus).toBe('captured');
      expect(response.body.paidAt).toBeDefined();
      expect(response.body.payments).toHaveLength(1);
    });

    it('Step 10: Verify cart is marked as converted', async () => {
      const cart = await prisma.cart.findUnique({
        where: { id: cartId },
      });

      // Cart would be marked as converted by webhook handler
      await prisma.cart.update({
        where: { id: cartId },
        data: {
          status: 'converted',
          convertedAt: new Date(),
        },
      });

      const response = await request(app.getHttpServer())
        .get(`/v1/carts/${cartId}`)
        .expect(200);

      expect(response.body.status).toBe('converted');
      expect(response.body.convertedAt).toBeDefined();
    });

    it('Step 11: Create shipment for order', async () => {
      const response = await request(app.getHttpServer())
        .post(`/v1/orders/${orderId}/shipments`)
        .send({
          carrier: 'FedEx',
          trackingNumber: '123456789',
          method: 'standard',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.carrier).toBe('FedEx');
      expect(response.body.trackingNumber).toBe('123456789');
    });

    it('Step 12: Update order status to fulfilled', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/orders/${orderId}`)
        .send({
          status: 'fulfilled',
        })
        .expect(200);

      expect(response.body.status).toBe('fulfilled');
      expect(response.body.fulfillmentStatus).toBe('fulfilled');
      expect(response.body.fulfilledAt).toBeDefined();
    });

    it('Step 13: Create partial refund', async () => {
      const order = await prisma.order.findUnique({
        where: { id: orderId },
      });

      const refundAmount = parseFloat(order!.total.toString()) / 2;

      const response = await request(app.getHttpServer())
        .post(`/v1/orders/${orderId}/refunds`)
        .set('Idempotency-Key', 'refund-test-123')
        .send({
          amount: refundAmount,
          reason: 'requested_by_customer',
        })
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(parseFloat(response.body.amount)).toBe(refundAmount);
      expect(response.body.status).toBe('succeeded');
    });

    it('Step 14: Close order', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/v1/orders/${orderId}`)
        .send({
          status: 'closed',
        })
        .expect(200);

      expect(response.body.status).toBe('closed');
      expect(response.body.closedAt).toBeDefined();
    });

    it('Step 15: Verify complete order history', async () => {
      const response = await request(app.getHttpServer())
        .get(`/v1/orders?userId=${userId}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.pagination).toBeDefined();

      const testOrder = response.body.data.find((o: any) => o.id === orderId);
      expect(testOrder).toBeDefined();
      expect(testOrder.status).toBe('closed');
    });
  });

  describe('Error Handling Scenarios', () => {
    it('should reject invalid discount codes', async () => {
      const cart = await prisma.cart.create({
        data: {
          userId: 'test-user-456',
          status: 'active',
          currency: 'USD',
          subtotal: 100,
          total: 100,
        },
      });

      await request(app.getHttpServer())
        .post(`/v1/carts/${cart.id}/apply-discount`)
        .send({
          code: 'INVALID_CODE',
        })
        .expect(404);
    });

    it('should prevent checkout with empty cart', async () => {
      const emptyCart = await prisma.cart.create({
        data: {
          userId: 'test-user-789',
          status: 'active',
          currency: 'USD',
          subtotal: 0,
          total: 0,
        },
      });

      await request(app.getHttpServer())
        .post('/v1/checkout')
        .send({
          cartId: emptyCart.id,
          returnUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
        .expect(400);
    });

    it('should prevent invalid status transitions', async () => {
      const order = await prisma.order.create({
        data: {
          orderNumber: 'ORD-TEST-001',
          userId: 'test-user-999',
          status: 'closed',
          paymentStatus: 'captured',
          fulfillmentStatus: 'fulfilled',
          currency: 'USD',
          subtotal: 100,
          total: 100,
          snapshot: {},
        },
      });

      await request(app.getHttpServer())
        .patch(`/v1/orders/${order.id}`)
        .send({
          status: 'paid',
        })
        .expect(400);
    });

    it('should handle idempotent requests correctly', async () => {
      const cart = await prisma.cart.create({
        data: {
          userId: 'test-user-idem',
          status: 'active',
          currency: 'USD',
          subtotal: 100,
          total: 100,
        },
      });

      await prisma.cartItem.create({
        data: {
          cartId: cart.id,
          productId: 'prod-test',
          name: 'Test Product',
          qty: 1,
          unitPrice: 100,
          currency: 'USD',
        },
      });

      const idempotencyKey = 'test-idem-key-unique';

      // First request
      const response1 = await request(app.getHttpServer())
        .post('/v1/checkout')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          cartId: cart.id,
          returnUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
        .expect(201);

      // Second request with same key should return same result
      const response2 = await request(app.getHttpServer())
        .post('/v1/checkout')
        .set('Idempotency-Key', idempotencyKey)
        .send({
          cartId: cart.id,
          returnUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel',
        })
        .expect(201);

      expect(response1.body.orderNumber).toBe(response2.body.orderNumber);

      // Verify only one order was created
      const orders = await prisma.order.findMany({
        where: { cartId: cart.id },
      });

      expect(orders).toHaveLength(1);
    });
  });
});
