import {
  Injectable,
  BadRequestException,
  Inject,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from '../../generated/prisma-client/runtime/library';
import { NotificationDispatchClient } from '../../infrastructure/notification-dispatch.client';
import { assertStripeConfigured } from '../../config/stripe.module';

const WEBHOOK_PROCESSING_LEASE_MS = 5 * 60 * 1000;
const WEBHOOK_PROCESSING_FAILED = 'processing_failed';

type StripeWebhookClaim =
  | { claimed: true; status: 'processing'; claimToken: string }
  | { claimed: false; status: string };

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private prisma: PrismaClient,
    private configService: ConfigService,
    @Inject('STRIPE_CLIENT') private stripe: Stripe,
    @Inject('EVENTS_SERVICE') private eventsService: any,
    private notifications: NotificationDispatchClient,
  ) {}

  /**
   * Handle Stripe webhook event
   */
  async handleStripeWebhook(signature: string, rawBody: Buffer) {
    assertStripeConfigured(this.stripe);

    const webhookSecret = this.configService.get<string>('STRIPE_WEBHOOK_SECRET')!;

    let event: Stripe.Event;

    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      this.logger.error('Webhook signature verification failed');
      throw new BadRequestException(`Webhook signature verification failed`);
    }

    this.logger.log(`Processing webhook event type: ${event.type}`);

    const claim = await this.claimEvent(event.id, event.type);
    if (!claim.claimed) {
      if (claim.status === 'succeeded') {
        this.logger.log('Webhook event already processed, skipping');
        return { received: true, eventId: event.id, duplicate: true };
      }

      throw new ServiceUnavailableException('Webhook processing in progress');
    }

    try {
      await this.prisma.$transaction(async (database) => {
        await this.processEvent(event, database);

        const completed = await database.stripeWebhookReceipt.updateMany({
          where: {
            eventId: event.id,
            status: 'processing',
            claimToken: claim.claimToken,
          },
          data: {
            status: 'succeeded',
            succeededAt: new Date(),
            failedAt: null,
            lastErrorCode: null,
          },
        });

        if (completed.count !== 1) {
          throw new Error('Webhook receipt lease lost');
        }
      });

      return { received: true, eventId: event.id };
    } catch (error: any) {
      await this.markEventFailed(event.id, claim.claimToken);
      this.logger.error('Error processing webhook');
      throw error;
    }
  }

  private async processEvent(event: Stripe.Event, database: Prisma.TransactionClient) {
    switch (event.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionCompleted(event, database);
        break;
      case 'payment_intent.succeeded':
        await this.handlePaymentIntentSucceeded(event, database);
        break;
      case 'payment_intent.payment_failed':
        await this.handlePaymentIntentFailed(event, database);
        break;
      case 'payment_intent.canceled':
        await this.handlePaymentIntentCanceled(event, database);
        break;
      case 'payment_intent.requires_action':
        await this.handlePaymentIntentRequiresAction(event, database);
        break;
      case 'payment_intent.amount_capturable_updated':
        await this.handlePaymentIntentAmountCapturableUpdated(event, database);
        break;
      case 'charge.refunded':
        await this.handleChargeRefunded(event, database);
        break;
      case 'charge.dispute.created':
        await this.handleDisputeCreated(event, database);
        break;
      case 'charge.dispute.closed':
        await this.handleDisputeClosed(event, database);
        break;
      default:
        this.logger.warn(`Unhandled event type: ${event.type}`);
    }
  }

  /**
   * Handle checkout.session.completed
   */
  private async handleCheckoutSessionCompleted(
    event: Stripe.Event,
    database: Prisma.TransactionClient,
  ) {
    const session = event.data.object as Stripe.Checkout.Session;

    this.logger.log('Checkout session completed');

    const order = await database.order.findUnique({
      where: { checkoutSessionId: session.id },
    });

    if (!order) {
      this.logger.error('Order not found for checkout session');
      return;
    }

    // Update order with payment intent
    await database.order.update({
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
  private async handlePaymentIntentSucceeded(
    event: Stripe.Event,
    database: Prisma.TransactionClient,
  ) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log('Payment intent succeeded');

    const order = await database.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      this.logger.error('Order not found for payment intent');
      return;
    }

    // Create payment record
    // Note: charges may not be expanded by default in webhook events
    // We check if it's an array or if it has data array
    const chargesData = Array.isArray((paymentIntent as any).charges)
      ? (paymentIntent as any).charges
      : (paymentIntent as any).charges?.data || [];
    const charge = chargesData[0];

    await database.payment.create({
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
    await database.order.update({
      where: { id: order.id },
      data: {
        status: 'paid',
        paymentStatus: 'captured',
        paidAt: new Date(),
      },
    });

    // Mark cart as converted
    if (order.cartId) {
      await database.cart.update({
        where: { id: order.cartId },
        data: {
          status: 'converted',
          convertedAt: new Date(),
        },
      });
    }

    // Audit log
    await database.auditLog.create({
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

    // Fire transactional emails via notification-dispatch (edge function
    // handles template rendering, Resend send, retry, and logging).
    if (order.userId) {
      const totalFormatted = formatCurrency(order.total.toString(), order.currency);
      const amountFormatted = formatCurrency(
        new Decimal(paymentIntent.amount).div(100).toString(),
        paymentIntent.currency,
      );
      const shippingAddress = order.shippingAddressId
        ? await database.address.findUnique({
            where: { id: order.shippingAddressId },
          })
        : null;

      await this.notifications.enqueue({
        user_id: order.userId,
        type: 'order_confirmation',
        channel: 'email',
        template_id: 'order-confirmation',
        data: {
          orderNumber: order.orderNumber,
          totalFormatted,
          shippingAddress: formatShippingAddress(shippingAddress),
          orderUrl: buildOrderUrl(this.configService, order.id),
        },
        priority: 'high',
      });

      await this.notifications.enqueue({
        user_id: order.userId,
        type: 'payment_receipt',
        channel: 'email',
        template_id: 'payment-receipt',
        data: {
          orderNumber: order.orderNumber,
          amountFormatted,
          paidAt: new Date().toLocaleString('en-US', {
            dateStyle: 'long',
            timeStyle: 'short',
          }),
          cardBrand: charge?.payment_method_details?.card?.brand ?? '',
          cardLast4: charge?.payment_method_details?.card?.last4 ?? '',
          paymentIntentId: paymentIntent.id,
        },
        priority: 'normal',
      });
    }
  }

  /**
   * Handle payment_intent.payment_failed
   */
  private async handlePaymentIntentFailed(event: Stripe.Event, database: Prisma.TransactionClient) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log('Payment intent failed');

    const order = await database.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      this.logger.error('Order not found for payment intent');
      return;
    }

    // Create failed payment record
    await database.payment.create({
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
    await database.order.update({
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
  private async handlePaymentIntentCanceled(
    event: Stripe.Event,
    database: Prisma.TransactionClient,
  ) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log('Payment intent canceled');

    const order = await database.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      return;
    }

    await database.order.update({
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
  private async handleChargeRefunded(event: Stripe.Event, database: Prisma.TransactionClient) {
    const charge = event.data.object as Stripe.Charge;

    this.logger.log('Charge refunded');

    const payment = await database.payment.findUnique({
      where: { chargeId: charge.id },
      include: { order: true },
    });

    if (!payment) {
      this.logger.error('Payment not found for charge');
      return;
    }

    // Get refund details
    for (const refund of charge.refunds?.data || []) {
      // Check if refund already exists
      const existing = await database.refund.findUnique({
        where: { providerRefundId: refund.id },
      });

      if (!existing) {
        await database.refund.create({
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
      await database.order.update({
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
  private async handleDisputeCreated(event: Stripe.Event, database: Prisma.TransactionClient) {
    const dispute = event.data.object as Stripe.Dispute;

    this.logger.log('Dispute created');

    const payment = await database.payment.findUnique({
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
  private async handleDisputeClosed(event: Stripe.Event, database: Prisma.TransactionClient) {
    const dispute = event.data.object as Stripe.Dispute;

    this.logger.log('Dispute closed');

    const payment = await database.payment.findUnique({
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
  private async handlePaymentIntentRequiresAction(
    event: Stripe.Event,
    database: Prisma.TransactionClient,
  ) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log('Payment intent requires action');

    const order = await database.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      this.logger.error('Order not found for payment intent');
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
  private async handlePaymentIntentAmountCapturableUpdated(
    event: Stripe.Event,
    database: Prisma.TransactionClient,
  ) {
    const paymentIntent = event.data.object as Stripe.PaymentIntent;

    this.logger.log('Payment intent amount capturable updated');

    const order = await database.order.findUnique({
      where: { paymentIntentId: paymentIntent.id },
    });

    if (!order) {
      return;
    }

    // Update order to authorized status
    await database.order.update({
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

  private async claimEvent(eventId: string, eventType: string): Promise<StripeWebhookClaim> {
    const claimToken = uuidv4();
    const processingStartedAt = new Date();

    try {
      await this.prisma.stripeWebhookReceipt.create({
        data: {
          eventId,
          eventType,
          status: 'processing',
          claimToken,
          processingStartedAt,
        },
      });

      return { claimed: true, status: 'processing', claimToken };
    } catch (error: unknown) {
      if (!isUniqueConstraintError(error)) throw error;
    }

    const staleBefore = new Date(processingStartedAt.getTime() - WEBHOOK_PROCESSING_LEASE_MS);
    const reclaimed = await this.prisma.stripeWebhookReceipt.updateMany({
      where: {
        eventId,
        OR: [
          { status: 'failed' },
          {
            status: 'processing',
            processingStartedAt: { lt: staleBefore },
          },
        ],
      },
      data: {
        eventType,
        status: 'processing',
        claimToken,
        attempts: { increment: 1 },
        processingStartedAt,
        succeededAt: null,
        failedAt: null,
        lastErrorCode: null,
      },
    });

    if (reclaimed.count === 1) {
      return { claimed: true, status: 'processing', claimToken };
    }

    const existing = await this.prisma.stripeWebhookReceipt.findUnique({
      where: { eventId },
      select: { status: true },
    });

    return { claimed: false, status: existing?.status ?? 'processing' };
  }

  private async markEventFailed(eventId: string, claimToken: string): Promise<void> {
    try {
      await this.prisma.stripeWebhookReceipt.updateMany({
        where: {
          eventId,
          status: 'processing',
          claimToken,
        },
        data: {
          status: 'failed',
          failedAt: new Date(),
          lastErrorCode: WEBHOOK_PROCESSING_FAILED,
        },
      });
    } catch {
      this.logger.error('Failed to record webhook receipt failure');
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

// ─── Helpers for email formatting ──────────────────────────────────────

function formatCurrency(amount: string, currency: string): string {
  const num = Number(amount);
  if (!Number.isFinite(num)) return amount;
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(num);
  } catch {
    return `${currency.toUpperCase()} ${num.toFixed(2)}`;
  }
}

function formatShippingAddress(addr: any): string {
  if (!addr || typeof addr !== 'object') return '';
  const lines = [
    addr.name,
    addr.line1,
    addr.line2,
    [addr.city, addr.state, addr.postal_code].filter(Boolean).join(', '),
    addr.country,
  ].filter(Boolean);
  return lines.join(' · ');
}

function buildOrderUrl(config: ConfigService, orderId: string): string {
  const base = config.get<string>('CLIENT_PORTAL_URL') ?? 'https://client.patina.cloud';
  return `${base.replace(/\/$/, '')}/orders/${orderId}`;
}
