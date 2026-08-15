/**
 * Fulfillment Controller
 *
 * Handles shipment creation, rate shopping, label generation, and tracking.
 */

import {
  Controller,
  Post,
  Patch,
  Get,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { FulfillmentService } from './fulfillment.service';
import {
  CreateShipmentDto,
  GetRatesDto,
  UpdateShipmentDto,
  UpdateShipmentStatusDto,
  ValidateAddressDto,
  ShippingRatesResponseDto,
} from './dto';
import {
  CurrentUser,
  RequireAnyPermission,
  type AuthenticatedUserIdentity,
} from '@patina/auth';
import { ORDER_PERMISSIONS } from '../../common/authorization/orders-authorization.resolver';

@ApiTags('fulfillment')
@ApiBearerAuth()
@Controller('orders/:orderId/shipments')
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @Post()
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Create shipment and generate shipping label for order' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 201,
    description: 'Shipment created with label',
  })
  @ApiResponse({
    status: 400,
    description: 'Order not paid or invalid items',
  })
  @ApiResponse({
    status: 404,
    description: 'Order not found',
  })
  async create(
    @Param('orderId') orderId: string,
    @Body() createShipmentDto: CreateShipmentDto,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.createShipment(orderId, createShipmentDto, user.sub);
  }

  @Get()
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Get all shipments for order' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of shipments',
  })
  async findByOrder(
    @Param('orderId') orderId: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.findByOrder(orderId, user.sub);
  }

  @Patch()
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Update a shipment belonging to this order' })
  async updateForOrder(
    @Param('orderId') orderId: string,
    @Body() body: UpdateShipmentDto & { id?: string; shipmentId?: string; status?: string },
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.updateShipmentForOrder(orderId, body, user.sub);
  }
}

@ApiTags('shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @Post('rates')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_OWN,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get shipping rates for a shipment' })
  @ApiResponse({
    status: 200,
    description: 'Shipping rates from multiple carriers',
    type: ShippingRatesResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid address or parcel data',
  })
  async getRates(
    @Body() getRatesDto: GetRatesDto,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.getRates(getRatesDto, user.sub);
  }

  @Post('validate-address')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_OWN,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a shipping address' })
  @ApiResponse({
    status: 200,
    description: 'Address validation result',
  })
  async validateAddress(
    @Body() addressDto: ValidateAddressDto,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.validateAddress(addressDto, user.sub);
  }

  @Get(':id')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Get shipment by ID' })
  @ApiParam({ name: 'id', description: 'Shipment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Shipment details',
  })
  @ApiResponse({
    status: 404,
    description: 'Shipment not found',
  })
  async findById(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.findById(id, user.sub);
  }

  @Get(':id/tracking')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.READ_OWN,
    ORDER_PERMISSIONS.READ_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Get real-time tracking information for shipment' })
  @ApiParam({ name: 'id', description: 'Shipment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Tracking details with events',
  })
  @ApiResponse({
    status: 404,
    description: 'Shipment not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Shipment does not have tracking number',
  })
  async getTracking(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.getTracking(id, user.sub);
  }

  @Patch(':id')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Update shipment details' })
  @ApiParam({ name: 'id', description: 'Shipment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Shipment updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Shipment not found',
  })
  async update(
    @Param('id') id: string,
    @Body() updateShipmentDto: UpdateShipmentDto,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.updateShipment(id, updateShipmentDto, user.sub);
  }

  @Patch(':id/status')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @ApiOperation({ summary: 'Update shipment status (manual or webhook)' })
  @ApiParam({ name: 'id', description: 'Shipment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Shipment status updated',
  })
  @ApiResponse({
    status: 404,
    description: 'Shipment not found',
  })
  async updateStatus(
    @Param('id') id: string,
    @Body() statusDto: UpdateShipmentStatusDto,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.updateShipmentStatus(id, statusDto, user.sub);
  }

  @Post(':id/refund')
  @RequireAnyPermission(
    ORDER_PERMISSIONS.MANAGE_ORG,
    ORDER_PERMISSIONS.ADMIN_ALL,
  )
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refund a shipment (carrier must support refunds)' })
  @ApiParam({ name: 'id', description: 'Shipment UUID' })
  @ApiResponse({
    status: 200,
    description: 'Shipment refund initiated',
  })
  @ApiResponse({
    status: 404,
    description: 'Shipment not found',
  })
  @ApiResponse({
    status: 400,
    description: 'Shipment cannot be refunded',
  })
  async refund(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUserIdentity,
  ) {
    return this.fulfillmentService.refundShipment(id, user.sub);
  }
}
