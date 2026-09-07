// Pure request-handling logic for the trade-agreement-send edge function
// (Wave 3, P14/R16 — the Trade Agreement, studio ↔ subcontractor).
//
// Split out from index.ts so the full request/response contract — auth guard,
// 404-collapse, recipient resolution, preview-vs-send, and the send-time stamp
// — can be tested with dependency injection, without booting Deno.serve or
// touching a real Supabase project (trade-rfq-send / po-send / field-login-
// token convention: importing index.ts would boot the server). index.ts wires
// the real Supabase clients + RPCs as TradeAgreementSendDeps.
//
// Structurally this is trade-rfq-send's twin, and deliberately so: the two
// rails send a login-less bearer link to the same kind of recipient. The
// differences are the ones the objects actually have —
//   · ownership is "active member of the agreement's studio"
//     (public.is_active_studio_member(studio_id)), not the proposal's designer;
//   · the letter carries the sub's price, because a Trade Agreement states a
//     number where an RFQ asks for one;
//   · the state ratchet has one more terminal value: a 'signed' or 'void'
//     agreement is re-sendable (the sub can lose the email) but its state is
//     never moved back to 'sent'.

import { buildTradeAgreementEmail } from "../_shared/trade-agreement-emails.ts";

// ─── Wire types ──────────────────────────────────────────────────────────────

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ─── Payload parsing ─────────────────────────────────────────────────────────

export type TradeAgreementSendMode = "preview" | "send";

export interface TradeAgreementSendPayload {
  agreementId: string;
  mode: TradeAgreementSendMode;
  /** Overrides the contact recipient (studio_trade_agreements.contact_email). */
  recipientEmail?: string;
}

const VALID_MODES: ReadonlySet<string> = new Set(["preview", "send"]);

export type ParseResult =
  | { ok: true; payload: TradeAgreementSendPayload }
  | { ok: false; error: string };

/**
 * Validate the request body. Error strings double as the response `error`
 * codes (trade-rfq-send / po-send idiom): 'invalid_body',
 * 'agreementId_required', 'invalid_mode', 'invalid_recipient'. `mode` defaults
 * to 'send'.
 */
export function parseTradeAgreementSendBody(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "invalid_body" };
  }
  const b = body as Record<string, unknown>;

  const agreementId = typeof b.agreementId === "string"
    ? b.agreementId.trim()
    : "";
  if (!agreementId) {
    return { ok: false, error: "agreementId_required" };
  }

  let mode: TradeAgreementSendMode = "send";
  if (b.mode !== undefined && b.mode !== null) {
    if (typeof b.mode !== "string" || !VALID_MODES.has(b.mode)) {
      return { ok: false, error: "invalid_mode" };
    }
    mode = b.mode as TradeAgreementSendMode;
  }

  let recipientEmail: string | undefined;
  if (b.recipientEmail !== undefined && b.recipientEmail !== null) {
    const candidate = typeof b.recipientEmail === "string"
      ? b.recipientEmail.trim()
      : "";
    if (!candidate || !candidate.includes("@")) {
      return { ok: false, error: "invalid_recipient" };
    }
    recipientEmail = candidate;
  }

  return { ok: true, payload: { agreementId, mode, recipientEmail } };
}

// ─── Recipient resolution ────────────────────────────────────────────────────

/**
 * Resolve the sub's address: explicit override → the agreement's snapshotted
 * contact_email. Blank/whitespace values fall through; returns null when
 * nothing usable remains (never a silent send to an empty address).
 */
export function resolveContactRecipient(
  contactEmail: string | null | undefined,
  override?: string | null,
): string | null {
  const overrideEmail = override?.trim();
  if (overrideEmail) return overrideEmail;

  const stored = contactEmail?.trim();
  if (stored) return stored;

  return null;
}

// ─── Dependency-injected deps ─────────────────────────────────────────────────

export interface CallerUser {
  id: string;
  email: string | null;
}

/** The agreement's schedule jsonb ({startOn, durationDays, sequencing}). */
export interface TradeAgreementSchedulePayload {
  startOn?: string | null;
  durationDays?: number | null;
  sequencing?: string | null;
}

/**
 * The studio_trade_agreements row this function is allowed to see. It carries
 * the eight essentials and the sub's own price — and, deliberately, no
 * project name, no client identity, no contract sum and no schedule of values
 * (R13). Nothing that is not on this interface can reach the letter.
 */
export interface TradeAgreementRow {
  id: string;
  /** The organization the agreement belongs to — the authorization subject. */
  studioId: string;
  title: string;
  scope: string;
  priceCents: number;
  currency: string;
  schedule: TradeAgreementSchedulePayload | null;
  retainageBps: number;
  payWhenPaidDays: number | null;
  insuranceCertificateRequired: boolean;
  lienWaiverPolicy: string;
  contactId: string | null;
  contactDisplayName: string | null;
  contactEmail: string | null;
  /** The studio member who drafted it — the letter's signer and reply-to. */
  createdBy: string | null;
  state: string;
  sentAt: string | null;
}

export interface StudioIdentity {
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
  contactEmail: string;
  /** Only set when this is the first successful send (sentAt not already set). */
  sentAt?: string;
  /**
   * Only set when the row's current state is 'draft' or 'sent' — a resend of a
   * 'signed' or 'void' agreement never moves it back to 'sent'. Undefined
   * means "leave state alone".
   */
  state?: "sent";
}

export interface TradeAgreementSendDeps {
  /** Resolve the caller from the request's Authorization header. */
  getCallerUser: (req: Request) => Promise<CallerUser | null>;
  /** Load the agreement + its contact snapshot, by id (service role). */
  loadAgreement: (agreementId: string) => Promise<TradeAgreementRow | null>;
  /**
   * public.is_active_studio_member(studioId), evaluated as the CALLER (their
   * Authorization header, not service role) so auth.uid() resolves.
   */
  isActiveStudioMember: (req: Request, studioId: string) => Promise<boolean>;
  /** Studio identity for the email header + signoff (service role). */
  resolveStudioIdentity: (
    studioId: string,
    createdBy: string | null,
  ) => Promise<StudioIdentity>;
  /** mint_trade_agreement_token(p_agreement_id) via a service-role client. */
  mintToken: (agreementId: string) => Promise<MintTokenResult>;
  /** sendCompliantEmail, pre-bound to category 'operational'. */
  sendEmail: (opts: {
    to: string;
    subject: string;
    html: string;
    replyTo?: string;
    metadata: Record<string, unknown>;
  }) => Promise<SendEmailResult>;
  /**
   * Persist the send-time stamp: contact_email always, sentAt if unset, and
   * state='sent' only when patch.state says so (never a downgrade from
   * 'signed'/'void').
   */
  stampSent: (
    agreementId: string,
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
 *   no/invalid caller              → 401 { error: 'unauthorized' }
 *   not found OR not a studio member → 404 { error: 'trade_agreement_not_found' }
 *     (deliberately the SAME code either way — a foreign id must not be
 *     distinguishable from a real one the caller can't reach)
 *   mode 'preview'                 → 200 { ok, mode, agreementId, recipient,
 *                                           subject, html }; no send, no token
 *                                           minted, no stamp
 *   mode 'send', no recipient      → 422 { error: 'no_recipient', detail }
 *   mode 'send', mint fails        → 502 { error: 'mint_failed', detail }
 *   mode 'send', email send fails  → 502 { error: 'send_failed', detail }
 *   mode 'send', stamp write fails → 500 { error: 'stamp_failed', detail }
 *     (the email already went out; the write failure is surfaced rather than
 *     claiming a clean send)
 *   mode 'send', ok                → 200 { ok, mode, agreementId, recipient,
 *                                           emailSent, sentAt, state }
 *     (send-mode responses deliberately omit subject/html — the live link
 *     embeds a real bearer token, so it is never echoed into a JSON response
 *     beyond the one email it was sent in)
 *
 *   Resending a signed agreement: the sub loses the email, asks for it again,
 *   and gets it — a fresh token, the same terms, and the letter reads as a
 *   receipt rather than a second ask. What never happens is a state move: a
 *   'signed' agreement is superseded by a new one, never re-opened, and a
 *   'void' one is not quietly revived by an email.
 */
export async function handleTradeAgreementSend(
  req: Request,
  deps: TradeAgreementSendDeps,
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
  const parsed = parseTradeAgreementSendBody(rawBody);
  if (!parsed.ok) {
    return json({ error: parsed.error }, 400);
  }
  const { agreementId, mode, recipientEmail } = parsed.payload;

  const caller = await deps.getCallerUser(req);
  if (!caller) {
    return json({ error: "unauthorized" }, 401);
  }

  const agreement = await deps.loadAgreement(agreementId);
  if (!agreement) {
    return json({ error: "trade_agreement_not_found" }, 404);
  }

  // Not-found and not-owned (not an active member of the agreement's studio)
  // collapse to the SAME 404 so the endpoint never confirms a foreign id
  // exists (trade-rfq-send / quote-request-send idiom).
  const authorized = await deps.isActiveStudioMember(req, agreement.studioId);
  if (!authorized) {
    return json({ error: "trade_agreement_not_found" }, 404);
  }

  const identity = await deps.resolveStudioIdentity(
    agreement.studioId,
    agreement.createdBy,
  );
  const recipient = resolveContactRecipient(
    agreement.contactEmail,
    recipientEmail,
  );
  const contactDisplayName = agreement.contactDisplayName?.trim() || "there";
  const alreadySigned = agreement.state === "signed";

  const letterFor = (ctaUrl: string) =>
    buildTradeAgreementEmail({
      contactDisplayName,
      studioName: identity.studioName,
      studioLogoUrl: identity.studioLogoUrl,
      designerName: identity.designerName,
      designerEmail: identity.designerEmail,
      agreementTitle: agreement.title,
      scope: agreement.scope,
      priceCents: agreement.priceCents,
      currency: agreement.currency,
      schedule: agreement.schedule,
      retainageBps: agreement.retainageBps,
      payWhenPaidDays: agreement.payWhenPaidDays,
      insuranceCertificateRequired: agreement.insuranceCertificateRequired,
      lienWaiverPolicy: agreement.lienWaiverPolicy,
      ctaUrl,
      alreadySigned,
    });

  // ── Mode: preview — compose only, no send, no token mint, no stamp ─────────
  if (mode === "preview") {
    // No real token is minted for a preview — that would burn the
    // revoke-then-mint rail (and hand out a live link) just for opening a
    // preview. The CTA renders a clearly non-functional placeholder path.
    const rendered = letterFor(`${deps.clientPortalUrl}/trade/preview`);
    return json({
      ok: true,
      mode: "preview",
      agreementId: agreement.id,
      recipient,
      subject: rendered.subject,
      html: rendered.html,
    });
  }

  // ── Mode: send — mint a link token and email the sub ───────────────────────
  if (!recipient) {
    console.warn(
      "trade-agreement-send: no recipient email for agreement",
      agreement.id,
    );
    return json(
      {
        error: "no_recipient",
        detail:
          "No email on file for this contact — add one to the roster and try again.",
      },
      422,
    );
  }

  const minted = await deps.mintToken(agreement.id);
  if ("error" in minted) {
    console.error(
      "trade-agreement-send: mint_trade_agreement_token failed",
      minted.error,
    );
    return json({ error: "mint_failed", detail: minted.error }, 502);
  }

  const rendered = letterFor(`${deps.clientPortalUrl}/trade/${minted.token}`);

  let sendResult: SendEmailResult;
  try {
    sendResult = await deps.sendEmail({
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      replyTo: identity.designerEmail ?? undefined,
      metadata: {
        trade_agreement_id: agreement.id,
        contact_id: agreement.contactId,
      },
    });
  } catch (err) {
    // e.g. RESEND_API_KEY missing and EMAIL_DEV_MODE not set locally.
    const detail = err instanceof Error ? err.message : "unknown send error";
    console.error("trade-agreement-send: send threw", detail);
    return json({ error: "send_failed", detail }, 502);
  }
  if (!sendResult.success && !sendResult.suppressed) {
    console.error("trade-agreement-send: send failed", sendResult.error);
    return json({ error: "send_failed", detail: sendResult.error }, 502);
  }

  const nowIso = deps.now();
  // State is a one-way ratchet: a resend of a 'signed' or 'void' agreement
  // must not flip it back to 'sent' and erase that the sub already signed (or
  // that the studio withdrew it).
  const stampState = agreement.state === "draft" || agreement.state === "sent"
    ? "sent" as const
    : undefined;
  const stamp = await deps.stampSent(agreement.id, {
    contactEmail: recipient,
    sentAt: agreement.sentAt ? undefined : nowIso,
    state: stampState,
  });
  if (stamp.error) {
    // The email already went out; surface the write failure rather than
    // claiming a clean send (the row may still read a stale state).
    console.error(
      "trade-agreement-send: failed to stamp sent state",
      stamp.error,
    );
    return json({ error: "stamp_failed", detail: stamp.error }, 500);
  }

  return json({
    ok: true,
    mode: "send",
    agreementId: agreement.id,
    recipient,
    emailSent: sendResult.success === true,
    sentAt: agreement.sentAt ?? nowIso,
    state: stampState ?? agreement.state,
  });
}
