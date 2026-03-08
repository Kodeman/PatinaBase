import { apiClient } from '@/lib/api-client';
const api = apiClient as any;
import type { Order, PaginatedResponse, ApiResponse } from '@/types';

export const ordersService = {
  async getOrders(params?: {
    userId?: string;
    status?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<ApiResponse<PaginatedResponse<Order>>> {
    const searchParams = new URLSearchParams();
    if (params?.userId) searchParams.append('userId', params.userId);
    if (params?.status) searchParams.append('status', params.status);
    if (params?.from) searchParams.append('from', params.from);
    if (params?.to) searchParams.append('to', params.to);
    if (params?.page) searchParams.append('page', params.page.toString());
    if (params?.pageSize) searchParams.append('pageSize', params.pageSize.toString());

    return api.get(`/v1/orders?${searchParams.toString()}`);
  },

  async getOrder(orderId: string): Promise<ApiResponse<Order>> {
    return api.get(`/v1/orders/${orderId}`);
  },

  async updateOrder(orderId: string, data: Partial<Order>): Promise<ApiResponse<Order>> {
    return api.patch(`/v1/orders/${orderId}`, data);
  },

  async createRefund(
    orderId: string,
    data: {
      amount: number;
      reason?: string;
    }
  ): Promise<ApiResponse<void>> {
    return api.post(`/v1/orders/${orderId}/refunds`, data);
  },

  async createShipment(
    orderId: string,
    data: {
      carrier?: string;
      trackingNumber?: string;
    }
  ): Promise<ApiResponse<void>> {
    return api.post(`/v1/orders/${orderId}/shipments`, data);
  },

  async updateShipment(
    shipmentId: string,
    data: {
      status?: string;
      carrier?: string;
      trackingNumber?: string;
    }
  ): Promise<ApiResponse<void>> {
    return api.patch(`/v1/shipments/${shipmentId}`, data);
  },

  async cancelOrder(orderId: string, reason?: string): Promise<ApiResponse<void>> {
    return api.post(`/v1/orders/${orderId}/cancel`, { reason });
  },
};
