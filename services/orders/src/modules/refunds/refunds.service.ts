import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import Stripe from 'stripe';
import { Decimal } from '../../generated/prisma-client/runtime/library';
import { v4 as uuidv4 } from 'uuid';
import { assertStripeConfigured } from '../../config/stripe.module';
import { OrdersAuthorizationResolver } from '../../common/authorization/orders-authorization.resolver';

@Injectable()
export class RefundsService {
  constructor(
    private prisma: PrismaClient,
    @Inject('STRIPE_CLIENT') private stripe: Stripe,
    @Inject('EVENTS_SERVICE') private eventsService: any,
    private readonly authorization: OrdersAuthorizationResolver,
  ) {}

  /**
   * Create a full or partial refund
   */
  async createRefund(
    orderId: string,
    amount: number | undefined,
    reason: string | undefined,
    subject: string,
  ) {
    assertStripeConfigured(this.stripe);

    const order = await this.authorization.authorize(
      subject,
      'manage',
      (database, _auth, scope) =>
        this.authorization.requireOrder(database, scope, { id: orderId }, {
          payments: true,
          refunds: true,
        }),
    );

    if (order.paymentStatus !== 'captured') {
      throw new BadRequestException('Cannot refund order that is not paid');
    }

    const payment = order.payments.find(p => p.status === 'succeeded');
    if (!payment || !payment.paymentIntentId) {
      throw new NotFoundException('No successful payment found for order');
    }

    // Calculate total refunded so far
    const totalRefunded = order.refunds
      .filter(r => r.status === 'succeeded')
      .reduce((sum, r) => sum.add(r.amount), new Decimal(0));

    const availableToRefund = order.total.sub(totalRefunded);

    // Determine refund amount
    const refundAmount = amount ? new Decimal(amount) : order.total;

    if (refundAmount.gt(availableToRefund)) {
      throw new BadRequestException(
        `Refund amount ${refundAmount} exceeds available amount ${availableToRefund}`
      );
    }

    const isFullRefund = refundAmount.eq(order.total);
    const isPartialRefund = refundAmount.lt(order.total);

    // Create Stripe refund
    const stripeRefund = await this.stripe.refunds.create({
      payment_intent: payment.paymentIntentId,
      amount: refundAmount.mul(100).toNumber(), // Convert to cents
      reason: reason as any,
      metadata: {
        orderId,
        orderNumber: order.orderNumber,
        isFullRefund: isFullRefund.toString(),
        isPartialRefund: isPartialRefund.toString(),
      },
    });

    const refund = await this.authorization.authorize(
      subject,
      'manage',
      async (database, _auth, scope) => {
        const current = await this.authorization.requireOrder(database, scope, {
          id: orderId,
          paymentStatus: 'captured',
        }, { refunds: true });
        const currentRefunded = current.refunds
          .filter((entry) => entry.status === 'succeeded')
          .reduce((sum, entry) => sum.add(entry.amount), new Decimal(0));
        if (refundAmount.gt(current.total.sub(currentRefunded))) {
          throw new BadRequestException('Refund amount exceeds available amount');
        }
        const refund = await database.refund.create({
          data: {
            orderId,
            amount: refundAmount,
            currency: order.currency,
            reason,
            status: 'succeeded',
            provider: 'stripe',
            providerRefundId: stripeRefund.id,
            chargeId: payment.chargeId,
            paymentIntentId: payment.paymentIntentId,
            description: isFullRefund ? 'Full refund' : 'Partial refund',
            processedAt: new Date(),
            createdBy: subject,
            raw: stripeRefund as any,
          },
        });
        const newTotalRefunded = currentRefunded.add(refundAmount);
        await database.order.update({
          where: { id: orderId },
          data: newTotalRefunded.eq(current.total)
            ? { paymentStatus: 'refunded', status: 'refunded' }
            : { paymentStatus: 'partially_refunded' },
        });
        await database.auditLog.create({
          data: {
            entityType: 'order',
            entityId: orderId,
            action: isFullRefund ? 'refund_full' : 'refund_partial',
            actor: subject,
            actorType: 'user',
            changes: { amount: refundAmount.toString(), reason },
          },
        });
        return refund;
      },
    );

    // Emit event
    await this.eventsService.publish('refund.created', {
      id: uuidv4(),
      type: isFullRefund ? 'refund.full' : 'refund.partial',
      timestamp: new Date(),
      resource: `order:${orderId}`,
      payload: {
        orderId,
        orderNumber: order.orderNumber,
        refundId: refund.id,
        amount: refundAmount.toString(),
        isFullRefund,
        isPartialRefund,
      },
    });

    return refund;
  }

  async findByOrder(orderId: string, subject: string) {
    return this.authorization.authorize(subject, 'read', async (database, _auth, scope) => {
      await this.authorization.requireOrder(database, scope, { id: orderId });
      return database.refund.findMany({
        where: { orderId },
        orderBy: { createdAt: 'desc' },
      });
    });
  }

  /**
   * Get refund statistics for an order
   */
  async getRefundStats(orderId: string, subject: string) {
    const order = await this.authorization.authorize(
      subject,
      'read',
      (database, _auth, scope) =>
        this.authorization.requireOrder(database, scope, { id: orderId }, { refunds: true }),
    );

    const totalRefunded = order.refunds
      .filter(r => r.status === 'succeeded')
      .reduce((sum, r) => sum.add(r.amount), new Decimal(0));

    const availableToRefund = order.total.sub(totalRefunded);

    return {
      orderTotal: order.total.toString(),
      totalRefunded: totalRefunded.toString(),
      availableToRefund: availableToRefund.toString(),
      refundCount: order.refunds.length,
      isFullyRefunded: totalRefunded.eq(order.total),
      isPartiallyRefunded: totalRefunded.gt(0) && totalRefunded.lt(order.total),
    };
  }
}
