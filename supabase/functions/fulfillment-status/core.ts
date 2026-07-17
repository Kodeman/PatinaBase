// fulfillment-status/core.ts — the derived-status API for iOS (S4, spec §6/§9.5:
// "vendor entities never cross it"). Pure transform from client_order_status_v
// rows (00353's DEFINER view, own-row auth.uid()-scoped) to the wire shape.
// No vendor/PO/cost field exists anywhere in the input this reads or the
// output it produces — client_order_status_v itself carries only
// {order_id, order_no, intake_at, client_status} (see its COMMENT in 00353),
// so there is nothing wider to leak even by mistake.
//
// ⚠ Known gap, not fixed here (S4 has no migration budget this wave — S3 is
// the sole writer): client_order_status_v carries no ETA and no per-stage
// timestamp beyond intake_at, so `eta` is always null in v1 and `timeline`
// can only honestly report the ONE transition this data proves happened
// (confirmed @ intake_at). A richer timeline (per-transition timestamps) or a
// real ETA needs either a client-safe additive column on
// client_order_status_v (e.g. current stage's entered-at) or a client-safe
// shipment-ETA source — flagged in the S4 ship report as a combined-pass /
// schema-gap item for S3 or a later slice, not invented here.

export type StatusKind = 'confirmed' | 'in_production' | 'shipped' | 'delivered' | 'delayed';

export const STATUS_KINDS: readonly StatusKind[] = [
  'confirmed',
  'in_production',
  'shipped',
  'delivered',
  'delayed',
];

export interface TimelineEntry {
  /** ISO timestamp, or null when no honest timestamp exists yet for this
   *  entry (see file header — v1 only proves the intake/confirm timestamp). */
  at: string | null;
  kind: StatusKind;
  label: string;
}

export interface StatusOrder {
  order_number: number;
  status: StatusKind;
  status_label: string;
  eta: string | null;
  timeline: TimelineEntry[];
}

export interface StatusResponse {
  orders: StatusOrder[];
}

export interface ClientOrderStatusRow {
  order_id: string;
  order_no: number;
  intake_at: string;
  client_status: string;
}

export function labelForStatus(kind: StatusKind): string {
  switch (kind) {
    case 'confirmed':
      return 'Confirmed';
    case 'in_production':
      return 'In production';
    case 'shipped':
      return 'Shipped';
    case 'delivered':
      return 'Delivered';
    case 'delayed':
      return 'Delayed';
  }
}

/** client_order_status_v.client_status is already client-safe vocabulary
 *  (00353's CASE maps every derived_status onto this closed set), but this
 *  function is the wire-contract's own gate — an unrecognized value (a future
 *  view amendment adding a new derived_status branch) falls back to
 *  'confirmed' rather than ever emitting an open-ended string to iOS. */
export function normalizeStatusKind(clientStatus: string): StatusKind {
  if ((STATUS_KINDS as readonly string[]).includes(clientStatus)) {
    return clientStatus as StatusKind;
  }
  return 'confirmed';
}

export function rowToStatusOrder(row: ClientOrderStatusRow): StatusOrder {
  const status = normalizeStatusKind(row.client_status);
  const timeline: TimelineEntry[] = [
    { at: row.intake_at, kind: 'confirmed', label: labelForStatus('confirmed') },
  ];
  if (status !== 'confirmed') {
    // Honest gap (see file header): we know the order reached this status,
    // just not exactly when — `at: null` rather than a fabricated timestamp.
    timeline.push({ at: null, kind: status, label: labelForStatus(status) });
  }
  return {
    order_number: row.order_no,
    status,
    status_label: labelForStatus(status),
    eta: null,
    timeline,
  };
}

export interface StatusSupabaseLike {
  from(table: string): {
    select(cols?: string): {
      order(col: string, opts?: { ascending?: boolean }): Promise<{
        data: ClientOrderStatusRow[] | null;
        error: { message: string } | null;
      }>;
    };
  };
}

/** Reads client_order_status_v using the CALLER's own session (the deps.supabase
 *  passed in must already be a JWT-forwarding client — see index.ts — so the
 *  view's own-row `auth.uid()` scope does the filtering; this function issues
 *  no additional WHERE clause of its own). */
export async function getOrderStatuses(deps: { supabase: StatusSupabaseLike }): Promise<StatusResponse> {
  const { data, error } = await deps.supabase
    .from('client_order_status_v')
    .select('order_id, order_no, intake_at, client_status')
    .order('order_no', { ascending: true });
  if (error) throw new Error(`fulfillment-status: ${error.message}`);
  return { orders: (data ?? []).map(rowToStatusOrder) };
}
