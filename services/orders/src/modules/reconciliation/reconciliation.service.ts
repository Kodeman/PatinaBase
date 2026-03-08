import { Injectable, Inject, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaClient } from '../../generated/prisma-client';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { Decimal } from '../../generated/prisma-client/runtime/library';

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    private prisma: PrismaClient,
    private configService: ConfigService,
    @Inject('STRIPE_CLIENT') private stripe: Stripe,
    @Inject('EVENTS_SERVICE') private eventsService: any,
  ) {}

  /**
   * Run reconciliation job (scheduled every 6 hours)
   */
  @Cron(CronExpression.EVERY_6_HOURS)
  async runReconciliation() {
    const windowHours = this.configService.get<number>('RECONCILIATION_WINDOW_HOURS', 24);
    const startTime = new Date();
    startTime.setHours(startTime.getHours() - windowHours);
    const endTime = new Date();

    this.logger.log(`Starting reconciliation for window: ${startTime} - ${endTime}`);

    const jobId = uuidv4();

    const reconciliation = await this.prisma.reconciliation.create({
      data: {
        jobId,
        status: 'running',
        window: {
          start: startTime.toISOString(),
          end: endTime.toISOString(),
        },
      },
    });

    try {
      // Fetch Stripe charges in the window
      const charges = await this.fetchStripeCharges(startTime, endTime);
      const stripePaymentIntents = new Set(
        charges.data.map(c => c.payment_intent).filter(Boolean) as string[]
      );

      // Fetch Patina orders in the window
      const orders = await this.prisma.order.findMany({
        where: {
          paidAt: {
            gte: startTime,
            lte: endTime,
          },
          paymentStatus: 'captured',
        },
        include: { payments: true },
      });

      const patinaPaymentIntents = new Set(
        orders.map(o => o.paymentIntentId).filter(Boolean) as string[]
      );

      // Find discrepancies
      const orphanStripe: string[] = [];
      const orphanPatina: string[] = [];
      const recovered: string[] = [];

      for (const pi of stripePaymentIntents) {
        if (!patinaPaymentIntents.has(pi)) {
          orphanStripe.push(pi);
        }
      }

      for (const pi of patinaPaymentIntents) {
        if (!stripePaymentIntents.has(pi)) {
          orphanPatina.push(pi);
        }
      }

      // Attempt automatic recovery for orphan Stripe payments
      for (const paymentIntentId of orphanStripe) {
        try {
          const recovered_success = await this.recoverMissedWebhook(paymentIntentId);
          if (recovered_success) {
            recovered.push(paymentIntentId);
            this.logger.log(`Successfully recovered missed webhook for ${paymentIntentId}`);
          }
        } catch (error: any) {
          this.logger.error(`Failed to recover ${paymentIntentId}: ${error.message}`);
        }
      }

      // Remove recovered items from orphan list
      const unresolvedOrphans = orphanStripe.filter(pi => !recovered.includes(pi));
      const discrepancies = unresolvedOrphans.length + orphanPatina.length;

      // Update reconciliation
      await this.prisma.reconciliation.update({
        where: { id: reconciliation.id },
        data: {
          status: 'completed',
          stripeCount: stripePaymentIntents.size,
          patinaCount: patinaPaymentIntents.size,
          matchedCount: stripePaymentIntents.size - orphanStripe.length + recovered.length,
          discrepancies,
          orphanStripe: unresolvedOrphans.length > 0 ? unresolvedOrphans : undefined,
          orphanPatina: orphanPatina.length > 0 ? orphanPatina : undefined,
          completedAt: new Date(),
          resolutionNotes: recovered.length > 0
            ? `Auto-recovered ${recovered.length} missed webhooks: ${recovered.join(', ')}`
            : undefined,
        },
      });

      this.logger.log(`Reconciliation completed. Discrepancies: ${discrepancies}`);

      if (discrepancies > 0) {
        await this.eventsService.publish('reconciliation.discrepancy', {
          id: uuidv4(),
          type: 'reconciliation.discrepancy.detected',
          timestamp: new Date(),
          resource: `reconciliation:${jobId}`,
          payload: {
            jobId,
            discrepancies,
            orphanStripe: orphanStripe.length,
            orphanPatina: orphanPatina.length,
          },
        });
      }

      return reconciliation;
    } catch (error: any) {
      this.logger.error(`Reconciliation failed: ${error.message}`, error.stack);

      await this.prisma.reconciliation.update({
        where: { id: reconciliation.id },
        data: {
          status: 'failed',
          completedAt: new Date(),
        },
      });

      throw error;
    }
  }

  private async fetchStripeCharges(start: Date, end: Date) {
    return this.stripe.charges.list({
      created: {
        gte: Math.floor(start.getTime() / 1000),
        lte: Math.floor(end.getTime() / 1000),
      },
      limit: 100,
    });
  }

  async getReconciliationHistory(limit = 10) {
    return this.prisma.reconciliation.findMany({
      take: limit,
      orderBy: { startedAt: 'desc' },
    });
  }

  /**
   * Recover a missed webhook by fetching payment intent and processing manually
   */
  private async recoverMissedWebhook(paymentIntentId: string): Promise<boolean> {
    try {
      // Fetch payment intent from Stripe
      const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

      // Find order by payment intent ID or metadata
      let order = await this.prisma.order.findUnique({
        where: { paymentIntentId },
      });

      if (!order && paymentIntent.metadata?.cartId) {
        // Try to find by cart ID
        order = await this.prisma.order.findFirst({
          where: { cartId: paymentIntent.metadata.cartId },
        });
      }

      if (!order) {
        this.logger.error(`Cannot recover: No order found for payment intent ${paymentIntentId}`);
        return false;
      }

      // Check if already processed
      const existingPayment = await this.prisma.payment.findFirst({
        where: {
          orderId: order.id,
          paymentIntentId,
          status: 'succeeded',
        },
      });

      if (existingPayment) {
        this.logger.log(`Payment already exists for ${paymentIntentId}, no recovery needed`);
        return false;
      }

      // Process based on payment intent status
      if (paymentIntent.status === 'succeeded') {
        // Note: charges may not be expanded by default
        // We check if it's an array or if it has data array
        const chargesData = Array.isArray((paymentIntent as any).charges)
          ? (paymentIntent as any).charges
          : (paymentIntent as any).charges?.data || [];
        const charge = chargesData[0];

        // Create payment record
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
            paidAt: new Date(paymentIntent.created * 1000),
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

        // Create audit log
        await this.prisma.auditLog.create({
          data: {
            entityType: 'order',
            entityId: order.id,
            action: 'payment_recovered',
            actorType: 'system',
            actor: 'reconciliation',
            changes: {
              paymentIntentId: paymentIntent.id,
              amount: paymentIntent.amount,
              recoveredAt: new Date().toISOString(),
            },
          },
        });

        // Emit event
        await this.eventsService.publish('payment.recovered', {
          id: uuidv4(),
          type: 'payment.recovered',
          timestamp: new Date(),
          resource: `order:${order.id}`,
          payload: {
            orderId: order.id,
            orderNumber: order.orderNumber,
            paymentIntentId: paymentIntent.id,
            amount: new Decimal(paymentIntent.amount).div(100).toString(),
          },
        });

        return true;
      }

      return false;
    } catch (error: any) {
      this.logger.error(`Error recovering payment intent ${paymentIntentId}: ${error.message}`);
      return false;
    }
  }
}
