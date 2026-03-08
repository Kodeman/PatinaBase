/**
 * Fulfillment Service
 *
 * Handles shipment creation, label generation, and tracking.
 * Integrates with shipping carriers via EasyPost.
 */

import {
  Injectable,
  Inject,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../../generated/prisma-client';
import { v4 as uuidv4 } from 'uuid';
import { CarrierFactory } from './carriers/carrier.factory';
import {
  CreateShipmentDto,
  GetRatesDto,
  UpdateShipmentDto,
  UpdateShipmentStatusDto,
  ShippingRateDto,
  ShippingLabelDto,
  TrackingDetailsDto,
  AddressDto,
} from './dto';
import { Address, CreateShipmentOptions, Parcel } from './carriers/carrier.interface';
import { generateIdentifierSuffix } from '@patina/utils';

@Injectable()
export class FulfillmentService {
  private readonly logger = new Logger(FulfillmentService.name);

  constructor(
    private prisma: PrismaClient,
    @Inject('EVENTS_SERVICE') private eventsService: any,
    private carrierFactory: CarrierFactory,
  ) {}

  /**
   * Get shipping rates for a shipment
   */
  async getRates(getRatesDto: GetRatesDto): Promise<{ rates: ShippingRateDto[]; recommendedRate?: ShippingRateDto }> {
    this.logger.debug('Getting shipping rates');

    const carrier = this.carrierFactory.getCarrier();

    const options: CreateShipmentOptions = {
      fromAddress: this.mapDtoToAddress(getRatesDto.fromAddress),
      toAddress: this.mapDtoToAddress(getRatesDto.toAddress),
      parcel: this.mapDtoToParcel(getRatesDto.parcel),
      customsInfo: getRatesDto.customsInfo as any,
    };

    const rates = await carrier.getRates(options);

    // Find lowest rate as recommendation
    const recommendedRate = rates.length > 0
      ? rates.reduce((lowest, current) => (current.rate < lowest.rate ? current : lowest))
      : undefined;

    return {
      rates: rates.map(rate => this.mapToShippingRateDto(rate)),
      recommendedRate: recommendedRate ? this.mapToShippingRateDto(recommendedRate) : undefined,
    };
  }

  /**
   * Create shipment and generate shipping label
   */
  async createShipment(orderId: string, createShipmentDto: CreateShipmentDto): Promise<any> {
    this.logger.debug(`Creating shipment for order ${orderId}`);

    // Verify order exists and is paid
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.paymentStatus !== 'captured') {
      throw new BadRequestException('Order must be paid before creating shipment');
    }

    // Validate items
    const orderItemIds = createShipmentDto.items.map(item => item.orderItemId);
    const validItems = order.items.filter(item => orderItemIds.includes(item.id));

    if (validItems.length !== orderItemIds.length) {
      throw new BadRequestException('Invalid order items specified');
    }

    // Create shipping label via carrier
    const carrier = this.carrierFactory.getCarrier();

    const options: CreateShipmentOptions = {
      fromAddress: this.mapDtoToAddress(createShipmentDto.fromAddress),
      toAddress: this.mapDtoToAddress(createShipmentDto.toAddress),
      parcel: this.mapDtoToParcel(createShipmentDto.parcel),
      carrier: createShipmentDto.carrier,
      service: createShipmentDto.service,
      rateId: createShipmentDto.rateId,
      customsInfo: createShipmentDto.customsInfo as any,
      reference: createShipmentDto.reference || order.orderNumber,
      options: createShipmentDto.options as any,
    };

    const label = await carrier.createLabel(options);

    // Calculate shipment cost from rate if available
    let shipmentCost: number | undefined;
    if (createShipmentDto.rateId) {
      try {
        const rates = await carrier.getRates(options);
        const selectedRate = rates.find(r => r.rateId === createShipmentDto.rateId);
        shipmentCost = selectedRate?.rate;
      } catch (error) {
        this.logger.warn('Failed to get rate for cost calculation', error);
      }
    }

    // Generate shipment number
    const shipmentNumber = `SHIP-${Date.now()}-${generateIdentifierSuffix(9)}`;

    // Create shipment record
    const shipment = await this.prisma.shipment.create({
      data: {
        orderId,
        shipmentNumber,
        carrier: createShipmentDto.carrier,
        service: createShipmentDto.service,
        trackingNumber: label.trackingNumber,
        trackingUrl: label.postageLabel?.labelUrl,
        publicTrackingUrl: label.postageLabel?.labelUrl,
        status: 'pending',
        items: createShipmentDto.items,
        carrierShipmentId: (label as any).shipmentId, // EasyPost shipment ID for refunds
        labelUrl: label.labelUrl,
        labelFormat: label.labelFormat,
        labelSize: label.labelSize,
        commercialInvoiceUrl: label.commercialInvoiceUrl,
        rateId: createShipmentDto.rateId,
        fromAddress: JSON.parse(JSON.stringify(createShipmentDto.fromAddress)),
        toAddress: JSON.parse(JSON.stringify(createShipmentDto.toAddress)),
        parcel: JSON.parse(JSON.stringify(createShipmentDto.parcel)),
        cost: shipmentCost,
        currency: 'USD',
        shippedAt: new Date(),
        metadata: JSON.parse(JSON.stringify({
          reference: createShipmentDto.reference,
          options: createShipmentDto.options,
        })),
      },
    });

    // Update order items fulfillment quantities
    for (const item of createShipmentDto.items) {
      await this.prisma.orderItem.update({
        where: { id: item.orderItemId },
        data: {
          qtyFulfilled: {
            increment: item.qty,
          },
        },
      });
    }

    // Update order fulfillment status
    const updatedOrder = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    const allItemsFulfilled = updatedOrder!.items.every(
      item => item.qtyFulfilled >= item.qty,
    );
    const someItemsFulfilled = updatedOrder!.items.some(item => item.qtyFulfilled > 0);

    let fulfillmentStatus = 'unfulfilled';
    if (allItemsFulfilled) {
      fulfillmentStatus = 'fulfilled';
    } else if (someItemsFulfilled) {
      fulfillmentStatus = 'partial';
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: {
        fulfillmentStatus,
        fulfilledAt: allItemsFulfilled ? new Date() : null,
      },
    });

    // Publish event
    await this.eventsService.publish('shipment.created', {
      id: uuidv4(),
      type: 'shipment.created',
      timestamp: new Date(),
      resource: `shipment:${shipment.id}`,
      payload: {
        orderId,
        shipmentId: shipment.id,
        trackingNumber: label.trackingNumber,
        carrier: createShipmentDto.carrier,
      },
    });

    this.logger.log(`Shipment created: ${shipment.id} (${label.trackingNumber})`);

    return {
      ...shipment,
      label: {
        trackingNumber: label.trackingNumber,
        labelUrl: label.labelUrl,
        labelFormat: label.labelFormat,
        labelSize: label.labelSize,
        commercialInvoiceUrl: label.commercialInvoiceUrl,
      },
    };
  }

  /**
   * Get tracking information for a shipment
   */
  async getTracking(shipmentId: string): Promise<TrackingDetailsDto> {
    this.logger.debug(`Getting tracking for shipment ${shipmentId}`);

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${shipmentId} not found`);
    }

    if (!shipment.trackingNumber) {
      throw new BadRequestException('Shipment does not have a tracking number');
    }

    const carrier = this.carrierFactory.getCarrier();
    const tracking = await carrier.getTracking(shipment.trackingNumber, shipment.carrier || undefined);

    // Update shipment with latest tracking info
    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        trackingStatus: tracking.status,
        trackingEvents: JSON.parse(JSON.stringify(tracking.trackingEvents)),
        estimatedDelivery: tracking.estimatedDelivery,
        publicTrackingUrl: tracking.publicUrl,
      },
    });

    return tracking as TrackingDetailsDto;
  }

  /**
   * Update shipment status (webhook or manual)
   */
  async updateShipmentStatus(shipmentId: string, statusDto: UpdateShipmentStatusDto): Promise<any> {
    this.logger.debug(`Updating shipment ${shipmentId} status to ${statusDto.status}`);

    const updates: any = {
      status: statusDto.status,
      trackingStatus: statusDto.statusDetail,
      estimatedDelivery: statusDto.estimatedDelivery,
    };

    if (statusDto.status === 'delivered') {
      updates.deliveredAt = new Date();
    }

    const shipment = await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: updates,
    });

    // If delivered, check if order is fully fulfilled
    if (statusDto.status === 'delivered') {
      const order = await this.prisma.order.findUnique({
        where: { id: shipment.orderId },
        include: { shipments: true },
      });

      if (order) {
        const allDelivered = order.shipments.every(s => s.status === 'delivered');
        if (allDelivered && order.fulfillmentStatus === 'fulfilled') {
          await this.prisma.order.update({
            where: { id: order.id },
            data: { status: 'fulfilled' },
          });
        }
      }
    }

    // Publish event
    await this.eventsService.publish('shipment.status_updated', {
      id: uuidv4(),
      type: 'shipment.status_updated',
      timestamp: new Date(),
      resource: `shipment:${shipmentId}`,
      payload: {
        shipmentId,
        status: statusDto.status,
        trackingNumber: shipment.trackingNumber,
      },
    });

    return shipment;
  }

  /**
   * Update shipment details
   */
  async updateShipment(shipmentId: string, updateDto: UpdateShipmentDto): Promise<any> {
    this.logger.debug(`Updating shipment ${shipmentId}`);

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${shipmentId} not found`);
    }

    return this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        carrier: updateDto.carrier,
        trackingNumber: updateDto.trackingNumber,
        trackingUrl: updateDto.trackingUrl,
        method: updateDto.method,
        notes: updateDto.notes,
      },
    });
  }

  /**
   * Get shipments for an order
   */
  async findByOrder(orderId: string): Promise<any[]> {
    return this.prisma.shipment.findMany({
      where: { orderId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get shipment by ID
   */
  async findById(shipmentId: string): Promise<any> {
    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
      include: { order: true },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${shipmentId} not found`);
    }

    return shipment;
  }

  /**
   * Validate an address
   */
  async validateAddress(addressDto: AddressDto): Promise<any> {
    this.logger.debug('Validating address');

    const carrier = this.carrierFactory.getCarrier();
    return carrier.validateAddress(this.mapDtoToAddress(addressDto));
  }

  /**
   * Refund a shipment
   */
  async refundShipment(shipmentId: string): Promise<any> {
    this.logger.debug(`Refunding shipment ${shipmentId}`);

    const shipment = await this.prisma.shipment.findUnique({
      where: { id: shipmentId },
    });

    if (!shipment) {
      throw new NotFoundException(`Shipment ${shipmentId} not found`);
    }

    if (!shipment.carrierShipmentId) {
      throw new BadRequestException('Shipment does not have a carrier shipment ID');
    }

    const carrier = this.carrierFactory.getCarrier();
    const refund = await carrier.refundShipment(shipment.carrierShipmentId);

    // Update shipment status
    await this.prisma.shipment.update({
      where: { id: shipmentId },
      data: {
        status: 'returned',
        metadata: {
          ...((shipment.metadata as any) || {}),
          refund,
        },
      },
    });

    return refund;
  }

  /**
   * Map DTO to carrier Address
   */
  private mapDtoToAddress(dto: AddressDto): Address {
    return {
      firstName: dto.firstName,
      lastName: dto.lastName,
      company: dto.company,
      street1: dto.street1,
      street2: dto.street2,
      city: dto.city,
      state: dto.state,
      zip: dto.zip,
      country: dto.country,
      phone: dto.phone,
      email: dto.email,
    };
  }

  /**
   * Map DTO to carrier Parcel
   */
  private mapDtoToParcel(dto: any): Parcel {
    return {
      length: dto.length,
      width: dto.width,
      height: dto.height,
      weight: dto.weight,
      predefinedPackage: dto.predefinedPackage,
    };
  }

  /**
   * Map carrier rate to DTO
   */
  private mapToShippingRateDto(rate: any): ShippingRateDto {
    return {
      carrier: rate.carrier,
      service: rate.service,
      rate: rate.rate,
      currency: rate.currency,
      deliveryDays: rate.deliveryDays,
      deliveryDate: rate.deliveryDate,
      deliveryDateGuaranteed: rate.deliveryDateGuaranteed,
      rateId: rate.rateId,
    };
  }
}
