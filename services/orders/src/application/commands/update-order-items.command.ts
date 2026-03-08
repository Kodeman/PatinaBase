/**
 * Update Order Items Command
 *
 * Command for updating order items.
 */

export interface UpdateOrderItemQuantityCommand {
  orderId: string;
  itemId: string;
  newQuantity: number;
}

export interface RemoveOrderItemCommand {
  orderId: string;
  itemId: string;
}
