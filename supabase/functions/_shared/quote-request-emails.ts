// Shared vendor quote-request (RFQ) email template for Supabase Edge Functions.
//
// Wave 0B (quote-request-send). HTML builder only — delivery goes through the
// sendCompliantEmail chokepoint (./send-email.ts). Visual style is the shared
// Patina branded email shell (./branded-email.ts): color-bar header,
// Fraunces/Hanken type, mono eyebrow, and the standard footer. There is no
// portal CTA button (vendors have no Patina login; the designer's reply-to is
// the channel back) and no PDF attachment.
//
// Unlike the PO email there is no line table: a vendor_quote_requests row
// (00162) carries only free-text scope / timeline / message, so the body is
// those three fields plus who is asking. There is deliberately NO project or
// item context — the schema has none, and the row is already scoped to one
// vendor + one designer, so "only this vendor's content" holds by construction.

import {
  callout,
  muted,
  paragraph,
  renderBrandedShell,
  spacer,
} from "./branded-email.ts";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface RenderedQuoteRequestEmail {
  subject: string;
  html: string;
}

export interface QuoteRequestEmailParams {
  vendorName: string;
  /** Studio / business name shown as the requesting party. */
  studioName: string;
  /** Designer's personal name (may equal studioName). */
  designerName: string;
  /** Reply-to address, surfaced in the body so the vendor knows where the quote goes. */
  designerEmail?: string | null;
  /** Optional scope of work (free text). */
  scope?: string | null;
  /** Optional timeline / needed-by (free text). */
  timeline?: string | null;
  /** The request itself — required, the primary ask. */
  message: string;
  /**
   * Optional public studio logo URL (Designer Studios). Rendered ≤24px in the
   * shell co-brand byline beside the requesting studio. Omit → name-only byline.
   */
  studioLogoUrl?: string;
}

/** A labeled metadata line ("Scope: …"), escaped; '' when the value is blank. */
function metaLine(label: string, value: string | null | undefined): string {
  const v = value?.trim();
  if (!v) return "";
  return paragraph(`<strong>${escapeHtml(label)}:</strong> ${escapeHtml(v)}`);
}

/**
 * The outbound "request a quote" email to the vendor's orders inbox. Subject
 * names the requesting studio; the body carries the optional scope/timeline
 * context, the designer's request as a quoted block, and a reply-to prompt —
 * the vendor replies with their quote by email (there is no Patina portal for
 * them, and no attachment).
 */
export function buildQuoteRequestEmail(
  params: QuoteRequestEmailParams,
): RenderedQuoteRequestEmail {
  const studio = params.studioName.trim() || "a Patina designer";
  const subject = `Quote request from ${studio}`;

  const messageBlock = params.message.trim()
    ? callout(escapeHtml(params.message.trim()))
    : "";

  const scopeLine = metaLine("Scope", params.scope);
  const timelineLine = metaLine("Timeline", params.timeline);

  const replyPrompt = params.designerEmail?.trim()
    ? paragraph(
        `Please reply with your quote and lead time to <a href="mailto:${escapeHtml(
          params.designerEmail.trim(),
        )}" style="color:#4E7A66; text-decoration:none;">${escapeHtml(
          params.designerEmail.trim(),
        )}</a>.`,
      )
    : paragraph(`Please reply to this email with your quote and lead time.`);

  const signoff =
    params.designerName.trim() &&
    params.designerName.trim() !== params.studioName.trim()
      ? `${escapeHtml(params.designerName.trim())}, ${escapeHtml(params.studioName.trim())}`
      : escapeHtml(studio);

  const body =
    paragraph(`Hello ${escapeHtml(params.vendorName)},`) +
    paragraph(`${escapeHtml(studio)} would like to request a quote.`) +
    scopeLine +
    timelineLine +
    messageBlock +
    replyPrompt +
    spacer() +
    muted(`&mdash; ${signoff}`) +
    muted(`Sent via Patina &middot; patina.cloud`);

  // Co-brand the shell with the requesting studio (Designer Studios). As with
  // po-emails, the vendor's counterparty IS the studio (the prose leads with it),
  // so the byline is appropriate; the logo shows only for a real studio org.
  const html = renderBrandedShell({
    title: subject,
    eyebrow: "Quote request",
    body,
    studioName: studio,
    studioLogoUrl: params.studioLogoUrl,
  });

  return { subject, html };
}
