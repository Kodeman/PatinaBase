// Pure request-handling logic for the trade-rfq-send edge function
// (Trade Instrument RFQ rail, migration 00424).
//
// Split out from index.ts so the full request/response contract — auth guard,
// 404-collapse, recipient resolution, preview-vs-send, and the send-time
// stamp — can be tested with dependency injection, without booting Deno.serve
// or touching a real Supabase project (field-login-token / po-send / aesthete-
// ask convention: importing index.ts would boot the server). index.ts wires
// the real Supabase clients + RPCs as TradeRfqSendDeps.
//
// Business flow mirrors quote-request-send: caller auth via the Authorization
// header, load the row (+ its party) via a service-role client, 404-collapse
// on not-found-or-not-owner, resolve the recipient with an explicit-override
// chain, and — 'send' mode only — mint a fresh link token, email through the
// sendCompliantEmail chokepoint, and stamp the sent state. The one structural
// difference: ownership here is "designer-of-scope-project" (any active,
// non-guest comember of the proposal's design studio — public.
// is_design_studio_comember), not a bare designer_id equality check, so the
// ownership predicate is injected as its own deps call rather than compared
// on the loaded row.

import {
  buildTradeRfqEmail,
  type TradeRfqScopeSection,
} from "../_shared/trade-rfq-emails.ts";

// ─── Wire types ──────────────────────────────────────────────────────────────

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

// ─── Payload parsing ─────────────────────────────────────────────────────────

export type TradeRfqSendMode = "preview" | "send";

export interface TradeRfqSendPayload {
  rfqRequestId: string;
  mode: TradeRfqSendMode;
  /** Overrides the party recipient (project_parties.email). */
  recipientEmail?: string;
}

const VALID_MODES: ReadonlySet<string> = new Set(["preview", "send"]);

export type ParseResult =
  | { ok: true; payload: TradeRfqSendPayload }
  | { ok: false; error: string };

/**
 * Validate the request body. Error strings double as the response `error`
 * codes (po-send / quote-request-send idiom): 'invalid_body',
 * 'rfqRequestId_required', 'invalid_mode', 'invalid_recipient'. `mode`
 * defaults to 'send'.
 */
export function parseTradeRfqSendBody(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const b = body as Record<string, unknown>;

  const rfqRequestId =
    typeof b.rfqRequestId === "string" ? b.rfqRequestId.trim() : "";
  if (!rfqRequestId) {
    return { ok: false, error: "rfqRequestId_required" };
  }

  let mode: TradeRfqSendMode = "send";
  if (b.mode !== undefined && b.mode !== null) {
    if (typeof b.mode !== "string" || !VALID_MODES.has(b.mode)) {
      return { ok: false, error: "invalid_mode" };
    }
    mode = b.mode as TradeRfqSendMode;
  }

  let recipientEmail: string | undefined;
  if (b.recipientEmail !== undefined && b.recipientEmail !== null) {
    const candidate =
      typeof b.recipientEmail === "string" ? b.recipientEmail.trim() : "";
    if (!candidate || !candidate.includes("@")) {
      return { ok: false, error: "invalid_recipient" };
    }
    recipientEmail = candidate;
  }

  return { ok: true, payload: { rfqRequestId, mode, recipientEmail } };
}

// ─── Recipient resolution ────────────────────────────────────────────────────

export interface PartyRecipientSource {
  email?: string | null;
}

/**
 * Resolve the party recipient: explicit override → project_parties.email.
 * Blank/whitespace values fall through; returns null when nothing usable
 * remains (never a silent send to an empty address).
 */
export function resolvePartyRecipient(
  party: PartyRecipientSource | null | undefined,
  override?: string | null,
): string | null {
  const overrideEmail = override?.trim();
  if (overrideEmail) return overrideEmail;

  const partyEmail = party?.email?.trim();
  if (partyEmail) return partyEmail;

  return null;
}

// ─── Scope snapshot → room sections ───────────────────────────────────────────

/**
 * scope_snapshot is frozen by prepare_trade_rfq as a jsonb OBJECT (never NULL,
 * CHECK jsonb_typeof = 'object'); the room-by-room prose lives under a
 * `sections` array. Reads defensively — an empty/malformed snapshot yields no
 * sections rather than throwing, since a still-empty draft scope is a real,
 * valid state.
 */
export function extractScopeSections(snapshot: unknown): TradeRfqScopeSection[] {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return [];
  }
  const raw = (snapshot as Record<string, unknown>).sections;
  if (!Array.isArray(raw)) return [];

  const sections: TradeRfqScopeSection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const prose = typeof e.prose === "string" ? e.prose : "";
    if (!prose.trim()) continue;
    const roomNameRaw = e.roomName ?? e.room_name;
    const roomName = typeof roomNameRaw === "string" && roomNameRaw.trim()
      ? roomNameRaw
      : null;
    sections.push({ roomName, prose });
  }
  return sections;
}

// ─── Dependency-injected deps ─────────────────────────────────────────────────

export interface CallerUser {
  id: string;
  email: string | null;
}

export interface TradeRfqRequestRow {
  id: string;
  proposalId: string;
  partyId: string;
  /** The proposal's designer_id — the identity is_design_studio_comember checks. */
  designerId: string;
  /** trade scope document title (proposals.title), for the email + subject. */
  scopeTitle: string;
  partyDisplayName: string | null;
  party: PartyRecipientSource | null;
  message: string | null;
  timeline: string | null;
  scopeSnapshot: unknown;
  status: string;
  sentAt: string | null;
}

export interface DesignerIdentity {
  studioName: string;
  studioLogoUrl?: string;
  designerName: string;
  designerEmail: string | null;
}

export type MintTokenResult = { token: string } | { error: string };

export interface SendEmailResult {
  success: boolean;
  suppressed?: boolean;
  error?: string;
}

export interface StampSentPatch {
  /** The email actually used as the recipient — snapshotted at send. */
  partyEmail: string;
  /** Only set when this is the first successful send (sentAt not already set). */
  sentAt?: string;
}

export interface TradeRfqSendDeps {
  /** Resolve the caller from the request's Authorization header. */
  getCallerUser: (req: Request) => Promise<CallerUser | null>;
  /** Load the RFQ + its proposal (designer_id, title) + its party, by id. */
  loadRequest: (rfqRequestId: string) => Promise<TradeRfqRequestRow | null>;
  /**
   * public.is_design_studio_comember(designerId), evaluated as the CALLER
   * (their Authorization header, not service role) so auth.uid() resolves.
   */
  isDesignStudioComember: (
    req: Request,
    designerId: string,
  ) => Promise<boolean>;
  /** Studio/business identity for the email header + signoff (service role). */
  resolveDesignerIdentity: (designerId: string) => Promise<DesignerIdentity>;
  /** mint_trade_rfq_token(p_rfq_id) via a service-role client. */
  mintToken: (rfqRequestId: string) => Promise<MintTokenResult>;
  /** sendCompliantEmail, pre-bound to category 'operational'. */
  sendEmail: (opts: {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
    metadata: Record<string, unknown>;
  }) => Promise<SendEmailResult>;
  /** Persist the send-time stamp (status='sent' + party_email, + sentAt if unset). */
  stampSent: (
    rfqRequestId: string,
    patch: StampSentPatch,
  ) => Promise<{ error?: string }>;
  /** CLIENT_PORTAL_URL (no trailing slash), default https://client.patina.cloud. */
  clientPortalUrl: string;
  /** Injected clock, so 'first send only' is deterministic under test. */
  now: () => string;
}

// ─── Handler ───────────────────────────────────────────────────────────────

/**
 * Core handler. Contract:
 *   OPTIONS                        → 200 CORS preflight
 *   non-POST                       → 405 { error: 'method_not_allowed' }
 *   invalid body                   → 400 { error: <parse error code> }
 *   no/invalid caller               → 401 { error: 'unauthorized' }
 *   not found OR not a studio comember → 404 { error: 'trade_rfq_not_found' }
 *     (deliberately the SAME code either way — a foreign id must not be
 *     distinguishable from a real one the caller can't reach)
 *   mode 'preview'                 → 200 { ok, mode, rfqRequestId, recipient,
 *                                           subject, html }; no send, no
 *                                           token minted, no stamp
 *   mode 'send', no recipient      → 422 { error: 'no_recipient', detail }
 *   mode 'send', mint fails        → 502 { error: 'mint_failed', detail }
 *   mode 'send', email send fails  → 502 { error: 'send_failed', detail }
 *   mode 'send', stamp write fails → 500 { error: 'stamp_failed', detail }
 *     (the email already went out; the write failure is surfaced rather than
 *     claiming a clean send — po-send / quote-request-send idiom)
 *   mode 'send', ok                → 200 { ok, mode, rfqRequestId, recipient,
 *                                           emailSent, sentAt }
 *     (send-mode responses deliberately omit subject/html — the live link
 *     embeds a real bearer token, so it is never echoed into a JSON response
 *     beyond the one email it was sent in)
 */
export async function handleTradeRfqSend(
  req: Request,
  deps: TradeRfqSendDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }
  const parsed = parseTradeRfqSendBody(rawBody);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }
  const { rfqRequestId, mode, recipientEmail } = parsed.payload;

  const caller = await deps.getCallerUser(req);
  if (!caller) {
    return json({ error: "unauthorized" }, 401);
  }

  const request = await deps.loadRequest(rfqRequestId);
  if (!request) {
    return json({ error: "trade_rfq_not_found" }, 404);
  }

  // Not-found and not-owned (not a comember of the proposal's design studio)
  // collapse to the SAME 404 so the endpoint never confirms a foreign id
  // exists (quote-request-send / po-send idiom).
  const authorized = await deps.isDesignStudioComember(req, request.designerId);
  if (!authorized) {
    return json({ error: "trade_rfq_not_found" }, 404);
  }

  const identity = await deps.resolveDesignerIdentity(request.designerId);
  const recipient = resolvePartyRecipient(request.party, recipientEmail);
  const sections = extractScopeSections(request.scopeSnapshot);
  const partyDisplayName = request.partyDisplayName?.trim() || "there";

  // ── Mode: preview — compose only, no send, no token mint, no stamp ─────────
  if (mode === "preview") {
    // No real token is minted for a preview — that would burn the
    // revoke-then-mint rail (and hand out a live link) just for opening a
    // preview. The CTA renders a clearly non-functional placeholder path.
    const rendered = buildTradeRfqEmail({
      partyDisplayName,
      studioName: identity.studioName,
      studioLogoUrl: identity.studioLogoUrl,
      designerName: identity.designerName,
      designerEmail: identity.designerEmail,
      scopeTitle: request.scopeTitle,
      sections,
      timeline: request.timeline,
      message: request.message,
      ctaUrl: `${deps.clientPortalUrl}/rfq/preview`,
    });
    return json({
      ok: true,
      mode: "preview",
      rfqRequestId: request.id,
      recipient,
      subject: rendered.subject,
      html: rendered.html,
    });
  }

  // ── Mode: send — mint a link token and email the party ─────────────────────
  if (!recipient) {
    console.warn("trade-rfq-send: no recipient email for request", request.id);
    return json(
      {
        error: "no_recipient",
        detail:
          "No party email on file — set the party's email and try again.",
      },
      422,
    );
  }

  const minted = await deps.mintToken(request.id);
  if ("error" in minted) {
    console.error("trade-rfq-send: mint_trade_rfq_token failed", minted.error);
    return json({ error: "mint_failed", detail: minted.error }, 502);
  }

  const rendered = buildTradeRfqEmail({
    partyDisplayName,
    studioName: identity.studioName,
    studioLogoUrl: identity.studioLogoUrl,
    designerName: identity.designerName,
    designerEmail: identity.designerEmail,
    scopeTitle: request.scopeTitle,
    sections,
    timeline: request.timeline,
    message: request.message,
    ctaUrl: `${deps.clientPortalUrl}/rfq/${minted.token}`,
  });

  let sendResult: SendEmailResult;
  try {
    sendResult = await deps.sendEmail({
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      replyTo: identity.designerEmail ?? undefined,
      metadata: { rfq_request_id: request.id, party_id: request.partyId },
    });
  } catch (err) {
    // e.g. RESEND_API_KEY missing and EMAIL_DEV_MODE not set locally.
    const detail = err instanceof Error ? err.message : "unknown send error";
    console.error("trade-rfq-send: send threw", detail);
    return json({ error: "send_failed", detail }, 502);
  }
  if (!sendResult.success && !sendResult.suppressed) {
    console.error("trade-rfq-send: send failed", sendResult.error);
    return json({ error: "send_failed", detail: sendResult.error }, 502);
  }

  const nowIso = deps.now();
  const stamp = await deps.stampSent(request.id, {
    partyEmail: recipient,
    sentAt: request.sentAt ? undefined : nowIso,
  });
  if (stamp.error) {
    // The email already went out; surface the write failure rather than
    // claiming a clean send (the row may still read a stale status).
    console.error("trade-rfq-send: failed to stamp sent state", stamp.error);
    return json({ error: "stamp_failed", detail: stamp.error }, 500);
  }

  return json({
    ok: true,
    mode: "send",
    rfqRequestId: request.id,
    recipient,
    emailSent: sendResult.success === true,
    sentAt: request.sentAt ?? nowIso,
  });
}
