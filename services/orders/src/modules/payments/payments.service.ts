import { Injectable, BadRequestException, Inject } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { assertStripeConfigured } from '../../config/stripe.module';
import { OrdersAuthorizationResolver } from '../../common/authorization/orders-authorization.resolver';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaClient,
    @Inject('STRIPE_CLIENT') private stripe: Stripe,
    @Inject('EVENTS_SERVICE') private eventsService: any,
    private readonly authorization: OrdersAuthorizationResolver,
  ) {}

  async findByOrder(orderId: string, subject: string) {
    return this.authorization.authorize(subject, 'read', async (database, _auth, scope) => {
      await this.authorization.requireOrder(database, scope, { id: orderId });
      return database.payment.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  /**
   * Capture an authorized payment
   */
  async capturePayment(orderId: string, amount: number | undefined, subject: string) {
    assertStripeConfigured(this.stripe);

    const order = await this.authorization.authorize(
      subject,
      'manage',
      (database, _auth, scope) =>
        this.authorization.requireOrder(database, scope, { id: orderId }, { payments: true }),
    );

    if (order.paymentStatus !== 'authorized') {
      throw new BadRequestException('Order payment is not in authorized state');
    }

    if (!order.paymentIntentId) {
      throw new BadRequestException('No payment intent found for order');
    }

    // Capture the payment intent
    const captureAmount = amount ? Math.round(amount * 100) : undefined;
    const paymentIntent = await this.stripe.paymentIntents.capture(
      order.paymentIntentId,
      captureAmount ? { amount_to_capture: captureAmount } : undefined
    );

    const payments = await this.authorization.authorize(
      subject,
      'manage',
      async (database, _auth, scope) => {
        const current = await this.authorization.requireOrder(database, scope, {
          id: orderId,
          paymentIntentId: order.paymentIntentId,
          paymentStatus: 'authorized',
        });
        await database.order.update({
          where: { id: current.id },
          data: { paymentStatus: 'captured', status: 'paid', paidAt: new Date() },
        });
        await database.auditLog.create({
          data: {
            entityType: 'order',
            entityId: orderId,
            action: 'payment_captured',
            actor: subject,
            actorType: 'user',
            changes: { capturedAmount: amount || order.total.toString() },
          },
        });
        return database.payment.findMany({
          where: { orderId },
          orderBy: { createdAt: 'desc' },
        });
      },
    );

    // Emit event
    await this.eventsService.publish('payment.captured', {
      id: uuidv4(),
      type: 'payment.captured',
      timestamp: new Date(),
      resource: `order:${orderId}`,
      payload: {
        orderId,
        orderNumber: order.orderNumber,
        paymentIntentId: paymentIntent.id,
        amount: amount || order.total.toString(),
      },
    });

    return payments;
  }

  /**
   * Cancel an authorized payment
   */
  async cancelPayment(orderId: string, subject: string) {
    assertStripeConfigured(this.stripe);

    const order = await this.authorization.authorize(
      subject,
      'manage',
      (database, _auth, scope) =>
        this.authorization.requireOrder(database, scope, { id: orderId }),
    );

    if (order.paymentStatus !== 'authorized') {
      throw new BadRequestException('Can only cancel authorized payments');
    }

    if (!order.paymentIntentId) {
      throw new BadRequestException('No payment intent found for order');
    }

    // Cancel the payment intent
    await this.stripe.paymentIntents.cancel(order.paymentIntentId);

    await this.authorization.authorize(subject, 'manage', async (database, _auth, scope) => {
      const current = await this.authorization.requireOrder(database, scope, {
        id: orderId,
        paymentIntentId: order.paymentIntentId,
        paymentStatus: 'authorized',
      });
      await database.order.update({
        where: { id: current.id },
        data: { paymentStatus: 'canceled', status: 'canceled', canceledAt: new Date() },
      });
      await database.auditLog.create({
        data: {
          entityType: 'order',
          entityId: orderId,
          action: 'payment_canceled',
          actor: subject,
          actorType: 'user',
        },
      });
    });

    // Emit event
    await this.eventsService.publish('payment.canceled', {
      id: uuidv4(),
      type: 'payment.canceled',
      timestamp: new Date(),
      resource: `order:${orderId}`,
      payload: {
        orderId,
        orderNumber: order.orderNumber,
      },
    });

    return { success: true };
  }

  /**
   * Get payment details from Stripe
   */
  async getPaymentIntent(paymentIntentId: string, subject: string) {
    assertStripeConfigured(this.stripe);
    await this.authorization.authorize(subject, 'read', (database, _auth, scope) =>
      this.authorization.requireOrder(database, scope, { paymentIntentId }),
    );
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }
}
