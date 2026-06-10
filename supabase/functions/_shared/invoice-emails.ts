// Shared invoice email templates for Supabase Edge Functions.
//
// Invoicing Wave 2 (client visibility + send flow, migration 00178).
//
// HTML builders only — delivery goes through the sendCompliantEmail
// chokepoint (see ./send-email.ts). Visual style mirrors proposal-send /
// client-invite: inline styles, Inter stack, Patina ink (#2c2926) on white,
// muted #766a5c metadata, clay-dark button.
//
// buildPaymentReceiptEmail is exported for the Stripe wave (payment webhook →
// receipt); it is intentionally unused by invoice-send today.
//
// Currency is formatted inline (Intl) because edge functions are Deno and
// cannot import the Node @patina/shared package — keep the cents → dollars
// behavior in lockstep with packages/shared/src/invoice/formatCurrency.

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Integer cents → "$1,234.56". Mirrors @patina/shared formatCurrency. */
export function formatInvoiceCurrency(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format((cents || 0) / 100);
}

/** DATE ('2026-06-09') or timestamptz → "June 9, 2026" (UTC-pinned for bare dates). */
export function formatInvoiceEmailDate(value: string | null | undefined): string | null {
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

export interface RenderedInvoiceEmail {
  subject: string;
  html: string;
}

export interface InvoiceSentEmailParams {
  invoiceNumber: string;
  projectName: string;
  designerName: string;
  /** Greeting name; falls back to "there". */
  clientName?: string | null;
  totalCents: number;
  /** DATE string from invoices.due_date. */
  dueDate?: string | null;
  /** Absolute client-portal link to the invoice. */
  portalUrl: string;
  /** Optional personal note from the designer (plain text, escaped here). */
  personalMessage?: string | null;
  currency?: string;
}

/** Wrapper shared by both templates so the frame stays consistent. */
function wrap(inner: string, portalUrl: string, cta: string): string {
  return `
    <div style="font-family:Inter,Arial,sans-serif;max-width:560px;color:#2c2926;line-height:1.55">
      ${inner}
      <p style="margin:24px 0">
        <a href="${portalUrl}" style="display:inline-block;background:#2c2926;color:#fff;padding:12px 24px;text-decoration:none;border-radius:3px">
          ${cta}
        </a>
      </p>
      <p style="font-size:12px;color:#766a5c">If the button doesn&rsquo;t work, copy this link: <br>${portalUrl}</p>
      <p style="margin-top:32px;color:#766a5c">&mdash; Patina</p>
    </div>
  `;
}

export function buildInvoiceSentEmail(params: InvoiceSentEmailParams): RenderedInvoiceEmail {
  const clientName = params.clientName?.trim() || "there";
  const dueLine = (() => {
    const due = formatInvoiceEmailDate(params.dueDate);
    return due
      ? `<p style="margin:0 0 12px;color:#766a5c"><em>Payment is due by ${due}.</em></p>`
      : "";
  })();
  const personalBlock = params.personalMessage?.trim()
    ? `<blockquote style="border-left:3px solid #d4c8b0;padding:8px 16px;margin:16px 0;color:#3d3a36">${escapeHtml(
        params.personalMessage.trim(),
      )}</blockquote>`
    : "";

  const subject = `${params.designerName} sent you invoice ${params.invoiceNumber} — ${params.projectName}`;
  const html = wrap(
    `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>${escapeHtml(params.designerName)} has sent you an invoice for
        <strong>${escapeHtml(params.projectName)}</strong>.</p>
      ${personalBlock}
      <p style="margin:0 0 12px"><strong>Invoice:</strong> ${escapeHtml(params.invoiceNumber)}</p>
      <p style="margin:0 0 12px"><strong>Amount due:</strong> ${formatInvoiceCurrency(
        params.totalCents,
        params.currency,
      )}</p>
      ${dueLine}
    `,
    params.portalUrl,
    "View invoice",
  );

  return { subject, html };
}

export interface PaymentReceiptEmailParams {
  invoiceNumber: string;
  projectName: string;
  designerName: string;
  clientName?: string | null;
  /** The payment amount being acknowledged. */
  amountPaidCents: number;
  /** Remaining balance after this payment (0 ⇒ paid in full). */
  balanceCents: number;
  portalUrl: string;
  currency?: string;
}

/**
 * Receipt sent to the client after a payment lands (Stripe wave). Exported
 * now so the webhook function can import it; unused by invoice-send.
 */
export function buildPaymentReceiptEmail(
  params: PaymentReceiptEmailParams,
): RenderedInvoiceEmail {
  const clientName = params.clientName?.trim() || "there";
  const paidInFull = params.balanceCents <= 0;

  const subject = paidInFull
    ? `Payment received — invoice ${params.invoiceNumber} is paid in full`
    : `Payment received toward invoice ${params.invoiceNumber}`;

  const balanceLine = paidInFull
    ? `<p style="margin:0 0 12px;color:#766a5c"><em>This invoice is now paid in full. Thank you!</em></p>`
    : `<p style="margin:0 0 12px"><strong>Remaining balance:</strong> ${formatInvoiceCurrency(
        params.balanceCents,
        params.currency,
      )}</p>`;

  const html = wrap(
    `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>We received your payment of <strong>${formatInvoiceCurrency(
        params.amountPaidCents,
        params.currency,
      )}</strong> toward invoice <strong>${escapeHtml(
        params.invoiceNumber,
      )}</strong> for ${escapeHtml(params.projectName)}, billed by ${escapeHtml(
        params.designerName,
      )}.</p>
      ${balanceLine}
    `,
    params.portalUrl,
    "View receipt",
  );

  return { subject, html };
}
