import { Controller, Get, Post, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import {
  CurrentUser,
  RequireAnyPermission,
  type AuthenticatedUserIdentity,
} from '@patina/auth';
import { PaymentsService } from './payments.service';
import { ORDER_PERMISSIONS } from '../../common/authorization/orders-authorization.resolver';

@ApiTags('payments')
@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get('order/:orderId')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Get payments for an order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'List of payments' })
  async findByOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.paymentsService.findByOrder(orderId, user.sub);
  }

  @Post('order/:orderId/capture')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_OWN,
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Capture an authorized payment' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Amount to capture (optional, defaults to full authorized amount)' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Payment captured successfully' })
  @ApiResponse({ status: 400, description: 'Invalid capture request' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async capturePayment(
    @Param('orderId') orderId: string,
    @Body() body: { amount?: number },
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.paymentsService.capturePayment(orderId, body.amount, user.sub);
  }

  @Post('order/:orderId/cancel')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_OWN,
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Cancel an authorized payment' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {},
    },
  })
  @ApiResponse({ status: 200, description: 'Payment canceled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid cancel request' })
  async cancelPayment(
    @Param('orderId') orderId: string,
    @Body() _body: Record<string, never>,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.paymentsService.cancelPayment(orderId, user.sub);
  }

  @Get('payment-intent/:paymentIntentId')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Get payment intent details from Stripe' })
  @ApiParam({ name: 'paymentIntentId', description: 'Stripe Payment Intent ID' })
  @ApiResponse({ status: 200, description: 'Payment intent details' })
  async getPaymentIntent(
    @Param('paymentIntentId') paymentIntentId: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.paymentsService.getPaymentIntent(paymentIntentId, user.sub);
  }
}
