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

    const response = await fetch(`/api/admin/orders?${searchParams.toString()}`);
    return response.json();
  },

  async getOrder(orderId: string): Promise<ApiResponse<Order>> {
    const response = await fetch(`/api/admin/orders/${orderId}`);
    return response.json();
  },

  async updateOrder(orderId: string, data: Partial<Order>): Promise<ApiResponse<Order>> {
    const response = await fetch(`/api/admin/orders/${orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async createRefund(
    orderId: string,
    data: {
      amount: number;
      reason?: string;
    }
  ): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/orders/${orderId}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async createShipment(
    orderId: string,
    data: {
      carrier?: string;
      trackingNumber?: string;
    }
  ): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/orders/${orderId}/shipments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async updateShipment(
    shipmentId: string,
    data: {
      status?: string;
      carrier?: string;
      trackingNumber?: string;
    }
  ): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/shipments/${shipmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return response.json();
  },

  async cancelOrder(orderId: string, reason?: string): Promise<ApiResponse<void>> {
    const response = await fetch(`/api/admin/orders/${orderId}/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    return response.json();
  },
};
