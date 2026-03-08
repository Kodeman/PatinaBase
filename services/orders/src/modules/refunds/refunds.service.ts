import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import Stripe from 'stripe';
import { Decimal } from '../../generated/prisma-client/runtime/library';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class RefundsService {
  constructor(
    private prisma: PrismaClient,
    @Inject('STRIPE_CLIENT') private stripe: Stripe,
    @Inject('EVENTS_SERVICE') private eventsService: any,
  ) {}

  /**
   * Create a full or partial refund
   */
  async createRefund(orderId: string, amount?: number, reason?: string, actor?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        payments: true,
        refunds: true,
      },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

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

    // Create refund record
    const refund = await this.prisma.refund.create({
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
        description: isFullRefund ? 'Full refund' : `Partial refund: $${refundAmount.toString()}`,
        processedAt: new Date(),
        createdBy: actor,
        raw: stripeRefund as any,
      },
    });

    // Update order status based on refund type
    const newTotalRefunded = totalRefunded.add(refundAmount);
    if (newTotalRefunded.eq(order.total)) {
      // Full refund
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'refunded',
          status: 'refunded',
        },
      });
    } else {
      // Partial refund - update payment status but keep order in current state
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentStatus: 'partially_refunded',
        },
      });
    }

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        entityType: 'order',
        entityId: orderId,
        action: isFullRefund ? 'refund_full' : 'refund_partial',
        actor: actor || 'system',
        actorType: actor ? 'admin' : 'system',
        changes: {
          refundId: refund.id,
          amount: refundAmount.toString(),
          reason,
        },
      },
    });

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

  async findByOrder(orderId: string) {
    return this.prisma.refund.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get refund statistics for an order
   */
  async getRefundStats(orderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { refunds: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

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
