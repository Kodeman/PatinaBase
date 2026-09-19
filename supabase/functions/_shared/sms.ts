// _shared/sms.ts — the single outbound SMS send path for Field Coordination.
//
// sendPartySms() is used by sms-dispatch (assignment/invite jobs), sms-inbound
// (out-of-band replies), and field-daily (digest + delivery confirms). It:
//   · resolves the recipient phone, project and display name from
//     project_parties — never a consent word (R-AY),
//   · asks the STUDIO'S consent record for the number, and nothing else
//     (studio_channel_consent, 00594): consent is per studio per channel value,
//     so one studio's STOP no longer silences another's job, and the frozen
//     project_parties.sms_consent_* columns are read by no gate on this path —
//     PR-x's fail-closed second check is retired (R-AY, final-run MAJOR-1/2),
//   · enforces that gate (the record must say granted — EXCEPT sms_optin_invite,
//     the double-opt-in invite, which is the sole send allowed while the record
//     reads 'pending', and which still proves its recorded evidence off the
//     seat; a recorded refusal is NEVER texted),
//   · renders a templateKey against email_templates ({{var}} via interpolate),
//     enriching studio_name / party_first_name / a fresh field link on demand,
//   · honors quiet hours (8am–8pm FIELD_TZ) — off-hours sends are stored as
//     'deferred' and flushed by the next field-daily run,
//
// THE GATES RUN IN ONE ORDER, HERE AND IN THE FLUSH (00640, contract S5):
//   1. suppression — the carrier's and the recipient's own STOP, as the
//      provider recorded it (public.sms_is_suppressed). It outranks every
//      ledger, so it is asked first and an unreadable answer refuses.
//   2. consent — the studio's own record, plus the studio's own contact rule.
//   3. FIELD_LINE_PHASE — the SERVER's phase gate, because a cron, a row
//      trigger and an edge function cannot read a browser flag (S7).
//   4. quiet hours — and a deferred row stores a RECIPE and a redacted
//      preview, never a token: the link is minted at actual dispatch, by the
//      flush, and nowhere else (S6).
//
// AND THE ROW IS THE CLAIM. The outbound row is written at 'claimed' BEFORE the
// provider is called, and 00640's partial unique index over (party, template,
// dedupe key) means two writers racing over one fact meet in the index and one
// of them sends. The provider's id is then written BEFORE the status flips, so
// a crash after the accept leaves a row that can be reconciled by sid. None of
// this is exactly-once carrier delivery — a provider gives at-least-once, and a
// claim released with no sid may be retried against a carrier that delivered.
//   · routes through SMS_DEV_MODE (dry_run: no Twilio, synthetic sid; redirect:
//     real send to SMS_DEV_REDIRECT_NUMBER with a [DEV→…] prefix; else real),
//   · logs every attempt: find-or-create the (twilio_number, phone) conversation,
//     insert an outbound sms_messages row, bump last_outbound_at,
//   · emits a best-effort PostHog sms_outbound_sent event.
//
// Twilio secrets and dev knobs come from env; the clock + fetch + env reader are
// injectable so the module unit-tests without a live stack or wall clock.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { interpolate } from "./render-template.ts";
import { captureServerEvent } from "./aesthete-events.ts";
import {
  isSelectionInput, recoverSmsSelection, SELECTION_TEMPLATE, selectionDedupeKey,
  validateSmsSelection,
} from "./sms-selection.ts";
import type {
  SelectionManifest, SelectionQuestion, SelectionSmsInput, ValidatedSelection,
} from "./sms-selection.ts";
export { recoverSmsSelection } from "./sms-selection.ts";

// ── Injectable seams ────────────────────────────────────────────────────────
export interface SmsDeps {
  /** Injectable env reader (defaults to Deno.env.get). */
  getEnv?: (key: string) => string | undefined;
  /** Injectable fetch (for Twilio; defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Injectable clock (defaults to new Date()). */
  now?: Date;
}

export type SendPartySmsInput = OrdinarySmsInput | SelectionSmsInput;

export interface OrdinarySmsInput {
  kind?: "party";
  selection?: never;
  /** Preferred: resolve phone + consent + project from the party row. */
  partyId?: string;
  /** Alt path: an explicit phone (consent still checked across party rows). */
  phone?: string;
  /** Project the message belongs to (for logging + link minting). */
  projectId?: string;
  /** A ready-to-send body (skips template rendering + enrichment). */
  body?: string;
  /** Privacy-safe body persisted to sms_messages instead of the provider body. */
  auditBody?: string;
  /** Let a caller-owned durable outbox handle quiet-hours retry. */
  deferToCaller?: boolean;
  /** Safe correlation id for provider-accepted retry reconciliation. */
  siteRequestDispatchOutboxId?: string;
  /** A template slug in email_templates (rendered with {{vars}}). */
  templateKey?: string;
  /** Template variables. */
  vars?: Record<string, unknown>;
  /**
   * The caller's name for the LOGICAL send this is (00640, contract S5). Two
   * writers racing over one fact — a 00284 row trigger and the field-daily
   * cron behind it — name the same key, and only one of them puts a text on
   * the wire: the row IS the claim, and the second insert loses it (23505).
   * Omitted, the send behaves exactly as it did before 00640.
   */
  dedupeKey?: string;
  /**
   * The Field Line phase this automation belongs to (contract S7). A new
   * outbound automation declares its phase and the server gate FIELD_LINE_PHASE
   * decides whether that phase is live — a browser flag cannot gate a cron, a
   * trigger or an edge function. Safety fixes, and everything that shipped
   * before The Field Line, leave it unset: phase 0 is always allowed.
   */
  automationPhase?: number;
  /**
   * Which half of the party's daily cadence this send spends (contract P5):
   * `recurring` is the one digest a day the opt-in promised, `event` is
   * something that actually happened and there are three of those. Left unset
   * the send spends nothing and is never folded — a REPLY TO A PERSON is not
   * automation, and putting a receipt in tomorrow's digest answers a question
   * nobody can still remember asking.
   */
  cadenceClass?: CadenceClass;
}

/** The two halves of a party's daily text cadence (contract P5). */
export type CadenceClass = "recurring" | "event";

/**
 * What happened to the send, as one word (00640, contract S5). ADDITIVE to the
 * `sent` / `deferred` booleans, which field-daily/core.ts:289 and the portal
 * still read: 'queued' is the honest word for what a provider ACCEPT means and
 * the booleans have no room for it.
 *   · 'sent'     — it is gone (a terminal provider status, or a dev dry run).
 *   · 'queued'   — the provider accepted it, or another writer already holds
 *                  this logical send. Not delivery. Never "read".
 *   · 'deferred' — quiet hours; it is stored and `dueAt` says when it is due.
 *   · 'failed'   — refused by a gate, or the provider said no.
 */
export type SendStatus = "sent" | "queued" | "deferred" | "failed";

export interface SendPartySmsResult {
  /** Present only for a re-read, authorized durable selection question. */
  selection?: SelectionQuestion;
  sent: boolean;
  deferred?: boolean;
  reason?: string;
  messageId?: string;
  conversationId?: string;
  twilioSid?: string;
  body?: string;
  /** ADDITIVE (00640, contract S5) — always set by sendPartySms. */
  status?: SendStatus;
  /** When a deferred message becomes due: the next moment inside the window. */
  dueAt?: string;
  /** Twilio's own error code (e.g. '21610'), or `http_<status>` when the
   *  provider answered with something that was not its JSON error shape. */
  provider_code?: string;
}

type DevMode = "dry_run" | "redirect" | "off";

function env(deps: SmsDeps, key: string): string | undefined {
  return (deps.getEnv ?? ((k: string) => Deno.env.get(k)))(key);
}

function devMode(deps: SmsDeps): DevMode {
  const m = env(deps, "SMS_DEV_MODE")?.toLowerCase();
  return m === "dry_run" || m === "redirect" ? m : "off";
}

/** Local hour (0–23) in a named timezone, for the quiet-hours gate. */
export function hourInTimezone(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  let hour = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  if (hour === 24) hour = 0; // some ICU builds render midnight as 24
  return hour;
}

/**
 * Minutes since local midnight in a named timezone. The trade rail's two cards
 * are scheduled to the half hour (17:00 the evening before, 07:30 the morning
 * of), which an hour alone cannot express.
 */
export function localMinutesInTimezone(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return (get("hour") % 24) * 60 + get("minute");
}

/** True when `now` is OUTSIDE the 8am–8pm send window in `tz` (defer). */
export function isQuietHours(now: Date, tz: string): boolean {
  const hour = hourInTimezone(now, tz);
  return hour < 8 || hour >= 20;
}

/**
 * The calendar day (YYYY-MM-DD) `now` falls on in a named timezone — the unit a
 * daily cadence is counted in (contract P5).
 *
 * Read out of the named zone rather than derived from a UTC offset, for the
 * same reason nextSendWindowStart walks the zone: the offset is the thing that
 * moves. On the night America/Chicago springs forward the local day is 23 hours
 * long and on the night it falls back it is 25, so "now minus six hours, in
 * UTC" names the wrong day twice a year — once in each direction — and a party
 * whose day was computed that way is either texted twice or not at all.
 */
export function localDayInTimezone(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/**
 * The next moment inside the 8am–8pm window in `tz`, for a deferred message's
 * `dueAt`. Walked in quarter-hours through the named zone rather than computed
 * from a UTC offset, because the offset is the thing that moves: a defer on the
 * night America/Chicago springs forward is due at 8am local, which is not
 * "now + N hours" for any fixed N.
 */
export function nextSendWindowStart(now: Date, tz: string): Date {
  const STEP_MS = 15 * 60 * 1000;
  let t = new Date(now.getTime());
  // Two days of quarter-hours is far more than the widest quiet window; the
  // bound exists so a bad tz can never spin here.
  for (let i = 0; i < 4 * 48; i++) {
    if (!isQuietHours(t, tz)) return t;
    t = new Date(t.getTime() + STEP_MS);
  }
  return t;
}

/**
 * The server-side phase gate (contract S7). FIELD_LINE_PHASE is an env/secret
 * because the things it has to gate — pg_cron, row triggers, edge functions —
 * cannot read a browser flag. Unset is 0: nothing new automated sends until
 * someone sets it. Safety fixes (authority, receipts, suppression, the
 * compliance line) are unconditional and never ask this.
 */
export function fieldLinePhase(deps: SmsDeps): number {
  const raw = env(deps, "FIELD_LINE_PHASE");
  const n = Number.parseInt(raw ?? "", 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

// A field link is `<portal>/field/<64 hex>`; a site-request guest link is the
// same shape with its own token. Either way the path segment IS the credential.
const FIELD_LINK_TOKEN_RE = /(\/field\/)[A-Za-z0-9._~-]{8,}/g;

// THE SAME CREDENTIAL WITH NO URL AROUND IT (SQ-43 R2). create_field_link hands
// back a bare 64-hex token, and a caller's own audit copy names it that way
// ("Token: <hex>"); the URL rule above cannot see it, so the bearer token went
// into sms_messages.body verbatim — the exact thing the redaction exists to
// stop, arriving by the one door it did not watch. Nothing a trade is told is
// 64 hex characters long: a run that shape is a credential, not copy.
const BARE_CREDENTIAL_RE = /(?<![0-9a-fA-F])[0-9a-fA-F]{64,}(?![0-9a-fA-F])/g;

/**
 * Strip the credential out of anything that is about to be STORED or LOGGED
 * (contract S6: no raw token in any durable log or view). Until this, a
 * {{link}} template's rendered body went into sms_messages.body verbatim — the
 * table 00283 exists to keep tokens out of — and a deferred row then re-sent
 * that hours-old URL. The link still goes out; it just stops being at rest.
 */
export function redactFieldLinkTokens(text: string): string {
  return text
    .replace(FIELD_LINK_TOKEN_RE, "$1[redacted]")
    .replace(BARE_CREDENTIAL_RE, "[redacted]");
}

/**
 * Resolve the outbound SMS "From": a Messaging Service SID (MG…) is sent as
 * MessagingServiceSid; a raw number as From.
 */
function twilioFromField(fromNumber: string): [string, string] {
  return fromNumber.startsWith("MG")
    ? ["MessagingServiceSid", fromNumber]
    : ["From", fromNumber];
}

/**
 * Resolve the phone number used to KEY sms_conversations — distinct from
 * TWILIO_FROM_NUMBER once that becomes a Messaging Service SID (MG…), since
 * sms-inbound always keys on the physical number Twilio delivers to
 * (params.To); keying outbound on an MG SID would split every thread. Prefers
 * an explicit override; falls back to TWILIO_FROM_NUMBER only when it's
 * already a physical number.
 */
export function smsConversationNumber(deps: SmsDeps): string | undefined {
  const explicit = env(deps, "SMS_CONVERSATION_NUMBER");
  // An MG… value here is a misconfiguration, not a valid override — treat it
  // as unset so it can never key a conversation (would split every thread).
  if (explicit && !explicit.startsWith("MG")) return explicit;
  const fromNumber = env(deps, "TWILIO_FROM_NUMBER");
  return fromNumber && !fromNumber.startsWith("MG") ? fromNumber : undefined;
}

interface TwilioCreds {
  accountSid: string;
  credentialSid: string;
  credentialSecret: string;
  fromNumber: string;
  statusCallbackUrl?: string;
}

/**
 * Twilio's OWN error code out of a refused create — 21610 (the recipient
 * unsubscribed at the carrier), 21614 (not a mobile number), 30034 (the number
 * is not registered for A2P), and so on. It is the difference between "the
 * carrier refused this recipient" and "our request was malformed", and until
 * this the rail kept only a concatenated message string. Falls back to
 * `http_<status>` when the body is not Twilio's JSON error shape (a proxy page,
 * an empty 502) so the caller still gets something it can switch on.
 */
function twilioErrorCode(body: string, httpStatus: number): string {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    const code = parsed?.code;
    if (typeof code === "number" || (typeof code === "string" && code)) {
      return String(code);
    }
  } catch {
    // Not JSON — the transport status is the only honest code we have.
  }
  return `http_${httpStatus}`;
}

async function sendViaTwilio(
  creds: TwilioCreds,
  params: { to: string; body: string },
  fetchImpl: typeof fetch,
): Promise<
  { ok: boolean; sid?: string; status?: string; error?: string; code?: string }
> {
  const url =
    `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set("To", params.to);
  const [fromKey, fromVal] = twilioFromField(creds.fromNumber);
  form.set(fromKey, fromVal);
  form.set("Body", params.body);
  if (creds.statusCallbackUrl) {
    form.set("StatusCallback", creds.statusCallbackUrl);
  }

  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${btoa(`${creds.credentialSid}:${creds.credentialSecret}`)}`,
    },
    body: form.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    return {
      ok: false,
      error: `Twilio ${res.status}: ${text}`,
      code: twilioErrorCode(text, res.status),
    };
  }
  const data = await res.json();
  return { ok: true, sid: data.sid, status: data.status ?? "queued" };
}

/**
 * GATE 1 — THE SUPPRESSION LAYER (contract S2), asked before the consent
 * record and answering for the (sender number, recipient) pair alone. A STOP
 * is a fact about a handset and a number, not about a studio: 00639's
 * sms_suppressions survives adding a new party on a new project, so a studio
 * that records a fresh invite after a STOP mints a record that cannot send.
 * That is what closes the `unknown` verdict gap the record alone left open.
 *
 * FAIL-CLOSED, and the three answers are three facts: true (suppressed),
 * false (not), null (the question could not be asked — treat as a refusal,
 * exactly as channelConsentVerdict treats an unreadable record).
 */
export async function smsIsSuppressed(
  supabase: SupabaseClient,
  senderNumber: string,
  recipientPhone: string,
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc("sms_is_suppressed", {
    p_sender: senderNumber,
    p_recipient: recipientPhone,
  });
  if (error) {
    console.error(
      "smsIsSuppressed: refusing, the suppression layer could not be read",
      error,
    );
    return null;
  }
  return data === true;
}

// ── Consent resolution ──────────────────────────────────────────────────────
/**
 * A recipient carries NO consent word (R-AY, final-run MAJOR-1). It used to
 * carry `consent`, reduced across the party rows on the number, and
 * reduceConsent() is gone with it: the verdict is asked of
 * studio_channel_consent through channelConsentVerdict() and of nothing else.
 * The seat's evidence columns are still read for the double-opt-in invite's
 * proof — evidence, not a verdict, and it can only refuse more.
 */
interface Recipient {
  phone: string | null;
  projectId: string | null;
  partyId: string | null;
  displayName: string | null;
}

/**
 * A resolution that can fail. `failed` is never folded into a null org: a
 * lookup that errored is NOT the same fact as "this project has no studio", and
 * every caller here treats the first as a logged refusal (R-AM).
 */
export interface OrgResolution {
  org: string | null;
  failed: boolean;
}

/**
 * The designer's primary design_studio, resolved the way
 * `_primary_studio_for()` (00315:64-79) resolves it — owner role first, then
 * earliest joined_at, then created_at — but over the TABLES, not the function.
 *
 * NEVER THE RPC. `_primary_studio_for` is revoked from every PostgREST role
 * (00483's allowlist: proacl `{postgres=X/postgres}`), so calling it from the
 * rail returns 42501 "permission denied for function" — and a caller that
 * destructures only `data` reads that as a NULL org, silently. It is an
 * internal helper for other SECURITY DEFINER bodies, and this is the same shape
 * resolveStudioName() already reads below.
 */
async function primaryStudioFor(
  supabase: SupabaseClient,
  designerId: string,
): Promise<OrgResolution> {
  const { data: memberships, error: mErr } = await supabase
    .from("organization_members")
    .select("organization_id, role, joined_at, created_at")
    .eq("user_id", designerId)
    .eq("status", "active");
  if (mErr) {
    console.error("primaryStudioFor: organization_members read failed", mErr);
    return { org: null, failed: true };
  }
  const rows = (memberships ?? []) as Array<{
    organization_id: string;
    role?: string | null;
    joined_at?: string | null;
    created_at?: string | null;
  }>;
  if (rows.length === 0) return { org: null, failed: false };

  const { data: orgs, error: oErr } = await supabase
    .from("organizations")
    .select("id")
    .in("id", rows.map((r) => r.organization_id))
    .eq("type", "design_studio");
  if (oErr) {
    console.error("primaryStudioFor: organizations read failed", oErr);
    return { org: null, failed: true };
  }
  const studios = new Set(
    ((orgs ?? []) as Array<{ id: string }>).map((o) => o.id),
  );

  // 00315's ORDER BY, in the same order: owner first, then joined_at with
  // NULLs last, then created_at.
  const ranked = rows
    .filter((r) => studios.has(r.organization_id))
    .sort((a, b) => {
      const owner = Number(b.role === "owner") - Number(a.role === "owner");
      if (owner !== 0) return owner;
      const aj = a.joined_at ?? "￿";
      const bj = b.joined_at ?? "￿";
      if (aj !== bj) return aj < bj ? -1 : 1;
      const ac = a.created_at ?? "";
      const bc = b.created_at ?? "";
      if (ac !== bc) return ac < bc ? -1 : 1;
      return 0;
    });
  return { org: ranked[0]?.organization_id ?? null, failed: false };
}

/**
 * The organization a project belongs to, resolved exactly the way the SQL side
 * resolves it (00594:141 and :221):
 * `COALESCE(projects.studio_id, _primary_studio_for(projects.designer_id))`.
 *
 * The fallback matters: a project with a NULL studio_id still gets a consent
 * record written under its designer's primary studio by the backfill and the
 * mirror, so any reader that keys on studio_id alone silently disagrees with
 * the table — the room would print "Texting" for a number that has STOPped.
 */
export async function resolveProjectOrg(
  supabase: SupabaseClient,
  projectId: string | null,
): Promise<OrgResolution> {
  if (!projectId) return { org: null, failed: false };
  const { data: proj, error } = await supabase
    .from("projects")
    .select("studio_id, designer_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    console.error("resolveProjectOrg: projects read failed", error);
    return { org: null, failed: true };
  }
  const row = proj as
    | { studio_id?: string | null; designer_id?: string | null }
    | null;
  if (!row) return { org: null, failed: false };
  if (row.studio_id) return { org: row.studio_id, failed: false };
  if (!row.designer_id) return { org: null, failed: false };
  return await primaryStudioFor(supabase, row.designer_id);
}

/**
 * The same resolution as resolveProjectOrg(), for many projects at once and
 * returning a project-id → org map. Exported because sms-inbound's pipeline
 * derives its STOP/START targets the same way: the two sides of the rail must
 * never disagree about which studio a project belongs to.
 *
 * `failed` says a lookup errored, so a caller can refuse rather than act on a
 * map that is short some entries (R-AM).
 */
export async function orgsOfProjects(
  supabase: SupabaseClient,
  projectIds: string[],
): Promise<{ orgs: Map<string, string>; failed: boolean }> {
  const out = new Map<string, string>();
  if (projectIds.length === 0) return { orgs: out, failed: false };
  const { data, error } = await supabase
    .from("projects")
    .select("id, studio_id, designer_id")
    .in("id", projectIds);
  if (error) {
    console.error("orgsOfProjects: projects read failed", error);
    return { orgs: out, failed: true };
  }
  const rows = (data ?? []) as Array<
    { id: string; studio_id?: string | null; designer_id?: string | null }
  >;
  const primary = new Map<string, string | null>();
  let failed = false;
  for (const row of rows) {
    if (row.studio_id) {
      out.set(row.id, row.studio_id);
      continue;
    }
    if (!row.designer_id) continue;
    if (!primary.has(row.designer_id)) {
      const resolved = await primaryStudioFor(supabase, row.designer_id);
      if (resolved.failed) failed = true;
      primary.set(row.designer_id, resolved.org);
    }
    const fallback = primary.get(row.designer_id) ?? null;
    if (fallback) out.set(row.id, fallback);
  }
  return { orgs: out, failed };
}

/** What the studio's own consent record says about this number. */
export type ChannelConsentVerdict = "refuse" | "allow" | "unknown";

export interface ChannelConsentDecision {
  /** Distinguish a known denial from an unreadable authority for selection. */
  unreadable?: boolean;
  organizationId?: string;
  verdict: ChannelConsentVerdict;
  /** Did a studio_channel_consent ROW answer, or is this the absence of one? */
  recordPresent: boolean;
  /** The answering record's evidence stamp, for the invite's send claim. */
  recordGeneration: string | null;
}

/**
 * THE ONLY consent gate (migration 00594, ruling R-AW). Consent is a fact about
 * a (studio, channel value) pair, held in studio_channel_consent — and that
 * record is the only ledger this function reads. project_parties.sms_consent_*
 * is frozen legacy: 00594's own backfill folded every seat into a record in the
 * same migration (opted_out winning per org), and the freeze trigger means no
 * seat has carried news since. A seat therefore holds no fact the record does
 * not already hold, and reading one could only ever contradict the record.
 *
 *   · "refuse" — the studio's record says opted_out, or carries an unanswered
 *     refusal, or THERE IS NO RECORD AT ALL. A missing record is `not_asked`,
 *     and `not_asked` is a refusal: nobody asked this person, so nobody may
 *     text them. Before R-AW a missing record fell through to the party row,
 *     and a pre-fold seat reading `granted` then carried the send — the one leg
 *     by which a frozen column could still authorise a text.
 *   · "allow" — the studio's record says granted with no refusal standing
 *     behind it. This is the half of G-3 a per-party ledger cannot do: a seat
 *     created today for a number the studio recorded a grant for in 2025 is
 *     sendable because the STUDIO holds the grant (fixture F-11).
 *   · "unknown" — the record says `pending`: the invite has gone out and the
 *     recipient has not answered. The double opt-in's first half lives there,
 *     so sendPartySms's own invite gate decides that one.
 *   · "refuse", logged — the owning studio could not be RESOLVED at all (a
 *     failed read, not an absent studio). A failure is not a fact about the
 *     number, and the no-studio branch below would answer this send out of
 *     every tenant's rows, so it refuses instead (R-AM).
 *
 * AND `status` IS NOT THE WHOLE VERDICT (r6 M6-3). refusal_unanswered is the
 * stored fact the WRITE door treats as load-bearing — a refusal the person who
 * made it has not answered — and it was invisible to the rail that actually
 * sends. An unanswered refusal can stand at ANY status: the first prod fold
 * mints `granted` records for legacy seats whose stale opt-out no later consent
 * answered (r7 M7-1), and the inbound rail writes this table directly. What
 * answers a refusal is the recipient's own YES or START, which that rail
 * writes — lowering the flag and stamping a fresh consented_at; nothing the
 * studio can type reopens this door (00594's RPCs never lower the flag).
 * public.channel_consent_status() folds status and the flag exactly this way,
 * so the room and the rail agree by construction.
 *
 * EXPORTED so a caller that PRE-FILTERS recipients asks this question rather
 * than inventing its own (close-out r3 MAJOR-2). field-daily used to select its
 * digest recipients with `.eq("sms_consent_status", "granted")` on
 * project_parties — the column 00594 froze — so the cron's recipient set could
 * only ever contain pre-fold rows and the whole daily digest went dead for
 * every consent recorded after the freeze. A pre-filter that asks the same
 * function the send gate asks cannot drift from it.
 */
export async function channelConsentVerdict(
  supabase: SupabaseClient,
  phone: string,
  projectId: string | null,
): Promise<ChannelConsentVerdict> {
  return (await channelConsentDecision(supabase, phone, projectId)).verdict;
}

/**
 * The same question, with the one extra fact the INVITE carve-out needs:
 * did a studio_channel_consent ROW answer it?
 *
 * `unknown` has two sources and they are not the same permission (contract S2,
 * closing the gap at the phone-global branch below). A studio's own record
 * reading `pending` IS the double opt-in's first half — the invite went out,
 * the recipient has not answered — and the invite may go. A project with no
 * resolvable studio also answers `unknown` whenever nothing on the number has
 * refused, and that is not a pending invite: it is NO RECORD AT ALL, the
 * `not_asked` R-AW makes a refusal. Before this, the invite gate could not tell
 * them apart, so the one send allowed past a non-granted record could reach a
 * number no studio had ever asked. `recordPresent` is how it tells.
 *
 * `recordGeneration` is the record's own evidence stamp (`recorded_at`, else
 * `updated_at`). The invite's send claim is keyed on it, so one invite goes out
 * per generation of consent: the fold -> reconsent -> START recovery path
 * writes a fresh stamp and earns a fresh invite, while a retry of the same
 * dispatch collides with the claim already held (contract S5).
 */
export async function channelConsentDecision(
  supabase: SupabaseClient,
  phone: string,
  projectId: string | null,
): Promise<ChannelConsentDecision> {
  const { org, failed } = await resolveProjectOrg(supabase, projectId);

  // A studio that could not be resolved is not a studio that does not exist
  // (R-AM). Taking the no-studio branch here would read another tenant's
  // ledger for this send, so the failure refuses instead — logged, never
  // silent.
  if (failed) {
    console.error(
      "channelConsentVerdict: refusing, the owning studio could not be resolved",
      { projectId },
    );
    return { verdict: "refuse", recordPresent: false, recordGeneration: null, unreadable: true };
  }

  if (org) {
    const { data: record, error: recordError } = await supabase
      .from("studio_channel_consent")
      .select("status, refusal_unanswered, recorded_at, updated_at")
      .eq("organization_id", org)
      .eq("channel_kind", "sms")
      .eq("channel_value", phone)
      .maybeSingle();
    if (recordError) {
      console.error(
        "channelConsentVerdict: refusing, the consent record could not be read",
        recordError,
      );
      return { verdict: "refuse", recordPresent: false, recordGeneration: null, unreadable: true };
    }
    if (!record) {
      // No record is `not_asked`, and `not_asked` refuses (R-AW). The fold ran
      // inside 00594, so every seat that ever carried a verdict has a record
      // behind it; a pair with none was never asked by this studio.
      return { verdict: "refuse", recordPresent: false, recordGeneration: null, organizationId: org };
    }
    const row = record as {
      status: string;
      refusal_unanswered?: boolean | null;
      recorded_at?: string | null;
      updated_at?: string | null;
    };
    const generation = row.recorded_at ?? row.updated_at ?? null;
    // A refusal the recipient has not answered still stands, whatever the
    // status now says (r6 M6-3), so it is read before the status is.
    if (row.refusal_unanswered === true) {
      return { verdict: "refuse", recordPresent: true, organizationId: org, recordGeneration: generation };
    }
    if (row.status === "granted") {
      return { verdict: "allow", recordPresent: true, organizationId: org, recordGeneration: generation };
    }
    // `pending` is the invite in flight — sendPartySms's invite gate owns it.
    if (row.status === "pending") {
      return {
        verdict: "unknown",
        recordPresent: true,
        organizationId: org, recordGeneration: generation,
      };
    }
    // `opted_out`, and `not_asked` recorded by the fold: both refuse.
    return { verdict: "refuse", recordPresent: true, organizationId: org, recordGeneration: generation };
  }

  // No studio resolves at all — nothing to scope to, so the reduction stays
  // phone-global here and only here. This is the last line between an
  // unattributable send and a STOP, so it obeys R-AM: a read that ERRORED comes
  // back as an empty row set, and an empty row set read as "nobody has refused"
  // would lift the primary gate on exactly the send that has no other check
  // (r7 R7-M2).
  //
  // IT IS THE RECORDS THAT ARE ASKED, HERE TOO (R-AW). The inbound STOP used to
  // write project_parties phone-globally, and that write was this branch's
  // backstop for a seat whose studio cannot be resolved. The seats are frozen
  // and the rail writes the record only, so the phone-global question is asked
  // of the records: any studio's recorded refusal on this number refuses a send
  // that belongs to no studio at all. Scoped sends never reach here — the
  // branch above answered them off the owning studio's own record (R-AK).
  //
  // The send itself is NOT refused when nothing on the number has refused: a
  // studio-less project has no ledger to hold a verdict, so there is no record
  // to require. That fail-open is named in the W1a report §5.2 and §8 and is a
  // policy ruling owed, not a defect this function can close.
  const { data: recordRows, error: recordScanError } = await supabase
    .from("studio_channel_consent")
    .select("status, refusal_unanswered")
    .eq("channel_kind", "sms")
    .eq("channel_value", phone);
  if (recordScanError) {
    console.error(
      "channelConsentVerdict: refusing, the phone-global record scan failed",
      recordScanError,
    );
    return { verdict: "refuse", recordPresent: false, recordGeneration: null };
  }
  const anyRecordRefuses = (recordRows ?? []).some((r) => {
    const row = r as { status: string; refusal_unanswered?: boolean | null };
    return row.status === "opted_out" || row.refusal_unanswered === true;
  });
  // recordPresent stays FALSE on this branch however many rows the scan saw:
  // no studio owns this send, so no record has GRANTED or asked anything for
  // it. The scan can only ever refuse here, never permit (contract S2).
  return {
    verdict: anyRecordRefuses ? "refuse" : "unknown",
    recordPresent: false,
    recordGeneration: null,
  };
}

/**
 * CR3-9 — THE RULE IS A SEND GATE, NOT DECORATION.
 *
 * `studio_contact_rules.channels_forbidden` containing `sms` is the studio's
 * own written instruction that this person is never texted, and C7 rules that
 * the rule OUTRANKS the designation. Until this, `grep -rl channels_forbidden
 * supabase/functions/` returned nothing: the whole rail gated on the consent
 * record alone, so a person carrying BOTH a recorded grant and a "Never text"
 * rule — exactly what PR-m's manual path and the Add sheet's free-text rule can
 * produce together — was sendable from every surface and from the crons.
 *
 * Asked of the ENGAGEMENT first (a per-job override is the same table with
 * `subject_type = 'engagement'`), then of the person's CARD, then — for a
 * phone-only send with no seat — of every card holding that number.
 *
 * Fail-closed, like `channelConsentVerdict`: a rule that cannot be READ is not
 * a rule that does not exist, and this is a recipient-protection fact.
 */
export async function contactRuleForbidsSms(
  supabase: SupabaseClient,
  partyId: string | null,
  phone: string,
  diagnostics?: { unreadable: boolean },
): Promise<boolean> {
  const subjects: Array<{ type: string; id: string }> = [];

  if (partyId) {
    subjects.push({ type: "engagement", id: partyId });
    const { data: party, error: partyError } = await supabase
      .from("project_parties")
      .select("studio_contact_id")
      .eq("id", partyId)
      .maybeSingle();
    if (partyError) {
      console.error(
        "contactRuleForbidsSms: refusing, the seat's card could not be read",
        partyError,
      );
      if (diagnostics) diagnostics.unreadable = true;
      return true;
    }
    const cardId = (party as { studio_contact_id?: string | null } | null)
      ?.studio_contact_id;
    if (cardId) subjects.push({ type: "person", id: cardId });
  }

  if (subjects.length === 0 || !partyId) {
    // No seat: the number is the only handle there is. Any card in any studio
    // holding it answers, exactly as the phone-global consent scan does.
    const { data: channels, error: channelError } = await supabase
      .from("studio_contact_channels")
      .select("owner_id")
      .eq("value", phone);
    if (channelError) {
      console.error(
        "contactRuleForbidsSms: refusing, the channel scan failed",
        channelError,
      );
      if (diagnostics) diagnostics.unreadable = true;
      return true;
    }
    for (const row of (channels ?? []) as Array<{ owner_id: string }>) {
      subjects.push({ type: "person", id: row.owner_id });
    }
  }

  if (subjects.length === 0) return false;

  const { data: rules, error: ruleError } = await supabase
    .from("studio_contact_rules")
    .select("subject_type, subject_id, channels_forbidden")
    .in("subject_id", subjects.map((s) => s.id));
  if (ruleError) {
    console.error(
      "contactRuleForbidsSms: refusing, the rule could not be read",
      ruleError,
    );
    if (diagnostics) diagnostics.unreadable = true;
    return true;
  }

  const rows = (rules ?? []) as Array<{
    subject_type: string;
    subject_id: string;
    channels_forbidden: string[] | null;
  }>;
  return subjects.some((subject) =>
    rows.some((row) =>
      row.subject_type === subject.type &&
      row.subject_id === subject.id &&
      (row.channels_forbidden ?? []).includes("sms")
    )
  );
}

async function resolveRecipient(
  supabase: SupabaseClient,
  input: OrdinarySmsInput,
): Promise<Recipient> {
  if (input.partyId) {
    const { data: party } = await supabase
      .from("project_parties")
      .select("id, phone_e164, project_id, display_name")
      .eq("id", input.partyId)
      .maybeSingle();
    return {
      phone: party?.phone_e164 ?? input.phone ?? null,
      projectId: party?.project_id ?? input.projectId ?? null,
      partyId: input.partyId,
      displayName: party?.display_name ?? null,
    };
  }
  // Phone-only path: the seat supplies a name for the body and nothing else.
  const phone = input.phone ?? null;
  let displayName: string | null = null;
  if (phone) {
    const { data: rows } = await supabase
      .from("project_parties")
      .select("display_name")
      .eq("phone_e164", phone);
    if (rows && rows.length > 0) {
      displayName = (rows[0] as { display_name: string | null }).display_name ??
        null;
    }
  }
  return {
    phone,
    projectId: input.projectId ?? null,
    partyId: null,
    displayName,
  };
}

export async function resolveStudioName(
  supabase: SupabaseClient,
  projectId: string,
): Promise<string | null> {
  const { data: proj } = await supabase
    .from("projects")
    .select("designer_id")
    .eq("id", projectId)
    .maybeSingle();
  const designerId = (proj as { designer_id?: string } | null)?.designer_id;
  if (!designerId) return null;

  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id")
    .eq("user_id", designerId)
    .eq("status", "active");
  const orgIds = (memberships ?? []).map((m: { organization_id: string }) =>
    m.organization_id
  );
  if (orgIds.length > 0) {
    const { data: org } = await supabase
      .from("organizations")
      .select("name")
      .in("id", orgIds)
      .eq("type", "design_studio")
      .limit(1)
      .maybeSingle();
    if ((org as { name?: string } | null)?.name) {
      return (org as { name: string }).name;
    }
  }
  const { data: pr } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", designerId)
    .maybeSingle();
  return (pr as { full_name?: string } | null)?.full_name ?? null;
}

/** Mint a fresh field link (raw token) and return the /field/<token> URL. */
async function mintFieldLink(
  supabase: SupabaseClient,
  partyId: string,
  clientPortalUrl: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc("create_field_link", {
    p_party_id: partyId,
  });
  if (error) return null;
  // RETURNS TABLE → an array of { id, token }.
  const token = Array.isArray(data)
    ? data[0]?.token
    : (data as { token?: string })?.token;
  return token ? `${clientPortalUrl.replace(/\/$/, "")}/field/${token}` : null;
}

/** What a deferred row's `body` shows where the link will be. */
const LINK_PLACEHOLDER = "[link at send]";

// A stored recipe says WHAT TO SAY; it must never be able to say it on its own.
// These two shapes are the credentials the rail hands out: a `/field/<token>`
// URL (party field link, site-request guest link) and the bare token inside it.
const FIELD_LINK_URL_RE = /\/field\//;
const RAW_TOKEN_RE = /[0-9a-fA-F]{32,}/;

function carriesCredential(value: unknown): boolean {
  const text = typeof value === "string"
    ? value
    : JSON.stringify(value ?? null) ?? "";
  return FIELD_LINK_URL_RE.test(text) || RAW_TOKEN_RE.test(text);
}

/**
 * The params a recipe may KEEP (contract S6). A deferred row sits in
 * sms_messages for hours and the recipe is read back by a cron, so a caller's
 * `link` var — or any param that happens to carry a token — would be a bearer
 * credential at rest, which is the whole thing the redacted preview body was
 * introduced to stop. It is dropped here and the link is minted again at actual
 * dispatch; `link_kind` is what the row carries in its place.
 */
function safeRecipeParams(
  vars: Record<string, unknown> | undefined,
): { params: Record<string, unknown>; droppedLink: boolean } {
  const params: Record<string, unknown> = {};
  let droppedLink = false;
  for (const [key, value] of Object.entries(vars ?? {})) {
    if (key === "link" || carriesCredential(value)) {
      droppedLink = true;
      continue;
    }
    params[key] = value;
  }
  return { params, droppedLink };
}

interface RenderedBody {
  body: string | null;
  /** 'field' when the template asks for a field link, else null. Recorded on
   *  the recipe so the flush knows what to mint, without carrying a token. */
  linkKind: string | null;
}

/**
 * Render the body. `mintLink` is the whole of contract S6's ordering fix: the
 * link is minted at ACTUAL dispatch and nowhere else. This used to be called
 * before the quiet-hours gate, so an 8pm digest minted a token, deferred, and
 * the trade woke to a URL that had been alive since the night before — while
 * the mint itself revoked the link they were already using. Rendering with
 * `mintLink: false` produces the same copy with a placeholder where the URL
 * goes: readable in the thread, credential-free at rest, and re-rendered from
 * the recipe when the message actually goes out.
 */
async function resolveBody(
  supabase: SupabaseClient,
  input: OrdinarySmsInput,
  recipient: Recipient,
  clientPortalUrl: string,
  opts: { mintLink: boolean },
): Promise<RenderedBody> {
  if (input.body) return { body: input.body, linkKind: null };
  if (!input.templateKey) return { body: null, linkKind: null };

  const { data: tmpl } = await supabase
    .from("email_templates")
    .select("html_content, subject_default, is_active")
    .eq("slug", input.templateKey)
    .maybeSingle();
  if (!tmpl || (tmpl as { is_active?: boolean }).is_active === false) {
    return { body: null, linkKind: null };
  }
  const raw = (tmpl as { html_content?: string }).html_content?.trim()
    ? String((tmpl as { html_content: string }).html_content)
    : String((tmpl as { subject_default?: string }).subject_default ?? "");
  if (!raw) return { body: null, linkKind: null };

  const vars: Record<string, unknown> = { ...(input.vars ?? {}) };

  // Enrich only what the template references and the caller didn't supply.
  if (
    raw.includes("party_first_name") && vars.party_first_name == null &&
    recipient.displayName
  ) {
    vars.party_first_name = recipient.displayName.trim().split(/\s+/)[0];
  }
  if (
    raw.includes("studio_name") && vars.studio_name == null &&
    recipient.projectId
  ) {
    vars.studio_name =
      (await resolveStudioName(supabase, recipient.projectId)) ?? "your studio";
  }
  if (
    raw.includes("project_name") && vars.project_name == null &&
    recipient.projectId
  ) {
    const { data: proj } = await supabase
      .from("projects").select("name").eq("id", recipient.projectId)
      .maybeSingle();
    vars.project_name = (proj as { name?: string } | null)?.name ??
      "your project";
  }
  let linkKind: string | null = null;
  if (
    /\{\{\s*link\s*\}\}/.test(raw) && vars.link == null && recipient.partyId
  ) {
    linkKind = "field";
    vars.link = opts.mintLink
      ? (await mintFieldLink(supabase, recipient.partyId, clientPortalUrl)) ?? ""
      : LINK_PLACEHOLDER;
  }

  return { body: interpolate(raw, vars), linkKind };
}

// ── Conversation + message logging ──────────────────────────────────────────
async function findOrCreateConversation(
  supabase: SupabaseClient,
  twilioNumber: string,
  phone: string,
  partyId: string | null,
  projectId: string | null,
): Promise<string | null> {
  const { data: existing } = await supabase
    .from("sms_conversations")
    .select("id")
    .eq("twilio_number", twilioNumber)
    .eq("phone_e164", phone)
    .maybeSingle();
  if ((existing as { id?: string } | null)?.id) {
    return (existing as { id: string }).id;
  }

  const { data: created, error } = await supabase
    .from("sms_conversations")
    .insert({
      twilio_number: twilioNumber,
      phone_e164: phone,
      party_id: partyId,
      active_project_id: projectId,
    })
    .select("id")
    .single();
  if (error) {
    // Lost a create race — re-read.
    const { data: retry } = await supabase
      .from("sms_conversations")
      .select("id")
      .eq("twilio_number", twilioNumber)
      .eq("phone_e164", phone)
      .maybeSingle();
    return (retry as { id?: string } | null)?.id ?? null;
  }
  return (created as { id?: string } | null)?.id ?? null;
}

/**
 * The recipe a deferred row is re-rendered from (00640, contract S5/S6).
 *
 * It holds WHAT TO SAY, never the credential that says it: a template key, the
 * params it interpolates, the party and project it belongs to, and — when the
 * copy carries a link — the KIND of link to mint at send. A token never enters
 * this object, so a deferred row at rest cannot leak one, and the flush mints
 * fresh at the moment the text actually goes out.
 */
export interface SendRecipe {
  /** Internal, source-bound selection; params stays empty and attribution null. */
  selection?: SelectionManifest;
  /** NULL when the caller supplied a literal body: the stored body IS the body. */
  template_key: string | null;
  params: Record<string, unknown>;
  party_id: string | null;
  project_id: string | null;
  link_kind: string | null;
  /**
   * The phase this automation declared when it was deferred (contract S7). A
   * deferred row is sent by a LATER process, so the gate has to travel with it:
   * without this, a phase-1 digest deferred while the phase was live went out
   * the next morning from a server that had since been turned back to phase 0.
   */
  automation_phase: number | null;
  /**
   * The cadence half this send spends (contract P5), travelling with the row for
   * the same reason the phase does: the budget is spent at DISPATCH, and the
   * process that dispatches a deferred row is not the one that deferred it.
   * Absent on every row written before this file, which is exactly right —
   * nothing spends a budget it never declared.
   */
  cadence_class?: CadenceClass | null;
}

interface OutboundRow {
  conversation_id: string | null;
  body: string;
  twilio_sid: string | null;
  twilio_status: string;
  party_id: string | null;
  project_id: string | null;
  template_key: string | null;
  site_request_dispatch_outbox_id: string | null;
  recipe: SendRecipe | null;
  dedupe_key: string | null;
  claimed_at: string | null;
  error_message?: string | null;
}

/** Postgres unique_violation — the other writer already holds this send. */
export function isUniqueViolation(error: unknown): boolean {
  const e = error as { code?: unknown; message?: unknown } | null;
  return String(e?.code ?? "") === "23505" ||
    /duplicate key value/i.test(String(e?.message ?? ""));
}

/**
 * Write the outbound row — which IS the claim on the logical send (contract
 * S5). `sms_messages_send_claim_uniq` (00640) makes (party, template, dedupe
 * key) unique while the row is still live, so two writers racing over one fact
 * — a 00284 row trigger and the field-daily cron behind it — meet in the index
 * and exactly one of them goes on to call the provider. The loser is told so
 * (`duplicate: true`); it is not an error and it is not a send.
 */
async function insertOutbound(
  supabase: SupabaseClient,
  row: OutboundRow,
): Promise<{ id?: string; duplicate: boolean }> {
  const { data, error } = await supabase
    .from("sms_messages")
    .insert({ direction: "outbound", ...row })
    .select("id")
    .single();
  if (error) {
    if (isUniqueViolation(error)) return { duplicate: true };
    console.error(
      "insertOutbound: the outbound row could not be written",
      (error as { message?: string }).message ?? error,
    );
    return { duplicate: false };
  }
  return { id: (data as { id?: string } | null)?.id, duplicate: false };
}

/**
 * The statuses a settle may advance FROM (contract S5). Settlement is
 * monotonic: only a row this process still holds — 'claimed' when it took the
 * claim, 'sending' once a provider has it — may be moved to queued/sent/failed.
 * A delivery callback that landed in the window between the provider accepting
 * and this write is NEWER than anything we are about to say, and walking it
 * back turned a delivered text into a queued one.
 */
const SETTLEABLE_FROM = ["claimed", "sending"];

/**
 * Write the provider's id onto the claim row BEFORE any success is reported
 * (contract S5). Retried once, because the alternative to a second attempt is a
 * row that names a message already on the wire by nothing at all: the status
 * callback matches on twilio_sid and sms_reconcile_accepted_send() finds it by
 * twilio_sid, so a row with a NULL sid is a send nobody can reconcile and
 * sms_release_stale_send_claims() will hand back for a second carrier attempt.
 * Answers false when the id could not be recorded at all.
 */
async function persistProviderSid(
  supabase: SupabaseClient,
  messageId: string,
  twilioSid: string,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { error } = await supabase
        .from("sms_messages")
        .update({ twilio_sid: twilioSid })
        .eq("id", messageId);
      if (!error) return true;
      console.error(
        `persistProviderSid: attempt ${attempt + 1} could not record the ` +
          `provider id ${twilioSid} on ${messageId}`,
        (error as { message?: string }).message ?? error,
      );
    } catch (err) {
      console.error(
        `persistProviderSid: attempt ${attempt + 1} threw recording the ` +
          `provider id ${twilioSid} on ${messageId}`,
        err,
      );
    }
  }
  // THE AUDIT LOG IS THE ONLY PLACE THIS SID NOW LIVES. Say it once, plainly,
  // with the row it belongs to, and flag the row for a human: the message is on
  // the wire and the room cannot see which one it is.
  console.error(
    "persistProviderSid: UNRECORDED PROVIDER SEND — the provider accepted " +
      `${twilioSid} for sms_messages ${messageId} and the id could not be ` +
      "written. This send needs review; do not retry it blind.",
  );
  try {
    await supabase
      .from("sms_messages")
      .update({
        needs_review: true,
        error_code: "sid_unrecorded",
        error_message:
          `The provider accepted this send as ${twilioSid}; the id could not ` +
          "be recorded, so nothing can settle it automatically.",
      })
      .eq("id", messageId)
      .in("twilio_status", SETTLEABLE_FROM);
  } catch (err) {
    console.error("persistProviderSid: the review flag failed too", err);
  }
  return false;
}

/**
 * Hand a send claim BACK (contract S5; SQ-43 R1).
 *
 * Taking the claim is the moment a row stops being anybody else's: it reads
 * 'claimed', and no later flush selects it. That is exactly right while this
 * process is still working on it, and exactly wrong the moment this process
 * stops — a mint RPC that dies mid-flight, a template read that throws — because
 * the row then names a text that will never be sent and nothing in the rail
 * says so. The release is conditional on the row still being ours and still
 * carrying no provider id, so it can never step on a send that got further than
 * the throw did. The reason is recorded on the row and in the log, redacted:
 * whatever threw may have been holding a credential.
 */
async function releaseSendClaim(
  supabase: SupabaseClient,
  messageId: string,
  err: unknown,
): Promise<void> {
  const reason = redactFieldLinkTokens(
    err instanceof Error ? err.message : String(err),
  ).slice(0, 300);
  console.error(
    `flushDeferredMessages: sms_messages ${messageId} threw before the ` +
      `provider was called; releasing the claim — ${reason}`,
  );
  try {
    const { error } = await supabase
      .from("sms_messages")
      .update({
        twilio_status: "deferred",
        claimed_at: null,
        error_message: `claim_released: ${reason}`,
      })
      .eq("id", messageId)
      .eq("twilio_status", "claimed")
      .is("twilio_sid", null);
    if (error) {
      console.error(
        `releaseSendClaim: sms_messages ${messageId} still holds an abandoned ` +
          "claim; sms_release_stale_send_claims() is the backstop",
        (error as { message?: string }).message ?? error,
      );
    }
  } catch (releaseErr) {
    console.error(
      `releaseSendClaim: the release write for sms_messages ${messageId} threw`,
      releaseErr,
    );
  }
}

/**
 * Spend one slot of this party's daily cadence (contract P5). The claim is
 * 00645's single conditional upsert, so this is one round trip and the decision
 * it returns has already been serialized against every other sender.
 *
 * FAILS OPEN, deliberately and unlike every gate above it. Suppression, consent
 * and the phase gate answer "is this text ALLOWED" and an unreadable answer
 * there is not permission. A cadence budget answers "is this text the fourth
 * one today" — it is politeness, not consent — and a rail that goes silent
 * because one RPC is unreachable has failed the crew standing at a locked gate
 * worse than a fourth text ever could. An absent function (a server one
 * migration behind) reads as `null` from the client and is the same case.
 */
async function claimCadenceSlot(
  supabase: SupabaseClient,
  conversationId: string,
  projectId: string,
  partyId: string,
  localDay: string,
  cadenceClass: CadenceClass,
): Promise<{ claimed: boolean; asked: boolean }> {
  try {
    const { data, error } = await supabase.rpc("sms_claim_party_budget", {
      p_conversation_id: conversationId,
      p_project_id: projectId,
      p_party_id: partyId,
      p_local_day: localDay,
      p_class: cadenceClass,
    });
    const row = (Array.isArray(data) ? data[0] : data) as
      | { claimed?: unknown }
      | null;
    if (error || !row || typeof row.claimed !== "boolean") {
      if (error) {
        console.error(
          "claimCadenceSlot: the cadence budget could not be spent; sending",
          (error as { message?: string }).message ?? error,
        );
      }
      return { claimed: true, asked: false };
    }
    return { claimed: row.claimed, asked: true };
  } catch (err) {
    console.error("claimCadenceSlot threw; sending", err);
    return { claimed: true, asked: false };
  }
}

/** What 00645's dead-end gate said about a party. */
interface PromptGateVerdict {
  allowed: boolean;
  reason?: string;
  handoff?: boolean;
  pausedUntil?: string;
  ownerUserId?: string;
}

/**
 * Ask 00645 whether this party may be asked another question (contract P4).
 * Two prompts nobody answered is a person, not a delivery problem: the rail
 * stops and the project lead gets the thread, once.
 *
 * Fails OPEN for the same reason the cadence claim does — this is a courtesy
 * gate, not a consent gate, and suppression and consent have already answered
 * above. A false "dead end" would silence a party who is answering fine.
 */
async function partyPromptGate(
  supabase: SupabaseClient,
  conversationId: string,
  projectId: string,
  partyId: string,
): Promise<PromptGateVerdict> {
  try {
    const { data, error } = await supabase.rpc("sms_party_prompt_gate", {
      p_conversation_id: conversationId,
      p_project_id: projectId,
      p_party_id: partyId,
    });
    const row = (Array.isArray(data) ? data[0] : data) as
      | {
        allowed?: unknown;
        reason?: unknown;
        handoff?: unknown;
        paused_until?: unknown;
        owner_user_id?: unknown;
      }
      | null;
    if (error || !row || typeof row.allowed !== "boolean") {
      if (error) {
        console.error(
          "partyPromptGate: the dead-end gate could not be read; sending",
          (error as { message?: string }).message ?? error,
        );
      }
      return { allowed: true };
    }
    return {
      allowed: row.allowed,
      reason: typeof row.reason === "string" ? row.reason : undefined,
      handoff: row.handoff === true,
      pausedUntil: typeof row.paused_until === "string"
        ? row.paused_until
        : undefined,
      ownerUserId: typeof row.owner_user_id === "string"
        ? row.owner_user_id
        : undefined,
    };
  } catch (err) {
    console.error("partyPromptGate threw; sending", err);
    return { allowed: true };
  }
}

// ── The send path ───────────────────────────────────────────────────────────
export async function sendPartySms(
  supabase: SupabaseClient,
  input: SendPartySmsInput,
  deps: SmsDeps = {},
): Promise<SendPartySmsResult> {
  if (input.kind !== "selection") return await sendPartySmsCore(supabase, input, deps);
  if (!isSelectionInput(input)) return { sent: false, status: "failed", reason: "selection_invalid" };
  const recoveryInput = { inboundMessageId: input.selection.inboundMessageId, kind: input.selection.kind, phone: input.phone };
  const existing = await recoverSmsSelection(supabase, recoveryInput, deps);
  if (existing.found) return existing;
  const sender = smsConversationNumber(deps);
  if (!sender) return { sent: false, status: "failed", reason: "conversation_number_not_configured" };
  const checked = await validateSmsSelection(supabase, input.selection, input.phone, sender, deps.now ?? new Date());
  if (!checked.ok) return { sent: false, status: "failed", reason: checked.reason };
  const result = await sendPartySmsCore(supabase, {
    phone: input.phone, templateKey: SELECTION_TEMPLATE,
    dedupeKey: selectionDedupeKey(input.selection.inboundMessageId, input.selection.kind),
    automationPhase: input.automationPhase,
  }, deps, checked.value);
  // A provider response or a duplicate INSERT is not durable question state.
  // Always re-read the actual row, including settlement races and failures.
  if (!result.messageId && result.reason !== "duplicate_send_claim") return result;
  const recovered = await recoverSmsSelection(supabase, recoveryInput, deps);
  return { ...recovered, dueAt: recovered.status === "deferred" ? result.dueAt : undefined,
    reason: recovered.reason ?? result.reason,
    provider_code: recovered.provider_code ?? result.provider_code };
}

async function sendPartySmsCore(
  supabase: SupabaseClient,
  input: OrdinarySmsInput,
  deps: SmsDeps,
  selection?: ValidatedSelection,
): Promise<SendPartySmsResult> {
  const now = deps.now ?? new Date();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const mode = devMode(deps);
  const fieldTz = env(deps, "FIELD_TZ") ?? "America/Chicago";
  const clientPortalUrl = env(deps, "CLIENT_PORTAL_URL") ??
    "https://client.patina.cloud";
  const fromNumber = env(deps, "TWILIO_FROM_NUMBER") ?? "";
  const accountSid = env(deps, "TWILIO_ACCOUNT_SID") ?? "";
  const authToken = env(deps, "TWILIO_AUTH_TOKEN") ?? "";
  const apiKeySid = env(deps, "TWILIO_API_KEY_SID") ?? "";
  const apiKeySecret = env(deps, "TWILIO_API_KEY_SECRET") ?? "";
  const credentialSid = apiKeySid && apiKeySecret ? apiKeySid : accountSid;
  const credentialSecret = apiKeySid && apiKeySecret ? apiKeySecret : authToken;
  const statusCallbackUrl = env(deps, "SMS_STATUS_CALLBACK_URL") ?? "";
  const redirectNumber = env(deps, "SMS_DEV_REDIRECT_NUMBER") ?? "";
  const isInvite = input.templateKey === "sms_optin_invite";

  /** A gate said no. Nothing was rendered, nothing was minted, nothing sent. */
  const refused = (reason: string): SendPartySmsResult => ({
    sent: false,
    status: "failed",
    reason,
  });

  // ── Resolve recipient ─────────────────────────────────────────────────────
  if (!selection && input.templateKey === SELECTION_TEMPLATE) return refused("selection_input_required");
  const recipient: Recipient = selection
    ? { phone: selection.manifest.recipientPhone, partyId: null, projectId: null, displayName: null }
    : await resolveRecipient(supabase, input);
  if (!recipient.phone) return refused("no_phone_number");

  // The physical number sms-inbound keys the thread on — never the MG…
  // Messaging Service SID, which would split it. Resolved BEFORE any gate
  // because the suppression ledger is keyed on the (sender, recipient) pair,
  // and fail-closed because a send that cannot be logged must not go.
  const conversationNumber = smsConversationNumber(deps);
  if (!conversationNumber) return refused("conversation_number_not_configured");

  // ── GATE 1: suppression ───────────────────────────────────────────────────
  // FIRST, ahead of consent (contract S5). Suppression is the carrier's and the
  // recipient's own STOP as the provider recorded it; it outranks anything a
  // studio's ledger says, so asking consent first could only ever produce a
  // permitted send the carrier will reject. An unreadable ledger refuses: not
  // knowing whether a number is suppressed is not permission to text it.
  const suppressed = await smsIsSuppressed(
    supabase,
    conversationNumber,
    recipient.phone,
  );
  if (suppressed === null) return refused("suppression_unreadable");
  if (suppressed) return refused("suppressed");

  // ── GATE 2: consent ───────────────────────────────────────────────────────
  // The studio's own consent record for this number (00594), and nothing else.
  const decision: ChannelConsentDecision = selection
    ? { verdict: "allow", recordPresent: true, recordGeneration: null }
    : await channelConsentDecision(
    supabase,
    recipient.phone,
    recipient.projectId,
  );
  if (decision.verdict === "refuse") return refused("opted_out");
  // AND THE STUDIO'S OWN RULE (CR3-9). A recorded grant is not permission when
  // the studio has written down that this person is never texted, and the rule
  // binds the double-opt-in invite too: "never text" is not "never text except
  // once, to ask".
  if (
    !selection && await contactRuleForbidsSms(supabase, recipient.partyId, recipient.phone)
  ) {
    return refused("contact_rule_forbids_sms");
  }
  const studioGranted = decision.verdict === "allow";
  if (!isInvite && !studioGranted) {
    // Only the double-opt-in invite may reach a number the record has not
    // granted — an unresolvable studio included, which refuses uniformly
    // rather than asking the frozen seat.
    return refused("not_consented");
  }
  if (isInvite && !studioGranted) {
    // `unknown` IS NOT ONE PERMISSION (contract S2). A studio's own record
    // reading `pending` is the double opt-in's first half and earns the invite.
    // A project with no resolvable studio also answers `unknown` whenever
    // nothing on the number has refused — and that is no record at all, the
    // `not_asked` R-AW makes a refusal. The invite door opens for the first and
    // not the second.
    if (!decision.recordPresent) return refused("not_consented");
  }
  if (isInvite) {
    if (!input.partyId) return refused("consent_evidence_required");
    const { data: proof } = await supabase
      .from("project_parties")
      .select(
        "sms_consent_source, sms_consent_evidence, sms_consent_recorded_at, sms_consent_disclosure_version",
      )
      .eq("id", input.partyId)
      .maybeSingle();
    if (
      !proof?.sms_consent_source || !proof?.sms_consent_recorded_at ||
      !proof?.sms_consent_disclosure_version ||
      !String(proof.sms_consent_evidence ?? "").trim()
    ) {
      return refused("consent_evidence_required");
    }
  }

  // ── GATE 3: the phase gate ────────────────────────────────────────────────
  // A new outbound automation declares the phase it belongs to and the SERVER
  // decides whether that phase is live (contract S7). Phase 0 — everything that
  // shipped before The Field Line, and every safety fix — never asks.
  const declaredPhase = input.automationPhase ?? 0;
  if (declaredPhase > 0 && declaredPhase > fieldLinePhase(deps)) {
    return refused("field_line_phase_off");
  }

  const convId = selection?.manifest.conversationId ?? await findOrCreateConversation(
    supabase,
    conversationNumber,
    recipient.phone,
    recipient.partyId,
    recipient.projectId,
  );

  // The name of the logical send, for the claim index. A caller that knows it
  // says so; the invite names its own, keyed on the consent record's evidence
  // stamp so that a fold → reconsent → START recovery earns a fresh invite and
  // a retried dispatch does not.
  const dedupeKey = input.dedupeKey ??
    (isInvite && decision.recordGeneration
      ? `optin:${decision.recordGeneration}`
      : null);

  const templateKey = input.templateKey ?? null;
  const rendersFromTemplate = !input.body && !!templateKey;
  const selectionRecipe: SendRecipe | null = selection ? {
    template_key: SELECTION_TEMPLATE, params: {}, party_id: null, project_id: null,
    link_kind: null, automation_phase: declaredPhase > 0 ? declaredPhase : null,
    selection: selection.manifest,
  } : null;

  // Only an automation that declared a cadence class is subject to the two
  // gates below, and only while its phase is live. A receipt, an invite, a
  // selection question and every phase-0 send declare none and are untouched:
  // this is the trade rail's pacing, not a new rule about texting.
  const cadenceClass = input.cadenceClass ?? null;
  const paced = declaredPhase > 0 && !!cadenceClass && !!convId &&
    !!recipient.partyId && !!recipient.projectId;

  // ── GATE 4: a dead end has an owner, not another text (contract P4) ───────
  // Two questions this party never answered is not a delivery problem to retry
  // — it is a person to call. The gate hands the thread to the project lead
  // ONCE and pauses prompts for the party; the pause it wrote is what refuses
  // every send after it, including the one that tripped it.
  if (paced) {
    const gate = await partyPromptGate(
      supabase,
      convId!,
      recipient.projectId!,
      recipient.partyId!,
    );
    if (!gate.allowed) {
      return {
        ...refused(gate.reason === "paused" ? "prompts_paused" : "dead_end"),
        conversationId: convId ?? undefined,
        dueAt: gate.pausedUntil,
      };
    }
  }

  // ── GATE 5: the party's daily cadence budget (contract P5) ────────────────
  // Spent HERE, where the text is actually about to go out, and not above:
  // quiet hours stores the row for the morning and the flush spends the slot
  // then, on the day it really sends. Claiming in both places spends two slots
  // for one text and folded the party's next real message for nothing.
  let foldReason: "budget" | null = null;
  if (paced && !isQuietHours(now, fieldTz)) {
    const claim = await claimCadenceSlot(
      supabase,
      convId!,
      recipient.projectId!,
      recipient.partyId!,
      localDayInTimezone(now, fieldTz),
      cadenceClass!,
    );
    // Over budget is not a refusal: the text is stored deferred and reaches the
    // party with the next digest, which is what folding it means.
    if (!claim.claimed) foldReason = "budget";
  }

  // ── GATE 6: quiet hours, or a folded over-budget text → defer ─────────────
  // (store, do not send, DO NOT MINT)
  if (foldReason || isQuietHours(now, fieldTz)) {
    const dueAt = foldReason
      // Tomorrow, in the send window, in the named zone: the fold is waiting for
      // a new LOCAL day to reset the counters, and the flush re-asks the claim.
      ? nextSendWindowStart(
        new Date(now.getTime() + 24 * 60 * 60 * 1000),
        fieldTz,
      ).toISOString()
      : nextSendWindowStart(now, fieldTz).toISOString();
    // Rendered WITHOUT minting: this copy is a PREVIEW for the thread, and the
    // link it names does not exist yet (contract S6).
    const preview = selection ? { body: selection.body, linkKind: null } : await resolveBody(
      supabase,
      input,
      recipient,
      clientPortalUrl,
      { mintLink: false },
    );
    if (!preview.body || !preview.body.trim()) return refused("empty_body");
    const previewBody = redactFieldLinkTokens(
      input.auditBody?.trim() || preview.body,
    );

    if (input.deferToCaller) {
      // A caller-owned durable outbox retries this same call later; nothing is
      // stored here, so nothing here has to be re-renderable.
      return {
        sent: false,
        deferred: true,
        status: "deferred",
        reason: foldReason ?? "quiet_hours",
        conversationId: convId ?? undefined,
        body: previewBody,
        dueAt,
      };
    }

    const safeParams = safeRecipeParams(input.vars);
    const recipe: SendRecipe | null = selectionRecipe ?? (rendersFromTemplate || declaredPhase > 0
      ? {
        template_key: rendersFromTemplate ? templateKey : null,
        params: safeParams.params,
        party_id: recipient.partyId,
        project_id: recipient.projectId,
        // A caller's own `link` var was just dropped from the params, so the
        // row has to say that a link still belongs in this copy — the flush
        // mints it fresh rather than re-sending an hours-old credential.
        link_kind: preview.linkKind ??
          (safeParams.droppedLink ? "field" : null),
        automation_phase: declaredPhase > 0 ? declaredPhase : null,
        cadence_class: cadenceClass,
      }
      : null);
    // A row with no TEMPLATE to render from is flushed by sending the body
    // stored on it, so the body stored has to BE the body to send. A raw body
    // that the audit copy replaces, or that redaction would alter, is not:
    // storing it would put the preview on the wire at 8am. Refuse instead of
    // sending the wrong words.
    if (
      !rendersFromTemplate &&
      (previewBody !== (input.body ?? "") ||
        previewBody !== redactFieldLinkTokens(previewBody))
    ) {
      return refused("defer_requires_recipe");
    }

    const claim = await insertOutbound(supabase, {
      conversation_id: convId,
      body: previewBody,
      twilio_sid: null,
      twilio_status: "deferred",
      party_id: recipient.partyId,
      project_id: recipient.projectId,
      template_key: templateKey,
      site_request_dispatch_outbox_id: input.siteRequestDispatchOutboxId ??
        null,
      recipe,
      dedupe_key: dedupeKey,
      claimed_at: null,
      // Why this row is waiting, in the column this rail already says it in.
      error_message: foldReason,
    });
    if (claim.duplicate) {
      return {
        sent: false,
        status: "queued",
        reason: "duplicate_send_claim",
        conversationId: convId ?? undefined,
      };
    }
    if (!claim.id) {
      // THE INSERT DID NOT LAND. 'deferred' is a promise that a row exists and
      // a later flush will read it; answering it for a row that was never
      // written is a text the caller believes is coming and nothing will ever
      // send (SQ-37 R5, reproduced with a synthetic 08006 on the insert).
      return {
        sent: false,
        deferred: false,
        status: "failed",
        reason: "defer_failed",
        conversationId: convId ?? undefined,
      };
    }
    return {
      sent: false,
      deferred: true,
      status: "deferred",
      reason: foldReason ?? undefined,
      messageId: claim.id,
      conversationId: convId ?? undefined,
      body: previewBody,
      dueAt,
    };
  }

  // ── Render, MINTING THE LINK HERE AND NOWHERE ELSE ────────────────────────
  const rendered = selection ? { body: selection.body, linkKind: null } : await resolveBody(
    supabase,
    input,
    recipient,
    clientPortalUrl,
    { mintLink: true },
  );
  if (!rendered.body || !rendered.body.trim()) return refused("empty_body");
  let body = rendered.body;
  // What the thread keeps. Redacted in both directions: a caller's audit copy
  // is used as given, and a body we rendered has its token taken out of it, so
  // no stored row and no log line carries a live credential (contract S6).
  let auditBody = redactFieldLinkTokens(input.auditBody?.trim() || body);
  // The recipe is durable, so it is credential-free here for exactly the same
  // reason it is on the deferred row: a row this send claimed can be read back
  // by the reconciliation sweep long after the link it named has been handed out.
  const sentParams = safeRecipeParams(input.vars);

  // ── Claim the logical send BEFORE the provider is called ──────────────────
  const claim = await insertOutbound(supabase, {
    conversation_id: convId,
    body: auditBody,
    twilio_sid: null,
    twilio_status: "claimed",
    party_id: recipient.partyId,
    project_id: recipient.projectId,
    template_key: templateKey,
    site_request_dispatch_outbox_id: input.siteRequestDispatchOutboxId ?? null,
    recipe: selectionRecipe ?? (rendersFromTemplate
      ? {
        template_key: templateKey,
        params: sentParams.params,
        party_id: recipient.partyId,
        project_id: recipient.projectId,
        link_kind: rendered.linkKind ??
          (sentParams.droppedLink ? "field" : null),
        automation_phase: declaredPhase > 0 ? declaredPhase : null,
      }
      : null),
    dedupe_key: dedupeKey,
    claimed_at: now.toISOString(),
  });
  if (claim.duplicate) {
    // Another writer holds this send. Not an error, and not a second text.
    return {
      sent: false,
      status: "queued",
      reason: "duplicate_send_claim",
      conversationId: convId ?? undefined,
      body: auditBody,
    };
  }
  const messageId = claim.id;
  if (!messageId) {
    // The row IS the claim and the record of the send. Without it a text would
    // go out that nothing in the room can see, reconcile or stop.
    return refused("send_not_claimable");
  }

  if (selection) {
    // Reauthorize after claiming, and use THAT render for both wire and preview.
    // Studio ownership/names may have changed since the initial filtering pass.
    try {
      const checked = await validateSmsSelection(supabase, selection.manifest,
        recipient.phone, conversationNumber, now, true);
      if (!checked.ok) {
        if (checked.unreadable) await releaseSendClaim(supabase, messageId, checked.reason);
        else await supabase.from("sms_messages").update({
          twilio_status: "suppressed", error_message: checked.reason,
        }).eq("id", messageId);
        return { ...refused(checked.reason), messageId, conversationId: convId ?? undefined };
      }
      body = checked.value.body;
      auditBody = redactFieldLinkTokens(body);
      const { data: preview, error } = await supabase.from("sms_messages")
        .update({ body: auditBody })
        .eq("id", messageId).eq("twilio_status", "claimed").is("twilio_sid", null)
        .select("id").maybeSingle();
      if (error || !preview) {
        await releaseSendClaim(supabase, messageId, "selection_preview_unrecorded");
        return { ...refused("selection_preview_unrecorded"), messageId, conversationId: convId ?? undefined };
      }
    } catch (error) {
      // Pre-provider only: a transport exception below remains ambiguous and
      // must NOT release the claim for an immediate second provider attempt.
      await releaseSendClaim(supabase, messageId, error);
      return { ...refused("selection_preview_unrecorded"), messageId, conversationId: convId ?? undefined };
    }
  }

  // ── Send (dev-mode aware) ─────────────────────────────────────────────────
  let twilioSid: string | null = null;
  let twilioStatus = "queued";
  let sent = false;
  let reason: string | undefined;
  let providerCode: string | undefined;
  let sendBody = body;

  if (mode === "dry_run") {
    twilioStatus = "dry_run";
    twilioSid = "dev-" + crypto.randomUUID();
    sent = true;
  } else {
    const to = mode === "redirect" ? redirectNumber : recipient.phone;
    if (mode === "redirect") sendBody = `[DEV→${recipient.phone}] ${body}`;
    if (
      !accountSid || !credentialSid || !credentialSecret || !fromNumber ||
      (mode === "redirect" && !redirectNumber)
    ) {
      twilioStatus = "failed";
      reason = "twilio_not_configured";
    } else {
      const r = await sendViaTwilio({
        accountSid,
        credentialSid,
        credentialSecret,
        fromNumber,
        statusCallbackUrl,
      }, {
        to,
        body: sendBody,
      }, fetchImpl);
      if (r.ok) {
        sent = true;
        twilioSid = r.sid ?? null;
        twilioStatus = r.status ?? "queued";
      } else {
        twilioStatus = "failed";
        reason = r.error;
        providerCode = r.code;
      }
    }
  }

  // THE PROVIDER'S ID IS RECORDED BEFORE THE STATUS FLIPS (contract S5). This
  // is the crash window the outbox has to survive: the provider has accepted
  // the message — it is already going out — and this process dies before the
  // row says so. Writing the sid first means the row still reads 'claimed' and
  // carries the id, so the status callback settles it by sid and
  // sms_reconcile_accepted_send() closes it by hand. It does NOT make carrier
  // delivery exactly-once: a claim released with no sid (the narrower window
  // between the accept and this write) can be retried, and the carrier may
  // still deliver twice. At-least-once is what a provider gives.
  if (twilioSid && !(await persistProviderSid(supabase, messageId, twilioSid))) {
    // The send happened and we cannot name it. Reporting 'queued' here would
    // tell the caller a text it can track is on its way, when the row carries
    // no id to track it by; the honest answer is that this send needs a human.
    return {
      sent: false,
      status: "failed",
      reason: "sid_unrecorded",
      messageId,
      conversationId: convId ?? undefined,
      twilioSid,
      body: auditBody,
    };
  }
  const settle: Record<string, unknown> = { twilio_status: twilioStatus };
  if (providerCode) settle.error_code = providerCode;
  if (reason) settle.error_message = reason;
  // Monotonic (contract S5): a delivery callback that arrived while the
  // provider call was in flight is newer than this acceptance, and the row it
  // settled is not walked back to 'queued'.
  await supabase
    .from("sms_messages")
    .update(settle)
    .eq("id", messageId)
    .in("twilio_status", SETTLEABLE_FROM);

  // E13: one out touch per text that actually went. Best effort and never a
  // condition of the send — a record of the contact, not a gate on it. A
  // phone-only send (no seat) has no subject to file against and writes none;
  // record_touch answers NULL for a seat whose job records no studio (00635).
  if (sent && recipient.partyId) {
    const { error: touchError } = await supabase.rpc("record_touch", {
      p_subject_type: "engagement",
      p_subject_id: recipient.partyId,
      p_channel_kind: "sms",
      p_direction: "out",
      p_occurred_at: now.toISOString(),
      p_actor_ref: "sms-dispatch",
      p_message_ref: messageId ?? null,
    });
    if (touchError) {
      console.error("sendPartySms: record_touch failed", touchError.message);
    }
  }

  if (sent && convId) {
    await supabase
      .from("sms_conversations")
      .update({ last_outbound_at: now.toISOString() })
      .eq("id", convId);
    // Best-effort analytics; never throws.
    await captureServerEvent("sms-dispatch", "sms_outbound_sent", {
      template_key: input.templateKey ?? null,
      project_id: recipient.projectId,
      party_id: recipient.partyId,
      dev_mode: mode,
    }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
  }

  return {
    sent,
    status: sendStatusFor(sent, twilioStatus),
    reason,
    provider_code: providerCode,
    messageId,
    conversationId: convId ?? undefined,
    twilioSid: twilioSid ?? undefined,
    body: auditBody,
  };
}

/**
 * One word for what the provider said (contract S5). A provider ACCEPT is
 * 'queued' and not 'sent': the carrier has not answered yet, and the status
 * callback is what turns it into 'sent' or 'undelivered'. Only a terminal
 * provider status — or a dev dry run, which has no carrier — is 'sent'.
 */
function sendStatusFor(sent: boolean, twilioStatus: string): SendStatus {
  if (!sent) return "failed";
  return ["sent", "delivered", "dry_run"].includes(twilioStatus)
    ? "sent"
    : "queued";
}

const DEFERRED_TTL_MS = 24 * 3600 * 1000;

/**
 * How long a send claim may be held before a flush treats it as ABANDONED and
 * takes it back (SQ-43 R1). The same 15 minutes 00640's
 * sms_release_stale_send_claims() defaults to, because they answer one
 * question from two directions — the cron's sweep and the flush's own next tick
 * — and two different answers to "is this claim still alive?" would race.
 */
const SMS_CLAIM_TTL_MS = 15 * 60 * 1000;

/** A row the flush may send: a deferred one, or a claim abandoned mid-send. */
interface FlushRow {
  id: string;
  body: string;
  conversation_id: string;
  party_id: string | null;
  project_id: string | null;
  template_key: string | null;
  recipe: SendRecipe | null;
  dedupe_key: string | null;
  created_at: string;
  twilio_status: string;
  claimed_at: string | null;
}

/**
 * Flush stored 'deferred' outbound rows by sending them now (field-daily). Rows
 * whose phone is still inside quiet hours are left for the next run. Reuses the
 * Twilio primitive and updates the existing row in place (no new insert).
 *
 * Each row is re-checked before sending — a deferred row can sit for hours,
 * during which the recipient may have opted out or the send window may have
 * closed for good (>24h stale): a defer is a promise to try later, not a
 * guarantee to send at all.
 *
 * And a flushed row writes the SAME out touch sendPartySms writes (E13, W4 r3
 * MAJOR-5): this path puts real texts on the wire, and a record of contact
 * that skips the rail's most ordinary send is a record the room reads wrong.
 *
 * The re-check is the SAME gate sendPartySms uses, in the same order (R-AH):
 * the studio's own consent record (channelConsentVerdict, keyed off the
 * deferred row's own party) first, then the legacy party-row reduction. A
 * second send path with a second consent gate is two answers to one question —
 * it let a studio's `granted` record die at quiet hours, and let a studio's
 * `opted_out` record be overruled by another studio's granted party row.
 */
export async function flushDeferredMessages(
  supabase: SupabaseClient,
  deps: SmsDeps = {},
): Promise<
  { flushed: number; skipped: number; suppressed?: number; expired?: number }
> {
  const now = deps.now ?? new Date();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const mode = devMode(deps);
  const fieldTz = env(deps, "FIELD_TZ") ?? "America/Chicago";
  const fromNumber = env(deps, "TWILIO_FROM_NUMBER") ?? "";
  const accountSid = env(deps, "TWILIO_ACCOUNT_SID") ?? "";
  const authToken = env(deps, "TWILIO_AUTH_TOKEN") ?? "";
  const apiKeySid = env(deps, "TWILIO_API_KEY_SID") ?? "";
  const apiKeySecret = env(deps, "TWILIO_API_KEY_SECRET") ?? "";
  const credentialSid = apiKeySid && apiKeySecret ? apiKeySid : accountSid;
  const credentialSecret = apiKeySid && apiKeySecret ? apiKeySecret : authToken;
  const statusCallbackUrl = env(deps, "SMS_STATUS_CALLBACK_URL") ?? "";
  const redirectNumber = env(deps, "SMS_DEV_REDIRECT_NUMBER") ?? "";
  const clientPortalUrl = env(deps, "CLIENT_PORTAL_URL") ??
    "https://client.patina.cloud";

  const FLUSH_COLUMNS = "id, body, conversation_id, party_id, project_id, " +
    "template_key, recipe, dedupe_key, created_at, twilio_status, claimed_at";
  const { data: deferredRows } = await supabase
    .from("sms_messages")
    .select(FLUSH_COLUMNS)
    .eq("direction", "outbound")
    .eq("twilio_status", "deferred");

  // ── AND THE CLAIMS NOBODY CAME BACK FOR (SQ-43 R1) ──────────────────────
  // A flush that died between taking the claim and calling the provider left a
  // row reading 'claimed' with no provider id. The select above only ever asked
  // for 'deferred', so that row was never looked at again: the text was not
  // sent, and nothing anywhere said so. It comes back here once the claim TTL
  // has passed — the flush's own recovery, on its own next tick, rather than a
  // wait for the cron sweep that is 00640's backstop for the same fact.
  //
  // Only a row with a RENDERABLE recipe is taken back. Anything else can be
  // re-sent only verbatim, and a stored body is trustworthy AS a body only when
  // the defer path vetted it as one; a row claimed by sendPartySms stores the
  // caller's AUDIT copy, and putting that on the wire is precisely the
  // deferred-redaction hazard contract S6 exists to stop. Those are left to
  // sms_release_stale_send_claims(), which fails them honestly rather than
  // guessing at what they meant to say.
  const claimCutoff = new Date(now.getTime() - SMS_CLAIM_TTL_MS).toISOString();
  const { data: staleRows } = await supabase
    .from("sms_messages")
    .select(FLUSH_COLUMNS)
    .eq("direction", "outbound")
    .eq("twilio_status", "claimed")
    .is("twilio_sid", null)
    .lt("claimed_at", claimCutoff);

  const rows: FlushRow[] = [
    ...((deferredRows ?? []) as unknown as FlushRow[]),
    ...((staleRows ?? []) as unknown as FlushRow[]).filter((r) =>
      !!r.claimed_at && !!r.recipe?.template_key
    ),
  ];
  if (rows.length === 0) return { flushed: 0, skipped: 0 };

  let flushed = 0;
  let skipped = 0;
  let suppressed = 0;
  let expired = 0;
  for (const row of rows) {
    // Stale beyond 24h — never send; the digest/menu it referenced is dead.
    if (now.getTime() - new Date(row.created_at).getTime() > DEFERRED_TTL_MS) {
      await supabase
        .from("sms_messages")
        .update({ twilio_status: "expired", error_message: "deferred_expired" })
        .eq("id", row.id);
      expired++;
      continue;
    }

    if (isQuietHours(now, fieldTz)) {
      skipped++;
      continue;
    }
    const { data: conv } = await supabase
      .from("sms_conversations")
      .select("phone_e164, twilio_number")
      .eq("id", row.conversation_id)
      .maybeSingle();
    const convRow = conv as
      | { phone_e164?: string; twilio_number?: string }
      | null;
    const phone = convRow?.phone_e164;
    if (!phone) {
      skipped++;
      continue;
    }

    // ── GATE 1: suppression, first, exactly as the send path orders it ──────
    // A deferred row waits hours; a STOP the carrier recorded in that time is
    // the one thing that must never be overtaken by a stored message.
    const senderNumber = convRow?.twilio_number ?? smsConversationNumber(deps);
    if (!senderNumber) {
      skipped++;
      continue;
    }
    const isSuppressed = await smsIsSuppressed(supabase, senderNumber, phone);
    if (isSuppressed === null) {
      // Unreadable is not permission. Leave it deferred for the next run.
      skipped++;
      continue;
    }
    if (isSuppressed) {
      await supabase
        .from("sms_messages")
        .update({ twilio_status: "suppressed", error_message: "suppressed" })
        .eq("id", row.id);
      suppressed++;
      continue;
    }

    const selectionRow = row.template_key === SELECTION_TEMPLATE;
    let validatedSelection: ValidatedSelection | undefined;
    if (selectionRow) {
      const recipe = row.recipe;
      const manifest = recipe?.selection;
      if (row.party_id !== null || row.project_id !== null || recipe?.party_id !== null ||
        recipe?.project_id !== null || recipe?.link_kind !== null || recipe?.template_key !== SELECTION_TEMPLATE ||
        !manifest || manifest.conversationId !== row.conversation_id ||
        row.dedupe_key !== selectionDedupeKey(manifest.inboundMessageId, manifest.kind) ||
        !recipe.params || Object.keys(recipe.params).length || senderNumber !== smsConversationNumber(deps)) {
        await supabase.from("sms_messages").update({ twilio_status: "suppressed", error_message: "selection_recipe_invalid" }).eq("id", row.id);
        suppressed++;
        continue;
      }
      const checked = await validateSmsSelection(supabase, manifest, phone, senderNumber, now, true);
      if (!checked.ok) {
        if (checked.unreadable) { skipped++; continue; }
        await supabase.from("sms_messages").update({
          twilio_status: checked.reason === "selection_expired" ? "expired" : "suppressed",
          error_message: checked.reason,
        }).eq("id", row.id);
        if (checked.reason === "selection_expired") expired++; else suppressed++;
        continue;
      }
      validatedSelection = checked.value;
    }

    // Re-check consent — it may have changed since the row was deferred.
    // The studio's own record for this number, resolved through the deferred
    // row's party, exactly as sendPartySms does. The seat is read for the
    // PROJECT only: its consent column was this path's second check until this
    // pass and is deleted with sendPartySms's (R-AY, final-run MAJOR-1).
    let deferredProjectId: string | null = row.project_id ?? null;
    let deferredDisplayName: string | null = null;
    if (row.party_id) {
      const { data: deferredParty } = await supabase
        .from("project_parties")
        .select("project_id, display_name")
        .eq("id", row.party_id)
        .maybeSingle();
      const party = deferredParty as
        | { project_id?: string | null; display_name?: string | null }
        | null;
      deferredProjectId = party?.project_id ?? deferredProjectId;
      deferredDisplayName = party?.display_name ?? null;
    }
    const verdict = selectionRow ? "allow" : await channelConsentVerdict(
      supabase,
      phone,
      deferredProjectId,
    );
    if (verdict === "refuse") {
      await supabase
        .from("sms_messages")
        .update({ twilio_status: "suppressed", error_message: "opted_out" })
        .eq("id", row.id);
      suppressed++;
      continue;
    }
    // The studio's own record says granted: that carries the deferred send
    // (F-11), and it is the whole answer. The legacy party-row check that stood
    // here — PR-x's fail-closed second check, narrowed to the deferred row's
    // own seat — is deleted with sendPartySms's (R-AY, final-run MAJOR-1): a
    // frozen column cannot refuse what the live record grants, and it cannot
    // carry what no record grants either.
    const studioGranted = verdict === "allow";
    const isInvite = row.template_key === "sms_optin_invite";
    if (!isInvite && !studioGranted) {
      await supabase
        .from("sms_messages")
        .update({ twilio_status: "suppressed", error_message: "not_consented" })
        .eq("id", row.id);
      suppressed++;
      continue;
    }

    // ── GATE 3: the studio's own "never text" rule ──────────────────────────
    // Written down AFTER the row was deferred, it still binds the send that
    // actually happens: a rule the studio entered last night is not answered by
    // a message composed the evening before it (SQ-37 R3).
    if (!selectionRow && await contactRuleForbidsSms(supabase, row.party_id, phone)) {
      await supabase
        .from("sms_messages")
        .update({
          twilio_status: "suppressed",
          error_message: "contact_rule_forbids_sms",
        })
        .eq("id", row.id);
      suppressed++;
      continue;
    }

    const recipe = row.recipe ?? null;

    // ── GATE 4: the phase gate, re-asked at the moment of dispatch ──────────
    // FIELD_LINE_PHASE is a SERVER gate (contract S7) and the server that
    // flushes is not the server that deferred. Turning the phase back down is
    // how this rail is turned off, so a row deferred while phase 1 was live
    // must not go out at 8am from a server that is back at phase 0. It stays
    // DEFERRED rather than being failed: the phase may come back up inside the
    // 24h window, and if it does not the TTL expires the row honestly.
    const deferredPhase = Number(recipe?.automation_phase ?? 0);
    if (
      Number.isFinite(deferredPhase) && deferredPhase > 0 &&
      deferredPhase > fieldLinePhase(deps)
    ) {
      await supabase
        .from("sms_messages")
        .update({ error_message: "field_line_phase_off" })
        .eq("id", row.id);
      skipped++;
      continue;
    }

    // Read once: the dead-end gate below and the budget claim after the row is
    // taken ask about the same paced send, so they read the same two fields.
    const cadenceClass = recipe?.cadence_class ?? null;
    const cadenceProject = row.project_id ?? deferredProjectId;
    const paced = !!cadenceClass && !!row.party_id && !!cadenceProject &&
      !!row.conversation_id;

    // ── The dead-end gate, re-asked at the moment of dispatch (GATE 4) ──────
    // The same reason the phase gate above is re-asked: the server that flushes
    // is not the server that deferred, and what was true last night is not what
    // binds this morning's send. A row folded on day D goes out on D+1 — and by
    // then the party may have gone quiet on two prompts, been handed to the
    // project lead, and had prompts PAUSED for them. Sending the fold anyway
    // walks straight through the pause that the handoff exists to enforce, and
    // it is the loudest possible thing to do to someone who has stopped
    // answering. Asked BEFORE the exclusive claim, because a gate that refuses
    // should not have cost the row its claim stamp; the row stays DEFERRED with
    // the reason, exactly as the phase gate leaves it, and the 24h TTL is what
    // ends it honestly if the pause outlives the window. Asking again cannot
    // produce a second handoff: 00645's gate compare-and-sets on the streak's
    // oldest unanswered prompt id, so the one already taken is the one there is.
    if (paced) {
      const gate = await partyPromptGate(
        supabase,
        row.conversation_id,
        cadenceProject!,
        row.party_id!,
      );
      if (!gate.allowed) {
        await supabase
          .from("sms_messages")
          .update({
            error_message: gate.reason === "paused" ? "prompts_paused" : "dead_end",
          })
          .eq("id", row.id);
        skipped++;
        continue;
      }
    }

    // ── TAKE THE ROW EXCLUSIVELY, BEFORE ANYTHING IRREVERSIBLE ─────────────
    // The gates have all answered yes; from here on this row is going to mint a
    // link and call a provider, and both of those are things that must happen
    // once. The SELECT that opened this loop is not a claim — two flushes
    // (the field-daily cron and a manual run, or two overlapping cron ticks)
    // both read the same 'deferred' row and both sent it (SQ-37 R1). This
    // conditional update IS the claim: filtered on the status and the empty
    // claim stamp, so exactly one writer sees a row come back. Postgres
    // re-evaluates the predicate after taking the row lock, so the loser
    // matches nothing and leaves without touching the provider.
    //
    // A row taken back from an ABANDONED claim is re-claimed the same way, on
    // the stale stamp it was read with: 'claimed' → 'claimed' with a fresh
    // claimed_at, filtered on the old one, so of two flushes that both saw the
    // same timed-out claim exactly one takes it.
    const reclaiming = row.twilio_status === "claimed";
    const takeClaim = supabase
      .from("sms_messages")
      .update({ twilio_status: "claimed", claimed_at: now.toISOString() })
      .eq("id", row.id)
      .eq("twilio_status", reclaiming ? "claimed" : "deferred");
    const { data: claimed, error: claimError } = await (reclaiming
      ? takeClaim.is("twilio_sid", null).eq("claimed_at", row.claimed_at)
      : takeClaim.is("claimed_at", null))
      .select("id");
    if (claimError) {
      console.error(
        "flushDeferredMessages: the send claim could not be taken",
        (claimError as { message?: string }).message ?? claimError,
      );
      skipped++;
      continue;
    }
    if (!Array.isArray(claimed) || claimed.length === 0) {
      // Another flush holds it. Not an error, and not a second text.
      skipped++;
      continue;
    }

    // ── GATE 5: the cadence budget, spent at the moment of dispatch ─────────
    // Every row that waited spends its slot HERE — the ones quiet hours stored
    // last night and the ones folded yesterday for being over budget — and the
    // question is asked of TODAY'S local day. A folded row's counters have since
    // reset, so it goes out with this morning's digest; a row that is over
    // budget again is simply not sent yet and the 24h TTL above is what ends it
    // honestly. AFTER the exclusive claim, because spending a slot is durable:
    // claiming first and then losing the row race burns a slot on a text this
    // process is not going to send, and the party's next real message pays for
    // it.
    if (paced) {
      const budget = await claimCadenceSlot(
        supabase,
        row.conversation_id,
        cadenceProject!,
        row.party_id!,
        localDayInTimezone(now, fieldTz),
        cadenceClass!,
      );
      if (!budget.claimed) {
        // Hand the row back exactly as it came, still waiting, saying why.
        await supabase
          .from("sms_messages")
          .update({
            twilio_status: "deferred",
            claimed_at: null,
            error_message: "budget",
          })
          .eq("id", row.id)
          .eq("twilio_status", "claimed")
          .is("twilio_sid", null);
        skipped++;
        continue;
      }
    }

    // ── Render fresh from the recipe — and mint the link HERE ──────────────
    // `row.body` is a PREVIEW (contract S6): the copy as it read at defer time,
    // with the token taken out of it. Sending it would put "[link at send]" in
    // front of a trade on a job site. The recipe is what the row is flushed
    // from, and the link is minted at this moment and no earlier.
    //
    // AND FROM HERE TO THE PROVIDER CALL, A THROW MUST NOT KEEP THE CLAIM
    // (SQ-43 R1). Minting is an RPC and rendering reads a template: either can
    // die mid-flight, and the claim taken above then held a row no later flush
    // would ever select again. Anything thrown in this section hands the row
    // back to 'deferred' and records why. The catch stops BEFORE the provider
    // call on purpose — a throw after that may be a text already on the wire,
    // which is sms_reconcile_accepted_send()'s question, not this one's.
    let sendBody = row.body;
    try {
      if (validatedSelection) {
        const checked = await validateSmsSelection(supabase, validatedSelection.manifest, phone, senderNumber, now, true);
        if (!checked.ok) {
          if (checked.unreadable) await releaseSendClaim(supabase, row.id, checked.reason);
          else await supabase.from("sms_messages").update({ twilio_status: "suppressed", error_message: checked.reason }).eq("id", row.id);
          skipped++;
          continue;
        }
        sendBody = checked.value.body;
      } else if (recipe && recipe.template_key) {
        const rendered = await resolveBody(
          supabase,
          {
            partyId: recipe.party_id ?? row.party_id ?? undefined,
            projectId: recipe.project_id ?? deferredProjectId ?? undefined,
            templateKey: recipe.template_key,
            vars: (recipe.params ?? {}) as Record<string, unknown>,
          },
          {
            phone,
            projectId: recipe.project_id ?? deferredProjectId,
            partyId: recipe.party_id ?? row.party_id,
            displayName: deferredDisplayName,
          },
          clientPortalUrl,
          { mintLink: true },
        );
        if (!rendered.body || !rendered.body.trim()) {
          await supabase
            .from("sms_messages")
            .update({
              twilio_status: "failed",
              error_message: "recipe_render_failed",
            })
            .eq("id", row.id);
          skipped++;
          continue;
        }
        sendBody = rendered.body;
      } else if (row.body.includes(LINK_PLACEHOLDER)) {
        // A preview with nothing to render from. Never send the placeholder.
        await supabase
          .from("sms_messages")
          .update({
            twilio_status: "failed",
            error_message: "defer_requires_recipe",
          })
          .eq("id", row.id);
        skipped++;
        continue;
      }
    } catch (err) {
      await releaseSendClaim(supabase, row.id, err);
      skipped++;
      continue;
    }

    let twilioSid: string | null = null;
    let twilioStatus = "queued";
    let providerCode: string | undefined;
    if (mode === "dry_run") {
      twilioStatus = "dry_run";
      twilioSid = "dev-" + crypto.randomUUID();
    } else {
      const to = mode === "redirect" ? redirectNumber : phone;
      if (mode === "redirect") sendBody = `[DEV→${phone}] ${sendBody}`;
      if (
        !accountSid || !credentialSid || !credentialSecret || !fromNumber ||
        (mode === "redirect" && !redirectNumber)
      ) {
        // Not configured — put it back to 'deferred' so the next run retries.
        await supabase
          .from("sms_messages")
          .update({ twilio_status: "deferred", claimed_at: null })
          .eq("id", row.id);
        skipped++;
        continue;
      }
      const r = await sendViaTwilio({
        accountSid,
        credentialSid,
        credentialSecret,
        fromNumber,
        statusCallbackUrl,
      }, {
        to,
        body: sendBody,
      }, fetchImpl);
      if (!r.ok) {
        // A single attempt only — no retry accumulation on a deferred row.
        await supabase
          .from("sms_messages")
          .update({
            twilio_status: "failed",
            error_message: r.error ?? "send_failed",
            error_code: r.code ?? null,
          })
          .eq("id", row.id);
        skipped++;
        continue;
      }
      twilioSid = r.sid ?? null;
      twilioStatus = r.status ?? "queued";
      providerCode = r.code;
    }
    // The provider's id lands BEFORE the status does (contract S5): a crash
    // here leaves a 'claimed' row carrying the sid, which the status callback
    // and sms_reconcile_accepted_send() can both settle. Not exactly-once —
    // a claim released with no sid may still be retried against a carrier that
    // already delivered.
    if (twilioSid && !(await persistProviderSid(supabase, row.id, twilioSid))) {
      // On the wire and unidentifiable. The row stays 'claimed' — it is not a
      // flush this run may count, and it is certainly not 'queued'.
      skipped++;
      continue;
    }
    // The thread keeps the words that went out, with the token taken out of
    // them (contract S6). Not a lifecycle field, so it lands whatever the
    // status has become since.
    await supabase
      .from("sms_messages")
      .update({ body: redactFieldLinkTokens(sendBody) })
      .eq("id", row.id);
    const settle: Record<string, unknown> = { twilio_status: twilioStatus };
    if (providerCode) settle.error_code = providerCode;
    // Monotonic (contract S5), exactly as sendPartySms settles: a delivery
    // callback that landed while the provider call was in flight is newer than
    // this acceptance and is never overwritten by it.
    await supabase
      .from("sms_messages")
      .update(settle)
      .eq("id", row.id)
      .in("twilio_status", SETTLEABLE_FROM);

    // E13: one out touch per text that actually went — and this path sends
    // real texts (W4 r3 MAJOR-5). sendPartySms writes its touch; the flush
    // wrote none, so a digest deferred past 8pm by quiet hours — the normal
    // shape of the field rail — went out next morning and never appeared in
    // studio_touches. The card's derived "Last touch" then showed the
    // PREVIOUS contact: the room saying the studio has not reached someone it
    // reached this morning, against studio_touches' own table comment ("one
    // row per contact a rail actually made, in either direction").
    //
    // Same posture as sendPartySms's: best effort, never a condition of the
    // send; a row with no party_id has no subject to file against and writes
    // none; record_touch answers NULL for a seat whose job records no studio
    // (00635, R-BD).
    if (row.party_id) {
      const { error: touchError } = await supabase.rpc("record_touch", {
        p_subject_type: "engagement",
        p_subject_id: row.party_id,
        p_channel_kind: "sms",
        p_direction: "out",
        p_occurred_at: now.toISOString(),
        p_actor_ref: "sms-dispatch-flush",
        p_message_ref: row.id,
      });
      if (touchError) {
        console.error(
          "flushDeferredMessages: record_touch failed",
          touchError.message,
        );
      }
    }
    flushed++;
  }
  return { flushed, skipped, suppressed, expired };
}
