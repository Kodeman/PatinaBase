// _shared/sms.ts — the single outbound SMS send path for Field Coordination.
//
// sendPartySms() is used by sms-dispatch (assignment/invite jobs), sms-inbound
// (out-of-band replies), and field-daily (digest + delivery confirms). It:
//   · resolves the recipient phone + SMS consent from project_parties,
//   · reads the STUDIO'S consent record for the number first
//     (studio_channel_consent, 00594) — consent is per studio per channel
//     value, so one studio's STOP no longer silences another's job; the old
//     phone-global party-row reduction stays behind it as a fail-closed
//     second check (PR-x),
//   · enforces the consent gate (granted only — EXCEPT sms_optin_invite, the
//     double-opt-in invite, which is the sole send allowed to a 'pending' party;
//     an 'opted_out' phone is NEVER texted),
//   · renders a templateKey against email_templates ({{var}} via interpolate),
//     enriching studio_name / party_first_name / a fresh field link on demand,
//   · honors quiet hours (8am–8pm FIELD_TZ) — off-hours sends are stored as
//     'deferred' and flushed by the next field-daily run,
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

// ── Injectable seams ────────────────────────────────────────────────────────
export interface SmsDeps {
  /** Injectable env reader (defaults to Deno.env.get). */
  getEnv?: (key: string) => string | undefined;
  /** Injectable fetch (for Twilio; defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Injectable clock (defaults to new Date()). */
  now?: Date;
}

export interface SendPartySmsInput {
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
}

export interface SendPartySmsResult {
  sent: boolean;
  deferred?: boolean;
  reason?: string;
  messageId?: string;
  conversationId?: string;
  twilioSid?: string;
  body?: string;
}

type ConsentStatus = "not_asked" | "pending" | "granted" | "opted_out";
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

/** True when `now` is OUTSIDE the 8am–8pm send window in `tz` (defer). */
export function isQuietHours(now: Date, tz: string): boolean {
  const hour = hourInTimezone(now, tz);
  return hour < 8 || hour >= 20;
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

async function sendViaTwilio(
  creds: TwilioCreds,
  params: { to: string; body: string },
  fetchImpl: typeof fetch,
): Promise<{ ok: boolean; sid?: string; status?: string; error?: string }> {
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
    return { ok: false, error: `Twilio ${res.status}: ${text}` };
  }
  const data = await res.json();
  return { ok: true, sid: data.sid, status: data.status ?? "queued" };
}

// ── Consent resolution ──────────────────────────────────────────────────────
interface Recipient {
  phone: string | null;
  projectId: string | null;
  partyId: string | null;
  displayName: string | null;
  consent: ConsentStatus;
}

/** Consent precedence across all party rows on a phone: opted_out wins, then
 * granted, then pending, then not_asked. Keeps opt-out phone-global. */
function reduceConsent(
  rows: { sms_consent_status: ConsentStatus }[],
): ConsentStatus {
  if (rows.some((r) => r.sms_consent_status === "opted_out")) {
    return "opted_out";
  }
  if (rows.some((r) => r.sms_consent_status === "granted")) return "granted";
  if (rows.some((r) => r.sms_consent_status === "pending")) return "pending";
  return "not_asked";
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

/**
 * Is there a party row on this number, IN THIS STUDIO, that says opted_out?
 *
 * The studio record and the party rows can drift: the portal still writes
 * project_parties.sms_consent_* directly (PR-x has not retired those writes),
 * and an inbound STOP writes party rows phone-globally. So a record that says
 * `granted` is not proof that nobody in this studio has since refused. Scoped
 * to the owning studio on purpose — phone-globally it would re-open G-3, the
 * bug this whole table exists to fix, because an inbound STOP opts out every
 * party row on the number in every studio.
 */
async function orgHasOptedOutParty(
  supabase: SupabaseClient,
  phone: string,
  org: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("project_parties")
    .select("project_id, sms_consent_status")
    .eq("phone_e164", phone)
    .eq("sms_consent_status", "opted_out");
  if (error) {
    // A refusal we could not read is not a refusal we may assume away.
    console.error("orgHasOptedOutParty: project_parties read failed", error);
    return true;
  }
  const rows = (data ?? []) as Array<{ project_id?: string | null }>;
  const projectIds = [
    ...new Set(rows.map((r) => r.project_id).filter(Boolean)),
  ] as string[];
  if (projectIds.length === 0) return false;
  const { orgs, failed } = await orgsOfProjects(supabase, projectIds);
  // Some of those opted-out seats could not be attributed to a studio. Which
  // studio they belong to is exactly the question, so an unresolved one counts
  // against the send (R-AM).
  if (failed) return true;
  return projectIds.some((id) => orgs.get(id) === org);
}

/** What the studio's own consent record says about this number. */
export type ChannelConsentVerdict = "refuse" | "allow" | "unknown";

/**
 * PRIMARY consent gate (migration 00594). Consent is a fact about a (studio,
 * channel value) pair, held in studio_channel_consent — not a per-party-row
 * ledger. This is read BEFORE reduceConsent() below: the studio that owns the
 * job is the only studio whose verdict may silence this send, and the only one
 * whose grant may authorise it.
 *
 *   · "refuse" — the studio's own record says opted_out; or there is NO record
 *     for that studio AND some party row on this number IN THAT SAME STUDIO
 *     has opted out, which fails closed until the backfill is proven
 *     everywhere (PR-x). That fallback reduces across the studio's own
 *     projects, never across tenants (R-AK): a STOP given to a studio this
 *     send has nothing to do with is not this studio's fact, and treating it
 *     as one silently blocked a studio's very first outreach to a number it
 *     had never contacted. Phone-global survives in exactly one place — when
 *     NO studio can be resolved for the send at all, where there is nothing to
 *     scope to and an unattributable send must not outrun a STOP.
 *   · "allow" — the studio's own record says granted AND no party row in that
 *     same studio on that number says opted_out. This is the half of G-3 the
 *     per-party ledger cannot do: a seat created today for a number the studio
 *     recorded a grant for in 2025 starts `not_asked` on its own row (the
 *     mirror fires on a consent write, never on a party-row insert), and
 *     without this branch the send is refused as not_consented and the studio
 *     has to re-record a consent it already holds (fixture F-11).
 *   · "unknown" — record says not_asked/pending with no refusal standing
 *     behind it, or there is none: the legacy party-row gates below decide.
 *   · "refuse", logged — the owning studio could not be RESOLVED at all (a
 *     failed read, not an absent studio). A failure is not a fact about the
 *     number, and the no-studio branch below would answer this send out of
 *     every tenant's rows, so it refuses instead (R-AM).
 *
 * "allow" lifts only the POSITIVE gates, and it is never taken on a record
 * alone. A record can go stale — the portal still writes party rows directly,
 * and an inbound STOP reaches party rows phone-globally — so the owning
 * studio's own party rows are scanned for a refusal BEFORE `granted` is
 * honoured. Every opted_out path still refuses, whichever ledger carries it.
 *
 * AND `status` IS NOT THE WHOLE VERDICT (r6 M6-3). refusal_unanswered is the
 * stored fact the WRITE door treats as load-bearing — a refusal the person who
 * made it has not answered — and it was invisible to the rail that actually
 * sends. record_channel_reconsent() USED TO move a record opted_out -> pending
 * keeping opt_out_at and the flag, and the mirror then stamped `pending` onto
 * every seat in the studio on that number, removing the party-row backstop
 * below: `status` read alone said "unknown", the seats said "pending", and the
 * opt-in invite went out to a number that had replied STOP, on a 10DLC
 * campaign. That door is evidence-only now and leaves the record at
 * `opted_out` (r7 M7-2) — but the flag is still read here, because an
 * unanswered refusal can stand at ANY status: the first prod fold mints
 * `granted` records for legacy seats whose stale opt-out no later consent
 * answered (r7 M7-1), and the inbound rail writes this table directly. What
 * answers a refusal is the recipient's own YES or START, which that rail
 * writes — lowering the flag and stamping a fresh consented_at; nothing the
 * studio can type reopens this door (00594's RPCs never lower the flag).
 */
async function channelConsentVerdict(
  supabase: SupabaseClient,
  phone: string,
  projectId: string | null,
): Promise<ChannelConsentVerdict> {
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
    return "refuse";
  }

  if (org) {
    const { data: record, error: recordError } = await supabase
      .from("studio_channel_consent")
      .select("status, refusal_unanswered")
      .eq("organization_id", org)
      .eq("channel_kind", "sms")
      .eq("channel_value", phone)
      .maybeSingle();
    if (recordError) {
      console.error(
        "channelConsentVerdict: refusing, the consent record could not be read",
        recordError,
      );
      return "refuse";
    }
    if (record) {
      const row = record as {
        status: string;
        refusal_unanswered?: boolean | null;
      };
      const status = row.status;
      if (status === "opted_out") return "refuse";
      // A refusal the recipient has not answered still stands, whatever the
      // status now says (r6 M6-3). The fold mints `granted` records for legacy
      // seats carrying a stale, unanswered opt-out (r7 M7-1), and reconsent()
      // records the studio's fresh consent while the refusal keeps standing
      // (r7 M7-2). No studio-side write lowers this flag — only the inbound
      // YES/START, written by the rail itself.
      if (row.refusal_unanswered === true) return "refuse";
      // The record is not self-certifying: a refusal recorded on one of this
      // studio's own party rows since the record was written still refuses.
      if (await orgHasOptedOutParty(supabase, phone, org)) return "refuse";
      if (status === "granted") return "allow";
      return "unknown";
    }
  }

  // No record for this studio yet (the backfill has not reached this pair):
  // fail closed on a refusal already on this studio's own books.
  if (org) {
    return (await orgHasOptedOutParty(supabase, phone, org)) ? "refuse" : "unknown";
  }

  // No studio resolves at all — nothing to scope to, so the reduction stays
  // phone-global here and only here.
  const { data: rows } = await supabase
    .from("project_parties")
    .select("sms_consent_status")
    .eq("phone_e164", phone);
  const anyOptedOut = (rows ?? []).some(
    (r) => (r as { sms_consent_status: string }).sms_consent_status === "opted_out",
  );
  return anyOptedOut ? "refuse" : "unknown";
}

async function resolveRecipient(
  supabase: SupabaseClient,
  input: SendPartySmsInput,
): Promise<Recipient> {
  if (input.partyId) {
    const { data: party } = await supabase
      .from("project_parties")
      .select("id, phone_e164, project_id, display_name, sms_consent_status")
      .eq("id", input.partyId)
      .maybeSingle();
    return {
      phone: party?.phone_e164 ?? input.phone ?? null,
      projectId: party?.project_id ?? input.projectId ?? null,
      partyId: input.partyId,
      displayName: party?.display_name ?? null,
      consent: (party?.sms_consent_status as ConsentStatus) ?? "not_asked",
    };
  }
  // Phone-only path: consent is the reduction across all party rows on the phone.
  const phone = input.phone ?? null;
  let consent: ConsentStatus = "not_asked";
  let displayName: string | null = null;
  if (phone) {
    const { data: rows } = await supabase
      .from("project_parties")
      .select("display_name, sms_consent_status")
      .eq("phone_e164", phone);
    if (rows && rows.length > 0) {
      consent = reduceConsent(rows as { sms_consent_status: ConsentStatus }[]);
      displayName = (rows[0] as { display_name: string | null }).display_name ??
        null;
    }
  }
  return {
    phone,
    projectId: input.projectId ?? null,
    partyId: null,
    displayName,
    consent,
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

async function resolveBody(
  supabase: SupabaseClient,
  input: SendPartySmsInput,
  recipient: Recipient,
  clientPortalUrl: string,
): Promise<string | null> {
  if (input.body) return input.body;
  if (!input.templateKey) return null;

  const { data: tmpl } = await supabase
    .from("email_templates")
    .select("html_content, subject_default, is_active")
    .eq("slug", input.templateKey)
    .maybeSingle();
  if (!tmpl || (tmpl as { is_active?: boolean }).is_active === false) {
    return null;
  }
  const raw = (tmpl as { html_content?: string }).html_content?.trim()
    ? String((tmpl as { html_content: string }).html_content)
    : String((tmpl as { subject_default?: string }).subject_default ?? "");
  if (!raw) return null;

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
  if (
    /\{\{\s*link\s*\}\}/.test(raw) && vars.link == null && recipient.partyId
  ) {
    vars.link =
      (await mintFieldLink(supabase, recipient.partyId, clientPortalUrl)) ?? "";
  }

  return interpolate(raw, vars);
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

async function insertOutbound(
  supabase: SupabaseClient,
  row: {
    conversation_id: string | null;
    body: string;
    twilio_sid: string | null;
    twilio_status: string;
    party_id: string | null;
    project_id: string | null;
    template_key: string | null;
    site_request_dispatch_outbox_id: string | null;
  },
): Promise<string | undefined> {
  const { data } = await supabase
    .from("sms_messages")
    .insert({ direction: "outbound", ...row })
    .select("id")
    .single();
  return (data as { id?: string } | null)?.id;
}

// ── The send path ───────────────────────────────────────────────────────────
export async function sendPartySms(
  supabase: SupabaseClient,
  input: SendPartySmsInput,
  deps: SmsDeps = {},
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

  // ── Resolve recipient + consent gate ──────────────────────────────────────
  const recipient = await resolveRecipient(supabase, input);
  if (!recipient.phone) {
    return { sent: false, reason: "no_phone_number" };
  }
  // FIRST: the studio's own consent record for this number (00594).
  const verdict = await channelConsentVerdict(
    supabase,
    recipient.phone,
    recipient.projectId,
  );
  if (verdict === "refuse") {
    return { sent: false, reason: "opted_out" };
  }
  // The studio's own record says granted: that authorises the send even when
  // this party row has not caught up. It never overrides an opt-out.
  const studioGranted = verdict === "allow";
  // SECOND, fail-closed until the backfill is proven everywhere (PR-x): the
  // legacy phone-global reduction across party rows, unchanged.
  if (recipient.consent === "opted_out") {
    return { sent: false, reason: "opted_out" };
  }
  if (!isInvite && !studioGranted && recipient.consent !== "granted") {
    // Only the double-opt-in invite may reach a non-granted party.
    return { sent: false, reason: "not_consented" };
  }
  if (
    isInvite && !studioGranted && recipient.consent !== "pending" &&
    recipient.consent !== "granted"
  ) {
    // The invite is meaningful only for a pending (or already-granted) party.
    return { sent: false, reason: "not_invitable" };
  }
  if (isInvite) {
    if (!input.partyId) {
      return { sent: false, reason: "consent_evidence_required" };
    }
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
      return { sent: false, reason: "consent_evidence_required" };
    }
  }

  // Key the conversation on the physical number sms-inbound keys on — never
  // the MG… Messaging Service SID, which would split the thread. Checked
  // fail-closed BEFORE resolveBody() so a misconfigured conversation number
  // never mints (or revokes) a field-link token for a send that can't be
  // logged.
  const conversationNumber = smsConversationNumber(deps);
  if (!conversationNumber) {
    return { sent: false, reason: "conversation_number_not_configured" };
  }

  // ── Resolve body ──────────────────────────────────────────────────────────
  const body = await resolveBody(supabase, input, recipient, clientPortalUrl);
  if (!body || !body.trim()) {
    return { sent: false, reason: "empty_body" };
  }

  const convId = await findOrCreateConversation(
    supabase,
    conversationNumber,
    recipient.phone,
    recipient.partyId,
    recipient.projectId,
  );
  const auditBody = input.auditBody?.trim() || body;

  // ── Quiet hours → defer (store, do not send) ──────────────────────────────
  if (isQuietHours(now, fieldTz)) {
    if (input.deferToCaller) {
      return {
        sent: false,
        deferred: true,
        reason: "quiet_hours",
        conversationId: convId ?? undefined,
        body: auditBody,
      };
    }
    const messageId = await insertOutbound(supabase, {
      conversation_id: convId,
      body: auditBody,
      twilio_sid: null,
      twilio_status: "deferred",
      party_id: recipient.partyId,
      project_id: recipient.projectId,
      template_key: input.templateKey ?? null,
      site_request_dispatch_outbox_id: input.siteRequestDispatchOutboxId ??
        null,
    });
    return {
      sent: false,
      deferred: true,
      messageId,
      conversationId: convId ?? undefined,
      body,
    };
  }

  // ── Send (dev-mode aware) ─────────────────────────────────────────────────
  let twilioSid: string | null = null;
  let twilioStatus = "queued";
  let sent = false;
  let reason: string | undefined;
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
      }
    }
  }

  const messageId = await insertOutbound(supabase, {
    conversation_id: convId,
    body: auditBody,
    twilio_sid: twilioSid,
    twilio_status: twilioStatus,
    party_id: recipient.partyId,
    project_id: recipient.projectId,
    template_key: input.templateKey ?? null,
    site_request_dispatch_outbox_id: input.siteRequestDispatchOutboxId ?? null,
  });

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
    reason,
    messageId,
    conversationId: convId ?? undefined,
    twilioSid: twilioSid ?? undefined,
    body: auditBody,
  };
}

const DEFERRED_TTL_MS = 24 * 3600 * 1000;

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

  const { data: rows } = await supabase
    .from("sms_messages")
    .select("id, body, conversation_id, party_id, template_key, created_at")
    .eq("direction", "outbound")
    .eq("twilio_status", "deferred");
  if (!rows || rows.length === 0) return { flushed: 0, skipped: 0 };

  let flushed = 0;
  let skipped = 0;
  let suppressed = 0;
  let expired = 0;
  for (
    const row of rows as {
      id: string;
      body: string;
      conversation_id: string;
      party_id: string | null;
      template_key: string | null;
      created_at: string;
    }[]
  ) {
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
      .select("phone_e164")
      .eq("id", row.conversation_id)
      .maybeSingle();
    const phone = (conv as { phone_e164?: string } | null)?.phone_e164;
    if (!phone) {
      skipped++;
      continue;
    }

    // Re-check consent — it may have changed since the row was deferred.
    // FIRST: the studio's own record for this number, resolved through the
    // deferred row's party, exactly as sendPartySms does.
    let deferredProjectId: string | null = null;
    let deferredPartyConsent: ConsentStatus | null = null;
    if (row.party_id) {
      const { data: deferredParty } = await supabase
        .from("project_parties")
        .select("project_id, sms_consent_status")
        .eq("id", row.party_id)
        .maybeSingle();
      const party = deferredParty as
        | { project_id?: string | null; sms_consent_status?: string | null }
        | null;
      deferredProjectId = party?.project_id ?? null;
      // resolveRecipient's partyId branch reads exactly this one row and
      // defaults a missing row to not_asked; the flush must answer the same
      // question the same way.
      deferredPartyConsent =
        (party?.sms_consent_status as ConsentStatus | undefined) ?? "not_asked";
    }
    const verdict = await channelConsentVerdict(
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
    // The studio's own record says granted: that carries the deferred send even
    // when this party row has not caught up (F-11). It never lifts an opt-out.
    const studioGranted = verdict === "allow";

    // SECOND, fail-closed until the backfill is proven everywhere (PR-x): the
    // legacy party-row check — NARROWED to the deferred row's own party, the
    // same narrowing resolveRecipient() applies when a partyId is given
    // (sms.ts resolveRecipient, partyId branch). Reducing across every row on
    // the phone number re-opened G-3 in this path in both directions: an
    // unrelated studio's opted_out row suppressed the owning studio's own
    // granted send, and an unrelated studio's granted row carried a send for a
    // studio that had never obtained consent at all. A studio's fail-closed
    // second check may only read that studio's own books (R-AK). The
    // phone-global reduction survives only where there is no party to narrow
    // to — the same case channelConsentVerdict keeps it for.
    let consent: ConsentStatus;
    if (deferredPartyConsent !== null) {
      consent = deferredPartyConsent;
    } else {
      const { data: partyRows } = await supabase
        .from("project_parties")
        .select("sms_consent_status")
        .eq("phone_e164", phone);
      consent = reduceConsent(
        (partyRows ?? []) as { sms_consent_status: ConsentStatus }[],
      );
    }
    const isInvite = row.template_key === "sms_optin_invite";
    if (consent === "opted_out") {
      await supabase
        .from("sms_messages")
        .update({ twilio_status: "suppressed", error_message: "opted_out" })
        .eq("id", row.id);
      suppressed++;
      continue;
    }
    if (isInvite) {
      // The invite is meaningful only for a pending (or already-granted)
      // party — including the no-party-rows case (reduces to 'not_asked').
      if (!studioGranted && consent !== "pending" && consent !== "granted") {
        await supabase
          .from("sms_messages")
          .update({
            twilio_status: "suppressed",
            error_message: "not_invitable",
          })
          .eq("id", row.id);
        suppressed++;
        continue;
      }
    } else if (!studioGranted && consent !== "granted") {
      await supabase
        .from("sms_messages")
        .update({ twilio_status: "suppressed", error_message: "not_consented" })
        .eq("id", row.id);
      suppressed++;
      continue;
    }

    let twilioSid: string | null = null;
    let twilioStatus = "queued";
    let sendBody = row.body;
    if (mode === "dry_run") {
      twilioStatus = "dry_run";
      twilioSid = "dev-" + crypto.randomUUID();
    } else {
      const to = mode === "redirect" ? redirectNumber : phone;
      if (mode === "redirect") sendBody = `[DEV→${phone}] ${row.body}`;
      if (
        !accountSid || !credentialSid || !credentialSecret || !fromNumber ||
        (mode === "redirect" && !redirectNumber)
      ) {
        // Not configured — leave 'deferred' so the next run retries.
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
          .update({ twilio_status: "failed", error_message: r.error ?? "send_failed" })
          .eq("id", row.id);
        skipped++;
        continue;
      }
      twilioSid = r.sid ?? null;
      twilioStatus = r.status ?? "queued";
    }
    await supabase
      .from("sms_messages")
      .update({
        twilio_status: twilioStatus,
        twilio_sid: twilioSid,
        body: sendBody,
      })
      .eq("id", row.id);
    flushed++;
  }
  return { flushed, skipped, suppressed, expired };
}
