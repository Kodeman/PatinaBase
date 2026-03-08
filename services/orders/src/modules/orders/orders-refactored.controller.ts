/**
 * Orders Refactored Controller
 *
 * Uses OrderApplicationService (Repository Pattern).
 * Backward compatible with existing API endpoints.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
  UseInterceptors,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery, ApiBody } from '@nestjs/swagger';
import { CacheInterceptor, CacheKey, CacheTTL } from '@patina/cache';
import { OrderApplicationService } from '../../application/services/order-application.service';
import { CreateOrderCommand } from '../../application/commands/create-order.command';
import { UpdateOrderStatusCommand } from '../../application/commands/update-order-status.command';
import { CancelOrderCommand } from '../../application/commands/cancel-order.command';
import { MarkOrderPaidCommand } from '../../application/commands/mark-order-paid.command';
import {
  UpdateOrderItemQuantityCommand,
  RemoveOrderItemCommand,
} from '../../application/commands/update-order-items.command';
import { ListOrdersQuery } from '../../application/queries/list-orders.query';
import { OrderStatusValue } from '../../domain/value-objects/order-status.vo';
import { PaymentStatusValue } from '../../domain/value-objects/payment-status.vo';
import { FulfillmentStatusValue } from '../../domain/value-objects/fulfillment-status.vo';

@ApiTags('orders')
@Controller('orders')
@UseInterceptors(CacheInterceptor)
export class OrdersRefactoredController {
  constructor(private readonly orderAppService: OrderApplicationService) {}

  /**
   * List orders with filters
   */
  @Get()
  @ApiOperation({ summary: 'List orders with filters' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'paymentStatus', required: false })
  @ApiQuery({ name: 'fulfillmentStatus', required: false })
  @ApiQuery({ name: 'from', required: false, type: Date })
  @ApiQuery({ name: 'to', required: false, type: Date })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @CacheKey('orders:list:user::userId:status::status:skip::skip:take::take')
  @CacheTTL(60) // 1 minute
  async findAll(
    @Query('userId') userId?: string,
    @Query('status') status?: OrderStatusValue,
    @Query('paymentStatus') paymentStatus?: PaymentStatusValue,
    @Query('fulfillmentStatus') fulfillmentStatus?: FulfillmentStatusValue,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('skip', new DefaultValuePipe(0), ParseIntPipe) skip?: number,
    @Query('take', new DefaultValuePipe(50), ParseIntPipe) take?: number,
  ) {
    const query: ListOrdersQuery = {
      userId,
      status,
      paymentStatus,
      fulfillmentStatus,
      fromDate: from ? new Date(from) : undefined,
      toDate: to ? new Date(to) : undefined,
      skip,
      take,
    };

    const result = await this.orderAppService.listOrders(query);

    // Map domain entities to API response
    return {
      data: result.data.map((order) => this.mapOrderToResponse(order)),
      pagination: {
        total: result.total,
        skip: result.skip,
        take: result.take,
      },
    };
  }

  /**
   * Get order by ID
   */
  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(@Param('id') id: string) {
    const order = await this.orderAppService.getOrderById({ orderId: id });
    return this.mapOrderToResponse(order);
  }

  /**
   * Get order by order number
   */
  @Get('number/:orderNumber')
  @ApiOperation({ summary: 'Get order by order number' })
  @ApiResponse({ status: 200, description: 'Order found' })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findByOrderNumber(@Param('orderNumber') orderNumber: string) {
    const order = await this.orderAppService.getOrderByOrderNumber({ orderNumber });
    return this.mapOrderToResponse(order);
  }

  /**
   * Create new order
   */
  @Post()
  @ApiOperation({ summary: 'Create new order' })
  @ApiResponse({ status: 201, description: 'Order created successfully' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['userId', 'shippingAddress', 'items'],
      properties: {
        userId: { type: 'string' },
        cartId: { type: 'string' },
        currency: { type: 'string', default: 'USD' },
        shippingAddress: { type: 'object' },
        billingAddress: { type: 'object' },
        shippingMethod: { type: 'string' },
        customerNotes: { type: 'string' },
        items: {
          type: 'array',
          items: {
            type: 'object',
            required: ['productId', 'name', 'quantity', 'unitPrice'],
            properties: {
              productId: { type: 'string' },
              variantId: { type: 'string' },
              name: { type: 'string' },
              sku: { type: 'string' },
              quantity: { type: 'number' },
              unitPrice: { type: 'number' },
              currency: { type: 'string' },
              taxAmount: { type: 'number' },
              discountAmount: { type: 'number' },
            },
          },
        },
        metadata: { type: 'object' },
      },
    },
  })
  async create(@Body() command: CreateOrderCommand) {
    const order = await this.orderAppService.createOrder(command);
    return this.mapOrderToResponse(order);
  }

  /**
   * Update order status
   */
  @Patch(':id/status')
  @ApiOperation({ summary: 'Update order status' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['status'],
      properties: {
        status: {
          type: 'string',
          enum: ['created', 'paid', 'processing', 'fulfilled', 'closed', 'refunded', 'canceled'],
        },
        actor: { type: 'string' },
        reason: { type: 'string' },
      },
    },
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: OrderStatusValue; actor?: string; reason?: string },
  ) {
    const command: UpdateOrderStatusCommand = {
      orderId: id,
      newStatus: body.status,
      actorId: body.actor,
      reason: body.reason,
    };

    const order = await this.orderAppService.updateOrderStatus(command);
    return this.mapOrderToResponse(order);
  }

  /**
   * Mark order as paid
   */
  @Post(':id/paid')
  @ApiOperation({ summary: 'Mark order as paid' })
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        paymentIntentId: { type: 'string' },
        customerId: { type: 'string' },
      },
    },
  })
  async markAsPaid(
    @Param('id') id: string,
    @Body() body: { paymentIntentId?: string; customerId?: string },
  ) {
    const command: MarkOrderPaidCommand = {
      orderId: id,
      paymentIntentId: body.paymentIntentId,
      customerId: body.customerId,
    };

    const order = await this.orderAppService.markOrderAsPaid(command);
    return this.mapOrderToResponse(order);
  }

  /**
   * Cancel order
   */
  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel order' })
  @HttpCode(HttpStatus.OK)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
        actor: { type: 'string' },
      },
    },
  })
  async cancel(@Param('id') id: string, @Body() body: { reason?: string; actor?: string }) {
    const command: CancelOrderCommand = {
      orderId: id,
      reason: body.reason,
      actorId: body.actor,
    };

    const order = await this.orderAppService.cancelOrder(command);
    return this.mapOrderToResponse(order);
  }

  /**
   * Update order item quantity
   */
  @Patch(':id/items/:itemId/quantity')
  @ApiOperation({ summary: 'Update order item quantity' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['quantity'],
      properties: {
        quantity: { type: 'number', minimum: 1 },
      },
    },
  })
  async updateItemQuantity(
    @Param('id') id: string,
    @Param('itemId') itemId: string,
    @Body() body: { quantity: number },
  ) {
    const command: UpdateOrderItemQuantityCommand = {
      orderId: id,
      itemId,
      newQuantity: body.quantity,
    };

    const order = await this.orderAppService.updateOrderItemQuantity(command);
    return this.mapOrderToResponse(order);
  }

  /**
   * Remove order item
   */
  @Patch(':id/items/:itemId')
  @ApiOperation({ summary: 'Remove order item' })
  @HttpCode(HttpStatus.OK)
  async removeItem(@Param('id') id: string, @Param('itemId') itemId: string) {
    const command: RemoveOrderItemCommand = {
      orderId: id,
      itemId,
    };

    const order = await this.orderAppService.removeOrderItem(command);
    return this.mapOrderToResponse(order);
  }

  /**
   * Batch fetch orders by IDs
   */
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch fetch orders by IDs' })
  @ApiResponse({ status: 200, description: 'Orders retrieved in order of requested IDs' })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['ids'],
      properties: {
        ids: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  async findByIds(@Body() body: { ids: string[] }) {
    // Fetch all orders
    const orders = await Promise.all(
      body.ids.map(async (id) => {
        try {
          return await this.orderAppService.getOrderById({ orderId: id });
        } catch {
          return null;
        }
      }),
    );

    // Return in same order as requested IDs (for DataLoader compatibility)
    return orders.map((order) => (order ? this.mapOrderToResponse(order) : null));
  }

  /**
   * Map domain Order entity to API response
   */
  private mapOrderToResponse(order: any) {
    return {
      id: order.getId(),
      orderNumber: order.getOrderNumber(),
      userId: order.getUserId(),
      cartId: order.getCartId(),
      status: order.getStatus().getValue(),
      paymentStatus: order.getPaymentStatus().getValue(),
      fulfillmentStatus: order.getFulfillmentStatus().getValue(),
      currency: order.getCurrency(),
      subtotal: order.getSubtotal().getAmount(),
      discountTotal: order.getDiscountTotal().getAmount(),
      taxTotal: order.getTaxTotal().getAmount(),
      shippingTotal: order.getShippingTotal().getAmount(),
      total: order.getTotal().getAmount(),
      shippingAddress: order.getShippingAddress()?.toJSON() || null,
      billingAddress: order.getBillingAddress()?.toJSON() || null,
      shippingMethod: order.getShippingMethod(),
      customerNotes: order.getCustomerNotes(),
      internalNotes: order.getInternalNotes(),
      metadata: order.getMetadata(),
      snapshot: order.getSnapshot(),
      items: order.getItems().map((item: any) => ({
        id: item.getId(),
        orderId: item.getOrderId(),
        productId: item.getProductId(),
        variantId: item.getVariantId(),
        name: item.getName(),
        sku: item.getSku(),
        qty: item.getQuantity(),
        unitPrice: item.getUnitPrice().getAmount(),
        currency: item.getUnitPrice().getCurrency(),
        taxAmount: item.getTaxAmount().getAmount(),
        discountAlloc: item.getDiscountAmount().getAmount(),
        subtotal: item.getSubtotal().getAmount(),
        total: item.getTotal().getAmount(),
        snapshot: item.getSnapshot(),
        metadata: item.getMetadata(),
        qtyFulfilled: item.getQuantityFulfilled(),
        qtyRefunded: item.getQuantityRefunded(),
        createdAt: item.getCreatedAt(),
      })),
      paymentIntentId: order.getPaymentIntentId(),
      checkoutSessionId: order.getCheckoutSessionId(),
      customerId: order.getCustomerId(),
      paidAt: order.getPaidAt(),
      fulfilledAt: order.getFulfilledAt(),
      closedAt: order.getClosedAt(),
      canceledAt: order.getCanceledAt(),
      createdAt: order.getCreatedAt(),
      updatedAt: order.getUpdatedAt(),
    };
  }
}
