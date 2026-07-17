import type {
  FulfillmentQueueRow,
  FulfillmentOrderDetailDTO,
  FulfillmentComposerDTO,
} from '@patina/fulfillment';

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

  // ─── Order Workbench (S2) ──────────────────────────────────────────────────

  /** The single Workbench round-trip: order + lines + PO drafts + vendor
   *  directory + config numbers (spec §5.2). */
  async getOrder(orderId: string): Promise<FulfillmentOrderDetailDTO> {
    return request<FulfillmentOrderDetailDTO>(
      `/api/admin/fulfillment/orders/${orderId}`,
    );
  },

  /** Assign (or reassign) a line's vendor + unit cost — clears an Unmapped
   *  line and persists a pre-confirm drag between proposed vendor groups. */
  async assignLine(
    lineId: string,
    payload: { vendorId: string; unitCostCents: number },
  ): Promise<{ ok: true }> {
    return request(`/api/admin/fulfillment/lines/${lineId}/assign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Move a line's PO line into a different real PO (post-confirm reshuffle). */
  async moveLine(
    orderId: string,
    payload: { itemId: string; poId: string },
  ): Promise<{ ok: true }> {
    return request(`/api/admin/fulfillment/orders/${orderId}/move-line`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /** Confirm the split into real POs — the server RAISES (→ 400 with reason) if
   *  any line is still unmapped. Returns { pos: <count> }. */
  async confirmSplit(orderId: string): Promise<{ pos: number }> {
    return request(`/api/admin/fulfillment/orders/${orderId}/confirm-split`, {
      method: 'POST',
    });
  },

  // ── S3: composer/transmission ──────────────────────────────────────────────
  // Do NOT reorder the entries above; S4 appends its own section below this one.

  /** The PO Composer's one round-trip: PO + lines + vendor protocol + the
   *  append-only transmission log (spec §5.3). */
  async getComposer(poId: string): Promise<FulfillmentComposerDTO> {
    return request<FulfillmentComposerDTO>(`/api/admin/fulfillment/pos/${poId}`);
  },

  /** URL of the PO preview PDF (the fn's `preview` mode, proxied). The composer
   *  fetches this into a Blob for the <object> preview / "Open PDF" link. */
  previewUrl(poId: string): string {
    return `/api/admin/fulfillment/pos/${poId}/preview`;
  },

  /** Fetch the preview PDF as a Blob (for an <object type="application/pdf">). */
  async previewBlob(poId: string): Promise<Blob> {
    const res = await fetch(this.previewUrl(poId));
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Preview failed: ${res.status}`);
    }
    return res.blob();
  },

  /** Email transmit — the fn sends from orders@ + logs po.transmitted. */
  async send(poId: string): Promise<{ ok: true; method: string; reference: string | null }> {
    return request(`/api/admin/fulfillment/pos/${poId}/transmit`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'send' }),
    });
  },

  /** Portal/CSV transmit — archives the PDF + logs po.transmitted with the
   *  operator-entered method + reference; no email. */
  async markTransmitted(
    poId: string,
    payload: { method: 'portal' | 'csv'; reference?: string },
  ): Promise<{ ok: true; method: string; reference: string | null }> {
    return request(`/api/admin/fulfillment/pos/${poId}/transmit`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'mark_transmitted', ...payload }),
    });
  },

  /** Download URL for the vendor CSV (built to csv_column_spec). */
  csvUrl(poId: string): string {
    return `/api/admin/fulfillment/pos/${poId}/csv`;
  },

  /** Record a vendor ack — re-dates the committed ship (client ETA) + drafts the
   *  client ETA-change note (spec §5.3). */
  async ack(
    poId: string,
    payload: { committedShip: string; ackMethod?: string; ackRef?: string },
  ): Promise<{ ok: true; committedShip: string; noteId: string | null }> {
    return request(`/api/admin/fulfillment/pos/${poId}/ack`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

export type { FulfillmentQueueRow, FulfillmentOrderDetailDTO, FulfillmentComposerDTO };
