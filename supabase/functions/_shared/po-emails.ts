// Shared purchase-order email templates for Supabase Edge Functions.
//
// Procurement Wave 4 (po-send). HTML builders only — delivery goes through
// the sendCompliantEmail chokepoint (./send-email.ts) with the rendered PO
// PDF attached. Visual style is the shared Patina branded email shell
// (./branded-email.ts): color-bar header, Fraunces/Hanken type, mono eyebrow,
// and the standard footer. Unlike the invoice templates there is no portal CTA
// button — vendors have no Patina login; the attached PDF is the document.
// (The PDF attachment is added by the calling edge function, not here.)

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

/** Integer cents → "$1,234.56" (keep in lockstep with invoice-emails.ts). */
export function formatPoCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((cents || 0) / 100);
}

/** DATE ('2026-06-11') or timestamptz → "June 11, 2026" (UTC-pinned for bare dates). */
export function formatPoEmailDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const isBareDate = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const date = new Date(isBareDate ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    ...(isBareDate ? { timeZone: "UTC" } : {}),
  });
}

export interface RenderedPoEmail {
  subject: string;
  html: string;
}

export interface PoSentEmailParams {
  /** OUR outbound number (PO-0001 …), assigned by assign_po_number (00188). */
  poNumber: string;
  /** Shipment sidemark; folded into the subject when present. */
  sidemark?: string | null;
  vendorName: string;
  /** Studio / business name shown as the ordering party. */
  studioName: string;
  /** Designer's personal name (may equal studioName). */
  designerName: string;
  /** Optional personal note from the designer (plain text, escaped here). */
  personalMessage?: string | null;
  /** Payment pattern summary, e.g. "50% deposit, 50% balance". */
  paymentPatternLabel: string;
  /** Payment schedule rows (already labeled). */
  payments: Array<{ label: string; amountCents: number; dueDate: string | null }>;
  /** Vendor-facing TRADE total in cents. */
  tradeTotalCents: number;
  currency?: string;
}

/**
 * The outbound "purchase order sent" email to the vendor's orders inbox.
 * Subject: `Purchase Order {n} — {sidemark}`. The PDF rides along as an
 * attachment (see po-send); the body carries who is ordering, the optional
 * personal note, and the payment-terms summary.
 */
export function buildPoSentEmail(params: PoSentEmailParams): RenderedPoEmail {
  const subject = params.sidemark?.trim()
    ? `Purchase Order ${params.poNumber} — ${params.sidemark.trim()}`
    : `Purchase Order ${params.poNumber}`;

  const personalBlock = params.personalMessage?.trim()
    ? callout(escapeHtml(params.personalMessage.trim()))
    : "";

  const scheduleRows = params.payments
    .map((p) => {
      const due = formatPoEmailDate(p.dueDate);
      return `${escapeHtml(p.label)}: <strong>${formatPoCurrency(
        p.amountCents,
        params.currency,
      )}</strong>${due ? ` — due ${due}` : ""}`;
    })
    .join("<br>");
  const scheduleBlock = scheduleRows ? paragraph(scheduleRows) : "";

  const sidemarkLine = params.sidemark?.trim()
    ? paragraph(`<strong>Sidemark:</strong> ${escapeHtml(params.sidemark.trim())}`)
    : "";

  const signoff =
    params.designerName.trim() &&
    params.designerName.trim() !== params.studioName.trim()
      ? `${escapeHtml(params.designerName.trim())}, ${escapeHtml(params.studioName.trim())}`
      : escapeHtml(params.studioName.trim());

  const body =
    paragraph(`Hello ${escapeHtml(params.vendorName)},`) +
    paragraph(
      `${escapeHtml(params.studioName)} has issued purchase order <strong>${escapeHtml(
        params.poNumber,
      )}</strong>. The full order document is attached as a PDF.`,
    ) +
    personalBlock +
    sidemarkLine +
    paragraph(
      `<strong>Order total (trade):</strong> ${formatPoCurrency(
        params.tradeTotalCents,
        params.currency,
      )}`,
    ) +
    paragraph(`<strong>Payment terms:</strong> ${escapeHtml(params.paymentPatternLabel)}`) +
    scheduleBlock +
    paragraph(
      `Please confirm receipt of this order, your production timeline, and an estimated ship date by replying to this email.`,
    ) +
    spacer() +
    muted(`&mdash; ${signoff}`) +
    muted(`Sent via Patina &middot; patina.cloud`);

  const html = renderBrandedShell({
    title: subject,
    eyebrow: "Purchase order",
    body,
  });

  return { subject, html };
}
