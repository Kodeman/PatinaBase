/**
 * EasyPost Carrier Implementation
 *
 * Integrates with EasyPost API for multi-carrier shipping:
 * - USPS, FedEx, UPS support
 * - Rate shopping across carriers
 * - Label generation
 * - Address validation
 * - Real-time tracking
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import EasyPostClient from '@easypost/api';
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
export class EasyPostCarrier implements ICarrier {
  private readonly logger = new Logger(EasyPostCarrier.name);
  private client: InstanceType<typeof EasyPostClient> | null = null;
  private defaultFromAddressId?: string;
  private readonly isConfigured: boolean;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('EASYPOST_API_KEY');

    if (apiKey) {
      this.client = new EasyPostClient(apiKey);
      this.defaultFromAddressId = this.configService.get<string>('EASYPOST_DEFAULT_FROM_ADDRESS_ID');
      this.isConfigured = true;
      this.logger.log('EasyPost carrier initialized');
    } else {
      this.isConfigured = false;
      this.logger.warn('[EasyPost] No API key configured - carrier will not be available');
    }
  }

  /**
   * Check if EasyPost is properly configured
   */
  isAvailable(): boolean {
    return this.isConfigured && this.client !== null;
  }

  private ensureConfigured(): void {
    if (!this.isConfigured || !this.client) {
      throw new Error('EasyPost is not configured. Set EASYPOST_API_KEY environment variable.');
    }
  }

  getName(): string {
    return 'EasyPost';
  }

  /**
   * Get shipping rates for a shipment
   */
  async getRates(options: CreateShipmentOptions): Promise<ShippingRate[]> {
    this.ensureConfigured();

    try {
      this.logger.debug('Fetching rates from EasyPost');

      const shipment = await this.client!.Shipment.create({
        to_address: this.mapToEasyPostAddress(options.toAddress),
        from_address: this.mapToEasyPostAddress(options.fromAddress),
        parcel: {
          length: options.parcel.length,
          width: options.parcel.width,
          height: options.parcel.height,
          weight: options.parcel.weight,
          predefined_package: options.parcel.predefinedPackage,
        },
        customs_info: options.customsInfo ? this.mapToEasyPostCustoms(options.customsInfo) : undefined,
        reference: options.reference,
      });

      const rates = shipment.rates?.map((rate: any) => this.mapFromEasyPostRate(rate)) || [];

      this.logger.debug(`Retrieved ${rates.length} rates`);
      return rates;
    } catch (error) {
      this.logger.error('Failed to get rates from EasyPost', error);
      throw new Error(`EasyPost rate retrieval failed: ${error.message}`);
    }
  }

  /**
   * Purchase a shipping label
   */
  async createLabel(options: CreateShipmentOptions): Promise<ShipmentLabel> {
    this.ensureConfigured();

    try {
      this.logger.debug('Creating shipment label via EasyPost');

      // Create shipment
      const shipment = await this.client!.Shipment.create({
        to_address: this.mapToEasyPostAddress(options.toAddress),
        from_address: this.mapToEasyPostAddress(options.fromAddress),
        parcel: {
          length: options.parcel.length,
          width: options.parcel.width,
          height: options.parcel.height,
          weight: options.parcel.weight,
          predefined_package: options.parcel.predefinedPackage,
        },
        customs_info: options.customsInfo ? this.mapToEasyPostCustoms(options.customsInfo) : undefined,
        reference: options.reference,
        options: {
          label_format: options.options?.labelFormat || 'PDF',
          label_size: options.options?.labelSize || '4x6',
          insurance: options.options?.insurance,
          delivery_confirmation: options.options?.signature,
          saturday_delivery: options.options?.saturdayDelivery,
          label_date: options.options?.labelDate,
        },
      });

      // Buy the shipment with specified rate or lowest rate
      let boughtShipment;
      if (options.rateId) {
        boughtShipment = await this.client!.Shipment.buy(shipment.id, options.rateId);
      } else if (options.carrier && options.service) {
        const rate = shipment.rates?.find(
          (r: any) => r.carrier === options.carrier && r.service === options.service,
        );
        if (!rate) {
          throw new Error(`No rate found for carrier ${options.carrier} and service ${options.service}`);
        }
        boughtShipment = await this.client!.Shipment.buy(shipment.id, rate.id);
      } else {
        const lowestRate = shipment.lowestRate();
        boughtShipment = await this.client!.Shipment.buy(shipment.id, lowestRate.id);
      }

      this.logger.log(`Label created: ${boughtShipment.tracking_code}`);

      return {
        trackingNumber: boughtShipment.tracking_code,
        labelUrl: boughtShipment.postage_label?.label_url,
        labelFormat: options.options?.labelFormat || 'PDF',
        labelSize: options.options?.labelSize || '4x6',
        commercialInvoiceUrl: boughtShipment.forms?.[0]?.form_url,
        postageLabel: boughtShipment.postage_label
          ? {
              labelUrl: boughtShipment.postage_label.label_url,
              labelFileType: boughtShipment.postage_label.label_file_type,
            }
          : undefined,
        shipmentId: boughtShipment.id, // EasyPost shipment ID for refunds
      } as any;
    } catch (error) {
      this.logger.error('Failed to create label via EasyPost', error);
      throw new Error(`EasyPost label creation failed: ${error.message}`);
    }
  }

  /**
   * Get tracking information
   */
  async getTracking(trackingNumber: string, carrier?: string): Promise<TrackingDetails> {
    this.ensureConfigured();

    try {
      this.logger.debug(`Fetching tracking for ${trackingNumber}`);

      const tracker = await this.client!.Tracker.create({
        tracking_code: trackingNumber,
        carrier: carrier,
      });

      return this.mapFromEasyPostTracker(tracker);
    } catch (error) {
      this.logger.error(`Failed to get tracking for ${trackingNumber}`, error);
      throw new Error(`EasyPost tracking retrieval failed: ${error.message}`);
    }
  }

  /**
   * Validate an address
   */
  async validateAddress(address: Address): Promise<AddressValidationResult> {
    this.ensureConfigured();

    try {
      this.logger.debug('Validating address via EasyPost');

      const verifiedAddress = await this.client!.Address.createAndVerify({
        street1: address.street1,
        street2: address.street2,
        city: address.city,
        state: address.state,
        zip: address.zip,
        country: address.country,
        company: address.company,
        name: address.firstName && address.lastName ? `${address.firstName} ${address.lastName}` : undefined,
        phone: address.phone,
        email: address.email,
      });

      const deliveryErrors = (verifiedAddress.verifications?.delivery?.errors as any) || [];
      const deliveryDetails = (verifiedAddress.verifications?.delivery?.details as any) || [];
      const valid = !deliveryErrors.length;
      const warnings = Array.isArray(deliveryDetails)
        ? deliveryDetails.map((d: any) => d.message)
        : [];

      return {
        valid,
        address: this.mapFromEasyPostAddress(verifiedAddress),
        messages: Array.isArray(deliveryErrors)
          ? deliveryErrors.map((e: any) => e.message)
          : [],
        warnings,
      };
    } catch (error) {
      this.logger.error('Failed to validate address via EasyPost', error);
      return {
        valid: false,
        address,
        messages: [error.message],
      };
    }
  }

  /**
   * Refund a shipment
   */
  async refundShipment(shipmentId: string): Promise<{ refunded: boolean; refundAmount?: number }> {
    this.ensureConfigured();

    try {
      this.logger.debug(`Refunding shipment ${shipmentId}`);

      const refund = await this.client!.Refund.create({ shipment: { id: shipmentId } });

      return {
        refunded: refund.status === 'submitted',
        refundAmount: parseFloat((refund as any).refund_amount || '0'),
      };
    } catch (error) {
      this.logger.error(`Failed to refund shipment ${shipmentId}`, error);
      throw new Error(`EasyPost refund failed: ${error.message}`);
    }
  }

  /**
   * Map internal address to EasyPost format
   */
  private mapToEasyPostAddress(address: Address): any {
    return {
      name: address.firstName && address.lastName ? `${address.firstName} ${address.lastName}` : undefined,
      company: address.company,
      street1: address.street1,
      street2: address.street2,
      city: address.city,
      state: address.state,
      zip: address.zip,
      country: address.country,
      phone: address.phone,
      email: address.email,
    };
  }

  /**
   * Map EasyPost address to internal format
   */
  private mapFromEasyPostAddress(easyPostAddress: any): Address {
    const nameParts = easyPostAddress.name?.split(' ') || [];
    return {
      firstName: nameParts[0],
      lastName: nameParts.slice(1).join(' '),
      company: easyPostAddress.company,
      street1: easyPostAddress.street1,
      street2: easyPostAddress.street2,
      city: easyPostAddress.city,
      state: easyPostAddress.state,
      zip: easyPostAddress.zip,
      country: easyPostAddress.country,
      phone: easyPostAddress.phone,
      email: easyPostAddress.email,
    };
  }

  /**
   * Map EasyPost rate to internal format
   */
  private mapFromEasyPostRate(rate: any): ShippingRate {
    return {
      carrier: rate.carrier,
      service: rate.service,
      rate: parseFloat(rate.rate),
      currency: rate.currency,
      deliveryDays: rate.delivery_days,
      deliveryDate: rate.delivery_date ? new Date(rate.delivery_date) : undefined,
      deliveryDateGuaranteed: rate.delivery_date_guaranteed,
      rateId: rate.id,
    };
  }

  /**
   * Map customs info to EasyPost format
   */
  private mapToEasyPostCustoms(customsInfo: any): any {
    return {
      contents_type: customsInfo.contentsType,
      contents_explanation: customsInfo.contentsExplanation,
      customs_certify: customsInfo.customsCertify,
      customs_signer: customsInfo.customsSigner,
      non_delivery_option: customsInfo.nonDeliveryOption,
      restriction_type: customsInfo.restrictionType,
      eel_pfc: customsInfo.eelPfc,
      customs_items: customsInfo.customsItems.map((item: any) => ({
        description: item.description,
        quantity: item.quantity,
        value: item.value,
        weight: item.weight,
        hs_tariff_number: item.hsCode,
        origin_country: item.originCountry,
      })),
    };
  }

  /**
   * Map EasyPost tracker to internal format
   */
  private mapFromEasyPostTracker(tracker: any): TrackingDetails {
    const statusMap: Record<string, TrackingDetails['status']> = {
      pre_transit: 'pre_transit',
      in_transit: 'in_transit',
      out_for_delivery: 'out_for_delivery',
      delivered: 'delivered',
      available_for_pickup: 'available_for_pickup',
      return_to_sender: 'return_to_sender',
      failure: 'failure',
      cancelled: 'cancelled',
      error: 'error',
    };

    return {
      trackingNumber: tracker.tracking_code,
      carrier: tracker.carrier,
      status: statusMap[tracker.status] || 'unknown',
      statusDetail: tracker.status_detail,
      estimatedDelivery: tracker.est_delivery_date ? new Date(tracker.est_delivery_date) : undefined,
      signedBy: tracker.signed_by,
      weight: tracker.weight,
      trackingEvents:
        tracker.tracking_details?.map((event: any) => this.mapFromEasyPostTrackingEvent(event)) || [],
      publicUrl: tracker.public_url,
    };
  }

  /**
   * Map EasyPost tracking event to internal format
   */
  private mapFromEasyPostTrackingEvent(event: any): TrackingEvent {
    return {
      status: event.status,
      statusDetail: event.status_detail,
      description: event.message,
      location: event.tracking_location
        ? {
            city: event.tracking_location.city,
            state: event.tracking_location.state,
            country: event.tracking_location.country,
            zip: event.tracking_location.zip,
          }
        : undefined,
      datetime: new Date(event.datetime),
    };
  }
}
