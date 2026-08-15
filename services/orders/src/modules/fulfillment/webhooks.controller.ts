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
import {
  CurrentUser,
  RequirePermissions,
  type AuthenticatedUserIdentity,
} from '@patina/auth';
import { ORDER_PERMISSIONS } from '../../common/authorization/orders-authorization.resolver';

@ApiTags('webhooks')
@Controller('webhooks/carriers')
export class CarrierWebhooksController {
  private readonly logger = new Logger(CarrierWebhooksController.name);

  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @Post('easypost')
  @RequirePermissions(ORDER_PERMISSIONS.ADMIN_ALL)
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
    @CurrentUser() user?: AuthenticatedUserIdentity,
  ) {
    this.logger.debug('Received authenticated EasyPost webhook request');

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
          await this.handleTrackerUpdate(payload.result, user!.sub);
          break;

        case WebhookEventType.REFUND_SUCCESSFUL:
          await this.handleRefundSuccess(payload.result, user!.sub);
          break;

        case WebhookEventType.BATCH_CREATED:
        case WebhookEventType.BATCH_UPDATED:
          this.logger.debug('Batch event received, no action needed');
          break;

        default:
          this.logger.warn('Unknown webhook event type');
      }

      return { success: true };
    } catch (error) {
      this.logger.error('Failed to process EasyPost webhook');
      throw new BadRequestException('Webhook processing failed');
    }
  }

  /**
   * Handle tracker update from carrier
   */
  private async handleTrackerUpdate(tracker: any, subject: string) {
    this.logger.debug('Processing tracker update');

    // Find shipment by tracking number
    const shipment = await this.fulfillmentService.findShipmentByTrackingNumber(
      tracker.tracking_code,
      subject,
    );

    if (!shipment) {
      this.logger.warn('No shipment found for tracking update');
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
    }, subject);

    this.logger.log('Updated shipment status');
  }

  /**
   * Handle successful refund from carrier
   */
  private async handleRefundSuccess(refund: any, subject: string) {
    this.logger.debug('Processing carrier refund');

    // Find shipment by carrier shipment ID
    const updated = await this.fulfillmentService.recordCarrierRefund(
      refund.shipment_id,
      refund,
      subject,
    );

    if (!updated) {
      this.logger.warn('No shipment found for carrier refund');
      return;
    }
    this.logger.log('Processed carrier refund');
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
