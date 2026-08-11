// sms-inbound/pipeline.ts — the Field Coordination inbound-SMS pipeline (the
// signature-verified core of the sms-inbound webhook). Factored out of index.ts
// so it imports without starting a server (unit-testable with an injected
// supabase + parser).
//
// Pipeline order is LOAD-BEARING (compliance first, LLM last):
//   (c) idempotency: INSERT sms_messages ON CONFLICT (twilio_sid) DO NOTHING —
//       a duplicate MessageSid returns 200 empty TwiML and does nothing
//   (d) COMPLIANCE KEYWORDS before anything else (STOP/START/YES/HELP)
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
import { resolveStudioName } from "../_shared/sms.ts";
import { captureServerEvent } from "../_shared/aesthete-events.ts";

const FIELD_KINDS = ["gc", "sub", "installer", "receiver"];
const STOP_WORDS = ["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"];
const START_WORDS = ["START", "UNSTOP"];
const MENU_TTL_MS = 12 * 3600 * 1000;

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
async function optOutAllForPhone(supabase: SupabaseClient, phone: string, now: string) {
  await supabase
    .from("project_parties")
    .update({ sms_consent_status: "opted_out", sms_opt_out_at: now })
    .eq("phone_e164", phone);
}

async function grantAllForPhone(
  supabase: SupabaseClient,
  phone: string,
  now: string,
  onlyPending: boolean,
) {
  let q = supabase
    .from("project_parties")
    .update({ sms_consent_status: "granted", sms_consented_at: now, sms_opt_out_at: null })
    .eq("phone_e164", phone);
  if (onlyPending) q = q.eq("sms_consent_status", "pending");
  await q;
}

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
  const body = (params.Body ?? "").trim();
  const upper = body.toUpperCase();

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
    await optOutAllForPhone(supabase, from, nowIso);
    await supabase.from("sms_messages")
      .update({ parsed_intent: { path: "keyword", keyword: "stop" } }).eq("id", messageId);
    await captureServerEvent("sms-inbound", "sms_opt_out", { phone: from }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "keyword", intent: "opt_out", confidence_bucket: "n/a", disposition: "opted_out" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    // Twilio Advanced Opt-Out already auto-replied — do NOT reply.
    return { status: 200, twiml: twimlBody(), disposition: "opted_out" };
  }
  if (START_WORDS.includes(upper)) {
    await grantAllForPhone(supabase, from, nowIso, false);
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
      await grantAllForPhone(supabase, from, nowIso, true);
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
  const numMedia = parseInt(params.NumMedia ?? "0", 10) || 0;
  const bestProject = conv.active_project_id ?? (projectIds.length === 1 ? projectIds[0] : null);
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
      await supabase.from("sms_conversations")
        .update({ state: "idle", active_project_id: pick.project_id, party_id: pick.party_id, state_context: {} })
        .eq("id", conv.id);
      await stampMessage(supabase, messageId, pick.party_id, pick.project_id, { path: "menu", disambiguated: true });
      return await reply(supabase, conv.id,
        `Got it — working on ${projectNames[pick.project_id] ?? "that project"}. Text me your update.`,
        pick.party_id, pick.project_id, "project_chosen");
    }
    // Not a valid choice → fall through to fresh parse.
  }

  if (conv.state === "awaiting_confirmation" && (upper === "YES" || upper === "Y" || upper === "OK")) {
    const pending = conv.state_context?.pending_effect as Record<string, unknown> | undefined;
    const partyId = (conv.state_context?.pending_party_id as string | undefined) ?? conv.party_id;
    if (pending && partyId) {
      const applied = await applyEffect(supabase, partyId, pending, messageId);
      await supabase.from("sms_conversations").update({ state: "idle", state_context: {} }).eq("id", conv.id);
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

  // (h) LLM parse against every open item across the phone's parties.
  const candidateItems = await loadCandidateItems(supabase, parties, projectNames);
  const recent = await loadRecentMessages(supabase, conv.id);
  const parsed = await parseFn({
    body,
    openItems: candidateItems.map((c) => ({ id: c.id, kind: c.kind, title: c.title, project_name: c.project_name, due: c.due })),
    recentMessages: recent,
    today: nowIso.slice(0, 10),
    hasMedia: numMedia > 0,
  }, { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });

  const targetItem = parsed.target_ref
    ? candidateItems.find((c) => c.id === parsed.target_ref!.id && c.kind === parsed.target_ref!.kind)
    : undefined;
  const bucket = parsed.confidence >= 0.8 ? "high" : parsed.confidence >= 0.5 ? "mid" : "low";

  // Multi-project ambiguity with no resolved target → project chooser.
  if (!targetItem && projectIds.length > 1 && parsed.intent !== "note" && parsed.intent !== "question") {
    const chooser = projectIds.map((pid, i) => ({
      n: i + 1,
      project_id: pid,
      party_id: parties.find((p) => p.project_id === pid)!.id,
    }));
    await supabase.from("sms_conversations")
      .update({ state: "awaiting_project_choice", state_context: { chooser, pending_body: body } })
      .eq("id", conv.id);
    const list = chooser.map((c) => `${c.n}) ${projectNames[c.project_id] ?? "Project"}`).join(" ");
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "llm", intent: parsed.intent, confidence_bucket: bucket, disposition: "project_chooser" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    return await reply(supabase, conv.id, `Which project? ${list} — reply a number.`, null, null, "project_chooser");
  }

  const effectParty = targetItem?.party_id ?? parties[0].id;
  const effectProject = targetItem?.project_id ?? parties[0].project_id;
  const effect = buildEffect(parsed, media);

  // (i) Confidence gate.
  if (parsed.confidence >= 0.8 && (targetItem || parsed.intent === "punch_report" || parsed.intent === "note")) {
    const applied = await applyEffect(supabase, effectParty, effect, messageId);
    await stampMessage(supabase, messageId, effectParty, effectProject, { path: "llm", ...parsed }, parsed.confidence);
    if (parsed.intent === "flag_blocker") {
      await notifyDesigner(supabase, effectProject, "field_blocker", { message_id: messageId, note: parsed.note });
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
        state_context: { pending_effect: { ...effect, _project_id: effectProject }, pending_party_id: effectParty },
      })
      .eq("id", conv.id);
    await stampMessage(supabase, messageId, effectParty, effectProject, { path: "llm", ...parsed }, parsed.confidence);
    await captureServerEvent("sms-inbound", "sms_parse_outcome",
      { path: "llm", intent: parsed.intent, confidence_bucket: bucket, disposition: "clarify" },
      { getEnv: deps.getEnv, fetchImpl: deps.fetchImpl });
    return await reply(supabase, conv.id, clarifyText(parsed, targetItem), effectParty, effectProject, "clarify");
  }

  // <0.5 or question/unclear → needs_review + designer notify.
  await supabase.from("sms_messages")
    .update({ needs_review: true, confidence: parsed.confidence, parsed_intent: { path: "llm", ...parsed }, party_id: effectParty, project_id: effectProject })
    .eq("id", messageId);
  await notifyDesigner(supabase, effectProject, "field_needs_review", { message_id: messageId, body });
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
): Promise<{ direction: string; body: string }[]> {
  const { data } = await supabase
    .from("sms_messages")
    .select("direction, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(5);
  return ((data ?? []) as Array<{ direction: string; body: string }>)
    .reverse()
    .map((m) => ({ direction: m.direction, body: m.body ?? "" }));
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
