import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { RequirePermissions } from '@patina/auth';
import { PaymentsService } from './payments.service';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('order/:orderId')
  @RequirePermissions('orders.payment.read')
  @ApiOperation({ summary: 'Get payments for an order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'List of payments' })
  async findByOrder(@Param('orderId') orderId: string) {
    return this.paymentsService.findByOrder(orderId);
  }

  @Post('order/:orderId/capture')
  @RequirePermissions('orders.payment.capture')
  @ApiOperation({ summary: 'Capture an authorized payment' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount to capture (optional, defaults to full authorized amount)' },
        actor: { type: 'string', description: 'User ID who initiated capture' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Payment captured successfully' })
  @ApiResponse({ status: 400, description: 'Invalid capture request' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async capturePayment(
    @Param('orderId') orderId: string,
    @Body() body: { amount?: number; actor?: string },
  ) {
    return this.paymentsService.capturePayment(orderId, body.amount, body.actor);
  }

  @Post('order/:orderId/cancel')
  @RequirePermissions('orders.payment.cancel')
  @ApiOperation({ summary: 'Cancel an authorized payment' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        actor: { type: 'string', description: 'User ID who initiated cancellation' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Payment canceled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid cancel request' })
  async cancelPayment(
    @Param('orderId') orderId: string,
    @Body() body: { actor?: string },
  ) {
    return this.paymentsService.cancelPayment(orderId, body.actor);
  }

  @Get('payment-intent/:paymentIntentId')
  @RequirePermissions('orders.payment.read')
  @ApiOperation({ summary: 'Get payment intent details from Stripe' })
  @ApiParam({ name: 'paymentIntentId', description: 'Stripe Payment Intent ID' })
  @ApiResponse({ status: 200, description: 'Payment intent details' })
  async getPaymentIntent(@Param('paymentIntentId') paymentIntentId: string) {
    return this.paymentsService.getPaymentIntent(paymentIntentId);
  }
}
