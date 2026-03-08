/**
 * Orders API Client
 * Handles orders, carts, checkout, payments, and fulfillment operations
 */

import { BaseApiClient } from '../base-client';
import { ApiClientConfig } from '../types';

export class OrdersApiClient extends BaseApiClient {
  constructor(config: ApiClientConfig) {
    super(config);
  }

  // ==================== Orders ====================

  async getOrders(params?: {
    userId?: string;
    status?: string;
    paymentStatus?: string;
    from?: string;
    to?: string;
    skip?: number;
    take?: number;
  }) {
    return this.get('/orders', { params });
  }

  async getOrder(id: string) {
    return this.get(`/orders/${id}`);
  }

  async getOrderByNumber(orderNumber: string) {
    return this.get(`/orders/number/${orderNumber}`);
  }

  async updateOrderStatus(id: string, status: string, actor?: string) {
    return this.patch(`/orders/${id}/status`, { status, actor });
  }

  async cancelOrder(id: string, reason?: string, actor?: string) {
    return this.post(`/orders/${id}/cancel`, { reason, actor });
  }

  // ==================== Carts ====================

  async createCart(data: { userId: string; metadata?: Record<string, unknown> }) {
    return this.post('/carts', data);
  }

  async getCart(id: string) {
    return this.get(`/carts/${id}`);
  }

  async getActiveCart(userId: string) {
    return this.get(`/carts/user/${userId}/active`);
  }

  async addCartItem(
    cartId: string,
    item: {
      productId: string;
      variantId?: string;
      quantity: number;
      metadata?: Record<string, unknown>;
    }
  ) {
    return this.post(`/carts/${cartId}/items`, item);
  }

  async updateCartItem(cartId: string, itemId: string, data: { quantity: number }) {
    return this.patch(`/carts/${cartId}/items/${itemId}`, data);
  }

  async removeCartItem(cartId: string, itemId: string) {
    return this.delete(`/carts/${cartId}/items/${itemId}`);
  }

  async applyDiscount(cartId: string, code: string) {
    return this.post(`/carts/${cartId}/apply-discount`, { code });
  }

  async removeDiscount(cartId: string) {
    return this.delete(`/carts/${cartId}/discount`);
  }

  async clearCart(cartId: string) {
    return this.delete(`/carts/${cartId}/clear`);
  }

  async deleteCart(cartId: string) {
    return this.delete(`/carts/${cartId}`);
  }

  // ==================== Checkout ====================

  async checkout(
    cartId: string,
    data: {
      shippingAddress: Record<string, unknown>;
      billingAddress?: Record<string, unknown>;
      paymentMethodId: string;
      metadata?: Record<string, unknown>;
    }
  ) {
    return this.post('/checkout', { cartId, ...data });
  }

  // ==================== Payments ====================

  async createPaymentIntent(
    orderId: string,
    data: {
      amount: number;
      currency: string;
      paymentMethodId: string;
    }
  ) {
    return this.post('/payments/intent', { orderId, ...data });
  }

  async confirmPayment(paymentIntentId: string) {
    return this.post(`/payments/${paymentIntentId}/confirm`);
  }

  // ==================== Fulfillment ====================

  async getFulfillments(orderId: string) {
    return this.get(`/orders/${orderId}/fulfillments`);
  }

  async createFulfillment(
    orderId: string,
    data: {
      items: Array<{ orderItemId: string; quantity: number }>;
      trackingNumber?: string;
      carrier?: string;
    }
  ) {
    return this.post(`/orders/${orderId}/fulfillments`, data);
  }
}
