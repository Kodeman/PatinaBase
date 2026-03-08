/**
 * Carrier Webhooks Controller
 *
 * Handles webhook events from shipping carriers (EasyPost, etc.)
 * for real-time tracking updates.
 */

import {
  Controller,
  Post,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiExcludeEndpoint } from '@nestjs/swagger';
import { FulfillmentService } from './fulfillment.service';
import { WebhookEventType } from './carriers/carrier.interface';

@ApiTags('webhooks')
@Controller('webhooks/carriers')
export class CarrierWebhooksController {
  private readonly logger = new Logger(CarrierWebhooksController.name);

  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @Post('easypost')
  @HttpCode(HttpStatus.OK)
  @ApiExcludeEndpoint() // Exclude from public API docs
  @ApiOperation({ summary: 'Handle EasyPost webhook events' })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully',
  })
  async handleEasyPostWebhook(
    @Body() payload: any,
    @Headers('x-hmac-signature') signature?: string,
  ) {
    this.logger.debug('Received EasyPost webhook', payload);

    // TODO: Validate webhook signature
    // const isValid = this.validateEasyPostSignature(payload, signature);
    // if (!isValid) {
    //   throw new BadRequestException('Invalid webhook signature');
    // }

    try {
      const eventType = payload.description as WebhookEventType;

      switch (eventType) {
        case WebhookEventType.TRACKER_CREATED:
        case WebhookEventType.TRACKER_UPDATED:
          await this.handleTrackerUpdate(payload.result);
          break;

        case WebhookEventType.REFUND_SUCCESSFUL:
          await this.handleRefundSuccess(payload.result);
          break;

        case WebhookEventType.BATCH_CREATED:
        case WebhookEventType.BATCH_UPDATED:
          this.logger.debug('Batch event received, no action needed');
          break;

        default:
          this.logger.warn(`Unknown webhook event type: ${eventType}`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to process EasyPost webhook', error);
      throw new BadRequestException('Webhook processing failed');
    }
  }

  /**
   * Handle tracker update from carrier
   */
  private async handleTrackerUpdate(tracker: any) {
    this.logger.debug(`Processing tracker update: ${tracker.tracking_code}`);

    // Find shipment by tracking number
    const shipment = await this.fulfillmentService['prisma'].shipment.findFirst({
      where: { trackingNumber: tracker.tracking_code },
    });

    if (!shipment) {
      this.logger.warn(`No shipment found for tracking number: ${tracker.tracking_code}`);
      return;
    }

    // Map EasyPost status to our status
    const statusMap: Record<string, string> = {
      pre_transit: 'pending',
      in_transit: 'in_transit',
      out_for_delivery: 'out_for_delivery',
      delivered: 'delivered',
      available_for_pickup: 'out_for_delivery',
      return_to_sender: 'returned',
      failure: 'exception',
      cancelled: 'exception',
      error: 'exception',
      unknown: 'pending',
    };

    const status = statusMap[tracker.status] || 'pending';

    // Update shipment status
    await this.fulfillmentService.updateShipmentStatus(shipment.id, {
      status,
      statusDetail: tracker.status_detail,
      estimatedDelivery: tracker.est_delivery_date ? new Date(tracker.est_delivery_date) : undefined,
    });

    this.logger.log(`Updated shipment ${shipment.id} status to ${status}`);
  }

  /**
   * Handle successful refund from carrier
   */
  private async handleRefundSuccess(refund: any) {
    this.logger.debug(`Processing refund success: ${refund.id}`);

    // Find shipment by carrier shipment ID
    const shipment = await this.fulfillmentService['prisma'].shipment.findFirst({
      where: { carrierShipmentId: refund.shipment_id },
    });

    if (!shipment) {
      this.logger.warn(`No shipment found for refund: ${refund.shipment_id}`);
      return;
    }

    // Update shipment metadata with refund info
    await this.fulfillmentService['prisma'].shipment.update({
      where: { id: shipment.id },
      data: {
        status: 'returned',
        metadata: {
          ...((shipment.metadata as any) || {}),
          refund: {
            id: refund.id,
            status: refund.status,
            refundAmount: refund.refund_amount,
            processedAt: new Date(),
          },
        },
      },
    });

    this.logger.log(`Processed refund for shipment ${shipment.id}`);
  }

  /**
   * Validate EasyPost webhook signature
   * TODO: Implement HMAC signature validation
   */
  private validateEasyPostSignature(payload: any, signature?: string): boolean {
    // EasyPost uses HMAC-SHA256 for webhook signatures
    // Implementation depends on webhook secret from EasyPost dashboard
    // const secret = this.configService.get<string>('EASYPOST_WEBHOOK_SECRET');
    // const computedSignature = crypto
    //   .createHmac('sha256', secret)
    //   .update(JSON.stringify(payload))
    //   .digest('hex');
    // return signature === computedSignature;

    // For now, return true (implement in production)
    return true;
  }
}
