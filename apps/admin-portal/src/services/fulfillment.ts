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

// ── S4: notifications/directory/config ──────────────────────────────────────
// Notification dispatcher (spec §6), vendor directory + scorecards (spec §7),
// config editor (spec §10). Routes: /api/admin/fulfillment/notifications/*,
// /vendors/*, /config/* — see hooks/use-fulfillment-notifications.ts,
// use-fulfillment-vendors.ts, use-fulfillment-config.ts for the React Query
// wiring.
import type {
  FulfillmentClientNotificationDTO,
  FulfillmentConfigRow,
  VendorDirectoryRow,
  VendorProfileDTO,
  VendorScorecard,
} from '@patina/fulfillment';

export interface DraftNoteInput {
  orderId: string;
  transition: string;
}

export interface DraftNoteResult {
  note_id: string;
  order_id: string;
  transition: string;
  template_key: string;
  subject: string;
  drafted_body: string;
}

export interface NotifyChannelResult {
  success?: boolean;
  id?: string;
  error?: string;
  sent?: number;
  skipped?: string;
  skipped_reason: string | null;
}

export interface SendNoteResult {
  notification_id: string;
  transition: string;
  email: NotifyChannelResult;
  push: NotifyChannelResult;
  edited: boolean;
}

export const fulfillmentNotifyService = {
  /** Renders + persists a drafted client note for the given transition (spec §6). */
  async draftNote(input: DraftNoteInput): Promise<DraftNoteResult> {
    return request<DraftNoteResult>('/api/admin/fulfillment/notifications/draft', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** Sends the drafted (or operator-edited) note — email + a best-effort push
   *  sibling, dispatched together server-side. `editedBody` omitted or
   *  byte/whitespace-identical to the draft sends the fast (unedited) path. */
  async sendNote(notificationId: string, editedBody?: string): Promise<SendNoteResult> {
    return request<SendNoteResult>(`/api/admin/fulfillment/notifications/${notificationId}/send`, {
      method: 'POST',
      body: JSON.stringify(editedBody != null ? { editedBody } : {}),
    });
  },

  /** History for the note drawer — every channel's row for an order, newest first. */
  async listNotifications(orderId: string): Promise<FulfillmentClientNotificationDTO[]> {
    return request<FulfillmentClientNotificationDTO[]>(
      `/api/admin/fulfillment/notifications?orderId=${encodeURIComponent(orderId)}`,
    );
  },
};

export const fulfillmentVendorsService = {
  /** Vendor Directory list (spec §7) — every vendor, profiled or not. */
  async listVendors(): Promise<VendorDirectoryRow[]> {
    return request<VendorDirectoryRow[]>('/api/admin/fulfillment/vendors');
  },

  /** A vendor's name + profile (null if none yet) + its trailing-90d scorecard. */
  async getVendor(
    vendorId: string,
  ): Promise<{ vendorId: string; vendorName: string; profile: VendorProfileDTO | null; scorecard: VendorScorecard }> {
    return request(`/api/admin/fulfillment/vendors/${vendorId}`);
  },

  /** Writes via fulfillment_update_vendor_profile (00353, R1.6). */
  async updateVendorProfile(vendorId: string, patch: Record<string, unknown>): Promise<{ ok: true }> {
    return request(`/api/admin/fulfillment/vendors/${vendorId}/profile`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
  },
};

export const fulfillmentConfigService = {
  /** Every fulfillment_config row (spec §10). */
  async listConfig(): Promise<FulfillmentConfigRow[]> {
    return request<FulfillmentConfigRow[]>('/api/admin/fulfillment/config');
  },

  /** Writes via fulfillment_update_config (00353) — events config.updated. */
  async updateConfig(key: string, value: Record<string, unknown>): Promise<{ ok: true }> {
    return request(`/api/admin/fulfillment/config/${encodeURIComponent(key)}`, {
      method: 'POST',
      body: JSON.stringify({ value }),
    });
  },
};

// ── S5: shipments ────────────────────────────────────────────────────────────
// The Shipment Board (spec §5.4) — routes under /api/admin/fulfillment/shipments/*.
// See hooks/use-fulfillment-shipments.ts for the React Query wiring and
// hooks/index.ts's S5 section for the export surface.
import type { FulfillmentShipmentsBoardDTO, ShipmentMode } from '@patina/fulfillment';

export interface CreateShipmentInput {
  poId: string;
  mode: ShipmentMode;
  carrier: string;
  tracking: string;
}

export const fulfillmentShipmentsService = {
  /** The Shipment Board's one round-trip: every shipment + the POs eligible to
   *  become a new one (spec §5.4). */
  async listBoard(): Promise<FulfillmentShipmentsBoardDTO> {
    return request<FulfillmentShipmentsBoardDTO>('/api/admin/fulfillment/shipments');
  },

  /** "Tracking (manual entry v1)" — binds to fulfillment_record_shipment
   *  (00353), which both creates the shipment row and steps the PO/lines to
   *  shipped in one call. */
  async createShipment(input: CreateShipmentInput): Promise<{ shipmentId: string }> {
    return request('/api/admin/fulfillment/shipments', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /** Confirm the LTL/white_glove delivery appointment. ⚠ No RPC backs this yet
   *  (schema gap I10, reported for S6) — the route 501s honestly until one
   *  lands; see the route's header comment. */
  async confirmAppointment(
    shipmentId: string,
    confirmedAt?: string,
  ): Promise<{ ok: true; appointmentConfirmedAt: string }> {
    return request(`/api/admin/fulfillment/shipments/${shipmentId}/appointment`, {
      method: 'POST',
      body: JSON.stringify(confirmedAt ? { confirmedAt } : {}),
    });
  },

  /** Upload proof of delivery — stores to project-documents, then stamps
   *  pod_r2_key + opens the inspection window via fulfillment_record_delivery. */
  async uploadPod(
    shipmentId: string,
    file: File,
  ): Promise<{ ok: true; podR2Key: string; inspectionClosesAt: string | null }> {
    const form = new FormData();
    form.append('file', file);
    const res = await fetch(`/api/admin/fulfillment/shipments/${shipmentId}/pod`, {
      method: 'POST',
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(body.error || `Request failed: ${res.status}`);
    }
    const json = await res.json();
    return json.data;
  },

  /** Mark a shipment delivered without a POD (typically parcel). Gated
   *  identically to the pod route (LTL/white_glove requires a confirmed
   *  appointment first). */
  async deliver(shipmentId: string): Promise<{ ok: true }> {
    return request(`/api/admin/fulfillment/shipments/${shipmentId}/deliver`, {
      method: 'POST',
    });
  },
};

export type { FulfillmentShipmentsBoardDTO };
