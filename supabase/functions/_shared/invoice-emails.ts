// Shared invoice email templates for Supabase Edge Functions.
//
// Invoicing Wave 2 (client visibility + send flow, migration 00178).
//
// HTML builders only — delivery goes through the sendCompliantEmail
// chokepoint (see ./send-email.ts). Visual style mirrors proposal-send /
// client-invite: inline styles, Inter stack, Patina ink (#2c2926) on white,
// muted #766a5c metadata, clay-dark button.
//
// buildPaymentReceiptEmail and buildPaymentFailedEmail are consumed by the
// stripe-webhook function (Stripe wave): receipt when a payment flips to
// succeeded, failure notice on checkout.session.async_payment_failed (ACH
// bank debit returned after checkout).
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

// ─── A/R reminder cadence templates (invoice-reminders edge function) ────────
//
// Four client-facing stages keyed to invoices.reminder_count (offsets vs
// due_date: -3 / +1 / +7 / +14), plus a designer-facing escalation once the
// final notice has gone out and the invoice gets ar_flagged_at. Tone escalates
// per stage; the frame/wrap stays identical to buildInvoiceSentEmail.

export interface InvoiceReminderEmailParams {
  invoiceNumber: string;
  projectName: string;
  designerName: string;
  /** Greeting name; falls back to "there". */
  clientName?: string | null;
  /** Remaining balance (total - paid), not the original total. */
  balanceCents: number;
  /** DATE string from invoices.due_date. */
  dueDate?: string | null;
  /** Absolute client-portal link to the invoice. */
  portalUrl: string;
  currency?: string;
}

function reminderFacts(params: InvoiceReminderEmailParams): string {
  const due = formatInvoiceEmailDate(params.dueDate);
  return `
      <p style="margin:0 0 12px"><strong>Invoice:</strong> ${escapeHtml(params.invoiceNumber)}</p>
      <p style="margin:0 0 12px"><strong>Balance due:</strong> ${formatInvoiceCurrency(
        params.balanceCents,
        params.currency,
      )}</p>
      ${due ? `<p style="margin:0 0 12px"><strong>Due date:</strong> ${due}</p>` : ""}
  `;
}

/** Stage 0 (due_date − 3 days): friendly upcoming-due nudge. */
export function buildInvoiceUpcomingReminderEmail(
  params: InvoiceReminderEmailParams,
): RenderedInvoiceEmail {
  const clientName = params.clientName?.trim() || "there";
  const subject = `Reminder: invoice ${params.invoiceNumber} is due soon — ${params.projectName}`;
  const html = wrap(
    `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>Just a friendly reminder that ${escapeHtml(params.designerName)}&rsquo;s invoice for
        <strong>${escapeHtml(params.projectName)}</strong> is coming due.</p>
      ${reminderFacts(params)}
      <p style="margin:0 0 12px;color:#766a5c"><em>If you&rsquo;ve already arranged payment, you can disregard this note.</em></p>
    `,
    params.portalUrl,
    "View &amp; pay invoice",
  );
  return { subject, html };
}

/** Stage 1 (due_date + 1 day): the invoice is now past due. */
export function buildInvoiceOverdueNoticeEmail(
  params: InvoiceReminderEmailParams,
): RenderedInvoiceEmail {
  const clientName = params.clientName?.trim() || "there";
  const subject = `Invoice ${params.invoiceNumber} is past due — ${params.projectName}`;
  const html = wrap(
    `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>Invoice <strong>${escapeHtml(params.invoiceNumber)}</strong> from
        ${escapeHtml(params.designerName)} for <strong>${escapeHtml(params.projectName)}</strong>
        is now past its due date.</p>
      ${reminderFacts(params)}
      <p style="margin:0 0 12px">When you have a moment, please settle the balance so the project can keep moving without interruption.</p>
      <p style="margin:0 0 12px;color:#766a5c"><em>If payment is already on its way, thank you — no further action is needed.</em></p>
    `,
    params.portalUrl,
    "Pay invoice",
  );
  return { subject, html };
}

/** Stage 2 (due_date + 7 days): firmer second notice. */
export function buildInvoiceSecondNoticeEmail(
  params: InvoiceReminderEmailParams,
): RenderedInvoiceEmail {
  const clientName = params.clientName?.trim() || "there";
  const subject = `Second notice: invoice ${params.invoiceNumber} is overdue — ${params.projectName}`;
  const html = wrap(
    `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>This is a second notice that invoice <strong>${escapeHtml(params.invoiceNumber)}</strong>
        from ${escapeHtml(params.designerName)} for <strong>${escapeHtml(params.projectName)}</strong>
        remains unpaid a week past its due date.</p>
      ${reminderFacts(params)}
      <p style="margin:0 0 12px">Please arrange payment promptly. If something about this invoice looks off, reply to this email or reach out to ${escapeHtml(
        params.designerName,
      )} directly so it can be sorted out.</p>
    `,
    params.portalUrl,
    "Pay invoice now",
  );
  return { subject, html };
}

/** Stage 3 (due_date + 14 days): final automated notice before A/R flag. */
export function buildInvoiceFinalNoticeEmail(
  params: InvoiceReminderEmailParams,
): RenderedInvoiceEmail {
  const clientName = params.clientName?.trim() || "there";
  const subject = `Final notice: invoice ${params.invoiceNumber} is seriously overdue — ${params.projectName}`;
  const html = wrap(
    `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>This is the <strong>final automated notice</strong> for invoice
        <strong>${escapeHtml(params.invoiceNumber)}</strong> from ${escapeHtml(
          params.designerName,
        )} for <strong>${escapeHtml(params.projectName)}</strong>, now two weeks past due.</p>
      ${reminderFacts(params)}
      <p style="margin:0 0 12px">Immediate payment is required. The outstanding balance has been flagged for direct follow-up by ${escapeHtml(
        params.designerName,
      )}, and continued non-payment may pause work on the project.</p>
    `,
    params.portalUrl,
    "Pay invoice immediately",
  );
  return { subject, html };
}

export interface InvoiceArEscalationEmailParams {
  invoiceNumber: string;
  projectName: string;
  clientName?: string | null;
  /** Greeting name for the designer; falls back to "there". */
  designerName?: string | null;
  balanceCents: number;
  dueDate?: string | null;
  daysOverdue: number;
  /** Absolute designer-portal link to the A/R page. */
  arUrl: string;
  currency?: string;
}

/**
 * Designer-facing escalation, sent once when the automated cadence is
 * exhausted (final notice delivered, ar_flagged_at stamped). The client
 * receives no further automated emails after this.
 */
export function buildInvoiceArEscalationEmail(
  params: InvoiceArEscalationEmailParams,
): RenderedInvoiceEmail {
  const designerName = params.designerName?.trim() || "there";
  const clientLine = params.clientName?.trim()
    ? ` to ${escapeHtml(params.clientName.trim())}`
    : "";
  const due = formatInvoiceEmailDate(params.dueDate);
  const subject = `${params.invoiceNumber} is ${params.daysOverdue}+ days overdue — automated reminders exhausted`;
  const html = wrap(
    `
      <p>Hi ${escapeHtml(designerName)},</p>
      <p>Invoice <strong>${escapeHtml(params.invoiceNumber)}</strong>${clientLine} for
        <strong>${escapeHtml(params.projectName)}</strong> is now
        <strong>${params.daysOverdue}+ days overdue</strong> and the automated reminder
        sequence (upcoming nudge, overdue notice, second notice, final notice) has been
        exhausted without payment.</p>
      <p style="margin:0 0 12px"><strong>Outstanding balance:</strong> ${formatInvoiceCurrency(
        params.balanceCents,
        params.currency,
      )}</p>
      ${due ? `<p style="margin:0 0 12px"><strong>Original due date:</strong> ${due}</p>` : ""}
      <p style="margin:0 0 12px">No further automated emails will be sent to the client. This invoice has been flagged in your A/R workspace for direct follow-up — a phone call or personal note tends to work best at this stage.</p>
    `,
    params.arUrl,
    "Open A/R workspace",
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

export interface DirectOrderReceiptEmailParams {
  /** Snapshot product name (direct_orders.product_name). */
  orderName: string;
  quantity: number;
  /** Total charged (direct_orders.amount_cents). */
  amountCents: number;
  clientName?: string | null;
  /** One-line shipping summary (name + address), if collected. */
  shippingSummary?: string | null;
  /** Absolute client-portal link to the order. */
  portalUrl: string;
  currency?: string;
}

/**
 * Receipt sent to the client after a direct order ("buy now") is paid
 * (payment-rail phase 5). Consumed by stripe-webhook on the direct_order
 * settle. Mirrors buildPaymentReceiptEmail's frame; the copy sets the
 * post-purchase expectation ("we'll be in touch about delivery") since a direct
 * order has no project/invoice context.
 */
export function buildDirectOrderReceiptEmail(
  params: DirectOrderReceiptEmailParams,
): RenderedInvoiceEmail {
  const clientName = params.clientName?.trim() || "there";
  const qty = params.quantity > 0 ? params.quantity : 1;
  const qtyPrefix = qty > 1 ? `${qty} × ` : "";

  const subject = `Order confirmed — ${params.orderName}`;

  const shippingBlock = params.shippingSummary?.trim()
    ? `<p style="margin:0 0 12px"><strong>Shipping to:</strong> ${escapeHtml(
        params.shippingSummary.trim(),
      )}</p>`
    : "";

  const html = wrap(
    `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>Thank you for your order! We received your payment of
        <strong>${formatInvoiceCurrency(
          params.amountCents,
          params.currency,
        )}</strong> for ${escapeHtml(`${qtyPrefix}${params.orderName}`)}.</p>
      ${shippingBlock}
      <p style="margin:0 0 12px;color:#766a5c"><em>We&rsquo;ll be in touch about delivery.</em></p>
    `,
    params.portalUrl,
    "View order",
  );

  return { subject, html };
}

export interface DirectOrderPaymentFailedEmailParams {
  /** Snapshot product name (direct_orders.product_name). */
  orderName: string;
  quantity: number;
  /** The order total whose bank transfer failed (direct_orders.amount_cents). */
  amountCents: number;
  clientName?: string | null;
  /** Absolute client-portal link to the orders page. */
  portalUrl: string;
  currency?: string;
}

/**
 * Sent to the client when a direct order's asynchronous payment (ACH bank debit
 * started in Stripe Checkout) fails to clear — e.g. insufficient funds or a
 * returned debit. No money was taken and the order is back to pending_payment;
 * the client can retry from their orders page. Consumed by stripe-webhook on
 * checkout.session.async_payment_failed for a direct_order. Mirrors
 * buildPaymentFailedEmail's frame; the copy drops the invoice/designer context
 * (a direct order has none) and points at the orders page.
 */
export function buildDirectOrderPaymentFailedEmail(
  params: DirectOrderPaymentFailedEmailParams,
): RenderedInvoiceEmail {
  const clientName = params.clientName?.trim() || "there";
  const qty = params.quantity > 0 ? params.quantity : 1;
  const qtyPrefix = qty > 1 ? `${qty} × ` : "";

  const subject = `Payment didn't go through — ${params.orderName}`;

  const html = wrap(
    `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>Unfortunately your bank transfer of <strong>${formatInvoiceCurrency(
        params.amountCents,
        params.currency,
      )}</strong> for ${escapeHtml(`${qtyPrefix}${params.orderName}`)} didn&rsquo;t complete.</p>
      <p style="margin:0 0 12px">No money was taken. You can retry the payment from your orders
        page — you can use a card or try the bank transfer again.</p>
      <p style="margin:0 0 12px;color:#766a5c"><em>If you believe this is an error, reply to
        this email and we&rsquo;ll help sort it out.</em></p>
    `,
    params.portalUrl,
    "Retry payment",
  );

  return { subject, html };
}

export interface PaymentRefundedEmailParams {
  invoiceNumber: string;
  projectName: string;
  /** Greeting name for the designer (this email is designer-facing). */
  designerName?: string | null;
  /** The amount actually refunded on this event. */
  refundedAmountCents: number;
  /** The original payment amount the refund was drawn against. */
  paymentAmountCents: number;
  /** true ⇒ partial refund (no accounting change; review in Stripe). */
  partial: boolean;
  /** Absolute designer-portal link to the invoice. */
  portalUrl: string;
  currency?: string;
}

/**
 * Designer-facing notice sent when a Stripe payment on one of their invoices is
 * refunded (payment-rail phase 6). Consumed by stripe-webhook on the
 * charge.refunded → invoice branch. FULL refunds have already reversed the
 * invoice/earnings accounting by the time this sends (the copy says so);
 * PARTIAL refunds change nothing on the books and point the designer to Stripe.
 * Frame mirrors the other invoice emails; all interpolated values are escaped.
 */
export function buildPaymentRefundedEmail(
  params: PaymentRefundedEmailParams,
): RenderedInvoiceEmail {
  const designerName = params.designerName?.trim() || "there";
  const refundLabel = formatInvoiceCurrency(params.refundedAmountCents, params.currency);
  const paymentLabel = formatInvoiceCurrency(params.paymentAmountCents, params.currency);

  const subject = params.partial
    ? `Partial refund processed — invoice ${params.invoiceNumber}`
    : `Refund processed — invoice ${params.invoiceNumber}`;

  const body = params.partial
    ? `<p>A <strong>partial refund</strong> of <strong>${refundLabel}</strong> was processed against the
        ${paymentLabel} payment on invoice <strong>${escapeHtml(params.invoiceNumber)}</strong> for
        ${escapeHtml(params.projectName)}.</p>
      <p style="margin:0 0 12px">The invoice balance and your earnings are <strong>unchanged</strong> —
        partial-refund accounting isn&rsquo;t automated yet. Reconcile this refund in your Stripe
        dashboard, then adjust the invoice by hand if needed.</p>`
    : `<p>A <strong>refund</strong> of <strong>${refundLabel}</strong> was processed for the ${paymentLabel}
        payment on invoice <strong>${escapeHtml(params.invoiceNumber)}</strong> for
        ${escapeHtml(params.projectName)}.</p>
      <p style="margin:0 0 12px">This invoice has been reopened and the reversed payment removed from your
        earnings automatically. Any milestone this payment settled is outstanding again.</p>`;

  const html = wrap(
    `
      <p>Hi ${escapeHtml(designerName)},</p>
      ${body}
    `,
    params.portalUrl,
    "View invoice",
  );

  return { subject, html };
}

export interface PaymentFailedEmailParams {
  invoiceNumber: string;
  projectName: string;
  designerName: string;
  clientName?: string | null;
  /** The payment amount that failed to clear. */
  amountCents: number;
  portalUrl: string;
  currency?: string;
}

/**
 * Sent to the client when an asynchronous payment (ACH bank debit started in
 * Stripe Checkout) fails to clear — e.g. insufficient funds or a returned
 * debit. The invoice balance is unchanged; the client should try again.
 * Consumed by stripe-webhook on checkout.session.async_payment_failed.
 */
export function buildPaymentFailedEmail(
  params: PaymentFailedEmailParams,
): RenderedInvoiceEmail {
  const clientName = params.clientName?.trim() || "there";
  const subject = `Payment didn't go through — invoice ${params.invoiceNumber}`;

  const html = wrap(
    `
      <p>Hi ${escapeHtml(clientName)},</p>
      <p>Unfortunately your bank transfer of <strong>${formatInvoiceCurrency(
        params.amountCents,
        params.currency,
      )}</strong> toward invoice <strong>${escapeHtml(
        params.invoiceNumber,
      )}</strong> for ${escapeHtml(params.projectName)}, billed by ${escapeHtml(
        params.designerName,
      )}, could not be completed.</p>
      <p style="margin:0 0 12px">No money was taken, and the invoice balance is unchanged.
        Please try again from the invoice page — you can use a card or retry the bank
        transfer.</p>
      <p style="margin:0 0 12px;color:#766a5c"><em>If you believe this is an error, reply to
        this email or reach out to ${escapeHtml(params.designerName)} directly.</em></p>
    `,
    params.portalUrl,
    "Try payment again",
  );

  return { subject, html };
}
