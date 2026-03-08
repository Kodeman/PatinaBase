import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { RefundsService } from './refunds.service';

@ApiTags('refunds')
@Controller('orders/:orderId/refunds')
export class RefundsController {
  constructor(private readonly refundsService: RefundsService) {}

  @Post()
  @ApiOperation({ summary: 'Create refund for order (full or partial)' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'Refund amount (optional, defaults to full order amount)' },
        reason: { type: 'string', enum: ['duplicate', 'fraudulent', 'requested_by_customer'], description: 'Refund reason' },
        actor: { type: 'string', description: 'User ID who initiated refund' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Refund created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid refund request' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async create(
    @Param('orderId') orderId: string,
    @Body() body: { amount?: number; reason?: string; actor?: string },
  ) {
    return this.refundsService.createRefund(orderId, body.amount, body.reason, body.actor);
  }

  @Get()
  @ApiOperation({ summary: 'Get all refunds for order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'List of refunds' })
  async findByOrder(@Param('orderId') orderId: string) {
    return this.refundsService.findByOrder(orderId);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get refund statistics for order' })
  @ApiParam({ name: 'orderId', description: 'Order ID' })
  @ApiResponse({ status: 200, description: 'Refund statistics' })
  async getRefundStats(@Param('orderId') orderId: string) {
    return this.refundsService.getRefundStats(orderId);
  }
}
