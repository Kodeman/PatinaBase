// field-daily — the once-daily Field Coordination digest cron (00284 schedules
// it at 13:00 UTC). Per consented field party per project — consent read off
// the studio's own record via mayTextField() below, never off the seat column
// 00594 froze — it:
//   · composes a numbered open-item digest (open owned tasks + court items
//     older than 48h), persists the numbered menu to the conversation's
//     state_context.menu so an inbound "DONE 2" resolves deterministically,
//     and sends sms_daily_digest (with a fresh field link),
//   · sends sms_delivery_confirm to receiver/gc parties for deliveries in the
//     next 48h (deduped via state_context.delivery_confirms_sent),
//   · flushes any 'deferred' outbound rows.
// Parties with nothing to say are skipped (A2P-friendly — one predictable msg),
// and so are parties whose consent the gate refuses — both counted in
// parties_skipped, so a run that texts nobody says why in its own summary
// instead of going quietly empty.
//
// Env-gated like the other crons (service role). The send + flush functions are
// injectable so the composition/persistence/dedupe logic unit-tests offline.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  channelConsentVerdict,
  flushDeferredMessages,
  sendPartySms,
  smsConversationNumber,
  type SendPartySmsInput,
  type SendPartySmsResult,
  type SmsDeps,
} from "../_shared/sms.ts";

const FIELD_KINDS = ["gc", "sub", "installer", "receiver"];

/**
 * May this party be texted an ordinary (non-invite) field message?
 *
 * THE RECORD, NOT THE SEAT (R-AS, close-out r3 MAJOR-2). Both recipient
 * selects below used to pre-filter on `project_parties.sms_consent_status =
 * 'granted'` — the column 00594 froze. Nothing writes a seat to 'granted' any
 * more (the mirror is gone, the rail writes the record only, and
 * useAddProjectParty's INSERT is born 'pending'), so the cron's recipient set
 * could only shrink: the daily digest and the delivery confirms went dead for
 * every consent recorded after the freeze, and the send gate's own "allow"
 * branch — the half of G-3 the record exists to provide — was unreachable
 * through this caller.
 *
 * The gate asked here is `channelConsentVerdict`, the same function
 * sendPartySms asks first, so the pre-filter cannot drift from the authority:
 *   · "allow"   — the studio's own record says granted, with no refusal
 *                 standing behind it.
 *   · "refuse"  — never texted. Since R-AW that includes "this studio holds NO
 *                 record for the number": 00594's fold folded every seat in
 *                 the same migration, so a pair with no record was never asked,
 *                 and a seat frozen at 'granted' can no longer carry a digest
 *                 on its own.
 *   · "unknown" — the record says 'pending': the invite is out and unanswered,
 *                 and a digest is not an invite, so it is not composed. The
 *                 legacy seat leg that used to widen this branch — "or the
 *                 frozen seat says granted" — is deleted with sendPartySms's
 *                 own second check (R-AY, final-run MAJOR-1): the pre-filter
 *                 and the authority ask one question again.
 * sendPartySms re-runs the whole gate for real; this only decides whom it is
 * worth composing a digest for, so it never widens what may be sent.
 */
async function mayTextField(
  supabase: SupabaseClient,
  party: { phone_e164: string | null; project_id: string },
  sender: string | undefined,
): Promise<boolean> {
  if (!party.phone_e164 || !sender) return false;
  const { data: suppressed, error } = await supabase.rpc("sms_is_suppressed", {
    p_sender: sender, p_recipient: party.phone_e164,
  });
  if (error || suppressed !== false) return false;
  const verdict = await channelConsentVerdict(
    supabase,
    party.phone_e164,
    party.project_id,
  );
  return verdict === "allow";
}

// ── Pure digest composition (unit-tested) ───────────────────────────────────
export interface DigestItem {
  id: string;
  kind: "task" | "coordination";
  title: string;
  project_id: string;
  due: string | null; // YYYY-MM-DD or null
  ref?: string;
}

export interface MenuEntry {
  n: number;
  kind: "task" | "coordination";
  id: string;
  project_id: string;
}

/** A GSM-7 extension character costs two septets; everything else costs one. */
const GSM7_EXTENDED = "^{}\\[~]|€";

function septetsOf(text: string): number {
  let count = 0;
  for (const ch of text) count += GSM7_EXTENDED.includes(ch) ? 2 : 1;
  return count;
}

/**
 * Everything the digest menu may spend (contract S8). sms_daily_digest (00641)
 * is the tightest body in the copy set, and the menu is the only part of it
 * this code controls, so the cap lives with the producer rather than in a test:
 *
 *    306  two GSM-7 segments
 *   -118  the template's own words + the rates/HELP/STOP closing line
 *    -98  the field link (CLIENT_PORTAL_URL + "/field/" + a 64-hex token)
 *    -24  {{studio_name}} at the 24-septet maximum the copy contract gives a name
 *    -24  {{project_name}}, the same 24-septet name budget
 *   ————
 *     42
 *
 * Names are budgeted in SEPTETS, not characters: a name written in GSM-7
 * extension characters spends two septets each and overruns this on its own.
 */
export const DIGEST_MENU_MAX_SEPTETS = 42;
export const DIGEST_CLAIM_LEASE_MS = 2 * 60 * 1000;

/** As many of `text`'s characters as `budget` septets will pay for. */
function truncateToSeptets(text: string, budget: number): string {
  let out = "";
  let used = 0;
  for (const ch of text) {
    const cost = GSM7_EXTENDED.includes(ch) ? 2 : 1;
    if (used + cost > budget) break;
    out += ch;
    used += cost;
  }
  return out.trimEnd();
}

/**
 * Render "1) Title (due today) 2) Other" + the structured menu entries, inside
 * `maxSeptets`. A first item too long for the budget is truncated with "..."
 * (three basic septets — an ellipsis character would turn the whole message
 * into 70-character UCS-2 segments); later items are dropped whole and counted
 * as "+N more", and `entries` drops with them, so a number someone replies with
 * always names a line they were actually shown.
 */
export function buildDigestMenu(
  items: DigestItem[],
  today: string,
  maxSeptets: number = DIGEST_MENU_MAX_SEPTETS,
  maxItems: number = items.length,
): { menuText: string; entries: MenuEntry[] } {
  const entries: MenuEntry[] = [];
  const parts: string[] = [];

  const labelOf = (it: DigestItem): string => {
    if (!it.due) return "";
    if (it.due === today) return " (due today)";
    if (it.due < today) return " (overdue)";
    return ` (due ${formatDue(it.due)})`;
  };
  const compose = (shown: string[], more: number): string =>
    [shown.join(" "), more > 0 ? `+${more} more` : ""].filter(Boolean).join(" ");

  for (const [idx, it] of items.entries()) {
    if (idx >= maxItems) break;
    const n = idx + 1;
    const head = `${n}) `;
    const label = `${labelOf(it)}${it.ref ? ` Ref ${it.ref}` : ""}`;
    const rest = items.length - n;
    let part = `${head}${it.title}${label}`;

    if (septetsOf(compose([...parts, part], rest)) > maxSeptets) {
      // Only the first line earns a truncation — dropping it would leave a
      // menu with no items and a "+N more" nobody can reply to.
      if (parts.length > 0) break;
      const room = maxSeptets - septetsOf(compose([`${head}...${label}`], rest));
      const title = room > 0 ? truncateToSeptets(it.title, room) : "";
      if (!title) break;
      part = `${head}${title}...${label}`;
    }

    parts.push(part);
    entries.push({ n, kind: it.kind, id: it.id, project_id: it.project_id });
  }

  return { menuText: compose(parts, items.length - parts.length), entries };
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

interface ProjectContext {
  id: string;
  party_id: string;
  project_id: string;
  state_context: Record<string, unknown>;
  paused_until: string | null;
}

async function findOrCreateConversation(supabase: SupabaseClient, twilioNumber: string,
  phone: string, partyId: string, projectId: string): Promise<ProjectContext | null> {
  const { data: existing, error: readError } = await supabase.from("sms_conversations").select("id")
    .eq("twilio_number", twilioNumber).eq("phone_e164", phone).maybeSingle();
  if (readError) return null;
  let id = existing?.id;
  if (!id) {
    const { data, error } = await supabase.from("sms_conversations").upsert({
      twilio_number: twilioNumber, phone_e164: phone,
    }, { onConflict: "twilio_number,phone_e164", ignoreDuplicates: true }).select("id");
    if (error) return null;
    id = data?.[0]?.id;
    if (!id) {
      const retry = await supabase.from("sms_conversations").select("id")
        .eq("twilio_number", twilioNumber).eq("phone_e164", phone).maybeSingle();
      if (retry.error || !retry.data) return null;
      id = retry.data.id;
    }
  }
  const { error } = await supabase.from("sms_conversation_context").upsert({
    conversation_id: id, project_id: projectId, party_id: partyId, state: "idle", state_context: {},
    paused_until: null, backfilled_at: null,
  }, { onConflict: "conversation_id,project_id", ignoreDuplicates: true });
  if (error) return null;
  const context = await supabase.from("sms_conversation_context").select("*")
    .eq("conversation_id", id).eq("project_id", projectId).eq("party_id", partyId).is("backfilled_at", null).maybeSingle();
  return context.error || !context.data ? null : { ...context.data, id };
}

async function saveContext(supabase: SupabaseClient, row: ProjectContext, state: Record<string, unknown>) {
  const { data, error } = await supabase.from("sms_conversation_context").update({ state_context: state })
    .eq("conversation_id", row.id).eq("project_id", row.project_id).eq("party_id", row.party_id)
    .eq("state_context", JSON.stringify(row.state_context)).is("backfilled_at", null).select("conversation_id");
  if (error || !data?.length) return false;
  row.state_context = state;
  return true;
}

async function promptRef(supabase: SupabaseClient, party: {id: string; project_id: string; phone_e164: string | null},
  subjectId: string, kind: string, version: number, sender: string, now: Date, ownsClaim?: () => Promise<boolean>) {
  const { data: existing, error } = await supabase.from("sms_prompts").select("id, short_code")
    .eq("party_id", party.id).eq("project_id", party.project_id).eq("subject_id", subjectId).eq("kind", kind)
    .eq("version", version).eq("sender_number", sender).eq("recipient_phone", party.phone_e164)
    .is("answered_at", null).gt("expires_at", now.toISOString()).order("created_at", {ascending: true}).limit(1);
  if (error) return null;
  if (existing?.length) return existing[0];
  if (ownsClaim && !await ownsClaim()) return null;
  // SQL deduplicates the frozen YYYYMMDD identity under a transaction lock.
  // A stale reuse read or expired lease still gets the existing id/code.
  const created = await supabase.rpc("sms_create_prompt", { p_party_id: party.id, p_project_id: party.project_id,
    p_subject_id: subjectId, p_kind: kind, p_version: version, p_sender_number: sender,
    p_recipient_phone: party.phone_e164, p_expires_at: new Date(now.getTime() + 48 * 3600000).toISOString(), p_proposed_effect: null });
  const prompt = Array.isArray(created.data) ? created.data[0] : created.data;
  return created.error || !prompt?.id || !/^\d{2,3}$/.test(prompt.short_code) ? null : prompt;
}

export async function runFieldDaily(
  supabase: SupabaseClient,
  deps: FieldDailyDeps = {},
): Promise<RunSummary> {
  const now = deps.now ?? new Date();
  const startedAt = Date.now();
  const clock = () => new Date(now.getTime() + Date.now() - startedAt);
  const runId = crypto.randomUUID();
  const today = isoDate(now);
  const cutoff48h = new Date(now.getTime() - 48 * 3600 * 1000).toISOString();
  // Key digest/delivery-confirm conversations on the same physical number
  // sendPartySms uses — never an MG… Messaging Service SID (see _shared/sms.ts).
  const conversationNumber = smsConversationNumber(deps);
  const send = deps.sendFn ?? sendPartySms;
  const flush = deps.flushFn ?? flushDeferredMessages;

  const summary: RunSummary = {
    digests_sent: 0,
    delivery_confirms_sent: 0,
    parties_skipped: 0,
    deferred_flushed: 0,
  };

  // ── Consented field parties ───────────────────────────────────────────────
  // The consent test is mayTextField() below, not a WHERE on the frozen seat
  // (close-out r3 MAJOR-2), and the frozen column is no longer SELECTed either:
  // the legacy leg that read it is gone (R-AY, final-run MAJOR-1).
  const { data: parties } = await supabase
    .from("project_parties")
    .select("id, phone_e164, project_id, display_name, party_kind")
    .in("party_kind", FIELD_KINDS);

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
    if (!(await mayTextField(supabase, party, conversationNumber))) {
      summary.parties_skipped++;
      continue;
    }
    if (!conversationNumber) {
      // TWILIO_FROM_NUMBER is an MG… SID and no override is configured — the
      // conversation can't be safely keyed; skip rather than split threads.
      summary.parties_skipped++;
      continue;
    }

    const conv = await findOrCreateConversation(supabase, conversationNumber, party.phone_e164, party.id, party.project_id);
    if (!conv || (conv.paused_until && Date.parse(conv.paused_until) > now.getTime())) {
      summary.parties_skipped++;
      continue;
    }

    // A daily logical send has one immutable numbered menu, even when tasks
    // change between retries or while the sender holds a deferred recipe.
    let menuText = conv.state_context.digest_day === today
      ? conv.state_context.digest_menu_text as string | undefined : undefined;
    if (!menuText) {
      const sameDay = conv.state_context.digest_day === today;
      const priorClaim = sameDay ? conv.state_context.digest_claim as { run_id: string; lease_until: string } | undefined : undefined;
      if (priorClaim && Date.parse(priorClaim.lease_until) > clock().getTime()) {
        summary.parties_skipped++; continue; // Explicit live-owner no-send result.
      }
      let digestItems = sameDay ? conv.state_context.digest_items as DigestItem[] | undefined : undefined;
      if (!digestItems) {
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

        digestItems = [
          ...((tasks ?? []) as Array<{ id: string; title: string; due_date: string | null; project_id: string }>)
            .map((t) => ({ id: t.id, kind: "task" as const, title: t.title, project_id: t.project_id, due: t.due_date })),
          ...((items ?? []) as Array<{ id: string; title: string; due_date: string | null; project_id: string }>)
            .map((c) => ({ id: c.id, kind: "coordination" as const, title: c.title, project_id: c.project_id, due: c.due_date })),
        ];

      }
      if (digestItems.length === 0) {
        summary.parties_skipped++;
        continue;
      }

      // Own the day and freeze its inputs BEFORE any prompt issuance. An
      // expired, unrendered claim is recovered through the same exact CAS.
      const claimedAt = clock();
      if (!await saveContext(supabase, conv, { ...conv.state_context, digest_day: today,
        digest_menu_text: null, digest_items: digestItems,
        digest_claim: { run_id: runId, claimed_at: claimedAt.toISOString(), lease_until: new Date(claimedAt.getTime() + DIGEST_CLAIM_LEASE_MS).toISOString() },
      })) { summary.parties_skipped++; continue; }
      const ownsClaim = async () => {
        const { data, error } = await supabase.from("sms_conversation_context").select("state_context")
          .eq("conversation_id", conv.id).eq("project_id", conv.project_id).eq("party_id", conv.party_id).maybeSingle();
        const claim = data?.state_context?.digest_claim;
        return !error && data?.state_context?.digest_day === today && claim?.run_id === runId &&
          Date.parse(claim.lease_until) > clock().getTime();
      };
      try {
        // Budget with three-digit refs before allocating; omitted entries cannot
        // acquire invisible questions. Retries reuse this day's immutable prompts.
        const visible = buildDigestMenu(digestItems.map(i => ({ ...i, ref: "999" })), today).entries;
        const referenced: DigestItem[] = [];
        for (const item of digestItems) {
          if (!visible.some(v => v.id === item.id && v.kind === item.kind)) continue;
          const prompt = await promptRef(supabase, party, item.id, "mark_done", Number(today.replaceAll("-", "")), conversationNumber, now, ownsClaim);
          if (!prompt) break;
          referenced.push({ ...item, ref: prompt.short_code });
        }
        if (referenced.length !== visible.length || !referenced.length) { summary.parties_skipped++; continue; }
        // Keep omitted-item accounting while preserving the same conservative layout.
        const renderedItems = digestItems.map(i => ({ ...i, ref: referenced.find(r => r.id === i.id && r.kind === i.kind)?.ref ?? "999" }));
        const rendered = buildDigestMenu(renderedItems, today, DIGEST_MENU_MAX_SEPTETS, visible.length);
        const { entries } = rendered;
        menuText = rendered.menuText;
        if (entries.some(e => !referenced.some(r => r.id === e.id && r.kind === e.kind))) { summary.parties_skipped++; continue; }
        const renderedState: Record<string, unknown> = { ...conv.state_context, menu: entries, menu_created_at: now.toISOString(), digest_day: today, digest_menu_text: menuText };
        delete renderedState.digest_claim;
        delete renderedState.digest_items;
        if (!await ownsClaim() || !await saveContext(supabase, conv, renderedState)) {
          summary.parties_skipped++; continue;
        }
      } finally {
        // Handled failures release only our exact snapshot. A terminated run
        // leaves the lease for an expired-claim retry to recover missing refs.
        if ((conv.state_context.digest_claim as {run_id?: string} | undefined)?.run_id === runId) {
          const released = { ...conv.state_context };
          delete released.digest_claim;
          await saveContext(supabase, conv, released);
        }
      }
    }

    const res = await send(
      supabase,
      {
        partyId: party.id,
        projectId: party.project_id,
        templateKey: "sms_daily_digest",
        vars: { menu: menuText },
        dedupeKey: `field-daily:${party.id}:${today}`,
        // Existing digest automation is unconditional (phase zero).
        automationPhase: 0,
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
    // Consented receiver/gc parties on the event's project — consent asked of
    // the record through mayTextField(), not the frozen seat (close-out r3
    // MAJOR-2).
    const { data: recvParties } = await supabase
      .from("project_parties")
      .select("id, phone_e164, project_id, party_kind")
      .eq("project_id", ev.project_id)
      .in("party_kind", ["receiver", "gc"]);

    for (
      const party of (recvParties ?? []) as Array<{
        id: string;
        phone_e164: string | null;
        project_id: string;
      }>
    ) {
      if (!party.phone_e164) continue;
      if (!(await mayTextField(supabase, party, conversationNumber))) continue;
      if (!conversationNumber) {
        summary.parties_skipped++;
        continue;
      }

      const conv = await findOrCreateConversation(
        supabase,
        conversationNumber,
        party.phone_e164,
        party.id,
        party.project_id,
      );
      const sentList = (conv?.state_context as { delivery_confirms_sent?: unknown } | undefined)
        ?.delivery_confirms_sent;
      if (!conv || (conv.paused_until && Date.parse(conv.paused_until) > now.getTime()) || !shouldSendDeliveryConfirm(ev.event_id, sentList)) continue;
      const prompt = await promptRef(supabase, party, ev.event_id, "confirm_delivery", Number(ev.event_date.replaceAll("-", "")), conversationNumber, now);
      if (!prompt) continue;

      const res = await send(
        supabase,
        {
          partyId: party.id,
          projectId: party.project_id,
          templateKey: "sms_delivery_confirm",
          dedupeKey: `field-delivery:${party.id}:${ev.event_id}:${ev.event_date}`,
          automationPhase: 0,
          vars: {
            ref: prompt.short_code,
            delivery_window: formatDue(ev.event_date),
            delivery_summary: ev.vendor_name ?? "a delivery",
          },
        },
        deps,
      );
      if (res.sent || res.deferred) {
        summary.delivery_confirms_sent++;
        const prior = Array.isArray(sentList) ? (sentList as string[]) : [];
        await saveContext(supabase, conv, { ...conv.state_context, delivery_confirms_sent: [...prior, ev.event_id] });
      }
    }
  }

  // ── Flush deferred outbound rows ──────────────────────────────────────────
  const flushed = await flush(supabase, deps);
  summary.deferred_flushed = flushed.flushed;

  return summary;
}
