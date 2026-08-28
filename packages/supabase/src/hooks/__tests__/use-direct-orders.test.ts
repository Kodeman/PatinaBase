import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks — mirrors the use-invoices / use-procurement rig (repo gotcha:
// `jest.mock('@patina/supabase')` no-ops under paths+SWC; mock the concrete
// `@supabase/ssr` module that `createBrowserClient()` actually calls).
// ─────────────────────────────────────────────────────────────────────────────

const supabaseClient = {
  auth: { getUser: vi.fn(), getSession: vi.fn() },
  from: vi.fn(),
  rpc: vi.fn(),
  functions: { invoke: vi.fn() },
};

vi.mock('@supabase/ssr', () => ({
  createBrowserClient: () => supabaseClient,
}));

const invalidateQueries = vi.fn();
vi.mock('@tanstack/react-query', () => ({
  useQuery: (config: unknown) => config,
  useMutation: (config: unknown) => config,
  useQueryClient: () => ({ invalidateQueries }),
}));

// Import AFTER mocks.
import { useDirectOrders, useCreateDirectOrder, useStartDirectOrderCheckout } from '../use-direct-orders';

beforeEach(() => {
  vi.clearAllMocks();
});

// ─────────────────────────────────────────────────────────────────────────────
// useDirectOrders — client's own rows (RLS scopes to client_id = auth.uid(),
// migration 00267), newest first.
// ─────────────────────────────────────────────────────────────────────────────

describe('useDirectOrders', () => {
  interface ListConfig {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
  }

  it('uses the ["direct-orders"] query key', () => {
    const config = useDirectOrders() as unknown as ListConfig;
    expect(config.queryKey).toEqual(['direct-orders']);
  });

  it('selects from direct_orders ordered by created_at desc', async () => {
    const orderMock = vi.fn().mockResolvedValue({
      data: [{ id: 'order-1' }, { id: 'order-2' }],
      error: null,
    });
    const selectMock = vi.fn(() => ({ order: orderMock }));
    supabaseClient.from.mockReturnValue({ select: selectMock });

    const config = useDirectOrders() as unknown as ListConfig;
    const rows = await config.queryFn();

    expect(supabaseClient.from).toHaveBeenCalledWith('direct_orders');
    // Named columns, never '*': 00540 narrowed `authenticated`'s grant off
    // commission_rate, so a star select would 42501 for the buyer.
    const selectArg = String((selectMock.mock.calls as unknown as unknown[][])[0]?.[0]);
    expect(selectArg).not.toContain('*');
    expect(selectArg).not.toContain('commission_rate');
    expect(selectArg).toContain('amount_cents');
    expect(selectArg).toContain('designer_id');
    expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(rows).toEqual([{ id: 'order-1' }, { id: 'order-2' }]);
  });

  it('returns an empty array for null data', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: null, error: null });
    supabaseClient.from.mockReturnValue({ select: vi.fn(() => ({ order: orderMock })) });

    const config = useDirectOrders() as unknown as ListConfig;
    await expect(config.queryFn()).resolves.toEqual([]);
  });

  it('throws when the query errors', async () => {
    const orderMock = vi.fn().mockResolvedValue({ data: null, error: new Error('RLS denied') });
    supabaseClient.from.mockReturnValue({ select: vi.fn(() => ({ order: orderMock })) });

    const config = useDirectOrders() as unknown as ListConfig;
    await expect(config.queryFn()).rejects.toThrow('RLS denied');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useCreateDirectOrder — mints a pending_payment row via the
// create_direct_order RPC (00267, SECURITY DEFINER).
// ─────────────────────────────────────────────────────────────────────────────

describe('useCreateDirectOrder', () => {
  it('calls create_direct_order with p_product_id and p_quantity, defaulting quantity to 1', async () => {
    const createdOrder = {
      id: 'order-new',
      client_id: 'client-1',
      product_id: 'prod-1',
      product_name: 'Aged Oak Console',
      quantity: 1,
      unit_price_cents: 120000,
      amount_cents: 120000,
      status: 'pending_payment',
    };
    supabaseClient.rpc.mockResolvedValue({ data: createdOrder, error: null });

    const config = useCreateDirectOrder() as unknown as {
      mutationFn: (input: { productId: string; quantity?: number }) => Promise<unknown>;
    };

    const result = await config.mutationFn({ productId: 'prod-1' });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('create_direct_order', {
      p_product_id: 'prod-1',
      p_quantity: 1,
    });
    expect(result).toEqual(createdOrder);
  });

  it('passes an explicit quantity through', async () => {
    supabaseClient.rpc.mockResolvedValue({ data: { id: 'order-2' }, error: null });

    const config = useCreateDirectOrder() as unknown as {
      mutationFn: (input: { productId: string; quantity?: number }) => Promise<unknown>;
    };
    await config.mutationFn({ productId: 'prod-1', quantity: 3 });

    expect(supabaseClient.rpc).toHaveBeenCalledWith('create_direct_order', {
      p_product_id: 'prod-1',
      p_quantity: 3,
    });
  });

  it('throws when the RPC errors (e.g. product not buyable)', async () => {
    supabaseClient.rpc.mockResolvedValue({
      data: null,
      error: new Error('create_direct_order: product prod-1 is not available for direct purchase'),
    });

    const config = useCreateDirectOrder() as unknown as {
      mutationFn: (input: { productId: string; quantity?: number }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ productId: 'prod-1' })).rejects.toThrow(
      'not available for direct purchase'
    );
  });

  it('onSuccess invalidates the direct-orders list', () => {
    const config = useCreateDirectOrder() as unknown as { onSuccess: () => void };
    config.onSuccess();
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: ['direct-orders'] });
  });

  it('omits meta when no errorSurface option is given (default global toast)', () => {
    const config = useCreateDirectOrder() as unknown as { meta: unknown };
    expect(config.meta).toBeUndefined();
  });

  it('sets meta.errorSurface = "inline" when requested', () => {
    const config = useCreateDirectOrder({ errorSurface: 'inline' }) as unknown as {
      meta: { errorSurface?: string };
    };
    expect(config.meta).toEqual({ errorSurface: 'inline' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// useStartDirectOrderCheckout — dispatches { direct_order_id } on the shared
// create-checkout-session edge function; mirrors useStartCheckout /
// useStartPoCheckout exactly for error-surfacing.
// ─────────────────────────────────────────────────────────────────────────────

describe('useStartDirectOrderCheckout', () => {
  it('invokes create-checkout-session with { direct_order_id } and resolves { url }', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: { url: 'https://checkout.stripe.com/session-abc' },
      error: null,
    });

    const config = useStartDirectOrderCheckout() as unknown as {
      mutationFn: (input: { directOrderId: string }) => Promise<{ url: string }>;
    };

    const result = await config.mutationFn({ directOrderId: 'order-1' });

    expect(supabaseClient.functions.invoke).toHaveBeenCalledWith('create-checkout-session', {
      body: { direct_order_id: 'order-1' },
    });
    expect(result).toEqual({ url: 'https://checkout.stripe.com/session-abc' });
  });

  it('omits meta when no errorSurface option is given (default global toast)', () => {
    const config = useStartDirectOrderCheckout() as unknown as { meta: unknown };
    expect(config.meta).toBeUndefined();
  });

  it('sets meta.errorSurface = "inline" when requested', () => {
    const config = useStartDirectOrderCheckout({ errorSurface: 'inline' }) as unknown as {
      meta: { errorSurface?: string };
    };
    expect(config.meta).toEqual({ errorSurface: 'inline' });
  });

  it('surfaces the edge function JSON detail over the generic error message (e.g. 409 already paid)', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: {
          json: async () => ({
            error: 'direct_order_already_paid',
            detail: 'This order has already been paid.',
          }),
        },
      },
    });

    const config = useStartDirectOrderCheckout() as unknown as {
      mutationFn: (input: { directOrderId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ directOrderId: 'order-paid' })).rejects.toThrow(
      'This order has already been paid.'
    );
  });

  it('falls back to the error code when the JSON body has no detail (e.g. 404 not found)', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: 'Edge Function returned a non-2xx status code',
        context: { json: async () => ({ error: 'direct_order_not_found' }) },
      },
    });

    const config = useStartDirectOrderCheckout() as unknown as {
      mutationFn: (input: { directOrderId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ directOrderId: 'order-missing' })).rejects.toThrow(
      'direct_order_not_found'
    );
  });

  it('falls back to the generic FunctionsHttpError message when the body cannot be parsed', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: null,
      error: { message: 'Failed to fetch', context: undefined },
    });

    const config = useStartDirectOrderCheckout() as unknown as {
      mutationFn: (input: { directOrderId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ directOrderId: 'order-x' })).rejects.toThrow('Failed to fetch');
  });

  it('throws data.detail ?? data.error when the function returns 200 with a soft error body', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({
      data: { error: 'direct_order_canceled', detail: 'This order was canceled and can no longer be paid.' },
      error: null,
    });

    const config = useStartDirectOrderCheckout() as unknown as {
      mutationFn: (input: { directOrderId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ directOrderId: 'order-canceled' })).rejects.toThrow(
      'This order was canceled and can no longer be paid.'
    );
  });

  it('throws when no url is returned', async () => {
    supabaseClient.functions.invoke.mockResolvedValue({ data: {}, error: null });

    const config = useStartDirectOrderCheckout() as unknown as {
      mutationFn: (input: { directOrderId: string }) => Promise<unknown>;
    };

    await expect(config.mutationFn({ directOrderId: 'order-1' })).rejects.toThrow(
      'No checkout URL returned'
    );
  });
});
