/**
 * Carrier Integration Interface
 *
 * Abstract interface for shipping carrier integrations.
 * Supports EasyPost, ShipStation, and custom implementations.
 */

export interface Address {
  firstName?: string;
  lastName?: string;
  company?: string;
  street1: string;
  street2?: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface Parcel {
  length: number;
  width: number;
  height: number;
  weight: number;
  predefinedPackage?: string; // 'USPSMEDIUMFLATRATEBOX', etc.
}

export interface CustomsItem {
  description: string;
  quantity: number;
  value: number;
  weight: number;
  hsCode?: string;
  originCountry: string;
}

export interface CustomsInfo {
  contentsType: 'merchandise' | 'returned_goods' | 'documents' | 'gift' | 'sample';
  contentsExplanation?: string;
  customsCertify: boolean;
  customsSigner: string;
  nonDeliveryOption: 'return' | 'abandon';
  restrictionType?: 'none' | 'other' | 'quarantine' | 'sanitary_phytosanitary_inspection';
  eelPfc?: string;
  customsItems: CustomsItem[];
}

export interface ShippingRate {
  carrier: string;
  service: string;
  rate: number;
  currency: string;
  deliveryDays?: number;
  deliveryDate?: Date;
  deliveryDateGuaranteed?: boolean;
  rateId: string; // Carrier-specific rate ID
}

export interface ShipmentLabel {
  trackingNumber: string;
  labelUrl: string;
  labelFormat: 'PDF' | 'PNG' | 'ZPL';
  labelSize: string;
  commercialInvoiceUrl?: string;
  postageLabel?: {
    labelUrl: string;
    labelFileType: string;
  };
}

export interface TrackingEvent {
  status: string;
  statusDetail?: string;
  description?: string;
  location?: {
    city?: string;
    state?: string;
    country?: string;
    zip?: string;
  };
  datetime: Date;
}

export interface TrackingDetails {
  trackingNumber: string;
  carrier: string;
  status: 'pre_transit' | 'in_transit' | 'out_for_delivery' | 'delivered' | 'available_for_pickup' | 'return_to_sender' | 'failure' | 'cancelled' | 'error' | 'unknown';
  statusDetail?: string;
  estimatedDelivery?: Date;
  signedBy?: string;
  weight?: number;
  trackingEvents: TrackingEvent[];
  publicUrl?: string;
}

export interface AddressValidationResult {
  valid: boolean;
  address: Address;
  messages?: string[];
  warnings?: string[];
}

export interface CreateShipmentOptions {
  fromAddress: Address;
  toAddress: Address;
  parcel: Parcel;
  carrier?: string;
  service?: string;
  rateId?: string; // Use pre-purchased rate
  customsInfo?: CustomsInfo;
  reference?: string;
  options?: {
    labelFormat?: 'PDF' | 'PNG' | 'ZPL';
    labelSize?: '4x6' | '4x8';
    insurance?: number;
    signature?: 'STANDARD' | 'ADULT';
    saturdayDelivery?: boolean;
    labelDate?: Date;
  };
}

/**
 * Abstract Carrier Interface
 */
export interface ICarrier {
  /**
   * Get shipping rates for a shipment
   */
  getRates(options: CreateShipmentOptions): Promise<ShippingRate[]>;

  /**
   * Purchase a shipping label
   */
  createLabel(options: CreateShipmentOptions): Promise<ShipmentLabel>;

  /**
   * Get tracking information
   */
  getTracking(trackingNumber: string, carrier?: string): Promise<TrackingDetails>;

  /**
   * Validate an address
   */
  validateAddress(address: Address): Promise<AddressValidationResult>;

  /**
   * Refund a shipment (if eligible)
   */
  refundShipment(shipmentId: string): Promise<{ refunded: boolean; refundAmount?: number }>;

  /**
   * Get carrier name
   */
  getName(): string;
}

/**
 * Webhook event types from carriers
 */
export enum WebhookEventType {
  TRACKER_CREATED = 'tracker.created',
  TRACKER_UPDATED = 'tracker.updated',
  BATCH_CREATED = 'batch.created',
  BATCH_UPDATED = 'batch.updated',
  INSURANCE_CREATED = 'insurance.created',
  INSURANCE_CANCELLED = 'insurance.cancelled',
  REFUND_SUCCESSFUL = 'refund.successful',
}

export interface WebhookPayload {
  id: string;
  mode: 'test' | 'production';
  description: string;
  result: any;
  createdAt: Date;
  updatedAt: Date;
}
