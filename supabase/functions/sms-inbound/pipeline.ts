// sms-inbound/pipeline.ts — the Field Coordination inbound-SMS pipeline (the
// signature-verified core of the sms-inbound webhook). Factored out of index.ts
// so it imports without starting a server (unit-testable with an injected
// supabase + parser).
//
// Pipeline order is LOAD-BEARING (compliance first, LLM last):
//   (c) idempotency: INSERT sms_messages ON CONFLICT (twilio_sid) DO NOTHING —
//       a duplicate MessageSid returns 200 empty TwiML and does nothing
//   (d) COMPLIANCE KEYWORDS before anything else (STOP/START/YES/HELP) —
//       each writes studio_channel_consent (00594) and nothing else, once per
//       studio holding the number; project_parties.sms_consent_* is frozen
//       legacy and this rail no longer touches it (R-AS)
//   (e) resolve conversation + candidate parties by phone (unknown → brush-off)
//   (f) MMS: fetch each MediaUrl with Twilio auth → field-media
//   (g) deterministic parse: project-choice / confirmation / numbered menu
//   (h) LLM parse (Claude haiku forced tool-use, injectable) against open items
//   (i) confidence gate: >=0.8 apply + confirm · 0.5–0.8 park + clarify · <0.5
//       needs_review + "passed to {designer}"
//   (j) designer notification (notification-dispatch) for needs_review/flag_blocker
//   (k) PostHog sms_inbound_received + sms_parse_outcome
// Replies go back as TwiML; every reply is ALSO logged as an outbound row.
// (Steps (a) raw-body + (b) X-Twilio-Signature live in index.ts, before this.)

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseFieldMessage, type FieldParseInput, type FieldParseResult } from "../_shared/field-parse.ts";
import { renderTemplateFromDb } from "../_shared/render-template.ts";
import { channelConsentDecision, channelConsentVerdict, fieldLineCampaignApproved, fieldLinePhase, orgsOfProjects, resolveStudioName, recoverSmsSelection, sendPartySms } from "../_shared/sms.ts";
import { captureServerEvent } from "../_shared/aesthete-events.ts";

import type { SelectionIntent, SelectionQuestion } from "../_shared/sms-selection.ts";

const FIELD_KINDS = ["gc", "sub", "installer", "receiver"];
const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const PLAIN_STOPS = /^(?:stop texting me|wrong number|wrong)[.!]?$/i;
const START_WORDS = ["START", "UNSTOP"];
const MENU_TTL_MS = 12 * 3600 * 1000;
/** The prompts whose own copy prints the trade words (00645). */
const TRADE_PROMPT_KINDS = new Set(["site_card", "day_of"]);
/** The one-line "here is your link" reply (00645). */
const RENEW_TEMPLATE = "sms_field_link_renew";
/** How long an explicitly-chosen project stays the conversation's scope. */
const PROJECT_PIN_TTL_MS = 4 * 3600 * 1000;

export interface InboundParams {
  From: string;
  To: string;
  Body: string;
  MessageSid: string;
  NumMedia?: string;
  [k: string]: string | undefined;
}

export interface InboundDeps {
  supabase: SupabaseClient;
  getEnv?: (k: string) => string | undefined;
  fetchImpl?: typeof fetch;
  now?: Date;
  /** Injectable LLM parser (defaults to parseFieldMessage). */
  parseFn?: (input: FieldParseInput, deps?: unknown) => Promise<FieldParseResult>;
}

export interface InboundResult {
  status: number;
  twiml: string;
  /** For tests: what the pipeline decided. */
  disposition?: string;
  /** Ordinary replies are dispatched by index.ts through the shared send gate. */
  replies?: Array<{ message: string; partyId: string | null; projectId: string | null;
    templateKey?: string; vars?: Record<string, unknown> }>;
  selection?: SelectionIntent;
  messageId?: string;
  /** A failed receipt/handoff must never replay an already committed effect. */
  effectApplied?: boolean;
  /** An atomic RPC may have committed; keep its inbound identity for reconciliation. */
  retainSid?: boolean;
}

// ── TwiML ────────────────────────────────────────────────────────────────────
export function twimlBody(message?: string): string {
  if (!message) return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  const esc = message
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${esc}</Message></Response>`;
}

// ── form parsing ─────────────────────────────────────────────────────────────
export function parseForm(raw: string): Record<string, string> {
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(raw).entries()) params[k] = v;
  return params;
}

// ── conversation / logging helpers ───────────────────────────────────────────
interface Conversation {
  id: string;
  active_project_id: string | null;
  party_id: string | null;
  state: string;
  // These fields are hydrated only from the service-owned context table.
  state_context: Record<string, unknown>;
  context?: ConversationContext;
}

interface ConversationContext {
  conversation_id: string;
  project_id: string | null;
  party_id: string | null;
  state: string;
  state_context: Record<string, unknown>;
  paused_until: string | null;
  backfilled_at: string | null;
}

function contextKey(query: any, conversationId: string, projectId: string | null) {
  query = query.eq("conversation_id", conversationId);
  return projectId === null ? query.is("project_id", null) : query.eq("project_id", projectId);
}

async function readContext(supabase: SupabaseClient, conversationId: string, projectId: string | null) {
  const { data, error } = await contextKey(supabase.from("sms_conversation_context").select("*"), conversationId, projectId).maybeSingle();
  if (error) throw error;
  return data as ConversationContext | null;
}

async function ensureContext(supabase: SupabaseClient, conversationId: string, projectId: string | null, partyId: string | null) {
  const prior = await readContext(supabase, conversationId, projectId);
  if (prior) {
    if (projectId && prior.party_id !== partyId) throw new Error("context_party_changed");
    return prior;
  }
  const { error } = await supabase.from("sms_conversation_context").upsert({
    conversation_id: conversationId, project_id: projectId, party_id: partyId,
    state: "idle", state_context: {}, paused_until: null, backfilled_at: null,
  }, { onConflict: "conversation_id,project_id", ignoreDuplicates: true });
  if (error) throw error;
  const row = await readContext(supabase, conversationId, projectId);
  if (!row) throw new Error("context_not_persisted");
  if (projectId && row.party_id !== partyId) throw new Error("context_party_changed");
  return row;
}

/** Match the entire question snapshot, not merely the state (SQ-73). */
function contextSnapshot(query: any, row: ConversationContext) {
  query = contextKey(query, row.conversation_id, row.project_id)
    .eq("state", row.state).eq("state_context", JSON.stringify(row.state_context));
  query = row.party_id === null ? query.is("party_id", null) : query.eq("party_id", row.party_id);
  return row.backfilled_at === null ? query.is("backfilled_at", null) : query.eq("backfilled_at", row.backfilled_at);
}

function useContext(conv: Conversation, row: ConversationContext | null) {
  conv.context = row ?? undefined;
  conv.state = row?.state ?? "idle";
  conv.state_context = row?.state_context ?? {};
  conv.active_project_id = row?.project_id ?? null;
  conv.party_id = row?.party_id ?? null;
}

async function pausedReview(supabase: SupabaseClient, conversationId: string, projectId: string,
  partyId: string, messageId: string, deps: InboundDeps): Promise<InboundResult | null> {
  let context: ConversationContext | null;
  try { context = await readContext(supabase, conversationId, projectId); }
  catch { return completionUnknown(messageId, "context_unreadable"); }
  if (!context?.paused_until || new Date(context.paused_until).getTime() <= (deps.now ?? new Date()).getTime()) return null;
  const owned = await ownedReview(supabase, messageId, projectId, partyId,
    { path: "paused", paused_until: context.paused_until }, deps);
  return { status: owned ? 200 : 503, twiml: twimlBody(), disposition: owned ? "paused" : "handoff_failed", messageId };
}

async function findOrCreateConversation(
  supabase: SupabaseClient,
  twilioNumber: string,
  phone: string,
): Promise<Conversation> {
  const { data: existing } = await supabase
    .from("sms_conversations")
    .select("id, active_project_id, party_id")
    .eq("twilio_number", twilioNumber)
    .eq("phone_e164", phone)
    .maybeSingle();
  if ((existing as Conversation | null)?.id) return { ...existing, state: "idle", state_context: {} } as Conversation;

  const { data: created, error } = await supabase
    .from("sms_conversations")
    .insert({ twilio_number: twilioNumber, phone_e164: phone })
    .select("id, active_project_id, party_id")
    .single();
  if (error || !created) {
    // Lost a create race — re-read rather than dereference a null row.
    const { data: retry } = await supabase
      .from("sms_conversations")
      .select("id, active_project_id, party_id")
      .eq("twilio_number", twilioNumber)
      .eq("phone_e164", phone)
      .maybeSingle();
    return { ...retry, state: "idle", state_context: {} } as Conversation;
  }
  return { ...created, state: "idle", state_context: {} } as Conversation;
}

async function logOutbound(
  supabase: SupabaseClient,
  conversationId: string,
  body: string,
  partyId: string | null,
  projectId: string | null,
): Promise<void> {
  await supabase.from("sms_messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    body,
    twilio_sid: null,
    twilio_status: "twiml",
    party_id: partyId,
    project_id: projectId,
  });
  await supabase
    .from("sms_conversations")
    .update({ last_outbound_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/** Reply with a TwiML <Message> AND log it as an outbound row. */
async function reply(
  supabase: SupabaseClient,
  conversationId: string,
  message: string,
  partyId: string | null,
  projectId: string | null,
  disposition: string,
  recipe?: { templateKey: string; vars: Record<string, unknown> },
): Promise<InboundResult> {
  if (disposition === "help" || disposition === "opted_out") {
    await logOutbound(supabase, conversationId, message, partyId, projectId);
    return { status: 200, twiml: twimlBody(message), disposition };
  }
  return { status: 200, twiml: twimlBody(message), disposition,
    replies: [{ message, partyId, projectId, ...recipe }] };
}

async function renderSms(
  supabase: SupabaseClient,
  slug: string,
  vars: Record<string, unknown>,
): Promise<string> {
  const rendered = await renderTemplateFromDb(supabase, slug, vars);
  return rendered?.html?.trim() || rendered?.subject?.trim() || "";
}

// ── keyword compliance ───────────────────────────────────────────────────────
// Consent is a fact about a (studio, channel value) pair (studio_channel_consent,
// migration 00594), not a per-party-row ledger. Every compliance keyword writes
// that record, once per studio that holds the number, and writes nothing else:
// the record is the single source of truth (R-AS) and every reader — the send
// gate, v_project_roster, people_directory — reads it.
interface PhoneParty {
  id: string;
  project_id: string;
  /** The roster identity of the seat (00419). A homeowner is `client`. */
  party_kind: string | null;
}

/**
 * Every party row on this number, with `failed` saying the read ERRORED rather
 * than came back empty (R-AM, r7 R7-M3). A swallowed error here is a keyword
 * that reaches no studio at all: the target list comes back empty, no consent
 * record is written, and the branch still answers Twilio 200.
 */
async function loadPhoneParties(
  supabase: SupabaseClient,
  phone: string,
): Promise<{ parties: PhoneParty[]; failed: boolean }> {
  const { data, error } = await supabase
    .from("project_parties")
    .select("id, project_id, party_kind")
    .eq("phone_e164", phone);
  if (error) {
    console.error("loadPhoneParties: project_parties read failed", {
      phone,
      error,
    });
    return { parties: [], failed: true };
  }
  return { parties: (data ?? []) as PhoneParty[], failed: false };
}

interface StudioTarget {
  org: string;
  /**
   * A project in that studio, cited as the consent record's origin. NULL for a
   * studio that holds a consent record but no seat on this number — the record
   * keeps whatever origin it already had.
   */
  projectId: string | null;
  /** Every party row on this number belonging to that studio. */
  partyIds: string[];
}

/**
 * One entry per studio holding the number, with a project to cite as origin and
 * the studio's own party rows.
 *
 * The org is resolved the same way the SQL side resolves it (00594:141, :221):
 * studio_id, falling back to the designer's primary studio. Without the
 * fallback a project with a NULL studio_id gets a consent record written by the
 * migration that an inbound STOP could never reach — the record would keep
 * saying granted while the party rows went opted_out.
 *
 * `failed` says the ATTRIBUTION READ errored, not that no studio holds the
 * number (R-AM) — and it is returned rather than only logged (close-out r4
 * BLOCKING-1). orgsOfProjects() returns an EMPTY map when the `projects` select
 * errors, so a swallowed error here looks exactly like "no seat belongs to any
 * studio": the target list comes back short, the STOP is written for the
 * studios that happen to hold a RECORD on the number and for nobody else, and
 * the branch answered Twilio 200 with its twilio_sid claim intact — so the
 * retry was answered `duplicate` and the branch never ran again. A studio
 * holding a seat and no record (the ordinary case: "text updates" unticked, so
 * record_channel_invite is never called) then had its refusal lost outright,
 * and could later tick "text updates" and send an opt-in invite to a number
 * that has replied STOP to the platform. Since R-AS deleted
 * optOutAllForPhone()'s phone-global party write there is no backstop left.
 *
 * `unattributed` is the OTHER way a seat goes unreached, and it is a different
 * fact from `failed` (close-out r5 BLOCKING-1): nothing errored, the project
 * was read cleanly, and it simply belongs to no studio — `projects.studio_id`
 * is NULL and the designer holds no active design_studio membership, so
 * COALESCE(studio_id, _primary_studio_for(designer_id)) is NULL on both legs.
 * 00594's fold skips that project too (`WHERE org IS NOT NULL`), so there is no
 * record to reach either, and the seats are frozen — which left a STOP on such
 * a number acknowledged 200, recorded on NO ledger anywhere, with the next send
 * going out: channelConsentVerdict()'s no-studio branch finds no record and, R-AS
 * having deleted the phone-global seat write, no opted_out seat, so it answers
 * `unknown` and both the field-daily cron and sendPartySms's legacy leg honour
 * the frozen `granted` seat. Both room readers print "Not asked" for the same
 * person. There is no ledger this rail can write for a studio that does not
 * exist, so the honest answer is to refuse the acknowledgement and let Twilio
 * retry: an unrecordable refusal is loud instead of lost.
 */
async function studiosHoldingPhone(
  supabase: SupabaseClient,
  parties: PhoneParty[],
): Promise<{ targets: StudioTarget[]; failed: boolean; unattributed: boolean }> {
  const projectIds = [...new Set(parties.map((p) => p.project_id))];
  if (projectIds.length === 0) {
    return { targets: [], failed: false, unattributed: false };
  }
  // One resolver, shared with the send gate (_shared/sms.ts), so the two sides
  // of the rail cannot disagree about which studio a project belongs to.
  const { orgs: orgOfProject, failed } = await orgsOfProjects(
    supabase,
    projectIds,
  );
  // A seat whose studio could not be read is a studio this keyword will not
  // reach. Say so in the log AND hand the flag back, so the STOP branch can
  // refuse to acknowledge rather than act on a map that is short some entries
  // (R-AM). A START/YES wants the opposite: a short list there grants FEWER
  // studios, which leaves the standing refusal standing.
  if (failed) {
    console.error(
      "studiosHoldingPhone: some seats could not be attributed to a studio",
      { projectIds },
    );
  }

  const out: StudioTarget[] = [];
  const byOrg = new Map<string, StudioTarget>();
  // A seat that resolved to NO STUDIO AT ALL. Counted separately from `failed`
  // because the read was clean: there is simply no studio to write a ledger
  // for, which is not a thing a STOP may be acknowledged over.
  let unattributed = false;
  for (const p of parties) {
    const org = orgOfProject.get(p.project_id);
    if (!org) {
      unattributed = true;
      continue;
    }
    let target = byOrg.get(org);
    if (!target) {
      target = { org, projectId: p.project_id, partyIds: [] };
      byOrg.set(org, target);
      out.push(target);
    }
    target.partyIds.push(p.id);
  }
  if (unattributed) {
    console.error(
      "studiosHoldingPhone: some seats belong to no studio at all",
      { projectIds },
    );
  }
  return { targets: out, failed, unattributed };
}

/**
 * Studios that hold a consent record for this number WITHOUT holding a seat.
 *
 * studiosHoldingPhone() reads project_parties only, so a studio whose seat was
 * removed — or, once W2 lands, whose consent was recorded against a rolodex
 * card that never had a seat — is invisible to it. Its record then sits at
 * `granted` for ever while the number has said STOP, and the send gate acts on
 * that stale fact. A compliance keyword has to reach every record on the
 * number, seat or no seat.
 */
async function studiosHoldingRecord(
  supabase: SupabaseClient,
  phone: string,
  onlyVerdicts?: string[],
): Promise<{ orgs: string[]; failed: boolean }> {
  const { data, error } = await supabase
    .from("studio_channel_consent")
    .select("organization_id, status, refusal_unanswered")
    .eq("channel_kind", "sms")
    .eq("channel_value", phone);
  // A read that ERRORED is not "no studio holds a record" (R-AM, r7 R7-M3).
  // This is the one leg that reaches a record-only studio, and a record-only
  // studio has no party-row backstop by construction — swallowing the error
  // leaves its record saying `granted` after the number has said STOP, which
  // is the positive branch of the send gate.
  if (error) {
    console.error("studiosHoldingRecord: studio_channel_consent read failed", {
      phone,
      error,
    });
    return { orgs: [], failed: true };
  }
  const rows = (data ?? []) as Array<
    { organization_id: string; status: string; refusal_unanswered?: boolean | null }
  >;
  return {
    orgs: rows
      .filter((r) => !onlyVerdicts || onlyVerdicts.includes(recordVerdict(r)))
      .map((r) => r.organization_id),
    failed: false,
  };
}

/**
 * The record's VERDICT, which is not its `status` column (close-out r4 MAJOR-1).
 *
 * This is `channel_consent_status()` (00594:948-956) in TypeScript: an
 * unanswered refusal reads `opted_out` whatever the column says. The fold mints
 * records at `granted` and at `not_asked` with `refusal_unanswered = true` on
 * purpose (00594:655-666, the r8 W4-M1 shape — a legacy seat reading granted
 * while a sibling carries a dated opt-out no later consent answered), and every
 * studio-side door correctly refuses them. The design's whole answer for such a
 * record is the recipient's own START, and the START target filter used to read
 * the raw column, so the one writer that can lower the flag could never reach
 * the population the flag was invented for: the number was unsendable for ever,
 * while the party sheet told the designer "Only they can rejoin by replying
 * START". The rail now asks the same question the room asks.
 */
function recordVerdict(
  row: { status: string; refusal_unanswered?: boolean | null },
): string {
  return row.refusal_unanswered === true ? "opted_out" : row.status;
}

/** Seat-derived targets first, then any record-only studio, once each. */
function withRecordOnlyStudios(
  targets: StudioTarget[],
  orgs: string[],
): StudioTarget[] {
  const seen = new Set(targets.map((t) => t.org));
  const out = [...targets];
  for (const org of orgs) {
    if (seen.has(org)) continue;
    seen.add(org);
    out.push({ org, projectId: null, partyIds: [] });
  }
  return out;
}

/**
 * The disclosure version and the recorder standing on THIS studio's own seats
 * for this number — the evidence half of the consent record the inbound rail
 * cannot know by itself (R-AN). Scoped to the target's own party rows, so one
 * studio's disclosure never becomes another studio's evidence.
 */
async function seatConsentEvidence(
  supabase: SupabaseClient,
  partyIds: string[],
): Promise<{ disclosureVersion: string | null; recordedBy: string | null }> {
  if (partyIds.length === 0) {
    return { disclosureVersion: null, recordedBy: null };
  }
  const { data, error } = await supabase
    .from("project_parties")
    .select("sms_consent_disclosure_version, sms_consent_recorded_by")
    .in("id", partyIds);
  if (error) {
    console.error("seatConsentEvidence: project_parties read failed", error);
    return { disclosureVersion: null, recordedBy: null };
  }
  const rows = (data ?? []) as Array<{
    sms_consent_disclosure_version?: string | null;
    sms_consent_recorded_by?: string | null;
  }>;
  return {
    disclosureVersion:
      rows.find((r) => r.sms_consent_disclosure_version)
        ?.sms_consent_disclosure_version ?? null,
    recordedBy: rows.find((r) => r.sms_consent_recorded_by)
      ?.sms_consent_recorded_by ?? null,
  };
}

async function writeChannelConsent(
  supabase: SupabaseClient,
  targets: StudioTarget[],
  phone: string,
  status: "granted" | "opted_out",
  now: string,
  evidence: string,
): Promise<{ failed: boolean }> {
  let failed = false;
  for (const t of targets) {
    // Read-then-upsert so a date already earned survives the new verdict:
    // "granted 2 May 2025, opted out 3 Dec 2025" must both stay printable.
    const { data: existing, error: priorError } = await supabase
      .from("studio_channel_consent")
      .select(
        "consented_at, opt_out_at, source, evidence, recorded_at, " +
          "disclosure_version, recorded_by, " +
          "opt_out_source, opt_out_evidence, opt_out_recorded_at, " +
          "opt_out_recorded_by, origin_project_id",
      )
      .eq("organization_id", t.org)
      .eq("channel_kind", "sms")
      .eq("channel_value", phone)
      .maybeSingle();
    // THIS READ IS LOAD-BEARING, so it is not allowed to fail quietly (R-AM).
    // Everything the upsert carries forward comes off it, and a read that
    // errored looks exactly like "no record yet" — the one case in which the
    // refusal below is allowed to write the consent side. So an unreadable
    // prior skips the write entirely and says so; the caller decides whether
    // that is worth refusing the whole act over.
    if (priorError) {
      console.error(
        "writeChannelConsent: the standing record could not be read — skipping this studio",
        { org: t.org, phone, status, error: priorError },
      );
      failed = true;
      continue;
    }
    const hadRecord = existing != null;
    const prior = (existing ?? {}) as {
      consented_at?: string | null;
      opt_out_at?: string | null;
      source?: string | null;
      evidence?: string | null;
      recorded_at?: string | null;
      disclosure_version?: string | null;
      recorded_by?: string | null;
      opt_out_source?: string | null;
      opt_out_evidence?: string | null;
      opt_out_recorded_at?: string | null;
      opt_out_recorded_by?: string | null;
      origin_project_id?: string | null;
    };
    // WHICH DISCLOSURE THE PERSON WAS SHOWN, AND WHO RECORDED IT, ARE FACTS THE
    // RAIL DOES NOT HOLD — the studio does, on its own seats, from the portal's
    // own write. With no record yet (the ordinary case: W1a ships no hook that
    // writes one), carrying only `prior` minted a `granted` record with a NULL
    // disclosure version — and since R-AS the record is the only copy, so the
    // studio's 10DLC paperwork for that grant would exist nowhere.
    // record_channel_consent refuses a granted without a disclosure version
    // (00594); the rail's door falls back to the studio's own seats instead of
    // inventing one (R-AN).
    // Only a GRANT needs the studio's own paperwork behind it — R-AN scopes
    // this fallback to the inbound YES/START. On a refusal the consent side is
    // not written at all (below), so the seats are not read either.
    const seat = status === "granted"
      ? await seatConsentEvidence(supabase, t.partyIds)
      : { disclosureVersion: null, recordedBy: null };
    const keepsPriorConsent = status === "opted_out" && hadRecord;
    const { error: writeError } = await supabase
      .from("studio_channel_consent").upsert({
      organization_id: t.org,
      channel_kind: "sms",
      channel_value: phone,
      status,
      consented_at: status === "granted" ? now : (prior.consented_at ?? null),
      opt_out_at: status === "opted_out" ? now : (prior.opt_out_at ?? null),
      // 00594's stored "a refusal stands that the person has not answered".
      // A STOP raises it; the recipient's own YES/START is the ONLY thing that
      // lowers it, which is what reopens record_channel_consent's granted door.
      // It is a column rather than a test on opt_out_at because a refusal is
      // routinely dateless — the shipped portal writes opted_out party rows
      // with a NULL sms_opt_out_at on purpose, and the fold mints those
      // records verbatim, so a date test failed open for that whole population.
      refusal_unanswered: status === "opted_out",
      // A REFUSAL WRITES NONE OF THE CONSENT'S FIVE (00594:159-170, r6 R6-M1,
      // r7 R7-M1). These five columns are the GRANT's own 10DLC artifact — how
      // the consent arrived, the words the person agreed to, and when the
      // studio wrote them down. Written unconditionally, an ordinary STOP over
      // a number the studio holds a signed grant for restated that grant as
      // "arrived by text, today", with consented_at left contradicting
      // recorded_at and no audit row anywhere. record_channel_consent has
      // carried the prior values through a refusal since 00594:1469-1479; the
      // rail is the other writer of refusals — the one that writes every real
      // STOP — and it is held to the same rule here. The refusal's own words
      // live in the four opt_out_* columns below.
      // …with ONE exception, which is the same exception record_channel_consent
      // makes: when this act MINTS the record there is no grant standing to
      // protect, and the RPC's INSERT leg writes the act's own source, words
      // and date into those columns (00594:1396). Only the UPDATE leg carries
      // the prior through. The rail matches leg for leg.
      source: keepsPriorConsent ? (prior.source ?? null) : "inbound_sms",
      evidence: keepsPriorConsent ? (prior.evidence ?? null) : evidence,
      recorded_at: keepsPriorConsent ? (prior.recorded_at ?? null) : now,
      // seat is {null, null} unless this is a grant, so a refusal carries only
      // what already stood.
      disclosure_version: prior.disclosure_version ?? seat.disclosureVersion,
      recorded_by: prior.recorded_by ?? seat.recordedBy,
      // THE REFUSAL'S OWN EVIDENCE SET (00594, r8 W4-M2). The rail is the one
      // writer that can say a STOP arrived BY TEXT, and that is the noun the
      // room prints ("Opted out by text, 3 Dec 2025"). It lives in its own four
      // columns because the shared set holds whatever act happened LAST — a
      // studio recording its fresh consent through record_channel_reconsent()
      // used to overwrite "Replied STOP" / inbound_sms outright. So a STOP
      // stamps them, and a YES/START carries them forward untouched: the
      // refusal that was answered is still a fact the carrier audit asks about.
      // opt_out_recorded_by stays NULL on a rail write — nobody in the studio
      // recorded this; the recipient did.
      opt_out_source: status === "opted_out"
        ? "inbound_sms"
        : (prior.opt_out_source ?? null),
      opt_out_evidence: status === "opted_out"
        ? evidence
        : (prior.opt_out_evidence ?? null),
      opt_out_recorded_at: status === "opted_out"
        ? now
        : (prior.opt_out_recorded_at ?? null),
      opt_out_recorded_by: status === "opted_out"
        ? null
        : (prior.opt_out_recorded_by ?? null),
      // The origin follows the CURRENT verdict, the same rule 00594's
      // record_channel_consent applies (COALESCE(new, prior)). R-Q's sentence
      // names the job the verdict on the books came from; taking the prior made
      // a STOP print the job the earlier grant came from.
      origin_project_id: t.projectId ?? prior.origin_project_id ?? null,
    }, { onConflict: "organization_id,channel_kind,channel_value" });
    // AND THE WRITE IS LOAD-BEARING TOO. Since R-AS the record is the only copy
    // of the verdict — the phone-global party write that used to stand behind a
    // failed upsert is gone and the seats are frozen — so an upsert that errors
    // (a transient PostgREST/DB error, or an FK violation when origin_project_id
    // names a project deleted between the read above and this write) leaves this
    // studio's record NON-REFUSING while the recipient has texted STOP. Unchecked,
    // `failed` stayed false, the STOP branch answered Twilio 200, kept the
    // twilio_sid idempotency claim so no retry ever came, and the next
    // sendPartySms read a record that still said granted. The caller decides what
    // an incomplete act is worth; it cannot decide on a result it never saw.
    if (writeError) {
      console.error(
        "writeChannelConsent: the record could not be written — this studio is not recorded",
        { org: t.org, phone, status, error: writeError },
      );
      failed = true;
      continue;
    }
  }
  return { failed };
}

// THE PARTY ROWS ARE NOT WRITTEN HERE, OR ANYWHERE (R-AS).
//
// project_parties.sms_consent_* used to carry a second copy of the verdict:
// this rail wrote it phone-globally on a STOP and per-studio on a grant, and
// migration 00594's mirror trigger wrote it again from the record. Ten review
// rounds of evidence defects all lived in that copy — one evidence set on the
// seat can only ever describe the act that happened last — so the copy is gone.
// studio_channel_consent is the single source of truth, the eight legacy
// columns are frozen by refuse_legacy_consent_write() (a write raises
// consent_legacy_column_frozen), and writeChannelConsent() above is the whole
// of what a compliance keyword writes.
//
// The STOP's phone-global reach survives where it matters: withRecordOnlyStudios
// carries every studio that holds a RECORD on the number, seat or no seat, and
// the send gate's last line (_shared/sms.ts channelConsentVerdict, the branch
// for a send whose studio cannot be resolved at all) reads the records
// phone-globally before it reads anything else.

// ── candidate items across the phone's parties ───────────────────────────────
interface CandidateItem {
  id: string;
  kind: "task" | "coordination";
  title: string;
  project_id: string;
  project_name: string;
  party_id: string;
  due: string | null;
}

async function loadCandidateItems(
  supabase: SupabaseClient,
  parties: Array<{ id: string; project_id: string }>,
  projectNames: Record<string, string>,
): Promise<CandidateItem[]> {
  const out: CandidateItem[] = [];
  for (const p of parties) {
    const name = projectNames[p.project_id] ?? "the project";
    const { data: tasks } = await supabase
      .from("project_tasks")
      .select("id, title, due_date")
      .eq("owner_party_id", p.id)
      .neq("status", "done");
    for (const t of (tasks ?? []) as Array<{ id: string; title: string; due_date: string | null }>) {
      out.push({ id: t.id, kind: "task", title: t.title, project_id: p.project_id, project_name: name, party_id: p.id, due: t.due_date });
    }
    const { data: items } = await supabase
      .from("client_decisions")
      .select("id, title, due_date")
      .eq("court_party_id", p.id)
      .eq("status", "pending");
    for (const c of (items ?? []) as Array<{ id: string; title: string; due_date: string | null }>) {
      out.push({ id: c.id, kind: "coordination", title: c.title, project_id: p.project_id, project_name: name, party_id: p.id, due: c.due_date });
    }
  }
  return out;
}

// ── E13: the inbound touch, and CRM-22's authority check ─────────────────────
//
// CRM-22: "an inbound approval is matched to a phone and never to an approver,
// so a 'go ahead' from someone with no money authority reads the same as a
// signature". The rail cannot refuse the message — a text is a text — but it
// can record WHO it was from and whether that seat held the standing, so the
// designer reading it later sees "received, not authority" rather than a
// signature.
//
// WHAT IS NOT COVERED, stated so it is not mistaken for a gap nobody saw: a
// message from a phone that resolves to NO seat at all writes no touch. There
// is no subject to file it against and no studio to file it into, and
// record_touch answers NULL for exactly that reason (00635). The rail already
// marks such a message needs_review, which is where it is visible.

type DecisionClass =
  | "none"
  | "logistics"
  | "selection"
  | "money"
  | "schedule"
  | "site_access";

type AuthorityVerdict =
  | "n/a"
  | "passed"
  | "failed_no_authority"
  | "failed_unknown_sender";

/** The authority scopes (00624) that answer for each decision class.
 *
 *  `draw_certify` sits in the money class beside `money` and `change_order`
 *  (W4 r7 MAJOR-5). 00624 grants it the same PR-n gate as money — only an
 *  owner or admin of the studio may write it — and the act it names, certifying
 *  a draw, is the money act on the rail W4 itself touches
 *  (issue_agreement_draw_invoice). Leaving it out of this table filed a
 *  certifier's texted approval as `failed_no_authority`, so the studio read
 *  "no authority on file" about a party who held exactly the grant that
 *  answers. `prepares_only` still decides within the class: F-03 and F-08
 *  assemble the draw, they do not sign it. */
const AUTHORITY_SCOPES: Record<string, string[]> = {
  money: ["money", "change_order", "draw_certify"],
  selection: ["selections"],
  schedule: ["schedule"],
  site_access: ["site_access", "key"],
};

/** client_decisions.coordination_kind → the class of decision it is. A signoff
 *  is the one that spends money (a draw, a change order); the rest are the
 *  job's own traffic. */
const COORDINATION_CLASS: Record<string, DecisionClass> = {
  selection: "selection",
  signoff: "money",
  rfi: "logistics",
  submittal: "logistics",
  punch: "logistics",
  confirm_availability: "schedule",
  report_arrival: "site_access",
  report_departure: "site_access",
  report_condition: "logistics",
  // An hours report is the same kind of fact a condition report is (contract
  // S1): something that happened on site, told by the person it happened to.
  // No authority scope answers for it, because nothing is being approved —
  // a designer decides what to do with it from the Desk, not from this table.
  report_hours: "logistics",
};

/** Does this seat hold an in-force grant for the class? PR-n's prepares_only
 *  is decisive on money: F-03 and F-08 prepare the draw, they do not sign it. */
async function authorityVerdictFor(
  supabase: SupabaseClient,
  partyId: string,
  decisionClass: DecisionClass,
  today: string,
): Promise<AuthorityVerdict> {
  const scopes = AUTHORITY_SCOPES[decisionClass];
  if (!scopes) return "n/a";
  const { data, error } = await supabase
    .from("project_party_authority")
    .select("scope, prepares_only, effective_from, effective_to")
    .eq("engagement_id", partyId);
  if (error) {
    console.error("sms-inbound: authority read failed", error.message);
    // A read that failed is not a grant. CRM-22's whole point is that silence
    // must not read as a signature.
    return "failed_no_authority";
  }
  const rows = (data ?? []) as Array<{
    scope: string;
    prepares_only: boolean | null;
    effective_from: string | null;
    effective_to: string | null;
  }>;
  const held = rows.some((row) =>
    scopes.includes(row.scope) &&
    (decisionClass !== "money" || !row.prepares_only) &&
    (!row.effective_from || row.effective_from <= today) &&
    (!row.effective_to || row.effective_to >= today)
  );
  return held ? "passed" : "failed_no_authority";
}

/** The class and the authority verdict for a message being FILED against an
 *  open item. A coordination item is a client_decisions row and MAY carry a
 *  court — `court_party_id` is an optional pointer at one seat, and every
 *  coordination item on the seeded book has none. A message filing an item
 *  whose court NAMES ANOTHER SEAT is failed_unknown_sender: the approval
 *  arrived from someone the decision was never put to. An item with no named
 *  court was never put to anyone in particular, so it is answered by the
 *  sender's own authority instead — reading it as a wrong sender filled the
 *  one index built to surface real failures
 *  (idx_studio_touches_failed_authority) with false accusations, which is
 *  CRM-22's harm turned around (W4 r1 M-1). */
async function filedDecisionFacts(
  supabase: SupabaseClient,
  target: { kind: string; id: string } | undefined,
  partyId: string,
  intent: string,
  today: string,
): Promise<{ decisionClass: DecisionClass; authorityCheck: AuthorityVerdict }> {
  if (!target) {
    return { decisionClass: "none", authorityCheck: "n/a" };
  }
  if (DELIVERY_EFFECTS.includes(intent)) {
    const decisionClass = COORDINATION_CLASS[intent];
    return { decisionClass, authorityCheck: await authorityVerdictFor(supabase, partyId, decisionClass, today) };
  }
  if (target.kind !== "coordination") {
    return {
      // The class the table above declares for the effect, where it declares
      // one — report_hours is logistics there, which is what this default was
      // already giving it — so the class is read from the one table rather than
      // decided a second time here.
      decisionClass: COORDINATION_CLASS[intent] ??
        (intent === "report_delay" ? "schedule" : "logistics"),
      authorityCheck: intent === "report_delay"
        ? await authorityVerdictFor(supabase, partyId, "schedule", today)
        : "n/a",
    };
  }
  const { data } = await supabase
    .from("client_decisions")
    .select("id, coordination_kind, court_party_id")
    .eq("id", target.id)
    .maybeSingle();
  const row = data as
    | { coordination_kind?: string; court_party_id?: string | null }
    | null;
  const decisionClass = COORDINATION_CLASS[row?.coordination_kind ?? ""] ??
    "selection";
  if (!row) {
    // The item could not be read at all: fail closed on the identity, as
    // before.
    return { decisionClass, authorityCheck: "failed_unknown_sender" };
  }
  const court = row.court_party_id ?? null;
  if (court !== null && court !== partyId) {
    return { decisionClass, authorityCheck: "failed_unknown_sender" };
  }
  return {
    decisionClass,
    authorityCheck: await authorityVerdictFor(
      supabase,
      partyId,
      decisionClass,
      today,
    ),
  };
}

/** One inbound touch. Best effort — a record of the message, never a condition
 *  of answering it. */
async function recordInboundTouch(
  supabase: SupabaseClient,
  partyId: string | null,
  messageId: string | null,
  facts: { decisionClass: DecisionClass; authorityCheck: AuthorityVerdict },
  occurredAt: string,
): Promise<void> {
  if (!partyId) return;
  const { error } = await supabase.rpc("record_touch", {
    p_subject_type: "engagement",
    p_subject_id: partyId,
    p_channel_kind: "sms",
    p_direction: "in",
    p_occurred_at: occurredAt,
    p_actor_ref: "sms-inbound",
    p_decision_class: facts.decisionClass,
    p_authority_check: facts.authorityCheck,
    p_message_ref: messageId,
  });
  if (error) console.error("sms-inbound: record_touch failed", error.message);
}

/**
 * ONE TOUCH PER ANSWERING SEAT, for the keywords that move a consent record
 * (W4 r5 F3 / MAJOR-2).
 *
 * `sms_conversations` is keyed on (twilio_number, phone_e164) and the rail
 * sends from one platform-wide TWILIO_FROM_NUMBER (_shared/sms.ts), so there
 * is exactly ONE conversation row per phone across every studio, and
 * `conv.party_id` is whichever seat the first outbound send stamped — not the
 * seat the message answered. Filing the touch there left, on a number two
 * studios hold, the studio whose consent record actually moved with no touch
 * at all: its person card, seat line, roster row and `touchSentence` kept
 * printing the PREVIOUS contact while its Directory row — which reads the
 * record — already showed the new verdict. Two readers on one card
 * disagreeing, which is the defect r1 M-4 and r4 MAJOR-3 opened to close.
 *
 * So each branch files over its own target set. The conversation's seat is the
 * fallback only when that set holds no seat — a record-only studio has none by
 * construction, and `record_touch` already answers NULL for a studio-less seat.
 */
async function recordConsentTouches(
  supabase: SupabaseClient,
  targets: StudioTarget[],
  fallbackPartyId: string | null,
  messageId: string | null,
  occurredAt: string,
): Promise<void> {
  const seatIds = [...new Set(targets.flatMap((t) => t.partyIds))];
  const ids = seatIds.length > 0
    ? seatIds
    : (fallbackPartyId ? [fallbackPartyId] : []);
  for (const partyId of ids) {
    await recordInboundTouch(
      supabase,
      partyId,
      messageId,
      { decisionClass: "none", authorityCheck: "n/a" },
      occurredAt,
    );
  }
}

const DELIVERY_EFFECTS = ["confirm_availability", "report_arrival", "report_condition", "report_departure"];

async function reviewOwner(supabase: SupabaseClient, projectId: string | null, deps: InboundDeps): Promise<string | null> {
  if (projectId) {
    const { data, error } = await supabase.rpc("field_project_lead_user", { p_project_id: projectId });
    if (!error && typeof data === "string") return data;
    // The RPC's own fallback, also useful during provisioning of the lead seat.
    const { data: project } = await supabase.from("projects").select("designer_id").eq("id", projectId).maybeSingle();
    if (project?.designer_id) return project.designer_id;
  }
  return (deps.getEnv ?? ((k: string) => Deno.env.get(k)))("FIELD_LINE_TRIAGE_USER") ?? null;
}

export async function ownedReview(supabase: SupabaseClient, messageId: string, projectId: string | null,
  partyId: string | null, details: Record<string, unknown>, deps: InboundDeps): Promise<boolean> {
  try {
    const owner = await reviewOwner(supabase, projectId, deps);
    if (!owner) return false;
    const { data: prior, error: readError } = await supabase.from("sms_messages").select("parsed_intent").eq("id", messageId).maybeSingle();
    if (readError) return false;
    const { error } = await supabase.from("sms_messages").update({ needs_review: true,
      owner_user_id: owner, party_id: partyId, project_id: projectId, parsed_intent: { ...prior?.parsed_intent, ...details } }).eq("id", messageId);
    if (error) return false;
    const { data: notification, error: notifyError } = await supabase.functions.invoke("notification-dispatch", { body: {
      user_id: owner, type: "field_needs_review", channel: "in_app", template_id: "field_sms_review",
      data: { message_id: messageId, ...details },
    } });
    return !notifyError && notification?.success === true &&
      typeof notification.notification_id === "string" && notification.notification_id.trim().length > 0;
  } catch (error) {
    console.error("Owned SMS handoff failed", error);
    return false;
  }
}

async function suppression(supabase: SupabaseClient, sender: string, recipient: string) {
  const { data, error } = await supabase.rpc("sms_is_suppressed", { p_sender: sender, p_recipient: recipient });
  return { blocked: !!error || data === true, error };
}

// ── designer notification (in-band) ──────────────────────────────────────────
async function notifyDesigner(
  supabase: SupabaseClient,
  projectId: string | null,
  type: string,
  data: Record<string, unknown>,
) {
  if (!projectId) return;
  const { data: proj } = await supabase
    .from("projects").select("designer_id").eq("id", projectId).maybeSingle();
  const designerId = (proj as { designer_id?: string } | null)?.designer_id;
  if (!designerId) return;
  try {
    await supabase.functions.invoke("notification-dispatch", {
      body: {
        user_id: designerId,
        type,
        channel: "in_app",
        template_id: "field_sms_review",
        data,
      },
    });
  } catch (err) {
    console.error("notifyDesigner failed:", err);
  }
}

async function designerFirstName(
  supabase: SupabaseClient,
  projectId: string | null,
  deps: InboundDeps,
): Promise<string> {
  const owner = await reviewOwner(supabase, projectId, deps);
  if (!owner) return "your designer";
  const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", owner).maybeSingle();
  return profile?.full_name?.trim().split(/\s+/)[0] || "your designer";
}

// ── the pipeline (signature already verified; injectable for tests) ──────────
export async function processInbound(params: InboundParams, deps: InboundDeps): Promise<InboundResult> {
  const result = await processInboundCore(params, deps);
  if (result.status >= 500 && !result.effectApplied && !result.retainSid) {
    await deps.supabase.from("sms_messages").update({ twilio_sid: null }).eq("twilio_sid", params.MessageSid);
  }
  if (result.replies?.length && !result.messageId) {
    const { data } = await deps.supabase.from("sms_messages").select("id").eq("twilio_sid", params.MessageSid).maybeSingle();
    result.messageId = data?.id;
  }
  return result;
}

async function processInboundCore(
  params: InboundParams,
  deps: InboundDeps,
): Promise<InboundResult> {
  const supabase = deps.supabase;
  const now = deps.now ?? new Date();
  const nowIso = now.toISOString();
  const parseFn = deps.parseFn ?? parseFieldMessage;
  const from = params.From;
  const to = params.To;
  let body = (params.Body ?? "").trim();
  let upper = body.toUpperCase();
  // Attribution on replay (i): when this request replays a stashed chooser
  // message, parsed_intent/confidence and needs_review provenance stamp the
  // ORIGINAL stashed message row, not the meaningless digit-choice reply.
  let effectiveMessageId: string;
  let replayExcludeFromHistory: string | null = null;
  let resumeSelection: SelectionBinding | undefined;

  // (c) idempotency claim on a per-conversation message row.
  const conv = await findOrCreateConversation(supabase, to, from);
  const { data: claimed, error: claimError } = await supabase
    .from("sms_messages")
    .upsert(
      {
        conversation_id: conv.id,
        direction: "inbound",
        body: params.Body ?? "",
        twilio_sid: params.MessageSid,
        twilio_status: "received",
      },
      { onConflict: "twilio_sid", ignoreDuplicates: true },
    )
    .select("id");
  if (claimError) return { status: 503, twiml: twimlBody(), disposition: "claim_failed", retainSid: true };
  let messageId = (claimed as Array<{ id: string }> | null)?.[0]?.id;
  if (!messageId) {
    const { data: existing, error } = await supabase.from("sms_messages")
      .select("id, body, parsed_intent").eq("twilio_sid", params.MessageSid).eq("conversation_id", conv.id)
      .eq("direction", "inbound").maybeSingle();
    if (error || !existing) return { status: 503, twiml: twimlBody(), disposition: "receipt_unreadable", retainSid: true };
    messageId = String(existing.id);
    const completion = await inboundCompletion(supabase, messageId!, to, from, conv.id);
    if (completion.status === "unknown") return completionUnknown(messageId!, "receipt_unreadable");
    if (completion.status === "prompt-completed") return await finishPrompt(supabase, conv, messageId!, completion.receipt.prompt_id!, completion.receipt, deps);
    if (completion.status === "effect-completed") return completedInbound(messageId!);
    body = String(existing.body ?? "").trim(); upper = body.toUpperCase();
    const intent = existing.parsed_intent?.selection_intent;
    if (intent) {
      if (intent.inboundMessageId === messageId) {
        return { status: 200, twiml: twimlBody(), disposition: "selection_recovery",
          messageId, retainSid: true, selection: intent };
      }
      if (intent.kind !== "project_choice" || typeof intent.inboundMessageId !== "string" ||
          typeof intent.messageId !== "string" || !/^\d+$/.test(body)) return completionUnknown(messageId!);
      resumeSelection = intent;
    }
    // Retrying an uncertain atomic attempt reuses the SAME persisted inbound row.
    // Concurrent same-SID attempts are serialized by the database helper.
    if (!resumeSelection && (!existing.parsed_intent?.prompt_id || !["ref", "optin_ref"].includes(existing.parsed_intent.path))) {
      // A retained unstamped digit may have lost its origin pointer. It must
      // never guess using the handset's newer question (operator recovery).
      if (/^\d+$/.test(body) && !existing.parsed_intent) return completionUnknown(messageId!);
      if (existing.parsed_intent) return { status: 200, twiml: twimlBody(), disposition: "duplicate" };
    }
  }
  effectiveMessageId = messageId;
  await supabase
    .from("sms_conversations")
    .update({ last_inbound_at: nowIso })
    .eq("id", conv.id);

  await captureServerEvent("sms-inbound", "sms_inbound_received", {
    has_media: (parseInt(params.NumMedia ?? "0", 10) || 0) > 0,
    body_len: body.length,
  }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });

  // (d) COMPLIANCE KEYWORDS — before resolve/MMS/LLM. Phone-global.
  const plainStop = PLAIN_STOPS.test(body);
  if (STOP_WORDS.includes(upper) || plainStop) {
    const { error: suppressError } = await supabase.from("sms_suppressions").upsert({
      sender_number: to, recipient_phone: from, reason: "stop", suppressed_at: nowIso, lifted_at: null,
    }, { onConflict: "sender_number,recipient_phone" });
    // Every studio holding the number — by seat, and by record even with no
    // seat left. A refusal that cannot reach a record leaves that record
    // saying granted, and the send gate honours it.
    const stopPhoneParties = await loadPhoneParties(supabase, from);
    const stopRecordStudios = await studiosHoldingRecord(supabase, from);
    const stopPartyOrgs = await studiosHoldingPhone(
      supabase,
      stopPhoneParties.parties,
    );
    const stopTargets = withRecordOnlyStudios(
      stopPartyOrgs.targets,
      stopRecordStudios.orgs,
    );
    // One string for both writers: the record and the seats must say the same
    // thing about the same STOP (r10 M1).
    const stopEvidence = `Inbound ${upper}`;
    const stopWrite = await writeChannelConsent(
      supabase,
      stopTargets,
      from, "opted_out", nowIso, stopEvidence,
    );
    await supabase.from("sms_messages")
      .update({ parsed_intent: { path: "keyword", keyword: "stop" } }).eq("id", messageId);
    await captureServerEvent("sms-inbound", "sms_opt_out", { phone: from }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "keyword", intent: "opt_out", confidence_bucket: "n/a", disposition: "opted_out" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    // A STOP WE COULD NOT FULLY RECORD IS NOT ACKNOWLEDGED (r7 R7-M3). Every
    // write above is idempotent and moves only toward refusal, so the partial
    // result stands; what a retry completes is the consent record of a studio
    // holding one WITHOUT a seat, which has no party-row backstop by
    // construction — its record would otherwise sit at `granted` for ever while
    // the number has said STOP, and that is the send gate's positive branch.
    //
    // A 5xx alone would not do it: the idempotency claim at (c) would answer
    // Twilio's retry with `duplicate` and the branch would never run again. So
    // the claim on this MessageSid is released first — by clearing twilio_sid,
    // not by deleting the row: the inbound STOP is itself a 10DLC artifact and
    // must survive even if the retry never comes.
    // FOUR reads, four flags (close-out r4 BLOCKING-1). The fourth —
    // studiosHoldingPhone's own — is the studio ATTRIBUTION read: a seat whose
    // org could not be read is a studio this STOP reaches by no other leg,
    // because withRecordOnlyStudios() can only union in studios that already
    // hold a record.
    // AND A FIFTH FLAG, which is not a failure (close-out r5 BLOCKING-1): a
    // seat that resolved to no studio at all. Nothing errored, so none of the
    // four fire — and there is no record for withRecordOnlyStudios() to union
    // in either, because 00594's fold skips a project with no org. So the
    // refusal lands on NO ledger: writeChannelConsent() loops over an empty
    // target list, and since R-AS the frozen seats are not a second copy. The
    // next send then reads `unknown` on the no-studio branch of the gate and
    // goes out. A refusal this rail cannot record is not a refusal it may
    // acknowledge; Twilio retries, and if the project is still studio-less the
    // loss is loud in the logs instead of silent on the wire.
    if (
      suppressError || stopPhoneParties.failed || stopRecordStudios.failed ||
      stopPartyOrgs.failed || stopPartyOrgs.unattributed || stopWrite.failed
    ) {
      console.error(
        "sms-inbound STOP: refusing to acknowledge — the refusal was not fully recorded",
        {
          phone: from,
          partiesReadFailed: stopPhoneParties.failed,
          recordReadFailed: stopRecordStudios.failed,
          partyOrgReadFailed: stopPartyOrgs.failed,
          partyOrgUnattributed: stopPartyOrgs.unattributed,
          consentWriteFailed: stopWrite.failed,
        },
      );
      await supabase
        .from("sms_messages")
        .update({ twilio_sid: null })
        .eq("id", messageId);
      return {
        status: 500,
        twiml: twimlBody(),
        disposition: "opt_out_incomplete",
      };
    }
    // AN INBOUND STOP IS A CONTACT AS WELL AS A CONSENT ACT (W4 r1 M-4).
    // The refusal is written to the consent record above; this is the other
    // question the room asks — who said what, when (CRM-23). It is the most
    // consequential message a seat sends, and it was the one outcome that
    // attributed a message to a seat and filed no touch.
    await recordConsentTouches(
      supabase,
      stopTargets,
      conv.party_id,
      messageId,
      nowIso,
    );
    if (plainStop) {
      const projects = [...new Set(stopPhoneParties.parties.map((p) => p.project_id))];
      const project = projects.length === 1 ? projects[0] : null;
      if (!await ownedReview(supabase, messageId, project,
        project ? stopPhoneParties.parties[0]?.id ?? null : null,
        { path: "keyword", keyword: "stop", body }, deps)) {
        return { status: 503, twiml: twimlBody(), disposition: "triage_unconfigured" };
      }
    }
    // Advanced Opt-Out marks its own confirmation; otherwise confirm once here.
    if (params.OptOutType?.toUpperCase() === "STOP") {
      return { status: 200, twiml: twimlBody(), disposition: "opted_out" };
    }
    const studio = stopTargets.length === 1 && stopTargets[0].projectId
      ? await resolveStudioName(supabase, stopTargets[0].projectId) : null;
    return await reply(supabase, conv.id, await renderSms(supabase, "sms_inbound_reply", {
      studio_name: studio ?? "Your design studio", message: "Texts stopped. Reply START to resume.",
    }), null, null, "opted_out");
  }
  if (START_WORDS.includes(upper)) {
    // Carrier resume lifts this pair only. It never turns a pending invite into a grant.
    try {
    const startRecords = await studiosHoldingRecord(supabase, from, ["opted_out"]);
    const pendingRecords = await studiosHoldingRecord(supabase, from, ["pending"]);
    const phoneParties = await loadPhoneParties(supabase, from);
    const phoneStudios = await studiosHoldingPhone(supabase, phoneParties.parties);
    if (startRecords.failed || pendingRecords.failed || phoneParties.failed || phoneStudios.failed) {
      return { status: 503, twiml: twimlBody(), disposition: "consent_read_failed" };
    }
    const startOrgs = startRecords.orgs;
    const pendingOrgs = pendingRecords.orgs;
    const { error: liftError } = await supabase.from("sms_suppressions")
      .update({ lifted_at: nowIso }).eq("sender_number", to).eq("recipient_phone", from);
    const remaining = await suppression(supabase, to, from);
    if (liftError || remaining.blocked) return { status: 503, twiml: twimlBody(), disposition: "suppression_unreadable" };
    const startOrgSet = new Set(startOrgs);
    const startTargets = withRecordOnlyStudios(
      phoneStudios.targets.filter((t) => startOrgSet.has(t.org)),
      startOrgs,
    );
    const startWrite = await writeChannelConsent(
      supabase,
      startTargets,
      from, "granted", nowIso, `Inbound ${upper}`,
    );
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "keyword", intent: "start", confidence_bucket: "n/a", disposition: "resubscribed" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    // A START IS A CONTACT AS WELL AS A CONSENT ACT (W4 r4 MAJOR-3, the rule
    // r1 M-4 set for STOP). It is the answer to a standing refusal, and it was
    // attributed to a seat by the rail's own reckoning and filed no touch — so
    // the seat line, the roster row and `touchSentence` all went on printing
    // the PREVIOUS contact after it. Best effort, as everywhere else:
    // `record_touch` answers NULL for a studio-less seat.
    await recordConsentTouches(
      supabase,
      startTargets,
      conv.party_id,
      messageId,
      nowIso,
    );
    if (startWrite.failed) return { status: 503, twiml: twimlBody(), disposition: "consent_write_failed" };
    const pendingTargets = phoneStudios.targets.filter((t) => pendingOrgs.includes(t.org));
    // sms_create_prompt requires an engagement; never invent one for a record-only studio.
    const recordOnlyPending = pendingOrgs.filter((org) => !pendingTargets.some((t) => t.org === org));
    if (recordOnlyPending.length && !await ownedReview(supabase, messageId, null, null,
      { path: "start_missing_engagement", organizations: recordOnlyPending }, deps)) {
      return { status: 503, twiml: twimlBody(), disposition: "triage_unconfigured" };
    }
    const replies: NonNullable<InboundResult["replies"]> = [];
    for (const target of pendingTargets) {
      for (const partyId of target.partyIds) {
        const { data: seat } = await supabase.from("project_parties").select("project_id").eq("id", partyId).single();
        if (!seat?.project_id) throw new Error("Pending invite seat unavailable");
        const { data: prior, error: readError } = await supabase.from("sms_prompts")
          .select("version").eq("party_id", partyId).eq("kind", "optin").order("version", { ascending: false }).limit(1);
        if (readError) throw readError;
        const { error: closeError } = await supabase.from("sms_prompts").update({ answered_at: nowIso })
          .eq("party_id", partyId).eq("kind", "optin").is("answered_at", null);
        if (closeError) throw closeError;
        const { data: created, error } = await supabase.rpc("sms_create_prompt", {
          p_party_id: partyId, p_project_id: seat.project_id, p_kind: "optin", p_subject_id: null,
          p_version: Number(prior?.[0]?.version ?? 0) + 1,
          p_expires_at: new Date(now.getTime() + 7 * 86400000).toISOString(),
          p_sender_number: to, p_recipient_phone: from,
        });
        const prompt = Array.isArray(created) ? created[0] : created;
        if (error || !prompt?.short_code) {
          await ownedReview(supabase, messageId, seat.project_id, partyId,
            { path: "start_challenge", error: error ?? "prompt_not_created" }, deps);
          return { status: 503, twiml: twimlBody(), disposition: "challenge_failed" };
        }
        const names = await loadProjectNames(supabase, [seat.project_id]);
        const vars = { code: prompt.short_code, studio_name: await resolveStudioName(supabase, seat.project_id),
          project_name: names[seat.project_id] };
        replies.push({ message: await renderSms(supabase, "sms_optin_invite", vars), partyId,
          projectId: seat.project_id, templateKey: "sms_optin_invite", vars });
      }
    }
    return { status: 200, twiml: twimlBody(), disposition: recordOnlyPending.length ? "needs_review" : "resubscribed", replies, messageId };
    } catch (error) {
      await ownedReview(supabase, messageId, null, null, { path: "start_failed", error: String(error) }, deps);
      return { status: 503, twiml: twimlBody(), disposition: "challenge_failed" };
    }
  }

  // Resolve candidate parties (needed for the YES grant's evidence + everything
  // below). The frozen sms_consent_status column is NOT selected: no branch of
  // this rail asks a seat for a verdict any more (R-AY).
  const { data: partyRows, error: partyReadError } = await supabase
    .from("project_parties")
    .select("id, project_id, party_kind, display_name")
    .eq("phone_e164", from);
  if (partyReadError) return { status: 503, twiml: twimlBody(), disposition: "consent_read_failed" };
  const parties = (partyRows ?? []) as Array<{
    id: string; project_id: string; party_kind: string; display_name: string | null;
  }>;

  if (upper === "YES" || upper === "Y" || /^(?:YES|Y) \d{2,3}$/.test(upper)) {
    try {
    const grantSuppression = await suppression(supabase, to, from);
    if (grantSuppression.blocked) return { status: grantSuppression.error ? 503 : 200,
      twiml: twimlBody(), disposition: "suppressed" };
    const code = upper.match(/^(?:YES|Y) (\d{2,3})$/)?.[1];
    if (code) {
      const { data, error } = await supabase.rpc("sms_resolve_prompt", { p_sender: to, p_recipient: from, p_code: code });
      const prompt = Array.isArray(data) ? data[0] : data;
      if (error) return { status: 503, twiml: twimlBody(), disposition: "ref_unreadable" };
      if (!prompt) return await closedRefReply(supabase, conv.id, to, from, code, nowIso);
      if (prompt.kind === "optin") {
        const attempt = await stampMessage(supabase, messageId, prompt.party_id, prompt.project_id,
          { path: "optin_ref", prompt_id: prompt.id, version: prompt.version });
        if (attempt.error) return { status: 503, twiml: twimlBody(), disposition: "prompt_attempt_unrecorded" };
        return await consumePrompt(supabase, conv, prompt, messageId, to, from, deps);

      }
      // A field YES NN is not consent; it continues through the ref protocol.
    }
    if (!code) {
    // THE RECORD SAYS WHO ASKED, AND THE SEAT SAYS NOTHING (final-run
    // BLOCKING-1, R-AU's rule applied to the other re-subscription keyword).
    // This gate read `parties.some(p => p.sms_consent_status === 'pending')`,
    // and that column is born `pending` on every invited seat
    // (use-coordination.ts useAddProjectParty) and frozen there for ever
    // (00594's BEFORE UPDATE trigger): no consent act can move it, so the gate
    // was permanently armed for every studio holding an invited seat on the
    // number. Pre-wave a STOP wrote `opted_out` onto every seat on the phone,
    // which disarmed it; R-AS deleted that write and left the gate reading the
    // frozen copy — so a bare YES, or a `Y` answering a DIFFERENT studio's
    // brand-new invite, lifted a standing recorded STOP and the next send went
    // out. The target set is now the studios whose OWN RECORD for this number
    // reads `pending` by verdict — an invite in flight, and nothing else. A
    // record whose verdict is `opted_out` is untouched: a refusal is answered
    // by START, which is the word the party sheet and the STOP auto-reply tell
    // the recipient to send, or by a freshly recorded invite.
    const yesRecords = await studiosHoldingRecord(supabase, from, ["pending"]);
    if (yesRecords.failed) return { status: 503, twiml: twimlBody(), disposition: "consent_read_failed" };
    const yesOrgs = yesRecords.orgs;
    if (yesOrgs.length > 0) {
      // The RECORD is per studio, not per seat, so the target is the studio:
      // its seats on the number are carried only to give the grant its evidence
      // (seatConsentEvidence) and its origin, and a studio whose record is
      // waiting with no seat left on the number is unioned in the way START
      // does it.
      const yesOrgSet = new Set(yesOrgs);
      const yesStudios = await studiosHoldingPhone(supabase, parties);
      if (yesStudios.failed || yesStudios.unattributed) return { status: 503, twiml: twimlBody(), disposition: "consent_read_failed" };
      const yesTargets = withRecordOnlyStudios(
        yesStudios.targets
          .filter((t) => yesOrgSet.has(t.org)),
        yesOrgs,
      );
      const yesWrite = await writeChannelConsent(
        supabase,
        yesTargets,
        from, "granted", nowIso, `Inbound ${upper}`,
      );
      if (yesWrite.failed) return { status: 503, twiml: twimlBody(), disposition: "consent_write_failed" };
      await captureServerEvent("sms-inbound", "sms_opt_in", { phone: from }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
      // The confirmation names a job this YES actually answered — a seat held
      // by one of the studios just granted. A record-only studio has no seat to
      // name and the copy falls back, as it does everywhere else.
      const answeredIds = new Set(yesTargets.flatMap((t) => t.partyIds));
      const answered = parties.find((p) => answeredIds.has(p.id)) ?? null;
      const projectNames = answered
        ? await loadProjectNames(supabase, [answered.project_id])
        : {};
      const confirmVars = {
        party_first_name: answered?.display_name ? answered.display_name.trim().split(/\s+/)[0] : "there",
        studio_name: (answered
          ? await resolveStudioName(supabase, answered.project_id)
          : null) ?? "your studio",
        project_name: (answered ? projectNames[answered.project_id] : null) ??
          "your project",
      };
      const confirm = await renderSms(supabase, "sms_optin_confirm", confirmVars);
      await captureServerEvent("sms-inbound", "sms_parse_outcome",
        { path: "keyword", intent: "opt_in", confidence_bucket: "n/a", disposition: "granted" },
        { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
      // A YES IS A CONTACT AS WELL AS A CONSENT ACT (W4 r4 MAJOR-3). This
      // branch names the project and the studio and hands `reply()` a seat, so
      // the message is attributed twice over — and filed no touch, leaving the
      // room to print the older contact after the most consequential inbound
      // message after STOP.
      await recordConsentTouches(
        supabase,
        yesTargets,
        conv.party_id,
        messageId,
        nowIso,
      );
      return await reply(
        supabase,
        conv.id,
        confirm || "You're all set for job updates.",
        answered?.id ?? conv.party_id,
        answered?.project_id ?? conv.active_project_id,
        "granted",
        { templateKey: "sms_optin_confirm", vars: confirmVars },
      );
    }
    }
    } catch (error) {
      console.error("Consent response failed", error);
      return { status: 503, twiml: twimlBody(), disposition: "consent_read_failed" };
    }
    // else: a YES no studio's record is waiting on falls through to the normal
    // parse — including a YES over a standing refusal, which stays refused.
  }

  if (upper === "HELP" || upper === "INFO") {
    const studio = parties[0] ? (await resolveStudioName(supabase, parties[0].project_id)) : null;
    const help = await renderSms(supabase, "sms_help", { studio_name: studio ?? "your design studio" });
    // Attributed to a seat, so it is a touch (W4 r1 M-4).
    await recordInboundTouch(
      supabase,
      conv.party_id,
      messageId,
      { decisionClass: "none", authorityCheck: "n/a" },
      nowIso,
    );
    return await reply(supabase, conv.id, help || "Patina relays project updates. Reply STOP to opt out.", conv.party_id, conv.active_project_id, "help");
  }

  // (e) Unknown phone — polite brush-off + orphan needs_review row.
  if (parties.length === 0) {
    if (!await ownedReview(supabase, messageId, null, null, { path: "unmatched", body }, deps)) {
      return { status: 503, twiml: twimlBody(), disposition: "triage_unconfigured" };
    }
    return await reply(
      supabase, conv.id,
      "Thanks — this number isn't linked to a project yet. Your designer will follow up.",
      null, null, "unmatched",
    );
  }

  const projectIds = [...new Set(parties.map((p) => p.project_id))];
  const projectNames = await loadProjectNames(supabase, projectIds);
  try {
    const { data: rows, error } = await supabase.from("sms_conversation_context").select("*").eq("conversation_id", conv.id);
    if (error) return completionUnknown(messageId, "context_unreadable");
    const contexts = (rows ?? []) as ConversationContext[];
    const holding = contexts.find(c => c.project_id === null && (c.backfilled_at || Object.keys(c.state_context).length > 0));
    const eligible = contexts.filter(c => c.project_id && !c.backfilled_at && parties.some(p => p.id === c.party_id && p.project_id === c.project_id));
    const pins = eligible.filter(c => freshProjectPin(c.state_context, now) === c.project_id)
      .sort((a,b) => String((b.state_context.project_pin as any).at).localeCompare(String((a.state_context.project_pin as any).at)));
    useContext(conv, holding ?? (projectIds.length === 1 ? eligible.find(c => c.project_id === projectIds[0]) : pins[0]) ?? null);
  } catch { return completionUnknown(messageId, "context_unreadable"); }

  // A fresh digest supersedes old numeric-choice metadata. Until then a
  // repeated digit cannot turn a completed legacy root into a new note.
  const lastHeld = conv.state_context.last_held_choice as { root_id: string; at: string } | undefined;
  if (!resumeSelection && !conv.context?.backfilled_at && lastHeld && /^\d+$/.test(body) &&
      (!conv.state_context.menu_created_at || lastHeld.at >= String(conv.state_context.menu_created_at))) {
    const completed = await inboundCompletion(supabase, lastHeld.root_id, to, from, conv.id);
    return completed.status === "unknown" || completed.status === "unresolved"
      ? completionUnknown(messageId) : completedInbound(messageId);
  }

  // Legacy snapshots are never question authority. Re-ask using the durable
  // original message only after checking whether its work already completed.
  if (conv.context?.backfilled_at) {
    const held = conv.context;
    const origin = held.state_context.pending_message_id;
    // A legacy confirmation has no immutable prompt authority. Its target's
    // terminal state can nevertheless prove there is nothing left to replay.
    const effect = held.state_context.pending_effect as { type?: string; target?: { kind?: string; id?: string } } | undefined;
    if (effect?.target?.id && ["mark_done", "confirm_delivery"].includes(effect.type ?? "") &&
        ["task", "coordination"].includes(effect.target.kind ?? "")) {
      const { data: target, error } = await supabase.from(effect.target.kind === "task" ? "project_tasks" : "client_decisions")
        .select("project_id, status").eq("id", effect.target.id).in("project_id", projectIds).maybeSingle();
      if (error) return completionUnknown(messageId, "held_target_unreadable");
      if (target && (effect.target.kind === "task" ? target.status === "done" : effect.type === "mark_done" && target.status === "resolved")) {
        const { error: deleteError } = await contextSnapshot(supabase.from("sms_conversation_context").delete(), held);
        return deleteError ? completionUnknown(messageId) : { status: 200, twiml: twimlBody(), disposition: "legacy_already_completed", retainSid: true };
      }
    }
    if (typeof origin === "string") {
      const completion = await inboundCompletion(supabase, origin, to, from, conv.id);
      if (completion.status === "unknown") return completionUnknown(messageId, "held_origin_unreadable");
      if (completion.status !== "unresolved") {
        const { error } = await contextSnapshot(supabase.from("sms_conversation_context").delete(), held);
        return error ? completionUnknown(messageId) : completedInbound(messageId);
      }
      // Never carry the held pending_effect. The next answer scopes the original
      // body/media and it is parsed afresh against that project's current items.
      const root = completion.rootSource ?? completion.source;
      return await selectionIntent(supabase, messageId, {
        kind: "project_choice", inboundMessageId: messageId,
        options: projectIds.map(projectId => ({ projectId, partyId: parties.find(p => p.project_id === projectId)!.id })),
      }, { held_origin_id: root.id, legacy_pending: { body: held.state_context.pending_body ?? root.body, media: held.state_context.pending_media ?? root.media ?? [] } });
    }
    // A held menu/confirmation has no recoverable original update. The next
    // answer chooses a scope only; it must not apply an obsolete YES or digit.
    const { error } = await stampMessage(supabase, messageId, null, null, { legacy_reask: true });
    if (error) return completionUnknown(messageId);
    return await selectionIntent(supabase, messageId, {
      kind: "project_choice", inboundMessageId: messageId,
      options: projectIds.map(projectId => ({ projectId, partyId: parties.find(p => p.project_id === projectId)!.id })),
    }, { legacy_reask: true });
  }

  // Gate the ORIGINAL before any MMS, CAS or parse. The digit pointer is
  // resume provenance only; every attempt still rechecks durable completion
  // and the shared sender's current authorization/immutable manifest.
  const choiceBinding = resumeSelection ?? (conv.state === "awaiting_project_choice" && /^\d+$/.test(body)
    ? conv.state_context?.selection as SelectionBinding | undefined : undefined);
  if (!choiceBinding && conv.state === "awaiting_project_choice" && /^\d+$/.test(body)) return completionUnknown(messageId);
  let choiceSource: Record<string, any> | undefined;
  let choiceRoot: Record<string, any> | undefined;
  let choiceQuestion: SelectionQuestion | undefined;
  if (choiceBinding) {
    if (choiceBinding.kind !== "project_choice" || !choiceBinding.messageId) return completionUnknown(messageId);
    const completion = await inboundCompletion(supabase, choiceBinding.inboundMessageId, to, from, conv.id);
    if (completion.status === "unknown") return completionUnknown(messageId);
    if (completion.status !== "unresolved") return completedInbound(messageId);
    choiceSource = completion.source;
    choiceRoot = completion.rootSource ?? completion.source;
    try {
      const { data: pointerRows, error: pointerError } = await supabase.from("sms_messages")
        .update({ parsed_intent: { selection_intent: choiceBinding } }).eq("id", messageId).select("id");
      if (pointerError || !pointerRows?.length) return completionUnknown(messageId, "selection_pointer_unrecorded");
    } catch { return completionUnknown(messageId, "selection_pointer_unrecorded"); }
    const recovered = await recoverSmsSelection(supabase, { ...choiceBinding, phone: from }, deps);
    if (!recovered.selection?.usable) return { ...selectionUnavailable(recovered), retainSid: true, messageId };
    choiceQuestion = recovered.selection;
  }

  // (f) Multi-project MMS stays unattributed until an immutable Ref or an
  // explicit project choice resolves it; a stale handset pin cannot own it.
  const numMedia = parseInt(params.NumMedia ?? "0", 10) || 0;
  const bestProject = projectIds.length === 1 ? projectIds[0] : null;
  let media: Array<{ path: string; content_type: string; twilio_url: string }> = [];
  if (numMedia > 0) {
    media = await ingestMedia(params, deps, conv.id, messageId, bestProject);
    if (media.length > 0) {
      const { error } = await supabase.from("sms_messages").update({ media }).eq("id", messageId);
      if (error) return completionUnknown(messageId, "media_unrecorded");
    }
    if (media.length !== numMedia) return completionUnknown(messageId, "media_incomplete");
  }

  // (g) Deterministic: project-choice → confirmation → numbered menu.
  if (choiceBinding && /^\d+$/.test(body)) {
    const choice = firstInt(body);
    const binding = choiceBinding;
    const option = choiceQuestion!.manifest.options.find((c) => c.number === choice);
    const pick = option && { project_id: option.projectId, party_id: option.partyId };
    if (pick) {
      // Merge — never overwrite — state_context: a digest `menu` (or other
      // stashed keys) predating the chooser must survive the resolution.
      const selected = await ensureContext(supabase, conv.id, pick.project_id, pick.party_id);
      const paused = await pausedReview(supabase, conv.id, pick.project_id, pick.party_id, choiceRoot!.id, deps);
      if (paused) return paused;
      const mergedContext = { ...selected.state_context };
      delete mergedContext.chooser;
      delete mergedContext.selection;
      const pendingText = choiceSource!.parsed_intent?.legacy_reask ? "" : String(choiceSource!.parsed_intent?.legacy_pending?.body ?? choiceSource!.body ?? "");
      const savedMedia = choiceSource!.parsed_intent?.legacy_pending?.media ?? choiceSource!.media;
      let pendingMedia = Array.isArray(savedMedia) ? savedMedia as Array<{ path: string; content_type: string; twilio_url: string }> : [];
      const pendingMessageId = choiceRoot!.id;
      delete mergedContext.pending_body;
      delete mergedContext.pending_media;
      delete mergedContext.pending_message_id;
      if (pendingMessageId) {
        // The stashed message — not this digit reply — carries the content;
        // attribution (parsed_intent/confidence/needs_review) belongs on it.
        effectiveMessageId = pendingMessageId;
        replayExcludeFromHistory = pendingMessageId;
      }
      // Consume only the exact held question. Delete it with its identity
      // predicates, so neither a delayed binder nor an old digit clears B.
      if (!resumeSelection || (conv.state_context?.selection as SelectionBinding | undefined)?.inboundMessageId === binding.inboundMessageId) {
        if (!conv.context) return completionUnknown(messageId);
        const { data: resolvedRows, error: resolveError } = await contextSnapshot(
          supabase.from("sms_conversation_context").delete(), conv.context).select("conversation_id");
        if (resolveError) return completionUnknown(messageId);
        if (!resolvedRows?.length) return { status: 200, twiml: twimlBody(), disposition: "project_choice_race", retainSid: true };
      }
      mergedContext.project_pin = { project_id: pick.project_id, at: nowIso };
      if (choiceRoot!.id !== binding.inboundMessageId) mergedContext.last_held_choice = { root_id: choiceRoot!.id, at: nowIso };
      const { data: pinned, error: pinError } = await contextSnapshot(supabase.from("sms_conversation_context")
        .update({ state: "idle", party_id: pick.party_id, state_context: mergedContext }), selected).select("conversation_id");
      if (pinError || !pinned?.length) return completionUnknown(messageId, "project_context_changed");
      if (pendingMedia.length > 0) pendingMedia = await rehomeHoldingMedia(supabase, pendingMedia, pick.project_id);
      if (media.some(m => m.path.startsWith("holding/"))) media = await rehomeHoldingMedia(supabase, media, pick.project_id);
      conv.context = { ...selected, state: "idle", party_id: pick.party_id, state_context: mergedContext };
      // A resumed digit may finish its original operation without replacing a
      // newer question. The local pin below scopes only this parse.
      if (!pendingText && pendingMedia.length === 0) {
        await stampMessage(supabase, effectiveMessageId, pick.party_id, pick.project_id, { path: "menu", disambiguated: true });
        // The message is stamped with a seat and a project one statement
        // above; the touch follows it (W4 r1 M-4).
        await recordInboundTouch(
          supabase,
          pick.party_id,
          effectiveMessageId,
          { decisionClass: "none", authorityCheck: "n/a" },
          nowIso,
        );
        return await reply(supabase, conv.id,
          `Got it — working on ${projectNames[pick.project_id] ?? "that project"}. Text me your update.`,
          pick.party_id, pick.project_id, "project_chosen");
      }
      // Carry the freeform text that triggered the chooser through the
      // normal freeform path, now scoped to the just-picked project — don't
      // drop it and don't make the party re-send it.
      body = pendingText;
      upper = body.toUpperCase();
      // Merge — never overwrite — this pick-reply's own MMS (if any) with the
      // stashed media from the message that triggered the chooser.
      if (pendingMedia.length > 0) {
        const seenPaths = new Set(media.map((m) => m.path));
        for (const m of pendingMedia) {
          if (!seenPaths.has(m.path)) {
            media.push(m);
            seenPaths.add(m.path);
          }
        }
      }
      conv.state = "idle";
      conv.active_project_id = pick.project_id;
      conv.party_id = pick.party_id;
      conv.state_context = mergedContext;
    }
    // Not a valid choice → fall through to fresh parse.
  }

  const refResult = await promptReply(supabase, conv, parties, body, to, from, effectiveMessageId, now, media, deps,
    params.MessageSid ?? null);
  if (refResult) return { ...refResult, messageId: effectiveMessageId };
  // ANYTHING ELSE FROM A HOMEOWNER (US-3 P24). Past this line the pipeline is
  // the field rail: the trade grammar, the LLM parse of a crew update, the
  // numbered menu of a foreman's open tasks. None of it was written for her,
  // none of its effects are hers to apply, and a sentence she typed is not a
  // status report. Every question this rail asks her carries a reference and
  // was answered above; what is left goes to the person who wrote to her.
  //
  // Only when EVERY seat on the number is a client seat. A number that also
  // holds a trade seat belongs to someone who is both, and their field update
  // must keep working.
  //
  // AND ONLY WHILE HER RAIL IS ACTUALLY LIVE (SQ-111 LOW-1). This branch is
  // phase 2's own behaviour, and the acknowledgement it composes is itself a
  // client-kind send — GATE 3b refuses `sms_inbound_reply` to a `client` seat
  // below phase 2. Running it at phase 0/1 would therefore take a pre-existing
  // client seat (00419) off the trade rail it has always been on and give it a
  // handoff and silence instead. Below phase 2 the branch does not run at all:
  // that seat falls through to exactly the path it took before the client rail
  // existed. STOP/START/HELP are answered as TwiML above (:1115) and are not
  // affected by either arm of this.
  if (parties.length > 0 && parties.every((p) => p.party_kind === "client") && fieldLinePhase(deps) >= 2) {
    const clientParty = parties.find((p) => p.project_id === conv.context?.project_id) ?? parties[0];
    // THE FLAG IS DOWN: THE HANDOFF STILL HAPPENS, AND SAYS SO. Turning
    // FIELD_LINE_CAMPAIGN_APPROVED off stops every text to her (P24), this
    // acknowledgement included — so composing one would only produce a refusal
    // at dispatch. What must not happen is her message disappearing: the
    // needs_review row names the gate that withheld the answer, so the person
    // who reads it knows she is waiting on a reply the rail cannot send.
    const replyAllowed = fieldLineCampaignApproved(deps);
    if (!await ownedReview(supabase, effectiveMessageId, clientParty.project_id, clientParty.id,
      replyAllowed
        ? { path: "client_freeform", body }
        : { path: "client_freeform", body, reply_withheld: "campaign_not_approved" }, deps)) {
      return { status: 503, twiml: twimlBody(), disposition: "handoff_failed", messageId: effectiveMessageId };
    }
    if (!replyAllowed) {
      return { status: 200, twiml: twimlBody(), disposition: "client_reply_withheld", messageId: effectiveMessageId };
    }
    return {
      ...await reply(supabase, conv.id,
        `Passed to ${await designerFirstName(supabase, clientParty.project_id, deps)} — they'll get back to you.`,
        clientParty.id, clientParty.project_id, "needs_review"),
      messageId: effectiveMessageId,
    };
  }
  const scopedParty = parties.find(p => p.project_id === conv.context?.project_id) ?? (projectIds.length === 1 ? parties[0] : undefined);
  if (scopedParty) {
    const paused = await pausedReview(supabase, conv.id, scopedParty.project_id, scopedParty.id, effectiveMessageId, deps);
    if (paused) return paused;
  }

  // Reply-to-renew, after the ref verbs above have had the message and after a
  // paused thread has been left to the person who owns it: a party with no
  // working link gets one back before anything else is attempted.
  const renewed = await replyToRenew(supabase, scopedParty, body, to, from, effectiveMessageId, now, deps);
  if (renewed) return renewed;

  // A menu is read only from the chosen project row, never from a handset
  // holding row or another party sharing the number.
  // Numbered menu reply ("DONE 2", "2 done", bare "2") against a fresh menu.
  const menu = (conv.state_context?.menu ?? []) as Array<{ n: number; kind: "task" | "coordination"; id: string; project_id: string }>;
  const menuAge = conv.state_context?.menu_created_at
    ? now.getTime() - new Date(String(conv.state_context.menu_created_at)).getTime()
    : Infinity;
  const menuIdx = menuNumber(body);
  if (conv.context?.project_id && menu.length > 0 && menuAge <= MENU_TTL_MS && menuIdx != null) {
    const target = menu.find((m) => m.n === menuIdx && m.project_id === conv.context!.project_id);
    if (target) {
      const partyId = parties.find((p) => p.project_id === target.project_id)?.id;
      if (partyId) {
        const paused = await pausedReview(supabase, conv.id, target.project_id, partyId, effectiveMessageId, deps);
        if (paused) return paused;
        const applied = await applyEffect(
          supabase, partyId,
          { type: "mark_done", target: { kind: target.kind, id: target.id } },
          effectiveMessageId, to, from, conv.id,
        );
        if (applied.status === "replayed") return completedInbound(effectiveMessageId);
        if (applied.status === "unknown") return completionUnknown(effectiveMessageId);
        if (applied.status === "failed") return await effectFailure(supabase, conv.id, effectiveMessageId, partyId,
          target.project_id, applied.error, deps);
        await recordInboundTouch(
          supabase, partyId, effectiveMessageId,
          await filedDecisionFacts(
            supabase, { kind: target.kind, id: target.id }, partyId,
            "mark_done", nowIso.slice(0, 10),
          ),
          nowIso,
        );
        await captureServerEvent("sms-inbound", "sms_parse_outcome",
          { path: "menu", intent: "mark_done", confidence_bucket: "n/a", disposition: "applied" },
          { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
        return { ...await reply(supabase, conv.id, confirmText(applied.result), partyId, target.project_id, "menu_applied"), effectApplied: true };
      }
    }
  }

  // A conversation the party explicitly pinned (by answering the chooser)
  // skips the chooser while the pin is fresh — and the LLM only sees that
  // project's items. conv.active_project_id is NOT a pin: it is stamped at
  // conversation creation by the first outbound send, so reading it as one
  // would scope every later reply to whoever texted first.
  const pinnedProjectId = freshProjectPin(conv.state_context, now);
  const pinnedRows = pinnedProjectId
    ? parties.filter((p) => p.project_id === pinnedProjectId)
    : [];
  const activePartyForConv = pinnedRows.find((p) => p.id === conv.party_id) ?? pinnedRows[0];
  const partiesForItems = activePartyForConv ? [activePartyForConv] : parties;

  // (h) LLM parse against every open item across the phone's parties.
  const candidateItems = await loadCandidateItems(supabase, partiesForItems, projectNames);
  // Don't double-feed the LLM: a replayed stashed message is already `body`;
  // its own row (still in the last-5 history) must be excluded.
  const recent = activePartyForConv || projectIds.length === 1
    ? await loadRecentMessages(supabase, conv.id, replayExcludeFromHistory, activePartyForConv?.project_id ?? projectIds[0]) : [];
  const parsed = await parseFn({
    body,
    openItems: candidateItems.map((c) => ({ id: c.id, kind: c.kind, title: c.title, project_name: c.project_name, due: c.due })),
    recentMessages: recent,
    today: nowIso.slice(0, 10),
    hasMedia: numMedia > 0 || media.length > 0,
  }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });

  const targetItem = parsed.target_ref
    ? candidateItems.find((c) => c.id === parsed.target_ref!.id && c.kind === parsed.target_ref!.kind)
    : undefined;
  const bucket = parsed.confidence >= 0.8 ? "high" : parsed.confidence >= 0.5 ? "mid" : "low";

  // Multi-project ambiguity with no resolved target → project chooser.
  if (!targetItem && !activePartyForConv && projectIds.length > 1) {
    return await selectionIntent(supabase, messageId, {
      kind: "project_choice", inboundMessageId: messageId,
      options: projectIds.map((projectId) => ({ projectId, partyId: parties.find((p) => p.project_id === projectId)!.id })),
    });
  }

  const effectParty = targetItem?.party_id ?? activePartyForConv?.id ?? parties[0].id;
  const effectProject = targetItem?.project_id ?? activePartyForConv?.project_id ?? parties[0].project_id;
  const paused = await pausedReview(supabase, conv.id, effectProject, effectParty, effectiveMessageId, deps);
  if (paused) return paused;
  if (media.length && !replayExcludeFromHistory) media = await rehomeHoldingMedia(supabase, media, effectProject);
  const effect = buildEffect(parsed, media);

  // Delivery effects require a bound prompt; conditions stay owned review in 0D-A.
  if (DELIVERY_EFFECTS.includes(parsed.intent)) {
    if (!await ownedReview(supabase, effectiveMessageId, effectProject, effectParty,
      { path: "delivery_unbound", ...parsed }, deps)) return { status: 503, twiml: twimlBody(), disposition: "handoff_failed" };
    return await reply(supabase, conv.id, `Passed to ${await designerFirstName(supabase, effectProject, deps)} — they'll get back to you.`,
      effectParty, effectProject, "needs_review");
  }

  // (i) Confidence gate.
  if (parsed.confidence >= 0.8 && (targetItem || parsed.intent === "punch_report" || parsed.intent === "note")) {
    const applied = await applyEffect(supabase, effectParty, effect, effectiveMessageId, to, from, conv.id);
    if (applied.status === "replayed") return completedInbound(messageId);
    if (applied.status === "unknown") return completionUnknown(messageId);
    if (applied.status === "failed") return await effectFailure(supabase, conv.id, effectiveMessageId, effectParty,
      effectProject, applied.error, deps);
    await recordInboundTouch(
      supabase, effectParty, effectiveMessageId,
      await filedDecisionFacts(
        supabase,
        targetItem ? { kind: targetItem.kind, id: targetItem.id } : undefined,
        effectParty, parsed.intent, nowIso.slice(0, 10),
      ),
      nowIso,
    );
    await stampMessage(supabase, effectiveMessageId, effectParty, effectProject, { path: "llm", ...parsed }, parsed.confidence);
    if (choiceBinding && choiceRoot?.id !== choiceBinding.inboundMessageId) {
      await stampMessage(supabase, choiceBinding.inboundMessageId, effectParty, effectProject,
        { ...choiceSource!.parsed_intent, legacy_choice_closed: true });
    }
    if (parsed.intent === "flag_blocker") {
      await notifyDesigner(supabase, effectProject, "field_blocker", { message_id: effectiveMessageId, note: parsed.note });
    }
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "llm", intent: parsed.intent, confidence_bucket: bucket, disposition: "applied" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    return { ...await reply(supabase, conv.id, confirmText(applied.result, parsed.intent), effectParty, effectProject, "applied"), effectApplied: true };
  }

  if (parsed.confidence >= 0.5 && targetItem) {
    const { data: priorPrompts, error: priorError } = await supabase.from("sms_prompts").select("version")
      .eq("party_id", effectParty).eq("kind", parsed.intent).eq("subject_id", targetItem.id)
      .order("version", { ascending: false }).limit(1);
    if (priorError) throw priorError;
    const { data: created, error: promptError } = await supabase.rpc("sms_create_prompt", {
      p_party_id: effectParty, p_project_id: effectProject, p_kind: parsed.intent,
      p_subject_id: targetItem.id, p_version: Number(priorPrompts?.[0]?.version ?? 0) + 1,
      p_expires_at: new Date(now.getTime() + MENU_TTL_MS).toISOString(),
      p_sender_number: to, p_recipient_phone: from, p_proposed_effect: effect,
    });
    const confirmation = Array.isArray(created) ? created[0] : created;
    if (promptError || !confirmation?.id) return await effectFailure(supabase, conv.id, effectiveMessageId,
      effectParty, effectProject, promptError ?? { message: "confirmation_prompt_failed" }, deps);
    // The proposal is bound to this prompt, never the handset's latest YES.

    const context = await ensureContext(supabase, conv.id, effectProject, effectParty);
    const { data: parked, error: parkError } = await contextSnapshot(supabase.from("sms_conversation_context").update({
      state: "awaiting_confirmation", party_id: effectParty,
      state_context: { ...context.state_context, pending_prompt_id: confirmation.id },
    }), context).select("conversation_id");
    // The immutable prompt already owns the proposal. Context is only a
    // convenience pointer; losing its CAS must not invalidate the offered Ref.
    if (parkError || !parked?.length) console.warn("confirmation context was not updated", parkError);
    await stampMessage(supabase, effectiveMessageId, effectParty, effectProject, { path: "llm", ...parsed }, parsed.confidence);
    // Nothing is filed until she answers YES, so the touch records the contact
    // and no decision.
    await recordInboundTouch(
      supabase, effectParty, effectiveMessageId,
      { decisionClass: "none", authorityCheck: "n/a" }, nowIso,
    );
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "llm", intent: parsed.intent, confidence_bucket: bucket, disposition: "clarify" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    return await reply(supabase, conv.id, clarifyText(parsed, targetItem).replace("Reply YES.", `Reply YES ${confirmation.short_code}.`), effectParty, effectProject, "clarify");
  }

  // <0.5 or question/unclear → needs_review + designer notify.
  if (!await ownedReview(supabase, effectiveMessageId, effectProject, effectParty, { path: "llm", ...parsed }, deps)) {
    return { status: 503, twiml: twimlBody(), disposition: "handoff_failed" };
  }
  await recordInboundTouch(
    supabase, effectParty, effectiveMessageId,
    { decisionClass: "none", authorityCheck: "n/a" }, nowIso,
  );
  const firstName = await designerFirstName(supabase, effectProject, deps);
  await captureServerEvent("sms-inbound", "sms_parse_outcome",
    { path: "llm", intent: parsed.intent, confidence_bucket: bucket, disposition: "needs_review" },
    { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
  return await reply(supabase, conv.id, `Passed to ${firstName} — they'll get back to you.`, effectParty, effectProject, "needs_review");
}

interface SmsPrompt {
  id: string; party_id: string; project_id: string; kind: string;
  subject_id: string | null; version: number; short_code: string; expires_at: string;
  proposed_effect?: Record<string, unknown> | null;
  /** When the reference was minted — the moment its card was composed. */
  created_at?: string | null;
}

async function promptSubject(supabase: SupabaseClient, prompt: SmsPrompt) {
  for (const [table, kind] of [["project_tasks", "task"], ["client_decisions", "coordination"]] as const) {
    const { data, error } = await supabase.from(table).select("id, title")
      .eq("id", prompt.subject_id).eq("project_id", prompt.project_id).maybeSingle();
    if (error) throw error;
    if (data) return { id: data.id as string, title: data.title as string, kind };
  }
  const { data, error } = await supabase.from("purchase_orders").select("id, po_number")
    .eq("id", prompt.subject_id).eq("project_id", prompt.project_id).maybeSingle();
  if (error) throw error;
  return data ? { id: data.id as string, title: data.po_number as string, kind: "purchase_order" as const } : null;
}

async function closedRefReply(supabase: SupabaseClient, conversationId: string, sender: string,
  recipient: string, code: string, now: string): Promise<InboundResult> {
  const { data: old, error } = await supabase.from("sms_prompts").select("*")
    .eq("sender_number", sender).eq("recipient_phone", recipient).eq("short_code", code)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  let latest: SmsPrompt | null = null;
  if (old) {
    // The point of this read is to hand back a code the sender CAN answer, so
    // its predicate has to be the one sms_resolve_prompt will apply to that
    // answer — and since 00646 that includes voided_at IS NULL. 00644's void
    // trigger stamps only voided_at (expires_at is immutable), so without this
    // clause a withdrawn challenge still reads as the newest live prompt and
    // "Latest: Ref NN" names the one code the grant now refuses (SQ-101).
    let query = supabase.from("sms_prompts").select("*").eq("sender_number", sender)
      .eq("recipient_phone", recipient).eq("party_id", old.party_id).eq("project_id", old.project_id)
      .eq("kind", old.kind).is("answered_at", null).is("voided_at", null).gt("expires_at", now);
    query = old.subject_id ? query.eq("subject_id", old.subject_id) : query.is("subject_id", null);
    const result = await query.order("version", { ascending: false }).limit(1).maybeSingle();
    if (result.error) throw result.error;
    latest = result.data;
  }
  const subject = latest?.subject_id ? await promptSubject(supabase, latest) : null;
  const message = latest
    ? `That one's closed. Latest: Ref ${latest.short_code} — ${subject?.title ?? "text updates"}`
    : "That one's closed. Please ask your designer for the latest reference.";
  return await reply(supabase, conversationId, message, old?.party_id ?? null, old?.project_id ?? null, "ref_closed");
}

async function effectFailure(supabase: SupabaseClient, conversationId: string, messageId: string,
  partyId: string, projectId: string | null, error: unknown, deps: InboundDeps): Promise<InboundResult> {
  const failure = error as { code?: string; details?: string; message?: string };
  const authority = failure.code === "42501" && failure.details === "field_effect_no_authority";
  const owned = await ownedReview(supabase, messageId, projectId, partyId,
    { path: "effect_failed", error: failure, authority_check: authority ? "failed_no_authority" : undefined }, deps);
  if (!owned) return { status: 503, twiml: twimlBody(), disposition: "triage_unconfigured" };
  const name = await designerFirstName(supabase, projectId, deps);
  return await reply(supabase, conversationId,
    authority ? `That needs your designer's approval — ${name} will follow up.`
      : `Got that, but it didn't save — ${name} will follow up`,
    partyId, projectId, authority ? "failed_no_authority" : "effect_failed");
}

export async function closePrompt(supabase: SupabaseClient, id: string, at: string): Promise<unknown> {
  try {
    const { error } = await supabase.from("sms_prompts").update({ answered_at: at }).eq("id", id).is("answered_at", null);
    return error;
  } catch (error) {
    return { message: String(error) };
  }
}

interface PromptConsumption {
  status: string;
  prompt_id?: string;
  result?: { kind: "effect" | "optin"; result: Record<string, unknown> };
}

async function promptReceipt(supabase: SupabaseClient, sender: string, recipient: string, messageId: string) {
  try {
    return await supabase.rpc("sms_prompt_receipt", { p_sender: sender, p_recipient: recipient, p_sms_message_id: messageId });
  } catch (error) { return { data: null, error }; }
}

type InboundCompletion =
  | { status: "prompt-completed"; receipt: PromptConsumption }
  | { status: "effect-completed" }
  | { status: "unresolved"; source: Record<string, any>; rootSource?: Record<string, any> }
  | { status: "unknown" };

export function completedInbound(messageId: string): InboundResult {
  return { status: 200, twiml: twimlBody(), disposition: "already_completed", effectApplied: true, retainSid: true, messageId };
}
function completionUnknown(messageId: string, disposition = "completion_unknown"): InboundResult {
  return { status: 503, twiml: twimlBody(), disposition, retainSid: true, messageId };
}

/** A missing or unreadable origin is not proof of absence. A NULL completion
 * may resume only because apply_field_effect serializes and rechecks it. */
export async function inboundCompletion(supabase: SupabaseClient, messageId: string,
  sender: string, recipient: string, conversationId?: string, visited = new Set<string>()): Promise<InboundCompletion> {
  if (visited.has(messageId)) return { status: "unknown" };
  visited.add(messageId);
  try {
    const { data: source, error } = await supabase.from("sms_messages")
      .select("id, conversation_id, direction, twilio_sid, body, media, parsed_intent, applied_effect, party_id, project_id")
      .eq("id", messageId).maybeSingle();
    if (error || !source || source.id !== messageId || source.direction !== "inbound" ||
        !source.twilio_sid?.trim() || (conversationId && source.conversation_id !== conversationId)) return { status: "unknown" };
    const { data: conv, error: convError } = await supabase.from("sms_conversations")
      .select("id, phone_e164, twilio_number").eq("id", source.conversation_id).maybeSingle();
    if (convError || !conv || conv.phone_e164 !== recipient || conv.twilio_number !== sender) return { status: "unknown" };
    const rootId = source.parsed_intent?.held_origin_id;
    if (rootId !== undefined) {
      if (typeof rootId !== "string" || !rootId) return { status: "unknown" };
      const root = await inboundCompletion(supabase, rootId, sender, recipient, source.conversation_id, visited);
      if (root.status === "unknown") return root;
      // Every caller (retry, dispatch, binder, digit) follows the same root.
      // A chooser can never become a second business-effect source.
      if (root.status !== "unresolved") return { status: "effect-completed" };
      return { status: "unresolved", source, rootSource: root.rootSource ?? root.source };
    }
    const receipt = await promptReceipt(supabase, sender, recipient, messageId);
    if (receipt.error) return { status: "unknown" };
    if (receipt.data != null) {
      const r = receipt.data;
      // A HOMEOWNER'S RECEIPT IS ITS OWN SHAPE (US-3 P23). apply_client_effect
      // commits {kind:'effect', result:{effect:'approve_selection'|
      // 'select_window', …}} — no `applied` boolean, because nothing about her
      // answer is a field effect. Validated as one it reads as unknown, and the
      // inbound then never completes: Twilio redelivers against a prompt that is
      // already answered, for ever, and the row keeps its SID for a
      // reconciliation that has nothing to reconcile. All this path needs from
      // her receipt is that it exists.
      if (
        r.status === "replayed" && typeof r.prompt_id === "string" &&
        r.result?.kind === "effect" &&
        CLIENT_EFFECTS.has(String((r.result.result as { effect?: unknown })?.effect ?? ""))
      ) {
        return { status: "effect-completed" };
      }
      if (r.status !== "replayed" || typeof r.prompt_id !== "string" ||
          !["effect", "optin"].includes(r.result?.kind) || !r.result?.result || typeof r.result.result !== "object" || Array.isArray(r.result.result) ||
          (r.result.kind === "effect" && typeof r.result.result.applied !== "boolean") ||
          (r.result.kind === "optin" && typeof r.result.result.organization_id !== "string")) return { status: "unknown" };
      return { status: "prompt-completed", receipt: r };
    }
    if (source.applied_effect != null) {
      if (typeof source.applied_effect !== "object" || Array.isArray(source.applied_effect) ||
          typeof source.applied_effect.applied !== "boolean") return { status: "unknown" };
      return { status: "effect-completed" };
    }
    return { status: "unresolved", source };
  } catch { return { status: "unknown" }; }
}

/** Post-write work cannot turn a saved effect into a retryable business action. */
async function finishPrompt(supabase: SupabaseClient, conv: Conversation, messageId: string,
  promptId: string, receipt: PromptConsumption, deps: InboundDeps,
  /**
   * The words for a receipt only the caller can write, ASKED FOR ONLY AFTER the
   * effect is filed (contract S7). An hours receipt names the site and the
   * designer, neither of which is in apply_field_effect's result, and composing
   * it before the apply would be the one thing P0-3 forbids: a true-sounding
   * sentence about a fact that may not have landed. Anything this throws lands
   * in the catch below, where a saved effect says so in its own words.
   */
  composeReceipt?: () => Promise<string>): Promise<InboundResult> {
  let prompt: SmsPrompt | null = null;
  try {
    const { data, error } = await supabase.from("sms_prompts").select("*").eq("id", promptId).single();
    if (error || !data || !receipt.result) throw error ?? new Error("receipt_binding_unreadable");
    prompt = data as SmsPrompt;
    const row = await ensureContext(supabase, conv.id, prompt.project_id, prompt.party_id);
    const context = { ...row.state_context };
    delete context.ref_clarification;
    const pending = context.pending_prompt_id === prompt.id;
    if (pending) { delete context.pending_prompt_id; delete context.pending_party_id; delete context.pending_effect; }
    const { error: contextError } = await contextSnapshot(supabase.from("sms_conversation_context")
      .update({ state: pending ? "idle" : row.state, state_context: context }), row);
    if (contextError) throw contextError;
    if (receipt.result.kind === "optin") {
      await recordConsentTouches(supabase, [{ org: String(receipt.result.result.organization_id),
        projectId: prompt.project_id, partyIds: [prompt.party_id] }], null, messageId, (deps.now ?? new Date()).toISOString());
      const names = await loadProjectNames(supabase, [prompt.project_id]);
      const vars = { studio_name: await resolveStudioName(supabase, prompt.project_id), project_name: names[prompt.project_id] };
      return { ...await reply(supabase, conv.id, await renderSms(supabase, "sms_optin_confirm", vars),
        prompt.party_id, prompt.project_id, "granted", { templateKey: "sms_optin_confirm", vars }), effectApplied: true, messageId };
    }
    const subject = await promptSubject(supabase, prompt);
    await recordInboundTouch(supabase, prompt.party_id, messageId, await filedDecisionFacts(supabase, subject ?? undefined,
      prompt.party_id, String(receipt.result.result.effect_type ?? prompt.proposed_effect?.type ?? prompt.kind),
      (deps.now ?? new Date()).toISOString().slice(0, 10)), (deps.now ?? new Date()).toISOString());
    const receiptText = composeReceipt ? await composeReceipt() : confirmText(receipt.result.result,
      String(receipt.result.result.effect_type ?? prompt.proposed_effect?.type ?? prompt.kind));
    return { ...await reply(supabase, conv.id, receiptText,
      prompt.party_id, prompt.project_id, "ref_applied"), effectApplied: true, messageId };
  } catch (error) {
    const owned = await ownedReview(supabase, messageId, prompt?.project_id ?? null, prompt?.party_id ?? null,
      { path: "prompt_followup_failed", prompt_id: promptId, effect_applied: true, error: String(error) }, deps);
    const result = owned && prompt ? await reply(supabase, conv.id,
      `${receipt.result?.kind === "optin" ? "Your consent was recorded" : "Your update was saved"}, but the follow-up needs attention - ${await designerFirstName(supabase, prompt.project_id, deps)} will follow up.`,
      prompt.party_id, prompt.project_id, "prompt_followup_failed") : { status: 503, twiml: twimlBody(), disposition: "handoff_failed" };
    return { ...result, effectApplied: true, messageId };
  }
}

async function consumePrompt(supabase: SupabaseClient, conv: Conversation, prompt: SmsPrompt, messageId: string,
  sender: string, recipient: string, deps: InboundDeps, effect?: Record<string, unknown>,
  composeReceipt?: () => Promise<string>): Promise<InboundResult> {
  let data: PromptConsumption | null = null;
  let error: unknown;
  try {
    const response = await supabase.rpc(prompt.kind === "optin" ? "sms_grant_optin_prompt" : "sms_apply_prompt", {
      p_prompt_id: prompt.id, p_sender: sender, p_recipient: recipient, p_sms_message_id: messageId,
      ...(effect ? { p_effect: effect } : {}),
    });
    data = response.data; error = response.error;
  } catch (err) { error = err; }
  if (error || !data) {
    const completion = await inboundCompletion(supabase, messageId, sender, recipient, conv.id);
    if (completion.status === "prompt-completed") return await finishPrompt(supabase, conv, messageId, completion.receipt.prompt_id!, completion.receipt, deps, composeReceipt);
    if (completion.status === "effect-completed") return completedInbound(messageId);
    // Known contract/integrity/transaction-abort errors prove rollback. Other
    // SQLSTATEs (including statement_completion_unknown) remain ambiguous.
    if (completion.status === "unknown" || !(/^(?:23[0-9A-Z]{3}|42501|P0001|40001|40P01)$/.test(String((error as { code?: string })?.code ?? "")))) {
      return { status: 503, twiml: twimlBody(), disposition: "prompt_commit_unknown", retainSid: true, messageId };
    }
    return await effectFailure(supabase, conv.id, messageId, prompt.party_id, prompt.project_id, error, deps);
  }
  if (data.status === "already_completed") return completedInbound(messageId);
  if (["applied", "granted", "replayed"].includes(data.status) && data.result) {
    return await finishPrompt(supabase, conv, messageId, prompt.id, data, deps, composeReceipt);
  }
  if (["closed", "expired"].includes(data.status)) return await closedRefReply(supabase, conv.id, sender, recipient,
    prompt.short_code, (deps.now ?? new Date()).toISOString());
  if (["suppressed", "not_consented", "not_pending"].includes(data.status)) {
    return { status: 200, twiml: twimlBody(), disposition: data.status, messageId };
  }
  return { status: 503, twiml: twimlBody(), disposition: "prompt_commit_unknown", retainSid: true, messageId };
}

/** What a trade word means, before any prompt is known (contract P3). */
interface TradeShape {
  verb: string;
  intent: string;
  note: string;
  condition?: { ok: boolean; note: string };
}

/**
 * The words the site card and the morning ask actually print, read exactly as a
 * crew would write them back (contract P3): ON MY WAY, LATE 20, PROBLEM the
 * gate is locked, HERE, DONE.
 *
 * NONE OF THESE SAYS GOODS WERE RECEIVED. Arriving, running late, finding a
 * problem and leaving are reports about a visit; a receipt is a delivery effect
 * against a purchase order and no word here produces one. DONE means the crew
 * has left — a departure — and it means that only on a trade prompt: everywhere
 * else DONE still closes a task, which is what every digest has always asked.
 */
export function tradeShape(body: string): TradeShape | null {
  const text = body.trim();
  if (/^on\s+my\s+way[.!]*$/i.test(text) || /^here[.!]*$/i.test(text)) {
    return { verb: "HERE", intent: "report_arrival", note: text };
  }
  const late = text.match(/^late\s+(\d{1,3})\s*(?:min|mins|minutes)?[.!]*$/i);
  if (late) {
    const minutes = Number(late[1]);
    return {
      verb: "LATE",
      intent: "report_delay",
      note: `Running about ${minutes} minutes late.`,
    };
  }
  const problem = text.match(/^problem(?:[\s:,;.-]+([\s\S]+))?$/i);
  if (problem) {
    const note = problem[1]?.trim() || "Something is wrong on site.";
    return {
      verb: "PROBLEM",
      intent: "report_condition",
      note,
      // A problem is a not-ok condition, which is what opens the message for
      // review and names an owner (00641's delivery core). The crew does not
      // have to know that; they just have to be able to say "problem".
      condition: { ok: false, note },
    };
  }
  if (/^done[.!]*$/i.test(text)) {
    return { verb: "DONE", intent: "report_departure", note: text };
  }
  return null;
}

// ── The evening's one question, answered in a number (contract S7) ──────────
//
// sms_hours_prompt asks "how many hours today", so the answer is a number and
// nothing else: "6", "6.5", "6,5", "6 hrs", "6.5 18". Every other rule on this
// rail leaves bare digits to the digest menu, and they still belong to it — what
// makes a number HOURS is that something asked for one, which is a report_hours
// prompt of this party's standing open (or a two-digit code that names one). With
// no such prompt open, hoursReply() returns null and the body goes exactly where
// it went before.
//
// The unit — h / hr / hrs / hours — is optional and carries no meaning: the
// question named a unit, and a crew typing it back is agreeing, not qualifying.
// A comma is a decimal point: half the keyboards this rail texts put one there.
const HOURS_REPLY =
  /^\s*(\d{1,2}(?:[.,]\d{1,2})?)\s*(?:h|hr|hrs|hours)?\s*(?:ref\s*)?(\d{2})?\s*$/i;
/** The prompt kind that asks for hours, and the only kind a number answers. */
const HOURS_PROMPT_KIND = "report_hours";
/** A day nobody worked, and the longest day this rail takes on a text alone. */
const HOURS_MIN = 0;
const HOURS_MAX = 16;

/** The number and the reference in an hours reply, or null if it is not one. */
export function hoursShape(
  body: string,
): { hours: number; code: string | null } | null {
  const match = body.match(HOURS_REPLY);
  if (!match) return null;
  return { hours: Number(match[1].replace(",", ".")), code: match[2] ?? null };
}

// ── The homeowner's two answers (US-3 P24) ───────────────────────────────────

/** The prompt kinds only a client is ever asked (00652). */
const CLIENT_PROMPT_KINDS = new Set(["selection_batch", "window_pick"]);

/** The two effects apply_client_effect will apply, and no others (00651). */
const CLIENT_EFFECTS = new Set(["approve_selection", "select_window"]);

/** The three letters the delivery card prints, and nothing else. */
const WINDOW_OPTIONS = ["A", "B", "C"];

/**
 * P14 PARITY — THE REFUSAL SET, AS SQL RAISES IT AND AS THIS FILE READS IT.
 *
 * apply_client_effect (00651, repaired by 00652) answers in exactly two ways: a
 * status word in the returned jsonb, or a raise. Every raise it names is in this
 * map; anything NOT in it — an unnamed 42501, a 23514 from a malformed batch, a
 * 22023 from a payload with no version, a bare 23505 when one SID reaches a
 * second prompt, a transport failure — is handed to the project lead with the
 * SQLSTATE and the message on the needs_review row, and she gets the one honest
 * line at the bottom. Every refusal leaves the prompt answerable, so none of
 * these is ever retried here: a person decides what happens next.
 *
 * The reply text is what SHE is told. It never names a capability, a scope, a
 * table or a code — she has no way to act on any of that, and the person who
 * does has just been handed the thread.
 */
const CLIENT_REFUSALS: Record<string, { reply: string; disposition: string }> = {
  no_capability: {
    reply: "That link isn't working any more. Your designer will follow up.",
    disposition: "client_no_capability",
  },
  capability_wrong_project: {
    reply: "That reference belongs to another project. Your designer will follow up.",
    disposition: "client_wrong_project",
  },
  capability_expired_or_revoked: {
    reply: "That link has expired. Your designer will send a new one.",
    disposition: "client_capability_expired",
  },
  letter_revoked: {
    reply: "That letter has been replaced. Your designer will send the new one.",
    disposition: "client_letter_revoked",
  },
  batch_not_addressed: {
    reply: "That reference isn't yours to answer. Your designer will follow up.",
    disposition: "client_not_addressed",
  },
  // 00652's household binding. Named here for the same reason the five above
  // are: it is a fact about WHOSE ask this is, and she can be told it plainly.
  decision_other_household: {
    reply: "That reference belongs to another client on this project. Your designer will follow up.",
    disposition: "client_other_household",
  },
};

/** The refusal token in a raise's message, if it names one of ours. */
function clientRefusalOf(error: unknown): string | null {
  const message = String((error as { message?: unknown } | null)?.message ?? "");
  for (const token of Object.keys(CLIENT_REFUSALS)) {
    if (message.includes(token)) return token;
  }
  return null;
}

// ── THE TWO WINDOWS HER CARD OFFERED (US-3 P23) ─────────────────────────────
//
// She replies with a POSITION — "A" — and the record of what she can be home for
// should say WHICH WINDOW that was, in the words she read. So the card has to be
// composed again from the same source it was composed from.
//
// SOURCE OF TRUTH: field-daily/core.ts's issueWindowPick. Its
// proposedDeliveryWindows decides WHICH two windows a delivery offers and its
// windowLabel decides IN WHICH WORDS; the rule from here down is a copy of both,
// and if the two ever disagree core.ts is right. They are held together by
// sms-inbound.test.ts's parity test, which sends a real card through
// field-daily and then asserts the label recorded for her reply is the string
// that card printed — one fixture, both halves.
//
// WHY A COPY. core.ts exports none of this (cardParam is the one piece it
// exports), no edge function in this tree imports another function's module —
// everything shared lives in _shared/ — and neither core.ts nor _shared/sms.ts
// is this change's to touch. So the rule is duplicated rather than extracted,
// with core.ts named as its authority.
//
// WHY THE PROMPT CANNOT SIMPLY CARRY THE LABELS (SQ-112 finding 2). The read
// that used to stand here took them from prompt.proposed_effect.options, which
// is always NULL for a window_pick: sms_create_prompt validates a non-null
// p_proposed_effect through sms_validate_prompt_effect (00643:14-26), which
// raises 23514 unless the effect's type is one of the ten TRADE kinds, and
// 00644's sms_prompts_guard_binding makes the column immutable after insert. The
// issuer cannot write the labels down, and so that read was dead on arrival.

/** A GSM-7 extension character costs two septets; everything else costs one. */
const GSM7_EXTENDED = "^{}\\[~]|€";
/** The GSM-7 default alphabet; anything outside it would force UCS-2. */
const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?" +
  "¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
/** What one window may spend on her card (field-daily/core.ts). */
const WINDOW_LABEL_SEPTETS = 14;

function septetsOf(text: string): number {
  let count = 0;
  for (const ch of text) count += GSM7_EXTENDED.includes(ch) ? 2 : 1;
  return count;
}

function cardParam(value: unknown, maxSeptets: number, fallback: string): string {
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

function formatDue(iso: string): string {
  const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (!y || !m || !d) return iso;
  return `${months[m - 1]} ${d}`;
}

function windowLabel(day: string | null, words: string | null): string | null {
  const dayText = day ? formatDue(day) : "";
  const full = [dayText, (words ?? "").trim()].filter(Boolean).join(" ");
  if (!full) return null;
  const fitted = septetsOf(full) <= WINDOW_LABEL_SEPTETS
    ? cardParam(full, WINDOW_LABEL_SEPTETS, "")
    : cardParam(dayText || full, WINDOW_LABEL_SEPTETS, "");
  return fitted || null;
}

/**
 * The day the card was composed on, read off the reference itself. field-daily
 * freezes the producer's local YYYYMMDD as the prompt's version (00645's
 * convention), which is what makes this reconstruction stable: the cutoff below
 * is the day she was ASKED, not today, so a window that has since gone by still
 * composes the same label it did then.
 */
function versionLocalDay(version: number): string | null {
  const text = String(version);
  if (!/^\d{8}$/.test(text)) return null;
  const month = Number(text.slice(4, 6));
  const day = Number(text.slice(6, 8));
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
}

interface OfferedWindows {
  /** A then B, exactly as the card printed them, or empty. */
  options: string[];
  /** Why there is nothing to record, when there is nothing to record. */
  drift: "proposals_changed" | "reports_unreadable" | null;
}

/**
 * Compose her card's two options again from field_delivery_reports — the one
 * place a delivery window is ever PROPOSED (00641), keyed by the same
 * (subject_kind, subject_id) pair her answer is recorded against.
 *
 * WHAT IS NOT GUESSED AT. A proposal written AFTER her card went out was not on
 * the record when it was composed, so it is left out: otherwise a window added
 * this morning would slide into position A and she would be recorded against a
 * time she never read. If what is left no longer composes two distinct labels —
 * a proposal withdrawn, re-worded in place, or two that now print the same
 * words — the labels she was shown are simply not recoverable, and the caller
 * records the letter alone rather than inventing one.
 */
async function offeredWindows(
  supabase: SupabaseClient,
  prompt: SmsPrompt,
): Promise<OfferedWindows> {
  const askedOn = versionLocalDay(prompt.version);
  if (!askedOn || !prompt.subject_id) return { options: [], drift: "proposals_changed" };
  const { data, error } = await supabase
    .from("field_delivery_reports")
    .select("subject_kind, subject_id, proposed_date, proposed_window, availability_at, project_id")
    .eq("project_id", prompt.project_id)
    .eq("subject_id", prompt.subject_id);
  if (error) return { options: [], drift: "reports_unreadable" };
  type Report = {
    subject_kind: string | null;
    proposed_date: string | null;
    proposed_window: string | null;
    availability_at: string | null;
  };
  const sentAt = prompt.created_at ? String(prompt.created_at) : null;
  const groups = new Map<string, Report[]>();
  for (const row of (data ?? []) as Report[]) {
    if (!row.subject_kind) continue;
    if (!row.proposed_date && !row.proposed_window) continue;
    // Written after the card, so the card cannot have printed it.
    if (sentAt && row.availability_at && String(row.availability_at) > sentAt) continue;
    groups.set(row.subject_kind, [...(groups.get(row.subject_kind) ?? []), row]);
  }

  // core.ts, proposedDeliveryWindows: chronological, a day already behind her is
  // not a choice, two proposals printing the same words are one choice, and
  // fewer than two is not a card at all.
  const pairs: string[][] = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) =>
      (a.proposed_date ?? "9999-99-99").localeCompare(b.proposed_date ?? "9999-99-99") ||
      String(a.availability_at ?? "").localeCompare(String(b.availability_at ?? ""))
    );
    const options: string[] = [];
    for (const row of sorted) {
      if (row.proposed_date && row.proposed_date < askedOn) continue;
      const label = windowLabel(row.proposed_date, row.proposed_window);
      if (!label || options.includes(label)) continue;
      options.push(label);
      if (options.length === 2) break;
    }
    if (options.length === 2) pairs.push(options);
  }
  // One subject_id in two subject kinds is not a shape this database can reach
  // (00641's unique index, and a uuid names a row in one table), but two
  // different pairs would mean guessing which card she holds. It fails closed.
  const distinct = new Set(pairs.map((pair) => JSON.stringify(pair)));
  if (distinct.size !== 1) return { options: [], drift: "proposals_changed" };
  return { options: pairs[0], drift: null };
}

/**
 * A HOMEOWNER'S REPLY, THROUGH THE ONE DOOR THAT EXISTS FOR IT (US-3 P23/P24).
 *
 * `YES 12` on a presented batch approves every selection in it at the version
 * the text was sent at; `A 14`, `B 14`, `C 14` on a delivery card record when
 * she can be there. Nothing else a client says is acted on: it goes to the
 * project lead.
 *
 * FOUR THINGS THIS DELIBERATELY DOES NOT DO.
 *   · It does not go through sms_apply_prompt. That function's effects are the
 *     field vocabulary and its actor is a seat with a 00624 grant; a homeowner
 *     has neither, and apply_client_effect is the only door 00651 built for her.
 *   · It does not carry the batch version from anywhere but the PROMPT. The
 *     prompt's version is the batch version the text was sent at, frozen at
 *     issuance (00639), so an old reference can only ever name an old version —
 *     which is what makes `stale_version` reachable at all, and it is the whole
 *     protection: a reply written against a list she saw last week cannot land
 *     on a list she has never seen.
 *   · It does not confirm a delivery. `select_window` writes availability and
 *     the receiver's own confirmation stays where it already is — field-daily's
 *     sms_delivery_confirm leg, asked of the receiver/gc seats on that project
 *     (field-daily/core.ts's delivery-window block). Her saying "Tuesday works"
 *     is not the crew saying "the sofa arrived", and the two asks are on two
 *     different phones for that reason.
 *   · It does not read the anonymous twin. One approval writes TWO
 *     decision_events rows — ours, carrying actor_party_id, and 00171's
 *     record_decision_status_event_trg row with changed_by and actor_party_id
 *     both NULL (SQ-110 LOW-4). The party row is the authoritative one; the twin
 *     is a status mirror and is never counted as a second action.
 */
async function clientPromptReply(
  supabase: SupabaseClient,
  conv: Conversation,
  prompt: SmsPrompt,
  party: { id: string; project_id: string },
  body: string,
  code: string | null,
  sender: string,
  recipient: string,
  sourceSid: string | null,
  messageId: string,
  now: Date,
  deps: InboundDeps,
): Promise<InboundResult> {
  // The same two reads the trade path makes before it answers anyone, with the
  // homeowner's consent shape. An explicit refusal — her STOP, a fold the
  // studio recorded — ends the TEXTING silently, as it does everywhere else.
  // A bare `unknown` does NOT refuse: the kickoff box writes `pending` (00594
  // through record_channel_invite), which is the state every homeowner on this
  // rail is in, and refusing there would mean she can be texted and never
  // answered. What it takes is the carve-out's own evidence, below.
  const blocked = await suppression(supabase, sender, recipient);
  if (blocked.error) return { status: 503, twiml: twimlBody(), disposition: "not_consented" };
  // THE DECISION, NOT JUST THE VERDICT — the same permission GATE 2 gives a
  // client-kind SEND (sms.ts: allow, or the kickoff carve-out's pending record
  // carrying HOW she said yes and WHO wrote it down). Asked the same way here so
  // the two cannot drift: a record the send gate would refuse cannot be the
  // authority for an effect either.
  const decision = await channelConsentDecision(supabase, recipient, party.project_id);
  const consentCarries = decision.verdict === "allow" ||
    (decision.verdict === "unknown" && decision.recordPresent &&
      !!decision.recordSource && !!decision.recordedBy);
  if (blocked.blocked || !consentCarries) {
    // NOT A DROP (SQ-111 LOW-3). Nothing is applied and NOTHING IS TEXTED BACK —
    // a refused consent must not be answered by a text, which is the whole
    // refusal — but she did write to the studio, and the only record of that was
    // the raw inbound row nobody reads. The thread goes to the person who owns
    // the project with the reason in plain words on it.
    const refusal = blocked.blocked
      ? "suppressed"
      : decision.verdict === "refuse"
      ? "opted_out"
      : decision.recordPresent
      ? "consent_evidence_required"
      : "not_consented";
    if (!await ownedReview(supabase, messageId, party.project_id, party.id,
      { path: "client_consent_refused", refusal, prompt_kind: prompt.kind, body }, deps)) {
      return { status: 503, twiml: twimlBody(), disposition: "handoff_failed" };
    }
    return { status: 200, twiml: twimlBody(), disposition: "not_consented" };
  }
  const name = await designerFirstName(supabase, party.project_id, deps);
  const handoff = async (
    details: Record<string, unknown>,
    message: string,
    disposition: string,
  ): Promise<InboundResult> => {
    if (!await ownedReview(supabase, messageId, party.project_id, party.id, details, deps)) {
      return { status: 503, twiml: twimlBody(), disposition: "handoff_failed" };
    }
    return await reply(supabase, conv.id, message, party.id, party.project_id, disposition);
  };

  const verb = body.trim().toUpperCase().split(/\s+/)[0] ?? "";
  let effect: "approve_selection" | "select_window" | null = null;
  let payload: Record<string, unknown> = {};
  /** Set only when the window she picked cannot be named (offeredWindows). */
  let labelDrift: string | null = null;
  if (prompt.kind === "selection_batch" && ["YES", "Y", "OK"].includes(verb)) {
    effect = "approve_selection";
    // THE PROMPT'S OWN VERSION, never a live read of the batch. 00651 refuses a
    // mismatch with `stale_version` and leaves the ask open so the rail
    // re-presents; re-reading the batch here would make every reply current and
    // delete that protection.
    payload = { version: prompt.version };
  } else if (prompt.kind === "window_pick" && WINDOW_OPTIONS.includes(verb)) {
    effect = "select_window";
    // WHICH WINDOW "A" WAS. Her card's two options, composed again from the
    // proposals it was composed from (offeredWindows, above) — not from today's
    // schedule, because the record has to say what SHE read. "C" is "neither of
    // those" and names no window, so it asks nothing.
    //
    // NO VERSION GOES IN THIS PAYLOAD. select_window has no stale door in 00651
    // and needs none: her answer is availability against a delivery, not a
    // decision against a list that can move underneath it.
    let label: string | null = null;
    if (verb !== "C") {
      const offered = await offeredWindows(supabase, prompt);
      label = offered.options[WINDOW_OPTIONS.indexOf(verb)] ?? null;
      // The letter is still hers to record; the words are simply not recoverable.
      if (!label) labelDrift = offered.drift ?? "proposals_changed";
    }
    payload = {
      option: verb,
      subject_kind: "delivery",
      ...(label ? { window_label: label } : {}),
    };
  }
  if (!effect) {
    // ANYTHING ELSE FROM A CLIENT. She answered a question nobody asked her, or
    // answered it in words the card did not print. There is no parser for this
    // and there should not be one: a homeowner's sentence goes to a person.
    return await handoff(
      { path: "client_unreadable", prompt_id: prompt.id, kind: prompt.kind, body },
      `Passed to ${name} — they'll get back to you.`,
      "needs_review",
    );
  }
  if (!sourceSid) {
    // Without the provider's own id the apply cannot be made idempotent, and
    // 00651 refuses it outright. Answering nothing and retaining the SID is the
    // honest outcome: Twilio redelivers and the reply lands once.
    return { status: 503, twiml: twimlBody(), disposition: "client_sid_missing", retainSid: true };
  }

  const details = {
    path: "client_ref",
    prompt_id: prompt.id,
    version: prompt.version,
    effect,
    payload,
    // The receipt says so when the window she picked could not be named, because
    // an availability row with no label is otherwise indistinguishable from one
    // the rail never tried to label.
    ...(labelDrift ? { label_drift: labelDrift } : {}),
  };
  const attempt = await stampMessage(supabase, messageId, party.id, party.project_id, details, 1);
  if (attempt.error) {
    return { status: 503, twiml: twimlBody(), disposition: "prompt_attempt_unrecorded" };
  }

  const { data, error } = await supabase.rpc("apply_client_effect", {
    p_prompt_id: prompt.id,
    p_effect: effect,
    p_payload: payload,
    p_source_sid: sourceSid,
  });
  if (error) {
    const token = clientRefusalOf(error);
    const failure = error as { code?: string; message?: string };
    if (token) {
      return await handoff(
        { ...details, path: "client_refused", refusal: token, sqlstate: failure.code ?? null },
        CLIENT_REFUSALS[token].reply,
        CLIENT_REFUSALS[token].disposition,
      );
    }
    // Not one of ours: the SQLSTATE and the message go on the row so the person
    // who picks this up can see what the database actually said.
    return await handoff(
      {
        ...details,
        path: "client_effect_failed",
        sqlstate: failure.code ?? null,
        sql_message: failure.message ?? null,
      },
      `Got that, but it didn't save — ${name} will follow up.`,
      "client_effect_failed",
    );
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | { status?: string; result?: Record<string, unknown> }
    | null;
  const status = result?.status ?? null;
  if (status === "replayed") {
    // The same inbound, delivered twice. The first one already committed.
    return completedInbound(messageId);
  }
  if (status === "closed") {
    // A reference that has been answered or withdrawn. closedRefReply names the
    // newest reference she CAN answer for the same subject, which is exactly the
    // re-presented batch when there is one.
    return code
      ? await closedRefReply(supabase, conv.id, sender, recipient, code, now.toISOString())
      : await reply(supabase, conv.id, "That one's already answered.",
        party.id, party.project_id, "ref_closed");
  }
  if (status === "expired") {
    return await reply(supabase, conv.id,
      `That one has expired. ${name} will send the current one.`,
      party.id, party.project_id, "ref_expired");
  }
  if (status === "stale_version") {
    // AN OLD REFERENCE NEVER CHANGES TARGET. The list moved after the text went
    // out, so nothing is applied and the ask stays open; the studio re-presents
    // it as a new batch at the new version. She is told the truth and the lead
    // is told there is a list to send again.
    return await handoff(
      { ...details, path: "client_stale_version", refusal: "stale_version", current: result?.result ?? null },
      `Those have changed since that text — ${name} will send the current ones.`,
      "client_stale_version",
    );
  }
  if (status !== "applied") {
    return await handoff(
      { ...details, path: "client_effect_unknown", status },
      `Got that, but it didn't save — ${name} will follow up.`,
      "client_effect_failed",
    );
  }

  const applied = (result?.result as { result?: Record<string, unknown> } | null)?.result ?? null;
  if (effect === "approve_selection") {
    const count = Number((applied as { decision_count?: unknown } | null)?.decision_count ?? 0);
    return {
      ...await reply(supabase, conv.id,
        count === 1
          ? `Got it — that pick is confirmed. ${name} will take it from here.`
          : `Got it — those ${count} picks are confirmed. ${name} will take it from here.`,
        party.id, party.project_id, "client_selection_approved"),
      effectApplied: true,
    };
  }
  const label = (applied as { window_label?: unknown } | null)?.window_label;
  return {
    ...await reply(supabase, conv.id,
      verb === "C"
        ? `Got it — neither of those works. ${name} will find another time.`
        : `Got it — ${typeof label === "string" && label ? label : `option ${verb}`}. ${name} will confirm.`,
      party.id, party.project_id, "client_window_recorded"),
    effectApplied: true,
  };
}

/**
 * Reply-to-renew (contract S6 / P11). A party whose engagement link has simply
 * RUN OUT texts anything at all — "can you send that link again", or an update
 * they cannot file because they have nowhere to file it — and gets one line with
 * a fresh link. Nothing else about their message is acted on: the inbound row is
 * already in the thread for the studio to read, and the next thing they send
 * has a working link behind it.
 *
 * Four refusals, and each one matters more than the convenience:
 *   · an UNKNOWN sender gets nothing. A link is scoped to a party on a project,
 *     and there is no party here to scope it to.
 *   · a SUPPRESSED pair gets nothing. STOP is answered above this and is not
 *     reopened by a text arriving after it.
 *   · a party whose studio has not GRANTED consent gets nothing.
 *   · a REVOKED link is not renewed. Expiry is a lapse and a reply is the ask
 *     that cures it; revocation is a decision a person made about this party's
 *     access, and no inbound text overturns it. So the newest token has to be an
 *     active one that simply passed its own expiry.
 *
 * The link itself is minted by sendPartySms at the moment of dispatch, through
 * create_field_link (00640) and its default of NOT revoking prior tokens —
 * there is nothing left to revoke here, and S6's rule that a credential is
 * created when the text actually goes out is the whole reason this is a template
 * with {{link}} in it rather than a URL pasted into a body.
 */
async function replyToRenew(
  supabase: SupabaseClient,
  party: { id: string; project_id: string } | undefined,
  body: string,
  sender: string,
  recipient: string,
  messageId: string,
  now: Date,
  deps: InboundDeps,
): Promise<InboundResult | null> {
  if (!party || !body.trim()) return null;
  const blocked = await suppression(supabase, sender, recipient);
  if (blocked.blocked) return null;
  if (await channelConsentVerdict(supabase, recipient, party.project_id) !== "allow") return null;

  const { data: links, error } = await supabase
    .from("field_link_tokens")
    .select("status, expires_at, created_at")
    .eq("party_id", party.id)
    .order("created_at", { ascending: false });
  if (error) return null;
  const rows = (links ?? []) as Array<
    { status?: string | null; expires_at?: string | null; created_at?: string | null }
  >;
  // A party who was never given a link is not renewing one.
  if (rows.length === 0) return null;
  const nowMs = now.getTime();
  const expiry = (row: { expires_at?: string | null }) =>
    row.expires_at ? Date.parse(row.expires_at) : NaN;
  // Still holding one that works: say nothing, let the message be read normally.
  if (rows.some((l) => l.status === "active" && expiry(l) > nowMs)) return null;
  const newest = rows[0];
  if (newest.status !== "active" || !(expiry(newest) <= nowMs)) return null;

  const sent = await sendPartySms(supabase, {
    partyId: party.id,
    projectId: party.project_id,
    phone: recipient,
    templateKey: RENEW_TEMPLATE,
    dedupeKey: `renew:${messageId}`,
    automationPhase: 1,
  }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl, now: deps.now });
  // Phase off, no consent, quiet-hours refusal, a missing template: none of
  // those is a reason to swallow the party's message. Fall through and parse it.
  if (!["sent", "queued", "deferred"].includes(sent.status ?? "failed")) return null;
  await stampMessage(supabase, messageId, party.id, party.project_id, {
    path: "link_renew",
    renewed_message_id: sent.messageId ?? null,
  });
  return { status: 200, twiml: twimlBody(), disposition: "link_renewed", messageId };
}

/** The street the hours receipt names — the field the visit cards also print. */
async function siteAddress(supabase: SupabaseClient, projectId: string): Promise<string> {
  const { data } = await supabase.from("projects").select("site_address").eq("id", projectId).maybeSingle();
  const address = String((data as { site_address?: string } | null)?.site_address ?? "")
    .replace(/\s+/g, " ").trim();
  // The same words the day-of card falls back to when nobody typed an address.
  return address || "the job site";
}

/**
 * A NUMBER, AND THE QUESTION THAT ASKED FOR ONE (contract S7).
 *
 * Reached for every body that starts with a digit, and answers null for all but
 * one of them: unless this party has an open report_hours prompt (or the code
 * names one), nothing here fires and the number goes to the digest menu, the
 * chooser, or the parser exactly as it did before. That null IS the
 * compatibility guarantee, so the gate is asked before anything else happens.
 *
 * Where a question IS open:
 *   · a code names it, or — with one open — no code needs to. Two open and no
 *     code is not an answer: nothing says which site, so the codeless door's own
 *     reply asks, and lists the references to answer with.
 *   · a code that is NOT one of this party's open hours questions is answered as
 *     the stale reference it is, never read as hours against another question.
 *   · a number nobody can book (out of the 0–16 range) gets the range and the
 *     reference back, and the prompt is LEFT OPEN: consuming the question over
 *     an unusable number would lose the crew's day.
 *   · an answer that lands goes through the same apply and the same truthful
 *     receipt every other reference does (P0-3): the sentence naming the hours
 *     is composed only after sms_apply_prompt says they were filed.
 */
async function hoursReply(
  supabase: SupabaseClient,
  conv: Conversation,
  parties: Array<{ id: string; project_id: string }>,
  body: string,
  sender: string,
  recipient: string,
  messageId: string,
  now: Date,
  deps: InboundDeps,
): Promise<InboundResult | null> {
  const shape = hoursShape(body);
  if (!shape) return null;
  // The same open set promptReply reads below, for the same reason (contract
  // P14): it is sms_resolve_prompt's predicate minus the code, so a code bound
  // from it is a code SQL will resolve, and a count taken from it is the count
  // 00645's codeless door takes.
  const { data: open, error: openError } = await supabase.from("sms_prompts").select("*")
    .eq("sender_number", sender).eq("recipient_phone", recipient).is("answered_at", null)
    .is("voided_at", null).gt("expires_at", now.toISOString());
  // A READ THAT FAILED IS NOT PROOF NOTHING WAS ASKED. Falling through would
  // hand the number to the digest menu, which would close somebody's task on the
  // strength of a failed query; Twilio redelivers instead.
  if (openError) return { status: 503, twiml: twimlBody(), disposition: "ref_unreadable" };
  const asked = ((open ?? []) as SmsPrompt[]).filter((p) =>
    p.kind === HOURS_PROMPT_KIND &&
    parties.some((party) => party.id === p.party_id && party.project_id === p.project_id));
  if (asked.length === 0) return null;
  let prompt: SmsPrompt;
  if (shape.code) {
    const named = asked.find((p) => p.short_code === shape.code);
    if (!named) {
      return await closedRefReply(supabase, conv.id, sender, recipient, shape.code, now.toISOString());
    }
    prompt = named;
  } else if (asked.length === 1) {
    prompt = asked[0];
  } else {
    return await selectionIntent(supabase, messageId, {
      kind: "ref_clarify", inboundMessageId: messageId,
      options: ((open ?? []) as SmsPrompt[]).filter((p) => p.kind !== "optin").map((p) => ({
        partyId: p.party_id, projectId: p.project_id, promptId: p.id,
      })),
    });
  }
  // Guaranteed by `asked`: the prompt's seat is one of this number's own.
  const party = parties.find((p) => p.id === prompt.party_id && p.project_id === prompt.project_id)!;
  const paused = await pausedReview(supabase, conv.id, party.project_id, party.id, messageId, deps);
  if (paused) return paused;
  const verdict = await channelConsentVerdict(supabase, recipient, party.project_id);
  const blocked = await suppression(supabase, sender, recipient);
  // Asked before the range reply below as well as before the apply: a refused
  // pair is not answered at all, not even to correct them.
  if (blocked.blocked || verdict !== "allow") {
    return { status: blocked.error ? 503 : 200, twiml: twimlBody(), disposition: "not_consented" };
  }
  if (!Number.isFinite(shape.hours) || shape.hours < HOURS_MIN || shape.hours > HOURS_MAX) {
    return await reply(supabase, conv.id,
      `That's more hours than a day holds. Reply with a number between ${HOURS_MIN} and ${HOURS_MAX} — Ref ${prompt.short_code}`,
      party.id, party.project_id, "hours_out_of_range");
  }
  const subject = await promptSubject(supabase, prompt);
  if (!subject) {
    if (!await ownedReview(supabase, messageId, party.project_id, party.id, { path: "ref_subject_missing", prompt }, deps)) {
      return { status: 503, twiml: twimlBody(), disposition: "handoff_failed" };
    }
    return await reply(supabase, conv.id, "That item needs a closer look. Your designer will follow up.",
      party.id, party.project_id, "needs_review");
  }
  const target = { kind: subject.kind, id: subject.id };
  const details = { path: "hours", prompt_id: prompt.id, version: prompt.version,
    intent: HOURS_PROMPT_KIND, hours: shape.hours, target_ref: target };
  const attempt = await stampMessage(supabase, messageId, party.id, party.project_id, details, 1);
  if (attempt.error) return { status: 503, twiml: twimlBody(), disposition: "prompt_attempt_unrecorded" };
  return await consumePrompt(supabase, conv, prompt, messageId, sender, recipient, deps,
    { type: HOURS_PROMPT_KIND, target, hours: shape.hours },
    async () =>
      `Got it — ${shape.hours} hours at ${await siteAddress(supabase, party.project_id)}. ` +
      `${await designerFirstName(supabase, party.project_id, deps)} will confirm.`);
}

/** Codes bind before any parser sees the body. Bare digits belong to menus —
 *  except the one a report_hours prompt asked for (contract S7, hoursReply). */
async function promptReply(supabase: SupabaseClient, conv: Conversation, parties: Array<{id: string; project_id: string}>,
  body: string, sender: string, recipient: string, messageId: string, now: Date,
  media: Array<{path: string; content_type: string; twilio_url: string}>, deps: InboundDeps,
  // The provider's own id for THIS inbound. apply_client_effect takes it as
  // p_source_sid and makes the apply idempotent on it (00651), so the client
  // branch needs the wire value and not our row id.
  sourceSid: string | null = null): Promise<InboundResult | null> {
  if (/^\d/.test(body)) {
    return await hoursReply(supabase, conv, parties, body, sender, recipient, messageId, now, deps);
  }
  const clarification = conv.state_context?.ref_clarification as SelectionBinding | undefined;
  let priorAsked = false;
  if (clarification && typeof clarification === "object") {
    const recovered = await recoverSmsSelection(supabase, { ...clarification, phone: recipient }, deps);
    if (!recovered.selection?.usable) return selectionUnavailable(recovered);
    priorAsked = true;
  }
  // THIS SET IS sms_resolve_prompt's PREDICATE, MINUS THE CODE (contract P14).
  // Everything below counts it — the one-open-prompt codeless door, tradeOpen,
  // refPrompt, the clarify options — so a row in here that SQL will not resolve
  // makes TS and SQL disagree on how many questions are open. Since 00646 that
  // predicate carries voided_at IS NULL, and 00644's void trigger stamps only
  // voided_at (expires_at is immutable), so a withdrawn opt-in challenge would
  // otherwise sit here inflating the count: a bare DONE beside one live prompt
  // would ask which is meant, where sms_resolve_prompt sees exactly one (SQ-101).
  const { data: open, error: openError } = await supabase.from("sms_prompts").select("*")
    .eq("sender_number", sender).eq("recipient_phone", recipient).is("answered_at", null)
    .is("voided_at", null).gt("expires_at", now.toISOString());
  if (openError) return { status: 503, twiml: twimlBody(), disposition: "ref_unreadable" };
  // A trade word binds to the open TRADE prompt even when yesterday's digest is
  // still open beside it: "ON MY WAY" is plainly an answer to the card that
  // asked the crew to say so, and 00645's grammar narrows its own one-open
  // count the same way rather than dropping the guard.
  const tradeOpen = (open ?? []).filter((p: SmsPrompt) => TRADE_PROMPT_KINDS.has(p.kind));
  const trade = tradeShape(body);
  // "LATE 20" on a site card is TWENTY MINUTES, not reference 20 (contract P3).
  // It is the one trade word whose shape collides with VERB NN, and the card
  // printed it in those words, so the number is read as minutes and the reply
  // goes through the codeless door — where the one-open-prompt rule, not a code,
  // is what keeps a forwarded card from answering someone else's question.
  //
  // THAT READING IS THE EXCEPTION, AND IT ONLY EXISTS WHERE A CARD ACTUALLY
  // ASKED. Suppressing the reference match for every LATE body took the verb
  // away from Phase 0's live ref grammar (SQ-95 check 6): "LATE 17" on a closed
  // reference was re-attributed to whatever single prompt was open and handed to
  // a designer as needs_review, where "DELAY 17" — the synonym 00641 and 00645
  // both map to report_delay — correctly answered that the reference is closed.
  // 00645's own sms_prompt_reply_verb binds LATE NN to the CODE on anything but
  // a trade prompt, so the suppression also put TS and SQL in disagreement.
  // Minutes therefore require both halves of the card's own precondition: the
  // rail that prints the words is running (FIELD_LINE_PHASE >= 1), and exactly
  // one site_card/day_of prompt is open on this (sender, recipient) pair.
  // Otherwise NN is a reference, and is answered as one.
  const lateIsMinutes = trade?.verb === "LATE" &&
    fieldLinePhase(deps) >= 1 && tradeOpen.length === 1;
  const refMatch = body.match(/^([a-z]+)\s+(\d{2,3})$/i);
  // Whether NN is a live reference at all, and if so what KIND of prompt it
  // names, is already sitting in `open`: same pair, same unanswered-and-unexpired
  // predicate sms_resolve_prompt uses. Reading it here costs no extra query.
  const refPrompt = refMatch
    ? (open ?? []).find((p: SmsPrompt) => p.short_code === refMatch[2]) ?? null
    : null;
  // TWO cards open and a trade word carrying a number — "LATE 20" with a site
  // card at 20 and the morning ask at 22 — is neither reading (SQ-97 MINOR-1).
  // Minutes it cannot be: nothing says WHICH card is running late. A reference
  // it cannot be either: 00645's sms_prompt_reply_verb keys its trade branch on
  // the resolved prompt's KIND, never reaching its own VERB NN code check, and
  // then demands exactly one open trade prompt — so the apply that TS would
  // send raises 23514 and lands the crew's answer on a designer's desk as a
  // handoff. Reading the digits as a reference here therefore CANNOT complete;
  // the honest answer is the one the codeless door already gives for an
  // ambiguous body, which is to ask which prompt is meant and list them.
  // Nulling the reference match is what routes it there: with no code, no
  // single open prompt and no single open card, nothing binds, and the block
  // below asks. No effect is built, no apply is called, nobody is paged.
  // Only LATE NN and PROBLEM NN reach this at all — "HERE 20" and "DONE 20" are
  // not trade shapes, and SQL answers them by code before it ever counts open
  // cards, so they keep resolving by reference exactly as they do today.
  //
  // AND NEITHER DOES "LATE 17" WHEN 17 IS A LIVE NON-CARD REFERENCE. Nothing is
  // ambiguous there: the crew named a prompt that is open and is not a card, and
  // both readings agree on it. 00645's sms_prompt_reply_verb resolves that
  // prompt by its code and hands back verb LATE without ever counting open
  // cards, so the reference completes on the SQL side too; "DELAY 17" — the
  // synonym 00641 and 00645 both map to report_delay — already binds exactly
  // that reference here; and phase 0 reads it as a reference as well. Clarifying
  // LATE NN where DELAY NN answers is the asymmetry SQ-95 check 6 rejected and
  // SQ-96 R1(b) pinned, and SQ-99 check 3 found it back on the two-card path.
  //
  // PROBLEM NN naming a live non-card reference is deliberately NOT exempt.
  // sms_prompt_reply_verb accepts it, but 00645's sms_apply_prompt admits verb
  // PROBLEM only for site_card/day_of, so binding the reference would send an
  // apply SQL refuses with 23514 and page a designer. Asking which prompt is
  // meant is the safe side of that gap. (The gap itself — TS applying PROBLEM NN
  // on a non-card reference where SQL refuses, reachable on main whenever one or
  // no card is open — is pre-existing and belongs to SQ-14's notes, not here.)
  const lateNamesLiveRef = trade?.verb === "LATE" && !!refPrompt &&
    !TRADE_PROMPT_KINDS.has(refPrompt.kind);
  const tradeAmbiguous = !!trade && !!refMatch && !lateNamesLiveRef &&
    tradeOpen.length > 1 && fieldLinePhase(deps) >= 1;
  const explicit = lateIsMinutes || tradeAmbiguous ? null : refMatch;
  const bareVerb = !!trade ||
    /^(?:yes|y|ok|done|here|arrived|delivered|leaving|departed|available|damaged|damage|good|fine|delay)$/i.test(body);
  let prompt: SmsPrompt | null = null;
  if (explicit || ((open ?? []).length === 1) || (trade && tradeOpen.length === 1)) {
    const code = explicit?.[2] ??
      (trade && tradeOpen.length === 1
        ? tradeOpen[0].short_code
        : open![0].short_code);
    const { data, error } = await supabase.rpc("sms_resolve_prompt", {
      p_sender: sender, p_recipient: recipient, p_code: code,
    });
    if (error) return { status: 503, twiml: twimlBody(), disposition: "ref_unreadable" };
    prompt = Array.isArray(data) ? data[0] : data;
    if (!prompt && explicit) return await closedRefReply(supabase, conv.id, sender, recipient, code, now.toISOString());
  }
  if (!prompt) {
    if (!bareVerb && !explicit) return null;
    if (priorAsked) {
      const projectId = [...new Set(parties.map((p) => p.project_id))].length === 1 ? parties[0].project_id : null;
      if (!await ownedReview(supabase, messageId, projectId, projectId ? parties[0].id : null,
        { path: "ref_ambiguous", body }, deps)) return { status: 503, twiml: twimlBody(), disposition: "triage_unconfigured" };
      return await reply(supabase, conv.id, "Your message needs a closer look. Your designer will follow up.",
        projectId ? parties[0].id : null, projectId, "needs_review");
    }
    return await selectionIntent(supabase, messageId, {
      kind: "ref_clarify", inboundMessageId: messageId,
      options: (open ?? []).filter((p: SmsPrompt) => p.kind !== "optin").map((p: SmsPrompt) => ({
        partyId: p.party_id, projectId: p.project_id, promptId: p.id,
      })),
    });
  }
  const party = parties.find((p) => p.id === prompt!.party_id && p.project_id === prompt!.project_id);
  if (!party || prompt.kind === "optin") {
    if (!explicit) return null;
    return await reply(supabase, conv.id, "Please answer the text update invitation with YES and its reference number.",
      party?.id ?? null, party?.project_id ?? null, "ref_wrong_kind");
  }
  const paused = await pausedReview(supabase, conv.id, party.project_id, party.id, messageId, deps);
  if (paused) return paused;
  // THE HOMEOWNER'S PROMPTS LEAVE HERE (US-3 P23). They are not field cards:
  // their subject is a batch of decisions or a delivery window, which
  // promptSubject below cannot resolve — it reads project_tasks, client_decisions
  // and purchase_orders by the prompt's subject_id — so a client reply carried
  // past this point would be handed to a designer as "that item needs a closer
  // look" while the answer sat in the message. It is also a different door:
  // apply_client_effect, not sms_apply_prompt.
  if (CLIENT_PROMPT_KINDS.has(prompt.kind)) {
    return await clientPromptReply(supabase, conv, prompt, party, body,
      explicit?.[2] ?? null, sender, recipient, sourceSid, messageId, now, deps);
  }
  const subject = await promptSubject(supabase, prompt);
  if (!subject) {
    if (!await ownedReview(supabase, messageId, party.project_id, party.id, { path: "ref_subject_missing", prompt }, deps)) {
      return { status: 503, twiml: twimlBody(), disposition: "handoff_failed" };
    }
    return await reply(supabase, conv.id, "That item needs a closer look. Your designer will follow up.", party.id, party.project_id, "needs_review");
  }
  const verdict = await channelConsentVerdict(supabase, recipient, party.project_id);
  const blocked = await suppression(supabase, sender, recipient);
  if (blocked.blocked || verdict !== "allow") return { status: blocked.error ? 503 : 200, twiml: twimlBody(), disposition: "not_consented" };
  // The trade reading applies only to the prompt whose own copy printed those
  // words. Resolved to anything else, the body is read exactly as it was before.
  const tradePrompt = trade && TRADE_PROMPT_KINDS.has(prompt.kind) ? trade : null;
  const verb = tradePrompt?.verb ?? (explicit?.[1] ?? body).toUpperCase();
  const intent = tradePrompt?.intent
    ?? ({ DONE: "mark_done", HERE: "report_arrival", ARRIVED: "report_arrival", DELIVERED: "report_arrival",
    LEAVING: "report_departure", DEPARTED: "report_departure", GOOD: "confirm_delivery", FINE: "confirm_delivery" } as Record<string, string>)[verb]
    ?? (["YES", "Y", "OK"].includes(verb) ? prompt.kind : null);
  let parsed: FieldParseResult = prompt.proposed_effect ? {
    intent: prompt.proposed_effect.type as FieldParseResult["intent"], target_ref: subject,
    new_date: null, note: "", confidence: 1,
  } : intent ? {
    intent: intent as FieldParseResult["intent"], target_ref: subject, new_date: null,
    note: tradePrompt?.note ?? body, confidence: 1,
    ...(tradePrompt?.condition ? { condition: tradePrompt.condition } : {}),
  } : await (deps.parseFn ?? parseFieldMessage)({ body: explicit?.[1] ?? body,
    openItems: [{ ...subject, project_name: "", due: null }], recentMessages: [],
    today: now.toISOString().slice(0, 10), hasMedia: media.length > 0 }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
  if (prompt.proposed_effect) {
    const original = prompt.proposed_effect;
    parsed = { ...parsed, intent: original.type as FieldParseResult["intent"],
      note: String(original.note ?? ""), new_date: original.new_date as string ?? null,
      availability: original.availability as FieldParseResult["availability"],
      condition: original.condition as FieldParseResult["condition"] };
  }
  // Parser suggestions never replace the immutable subject or actor of this ref.
  parsed.target_ref = { kind: subject.kind, id: subject.id };
  const details = { path: "ref", prompt_id: prompt.id, version: prompt.version, ...parsed };
  const attempt = await stampMessage(supabase, messageId, party.id, party.project_id, details, parsed.confidence);
  if (attempt.error) return { status: 503, twiml: twimlBody(), disposition: "prompt_attempt_unrecorded" };
  const affirmative = ["YES", "Y", "OK"].includes(verb);
  const commandVerb = /^(?:YES|Y|OK|DONE|HERE|ARRIVED|DELIVERED|LEAVING|DEPARTED|DELAY|LATE|BLOCKED|BLOCKER|AVAILABLE|DAMAGED|DAMAGE|GOOD|FINE|PROBLEM)$/.test(verb);
  const availabilityReply = !explicit && prompt.kind === "confirm_availability" && (open ?? []).length === 1;
  const conditionReply = !explicit && ["report_condition", "confirm_delivery"].includes(prompt.kind) && (open ?? []).length === 1;
  if ((prompt.proposed_effect ? !affirmative : !commandVerb && !availabilityReply && !conditionReply) || parsed.confidence < 0.8 ||
    (parsed.intent === "report_condition" && !parsed.condition) ||
    (parsed.intent === "confirm_availability" && !parsed.availability) ||
    ![...DELIVERY_EFFECTS, "mark_done", "report_delay", "flag_blocker", "confirm_delivery", "note", "punch_report"].includes(parsed.intent)) {
    if (!await ownedReview(supabase, messageId, party.project_id, party.id, details, deps)) {
      return { status: 503, twiml: twimlBody(), disposition: "handoff_failed" };
    }
    return await reply(supabase, conv.id, `Passed to ${await designerFirstName(supabase, party.project_id, deps)} — they'll get back to you.`,
      party.id, party.project_id, "needs_review");
  }
  if (media.length) {
    media = await rehomeHoldingMedia(supabase, media, party.project_id);
    await supabase.from("sms_messages").update({ media }).eq("id", messageId);
  }
  return await consumePrompt(supabase, conv, prompt, messageId, sender, recipient, deps,
    prompt.proposed_effect ? undefined : buildEffect(parsed, media));
}

interface SelectionBinding {
  kind: SelectionIntent["kind"];
  inboundMessageId: string;
  messageId: string;
}

function selectionUnavailable(result: { status?: string; selection?: SelectionQuestion; reason?: string }): InboundResult {
  const pending = !!result.selection && !result.selection.usable &&
    ["queued", "deferred"].includes(result.status ?? "failed");
  // Failed/claimed recovery has done no business work: retry this inbound,
  // rather than preserving an unstamped SID that would dedupe to success.
  return { status: pending ? 200 : 503, twiml: twimlBody(),
    disposition: pending ? "selection_pending" : "selection_unavailable", retainSid: pending };
}

async function selectionIntent(supabase: SupabaseClient, messageId: string, selection: SelectionIntent, details: Record<string, unknown> = {}): Promise<InboundResult> {
  const { error } = await stampMessage(supabase, messageId, null, null, { ...details, selection_intent: selection });
  if (error) return { status: 503, twiml: twimlBody(), disposition: "selection_unrecorded", retainSid: true };
  return { status: 200, twiml: twimlBody(), disposition: selection.kind === "project_choice" ? "project_chooser" : "ref_clarify",
    messageId, selection, retainSid: true };
}

/** Bind only a durable shared-sender result. Handset metadata never supplies options. */
export async function bindInboundSelection(supabase: SupabaseClient, messageId: string,
  question: SelectionQuestion, outboundId: string): Promise<boolean> {
  const manifest = question.manifest;
  if (manifest.inboundMessageId !== messageId) return false;
  const { data: source, error: sourceError } = await supabase.from("sms_messages")
    .select("id, created_at, body, media, parsed_intent").eq("id", messageId).single();
  if (sourceError || !source) return false;
  // Snapshot before completion: a late binder must not acquire a newer
  // question after proving its own origin unresolved.
  const conv = await readContext(supabase, manifest.conversationId, null);
  const completion = await inboundCompletion(supabase, messageId, manifest.senderNumber, manifest.recipientPhone, manifest.conversationId);
  if (completion.status === "unknown") return false;
  if (completion.status !== "unresolved") return true;
  if (!source.parsed_intent?.selection_intent) return true;
  const previousSource = (conv?.state_context?.selection as SelectionBinding | undefined)?.inboundMessageId ??
    (conv?.state_context?.ref_clarification as SelectionBinding | undefined)?.inboundMessageId ?? conv?.state_context?.pending_message_id;
  if (previousSource && previousSource !== messageId) {
    const { data: previous, error } = await supabase.from("sms_messages")
      .select("id, created_at").eq("id", previousSource).maybeSingle();
    if (error || !previous || !source.created_at || !previous.created_at) return false;
    // Source order decides which question wins; the flattened root decides
    // completion only. Equal timestamps use the immutable inbound ID.
    if (source.created_at < previous.created_at ||
        (source.created_at === previous.created_at && source.id <= previous.id)) return true;
  }
  const binding: SelectionBinding = { kind: manifest.kind, inboundMessageId: messageId, messageId: outboundId };
  const context = conv?.backfilled_at ? {} : { ...conv?.state_context };
  if (manifest.kind === "project_choice") {
    context.selection = binding;
    context.pending_body = source.parsed_intent?.legacy_reask ? "" : source.parsed_intent?.legacy_pending?.body ?? source.body;
    context.pending_media = source.parsed_intent?.legacy_pending?.media ?? source.media ?? [];
    context.pending_message_id = messageId;
    context.pending_root_id = (completion.rootSource ?? completion.source).id;
  } else context.ref_clarification = binding;
  if (!conv) {
    const { data: inserted, error } = await supabase.from("sms_conversation_context").upsert({
      conversation_id: manifest.conversationId, project_id: null, party_id: null,
      state: manifest.kind === "project_choice" ? "awaiting_project_choice" : "idle", state_context: context,
      paused_until: null, backfilled_at: null,
    }, { onConflict: "conversation_id,project_id", ignoreDuplicates: true }).select("conversation_id");
    return !error && !!inserted?.length;
  }
  const { data: rows, error: updateError } = await contextSnapshot(supabase.from("sms_conversation_context")
    .update({ state: manifest.kind === "project_choice" ? "awaiting_project_choice" : conv.state, state_context: context, backfilled_at: null }), conv)
    .select("conversation_id");
  return !updateError && !!rows?.length;
}

// ── small pure/util helpers ──────────────────────────────────────────────────
function firstInt(s: string): number | null {
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * A fresh explicit project pin (within PROJECT_PIN_TTL_MS) from a
 * project context, or null. Only an explicit choice scopes later freeform
 * parsing; an unscoped MMS remains in holding storage until resolution.
 */
function freshProjectPin(
  stateContext: Record<string, unknown> | undefined,
  now: Date,
): string | null {
  const pin = stateContext?.project_pin as { project_id?: string; at?: string } | undefined;
  const pinAge = pin?.at ? now.getTime() - new Date(String(pin.at)).getTime() : Infinity;
  return pin?.project_id && pinAge <= PROJECT_PIN_TTL_MS ? pin.project_id : null;
}

/** A menu reply is a bare number, or "DONE n" / "n done" (case-insensitive). */
export function menuNumber(body: string): number | null {
  const t = body.trim();
  if (/^\d+$/.test(t)) return parseInt(t, 10);
  const m = t.match(/^done\s*(\d+)$/i) || t.match(/^(\d+)\s*done$/i);
  return m ? parseInt(m[1], 10) : null;
}

function buildEffect(parsed: FieldParseResult, media: Array<{ path: string }>): Record<string, unknown> {
  const target = parsed.target_ref ? { kind: parsed.target_ref.kind, id: parsed.target_ref.id } : undefined;
  const base: Record<string, unknown> = { type: parsed.intent, note: parsed.note };
  if (target) base.target = target;
  if (parsed.new_date) base.new_date = parsed.new_date;
  if (parsed.availability) base.availability = parsed.availability;
  if (parsed.condition) base.condition = parsed.condition;
  if (media.length > 0) base.media = media.map((m) => m.path);
  // Normalize LLM-only intents to apply_field_effect's vocabulary.
  if (parsed.intent === "question" || parsed.intent === "unclear") base.type = "note";
  return base;
}

type EffectOutcome = { status: "saved"; result: Record<string, unknown> } |
  { status: "replayed" } | { status: "failed"; error: unknown } | { status: "unknown" };

async function applyEffect(supabase: SupabaseClient, partyId: string, effect: Record<string, unknown>,
  messageId: string, sender: string, recipient: string, conversationId: string): Promise<EffectOutcome> {
  let failure: unknown;
  try {
    const { data, error } = await supabase.rpc("apply_field_effect", {
      p_party_id: partyId, p_effect: effect, p_source: "sms", p_sms_message_id: messageId,
    });
    if (!error && data?._sms_replayed === true) return { status: "replayed" };
    if (!error && data && typeof data.applied === "boolean") return { status: "saved", result: data };
    failure = error;
  } catch (error) { failure = error; }
  const completion = await inboundCompletion(supabase, messageId, sender, recipient, conversationId);
  if (completion.status === "effect-completed" || completion.status === "prompt-completed") return { status: "replayed" };
  if (completion.status === "unresolved" && /^(?:23[0-9A-Z]{3}|42501|P0001|40001|40P01)$/.test(String((failure as { code?: string })?.code ?? ""))) {
    return { status: "failed", error: failure };
  }
  return { status: "unknown" };
}

function confirmText(applied: Record<string, unknown>, intent?: string): string {
  if (intent === "note" || applied.effect_type === "note") return "Your note was saved.";
  if (intent === "confirm_delivery" || applied.effect_type === "confirm_delivery") return "Your delivery update was saved.";
  const summary = String(applied.summary_text ?? "Got it.");
  const remaining = Number(applied.remaining_count ?? 0);
  return remaining > 0 ? `${summary} ${remaining} left.` : summary;
}

function clarifyText(parsed: FieldParseResult, item: CandidateItem): string {
  switch (parsed.intent) {
    case "mark_done":
      return `Mark "${item.title}" done? Reply YES.`;
    case "report_delay":
      return `Push "${item.title}"${parsed.new_date ? ` to ${parsed.new_date}` : ""}? Reply YES.`;
    case "flag_blocker":
      return `Flag a blocker on "${item.title}" for your designer? Reply YES.`;
    default:
      return `Update "${item.title}"? Reply YES.`;
  }
}

async function stampMessage(
  supabase: SupabaseClient,
  messageId: string,
  partyId: string | null,
  projectId: string | null,
  parsed: Record<string, unknown>,
  confidence?: number,
) {
  return await supabase.from("sms_messages")
    .update({ party_id: partyId, project_id: projectId, parsed_intent: parsed, confidence: confidence ?? null })
    .eq("id", messageId);
}

async function loadProjectNames(supabase: SupabaseClient, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await supabase.from("projects").select("id, name").in("id", ids);
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as Array<{ id: string; name: string }>) out[r.id] = r.name;
  return out;
}

async function loadRecentMessages(
  supabase: SupabaseClient,
  conversationId: string,
  /** Exclude this row (the original stashed message when replaying its text
   * as the current `body`) so the LLM isn't fed the same content twice. */
  excludeId?: string | null,
  projectId?: string,
): Promise<{ direction: string; body: string }[]> {
  const { data } = await supabase
    .from("sms_messages")
    .select("id, direction, body, created_at")
    .eq("conversation_id", conversationId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(5);
  return ((data ?? []) as Array<{ id: string; direction: string; body: string }>)
    .filter((m) => !excludeId || m.id !== excludeId)
    .reverse()
    .map((m) => ({ direction: m.direction, body: m.body ?? "" }));
}

/**
 * Re-home holding/ media to the project path once a chooser pick resolves
 * which project it belongs to, and repoint the originating sms_messages.media
 * entries at the new paths. Each holding/ path encodes its own originating
 * conversation/message id (`holding/<conversationId>/<messageId>/<file>`), so
 * this works even if pendingMedia spans more than one stashed message. A
 * per-item move failure keeps that item's holding path — never throws, never
 * blocks the reply.
 */
async function rehomeHoldingMedia(
  supabase: SupabaseClient,
  media: Array<{ path: string; content_type: string; twilio_url: string }>,
  projectId: string,
): Promise<Array<{ path: string; content_type: string; twilio_url: string }>> {
  const out: Array<{ path: string; content_type: string; twilio_url: string }> = [];
  const movesByMessage = new Map<string, Array<{ oldPath: string; newPath: string }>>();

  for (const m of media) {
    if (!m.path.startsWith("holding/")) {
      out.push(m);
      continue;
    }
    const parts = m.path.split("/");
    // holding/<conversationId>/<messageId>/<file...>
    if (parts.length < 4) {
      out.push(m);
      continue;
    }
    const originMessageId = parts[2];
    const filename = parts.slice(3).join("/");
    const newPath = `project/${projectId}/sms/${originMessageId}/${filename}`;

    if (await moveMediaObject(supabase, m.path, newPath)) {
      out.push({ ...m, path: newPath });
      const moves = movesByMessage.get(originMessageId) ?? [];
      moves.push({ oldPath: m.path, newPath });
      movesByMessage.set(originMessageId, moves);
    } else {
      out.push(m);
    }
  }

  for (const [originMessageId, moves] of movesByMessage) {
    try {
      const { data: row } = await supabase
        .from("sms_messages")
        .select("media")
        .eq("id", originMessageId)
        .maybeSingle();
      const existing = ((row as { media?: Array<{ path: string; content_type: string; twilio_url: string }> } | null)
        ?.media) ?? [];
      if (existing.length === 0) continue;
      const updated = existing.map((entry) => {
        const move = moves.find((mv) => mv.oldPath === entry.path);
        return move ? { ...entry, path: move.newPath } : entry;
      });
      await supabase.from("sms_messages").update({ media: updated }).eq("id", originMessageId);
    } catch (err) {
      // The objects already moved but the repoint crashed before landing —
      // left alone, the row would point at a vanished holding/ path forever.
      // Compensate by moving each object back so storage and the (still
      // unrepointed) row agree again; a later retry will re-attempt the move
      // and, via moveMediaObject's idempotency check, pick up cleanly even if
      // THIS compensating move-back also fails.
      console.error("rehomeHoldingMedia sms_messages update failed — rolling back the move(s):", err);
      for (const mv of moves) {
        try {
          const { error: compError } = await supabase.storage.from("field-media").move(mv.newPath, mv.oldPath);
          if (compError) {
            console.error("rehomeHoldingMedia compensating move-back failed:", compError, mv);
            continue;
          }
          const idx = out.findIndex((o) => o.path === mv.newPath);
          if (idx >= 0) out[idx] = { ...out[idx], path: mv.oldPath };
        } catch (compErr) {
          console.error("rehomeHoldingMedia compensating move-back threw:", compErr, mv);
        }
      }
    }
  }

  return out;
}

/**
 * Move one object, tolerating a retry of an already-completed move: if the
 * source is gone but the destination is already there, a prior attempt moved
 * it but crashed before its sms_messages repoint landed — treat this as
 * "already done" (the caller still repoints the row) rather than a failure.
 */
async function moveMediaObject(
  supabase: SupabaseClient,
  fromPath: string,
  toPath: string,
): Promise<boolean> {
  try {
    const { error } = await supabase.storage.from("field-media").move(fromPath, toPath);
    if (!error) return true;
    if (await storageObjectExists(supabase, toPath)) return true;
    console.error("rehomeHoldingMedia move failed:", error);
    return false;
  } catch (err) {
    if (await storageObjectExists(supabase, toPath)) return true;
    console.error("rehomeHoldingMedia move threw:", err);
    return false;
  }
}

async function storageObjectExists(
  supabase: SupabaseClient,
  path: string,
): Promise<boolean> {
  const idx = path.lastIndexOf("/");
  const dir = idx >= 0 ? path.slice(0, idx) : "";
  const name = idx >= 0 ? path.slice(idx + 1) : path;
  try {
    const { data, error } = await supabase.storage.from("field-media").list(dir, { search: name });
    if (error || !data) return false;
    return (data as Array<{ name: string }>).some((f) => f.name === name);
  } catch {
    return false;
  }
}

async function ingestMedia(
  params: InboundParams,
  deps: InboundDeps,
  conversationId: string,
  messageId: string,
  projectId: string | null,
): Promise<Array<{ path: string; content_type: string; twilio_url: string }>> {
  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const fetchImpl = deps.fetchImpl ?? fetch;
  const accountSid = getEnv("TWILIO_ACCOUNT_SID");
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const num = parseInt(params.NumMedia ?? "0", 10) || 0;
  const out: Array<{ path: string; content_type: string; twilio_url: string }> = [];
  const { data: prior, error: priorError } = await deps.supabase.from("sms_messages").select("media").eq("id", messageId).single();
  if (priorError) throw priorError;
  for (let i = 0; i < num; i++) {
    const url = params[`MediaUrl${i}`];
    if (!url) continue;
    const stored = Array.isArray(prior?.media) ? prior.media.find((m: {twilio_url: string}) => m.twilio_url === url) : null;
    if (stored) { out.push(stored); continue; }
    const ct = params[`MediaContentType${i}`] ?? "application/octet-stream";
    try {
      const res = await fetchImpl(url, {
        headers: accountSid && authToken
          ? { Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}` }
          : {},
      });
      if (!res.ok) continue;
      const bytes = new Uint8Array(await res.arrayBuffer());
      const ext = extFor(ct);
      const path = projectId
        ? `project/${projectId}/sms/${messageId}/${i}.${ext}`
        : `holding/${conversationId}/${messageId}/${i}.${ext}`;
      const { error } = await deps.supabase.storage.from("field-media").upload(path, bytes, { contentType: ct, upsert: true });
      if (!error) out.push({ path, content_type: ct, twilio_url: url });
    } catch (err) {
      console.error("ingestMedia failed:", err);
    }
  }
  return out;
}

function extFor(contentType: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png",
    "image/gif": "gif", "image/webp": "webp", "image/heic": "heic",
    "video/mp4": "mp4", "application/pdf": "pdf",
  };
  return map[contentType] ?? "bin";
}
