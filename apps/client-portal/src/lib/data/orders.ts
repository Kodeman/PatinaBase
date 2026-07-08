import 'server-only';

import { cache } from 'react';

import { getSession } from '@patina/supabase/server';

import { getServiceBindingFetcher } from './service-binding';

export type OrderStatus =
  | 'pending'
  | 'processing'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export interface ClientOrder {
  id: string;
  orderNumber: string | null;
  status: OrderStatus;
  totalCents: number;
  currency: string;
  createdAt: string;
  itemCount: number;
}

/**
 * Why the client's orders couldn't be loaded. Distinct from "the client has
 * zero orders" — see `ClientOrdersResult`.
 *
 *  - 'unauthorized' — no Supabase session, or the orders service rejected
 *    the token (expired/invalid at the moment of the call).
 *  - 'unreachable'  — the orders service returned a non-OK response, timed
 *    out, or the request failed outright (network/DNS/binding error).
 */
export type ClientOrdersError = 'unauthorized' | 'unreachable';

/**
 * Discriminated result so callers can tell a genuine empty state (`orders:
 * []`) apart from a backend that couldn't be reached (`error`). Render these
 * differently — see app/orders/page.tsx and OrdersErrorState.
 */
export type ClientOrdersResult =
  | { orders: ClientOrder[]; error?: undefined }
  | { orders?: undefined; error: ClientOrdersError };

// Same env var + path the /api/orders route handler proxies to (see
// app/api/orders/route.ts). Kept in sync deliberately rather than shared via
// import — that route also still needs its own copy for its own proxy call.
const ORDERS_SERVICE_URL = process.env.ORDERS_SERVICE_URL || 'http://localhost:3015';
const ORDERS_PATH = '/v1/orders';
const REQUEST_TIMEOUT_MS = 10_000;

function normalizeStatus(input: unknown): OrderStatus {
  const value = typeof input === 'string' ? input.toLowerCase() : 'pending';
  switch (value) {
    case 'paid':
    case 'processing':
    case 'shipped':
    case 'delivered':
    case 'cancelled':
    case 'refunded':
      return value as OrderStatus;
    default:
      return 'pending';
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeOrderRow(row: any): ClientOrder {
  return {
    id: String(row.id),
    orderNumber: row.orderNumber ?? row.order_number ?? null,
    status: normalizeStatus(row.status),
    totalCents:
      typeof row.totalCents === 'number'
        ? row.totalCents
        : typeof row.total_cents === 'number'
          ? row.total_cents
          : Math.round(Number(row.total ?? 0) * 100),
    currency: row.currency ?? 'USD',
    createdAt: row.createdAt ?? row.created_at ?? new Date().toISOString(),
    itemCount: Array.isArray(row.items)
      ? row.items.length
      : typeof row.itemCount === 'number'
        ? row.itemCount
        : 0,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractRows(payload: unknown): any[] {
  if (Array.isArray(payload)) return payload;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const record = payload as any;
  return record?.data ?? record?.orders ?? [];
}

/**
 * Fetch the signed-in client's orders directly from the orders service —
 * server-side, no self-HTTP round trip through `/api/orders` and
 * `NEXT_PUBLIC_APP_URL`. Uses the same backend + path the `/api/orders`
 * route handler proxies to (`ORDERS_SERVICE_URL` + `/v1/orders`); on
 * Cloudflare Workers this rides the `SVC_ORDERS` service binding (see
 * `service-binding.ts`), falling back to a plain fetch against the public
 * service URL everywhere else (local dev, tests).
 *
 * Returns a discriminated result instead of throwing or silently returning
 * `[]` on failure: an unreachable/unauthorized backend is a distinct,
 * expected condition from "this client genuinely has zero orders" and the
 * two must render differently (an outage is not "you have no orders").
 */
export const fetchClientOrders = cache(async (): Promise<ClientOrdersResult> => {
  const session = await getSession();
  const token = session?.access_token;
  if (!token) return { error: 'unauthorized' };

  const fetcher = await getServiceBindingFetcher('SVC_ORDERS');
  const url = `${ORDERS_SERVICE_URL.replace(/\/$/, '')}${ORDERS_PATH}`;

  let res: Response;
  try {
    res = await (fetcher ?? fetch)(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    console.warn('[Client Portal] Orders fetch failed — service unreachable', error);
    return { error: 'unreachable' };
  }

  if (res.status === 401 || res.status === 403) return { error: 'unauthorized' };
  if (!res.ok) {
    console.warn(`[Client Portal] Orders fetch failed — ${res.status} ${res.statusText}`);
    return { error: 'unreachable' };
  }

  try {
    const payload: unknown = await res.json();
    const rows = extractRows(payload);
    return { orders: rows.map(normalizeOrderRow) };
  } catch (error) {
    console.warn('[Client Portal] Orders response was not valid JSON', error);
    return { error: 'unreachable' };
  }
});
