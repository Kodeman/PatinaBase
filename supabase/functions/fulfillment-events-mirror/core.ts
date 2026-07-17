// fulfillment-events-mirror/core.ts — mirrors public.fulfillment_events onto
// PostHog so the append-only BOH event log is queryable/dashboard-able there
// too. Reads WHERE id > cursor ORDER BY id LIMIT 500, captures each as
// 'fulfillment_' + event_type.replaceAll('.','_'), then advances
// fulfillment_event_mirror_cursor to the last id actually attempted.
//
// distinct_id: fulfillment_events.actor is either a real person/profile uuid
// (a designer or client acting through the portal) or a system-worker string
// ('fulfillment-intake', 'stripe-webhook', 'seed:boh', …). Only a genuine uuid
// is a meaningful PostHog person distinct_id; every non-uuid actor mirrors
// under the shared 'boh-system' distinct_id so system events don't fragment
// person profiles or mint bogus persons.
//
// Best-effort: capturePosthogEvent (_shared/posthog.ts) never throws — a
// PostHog outage must never park the cron run. Because of that, "attempted"
// and "succeeded" are the same thing here: the cursor advances past every
// event we called capturePosthogEvent for, in id order, and stops at the
// first one we have NOT yet reached (never skips ahead).

import { capturePosthogEvent } from '../_shared/posthog.ts';
import type { RpcClient } from '../_shared/agent-queue.ts';

interface MirrorResult {
  data: unknown;
  error: { message: string } | null;
}

// Chainable query surface (mirrors stripe-event-processor/core.ts's
// TableQuery — typed, no `any`), scoped to what this module needs:
// select/eq/gt/order/limit + maybeSingle, and update/eq for the cursor write.
interface MirrorQuery {
  select(cols?: string): MirrorQuery;
  eq(col: string, val: unknown): MirrorQuery;
  gt(col: string, val: unknown): MirrorQuery;
  order(col: string, opts?: { ascending?: boolean }): MirrorQuery;
  limit(n: number): MirrorQuery;
  update(values: unknown): MirrorQuery;
  single(): PromiseLike<MirrorResult>;
  maybeSingle(): PromiseLike<MirrorResult>;
  then<R1 = MirrorResult, R2 = never>(
    onfulfilled?: ((v: MirrorResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2>;
}

export interface MirrorSupabase extends RpcClient {
  from(table: string): MirrorQuery;
}

interface FulfillmentEventRow {
  id: number;
  event_type: string;
  actor: string;
  order_id: string | null;
  refs: Record<string, unknown> | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True for a real uuid actor (person/profile id); false for system-worker strings. */
export function isUuidActor(actor: string): boolean {
  return UUID_RE.test(actor);
}

export async function runEventsMirror(supabase: MirrorSupabase): Promise<{ mirrored: number; cursor: number }> {
  const cur = await supabase
    .from('fulfillment_event_mirror_cursor')
    .select('last_event_id')
    .eq('id', true)
    .maybeSingle();
  let cursor = Number((cur.data as { last_event_id: number } | null)?.last_event_id ?? 0);

  const rows = await supabase
    .from('fulfillment_events')
    .select('id, event_type, actor, order_id, refs')
    .gt('id', cursor)
    .order('id', { ascending: true })
    .limit(500);
  const events = (rows.data as FulfillmentEventRow[] | null) ?? [];

  let mirrored = 0;
  for (const e of events) {
    const distinctId = isUuidActor(e.actor) ? e.actor : 'boh-system';
    await capturePosthogEvent(distinctId, 'fulfillment_' + e.event_type.replaceAll('.', '_'), {
      ...(e.refs ?? {}),
      event_id: e.id,
      order_id: e.order_id,
      actor: e.actor,
      source: 'fulfillment_events',
    });
    // capturePosthogEvent never throws — this event has now been attempted,
    // so the cursor advances past it regardless of whether PostHog accepted
    // the capture over the wire.
    cursor = e.id;
    mirrored++;
  }

  if (mirrored > 0) {
    await supabase
      .from('fulfillment_event_mirror_cursor')
      .update({ last_event_id: cursor, updated_at: new Date().toISOString() })
      .eq('id', true);
  }
  return { mirrored, cursor };
}
