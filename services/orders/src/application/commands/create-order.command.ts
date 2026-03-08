/**
 * Create Order Command
 *
 * Command for creating a new order.
 */

import { AddressComponents } from '@patina/types';

export interface CreateOrderItemCommand {
  productId: string;
  variantId?: string;
  name: string;
  sku?: string;
  quantity: number;
  unitPrice: number;
  currency?: string;
  taxAmount?: number;
  discountAmount?: number;
  snapshot?: any;
  metadata?: Record<string, any>;
}

export interface CreateOrderCommand {
  userId: string;
  cartId?: string;
  currency?: string;
  shippingAddress: AddressComponents;
  billingAddress?: AddressComponents;
  shippingMethod?: string;
  customerNotes?: string;
  items: CreateOrderItemCommand[];
  metadata?: Record<string, any>;
}
