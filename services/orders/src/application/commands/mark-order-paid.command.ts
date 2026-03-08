/**
 * Mark Order Paid Command
 *
 * Command for marking an order as paid.
 */

export interface MarkOrderPaidCommand {
  orderId: string;
  paymentIntentId?: string;
  customerId?: string;
}
