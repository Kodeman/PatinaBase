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
  fieldLinePhase,
  flushDeferredMessages,
  localDayInTimezone,
  localMinutesInTimezone,
  resolveStudioName,
  sendClientSms,
  sendPartySms,
  smsConversationNumber,
  type OrdinarySmsInput,
  type SendPartySmsInput,
  type SendPartySmsResult,
  type SmsDeps,
} from "../_shared/sms.ts";

const FIELD_KINDS = ["gc", "sub", "installer", "receiver"];

/**
 * THE HOMEOWNER'S PACE (US-3 P24). One list of picks a day at most, one nudge
 * three days later, and then the rail stops talking: a client who has not
 * answered twice is a person to phone, and the studio is the one to do it.
 */
const CLIENT_REMINDER_MS = 72 * 3600 * 1000;
/** How long her ask stays answerable. Long enough to outlive the one nudge. */
const CLIENT_ASK_TTL_MS = 7 * 24 * 3600 * 1000;
/** Picks in one ask. More than this is a phone call, not a text. */
const CLIENT_BATCH_MAX = 5;

/**
 * When the two trade cards are due, as minutes past local midnight in FIELD_TZ
 * (contract P4): the site card the EVENING BEFORE a visit, the ask the MORNING
 * OF. Both are floors, not instants — any tick after the hour that has not
 * already sent the card sends it, so a missed tick catches up instead of
 * dropping the day.
 *
 * NOTE FOR OPERATIONS: at phase 1 this cron needs to run more than once a day.
 * 00284 schedules it at 13:00 UTC, which is 07:00 or 08:00 in America/Chicago
 * depending on the season and never 17:00, so a single daily tick reaches the
 * morning window only during daylight time and the evening window never. The
 * cron's own schedule is 00284's to change; the hours below are the contract's.
 *
 * And the morning ask is DUE at 07:30 but will not be SENT before 08:00: quiet
 * hours (8am–8pm) is a compliance floor the rail applies to every send, so a
 * 07:30 tick stores the row and the flush puts it on the wire at eight. That is
 * the floor working, not a bug to route around.
 */
export const SITE_CARD_LOCAL_MINUTES = 17 * 60;
export const DAY_OF_LOCAL_MINUTES = 7 * 60 + 30;

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

/** The GSM-7 default alphabet; anything outside it would force UCS-2. */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";

/**
 * A site card parameter: the studio's own words, kept inside the septet budget
 * the template documents. Site notes and addresses are free text a person typed,
 * so this TRUNCATES rather than refusing — a card with a shortened note still
 * gets the crew to the right door, and a card that refused to send gets them
 * nowhere. Anything outside GSM-7 is dropped, because one stray character pushes
 * the whole message into UCS-2 and a two-segment budget into three.
 */
export function cardParam(
  value: unknown,
  maxSeptets: number,
  fallback: string,
): string {
  const text = String(value ?? "")
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-").replace(/…/g, "...")
    .replace(/\s+/g, " ").trim();
  let out = "";
  let size = 0;
  for (const ch of text) {
    const cost = GSM7_EXTENDED.includes(ch) ? 2 : GSM7_BASIC.includes(ch) ? 1 : 0;
    if (cost === 0) continue;
    if (size + cost > maxSeptets) break;
    out += ch;
    size += cost;
  }
  out = out.replace(/[\s,.;:-]+$/, "").trim();
  return out || fallback;
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
  /**
   * Injectable client sender (defaults to sendClientSms). Separate from sendFn
   * because it is a different door with a different gate, and a test that wants
   * to watch the homeowner's rail should not have to stand in for the crew's.
   */
  clientSendFn?: (
    supabase: SupabaseClient,
    input: OrdinarySmsInput,
    deps: SmsDeps,
  ) => Promise<SendPartySmsResult>;
}

interface RunSummary {
  digests_sent: number;
  delivery_confirms_sent: number;
  parties_skipped: number;
  deferred_flushed: number;
  /** Site cards put on the wire this run (contract P4). */
  site_cards_sent: number;
  /** Morning asks put on the wire this run (contract P4). */
  day_of_sent: number;
  /** "Crew on the way" posts written to a project thread this run. */
  crew_posts: number;
  /** Selection batches presented to a homeowner this run (contract P24). */
  client_batches_sent: number;
  /** 72h nudges on an unanswered batch this run. One per batch, ever. */
  client_reminders_sent: number;
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

/**
 * The instant a named local clock time falls on, on a named local day, in a
 * named zone. Walked forward in quarter-hours through the zone for the same
 * reason nextSendWindowStart is: 17:00 local is not a fixed distance from any
 * UTC hour, and the two nights a year it moves are exactly the nights a crew is
 * least able to shrug off a text that came at the wrong time.
 *
 * Returns null when the day cannot be found (a malformed date), which callers
 * treat as "no expiry I can justify" rather than guessing one.
 */
export function localMomentOnDay(
  day: string,
  minutes: number,
  tz: string,
): Date | null {
  const midnightUtc = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(midnightUtc)) return null;
  const STEP_MS = 15 * 60 * 1000;
  // Start a day early: for any zone west of UTC the local day begins after the
  // UTC one, and for any zone east of it, before.
  let t = midnightUtc - 24 * 3600 * 1000;
  for (let i = 0; i <= 2 * 96; i++, t += STEP_MS) {
    const at = new Date(t);
    if (
      localDayInTimezone(at, tz) === day &&
      localMinutesInTimezone(at, tz) >= minutes
    ) return at;
  }
  return null;
}

async function promptRef(supabase: SupabaseClient, party: {id: string; project_id: string; phone_e164: string | null},
  subjectId: string, kind: string, version: number, sender: string, now: Date, ownsClaim?: () => Promise<boolean>,
  expiresAt?: Date) {
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
    p_recipient_phone: party.phone_e164,
    p_expires_at: (expiresAt ?? new Date(now.getTime() + 48 * 3600000)).toISOString(), p_proposed_effect: null });
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
  const sendClient = deps.clientSendFn ?? sendClientSms;
  const flush = deps.flushFn ?? flushDeferredMessages;
  // The zone the trade rail's hours are named in — the same one quiet hours and
  // the cadence day are read out of.
  const fieldTz = (deps.getEnv ?? ((k: string) => Deno.env.get(k)))("FIELD_TZ") ??
    "America/Chicago";

  const summary: RunSummary = {
    digests_sent: 0,
    delivery_confirms_sent: 0,
    parties_skipped: 0,
    deferred_flushed: 0,
    site_cards_sent: 0,
    day_of_sent: 0,
    crew_posts: 0,
    client_batches_sent: 0,
    client_reminders_sent: 0,
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

  // ── Site visits: the card the evening before, the ask in the morning ──────
  // A scheduled site visit is a field party the project expects on site on a
  // day (project_parties.on_site_from/on_site_to, 00624) with an open task of
  // theirs due that day — the work they are coming to do. The task is also what
  // the prompt is ABOUT: a reply has to report arrival, delay, a problem or
  // departure AGAINST something, and 00639 binds that subject immutably at
  // issuance. No task due that day means nothing to report against, so no card.
  //
  // Asked BEFORE any prompt is allocated, because a phase-0 server that issued
  // short codes for cards it will never send would burn 00639's 90-day
  // reservations on silence.
  if (fieldLinePhase(deps) >= 1) {
    const localMinutes = localMinutesInTimezone(now, fieldTz);
    const localToday = localDayInTimezone(now, fieldTz);
    // Tomorrow is the LOCAL day after today's LOCAL day, incremented as a
    // calendar date and not by adding 24 hours to an instant: on the night the
    // zone shifts, 24 hours is 23 or 25 local ones and lands on the wrong date.
    const [ty, tm, td] = localToday.split("-").map(Number);
    const localTomorrow = new Date(Date.UTC(ty, tm - 1, td + 1))
      .toISOString().slice(0, 10);
    const due: Array<{ kind: "site_card" | "day_of"; day: string }> = [];
    if (localMinutes >= SITE_CARD_LOCAL_MINUTES) {
      due.push({ kind: "site_card", day: localTomorrow });
    }
    if (localMinutes >= DAY_OF_LOCAL_MINUTES) {
      due.push({ kind: "day_of", day: localToday });
    }

    for (const card of due) {
      const { data: onSite } = await supabase
        .from("project_parties")
        .select("id, phone_e164, project_id, party_kind, on_site_from, on_site_to")
        .in("party_kind", FIELD_KINDS)
        .lte("on_site_from", card.day)
        .gte("on_site_to", card.day);

      for (
        const party of (onSite ?? []) as Array<{
          id: string;
          phone_e164: string | null;
          project_id: string;
        }>
      ) {
        if (!party.phone_e164 || !conversationNumber) continue;
        if (!(await mayTextField(supabase, party, conversationNumber))) continue;
        const conv = await findOrCreateConversation(
          supabase, conversationNumber, party.phone_e164, party.id, party.project_id,
        );
        if (!conv || (conv.paused_until && Date.parse(conv.paused_until) > now.getTime())) continue;

        const { data: tasks } = await supabase
          .from("project_tasks")
          .select("id, title, due_date, project_id, status")
          .eq("owner_party_id", party.id)
          .eq("due_date", card.day)
          .neq("status", "done")
          .order("id", { ascending: true })
          .limit(1);
        const visitTask = (tasks ?? [])[0] as { id: string } | undefined;
        if (!visitTask) continue;

        const version = Number(card.day.replaceAll("-", ""));
        // ONE OPEN TRADE PROMPT AT A TIME. The card and the morning ask both end
        // in codeless words ("HERE", "ON MY WAY"), and a codeless reply binds to
        // a single open prompt — so the card's question has to be closed by the
        // time the morning takes the question over. The card expires exactly when
        // the ask is due; the ask expires the following morning, by which time
        // the visit is over.
        const [ny, nm, nd] = card.day.split("-").map(Number);
        const dayAfter = new Date(Date.UTC(ny, nm - 1, nd + 1)).toISOString().slice(0, 10);
        const expiresAt = localMomentOnDay(
          card.kind === "site_card" ? card.day : dayAfter,
          DAY_OF_LOCAL_MINUTES,
          fieldTz,
        );
        if (!expiresAt) continue;
        const prompt = await promptRef(
          supabase, party, visitTask.id, card.kind, version, conversationNumber, now,
          undefined, expiresAt,
        );
        if (!prompt) continue;

        const { data: project } = await supabase
          .from("projects").select("site_address").eq("id", party.project_id).maybeSingle();
        const { data: accessCard } = await supabase
          .from("project_site_access_cards")
          .select("site_hours, site_notes, emergency_lines")
          .eq("project_id", party.project_id)
          .maybeSingle();
        const lines = (accessCard as { emergency_lines?: unknown } | null)?.emergency_lines;
        const firstLine = Array.isArray(lines)
          ? lines.map((l) => typeof l === "string" ? l : String((l as { phone?: unknown })?.phone ?? ""))
            .find((l) => l.trim().length > 0)
          : undefined;

        const vars: Record<string, unknown> = {
          site_address: cardParam(
            (project as { site_address?: string } | null)?.site_address, 36, "the job site",
          ),
          visit_window: cardParam(
            (accessCard as { site_hours?: string } | null)?.site_hours, 11, "all day",
          ),
          // The number they are already texting is a number they can call, and
          // it is the studio's. No emergency line configured is not a reason to
          // print nothing where a phone number belongs.
          contact: cardParam(firstLine, 24, conversationNumber),
        };
        if (card.kind === "site_card") {
          vars.visit_day = cardParam(formatDue(card.day), 10, "tomorrow");
          vars.access_note = cardParam(
            (accessCard as { site_notes?: string } | null)?.site_notes, 32,
            "Check in at the front",
          );
        }

        const res = await send(
          supabase,
          {
            partyId: party.id,
            projectId: party.project_id,
            templateKey: card.kind === "site_card" ? "sms_site_card" : "sms_day_of",
            dedupeKey: `field-${card.kind}:${party.id}:${card.day}`,
            automationPhase: 1,
            // One of the three event texts a party gets in a day (contract P5).
            cadenceClass: "event",
            vars,
          },
          deps,
        );
        if (!res.sent && !res.deferred) continue;
        if (card.kind === "site_card") summary.site_cards_sent++;
        else summary.day_of_sent++;

        // The crew is on the way, and the room that needs to know is the
        // PROJECT THREAD — the studio and the client read it in the portal.
        // NO HOMEOWNER TEXT: this loop only ever writes to field parties
        // (FIELD_KINDS above), and the client's copy of this fact is this post.
        // The thread is never created here: comms_threads.created_by is a real
        // person and a cron is not one.
        if (card.kind === "day_of" && await postCrewOnTheWay(
          supabase, conv, party.project_id, card.day, now,
        )) summary.crew_posts++;
      }
    }
  }

  // ── The homeowner's picks: one ask a day, one nudge, then quiet (P24) ──────
  // A studio decides WHAT to ask her; this cron decides only WHEN, and its whole
  // job is restraint. A homeowner is not a crew: she has no shift, no dispatch
  // and no obligation to answer a phone at 7am, so her rail has exactly one
  // question open at a time, presents at most one new list per local day, nudges
  // it once after three days, and then says nothing at all until she answers or
  // the studio does something. Every send still meets the same gate the letter
  // met — phase 2, the campaign flag, her consent record, the pace guard and the
  // dead-end detector — inside sendClientSms.
  //
  // Asked behind the phase gate BEFORE any row is written, for 00639's reason:
  // a server at phase 0 or 1 that opened batches and burned short codes for
  // texts it will never send would spend the reservations on silence.
  if (fieldLinePhase(deps) >= 2 && conversationNumber) {
    const localToday = localDayInTimezone(now, fieldTz);
    const { data: clientSeats } = await supabase
      .from("project_parties")
      .select("id, phone_e164, project_id, display_name, party_kind")
      .eq("party_kind", "client");

    for (
      const seat of (clientSeats ?? []) as Array<{
        id: string;
        phone_e164: string | null;
        project_id: string;
      }>
    ) {
      if (!seat.phone_e164) continue;
      // The thread, and the pause a handoff may have put on it. A homeowner
      // whose last message went to her designer is waiting on a person; texting
      // her a fresh list over the top of that is the loudest possible answer.
      const conv = await findOrCreateConversation(
        supabase, conversationNumber, seat.phone_e164, seat.id, seat.project_id,
      );
      if (!conv || (conv.paused_until && Date.parse(conv.paused_until) > now.getTime())) continue;

      const { data: openRows } = await supabase
        .from("client_decision_batches")
        .select("id, project_id, party_id, version, presented_at, presented_local_day, reminder_sent_at, closed_at")
        .eq("party_id", seat.id)
        .is("closed_at", null)
        .order("presented_at", { ascending: false })
        .limit(1);
      const openBatch = (openRows ?? [])[0] as ClientBatch | undefined;

      if (openBatch) {
        // ONE NUDGE, THEN SILENCE. Not a second list, not a daily reminder:
        // reminder_sent_at is stamped once and this branch never fires again for
        // this batch, so an unanswered ask ends in quiet rather than in nagging.
        if (openBatch.reminder_sent_at) continue;
        if (Date.parse(openBatch.presented_at) + CLIENT_REMINDER_MS > now.getTime()) continue;
        const ask = await openClientAsk(supabase, seat, openBatch.id, now);
        // NO NEW REFERENCE FOR A NUDGE, and none for a list that moved. The
        // reference she already has is the one she was given (00639 binds the
        // version at issuance); if the batch has since been re-versioned, a text
        // pointing at the old reference would only earn her a stale_version
        // refusal, and re-presenting is the studio's call, not this cron's.
        if (!ask || ask.version !== openBatch.version) continue;
        const letter = await liveClientLetter(supabase, seat);
        if (!letter) continue;
        const vars = await selectionVars(supabase, seat, openBatch, ask.short_code);
        if (!vars) continue;
        const res = await sendClient(supabase, {
          partyId: seat.id,
          projectId: seat.project_id,
          templateKey: "sms_selection_ready",
          clientInvitationId: letter.id,
          dedupeKey: `client-batch-reminder:${openBatch.id}`,
          vars,
        }, deps);
        if (!res.sent && !res.deferred) continue;
        // Stamped AFTER the wire claim, and guarded on still being NULL: the
        // dedupe key above is what makes a retry harmless, so the honest order
        // is "the text is claimed, therefore the nudge is spent".
        await supabase
          .from("client_decision_batches")
          .update({ reminder_sent_at: now.toISOString() })
          .eq("id", openBatch.id)
          .is("reminder_sent_at", null);
        summary.client_reminders_sent++;
        continue;
      }

      // ONE ASK PER LOCAL DAY, presented or already answered. 00651's partial
      // unique index enforces one OPEN batch per day; this read is the other
      // half — a batch she answered this morning still spends the day, so she is
      // never asked twice between two sunrises.
      const { data: todays } = await supabase
        .from("client_decision_batches")
        .select("id")
        .eq("party_id", seat.id)
        .eq("presented_local_day", localToday)
        .limit(1);
      if ((todays ?? []).length) continue;

      const letter = await liveClientLetter(supabase, seat);
      if (!letter) continue;
      const picks = await presentableDecisions(supabase, seat, letter.designer_client_id);
      if (!picks.length) continue;

      const batchId = crypto.randomUUID();
      const { error: batchError } = await supabase
        .from("client_decision_batches")
        .insert({
          id: batchId,
          project_id: seat.project_id,
          party_id: seat.id,
          decision_ids: picks.map((d) => d.id),
          version: 1,
          presented_at: now.toISOString(),
          // THE SENDER COMPUTES THE LOCAL DAY, in the zone the rail is named in
          // — 00645's convention, for the same reason: twice a year the offset
          // moves and "now minus six hours" names the wrong date.
          presented_local_day: localToday,
          // WHAT SHE WAS SHOWN, as she was shown it. The options can move after
          // the text goes out (that is what the version bump is for), so the
          // presented set is written down rather than reconstructed later.
          presented_snapshot: {
            presented_at: now.toISOString(),
            room_id: picks[0].room_id,
            decisions: picks.map((d) => ({
              id: d.id,
              title: d.title,
              room_id: d.room_id,
              option_id: d.option_id,
            })),
          },
        });
      // The index refused it: another tick of this same cron got there first.
      if (batchError) continue;

      const ask = await promptRef(
        supabase, seat, batchId, "selection_batch", 1, conversationNumber, now,
        undefined, new Date(now.getTime() + CLIENT_ASK_TTL_MS),
      );
      if (!ask) {
        await supabase.from("client_decision_batches").delete().eq("id", batchId);
        continue;
      }
      const vars = await selectionVars(supabase, seat, { id: batchId, version: 1 }, ask.short_code);
      const res = vars
        ? await sendClient(supabase, {
          partyId: seat.id,
          projectId: seat.project_id,
          templateKey: "sms_selection_ready",
          clientInvitationId: letter.id,
          dedupeKey: `client-batch:${batchId}`,
          vars,
        }, deps)
        : null;
      if (!res || (!res.sent && !res.deferred)) {
        // NOTHING WENT OUT, SO NOTHING WAS ASKED. A batch and a reference left
        // standing behind a refused send would tell every later tick that this
        // homeowner has an open question, silence her for the day, and — after
        // three days — earn her a nudge about a list she was never sent. So the
        // two rows this tick wrote are taken back, in the order that never
        // leaves a prompt pointing at a batch that is gone.
        await supabase.from("sms_prompts").delete().eq("id", ask.id);
        await supabase.from("client_decision_batches").delete().eq("id", batchId);
        continue;
      }
      summary.client_batches_sent++;
    }
  }

  // ── Flush deferred outbound rows ──────────────────────────────────────────
  const flushed = await flush(supabase, deps);
  summary.deferred_flushed = flushed.flushed;

  return summary;
}

interface ClientBatch {
  id: string;
  version: number;
  presented_at: string;
  reminder_sent_at?: string | null;
}

/** The reference she already holds for an open batch, if one is still live. */
async function openClientAsk(
  supabase: SupabaseClient,
  seat: { id: string; project_id: string; phone_e164: string | null },
  batchId: string,
  now: Date,
): Promise<{ id: string; short_code: string; version: number } | null> {
  const { data } = await supabase
    .from("sms_prompts")
    .select("id, short_code, version")
    .eq("party_id", seat.id)
    .eq("project_id", seat.project_id)
    .eq("subject_id", batchId)
    .eq("kind", "selection_batch")
    .is("answered_at", null)
    .is("voided_at", null)
    .gt("expires_at", now.toISOString())
    .order("version", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as
    | { id: string; short_code: string; version: number }
    | undefined;
  return row ?? null;
}

/**
 * The letter this homeowner is reading from, and the household it speaks for.
 *
 * THE SAME PREDICATE apply_client_effect APPLIES (00651:530, contract P14): not
 * revoked, not superseded. Deliberately NOT the invitation's expires_at — the
 * capability carries its own lifetime and create_client_link is the authority on
 * it, so refusing here on a different clock would make the rail and the database
 * disagree about who may be written to.
 */
async function liveClientLetter(
  supabase: SupabaseClient,
  seat: { project_id: string; phone_e164: string | null },
): Promise<{ id: string; designer_client_id: string } | null> {
  if (!seat.phone_e164) return null;
  const { data } = await supabase
    .from("client_invitations")
    .select("id, designer_client_id, sent_at, revoked_at, superseded_by, phone, project_id")
    .eq("project_id", seat.project_id)
    .eq("phone", seat.phone_e164)
    .is("revoked_at", null)
    .is("superseded_by", null)
    .order("sent_at", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as
    | { id: string; designer_client_id: string | null }
    | undefined;
  return row?.id && row.designer_client_id
    ? { id: row.id, designer_client_id: row.designer_client_id }
    : null;
}

/**
 * The picks that may be presented as ONE ask, room by room.
 *
 * EVERY CLAUSE HERE IS ONE apply_client_effect WILL APPLY (contract P14). A
 * batch holding a decision SQL refuses is worse than no batch at all: the
 * refusal is whole-batch, so one ineligible pick loses her the other four and
 * lands the reply on a designer's desk. So the eligibility test is the SQL's,
 * stated in the same order — client-court selection, no approval contract to
 * assent to, and exactly one recommended option, which is what "what she was
 * shown" means (00651:632).
 *
 * The household conjunct is 00652's: a letter speaks for ONE client record, and
 * a batch is built from that record's decisions only.
 */
async function presentableDecisions(
  supabase: SupabaseClient,
  seat: { project_id: string },
  designerClientId: string,
): Promise<Array<{ id: string; title: string; room_id: string | null; option_id: string }>> {
  const { data } = await supabase
    .from("client_decisions")
    .select("id, title, room_id, status, coordination_kind, court, approval_contract, designer_client_id, project_id, created_at")
    .eq("project_id", seat.project_id)
    .eq("designer_client_id", designerClientId)
    .eq("coordination_kind", "selection")
    .eq("court", "client")
    .eq("status", "pending")
    .is("approval_contract", null)
    .order("created_at", { ascending: true });
  const rows = (data ?? []) as Array<{
    id: string;
    title: string | null;
    room_id: string | null;
  }>;
  if (!rows.length) return [];

  const { data: optionRows } = await supabase
    .from("client_decision_options")
    .select("id, decision_id, is_recommended, sort_order")
    .in("decision_id", rows.map((r) => r.id));
  const shown = new Map<string, string[]>();
  for (
    const option of (optionRows ?? []) as Array<{
      id: string;
      decision_id: string;
      is_recommended: boolean | null;
    }>
  ) {
    if (option.is_recommended !== true) continue;
    shown.set(option.decision_id, [...(shown.get(option.decision_id) ?? []), option.id]);
  }
  const eligible = rows.flatMap((row) => {
    const options = shown.get(row.id) ?? [];
    return options.length === 1
      ? [{
        id: row.id,
        title: row.title ?? "a selection",
        room_id: row.room_id,
        option_id: options[0],
      }]
      : [];
  });
  if (!eligible.length) return [];

  // ONE ROOM PER ASK. "Three picks ready for the living room" is a sentence a
  // homeowner can act on; the same three spread across her whole house is a
  // to-do list. The biggest room group goes first and the rest wait for another
  // day — which the one-a-day rule above turns into an orderly queue.
  const byRoom = new Map<string, typeof eligible>();
  for (const pick of eligible) {
    const key = pick.room_id ?? "";
    byRoom.set(key, [...(byRoom.get(key) ?? []), pick]);
  }
  let chosen: typeof eligible = [];
  for (const group of byRoom.values()) {
    if (group.length > chosen.length) chosen = group;
  }
  return chosen.slice(0, CLIENT_BATCH_MAX);
}

/**
 * The copy's parameters, budgeted. studio_name first and plain words after it —
 * the homeowner's copy rule, and every body ends in the canonical closing line
 * the migration appended. {{link}} is NOT set here: the capability is minted at
 * dispatch off the invitation id (contract S6), so a deferred letter mints its
 * own link at 8am rather than storing one overnight.
 */
async function selectionVars(
  supabase: SupabaseClient,
  seat: { id: string; project_id: string },
  batch: { id: string; version: number },
  ref: string,
): Promise<Record<string, unknown> | null> {
  const { data: batchRow } = await supabase
    .from("client_decision_batches")
    .select("id, decision_ids, presented_snapshot, version")
    .eq("id", batch.id)
    .maybeSingle();
  const ids = ((batchRow as { decision_ids?: string[] } | null)?.decision_ids ?? []) as string[];
  if (!ids.length) return null;
  const snapshot = (batchRow as { presented_snapshot?: { room_id?: string | null } } | null)
    ?.presented_snapshot ?? null;
  let room = "your project";
  if (snapshot?.room_id) {
    const { data: roomRow } = await supabase
      .from("project_rooms")
      .select("name")
      .eq("id", snapshot.room_id)
      .maybeSingle();
    const name = (roomRow as { name?: string } | null)?.name;
    if (name && name.trim()) room = name.trim();
  }
  return {
    studio_name: cardParam(
      await resolveStudioName(supabase, seat.project_id) ?? undefined, 24, "Your studio",
    ),
    picks: `${ids.length} pick${ids.length === 1 ? "" : "s"}`,
    room: cardParam(room, 24, "your project"),
    ref,
  };
}

/**
 * Record "crew on the way" on the project's own thread, once per visit day.
 * Portal-visible, written as a system message (no human author), and idempotent
 * through the same conversation-context CAS the delivery confirms dedupe with.
 */
async function postCrewOnTheWay(
  supabase: SupabaseClient,
  conv: ProjectContext,
  projectId: string,
  day: string,
  now: Date,
): Promise<boolean> {
  const priorRaw = (conv.state_context as { crew_posts_sent?: unknown }).crew_posts_sent;
  const prior = Array.isArray(priorRaw) ? priorRaw.map(String) : [];
  if (prior.includes(day)) return false;
  const { data: thread, error: threadError } = await supabase
    .from("comms_threads")
    .select("id")
    .eq("project_id", projectId)
    .eq("kind", "project")
    .order("created_at", { ascending: true })
    .limit(1);
  if (threadError) return false;
  const threadId = (thread ?? [])[0]?.id as string | undefined;
  if (!threadId) return false;
  // Claim the day BEFORE writing the post: a post written twice is two
  // notifications for one fact, and a claim taken for a post that then failed
  // to write is one missing line in a thread a person is reading anyway.
  if (!await saveContext(supabase, conv, {
    ...conv.state_context,
    crew_posts_sent: [...prior, day],
  })) return false;
  const { error } = await supabase.from("comms_messages").insert({
    thread_id: threadId,
    sender_id: null,
    system: true,
    body: `Crew on the way for ${formatDue(day)}.`,
    created_at: now.toISOString(),
  });
  if (error) {
    console.error("postCrewOnTheWay: the project thread post failed", error);
    return false;
  }
  return true;
}
