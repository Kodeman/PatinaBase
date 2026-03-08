/**
 * Mock Carrier Implementation
 *
 * Provides simulated shipping functionality for development and testing.
 * Used when EASYPOST_API_KEY is not configured.
 */

import { Injectable, Logger } from '@nestjs/common';
import {
  ICarrier,
  Address,
  CreateShipmentOptions,
  ShippingRate,
  ShipmentLabel,
  TrackingDetails,
  AddressValidationResult,
  TrackingEvent,
} from './carrier.interface';

@Injectable()
export class MockCarrier implements ICarrier {
  private readonly logger = new Logger(MockCarrier.name);

  constructor() {
    this.logger.warn('[MockCarrier] Using mock carrier - no real shipping will occur');
  }

  getName(): string {
    return 'MockCarrier';
  }

  /**
   * Get simulated shipping rates
   */
  async getRates(options: CreateShipmentOptions): Promise<ShippingRate[]> {
    this.logger.debug('[MockCarrier] Generating mock rates');

    // Generate realistic-looking mock rates
    const baseRate = this.calculateBaseRate(options);

    return [
      {
        carrier: 'USPS',
        service: 'Priority',
        rate: baseRate,
        currency: 'USD',
        deliveryDays: 3,
        deliveryDate: this.getDeliveryDate(3),
        deliveryDateGuaranteed: false,
        rateId: `mock_rate_usps_priority_${Date.now()}`,
      },
      {
        carrier: 'USPS',
        service: 'Express',
        rate: baseRate * 1.8,
        currency: 'USD',
        deliveryDays: 1,
        deliveryDate: this.getDeliveryDate(1),
        deliveryDateGuaranteed: true,
        rateId: `mock_rate_usps_express_${Date.now()}`,
      },
      {
        carrier: 'FedEx',
        service: 'Ground',
        rate: baseRate * 0.9,
        currency: 'USD',
        deliveryDays: 5,
        deliveryDate: this.getDeliveryDate(5),
        deliveryDateGuaranteed: false,
        rateId: `mock_rate_fedex_ground_${Date.now()}`,
      },
      {
        carrier: 'FedEx',
        service: '2Day',
        rate: baseRate * 1.5,
        currency: 'USD',
        deliveryDays: 2,
        deliveryDate: this.getDeliveryDate(2),
        deliveryDateGuaranteed: true,
        rateId: `mock_rate_fedex_2day_${Date.now()}`,
      },
      {
        carrier: 'UPS',
        service: 'Ground',
        rate: baseRate * 0.85,
        currency: 'USD',
        deliveryDays: 5,
        deliveryDate: this.getDeliveryDate(5),
        deliveryDateGuaranteed: false,
        rateId: `mock_rate_ups_ground_${Date.now()}`,
      },
    ];
  }

  /**
   * Create a mock shipping label
   */
  async createLabel(options: CreateShipmentOptions): Promise<ShipmentLabel> {
    this.logger.debug('[MockCarrier] Creating mock label');

    const trackingNumber = this.generateTrackingNumber(options.carrier || 'MOCK');

    return {
      trackingNumber,
      labelUrl: `https://mock-labels.example.com/${trackingNumber}.pdf`,
      labelFormat: options.options?.labelFormat || 'PDF',
      labelSize: options.options?.labelSize || '4x6',
      commercialInvoiceUrl: options.customsInfo
        ? `https://mock-labels.example.com/${trackingNumber}_invoice.pdf`
        : undefined,
      postageLabel: {
        labelUrl: `https://mock-labels.example.com/${trackingNumber}.pdf`,
        labelFileType: 'PDF',
      },
    };
  }

  /**
   * Get mock tracking information
   */
  async getTracking(trackingNumber: string, carrier?: string): Promise<TrackingDetails> {
    this.logger.debug(`[MockCarrier] Fetching mock tracking for ${trackingNumber}`);

    const events = this.generateTrackingEvents();

    return {
      trackingNumber,
      carrier: carrier || 'MOCK',
      status: 'in_transit',
      statusDetail: 'Package is in transit to destination',
      estimatedDelivery: this.getDeliveryDate(2),
      trackingEvents: events,
      publicUrl: `https://mock-tracking.example.com/${trackingNumber}`,
    };
  }

  /**
   * Validate an address (always returns valid in mock mode)
   */
  async validateAddress(address: Address): Promise<AddressValidationResult> {
    this.logger.debug('[MockCarrier] Validating address (mock)');

    // Return the address as valid with any obvious fixes
    return {
      valid: true,
      address: {
        ...address,
        state: address.state?.toUpperCase(),
        zip: address.zip?.replace(/\s/g, ''),
      },
      messages: [],
      warnings: ['This is a mock validation - address not verified with USPS'],
    };
  }

  /**
   * Refund a shipment (mock - always succeeds)
   */
  async refundShipment(shipmentId: string): Promise<{ refunded: boolean; refundAmount?: number }> {
    this.logger.debug(`[MockCarrier] Mock refund for shipment ${shipmentId}`);

    return {
      refunded: true,
      refundAmount: 8.99, // Mock refund amount
    };
  }

  /**
   * Calculate a base rate based on parcel dimensions
   */
  private calculateBaseRate(options: CreateShipmentOptions): number {
    const { parcel } = options;
    const volume = parcel.length * parcel.width * parcel.height;
    const dimWeight = volume / 139; // Standard dim weight divisor
    const billedWeight = Math.max(parcel.weight, dimWeight);

    // Base rate calculation
    return Math.round((5 + billedWeight * 0.5) * 100) / 100;
  }

  /**
   * Get a delivery date N business days from now
   */
  private getDeliveryDate(businessDays: number): Date {
    const date = new Date();
    let daysAdded = 0;
    while (daysAdded < businessDays) {
      date.setDate(date.getDate() + 1);
      const dayOfWeek = date.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        daysAdded++;
      }
    }
    return date;
  }

  /**
   * Generate a realistic-looking tracking number
   */
  private generateTrackingNumber(carrier: string): string {
    const prefix = {
      USPS: '94',
      FedEx: '78',
      UPS: '1Z',
      MOCK: 'MK',
    }[carrier] || 'MK';

    const random = Math.random().toString(36).substring(2, 15).toUpperCase();
    const timestamp = Date.now().toString(36).toUpperCase();

    return `${prefix}${random}${timestamp}`.substring(0, 22);
  }

  /**
   * Generate realistic tracking events
   */
  private generateTrackingEvents(): TrackingEvent[] {
    const now = new Date();
    const events: TrackingEvent[] = [];

    // Label created
    events.push({
      status: 'pre_transit',
      statusDetail: 'Label created',
      description: 'Shipping label has been created',
      datetime: new Date(now.getTime() - 48 * 60 * 60 * 1000),
      location: {
        city: 'Los Angeles',
        state: 'CA',
        country: 'US',
        zip: '90001',
      },
    });

    // Package picked up
    events.push({
      status: 'in_transit',
      statusDetail: 'Picked up',
      description: 'Package picked up by carrier',
      datetime: new Date(now.getTime() - 36 * 60 * 60 * 1000),
      location: {
        city: 'Los Angeles',
        state: 'CA',
        country: 'US',
        zip: '90001',
      },
    });

    // In transit
    events.push({
      status: 'in_transit',
      statusDetail: 'In transit',
      description: 'Package in transit to destination facility',
      datetime: new Date(now.getTime() - 12 * 60 * 60 * 1000),
      location: {
        city: 'Phoenix',
        state: 'AZ',
        country: 'US',
        zip: '85001',
      },
    });

    return events;
  }
}
