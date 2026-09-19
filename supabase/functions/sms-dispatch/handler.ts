// sms-dispatch/handler.ts — the request-handling core of the SMS dispatch
// function. Split out of index.ts (mirroring sms-status's index.ts/handler.ts
// and sms-inbound's index.ts/pipeline.ts) so it imports without starting a
// server and unit-tests with an injected supabase (_tests/fake-supabase.ts)
// instead of a live stack. index.ts now only wires the service-role client.
//
// Two paths, unchanged in shape:
//   · a `partyId` job — the Field Coordination path (00284). Everything it
//     decides lives in _shared/sms.ts's sendPartySms: suppression, consent, the
//     phase gate, quiet hours, the send claim, the provider call, the log row.
//     This file adds authorization and turns the one-word result into an HTTP
//     status.
//   · a `userId` job — the platform notification path (profiles.sms_opt_in +
//     notification_preferences), with its own notification_log lifecycle and
//     retry. Moved here verbatim.
//
// THE PARTY PATH ANSWERS WITH A STATUS CODE THAT MEANS SOMETHING (contract S5).
// It used to answer 200 to everything — a refused send, a deferred one, a
// provider outage and a delivered text were one response with a boolean in it,
// so a caller could not retry the retryable without retrying the refused, and a
// trigger's "did it go?" had no answer but `success`. Now:
//   200 — it is gone (a terminal provider status, or a dev dry run).
//   202 — accepted, not delivered: the provider queued it, it is deferred to
//         the send window, or another writer already holds this logical send.
//   400 — the job cannot be acted on (no number, nothing to say).
//   422 — a gate refused it: consent, the studio's own rule, or suppression.
//         Retrying changes nothing; the recipient has to change it.
//   500 — this rail is misconfigured or could not write its own record.
//   502 — the provider said no. `provider_code` is Twilio's own code.
//   503 — a dependency is not provisioned, or the phase is not live yet.
// The response BODY keeps its old shape ({ success, ...result }) so existing
// callers keep reading `success`/`reason`; `status`, `dueAt` and
// `provider_code` are additive.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderTemplateFromDb } from "../_shared/render-template.ts";
import {
  isUniqueViolation,
  type SendPartySmsResult,
  sendPartySms as realSendPartySms,
  smsConversationNumber,
} from "../_shared/sms.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export interface SmsJob {
  // Recipient resolution: a userId — consent + phone are looked up
  // server-side from profiles/notification_preferences. There is no raw
  // `to`-number path; an explicit phone with no consent record to check is
  // not a supportable send.
  userId?: string;

  // Field Coordination party path (00284): a project_parties id. Delegates to
  // the shared sendPartySms (party consent gate, conversation/message logging,
  // dev-mode, quiet hours). templateKey/projectId/vars ride alongside.
  partyId?: string;
  templateKey?: string;
  projectId?: string;

  // Content: either a ready-to-send `body`, or a templateId + vars that the
  // shared renderer interpolates. Template text comes from the email template's
  // subject/plain content; SMS strips HTML to a single line.
  body?: string;
  templateId?: string;
  vars?: Record<string, unknown>;

  /**
   * The `Ref NN` short code this text belongs to (contract S1/S2), rendered
   * into the template as `{{code}}`. A consent challenge is a prompt in the
   * same code space as every other one — "Reply YES 42" — so a caller that
   * already created the prompt passes its code here and it is used unchanged.
   * An sms_optin_invite job that carries none has one allocated for it: see
   * ensureOptinCode below. 00284's trigger sends no code, and the invite copy
   * renders `{{code}}` empty, so without this the recipient would be told to
   * "Reply YES  to confirm" — a question with no way to answer it.
   */
  code?: string;

  /**
   * The caller's name for the LOGICAL send (contract S5). Two writers racing
   * over one fact name the same key and only one of them texts.
   */
  dedupeKey?: string;

  /** The Field Line phase this automation belongs to (contract S7). */
  automationPhase?: number;

  // Optional classification used for the notification_log row.
  type?: string;
}

export interface SmsDispatchDeps {
  supabase: SupabaseClient;
  /** Injectable env reader (defaults to Deno.env.get). */
  getEnv?: (key: string) => string | undefined;
  /** Injectable fetch (Twilio, on the userId path; defaults to global fetch). */
  fetchImpl?: typeof fetch;
  /** Injectable clock, so the quiet-hours gate is testable off a wall clock. */
  now?: Date;
  /**
   * Injectable send path, so the HTTP contract can be tested without standing
   * up every gate behind it. Defaults to the real _shared/sms.ts sendPartySms.
   */
  sendPartySms?: typeof realSendPartySms;
  /** Injectable backoff, so a retry test does not sleep for three seconds. */
  sleep?: (ms: number) => Promise<void>;
}

const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;

/** The double-opt-in invite: the one template that allocates its own code. */
const OPTIN_TEMPLATE = "sms_optin_invite";
/** Matches sms_prompts.expires_at's own default (00639). */
const PROMPT_TTL_MS = 7 * 24 * 3600 * 1000;

/** A gate refused it. The recipient, not the caller, is what changes this. */
const REFUSED_422 = new Set([
  "opted_out",
  "not_consented",
  "suppressed",
  "contact_rule_forbids_sms",
  "consent_evidence_required",
]);
/** The job itself cannot be acted on. */
const BAD_REQUEST_400 = new Set(["no_phone_number", "empty_body"]);
/** A dependency is not provisioned, or this automation is not live yet. */
const UNAVAILABLE_503 = new Set([
  "twilio_not_configured",
  "field_line_phase_off",
  "suppression_unreadable",
]);
/** This rail is misconfigured, or could not write its own record. */
const INTERNAL_500 = new Set([
  "conversation_number_not_configured",
  "send_not_claimable",
  "defer_requires_recipe",
  // The deferred row did not land. 202 would promise a text that is not stored
  // anywhere and that no flush will ever read (contract S5).
  "defer_failed",
  // The provider accepted it and the id could not be recorded, so nothing can
  // settle it: a human, not a retry, is what this needs.
  "sid_unrecorded",
]);

export function partyHttpStatus(result: SendPartySmsResult): number {
  const status = result.status ?? (result.sent ? "sent" : "failed");
  if (status === "sent") return 200;
  if (status === "queued" || status === "deferred") return 202;
  const reason = result.reason ?? "";
  if (REFUSED_422.has(reason)) return 422;
  if (BAD_REQUEST_400.has(reason)) return 400;
  if (UNAVAILABLE_503.has(reason)) return 503;
  if (INTERNAL_500.has(reason)) return 500;
  // Everything left is the provider's own refusal, carrying its code.
  return 502;
}

/** The last ten digits of a number, for comparing a stored (normalized by
 *  public.normalize_channel_value) value with one we hold in E.164. */
function lastTen(phone: string | null | undefined): string {
  return String(phone ?? "").replace(/\D/g, "").slice(-10);
}

/**
 * The invite's `Ref NN`, allocated here when the caller did not bring one.
 *
 * public.sms_create_prompt (00639) is the ONLY allocation door — it takes the
 * per-handset advisory lock, reads the tombstones and inserts the prompt in one
 * transaction, so two issuers on one handset cannot both think they hold the
 * same code. sms_next_short_code is never called from here (contract S1).
 *
 * IDEMPOTENT ON RETRY. 00284's trigger fires from a row write and the cron runs
 * behind it; allocating per call would burn a fresh code — and change the
 * question the recipient was asked — every time one of them retried. An OPEN
 * optin prompt for the same party on the same project is reused instead. The
 * stored sender/recipient are normalized by the RPC and we hold raw E.164, so
 * the reuse is keyed on (party, project, kind, open) in the query and then
 * CHECKED against the recipient's own digits rather than re-implementing the
 * database's normalization here.
 */
async function ensureOptinCode(
  supabase: SupabaseClient,
  job: SmsJob,
  deps: SmsDispatchDeps,
): Promise<{ code?: string; error?: string }> {
  if (job.code) return { code: job.code };
  const now = deps.now ?? new Date();

  const { data: party } = await supabase
    .from("project_parties")
    .select("project_id, phone_e164")
    .eq("id", job.partyId!)
    .maybeSingle();
  const seat = party as
    | { project_id?: string | null; phone_e164?: string | null }
    | null;
  const projectId = job.projectId ?? seat?.project_id ?? null;
  const recipient = seat?.phone_e164 ?? null;
  const sender = smsConversationNumber({ getEnv: deps.getEnv }) ?? null;
  if (!projectId || !recipient || !sender) {
    console.error("ensureOptinCode: cannot allocate a prompt code", {
      partyId: job.partyId,
      hasProject: !!projectId,
      hasRecipient: !!recipient,
      hasSender: !!sender,
    });
    return { error: "prompt_code_unavailable" };
  }

  // READ, THEN ALLOCATE — AND READ AGAIN IF SOMEONE ELSE GOT THERE FIRST
  // (SQ-43 R6). The read and the allocation are two round trips, so two
  // re-invites for one party (the 00284 trigger and the cron behind it) can
  // both see no open prompt, both compute the same next generation, and race
  // into sms_prompts_open_optin_uniq. The loser's 23505 is not a failure: it
  // means the prompt it wanted now EXISTS, written by the winner a moment ago.
  // Re-reading finds it and the second invite carries the same code — which is
  // the whole point of reuse, since the recipient must be asked one question
  // with one answer. Bounded at two retries; past that something other than a
  // race is wrong and 503 is the honest answer.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: open, error: openError } = await supabase
      .from("sms_prompts")
      .select("short_code, recipient_phone")
      .eq("party_id", job.partyId!)
      .eq("project_id", projectId)
      .eq("kind", "optin")
      .is("answered_at", null)
      // A WITHDRAWN CHALLENGE IS NOT A QUESTION TO REPRINT (SQ-101, 00646).
      // 00644's void trigger stamps voided_at and nothing else — expires_at is
      // immutable under sms_prompts_guard_binding — so a withdrawn row still
      // looks unanswered and unexpired here. Its own comment reasoned that a
      // voided row is always a stale-phone row this reader already passes over
      // on the digits; correct-then-REVERT breaks that: the void happens on the
      // way out (phone A -> B), and on the way back (B -> A) the trigger skips
      // the row it already voided, leaving a withdrawn challenge whose
      // recipient_phone matches the seat again. Reusing its short_code prints a
      // code 00646's sms_resolve_prompt and sms_grant_optin_prompt now refuse,
      // so the person is asked a question nobody can answer until the TTL runs
      // out. Skipping it falls through to the allocation below, which takes the
      // next generation and asks a fresh, answerable one.
      .is("voided_at", null)
      .gt("expires_at", now.toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openError) {
      console.error("ensureOptinCode: the open-prompt read failed", openError);
      return { error: "prompt_code_unavailable" };
    }
    const existing = open as
      | { short_code?: string; recipient_phone?: string | null }
      | null;
    if (
      existing?.short_code &&
      lastTen(existing.recipient_phone) === lastTen(recipient)
    ) {
      return { code: String(existing.short_code) };
    }

    // THE NEXT VERSION, NOT VERSION 1 (SQ-37 R6). sms_prompts_open_optin_uniq
    // is UNIQUE (party_id, version) WHERE kind = 'optin' AND answered_at IS
    // NULL and expiry is NOT in that predicate, so an UNANSWERED challenge that
    // has simply run out still occupies version 1 forever. The query above
    // deliberately ignores expired prompts — that is what makes a day-eight
    // re-invite a new ask — and allocating version 1 for it then died on 23505,
    // which is the one outcome where the recipient never hears from us again.
    // The generation is read across the party's optin prompts in every state,
    // exactly the scope the index keys on.
    const { data: latest, error: versionError } = await supabase
      .from("sms_prompts")
      .select("version")
      .eq("party_id", job.partyId!)
      .eq("kind", "optin")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError) {
      console.error(
        "ensureOptinCode: the prompt generation read failed",
        versionError,
      );
      return { error: "prompt_code_unavailable" };
    }
    const priorVersion = Number(
      (latest as { version?: unknown } | null)?.version ?? 0,
    );
    const nextVersion = (Number.isFinite(priorVersion) ? priorVersion : 0) + 1;

    const { data, error } = await supabase.rpc("sms_create_prompt", {
      p_party_id: job.partyId,
      p_project_id: projectId,
      p_kind: "optin",
      p_subject_id: job.partyId,
      p_version: nextVersion,
      p_expires_at: new Date(now.getTime() + PROMPT_TTL_MS).toISOString(),
      p_sender_number: sender,
      p_recipient_phone: recipient,
    });
    if (error) {
      if (isUniqueViolation(error)) {
        // Another issuer holds this generation. Go round: the open-prompt read
        // at the top of the loop is what picks up the code they allocated.
        continue;
      }
      console.error("ensureOptinCode: sms_create_prompt failed", error);
      return { error: "prompt_code_unavailable" };
    }
    // RETURNS TABLE → an array of { id, short_code }.
    const code = Array.isArray(data)
      ? (data[0] as { short_code?: string } | undefined)?.short_code
      : (data as { short_code?: string } | null)?.short_code;
    if (!code) {
      console.error("ensureOptinCode: sms_create_prompt returned no code");
      return { error: "prompt_code_unavailable" };
    }
    return { code: String(code) };
  }

  console.error(
    "ensureOptinCode: the prompt allocation lost its race three times over",
    { partyId: job.partyId, projectId },
  );
  return { error: "prompt_code_unavailable" };
}

export async function handleSmsDispatch(
  req: Request,
  deps: SmsDispatchDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = deps.supabase;
  const getEnv = deps.getEnv ?? ((k: string) => Deno.env.get(k));
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ??
    ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  const accountSid = getEnv("TWILIO_ACCOUNT_SID");
  const authToken = getEnv("TWILIO_AUTH_TOKEN");
  const apiKeySid = getEnv("TWILIO_API_KEY_SID");
  const apiKeySecret = getEnv("TWILIO_API_KEY_SECRET");
  const fromNumber = getEnv("TWILIO_FROM_NUMBER");
  const statusCallbackUrl = getEnv("SMS_STATUS_CALLBACK_URL");
  const credentialSid = apiKeySid && apiKeySecret ? apiKeySid : accountSid;
  const credentialSecret = apiKeySid && apiKeySecret ? apiKeySecret : authToken;

  try {
    const job: SmsJob = await req.json();
    const type = job.type || "sms-notification";

    // ── Field Coordination party path (00284) ────────────────────────────
    // A partyId job delegates entirely to the shared sendPartySms. Internal
    // callers (triggers/cron via the service-role JWT) bypass authorization;
    // a USER JWT (Track D's "Send text" composer) must be on the party's
    // project team. The party-consent gate lives inside sendPartySms.
    if (job.partyId) {
      return await handlePartySms(req, job, deps);
    }

    if (!job.userId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: userId or partyId" }),
        { status: 400, headers: jsonHeaders },
      );
    }
    if (!job.body && !job.templateId) {
      return new Response(
        JSON.stringify({ error: "Missing required field: body or templateId" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // ── Resolve recipient + enforce consent ──────────────────────────────
    let toNumber: string | undefined;
    let displayName: string | null = null;

    {
      const { data: profile } = await supabase
        .from("profiles")
        .select("phone, sms_opt_in, display_name")
        .eq("id", job.userId)
        .single();

      if (!profile) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: jsonHeaders },
        );
      }

      displayName =
        (profile as { display_name?: string | null }).display_name ?? null;

      // Consent gate 1: per-profile SMS opt-in.
      if (!(profile as { sms_opt_in?: boolean }).sms_opt_in) {
        await logSms(supabase, job.userId, type, "suppressed", {
          reason: "sms_opt_out",
        });
        return new Response(
          JSON.stringify({ success: false, reason: "sms_opt_out" }),
          // 422: a gate refused it, and no retry changes that (contract S5).
          { status: 422, headers: jsonHeaders },
        );
      }

      // Consent gate 2: notification_preferences SMS channel toggle.
      const { data: prefs } = await supabase
        .from("notification_preferences")
        .select("channels_sms")
        .eq("user_id", job.userId)
        .single();

      if (prefs && (prefs as { channels_sms?: boolean }).channels_sms === false) {
        await logSms(supabase, job.userId, type, "suppressed", {
          reason: "channels_sms_disabled",
        });
        return new Response(
          JSON.stringify({ success: false, reason: "channels_sms_disabled" }),
          { status: 422, headers: jsonHeaders },
        );
      }

      toNumber = (profile as { phone?: string | null }).phone ?? undefined;
    }

    if (!toNumber) {
      await logSms(supabase, job.userId ?? null, type, "failed", {
        reason: "no_phone_number",
      });
      return new Response(
        JSON.stringify({ success: false, reason: "no_phone_number" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // ── Resolve message body ─────────────────────────────────────────────
    let body = job.body;
    if (!body && job.templateId) {
      const enrichedVars = {
        ...(job.vars || {}),
        ...(job.code ? { code: job.code } : {}),
        displayName,
        displayNameComma: displayName ? `, ${displayName}` : "",
      };
      const rendered = await renderTemplateFromDb(
        supabase,
        job.templateId,
        enrichedVars,
      );
      // SMS is plain text: prefer subject, else strip HTML from the body.
      body = rendered?.subject || htmlToText(rendered?.html || "");
    }

    if (!body || !body.trim()) {
      await logSms(supabase, job.userId ?? null, type, "failed", {
        reason: "empty_body",
      });
      return new Response(
        JSON.stringify({ success: false, reason: "empty_body" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // ── Creds gate: Twilio must be configured ────────────────────────────
    if (!accountSid || !credentialSid || !credentialSecret || !fromNumber) {
      await logSms(supabase, job.userId ?? null, type, "failed", {
        reason: "twilio_not_configured",
      });
      return new Response(
        JSON.stringify({
          success: false,
          reason: "twilio_not_configured",
          message:
            "SMS sending is not configured. Set TWILIO_ACCOUNT_SID, " +
            "TWILIO_FROM_NUMBER and either a restricted API key or TWILIO_AUTH_TOKEN.",
        }),
        // 503: the plumbing is sound, the dependency just isn't provisioned.
        { status: 503, headers: jsonHeaders },
      );
    }

    // ── Create queued log entry ──────────────────────────────────────────
    const { data: logEntry } = await supabase
      .from("notification_log")
      .insert({
        user_id: job.userId ?? null,
        type,
        channel: "sms",
        status: "queued",
        template_id: job.templateId ?? null,
        metadata: { to: toNumber, ...(job.vars || {}) },
      })
      .select("id")
      .single();

    const logId = (logEntry as { id?: string } | null)?.id;

    // ── Send with retry ──────────────────────────────────────────────────
    let lastError = "";
    let lastCode: string | undefined;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        await updateLog(supabase, logId, "sending");

        const result = await sendSmsViaTwilio(
          {
            accountSid,
            credentialSid,
            credentialSecret,
            fromNumber,
            statusCallbackUrl,
          },
          { to: toNumber, body },
          fetchImpl,
        );

        if (result.success) {
          // Twilio ACCEPTED the send — not proof of delivery. Stay 'sending'
          // (provider_id links this row to the sms-status webhook, which
          // flips it to 'delivered'/'failed' when the real callback arrives).
          await updateLog(supabase, logId, "sending", undefined, result.id);
          return new Response(
            JSON.stringify({
              success: true,
              status: "queued",
              notification_id: logId,
              provider_id: result.id,
            }),
            // 202: accepted by the provider, not yet delivered (contract S5).
            { status: 202, headers: jsonHeaders },
          );
        }

        lastError = result.error || "Unknown error";
        lastCode = result.code;
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Send failed";
      }

      if (logId) {
        await supabase
          .from("notification_log")
          .update({ retry_count: attempt + 1 })
          .eq("id", logId);
      }

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_BASE_DELAY_MS * Math.pow(2, attempt));
      }
    }

    await updateLog(supabase, logId, "failed", lastError);
    return new Response(
      JSON.stringify({
        success: false,
        error: lastError,
        ...(lastCode ? { provider_code: lastCode } : {}),
      }),
      // 502: the provider said no, three times (contract S5).
      { status: 502, headers: jsonHeaders },
    );
  } catch (error) {
    console.error("Error in sms-dispatch:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: jsonHeaders },
    );
  }
}

// ─── Field Coordination party path helpers (00284) ────────────────────────

/** Decode (without verifying — the platform's verify_jwt already did) the role
 * + sub from a Bearer token, to tell an internal service-role call from a user. */
function decodeBearerClaims(
  authHeader: string | null,
): { role?: string; sub?: string } | null {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const parts = authHeader.slice(7).split(".");
  if (parts.length !== 3) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

/** Is `userId` on `projectId`'s team (owning designer or an active member)? */
async function isProjectTeamMember(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<boolean> {
  const { data: proj } = await supabase
    .from("projects")
    .select("designer_id")
    .eq("id", projectId)
    .maybeSingle();
  if ((proj as { designer_id?: string } | null)?.designer_id === userId) {
    return true;
  }
  const { data: tm } = await supabase
    .from("project_team_members")
    .select("id")
    .eq("project_id", projectId)
    .eq("user_id", userId)
    .is("removed_at", null)
    .limit(1)
    .maybeSingle();
  return !!tm;
}

async function handlePartySms(
  req: Request,
  job: SmsJob,
  deps: SmsDispatchDeps,
): Promise<Response> {
  const supabase = deps.supabase;
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };
  const claims = decodeBearerClaims(req.headers.get("Authorization"));
  const isInternal = claims?.role === "service_role";

  // A user JWT must be on the party's project team before we send on its behalf.
  if (!isInternal) {
    const sub = claims?.sub;
    if (!sub) {
      return new Response(JSON.stringify({ error: "unauthenticated" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const { data: party } = await supabase
      .from("project_parties")
      .select("project_id")
      .eq("id", job.partyId!)
      .maybeSingle();
    const projectId = (party as { project_id?: string } | null)?.project_id;
    if (!projectId) {
      return new Response(JSON.stringify({ error: "party_not_found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }
    if (!(await isProjectTeamMember(supabase, projectId, sub))) {
      return new Response(JSON.stringify({ error: "not_authorized" }), {
        status: 403,
        headers: jsonHeaders,
      });
    }
  }

  // The invite is the one template that cannot go out without its code: the
  // copy asks the recipient to "Reply YES {{code}}", and an empty code is a
  // question with no way to answer it. So it is allocated before the send and
  // a failure to allocate REFUSES rather than shipping the broken sentence.
  let code = job.code;
  if (job.templateKey === OPTIN_TEMPLATE && job.partyId) {
    const allocated = await ensureOptinCode(supabase, job, deps);
    if (allocated.error) {
      return new Response(
        JSON.stringify({
          success: false,
          status: "failed",
          reason: allocated.error,
        }),
        // 503: the prompt rail is a dependency that did not answer. The same
        // job retried once it does is the right next move.
        { status: 503, headers: jsonHeaders },
      );
    }
    code = allocated.code;
  }

  const send = deps.sendPartySms ?? realSendPartySms;
  const result = await send(supabase, {
    partyId: job.partyId,
    projectId: job.projectId,
    body: job.body,
    templateKey: job.templateKey,
    // The prompt's own `Ref NN` reaches the copy as {{code}} (contract S1/S2).
    vars: {
      ...(job.vars ?? {}),
      ...(code ? { code } : {}),
    },
    dedupeKey: job.dedupeKey,
    automationPhase: job.automationPhase,
  }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl, now: deps.now });

  return new Response(JSON.stringify({ success: result.sent, ...result }), {
    status: partyHttpStatus(result),
    headers: jsonHeaders,
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────

interface SendResult {
  success: boolean;
  id?: string;
  error?: string;
  /** Twilio's own error code, for the 502 body (contract S5). */
  code?: string;
}

/**
 * Send an SMS via the Twilio Messages REST API using a direct fetch (no SDK,
 * to keep the edge function lightweight). Auth is HTTP Basic with the account
 * restricted API key (or account-token fallback); the payload is form encoded.
 */
async function sendSmsViaTwilio(
  creds: {
    accountSid: string;
    credentialSid: string;
    credentialSecret: string;
    fromNumber: string;
    statusCallbackUrl?: string;
  },
  params: { to: string; body: string },
  fetchImpl: typeof fetch,
): Promise<SendResult> {
  const url =
    `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`;
  const form = new URLSearchParams();
  form.set("To", params.to);
  form.set(
    creds.fromNumber.startsWith("MG") ? "MessagingServiceSid" : "From",
    creds.fromNumber,
  );
  form.set("Body", params.body);
  if (creds.statusCallbackUrl) {
    form.set("StatusCallback", creds.statusCallbackUrl);
  }

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${
        btoa(`${creds.credentialSid}:${creds.credentialSecret}`)
      }`,
    },
    body: form.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    return {
      success: false,
      error: `Twilio API error (${response.status}): ${errorText}`,
      code: twilioErrorCode(errorText, response.status),
    };
  }

  const data = await response.json();
  // Twilio returns `sid` as the message identifier.
  return { success: true, id: data.sid };
}

/** Twilio's own error code out of its JSON error body (e.g. 21610, 30034). */
function twilioErrorCode(body: string, httpStatus: number): string {
  try {
    const parsed = JSON.parse(body) as { code?: unknown };
    const code = parsed?.code;
    if (typeof code === "number" || (typeof code === "string" && code)) {
      return String(code);
    }
  } catch {
    // Not JSON — the status is the only code there is.
  }
  return `http_${httpStatus}`;
}

async function updateLog(
  supabase: SupabaseClient,
  logId: string | undefined,
  status: string,
  error?: string,
  providerId?: string,
) {
  if (!logId) return;

  const update: Record<string, unknown> = { status };
  if (error) update.error = error;
  if (providerId) update.provider_id = providerId;
  if (status === "delivered") update.sent_at = new Date().toISOString();

  await supabase.from("notification_log").update(update).eq("id", logId);
}

/**
 * One-shot insert for terminal states reached before a queued row exists
 * (suppressed / pre-send failures). Mirrors the suppressed-log pattern in
 * notification-dispatch.
 */
async function logSms(
  supabase: SupabaseClient,
  userId: string | null,
  type: string,
  status: string,
  metadata: Record<string, unknown>,
) {
  // notification_log.user_id is NOT NULL — only log when we have a user.
  if (!userId) return;
  await supabase.from("notification_log").insert({
    user_id: userId,
    type,
    channel: "sms",
    status,
    metadata,
  });
}

/** Collapse HTML to a single line of plain text for SMS bodies. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
