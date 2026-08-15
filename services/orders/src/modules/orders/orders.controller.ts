import { Controller, Get, Patch, Post, Param, Query, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import {
  CurrentUser,
  RequireAnyPermission,
  type AuthenticatedUserIdentity,
} from '@patina/auth';
import { OrdersService } from './orders.service';
import { OrderResponseDto } from './dto/order-response.dto';
import { ORDER_PERMISSIONS } from '../../common/authorization/orders-authorization.resolver';

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
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
  async findAll(
    @Query() query: any,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    const result = await this.ordersService.findAll(query, user.sub);
    return {
      data: OrderResponseDto.fromPrismaMany(result.data),
      pagination: result.pagination,
    };
  }

  @Get(':id')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Get order by ID' })
  @ApiResponse({ status: 200, description: 'Order found', type: OrderResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<OrderResponseDto> {
    const order = await this.ordersService.findOne(id, user.sub);
    return OrderResponseDto.fromPrisma(order)!;
  }

  @Get('number/:orderNumber')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Get order by order number' })
  @ApiResponse({ status: 200, description: 'Order found', type: OrderResponseDto })
  @ApiResponse({ status: 404, description: 'Order not found' })
  async findByOrderNumber(
    @Param('orderNumber') orderNumber: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<OrderResponseDto> {
    const order = await this.ordersService.findByOrderNumber(orderNumber, user.sub);
    return OrderResponseDto.fromPrisma(order)!;
  }

  @Patch(':id')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_OWN,
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Update scoped order workflow fields' })
  async update(
    @Param('id') id: string,
    @Body() body: {
      status?: string;
      fulfillmentStatus?: string;
      shippingMethod?: string;
      customerNotes?: string;
      internalNotes?: string;
    },
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<OrderResponseDto> {
    const order = await this.ordersService.update(id, body, user.sub);
    return OrderResponseDto.fromPrisma(order)!;
  }

  @Patch(':id/status')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_OWN,
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Update order status' })
  @ApiResponse({ status: 200, description: 'Order status updated', type: OrderResponseDto })
  async updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<OrderResponseDto> {
    const order = await this.ordersService.updateStatus(id, body.status, user.sub);
    return OrderResponseDto.fromPrisma(order)!;
  }

  @Post(':id/cancel')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_OWN,
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Cancel order' })
  @ApiResponse({ status: 200, description: 'Order canceled', type: OrderResponseDto })
  async cancel(
    @Param('id') id: string,
    @Body() body: { reason?: string },
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<OrderResponseDto> {
    const order = await this.ordersService.cancel(id, body.reason, user.sub);
    return OrderResponseDto.fromPrisma(order)!;
  }

  @Post('batch')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Batch fetch orders by IDs' })
  @ApiResponse({ status: 200, description: 'Accessible orders', type: [OrderResponseDto] })
  async findByIds(
    @Body() body: { ids: string[] },
    @CurrentUser() user: AuthenticatedUserIdentity,
  ): Promise<OrderResponseDto[]> {
    const orders = await this.ordersService.findByIds(body.ids, user.sub);
    return OrderResponseDto.fromPrismaMany(orders);
  }
}
