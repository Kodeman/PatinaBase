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

@ApiTags('fulfillment')
@ApiBearerAuth()
@Controller('orders/:orderId/shipments')
export class FulfillmentController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @Post()
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
  ) {
    return this.fulfillmentService.createShipment(orderId, createShipmentDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all shipments for order' })
  @ApiParam({ name: 'orderId', description: 'Order UUID' })
  @ApiResponse({
    status: 200,
    description: 'List of shipments',
  })
  async findByOrder(@Param('orderId') orderId: string) {
    return this.fulfillmentService.findByOrder(orderId);
  }
}

@ApiTags('shipments')
@ApiBearerAuth()
@Controller('shipments')
export class ShipmentsController {
  constructor(private readonly fulfillmentService: FulfillmentService) {}

  @Post('rates')
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
  async getRates(@Body() getRatesDto: GetRatesDto) {
    return this.fulfillmentService.getRates(getRatesDto);
  }

  @Post('validate-address')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate a shipping address' })
  @ApiResponse({
    status: 200,
    description: 'Address validation result',
  })
  async validateAddress(@Body() addressDto: ValidateAddressDto) {
    return this.fulfillmentService.validateAddress(addressDto);
  }

  @Get(':id')
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
  async findById(@Param('id') id: string) {
    return this.fulfillmentService.findById(id);
  }

  @Get(':id/tracking')
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
  async getTracking(@Param('id') id: string) {
    return this.fulfillmentService.getTracking(id);
  }

  @Patch(':id')
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
  ) {
    return this.fulfillmentService.updateShipment(id, updateShipmentDto);
  }

  @Patch(':id/status')
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
  ) {
    return this.fulfillmentService.updateShipmentStatus(id, statusDto);
  }

  @Post(':id/refund')
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
  async refund(@Param('id') id: string) {
    return this.fulfillmentService.refundShipment(id);
  }
}
