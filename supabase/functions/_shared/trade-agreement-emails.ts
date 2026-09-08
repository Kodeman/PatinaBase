// Shared Trade Agreement email template for Supabase Edge Functions.
//
// Wave 3 of "The Agreement, Composed" (P14, R16 — studio ↔ subcontractor,
// signed on a token link with no login). HTML builder only; delivery goes
// through the sendCompliantEmail chokepoint (./send-email.ts). Visual style is
// the shared Patina branded email shell (./branded-email.ts).
//
// This is a NEW sibling of ./trade-rfq-emails.ts, deliberately not an edit of
// it: that module is imported by trade-rfq-send, and editing it would drag a
// second function into this wave's redeploy set. The two emails also say
// different things — an RFQ asks for a number and must carry none, a Trade
// Agreement states the number the studio has agreed to pay THIS sub and asks
// them to sign it.
//
// SECURITY / PRIVACY (load-bearing, R13): this email is read by a
// subcontractor, never the homeowner. It carries the sub's OWN price and
// nothing else with a figure on it. It must NEVER carry:
//   - the client's name, the household, or the project name (studios name
//     projects after the people who live in them, so a project name hands the
//     sub the client's surname under an innocent key — 00424:576-600 says
//     exactly this and the reasoning applies verbatim here)
//   - the contract sum, the GMP, the schedule of values, or any draw amount
//   - any other sub's price, bid, or existence (trade_scope_bids in any form)
//   - the prime agreement, its parts, or its attachments
//   - the flow-down clause (NULL this wave, counsel-gated — R16)
// The params interface below has no field that could carry any of them: there
// is nothing to redact because there is nothing to accept.

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

export interface RenderedTradeAgreementEmail {
  subject: string;
  html: string;
}

/** The agreement's schedule, as the studio wrote it (studio_trade_agreements.schedule). */
export interface TradeAgreementSchedule {
  startOn?: string | null;
  durationDays?: number | null;
  sequencing?: string | null;
}

export interface TradeAgreementEmailParams {
  /** The sub being asked to sign — a business/trade name, not a person. */
  contactDisplayName: string;
  /** Studio / business name shown as the counterparty. */
  studioName: string;
  /** Designer's personal name (may equal studioName). */
  designerName: string;
  /** Reply-to address, surfaced in the body so the sub knows who to ask. */
  designerEmail?: string | null;
  /** Optional public studio logo URL (Designer Studios), ≤24px in the byline. */
  studioLogoUrl?: string;
  /** The Trade Agreement's title (studio_trade_agreements.title). */
  agreementTitle: string;
  /** The scope of work, as prose. */
  scope: string;
  /** THEIR price, in cents. Never the client's. */
  priceCents: number;
  /** ISO-4217, defaults to USD. */
  currency?: string;
  schedule?: TradeAgreementSchedule | null;
  /** Basis points withheld from each payment (0–1000). */
  retainageBps: number;
  /** Days after the studio is paid; null when no pay-when-paid term applies. */
  payWhenPaidDays?: number | null;
  insuranceCertificateRequired: boolean;
  /** studio_trade_agreements.lien_waiver_policy. */
  lienWaiverPolicy: string;
  /** The single-use portal link (CLIENT_PORTAL_URL + '/trade/' + token). */
  ctaUrl: string;
  /** True once the sub has signed — the letter becomes a receipt, not an ask. */
  alreadySigned?: boolean;
}

function money(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Basis points as a plain percentage: 500 → "5%", 250 → "2.5%". */
function percentFromBps(bps: number): string {
  const percent = bps / 100;
  return `${Number.isInteger(percent) ? percent : Number(percent.toFixed(2))}%`;
}

/** A labeled line ("Price: …"), value already escaped by the caller when it is
 * free text; '' when the value is blank. */
function termLine(label: string, valueHtml: string): string {
  if (!valueHtml) return "";
  return paragraph(`<strong>${escapeHtml(label)}:</strong> ${valueHtml}`);
}

function scheduleSentence(schedule?: TradeAgreementSchedule | null): string {
  if (!schedule) return "";
  const parts: string[] = [];
  const startOn = schedule.startOn?.trim();
  if (startOn) parts.push(`starting ${escapeHtml(startOn)}`);
  if (typeof schedule.durationDays === "number" && schedule.durationDays > 0) {
    const days = schedule.durationDays;
    parts.push(`${days} ${days === 1 ? "day" : "days"} on site`);
  }
  const sequencing = schedule.sequencing?.trim();
  if (sequencing) parts.push(escapeHtml(sequencing));
  if (parts.length === 0) return "";
  return parts.join(", ");
}

/**
 * Lien-waiver policy in the sub's own words. Only the policies this wave
 * actually seeds are spelled out; anything else falls back to a sentence that
 * points at the agreement rather than printing a raw stored value at a
 * tradesperson.
 */
function lienWaiverSentence(policy: string): string {
  switch (policy) {
    case "conditional_then_unconditional":
      return "A conditional waiver comes with each payment request, and an unconditional waiver once that payment clears.";
    case "unconditional_on_payment":
      return "An unconditional waiver is due once each payment clears.";
    case "none":
      return "No lien waiver is required for this work.";
    default:
      return "Lien waivers are exchanged as this agreement describes.";
  }
}

/**
 * The outbound Trade Agreement email to a subcontractor's inbox. Subject names
 * the studio and the agreement; the body carries the eight essentials the
 * agreement is built from — scope, price, schedule, retainage, payment,
 * insurance, lien waivers — and a CTA to the sub's own signing link. There is
 * no attachment and, by construction, no figure but their own.
 */
export function buildTradeAgreementEmail(
  params: TradeAgreementEmailParams,
): RenderedTradeAgreementEmail {
  const studio = params.studioName.trim() || "a Patina studio";
  const agreementTitle = params.agreementTitle.trim() || "a scope of work";
  const contact = params.contactDisplayName.trim() || "there";
  const currency = params.currency?.trim() || "USD";
  const signed = params.alreadySigned === true;
  const subject = signed
    ? `Your signed Trade Agreement — ${agreementTitle}`
    : `${studio} sent you a Trade Agreement — ${agreementTitle}`;

  const opening = signed
    ? paragraph(
      `Your signed Trade Agreement with ${
        escapeHtml(studio)
      } for <strong>${escapeHtml(agreementTitle)}</strong> is below. Open it any time to read the terms you signed.`,
    )
    : paragraph(
      `${escapeHtml(studio)} would like you to sign a Trade Agreement for <strong>${
        escapeHtml(agreementTitle)
      }</strong>. Read the terms below, then sign it on the page &mdash; no account, no password.`,
    );

  const scheduleText = scheduleSentence(params.schedule);
  const terms = [
    termLine("Scope", escapeHtml(params.scope.trim())),
    termLine("Price", escapeHtml(money(params.priceCents, currency))),
    termLine("Schedule", scheduleText),
    termLine(
      "Retainage",
      params.retainageBps > 0
        ? `${
          escapeHtml(percentFromBps(params.retainageBps))
        } is held back from each payment and released when the work is accepted.`
        : "Nothing is held back from your payments.",
    ),
    termLine(
      "Payment",
      typeof params.payWhenPaidDays === "number"
        ? `Within ${params.payWhenPaidDays} ${
          params.payWhenPaidDays === 1 ? "day" : "days"
        } of ${escapeHtml(studio)} being paid for this work.`
        : "",
    ),
    termLine(
      "Insurance",
      params.insuranceCertificateRequired
        ? "A current certificate of insurance is required before work begins."
        : "No certificate of insurance is required for this work.",
    ),
    termLine("Lien waivers", lienWaiverSentence(params.lienWaiverPolicy)),
  ].join("");

  const askPrompt = params.designerEmail?.trim()
    ? paragraph(
      `Questions before you sign? Reply to this email or write to <a href="mailto:${
        escapeHtml(params.designerEmail.trim())
      }" style="color:#4E7A66; text-decoration:none;">${
        escapeHtml(params.designerEmail.trim())
      }</a>.`,
    )
    : "";

  const signoff =
    params.designerName.trim() &&
      params.designerName.trim() !== params.studioName.trim()
      ? `${escapeHtml(params.designerName.trim())}, ${
        escapeHtml(params.studioName.trim())
      }`
      : escapeHtml(studio);

  const body = paragraph(`Hello ${escapeHtml(contact)},`) +
    opening +
    terms +
    spacer(20) +
    ctaButton(
      params.ctaUrl,
      signed ? "Open your agreement" : "Read and sign",
    ) +
    spacer() +
    askPrompt +
    muted(`&mdash; ${signoff}`) +
    muted(`Sent via Patina &middot; patina.cloud`);

  // Co-brand the shell with the studio: the sub's counterparty IS the studio.
  const html = renderBrandedShell({
    title: subject,
    eyebrow: "Trade Agreement",
    body,
    studioName: studio,
    studioLogoUrl: params.studioLogoUrl,
  });

  return { subject, html };
}
