import { Injectable, BadRequestException, Inject, Logger } from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from '../../generated/prisma-client/runtime/library';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaClient,
    private configService: ConfigService,
    @Inject('STRIPE_CLIENT') private stripe: Stripe,
    @Inject('EVENTS_SERVICE') private eventsService: any,
  ) {}

  /**
   * Handle Stripe webhook event
   */
  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET')!;

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      this.logger.error(`Webhook signature verification failed: ${err.message}`);
      throw new BadRequestException(`Webhook signature verification failed`);
    }

    this.logger.log(`Processing webhook event: ${event.type} ${event.id}`);

    // Route to appropriate handler
    try {
      // Check for duplicate event processing
      const isDuplicate = await this.checkDuplicateEvent(event.id);
      if (isDuplicate) {
        this.logger.log(`Event ${event.id} already processed, skipping`);
        return { received: true, eventId: event.id, duplicate: true };
      }

      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutSessionCompleted(event);
          break;
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event);
          break;
        case 'payment_intent.canceled':
          await this.handlePaymentIntentCanceled(event);
          break;
        case 'payment_intent.requires_action':
          await this.handlePaymentIntentRequiresAction(event);
          break;
        case 'payment_intent.amount_capturable_updated':
          await this.handlePaymentIntentAmountCapturableUpdated(event);
          break;
        case 'charge.refunded':
          await this.handleChargeRefunded(event);
          break;
        case 'charge.dispute.created':
          await this.handleDisputeCreated(event);
          break;
        case 'charge.dispute.closed':
          await this.handleDisputeClosed(event);
          break;
        default:
          this.logger.warn(`Unhandled event type: ${event.type}`);
      }

      // Mark event as processed
      await this.markEventProcessed(event.id, event.type);

      return { received: true, eventId: event.id };
    } catch (error: any) {
      this.logger.error(`Error processing webhook: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Handle checkout.session.completed
   */
  private async handleCheckoutSessionCompleted(event: Stripe.Event) {
    const session = event.data.object as Stripe.Checkout.Session;

    this.logger.log(`Checkout session completed: ${session.id}`);

    const order = await this.prisma.order.findUnique({
      where: { checkoutSessionId: session.id },
    });

    if (!order) {
      this.logger.error(`Order not found for checkout session: ${session.id}`);
      return;
    }

    // Update order with payment intent
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentIntentId: session.payment_intent as string,
        customerId: session.customer as string,
      },
    });

    // Emit event
    await this.eventsService.publish('checkout.completed', {
      id: uuidv4(),
      type: 'checkout.session_completed',
      timestamp: new Date(),
      resource: `order:${order.id}`,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        sessionId: session.id,
        paymentIntentId: session.payment_intent,
      },
    });
  }

  /**
   * Handle payment_intent.succeeded
   */
  private async handlePaymentIntentSucceeded(event: Stripe.Event) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log(`Payment intent succeeded: ${paymentIntent.id}`);

    const order = await this.prisma.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      this.logger.error(`Order not found for payment intent: ${paymentIntent.id}`);
      return;
    }

    // Create payment record
    // Note: charges may not be expanded by default in webhook events
    // We check if it's an array or if it has data array
    const chargesData = Array.isArray((paymentIntent as any).charges)
      ? (paymentIntent as any).charges
      : (paymentIntent as any).charges?.data || [];
    const charge = chargesData[0];

    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'stripe',
        status: 'succeeded',
        amount: new Decimal(paymentIntent.amount).div(100),
        currency: paymentIntent.currency.toUpperCase(),
        paymentIntentId: paymentIntent.id,
        chargeId: charge?.id,
        paymentMethodId: paymentIntent.payment_method as string,
        last4: charge?.payment_method_details?.card?.last4,
        brand: charge?.payment_method_details?.card?.brand,
        country: charge?.payment_method_details?.card?.country,
        riskScore: charge?.outcome?.risk_score,
        riskLevel: charge?.outcome?.risk_level,
        raw: paymentIntent as any,
      },
    });

    // Update order status
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: 'paid',
        paymentStatus: 'captured',
        paidAt: new Date(),
      },
    });

    // Mark cart as converted
    if (order.cartId) {
      await this.prisma.cart.update({
        where: { id: order.cartId },
        data: {
          status: 'converted',
          convertedAt: new Date(),
        },
      });
    }

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        entityType: 'order',
        entityId: order.id,
        action: 'payment_succeeded',
        actorType: 'webhook',
        actor: 'stripe',
        changes: {
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
        },
      },
    });

    // Emit payment.succeeded event
    await this.eventsService.publish('payment.succeeded', {
      id: uuidv4(),
      type: 'payment.succeeded',
      timestamp: new Date(),
      resource: `order:${order.id}`,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentIntentId: paymentIntent.id,
        amount: new Decimal(paymentIntent.amount).div(100).toString(),
      },
    });

    // Emit order.paid event for order confirmation email and other workflows
    await this.eventsService.publish('order.paid', {
      id: uuidv4(),
      type: 'order.paid',
      timestamp: new Date(),
      resource: `order:${order.id}`,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: order.userId,
        total: order.total.toString(),
        currency: order.currency,
        customerEmail: paymentIntent.receipt_email,
      },
    });
  }

  /**
   * Handle payment_intent.payment_failed
   */
  private async handlePaymentIntentFailed(event: Stripe.Event) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log(`Payment intent failed: ${paymentIntent.id}`);

    const order = await this.prisma.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      this.logger.error(`Order not found for payment intent: ${paymentIntent.id}`);
      return;
    }

    // Create failed payment record
    await this.prisma.payment.create({
      data: {
        orderId: order.id,
        provider: 'stripe',
        status: 'failed',
        amount: new Decimal(paymentIntent.amount).div(100),
        currency: paymentIntent.currency.toUpperCase(),
        paymentIntentId: paymentIntent.id,
        failureCode: paymentIntent.last_payment_error?.code,
        failureMessage: paymentIntent.last_payment_error?.message,
        raw: paymentIntent as any,
      },
    });

    // Update order
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'failed',
      },
    });

    // Emit event
    await this.eventsService.publish('payment.failed', {
      id: uuidv4(),
      type: 'payment.failed',
      timestamp: new Date(),
      resource: `order:${order.id}`,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentIntentId: paymentIntent.id,
        failureCode: paymentIntent.last_payment_error?.code,
        failureMessage: paymentIntent.last_payment_error?.message,
      },
    });
  }

  /**
   * Handle payment_intent.canceled
   */
  private async handlePaymentIntentCanceled(event: Stripe.Event) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log(`Payment intent canceled: ${paymentIntent.id}`);

    const order = await this.prisma.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      return;
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'canceled',
        status: 'canceled',
        canceledAt: new Date(),
      },
    });

    await this.eventsService.publish('payment.canceled', {
      id: uuidv4(),
      type: 'payment.canceled',
      timestamp: new Date(),
      resource: `order:${order.id}`,
      payload: {
        orderId: order.id,
        paymentIntentId: paymentIntent.id,
      },
    });
  }

  /**
   * Handle charge.refunded
   */
  private async handleChargeRefunded(event: Stripe.Event) {
    const charge = event.data.object as Stripe.Charge;

    this.logger.log(`Charge refunded: ${charge.id}`);

    const payment = await this.prisma.payment.findUnique({
      where: { chargeId: charge.id },
      include: { order: true },
    });

    if (!payment) {
      this.logger.error(`Payment not found for charge: ${charge.id}`);
      return;
    }

    // Get refund details
    for (const refund of charge.refunds?.data || []) {
      // Check if refund already exists
      const existing = await this.prisma.refund.findUnique({
        where: { providerRefundId: refund.id },
      });

      if (!existing) {
        await this.prisma.refund.create({
          data: {
            orderId: payment.orderId,
            amount: new Decimal(refund.amount).div(100),
            currency: refund.currency.toUpperCase(),
            reason: refund.reason as string,
            status: 'succeeded',
            provider: 'stripe',
            providerRefundId: refund.id,
            chargeId: charge.id,
            paymentIntentId: charge.payment_intent as string,
            description: refund.description,
            raw: refund as any,
            processedAt: new Date(refund.created * 1000),
          },
        });

        // Emit event
        await this.eventsService.publish('refund.succeeded', {
          id: uuidv4(),
          type: 'refund.succeeded',
          timestamp: new Date(),
          resource: `order:${payment.orderId}`,
          payload: {
            orderId: payment.orderId,
            refundId: refund.id,
            amount: new Decimal(refund.amount).div(100).toString(),
          },
        });
      }
    }

    // Update order status if fully refunded
    if (charge.refunded) {
      await this.prisma.order.update({
        where: { id: payment.orderId },
        data: {
          status: 'refunded',
          paymentStatus: 'refunded',
        },
      });
    }
  }

  /**
   * Handle charge.dispute.created
   */
  private async handleDisputeCreated(event: Stripe.Event) {
    const dispute = event.data.object as Stripe.Dispute;

    this.logger.log(`Dispute created: ${dispute.id}`);

    const payment = await this.prisma.payment.findUnique({
      where: { chargeId: dispute.charge as string },
    });

    if (!payment) {
      return;
    }

    await this.eventsService.publish('dispute.created', {
      id: uuidv4(),
      type: 'dispute.created',
      timestamp: new Date(),
      resource: `order:${payment.orderId}`,
      payload: {
        orderId: payment.orderId,
        disputeId: dispute.id,
        amount: new Decimal(dispute.amount).div(100).toString(),
        reason: dispute.reason,
      },
    });
  }

  /**
   * Handle charge.dispute.closed
   */
  private async handleDisputeClosed(event: Stripe.Event) {
    const dispute = event.data.object as Stripe.Dispute;

    this.logger.log(`Dispute closed: ${dispute.id} - Status: ${dispute.status}`);

    const payment = await this.prisma.payment.findUnique({
      where: { chargeId: dispute.charge as string },
    });

    if (!payment) {
      return;
    }

    await this.eventsService.publish('dispute.closed', {
      id: uuidv4(),
      type: 'dispute.closed',
      timestamp: new Date(),
      resource: `order:${payment.orderId}`,
      payload: {
        orderId: payment.orderId,
        disputeId: dispute.id,
        status: dispute.status,
      },
    });
  }

  /**
   * Handle payment_intent.requires_action (3DS challenge)
   */
  private async handlePaymentIntentRequiresAction(event: Stripe.Event) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log(`Payment intent requires action: ${paymentIntent.id}`);

    const order = await this.prisma.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      this.logger.error(`Order not found for payment intent: ${paymentIntent.id}`);
      return;
    }

    // Emit event for frontend to handle 3DS challenge
    await this.eventsService.publish('payment.requires_action', {
      id: uuidv4(),
      type: 'payment.requires_action',
      timestamp: new Date(),
      resource: `order:${order.id}`,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentIntentId: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        nextAction: paymentIntent.next_action,
      },
    });
  }

  /**
   * Handle payment_intent.amount_capturable_updated (authorized but not captured)
   */
  private async handlePaymentIntentAmountCapturableUpdated(event: Stripe.Event) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log(`Payment intent amount capturable updated: ${paymentIntent.id}`);

    const order = await this.prisma.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      return;
    }

    // Update order to authorized status
    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: 'authorized',
      },
    });

    await this.eventsService.publish('payment.authorized', {
      id: uuidv4(),
      type: 'payment.authorized',
      timestamp: new Date(),
      resource: `order:${order.id}`,
      payload: {
        orderId: order.id,
        orderNumber: order.orderNumber,
        paymentIntentId: paymentIntent.id,
        amountCapturable: new Decimal(paymentIntent.amount_capturable || 0).div(100).toString(),
      },
    });
  }

  /**
   * Check if event has already been processed (idempotency)
   */
  private async checkDuplicateEvent(eventId: string): Promise<boolean> {
    const existing = await this.prisma.auditLog.findFirst({
      where: {
        entityType: 'webhook',
        entityId: eventId,
      },
    });

    return !!existing;
  }

  /**
   * Mark event as processed
   */
  private async markEventProcessed(eventId: string, eventType: string) {
    await this.prisma.auditLog.create({
      data: {
        entityType: 'webhook',
        entityId: eventId,
        action: 'processed',
        actorType: 'webhook',
        actor: 'stripe',
        metadata: {
          eventType,
          processedAt: new Date().toISOString(),
        },
      },
    });
  }
}
