import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from '../../generated/prisma-client/runtime/library';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaClient,
    private configService: ConfigService,
    @Inject('STRIPE_CLIENT') private stripe: Stripe,
    @Inject('EVENTS_SERVICE') private eventsService: any,
  ) {}

  async findByOrder(orderId: string) {
    return this.prisma.payment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Capture an authorized payment
   */
  async capturePayment(orderId: string, amount?: number, actor?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { payments: true },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

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

    // Update order status
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'captured',
        status: 'paid',
        paidAt: new Date(),
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        entityType: 'order',
        entityId: orderId,
        action: 'payment_captured',
        actor: actor || 'system',
        actorType: actor ? 'admin' : 'system',
        changes: {
          paymentIntentId: paymentIntent.id,
          capturedAmount: amount || order.total.toString(),
        },
      },
    });

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

    return this.findByOrder(orderId);
  }

  /**
   * Cancel an authorized payment
   */
  async cancelPayment(orderId: string, actor?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException('Order not found');
    }

    if (order.paymentStatus !== 'authorized') {
      throw new BadRequestException('Can only cancel authorized payments');
    }

    if (!order.paymentIntentId) {
      throw new BadRequestException('No payment intent found for order');
    }

    // Cancel the payment intent
    await this.stripe.paymentIntents.cancel(order.paymentIntentId);

    // Update order
    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'canceled',
        status: 'canceled',
        canceledAt: new Date(),
      },
    });

    // Create audit log
    await this.prisma.auditLog.create({
      data: {
        entityType: 'order',
        entityId: orderId,
        action: 'payment_canceled',
        actor: actor || 'system',
        actorType: actor ? 'admin' : 'system',
      },
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
  async getPaymentIntent(paymentIntentId: string) {
    return this.stripe.paymentIntents.retrieve(paymentIntentId);
  }
}
