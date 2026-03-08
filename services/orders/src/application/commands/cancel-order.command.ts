/**
 * Cancel Order Command
 *
 * Command for canceling an order.
 */

export interface CancelOrderCommand {
  orderId: string;
  reason?: string;
  actorId?: string;
}
