/**
 * Update Order Status Command
 *
 * Command for transitioning order status.
 */

import { OrderStatusValue } from '../../domain/value-objects/order-status.vo';

export interface UpdateOrderStatusCommand {
  orderId: string;
  newStatus: OrderStatusValue;
  actorId?: string;
  reason?: string;
}
