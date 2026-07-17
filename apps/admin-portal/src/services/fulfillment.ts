import type { FulfillmentQueueRow } from '@patina/fulfillment';

// Back of House — the Fulfillment Queue's data layer (S1). Talks to
// /api/admin/fulfillment/queue, which is a service-role SELECT of
// `fulfillment_queue_v` (00353) — DTO passthrough, zero band/filter math on
// either side of the wire. See hooks/use-fulfillment-queue.ts for the React
// Query wiring and hooks/use-fulfillment-realtime.ts for the live-refresh
// subscription.

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return json.data as T;
}

export interface FulfillmentQueueResponse {
  rows: FulfillmentQueueRow[];
  total: number;
}

export const fulfillmentService = {
  /**
   * The full queue, every band, unfiltered — the caller renders every row the
   * API returns (spec §5.1 zero-invisibility invariant; no client-side band
   * math or filtering is permitted anywhere downstream of this call).
   */
  async listQueue(): Promise<FulfillmentQueueResponse> {
    return request<FulfillmentQueueResponse>('/api/admin/fulfillment/queue');
  },
};

export type { FulfillmentQueueRow };
