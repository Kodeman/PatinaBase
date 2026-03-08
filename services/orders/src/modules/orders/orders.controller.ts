import { Controller, Get, Patch, Post, Delete, Param, Query, Body, HttpCode, HttpStatus, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CacheInterceptor, CacheKey, CacheTTL } from '@patina/cache';
import { RequirePermissions } from '@patina/auth';
import { OrdersService } from './orders.service';
import { OrderResponseDto } from './dto/order-response.dto';

@ApiTags('orders')
@Controller('orders')
@UseInterceptors(CacheInterceptor)
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequirePermissions('orders.order.read')
  @ApiOperation({ summary: 'List orders with filters' })
  @ApiQuery({ name: 'userId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'paymentStatus', required: false })
  @ApiQuery({ name: 'from', required: false, type: Date })
  @ApiQuery({ name: 'to', required: false, type: Date })
  @ApiQuery({ name: 'skip', required: false, type: Number })
  @ApiQuery({ name: 'take', required: false, type: Number })
  @ApiResponse({
    status: 200,
    description: 'List of orders with pagination',
    schema: {
      properties: {
        data: { type: 'array', items: { $ref: '#/components/schemas/OrderResponseDto' } },
        pagination: {
          type: 'object',
          properties: {
            total: { type: 'number' },
            skip: { type: 'number' },
            take: { type: 'number' },
          },
        },
      },
    },
  })
  @CacheKey('orders:list:user::userId:status::status:skip::skip:take::take')
  @CacheTTL(60) // 1 minute
  async findAll(@Query() query: any) {
    const result = await this.ordersService.findAll(query);
    return {
      data: OrderResponseDto.fromPrismaMany(result.data),
      pagination: result.pagination,
    };
  }

  @Get(':id')
  @RequirePermissions('orders.order.read')
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order found', type: OrderResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(@Param('id') id: string): Promise<OrderResponseDto> {
    const order = await this.ordersService.findOne(id);
    return OrderResponseDto.fromPrisma(order)!;
  }

  @Get('number/:orderNumber')
  @RequirePermissions('orders.order.read')
  @ApiOperation({ summary: 'Get order by order number' })
  @ApiResponse({ status: 200, description: 'Order found', type: OrderResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findByOrderNumber(@Param('orderNumber') orderNumber: string): Promise<OrderResponseDto> {
    const order = await this.ordersService.findByOrderNumber(orderNumber);
    return OrderResponseDto.fromPrisma(order)!;
  }

  @Patch(':id/status')
  @RequirePermissions('orders.order.update')
  @ApiOperation({ summary: 'Update order status' })
  @ApiResponse({ status: 200, description: 'Order status updated', type: OrderResponseDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string; actor?: string },
  ): Promise<OrderResponseDto> {
    const order = await this.ordersService.updateStatus(id, body.status, body.actor);
    return OrderResponseDto.fromPrisma(order)!;
  }

  @Post(':id/cancel')
  @RequirePermissions('orders.order.cancel')
  @ApiOperation({ summary: 'Cancel order' })
  @ApiResponse({ status: 200, description: 'Order canceled', type: OrderResponseDto })
  async cancel(
    @Param('id') id: string,
    @Body() body: { reason?: string; actor?: string },
  ): Promise<OrderResponseDto> {
    const order = await this.ordersService.cancel(id, body.reason, body.actor);
    return OrderResponseDto.fromPrisma(order)!;
  }

  @Post('batch')
  @RequirePermissions('orders.order.read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch fetch orders by IDs' })
  @ApiResponse({ status: 200, description: 'Orders retrieved in order of requested IDs', type: [OrderResponseDto] })
  async findByIds(@Body() body: { ids: string[] }): Promise<(OrderResponseDto | null)[]> {
    const orders = await this.ordersService.findByIds(body.ids);
    // CRITICAL: Return in same order as requested IDs for DataLoader
    const ordersMap = new Map(orders.map(o => [o.id, o]));
    return body.ids.map(id => {
      const order = ordersMap.get(id);
      return order ? OrderResponseDto.fromPrisma(order)! : null;
    });
  }
}
