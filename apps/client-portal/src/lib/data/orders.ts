import 'server-only';

import { cookies } from 'next/headers';
import { cache } from 'react';

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

const ORDERS_URL = '/api/orders';

async function getBaseUrl(): Promise<string> {
  // In server components we still need an absolute URL for fetch.
  if (process.env.NEXT_PUBLIC_APP_URL) return process.env.NEXT_PUBLIC_APP_URL;
  return 'http://localhost:3002';
}

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

export const fetchClientOrders = cache(async (): Promise<ClientOrder[]> => {
  const baseUrl = await getBaseUrl();
  const cookieStore = await cookies();
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join('; ');

  try {
    const res = await fetch(`${baseUrl}${ORDERS_URL}`, {
      headers: cookieHeader ? { cookie: cookieHeader } : {},
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const payload = (await res.json()) as unknown;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = Array.isArray(payload)
      ? payload
      : // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ((payload as any)?.data ??
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (payload as any)?.orders ??
          []);

    return rows.map((row) => ({
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
    }));
  } catch {
    return [];
  }
});
