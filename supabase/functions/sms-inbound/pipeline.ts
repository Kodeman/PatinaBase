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
import { orgsOfProjects, resolveStudioName } from "../_shared/sms.ts";
import { captureServerEvent } from "../_shared/aesthete-events.ts";

const FIELD_KINDS = ["gc", "sub", "installer", "receiver"];
const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const START_WORDS = ["START", "UNSTOP"];
const MENU_TTL_MS = 12 * 3600 * 1000;
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
  state_context: Record<string, unknown>;
}

async function findOrCreateConversation(
  supabase: SupabaseClient,
  twilioNumber: string,
  phone: string,
): Promise<Conversation> {
  const { data: existing } = await supabase
    .from("sms_conversations")
    .select("id, active_project_id, party_id, state, state_context")
    .eq("twilio_number", twilioNumber)
    .eq("phone_e164", phone)
    .maybeSingle();
  if ((existing as Conversation | null)?.id) return existing as Conversation;

  const { data: created, error } = await supabase
    .from("sms_conversations")
    .insert({ twilio_number: twilioNumber, phone_e164: phone })
    .select("id, active_project_id, party_id, state, state_context")
    .single();
  if (error || !created) {
    // Lost a create race — re-read rather than dereference a null row.
    const { data: retry } = await supabase
      .from("sms_conversations")
      .select("id, active_project_id, party_id, state, state_context")
      .eq("twilio_number", twilioNumber)
      .eq("phone_e164", phone)
      .maybeSingle();
    return retry as Conversation;
  }
  return created as Conversation;
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
): Promise<InboundResult> {
  await logOutbound(supabase, conversationId, message, partyId, projectId);
  return { status: 200, twiml: twimlBody(message), disposition };
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
  sms_consent_status: string;
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
    .select("id, project_id, sms_consent_status")
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
 */
async function studiosHoldingPhone(
  supabase: SupabaseClient,
  parties: PhoneParty[],
): Promise<StudioTarget[]> {
  const projectIds = [...new Set(parties.map((p) => p.project_id))];
  if (projectIds.length === 0) return [];
  // One resolver, shared with the send gate (_shared/sms.ts), so the two sides
  // of the rail cannot disagree about which studio a project belongs to.
  const { orgs: orgOfProject, failed } = await orgsOfProjects(
    supabase,
    projectIds,
  );
  // A seat whose studio could not be read is a studio this keyword will not
  // reach. Say so in the log rather than letting the map come back quietly
  // short (R-AM); the phone-global party-row write below still carries the
  // STOP, and studiosHoldingRecord() still carries every studio that holds a
  // record.
  if (failed) {
    console.error(
      "studiosHoldingPhone: some seats could not be attributed to a studio",
      { projectIds },
    );
  }

  const out: StudioTarget[] = [];
  const byOrg = new Map<string, StudioTarget>();
  for (const p of parties) {
    const org = orgOfProject.get(p.project_id);
    if (!org) continue;
    let target = byOrg.get(org);
    if (!target) {
      target = { org, projectId: p.project_id, partyIds: [] };
      byOrg.set(org, target);
      out.push(target);
    }
    target.partyIds.push(p.id);
  }
  return out;
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
  onlyStatuses?: string[],
): Promise<{ orgs: string[]; failed: boolean }> {
  const { data, error } = await supabase
    .from("studio_channel_consent")
    .select("organization_id, status")
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
    { organization_id: string; status: string }
  >;
  return {
    orgs: rows
      .filter((r) => !onlyStatuses || onlyStatuses.includes(r.status))
      .map((r) => r.organization_id),
    failed: false,
  };
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
    await supabase.from("studio_channel_consent").upsert({
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
): Promise<string> {
  if (!projectId) return "your designer";
  const { data: proj } = await supabase
    .from("projects").select("designer_id").eq("id", projectId).maybeSingle();
  const designerId = (proj as { designer_id?: string } | null)?.designer_id;
  if (!designerId) return "your designer";
  const { data: pr } = await supabase
    .from("profiles").select("full_name").eq("id", designerId).maybeSingle();
  const full = (pr as { full_name?: string } | null)?.full_name;
  return full ? full.trim().split(/\s+/)[0] : "your designer";
}

// ── the pipeline (signature already verified; injectable for tests) ──────────
export async function processInbound(
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

  // (c) idempotency claim on a per-conversation message row.
  const conv = await findOrCreateConversation(supabase, to, from);
  const { data: claimed } = await supabase
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
  if (!claimed || (claimed as unknown[]).length === 0) {
    return { status: 200, twiml: twimlBody(), disposition: "duplicate" };
  }
  const messageId = (claimed as Array<{ id: string }>)[0].id;
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
  if (STOP_WORDS.includes(upper)) {
    // Every studio holding the number — by seat, and by record even with no
    // seat left. A refusal that cannot reach a record leaves that record
    // saying granted, and the send gate honours it.
    const stopPhoneParties = await loadPhoneParties(supabase, from);
    const stopRecordStudios = await studiosHoldingRecord(supabase, from);
    const stopTargets = withRecordOnlyStudios(
      await studiosHoldingPhone(supabase, stopPhoneParties.parties),
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
    if (
      stopPhoneParties.failed || stopRecordStudios.failed || stopWrite.failed
    ) {
      console.error(
        "sms-inbound STOP: refusing to acknowledge — the refusal was not fully recorded",
        {
          phone: from,
          partiesReadFailed: stopPhoneParties.failed,
          recordReadFailed: stopRecordStudios.failed,
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
    // Twilio Advanced Opt-Out already auto-replied — do NOT reply.
    return { status: 200, twiml: twimlBody(), disposition: "opted_out" };
  }
  if (START_WORDS.includes(upper)) {
    // A START is a RE-subscription: it answers a sender that asked. So the
    // target set is the studios whose own record for this number is currently
    // `opted_out` (the refusal it lifts) or `pending` (the invite it answers).
    // A studio at `not_asked`, or with no record at all, is untouched even when
    // it holds a seat on the number — holding a seat is not having asked, and
    // granting on a seat manufactured consent for a studio that never invited
    // this person (R-AJ). The seat-derived arm survives only to carry each
    // qualifying studio's party rows, which the grant reads for its evidence.
    // A failed read here logs (loadPhoneParties / studiosHoldingRecord) and
    // grants fewer studios, which leaves the standing refusal standing — the
    // fail-closed direction, so unlike the STOP branch this one still answers
    // 200 rather than replaying a re-subscription.
    const startOrgs = (await studiosHoldingRecord(supabase, from, [
      "opted_out",
      "pending",
    ])).orgs;
    const startOrgSet = new Set(startOrgs);
    const startTargets = withRecordOnlyStudios(
      (await studiosHoldingPhone(
        supabase,
        (await loadPhoneParties(supabase, from)).parties,
      ))
        .filter((t) => startOrgSet.has(t.org)),
      startOrgs,
    );
    await writeChannelConsent(
      supabase,
      startTargets,
      from, "granted", nowIso, `Inbound ${upper}`,
    );
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "keyword", intent: "start", confidence_bucket: "n/a", disposition: "resubscribed" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    return { status: 200, twiml: twimlBody(), disposition: "resubscribed" };
  }

  // Resolve candidate parties (needed for YES-on-pending + everything below).
  const { data: partyRows } = await supabase
    .from("project_parties")
    .select("id, project_id, party_kind, sms_consent_status, display_name")
    .eq("phone_e164", from);
  const parties = (partyRows ?? []) as Array<{
    id: string; project_id: string; party_kind: string; sms_consent_status: string; display_name: string | null;
  }>;

  if (upper === "YES" || upper === "Y") {
    const hasPending = parties.some((p) => p.sms_consent_status === "pending");
    if (hasPending) {
      // Only the studios that actually asked: a YES confirms the invite that
      // was sent, never a studio that never invited this number.
      const askedTargets = await studiosHoldingPhone(
        supabase,
        parties.filter((p) => p.sms_consent_status === "pending"),
      );
      // …but the RECORD is per studio, not per seat, so the target is the
      // studio: every seat it holds on the number is carried only to give the
      // grant its evidence (seatConsentEvidence) and its origin. Which studios
      // are targeted is the narrow question (R-AJ) — only the ones that
      // actually asked. The origin project stays the one that ASKED, so R-Q's
      // sentence names the job the invite went out on.
      const originByOrg = new Map(askedTargets.map((t) => [t.org, t.projectId]));
      const yesTargets = (await studiosHoldingPhone(supabase, parties))
        .filter((t) => originByOrg.has(t.org))
        .map((t) => ({ ...t, projectId: originByOrg.get(t.org) ?? t.projectId }));
      await writeChannelConsent(
        supabase,
        yesTargets,
        from, "granted", nowIso, `Inbound ${upper}`,
      );
      await captureServerEvent("sms-inbound", "sms_opt_in", { phone: from }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
      const pending = parties.find((p) => p.sms_consent_status === "pending")!;
      const projectNames = await loadProjectNames(supabase, [pending.project_id]);
      const confirm = await renderSms(supabase, "sms_optin_confirm", {
        party_first_name: pending.display_name ? pending.display_name.trim().split(/\s+/)[0] : "there",
        studio_name: (await resolveStudioName(supabase, pending.project_id)) ?? "your studio",
        project_name: projectNames[pending.project_id] ?? "your project",
      });
      await captureServerEvent("sms-inbound", "sms_parse_outcome",
        { path: "keyword", intent: "opt_in", confidence_bucket: "n/a", disposition: "granted" },
        { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
      return await reply(supabase, conv.id, confirm || "You're all set for job updates.", pending.id, pending.project_id, "granted");
    }
    // else: a YES with nothing pending falls through to the normal parse.
  }

  if (upper === "HELP" || upper === "INFO") {
    const studio = parties[0] ? (await resolveStudioName(supabase, parties[0].project_id)) : null;
    const help = await renderSms(supabase, "sms_help", { studio_name: studio ?? "your design studio" });
    return await reply(supabase, conv.id, help || "Patina relays project updates. Reply STOP to opt out.", conv.party_id, conv.active_project_id, "help");
  }

  // (e) Unknown phone — polite brush-off + orphan needs_review row.
  if (parties.length === 0) {
    await supabase.from("sms_messages")
      .update({ needs_review: true, parsed_intent: { path: "unmatched" } })
      .eq("id", messageId);
    return await reply(
      supabase, conv.id,
      "Thanks — this number isn't linked to a project yet. Your designer will follow up.",
      null, null, "unmatched",
    );
  }

  const projectIds = [...new Set(parties.map((p) => p.project_id))];
  const projectNames = await loadProjectNames(supabase, projectIds);

  // (f) MMS — fetch + store to field-media (project if known, else holding).
  // Prefer a FRESH explicit project_pin over the merely-single-project case —
  // conv.active_project_id is stamped at conversation creation by whoever
  // texted first and is stale for this purpose (see the pin comment below).
  const numMedia = parseInt(params.NumMedia ?? "0", 10) || 0;
  const bestProject = freshProjectPin(conv.state_context, now) ??
    (projectIds.length === 1 ? projectIds[0] : null);
  let media: Array<{ path: string; content_type: string; twilio_url: string }> = [];
  if (numMedia > 0) {
    media = await ingestMedia(params, deps, conv.id, messageId, bestProject);
    if (media.length > 0) {
      await supabase.from("sms_messages").update({ media }).eq("id", messageId);
    }
  }

  // (g) Deterministic: project-choice → confirmation → numbered menu.
  if (conv.state === "awaiting_project_choice") {
    const choice = firstInt(body);
    const chooser = (conv.state_context?.chooser ?? []) as Array<{ n: number; project_id: string; party_id: string }>;
    const pick = chooser.find((c) => c.n === choice);
    if (pick) {
      // Merge — never overwrite — state_context: a digest `menu` (or other
      // stashed keys) predating the chooser must survive the resolution.
      const mergedContext = { ...conv.state_context };
      delete mergedContext.chooser;
      const pendingText = typeof mergedContext.pending_body === "string" ? mergedContext.pending_body : "";
      let pendingMedia = Array.isArray(mergedContext.pending_media)
        ? mergedContext.pending_media as Array<{ path: string; content_type: string; twilio_url: string }>
        : [];
      const pendingMessageId = typeof mergedContext.pending_message_id === "string"
        ? mergedContext.pending_message_id
        : null;
      delete mergedContext.pending_body;
      delete mergedContext.pending_media;
      delete mergedContext.pending_message_id;
      if (pendingMessageId) {
        // The stashed message — not this digit reply — carries the content;
        // attribution (parsed_intent/confidence/needs_review) belongs on it.
        effectiveMessageId = pendingMessageId;
        replayExcludeFromHistory = pendingMessageId;
      }
      // Re-home any holding/ media now that a project is known — best effort;
      // a move failure keeps the holding path rather than failing the reply.
      if (pendingMedia.length > 0) {
        pendingMedia = await rehomeHoldingMedia(supabase, pendingMedia, pick.project_id);
      }
      // This turn's OWN MMS (ingested above, pre-resolution, so bestProject
      // couldn't know the project yet and it landed in holding/ too) gets the
      // same treatment — it must not be stranded just because it rode in on
      // the digit reply instead of the message that triggered the chooser.
      if (media.some((m) => m.path.startsWith("holding/"))) {
        media = await rehomeHoldingMedia(supabase, media, pick.project_id);
      }
      // THE pin: only an explicit chooser pick scopes the conversation.
      mergedContext.project_pin = { project_id: pick.project_id, at: nowIso };
      // Conditional on the chooser state still being live: two picks racing in
      // (Twilio retries, double-tap) must not both replay the stashed update.
      const { data: resolvedRows } = await supabase.from("sms_conversations")
        .update({ state: "idle", active_project_id: pick.project_id, party_id: pick.party_id, state_context: mergedContext })
        .eq("id", conv.id)
        .eq("state", "awaiting_project_choice")
        .select("id");
      if (!resolvedRows || (resolvedRows as unknown[]).length === 0) {
        // Another message already resolved this chooser — do nothing twice.
        return { status: 200, twiml: twimlBody(), disposition: "project_choice_race" };
      }
      if (!pendingText && pendingMedia.length === 0) {
        await stampMessage(supabase, effectiveMessageId, pick.party_id, pick.project_id, { path: "menu", disambiguated: true });
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

  if (conv.state === "awaiting_confirmation" && (upper === "YES" || upper === "Y" || upper === "OK")) {
    const pending = conv.state_context?.pending_effect as Record<string, unknown> | undefined;
    const partyId = (conv.state_context?.pending_party_id as string | undefined) ?? conv.party_id;
    if (pending && partyId) {
      const applied = await applyEffect(supabase, partyId, pending, messageId);
      // Clear only this branch's own keys — a digest menu or project pin in
      // state_context must survive the confirmation.
      const clearedContext = { ...conv.state_context };
      delete clearedContext.pending_effect;
      delete clearedContext.pending_party_id;
      await supabase.from("sms_conversations").update({ state: "idle", state_context: clearedContext }).eq("id", conv.id);
      const projectId = (pending as { _project_id?: string })._project_id ?? conv.active_project_id;
      await captureServerEvent("sms-inbound", "sms_parse_outcome",
        { path: "llm", intent: String((pending as { type?: string }).type), confidence_bucket: "mid", disposition: "applied_confirmed" },
        { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
      return await reply(supabase, conv.id, confirmText(applied), partyId, projectId ?? null, "applied_confirmed");
    }
  }

  // Numbered menu reply ("DONE 2", "2 done", bare "2") against a fresh menu.
  const menu = (conv.state_context?.menu ?? []) as Array<{ n: number; kind: "task" | "coordination"; id: string; project_id: string }>;
  const menuAge = conv.state_context?.menu_created_at
    ? now.getTime() - new Date(String(conv.state_context.menu_created_at)).getTime()
    : Infinity;
  const menuIdx = menuNumber(body);
  if (menu.length > 0 && menuAge <= MENU_TTL_MS && menuIdx != null) {
    const target = menu.find((m) => m.n === menuIdx);
    if (target) {
      const partyId = parties.find((p) => p.project_id === target.project_id)?.id;
      if (partyId) {
        const applied = await applyEffect(
          supabase, partyId,
          { type: "mark_done", target: { kind: target.kind, id: target.id } },
          messageId,
        );
        await captureServerEvent("sms-inbound", "sms_parse_outcome",
          { path: "menu", intent: "mark_done", confidence_bucket: "n/a", disposition: "applied" },
          { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
        return await reply(supabase, conv.id, confirmText(applied), partyId, target.project_id, "menu_applied");
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
  const recent = await loadRecentMessages(supabase, conv.id, replayExcludeFromHistory);
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
  if (!targetItem && !activePartyForConv && projectIds.length > 1 && parsed.intent !== "note" && parsed.intent !== "question") {
    const chooser = projectIds.map((pid, i) => ({
      n: i + 1,
      project_id: pid,
      party_id: parties.find((p) => p.project_id === pid)!.id,
    }));
    await supabase.from("sms_conversations")
      .update({
        state: "awaiting_project_choice",
        state_context: { ...conv.state_context, chooser, pending_body: body, pending_media: media, pending_message_id: messageId },
      })
      .eq("id", conv.id);
    const list = chooser.map((c) => `${c.n}) ${projectNames[c.project_id] ?? "Project"}`).join(" ");
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "llm", intent: parsed.intent, confidence_bucket: bucket, disposition: "project_chooser" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    return await reply(supabase, conv.id, `Which project? ${list} — reply a number.`, null, null, "project_chooser");
  }

  const effectParty = targetItem?.party_id ?? activePartyForConv?.id ?? parties[0].id;
  const effectProject = targetItem?.project_id ?? activePartyForConv?.project_id ?? parties[0].project_id;
  const effect = buildEffect(parsed, media);

  // (i) Confidence gate.
  if (parsed.confidence >= 0.8 && (targetItem || parsed.intent === "punch_report" || parsed.intent === "note")) {
    const applied = await applyEffect(supabase, effectParty, effect, effectiveMessageId);
    await stampMessage(supabase, effectiveMessageId, effectParty, effectProject, { path: "llm", ...parsed }, parsed.confidence);
    if (parsed.intent === "flag_blocker") {
      await notifyDesigner(supabase, effectProject, "field_blocker", { message_id: effectiveMessageId, note: parsed.note });
    }
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "llm", intent: parsed.intent, confidence_bucket: bucket, disposition: "applied" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    return await reply(supabase, conv.id, confirmText(applied), effectParty, effectProject, "applied");
  }

  if (parsed.confidence >= 0.5 && targetItem) {
    // Park the effect, ask a targeted yes/no.
    await supabase.from("sms_conversations")
      .update({
        state: "awaiting_confirmation",
        party_id: effectParty,
        active_project_id: effectProject,
        state_context: { ...conv.state_context, pending_effect: { ...effect, _project_id: effectProject }, pending_party_id: effectParty },
      })
      .eq("id", conv.id);
    await stampMessage(supabase, effectiveMessageId, effectParty, effectProject, { path: "llm", ...parsed }, parsed.confidence);
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "llm", intent: parsed.intent, confidence_bucket: bucket, disposition: "clarify" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    return await reply(supabase, conv.id, clarifyText(parsed, targetItem), effectParty, effectProject, "clarify");
  }

  // <0.5 or question/unclear → needs_review + designer notify.
  await supabase.from("sms_messages")
    .update({ needs_review: true, confidence: parsed.confidence, parsed_intent: { path: "llm", ...parsed }, party_id: effectParty, project_id: effectProject })
    .eq("id", effectiveMessageId);
  await notifyDesigner(supabase, effectProject, "field_needs_review", { message_id: effectiveMessageId, body });
  const firstName = await designerFirstName(supabase, effectProject);
  await captureServerEvent("sms-inbound", "sms_parse_outcome",
    { path: "llm", intent: parsed.intent, confidence_bucket: bucket, disposition: "needs_review" },
    { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
  return await reply(supabase, conv.id, `Passed to ${firstName} — they'll get back to you.`, effectParty, effectProject, "needs_review");
}

// ── small pure/util helpers ──────────────────────────────────────────────────
function firstInt(s: string): number | null {
  const m = s.match(/\d+/);
  return m ? parseInt(m[0], 10) : null;
}

/**
 * A fresh explicit project pin (within PROJECT_PIN_TTL_MS) from a
 * conversation's state_context, or null. Shared by the MMS storage-path
 * choice and the LLM item-scoping logic below — one TTL rule, two call sites.
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
  if (media.length > 0) base.media = media.map((m) => m.path);
  // Normalize LLM-only intents to apply_field_effect's vocabulary.
  if (parsed.intent === "question" || parsed.intent === "unclear") base.type = "note";
  return base;
}

async function applyEffect(
  supabase: SupabaseClient,
  partyId: string,
  effect: Record<string, unknown>,
  messageId: string,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.rpc("apply_field_effect", {
    p_party_id: partyId,
    p_effect: effect,
    p_source: "sms",
    p_sms_message_id: messageId,
  });
  if (error) {
    console.error("apply_field_effect failed:", error);
    return { summary_text: "Got it — logged.", remaining_count: 0 };
  }
  return (data as Record<string, unknown>) ?? {};
}

function confirmText(applied: Record<string, unknown>): string {
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
  await supabase.from("sms_messages")
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
): Promise<{ direction: string; body: string }[]> {
  const { data } = await supabase
    .from("sms_messages")
    .select("id, direction, body, created_at")
    .eq("conversation_id", conversationId)
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
  for (let i = 0; i < num; i++) {
    const url = params[`MediaUrl${i}`];
    if (!url) continue;
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
