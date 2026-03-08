/**
 * Hooks for order and cart management
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ordersApi } from '@/lib/api-client';

// Orders
interface OrderFilters {
  userId?: string;
  status?: string;
  paymentStatus?: string;
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}

export function useOrders(filters?: OrderFilters) {
  return useQuery({
    queryKey: ['orders', 'list', filters],
    queryFn: () => ordersApi.getOrders(filters),
  });
}

export function useOrder(id: string | null) {
  return useQuery({
    queryKey: id ? ['orders', id] : ['orders', 'null'],
    queryFn: () => {
      if (!id) throw new Error('Order ID required');
      return ordersApi.getOrder(id);
    },
    enabled: !!id,
  });
}

export function useOrderByNumber(orderNumber: string | null) {
  return useQuery({
    queryKey: orderNumber ? ['orders', 'number', orderNumber] : ['orders', 'number', 'null'],
    queryFn: () => {
      if (!orderNumber) throw new Error('Order number required');
      return ordersApi.getOrderByNumber(orderNumber);
    },
    enabled: !!orderNumber,
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status, actor }: { id: string; status: string; actor?: string }) =>
      ordersApi.updateOrderStatus(id, status, actor),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['orders', 'list'] });
    },
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, reason, actor }: { id: string; reason?: string; actor?: string }) =>
      ordersApi.cancelOrder(id, reason, actor),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['orders', 'list'] });
    },
  });
}

// Fulfillment
export function useFulfillments(orderId: string | null) {
  return useQuery({
    queryKey: orderId ? ['orders', orderId, 'fulfillments'] : ['orders', 'null', 'fulfillments'],
    queryFn: () => {
      if (!orderId) throw new Error('Order ID required');
      return ordersApi.getFulfillments(orderId);
    },
    enabled: !!orderId,
  });
}

export function useCreateFulfillment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      data,
    }: {
      orderId: string;
      data: {
        items: Array<{ orderItemId: string; quantity: number }>;
        trackingNumber?: string;
        carrier?: string;
      };
    }) => ordersApi.createFulfillment(orderId, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['orders', variables.orderId] });
      queryClient.invalidateQueries({ queryKey: ['orders', variables.orderId, 'fulfillments'] });
    },
  });
}

// Cart
export function useCart(cartId: string | null) {
  return useQuery({
    queryKey: cartId ? ['carts', cartId] : ['carts', 'null'],
    queryFn: () => {
      if (!cartId) throw new Error('Cart ID required');
      return ordersApi.getCart(cartId);
    },
    enabled: !!cartId,
  });
}

export function useActiveCart(userId: string | null) {
  return useQuery({
    queryKey: userId ? ['carts', 'active', userId] : ['carts', 'active', 'null'],
    queryFn: () => {
      if (!userId) throw new Error('User ID required');
      return ordersApi.getActiveCart(userId);
    },
    enabled: !!userId,
    staleTime: 1000 * 30, // 30 seconds - cart should be relatively fresh
  });
}

export function useCreateCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { userId: string; metadata?: Record<string, unknown> }) =>
      ordersApi.createCart(data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['carts', 'active', variables.userId] });
    },
  });
}

export function useAddCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      cartId,
      item,
    }: {
      cartId: string;
      item: {
        productId: string;
        variantId?: string;
        quantity: number;
        metadata?: Record<string, unknown>;
      };
    }) => ordersApi.addCartItem(cartId, item),
    // Optimistic update
    onMutate: async ({ cartId, item }) => {
      await queryClient.cancelQueries({ queryKey: ['carts', cartId] });
      const previousCart = queryClient.getQueryData(['carts', cartId]);

      queryClient.setQueryData(['carts', cartId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          items: [...(old.items || []), { ...item, id: `temp-${Date.now()}` }],
        };
      });

      return { previousCart };
    },
    onError: (_err, { cartId }, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['carts', cartId], context.previousCart);
      }
    },
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['carts', cartId] });
    },
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      cartId,
      itemId,
      quantity,
    }: {
      cartId: string;
      itemId: string;
      quantity: number;
    }) => ordersApi.updateCartItem(cartId, itemId, { quantity }),
    // Optimistic update
    onMutate: async ({ cartId, itemId, quantity }) => {
      await queryClient.cancelQueries({ queryKey: ['carts', cartId] });
      const previousCart = queryClient.getQueryData(['carts', cartId]);

      queryClient.setQueryData(['carts', cartId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((item: any) =>
            item.id === itemId ? { ...item, quantity } : item
          ),
        };
      });

      return { previousCart };
    },
    onError: (_err, { cartId }, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['carts', cartId], context.previousCart);
      }
    },
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['carts', cartId] });
    },
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cartId, itemId }: { cartId: string; itemId: string }) =>
      ordersApi.removeCartItem(cartId, itemId),
    // Optimistic update
    onMutate: async ({ cartId, itemId }) => {
      await queryClient.cancelQueries({ queryKey: ['carts', cartId] });
      const previousCart = queryClient.getQueryData(['carts', cartId]);

      queryClient.setQueryData(['carts', cartId], (old: any) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.filter((item: any) => item.id !== itemId),
        };
      });

      return { previousCart };
    },
    onError: (_err, { cartId }, context) => {
      if (context?.previousCart) {
        queryClient.setQueryData(['carts', cartId], context.previousCart);
      }
    },
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['carts', cartId] });
    },
  });
}

export function useApplyDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ cartId, code }: { cartId: string; code: string }) =>
      ordersApi.applyDiscount(cartId, code),
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['carts', cartId] });
    },
  });
}

export function useRemoveDiscount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cartId: string) => ordersApi.removeDiscount(cartId),
    onSuccess: (_, cartId) => {
      queryClient.invalidateQueries({ queryKey: ['carts', cartId] });
    },
  });
}

export function useClearCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cartId: string) => ordersApi.clearCart(cartId),
    onSuccess: (_, cartId) => {
      queryClient.invalidateQueries({ queryKey: ['carts', cartId] });
    },
  });
}

export function useDeleteCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (cartId: string) => ordersApi.deleteCart(cartId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['carts'] });
    },
  });
}

// Checkout
export function useCheckout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      cartId,
      data,
    }: {
      cartId: string;
      data: {
        shippingAddress: Record<string, unknown>;
        billingAddress?: Record<string, unknown>;
        paymentMethodId: string;
        metadata?: Record<string, unknown>;
      };
    }) => ordersApi.checkout(cartId, data),
    onSuccess: (_, { cartId }) => {
      queryClient.invalidateQueries({ queryKey: ['carts', cartId] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// Payments
export function useCreatePaymentIntent() {
  return useMutation({
    mutationFn: ({
      orderId,
      data,
    }: {
      orderId: string;
      data: {
        amount: number;
        currency: string;
        paymentMethodId: string;
      };
    }) => ordersApi.createPaymentIntent(orderId, data),
  });
}

export function useConfirmPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (paymentIntentId: string) => ordersApi.confirmPayment(paymentIntentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}
