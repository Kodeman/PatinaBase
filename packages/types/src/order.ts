import { UUID, Timestamps, Address } from './common';

export type OrderStatus =
  | 'draft'
  | 'submitted'
  | 'confirmed'
  | 'in_production'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

export interface Order extends Timestamps {
  id: UUID;
  orderNumber: string;
  designerId: UUID;
  customerId: UUID;
  status: OrderStatus;
  items: OrderItem[];
  subtotal: number;
  tax: number;
  shipping: number;
  total: number;
  currency: string;
  shippingAddress: Address;
  billingAddress: Address;
  notes?: string;
}

export interface OrderItem {
  id: UUID;
  productId: UUID;
  productName: string;
  quantity: number;
  unitPrice: number;
  customizations?: Record<string, string>;
  total: number;
}
