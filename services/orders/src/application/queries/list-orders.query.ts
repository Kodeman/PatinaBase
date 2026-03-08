/**
 * List Orders Query
 *
 * Query for retrieving a list of orders with filters.
 */

import { OrderStatusValue } from '../../domain/value-objects/order-status.vo';
import { PaymentStatusValue } from '../../domain/value-objects/payment-status.vo';
import { FulfillmentStatusValue } from '../../domain/value-objects/fulfillment-status.vo';

export interface ListOrdersQuery {
  userId?: string;
  status?: OrderStatusValue;
  paymentStatus?: PaymentStatusValue;
  fulfillmentStatus?: FulfillmentStatusValue;
  fromDate?: Date;
  toDate?: Date;
  skip?: number;
  take?: number;
  orderBy?: 'createdAt' | 'updatedAt' | 'total';
  orderDirection?: 'asc' | 'desc';
}
