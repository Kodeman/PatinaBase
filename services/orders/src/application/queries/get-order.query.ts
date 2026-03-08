/**
 * Get Order Query
 *
 * Query for retrieving a single order.
 */

export interface GetOrderByIdQuery {
  orderId: string;
}

export interface GetOrderByOrderNumberQuery {
  orderNumber: string;
}
