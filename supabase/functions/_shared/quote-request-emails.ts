// Shared vendor quote-request (RFQ) email template for Supabase Edge Functions.
//
// Wave 0B (quote-request-send). HTML builder only — delivery goes through the
// sendCompliantEmail chokepoint (./send-email.ts). Visual style mirrors
// _shared/po-emails.ts: inline styles, Inter stack, Patina ink (#2c2926) on
// white, muted #766a5c metadata, no portal CTA button (vendors have no Patina
// login; the designer's reply-to is the channel back).
//
// Unlike the PO email there is no PDF attachment and no line table: a
// vendor_quote_requests row (00162) carries only free-text scope / timeline /
// message, so the body is those three fields plus who is asking. There is
// deliberately NO project or item context — the schema has none, and the row
// is already scoped to one vendor + one designer, so "only this vendor's
// content" holds by construction.

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
}

/** A labeled metadata line ("Scope: …"), escaped; '' when the value is blank. */
function metaLine(label: string, value: string | null | undefined): string {
  const v = value?.trim();
  if (!v) return "";
  return `<p style="margin:0 0 10px"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(
    v,
  )}</p>`;
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
    ? `<blockquote style="border-left:3px solid #d4c8b0;padding:8px 16px;margin:16px 0;color:#3d3a36">${escapeHtml(
        params.message.trim(),
      )}</blockquote>`
    : "";

  const scopeLine = metaLine("Scope", params.scope);
  const timelineLine = metaLine("Timeline", params.timeline);
  const contextBlock =
    scopeLine || timelineLine
      ? `<div style="margin:12px 0">${scopeLine}${timelineLine}</div>`
      : "";

  const replyPrompt = params.designerEmail?.trim()
    ? `<p style="margin:24px 0 0">Please reply with your quote and lead time to
        <a href="mailto:${escapeHtml(params.designerEmail.trim())}" style="color:#2c2926">${escapeHtml(
          params.designerEmail.trim(),
        )}</a>.</p>`
    : `<p style="margin:24px 0 0">Please reply to this email with your quote and lead time.</p>`;

  const signoff =
    params.designerName.trim() &&
    params.designerName.trim() !== params.studioName.trim()
      ? `${escapeHtml(params.designerName.trim())}, ${escapeHtml(params.studioName.trim())}`
      : escapeHtml(studio);

  const html = `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#2c2926;line-height:1.55">
      <p>Hello ${escapeHtml(params.vendorName)},</p>
      <p>${escapeHtml(studio)} would like to request a quote.</p>
      ${contextBlock}
      ${messageBlock}
      ${replyPrompt}
      <p style="margin-top:32px;color:#766a5c">&mdash; ${signoff}</p>
      <p style="font-size:12px;color:#766a5c">Sent via Patina &middot; patina.cloud</p>
    </div>
  `;

  return { subject, html };
}
