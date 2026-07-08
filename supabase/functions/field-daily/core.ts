// field-daily — the once-daily Field Coordination digest cron (00284 schedules
// it at 13:00 UTC). Per consented ('granted') field party per project it:
//   · composes a numbered open-item digest (open owned tasks + court items
//     older than 48h), persists the numbered menu to the conversation's
//     state_context.menu so an inbound "DONE 2" resolves deterministically,
//     and sends sms_daily_digest (with a fresh field link),
//   · sends sms_delivery_confirm to receiver/gc parties for deliveries in the
//     next 48h (deduped via state_context.delivery_confirms_sent),
//   · flushes any 'deferred' outbound rows.
// Parties with nothing to say are skipped (A2P-friendly — one predictable msg).
//
// Env-gated like the other crons (service role). The send + flush functions are
// injectable so the composition/persistence/dedupe logic unit-tests offline.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  flushDeferredMessages,
  sendPartySms,
  type SendPartySmsInput,
  type SendPartySmsResult,
  type SmsDeps,
} from "../_shared/sms.ts";

const FIELD_KINDS = ["gc", "sub", "installer", "receiver"];

// ── Pure digest composition (unit-tested) ───────────────────────────────────
export interface DigestItem {
  id: string;
  kind: "task" | "coordination";
  title: string;
  project_id: string;
  due: string | null; // YYYY-MM-DD or null
}

export interface MenuEntry {
  n: number;
  kind: "task" | "coordination";
  id: string;
  project_id: string;
}

/** Render "1) Title (due today) 2) Other" + the structured menu entries. */
export function buildDigestMenu(
  items: DigestItem[],
  today: string,
): { menuText: string; entries: MenuEntry[] } {
  const entries: MenuEntry[] = [];
  const parts: string[] = [];
  items.forEach((it, idx) => {
    const n = idx + 1;
    entries.push({ n, kind: it.kind, id: it.id, project_id: it.project_id });
    let label = "";
    if (it.due) {
      if (it.due === today) label = " (due today)";
      else if (it.due < today) label = " (overdue)";
      else label = ` (due ${formatDue(it.due)})`;
    }
    parts.push(`${n}) ${it.title}${label}`);
  });
  return { menuText: parts.join(" "), entries };
}

function formatDue(iso: string): string {
  // YYYY-MM-DD → "Mon D" without pulling in a TZ (date-only, no clock).
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!y || !m || !d) return iso;
  return `${months[m - 1]} ${d}`;
}

/** Delivery confirm dedupe: send only if this event id hasn't been sent yet. */
export function shouldSendDeliveryConfirm(
  eventId: string,
  sentList: unknown,
): boolean {
  return !(Array.isArray(sentList) && sentList.includes(eventId));
}

// ── Orchestration ───────────────────────────────────────────────────────────
export interface FieldDailyDeps extends SmsDeps {
  /** Injectable sender (defaults to sendPartySms). */
  sendFn?: (
    supabase: SupabaseClient,
    input: SendPartySmsInput,
    deps: SmsDeps,
  ) => Promise<SendPartySmsResult>;
  /** Injectable deferred flush (defaults to flushDeferredMessages). */
  flushFn?: (supabase: SupabaseClient, deps: SmsDeps) => Promise<{ flushed: number; skipped: number }>;
}

interface RunSummary {
  digests_sent: number;
  delivery_confirms_sent: number;
  parties_skipped: number;
  deferred_flushed: number;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function findOrCreateConversation(
  supabase: SupabaseClient,
  twilioNumber: string,
  phone: string,
  partyId: string,
  projectId: string,
): Promise<{ id: string; state_context: Record<string, unknown> } | null> {
  const { data: existing } = await supabase
    .from("sms_conversations")
    .select("id, state_context")
    .eq("twilio_number", twilioNumber)
    .eq("phone_e164", phone)
    .maybeSingle();
  if ((existing as { id?: string } | null)?.id) {
    return existing as { id: string; state_context: Record<string, unknown> };
  }
  const { data: created } = await supabase
    .from("sms_conversations")
    .insert({
      twilio_number: twilioNumber,
      phone_e164: phone,
      party_id: partyId,
      active_project_id: projectId,
    })
    .select("id, state_context")
    .single();
  return (created as { id: string; state_context: Record<string, unknown> } | null) ?? null;
}

export async function runFieldDaily(
  supabase: SupabaseClient,
  deps: FieldDailyDeps = {},
): Promise<RunSummary> {
  const now = deps.now ?? new Date();
  const today = isoDate(now);
  const cutoff48h = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  const twilioNumber = (deps.getEnv ?? ((k: string) => Deno.env.get(k)))("TWILIO_FROM_NUMBER") ?? "";
  const send = deps.sendFn ?? sendPartySms;
  const flush = deps.flushFn ?? flushDeferredMessages;

  const summary: RunSummary = {
    digests_sent: 0,
    delivery_confirms_sent: 0,
    parties_skipped: 0,
    deferred_flushed: 0,
  };

  // ── Consented field parties ───────────────────────────────────────────────
  const { data: parties } = await supabase
    .from("project_parties")
    .select("id, phone_e164, project_id, display_name, party_kind, sms_consent_status")
    .in("party_kind", FIELD_KINDS)
    .eq("sms_consent_status", "granted");

  for (const party of (parties ?? []) as Array<{
    id: string;
    phone_e164: string | null;
    project_id: string;
    party_kind: string;
  }>) {
    if (!party.phone_e164) {
      summary.parties_skipped++;
      continue;
    }

    // Open owned tasks.
    const { data: tasks } = await supabase
      .from("project_tasks")
      .select("id, title, due_date, project_id, status")
      .eq("owner_party_id", party.id)
      .neq("status", "done");

    // Court items pending > 48h.
    const { data: items } = await supabase
      .from("client_decisions")
      .select("id, title, coordination_kind, due_date, project_id, status, created_at")
      .eq("court_party_id", party.id)
      .eq("status", "pending")
      .lt("created_at", cutoff48h);

    const digestItems: DigestItem[] = [
      ...((tasks ?? []) as Array<{ id: string; title: string; due_date: string | null; project_id: string }>)
        .map((t) => ({ id: t.id, kind: "task" as const, title: t.title, project_id: t.project_id, due: t.due_date })),
      ...((items ?? []) as Array<{ id: string; title: string; due_date: string | null; project_id: string }>)
        .map((c) => ({ id: c.id, kind: "coordination" as const, title: c.title, project_id: c.project_id, due: c.due_date })),
    ];

    if (digestItems.length === 0) {
      summary.parties_skipped++;
      continue;
    }

    const { menuText, entries } = buildDigestMenu(digestItems, today);

    // Persist the menu so an inbound numbered reply resolves against it.
    const conv = await findOrCreateConversation(
      supabase,
      twilioNumber,
      party.phone_e164,
      party.id,
      party.project_id,
    );
    if (conv) {
      const nextContext = { ...(conv.state_context ?? {}), menu: entries, menu_created_at: now.toISOString() };
      await supabase
        .from("sms_conversations")
        .update({ state_context: nextContext })
        .eq("id", conv.id);
    }

    const res = await send(
      supabase,
      {
        partyId: party.id,
        projectId: party.project_id,
        templateKey: "sms_daily_digest",
        vars: { menu: menuText },
      },
      deps,
    );
    if (res.sent || res.deferred) summary.digests_sent++;
  }

  // ── Delivery-window confirms (receiver/gc, next 48h, deduped) ─────────────
  const in48h = isoDate(new Date(now.getTime() + 48 * 3600 * 1000));
  const { data: events } = await supabase
    .from("delivery_events")
    .select("event_id, project_id, vendor_name, event_date, event_type")
    .eq("event_type", "delivery_expected")
    .gte("event_date", today)
    .lte("event_date", in48h);

  for (const ev of (events ?? []) as Array<{
    event_id: string;
    project_id: string;
    vendor_name: string | null;
    event_date: string;
  }>) {
    // Consented receiver/gc parties on the event's project.
    const { data: recvParties } = await supabase
      .from("project_parties")
      .select("id, phone_e164, project_id, party_kind, sms_consent_status")
      .eq("project_id", ev.project_id)
      .in("party_kind", ["receiver", "gc"])
      .eq("sms_consent_status", "granted");

    for (const party of (recvParties ?? []) as Array<{ id: string; phone_e164: string | null; project_id: string }>) {
      if (!party.phone_e164) continue;

      const conv = await findOrCreateConversation(
        supabase,
        twilioNumber,
        party.phone_e164,
        party.id,
        party.project_id,
      );
      const sentList = (conv?.state_context as { delivery_confirms_sent?: unknown } | undefined)
        ?.delivery_confirms_sent;
      if (!conv || !shouldSendDeliveryConfirm(ev.event_id, sentList)) continue;

      const res = await send(
        supabase,
        {
          partyId: party.id,
          projectId: party.project_id,
          templateKey: "sms_delivery_confirm",
          vars: {
            delivery_window: formatDue(ev.event_date),
            delivery_summary: ev.vendor_name ?? "a delivery",
          },
        },
        deps,
      );
      if (res.sent || res.deferred) {
        summary.delivery_confirms_sent++;
        const prior = Array.isArray(sentList) ? (sentList as string[]) : [];
        await supabase
          .from("sms_conversations")
          .update({
            state_context: {
              ...(conv.state_context ?? {}),
              delivery_confirms_sent: [...prior, ev.event_id],
            },
          })
          .eq("id", conv.id);
      }
    }
  }

  // ── Flush deferred outbound rows ──────────────────────────────────────────
  const flushed = await flush(supabase, deps);
  summary.deferred_flushed = flushed.flushed;

  return summary;
}
