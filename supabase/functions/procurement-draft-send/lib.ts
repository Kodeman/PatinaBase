// procurement-draft-send — the request/response contract, with injected deps
// so the tests run without a network (trade-rfq-send convention: index.ts
// wires the real Supabase clients and boots Deno.serve; this file is pure).

import { escapeHtml } from "../_shared/branded-email.ts";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface CallerUser {
  id: string;
  email: string | null;
}

/** The draft as the CALLER can read it (procurement_drafts is SELECT-only under RLS). */
export interface ProcurementDraft {
  id: string;
  organizationId: string | null;
  projectId: string | null;
  kind: string;
  toEmail: string | null;
  subject: string;
  body: string;
  status: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
  organizationId: string | null;
  draftId: string;
  kind: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
  suppressed?: boolean;
}

export interface ProcurementDraftSendDeps {
  getCallerUser: (req: Request) => Promise<CallerUser | null>;
  /** A user-scoped select: RLS answers co-membership, so an outsider reads null. */
  loadDraftAsCaller: (req: Request, draftId: string) => Promise<ProcurementDraft | null>;
  sendEmail: (input: SendEmailInput) => Promise<SendEmailResult>;
  /** Service role: public.mark_procurement_draft_sent. */
  markSent: (draftId: string, sentBy: string, messageId: string | null) => Promise<{ error?: string }>;
}

export type ParseResult =
  | { ok: true; draftId: string }
  | { ok: false; error: "invalid_body" | "draftId_required" };

export function parseBody(raw: unknown): ParseResult {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid_body" };
  const draftId = (raw as Record<string, unknown>).draftId;
  if (typeof draftId !== "string" || !draftId.trim()) return { ok: false, error: "draftId_required" };
  return { ok: true, draftId: draftId.trim() };
}

/** The reviewed plain-text body as a letter: paragraphs on blank lines, breaks within. */
export function draftBodyHtml(body: string): string {
  const paragraphs = body
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 14px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<div style="font-family:Georgia,serif;font-size:15px;line-height:1.55;color:#2B2620">${paragraphs}</div>`;
}

/**
 * POST { draftId } → sends the draft exactly as stored (the review UI saves an
 * edit through update_procurement_draft first), then marks it sent.
 *
 *   OPTIONS                       → 200 CORS preflight
 *   non-POST                      → 405 method_not_allowed
 *   bad body                      → 400
 *   no caller                     → 401 unauthorized
 *   not readable by the caller    → 404 draft_not_found (never confirms a foreign id)
 *   not awaiting_review           → 409 draft_not_awaiting_review
 *   no recipient                  → 422 no_recipient
 *   recipient suppressed          → 422 recipient_suppressed (not marked sent)
 *   provider failure              → 502 send_failed (not marked sent)
 *   sent, stamp failed            → 500 mark_sent_failed { emailSent: true }
 *   sent                          → 200 { ok, draftId, messageId }
 */
export async function handleProcurementDraftSend(
  req: Request,
  deps: ProcurementDraftSendDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const parsed = parseBody(raw);
  if (!parsed.ok) return json({ error: parsed.error }, 400);

  const caller = await deps.getCallerUser(req);
  if (!caller) return json({ error: "unauthorized" }, 401);

  const draft = await deps.loadDraftAsCaller(req, parsed.draftId);
  if (!draft) return json({ error: "draft_not_found" }, 404);

  if (draft.status !== "awaiting_review") {
    return json({ error: "draft_not_awaiting_review", status: draft.status }, 409);
  }
  const to = draft.toEmail?.trim();
  if (!to) {
    return json(
      { error: "no_recipient", detail: "This draft has no recipient address. Add an email to the contact card and compose it again." },
      422,
    );
  }

  let sent: SendEmailResult;
  try {
    sent = await deps.sendEmail({
      to,
      subject: draft.subject,
      html: draftBodyHtml(draft.body),
      text: draft.body,
      replyTo: caller.email ?? undefined,
      organizationId: draft.organizationId,
      draftId: draft.id,
      kind: draft.kind,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown send error";
    console.error("procurement-draft-send: send threw", detail);
    return json({ error: "send_failed", detail }, 502);
  }
  if (sent.suppressed) {
    return json({ error: "recipient_suppressed", detail: sent.error }, 422);
  }
  if (!sent.success) {
    console.error("procurement-draft-send: send failed", sent.error);
    return json({ error: "send_failed", detail: sent.error }, 502);
  }

  const messageId = sent.id ?? null;
  const marked = await deps.markSent(draft.id, caller.id, messageId);
  if (marked.error) {
    console.error("procurement-draft-send: mark_procurement_draft_sent failed", marked.error);
    return json({ error: "mark_sent_failed", detail: marked.error, emailSent: true }, 500);
  }
  return json({ ok: true, draftId: draft.id, messageId });
}
