// fulfillment-status/core.ts — the derived-status API for iOS (S4, spec §6/§9.5:
// "vendor entities never cross it"). Pure transform from client_order_status_v
// rows (00353's DEFINER view, own-row auth.uid()-scoped, ENRICHED in 00358
// with client-safe eta + per-stage timestamps) to the wire shape. No
// vendor/PO/cost field exists anywhere in the input this reads or the output
// it produces — client_order_status_v carries only order-level dates (see its
// COMMENT), so there is nothing wider to leak even by mistake.
//
// Wave-E fix (2026-07-17): the v1 gap this file used to document — `eta`
// always null, `timeline` capped at one honest entry — is CLOSED.
// client_order_status_v (00358) now carries `eta` +
// confirmed_at/in_production_at/shipped_at/delivered_at. rowToStatusOrder
// builds a genuine timeline: one entry per stage the order has REACHED (up
// to and including its current status, in confirmed → in_production →
// shipped → delivered order), each stamped with its real timestamp — or an
// honest `at: null` if that stage is reached but its timestamp column is
// genuinely null (e.g. `client_status` flips to 'confirmed' at intake, but
// `confirmed_at` is sourced from the order's first PO being created, so it
// can still be null for a freshly-intake order — never fabricate the gap).
// No `delayed_at` column exists on the view — an exception can interrupt any
// underlying stage, so there's no single honest timestamp to attach — so
// 'delayed' keeps the PRE-enrichment shape: one entry stamped from
// intake_at, then an honest `at: null` delayed entry.

export type StatusKind = 'confirmed' | 'in_production' | 'shipped' | 'delivered' | 'delayed';

export const STATUS_KINDS: readonly StatusKind[] = [
  'confirmed',
  'in_production',
  'shipped',
  'delivered',
  'delayed',
];

export interface TimelineEntry {
  /** ISO timestamp, or null when the stage has been reached but its source
   *  column is genuinely null (never a fabricated timestamp — see header). */
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
  /** Order-level client ETA (00358) — the latest committed-ship/shipment-ETA
   *  date across the order, or null when nothing has been committed yet. */
  eta: string | null;
  /** Split-confirm timestamp (00358) — when the order's first PO was
   *  created. Can be null even when client_status is already 'confirmed'
   *  (that status covers intake/split/transmitted — pre-PO stages too). */
  confirmed_at: string | null;
  /** First vendor-ack timestamp (00358) — the order's move into production. */
  in_production_at: string | null;
  /** Earliest shipment.shipped_at across the order (00358). */
  shipped_at: string | null;
  /** Latest shipment.delivered_at across the order (00358). */
  delivered_at: string | null;
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

// The linear stage progression the enriched columns describe — confirmed
// (split, PO created) through delivered. 'delayed' is an overlay status (an
// open exception can interrupt ANY of these stages), not a fifth rung on
// this ladder, so it is handled separately in rowToStatusOrder below.
const STAGE_PROGRESSION: ReadonlyArray<{
  kind: Exclude<StatusKind, 'delayed'>;
  at: (row: ClientOrderStatusRow) => string | null;
}> = [
  { kind: 'confirmed', at: (row) => row.confirmed_at },
  { kind: 'in_production', at: (row) => row.in_production_at },
  { kind: 'shipped', at: (row) => row.shipped_at },
  { kind: 'delivered', at: (row) => row.delivered_at },
];

export function rowToStatusOrder(row: ClientOrderStatusRow): StatusOrder {
  const status = normalizeStatusKind(row.client_status);
  let timeline: TimelineEntry[];

  if (status === 'delayed') {
    // No delayed_at column exists (see file header) — keep the
    // pre-enrichment shape: prove only the intake timestamp, then an honest
    // at:null delayed entry rather than fabricating one.
    timeline = [
      { at: row.intake_at, kind: 'confirmed', label: labelForStatus('confirmed') },
      { at: null, kind: 'delayed', label: labelForStatus('delayed') },
    ];
  } else {
    const reachedIdx = STAGE_PROGRESSION.findIndex((stage) => stage.kind === status);
    const reached = reachedIdx === -1 ? [] : STAGE_PROGRESSION.slice(0, reachedIdx + 1);
    timeline = reached.map((stage) => ({
      // Honest gap (see file header): a reached stage can still have a null
      // source column (e.g. 'confirmed' before the first PO exists) — never
      // fabricate a timestamp for it.
      at: stage.at(row),
      kind: stage.kind,
      label: labelForStatus(stage.kind),
    }));
  }

  return {
    order_number: row.order_no,
    status,
    status_label: labelForStatus(status),
    eta: row.eta,
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
    .select('order_id, order_no, intake_at, client_status, eta, confirmed_at, in_production_at, shipped_at, delivered_at')
    .order('order_no', { ascending: true });
  if (error) throw new Error(`fulfillment-status: ${error.message}`);
  return { orders: (data ?? []).map(rowToStatusOrder) };
}
