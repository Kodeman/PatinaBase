// Shared trade RFQ (request-for-quote) email template for Supabase Edge
// Functions.
//
// Trade Instrument RFQ rail (migration 00424, trade-rfq-send). HTML builder
// only — delivery goes through the sendCompliantEmail chokepoint
// (./send-email.ts). Visual style is the shared Patina branded email shell
// (./branded-email.ts): color-bar header, Fraunces/Hanken type, mono eyebrow,
// and the standard footer. Modeled structurally on quote-request-emails.ts —
// same shell, same escaping discipline — but this email carries a CTA link
// (the party has no Patina login; the link is a bearer token that opens their
// single form on the client portal) rather than a "reply with your quote"
// prompt.
//
// SECURITY / PRIVACY (load-bearing): this email is read by a subcontractor,
// never the client. It must NEVER carry:
//   - any client name, client contact info, or other client identity
//   - the client price (trade_scope_terms.client_price_cents) or any other
//     party's bid (trade_scope_bids)
// The params interface below deliberately has no field that could carry
// either — there is nothing to redact because there is nothing to accept.

import {
  ctaButton,
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

export interface RenderedTradeRfqEmail {
  subject: string;
  html: string;
}

/** One room's scope, as prose — pulled from trade_rfq_requests.scope_snapshot. */
export interface TradeRfqScopeSection {
  roomName?: string | null;
  prose: string;
}

export interface TradeRfqEmailParams {
  /** The party (subcontractor) being asked — a business/trade name, not a person. */
  partyDisplayName: string;
  /** Studio / business name shown as the requesting party. */
  studioName: string;
  /** Designer's personal name (may equal studioName). */
  designerName: string;
  /** Reply-to address, surfaced in the body so the party knows who to ask. */
  designerEmail?: string | null;
  /** Optional public studio logo URL (Designer Studios), ≤24px in the shell byline. */
  studioLogoUrl?: string;
  /** The trade scope's document title (proposals.title). */
  scopeTitle: string;
  /** Room-by-room prose, frozen onto the RFQ at prepare_trade_rfq time. */
  sections: TradeRfqScopeSection[];
  /** Optional free-text timeline / needed-by. */
  timeline?: string | null;
  /** Optional free-text note from the designer. */
  message?: string | null;
  /** The single-use portal link (CLIENT_PORTAL_URL + '/rfq/' + token). */
  ctaUrl: string;
}

/** A labeled metadata line ("Timeline: …"), escaped; '' when the value is blank. */
function metaLine(label: string, value: string | null | undefined): string {
  const v = value?.trim();
  if (!v) return "";
  return paragraph(`<strong>${escapeHtml(label)}:</strong> ${escapeHtml(v)}`);
}

/** One room's scope as a labeled paragraph; '' when the prose is blank. */
function sectionBlock(section: TradeRfqScopeSection): string {
  const prose = section.prose?.trim();
  if (!prose) return "";
  const label = section.roomName?.trim();
  const body = label
    ? `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(prose)}`
    : escapeHtml(prose);
  return paragraph(body);
}

/**
 * The outbound trade RFQ email to a subcontractor's inbox. Subject names the
 * requesting studio and the scope; the body carries the room-by-room prose
 * (frozen at prepare_trade_rfq time — never the live, still-editable draft),
 * the optional timeline/message, and a CTA to the party's single-use response
 * form. There is no attachment and, by construction, no price of any kind.
 */
export function buildTradeRfqEmail(
  params: TradeRfqEmailParams,
): RenderedTradeRfqEmail {
  const studio = params.studioName.trim() || "a Patina studio";
  const scopeTitle = params.scopeTitle.trim() || "a scope of work";
  const party = params.partyDisplayName.trim() || "there";
  const subject = `${studio} would like your number — ${scopeTitle}`;

  const sectionsBlock = params.sections.map(sectionBlock).join("");
  const timelineLine = metaLine("Timeline", params.timeline);
  const messageBlock = params.message?.trim()
    ? metaLine("Note", params.message)
    : "";

  const askPrompt = params.designerEmail?.trim()
    ? paragraph(
        `Questions before you send your number? Reply to this email or write to <a href="mailto:${escapeHtml(
          params.designerEmail.trim(),
        )}" style="color:#4E7A66; text-decoration:none;">${escapeHtml(
          params.designerEmail.trim(),
        )}</a>.`,
      )
    : "";

  const signoff =
    params.designerName.trim() &&
    params.designerName.trim() !== params.studioName.trim()
      ? `${escapeHtml(params.designerName.trim())}, ${escapeHtml(params.studioName.trim())}`
      : escapeHtml(studio);

  const body =
    paragraph(`Hello ${escapeHtml(party)},`) +
    paragraph(
      `${escapeHtml(studio)} would like your number for <strong>${escapeHtml(scopeTitle)}</strong>.`,
    ) +
    sectionsBlock +
    timelineLine +
    messageBlock +
    spacer(20) +
    ctaButton(params.ctaUrl, "Send your number") +
    spacer() +
    askPrompt +
    muted(`&mdash; ${signoff}`) +
    muted(`Sent via Patina &middot; patina.cloud`);

  // Co-brand the shell with the requesting studio (Designer Studios). The
  // party's counterparty IS the studio, so the byline is appropriate; the
  // logo shows only for a real studio org.
  const html = renderBrandedShell({
    title: subject,
    eyebrow: "Trade scope",
    body,
    studioName: studio,
    studioLogoUrl: params.studioLogoUrl,
  });

  return { subject, html };
}
