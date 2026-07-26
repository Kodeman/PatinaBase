'use client';

/**
 * The Invoice folio (R74a) — one invoice as a paper artifact: header with the
 * number and status stamp, the client and the project doorway, typed line
 * items (milestone / time / ffe / adhoc per 00178/00187), totals, payment
 * history, and the acts row — Issue & send · Record payment · Resend · Void ·
 * Print — reusing useInvoice / useIssueInvoice / useSendInvoice /
 * useRecordPayment / useVoidInvoice 1:1 (the old Billing detail page's logic,
 * rebuilt in the charcoal/paper grammar: quiet inline confirmations, R83
 * terracotta inline errors, NO toasts, zero shadows).
 *
 * Print (BIL-01): the folio prints ITSELF — the @media print stylesheet below
 * hides every body sibling of the portal root (PaperFolioSheet portals onto
 * <body>) and lets the paper flow as pages.
 */

import { useState } from 'react';
import {
  useInvoice,
  useIssueInvoice,
  useRecordPayment,
  useSendInvoice,
  useVoidInvoice,
  type Invoice,
  type InvoicePaymentMethod,
} from '@patina/supabase';
import {
  INVOICE_PAYMENT_METHOD_LABELS,
  INVOICE_STATUS_LABELS,
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  isInvoiceOverdue,
  timeLineHoursLabel,
} from '@patina/shared';
import { useQueryClient } from '@tanstack/react-query';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { Stamp } from '../stamp';
import { todayYmd } from '@/lib/document/format';
import { dollarsToCents } from '@/lib/document/invoice-composer';

const SAGE_INK = '#85947C';
const TERRACOTTA_INK = '#C4836F';

/** Paper-ink stamp palette (the ledger page's dark palette re-inked for cream). */
const FOLIO_STAMP: Record<
  string,
  { label: string; color: string; ink?: string }
> = {
  draft: { label: 'draft', color: '#C9C2B6', ink: 'var(--text-muted)' },
  sent: { label: 'sent', color: 'var(--color-dusty-blue)', ink: '#7E8FA6' },
  partially_paid: {
    label: 'part paid',
    color: 'var(--color-golden-hour)',
    ink: '#B89A2E',
  },
  paid: { label: 'paid', color: 'var(--color-sage)', ink: SAGE_INK },
  void: {
    label: 'void',
    color: 'var(--color-terracotta)',
    ink: TERRACOTTA_INK,
  },
};

const MANUAL_METHODS: Exclude<InvoicePaymentMethod, 'stripe'>[] = [
  'check',
  'wire',
  'ach_manual',
  'cash',
  'other',
];

const LABEL =
  'font-mono text-[8px] uppercase tracking-[0.08em] text-[var(--text-muted)]';
const INPUT =
  'rounded-[3px] border border-[var(--color-pearl)] bg-transparent px-2 py-1.5 text-[11.5px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none';

type ActPanel = 'send' | 'resend' | 'payment' | 'void' | null;

export function InvoiceFolio({
  invoiceId,
  onOpenDocument,
}: {
  invoiceId: string;
  /** The doorway to the document this money belongs to (kept quiet). */
  onOpenDocument?: (projectId: string) => void;
}) {
  const qc = useQueryClient();
  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const issue = useIssueInvoice({ errorSurface: 'inline' });
  const send = useSendInvoice({ errorSurface: 'inline' });
  const recordPayment = useRecordPayment({ errorSurface: 'inline' });
  const voidInvoice = useVoidInvoice({ errorSurface: 'inline' });

  const [act, setAct] = useState<ActPanel>(null);
  /** R51's quiet confirmation grammar — sage when it landed, terracotta when not. */
  const [note, setNote] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [voidReason, setVoidReason] = useState('');
  const [amountDollars, setAmountDollars] = useState('');
  const [method, setMethod] =
    useState<Exclude<InvoicePaymentMethod, 'stripe'>>('check');
  const [reference, setReference] = useState('');
  const [receivedDate, setReceivedDate] = useState(() => todayYmd());

  if (isLoading || !invoice) {
    return (
      <p className="py-8 text-center font-heading text-[13px] italic text-[var(--text-muted)]">
        {isLoading ? 'Opening the folio…' : 'Invoice not found.'}
      </p>
    );
  }

  const stamp = FOLIO_STAMP[invoice.status] ?? FOLIO_STAMP.draft;
  const overdue = isInvoiceOverdue(invoice);
  const balance = invoiceBalanceCents(invoice);
  const isDraft = invoice.status === 'draft';
  const canRecordPayment =
    invoice.status === 'sent' || invoice.status === 'partially_paid';
  const canResend = canRecordPayment;
  const canVoid =
    ['draft', 'sent', 'partially_paid'].includes(invoice.status) &&
    invoice.amount_paid_cents === 0;
  const canPrint = !isDraft && invoice.status !== 'void';
  const busy =
    issue.isPending ||
    send.isPending ||
    recordPayment.isPending ||
    voidInvoice.isPending;

  const openPanel = (panel: ActPanel) => {
    setNote(null);
    setAct((prev) => (prev === panel ? null : panel));
  };

  // Issue & send: issue_invoice RPC first (number, totals, milestone flips),
  // then the invoice-send edge fn. A send failure does NOT roll back the issue
  // — the folio re-reads as issued and Resend carries the retry (old page 1:1).
  const doIssueAndSend = async () => {
    setNote(null);
    let issued: Invoice;
    try {
      issued = await issue.mutateAsync({
        invoiceId,
        projectId: invoice.project_id,
      });
    } catch (e) {
      setNote(
        `Could not issue — ${e instanceof Error ? e.message : 'try again'}`,
      );
      return;
    }
    try {
      const result = await send.mutateAsync({
        invoiceId,
        projectId: invoice.project_id,
        message: message.trim() || undefined,
      });
      setNote(
        result.emailSent
          ? `Invoice ${issued.invoice_number ?? ''} issued · emailed ${result.recipient}`.trim()
          : `Invoice ${issued.invoice_number ?? ''} issued · email skipped`.trim(),
      );
      setAct(null);
      setMessage('');
    } catch (e) {
      setNote(
        `Could not send — issued as ${issued.invoice_number ?? 'this invoice'}; ${
          e instanceof Error ? e.message : 'the email failed'
        }. Resend to retry.`,
      );
      setAct(null);
    }
  };

  const doResend = async () => {
    setNote(null);
    try {
      const result = await send.mutateAsync({
        invoiceId,
        projectId: invoice.project_id,
        message: message.trim() || undefined,
      });
      setNote(
        result.emailSent
          ? `emailed ${result.recipient}`
          : 'Could not send — recipient suppressed',
      );
      setAct(null);
      setMessage('');
    } catch (e) {
      setNote(
        `Could not send — ${e instanceof Error ? e.message : 'try again'}`,
      );
    }
  };

  const amountCents = dollarsToCents(amountDollars);
  const paymentValid =
    amountCents > 0 && amountCents <= balance && !!receivedDate;

  const doRecordPayment = async () => {
    if (!paymentValid) return;
    setNote(null);
    try {
      await recordPayment.mutateAsync({
        invoiceId,
        projectId: invoice.project_id,
        amountCents,
        method,
        reference: reference.trim() || undefined,
        receivedAt: new Date(`${receivedDate}T12:00:00`).toISOString(),
      });
      setNote(`payment of ${formatCurrency(amountCents)} recorded`);
      setAct(null);
      setAmountDollars('');
      setReference('');
      // The Desk reads receivables under its own key — one act, every surface.
      void qc.invalidateQueries({ queryKey: ['document-state'] });
    } catch (e) {
      setNote(
        `Could not record — ${e instanceof Error ? e.message : 'try again'}`,
      );
    }
  };

  const doVoid = async () => {
    if (!voidReason.trim()) return;
    setNote(null);
    try {
      await voidInvoice.mutateAsync({
        invoiceId,
        projectId: invoice.project_id,
        reason: voidReason.trim(),
      });
      setNote('invoice voided · linked milestones and time released');
      setAct(null);
      setVoidReason('');
      void qc.invalidateQueries({ queryKey: ['document-state'] });
    } catch (e) {
      setNote(
        `Could not void — ${e instanceof Error ? e.message : 'try again'}`,
      );
    }
  };

  const failed = note !== null && note.startsWith('Could not');

  return (
    <div>
      {/* Print = the folio itself (R74). The sheet portals onto <body>, so the
          folio's page is exactly the overlay subtree; everything else hides. */}
      <style>{`@media print {
        body > *:not([data-doc-overlay='paper-folio']) { display: none !important; }
        [data-doc-overlay='paper-folio'] { position: static !important; overflow: visible !important; padding: 0 !important; }
        [data-doc-overlay='paper-folio'] .paper-folio-backdrop { display: none !important; }
        [data-doc-overlay='paper-folio'] .paper-folio-panel { position: static !important; max-width: none !important; border: 0 !important; border-radius: 0 !important; }
        .folio-no-print { display: none !important; }
      }`}</style>

      {/* ── Head: number · stamp · household · the doorway ─────────────── */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-heading text-[20px] font-medium text-[var(--color-charcoal)]">
            {invoice.invoice_number
              ? `Invoice ${invoice.invoice_number}`
              : 'Draft invoice'}
          </h2>
          <p className="mt-0.5 truncate font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            {[
              invoice.client?.full_name ?? invoice.client?.email,
              invoice.project?.name,
              overdue
                ? null
                : INVOICE_STATUS_LABELS[invoice.status].toLowerCase(),
            ]
              .filter(Boolean)
              .join(' · ')}
            {overdue && (
              <span style={{ color: TERRACOTTA_INK }}> · overdue</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          <Stamp label={stamp.label} color={stamp.color} ink={stamp.ink} />
          {invoice.project && onOpenDocument && (
            <DocumentAction
              actionKey="open-invoice-document"
              surfaceKey="accounts"
              regionKey="invoice-letterhead"
              variant="tertiary"
              onClick={() => onOpenDocument(invoice.project_id)}
              className="folio-no-print"
            >
              document ↗
            </DocumentAction>
          )}
        </div>
      </div>

      {/* ── Dates + money figures — DM Mono, one quiet line ─────────────── */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-t border-[var(--color-pearl)] py-2">
        <span className="flex items-baseline gap-1.5">
          <span className={LABEL}>issued</span>
          <span className="font-mono text-[10.5px] text-[var(--color-charcoal)]">
            {formatInvoiceDate(invoice.issue_date)}
          </span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className={LABEL}>due</span>
          <span
            className="font-mono text-[10.5px]"
            style={{
              color: overdue ? TERRACOTTA_INK : 'var(--color-charcoal)',
            }}
          >
            {formatInvoiceDate(invoice.due_date)}
            {isDraft ? ` (net ${invoice.payment_terms_days})` : ''}
          </span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className={LABEL}>total</span>
          <span className="font-mono text-[10.5px] font-semibold text-[var(--color-charcoal)]">
            {formatCurrency(invoice.total_cents, invoice.currency)}
          </span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className={LABEL}>paid</span>
          <span className="font-mono text-[10.5px] text-[var(--color-charcoal)]">
            {formatCurrency(invoice.amount_paid_cents, invoice.currency)}
          </span>
        </span>
        <span className="flex items-baseline gap-1.5">
          <span className={LABEL}>balance</span>
          <span
            className="font-mono text-[10.5px] font-semibold"
            style={{
              color:
                invoice.status === 'void'
                  ? 'var(--text-muted)'
                  : balance > 0 && !isDraft
                    ? TERRACOTTA_INK
                    : SAGE_INK,
            }}
          >
            {invoice.status === 'void'
              ? '—'
              : formatCurrency(balance, invoice.currency)}
          </span>
        </span>
      </div>

      {invoice.status === 'void' && invoice.void_reason && (
        <p className="mt-2 text-[11px] italic text-[var(--text-muted)]">
          Voided {formatInvoiceDate(invoice.voided_at)} — {invoice.void_reason}
        </p>
      )}

      {/* ── Line items — typed lines, ledger grammar ─────────────────────── */}
      <div className="mt-4">
        <p className={`${LABEL} mb-1`}>line items</p>
        <ul>
          {(invoice.line_items ?? []).map((line) => (
            <li
              key={line.id}
              className="grid grid-cols-[1fr_44px_88px_92px] items-baseline gap-2 border-b border-dashed border-[var(--color-pearl)] py-1.5"
            >
              <span className="min-w-0 text-[11.5px] text-[var(--color-charcoal)]">
                {line.description}
                {line.kind === 'milestone' && (
                  <span className="ml-1.5 font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    milestone
                  </span>
                )}
                {line.kind === 'ffe' && (
                  <span className="ml-1.5 font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    ff&e
                  </span>
                )}
                {line.kind === 'time' && (
                  <span className="ml-1.5 font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                    logged time
                    {timeLineHoursLabel(line.metadata)
                      ? ` · ${timeLineHoursLabel(line.metadata)}`
                      : ''}
                  </span>
                )}
              </span>
              {/* Time lines are one rolled-up amount — "1 × $X" would read like
                  an hourly rate, so qty/unit dash (the old page's rule). */}
              <span className="text-right font-mono text-[10px] text-[var(--text-muted)]">
                {line.kind === 'time' ? '—' : Number(line.quantity)}
              </span>
              <span className="text-right font-mono text-[10px] text-[var(--text-muted)]">
                {line.kind === 'time'
                  ? '—'
                  : formatCurrency(line.unit_amount_cents, invoice.currency)}
              </span>
              <span className="text-right font-mono text-[10.5px] text-[var(--color-charcoal)]">
                {formatCurrency(line.amount_cents, invoice.currency)}
              </span>
            </li>
          ))}
        </ul>

        {/* Totals block */}
        <div className="ml-auto mt-2 max-w-[240px]">
          <div className="flex justify-between py-0.5">
            <span className={LABEL}>subtotal</span>
            <span className="font-mono text-[10.5px] text-[var(--color-charcoal)]">
              {formatCurrency(invoice.subtotal_cents, invoice.currency)}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className={LABEL}>
              tax (
              {(Number(invoice.tax_rate) * 100)
                .toFixed(2)
                .replace(/\.?0+$/, '') || '0'}
              %)
            </span>
            <span className="font-mono text-[10.5px] text-[var(--color-charcoal)]">
              {formatCurrency(invoice.tax_cents, invoice.currency)}
            </span>
          </div>
          <div className="flex justify-between border-t border-[var(--color-pearl)] py-1">
            <span className={LABEL}>total</span>
            <span className="font-mono text-[11.5px] font-semibold text-[var(--color-charcoal)]">
              {formatCurrency(invoice.total_cents, invoice.currency)}
            </span>
          </div>
        </div>
      </div>

      {invoice.memo && (
        <p className="mt-3 text-[11px] italic text-[var(--text-muted)]">
          {invoice.memo}
        </p>
      )}

      {/* ── Payment history ─────────────────────────────────────────────── */}
      <div className="mt-4">
        <p className={`${LABEL} mb-1`}>payments</p>
        {(invoice.payments ?? []).length > 0 ? (
          <ul>
            {(invoice.payments ?? []).map((p) => (
              <li
                key={p.id}
                className="grid grid-cols-[92px_1fr_auto_92px] items-baseline gap-2 border-b border-dashed border-[var(--color-pearl)] py-1.5"
              >
                <span className="font-mono text-[10px] text-[var(--color-charcoal)]">
                  {formatInvoiceDate(p.received_at ?? p.created_at)}
                </span>
                <span className="min-w-0 truncate text-[11px] text-[var(--color-charcoal)]">
                  {INVOICE_PAYMENT_METHOD_LABELS[p.method]}
                  {p.reference && (
                    <span className="ml-1.5 text-[var(--text-muted)]">
                      {p.reference}
                    </span>
                  )}
                  {p.note && (
                    <span className="ml-1.5 italic text-[var(--text-muted)]">
                      {p.note}
                    </span>
                  )}
                </span>
                <span
                  className="font-mono text-[8px] uppercase tracking-[0.06em]"
                  style={{
                    color:
                      p.status === 'succeeded'
                        ? SAGE_INK
                        : p.status === 'failed'
                          ? TERRACOTTA_INK
                          : 'var(--text-muted)',
                  }}
                >
                  {p.status}
                </span>
                <span className="text-right font-mono text-[10.5px] text-[var(--color-charcoal)]">
                  {formatCurrency(p.amount_cents, invoice.currency)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-1 text-[11px] italic text-[var(--text-muted)]">
            No payments recorded yet.
          </p>
        )}
      </div>

      {/* ── The acts row ────────────────────────────────────────────────── */}
      <div className="folio-no-print mt-5 border-t border-[var(--color-pearl)] pt-3">
        <DocumentActionGroup surfaceKey="accounts" regionKey="invoice-actions">
          {isDraft && (
            <DocumentAction
              actionKey="issue-and-send-invoice"
              variant="primary"
              disabled={busy}
              onClick={() => openPanel('send')}
            >
              Issue &amp; send
            </DocumentAction>
          )}
          {canRecordPayment && (
            <DocumentAction
              actionKey="record-invoice-payment"
              variant="primary"
              disabled={busy}
              onClick={() => openPanel('payment')}
            >
              Record payment
            </DocumentAction>
          )}
          {canResend && (
            <DocumentAction
              actionKey="resend-invoice"
              variant="secondary"
              disabled={busy}
              onClick={() => openPanel('resend')}
            >
              Resend
            </DocumentAction>
          )}
          {canVoid && (
            <DocumentAction
              actionKey="open-void-invoice"
              variant="tertiary"
              disabled={busy}
              onClick={() => openPanel('void')}
              className="text-[var(--color-terracotta)]"
            >
              Void
            </DocumentAction>
          )}
          {canPrint && (
            <DocumentAction
              actionKey="print-invoice"
              variant="tertiary"
              onClick={() => window.print()}
              className="ml-auto"
            >
              Print
            </DocumentAction>
          )}
        </DocumentActionGroup>

        {/* Quiet confirmation / R83 inline failure — at the act site. */}
        {note && (
          <p
            className={
              failed
                ? 'mt-2 rounded-[3px] border border-[rgba(196,131,111,0.4)] px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.05em]'
                : 'mt-2 font-mono text-[9px] uppercase tracking-[0.05em]'
            }
            style={{ color: failed ? TERRACOTTA_INK : SAGE_INK }}
          >
            {note}
          </p>
        )}

        {/* ── Inline act panels — one at a time, never a modal-on-modal ── */}
        {(act === 'send' || act === 'resend') && (
          <div className="mt-3 border-t border-dashed border-[var(--color-pearl)] pt-2.5">
            <p className="text-[11px] text-[var(--text-body,var(--color-charcoal))]">
              {act === 'send'
                ? 'Issuing assigns the number, locks the totals, and emails the invoice'
                : 'Sends the invoice email again'}
              {invoice.client?.email ? (
                <>
                  {' '}
                  — to{' '}
                  <span className="font-medium">{invoice.client.email}</span>.
                </>
              ) : (
                <> — to the client on this project.</>
              )}
            </p>
            <textarea
              rows={2}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="A short personal note in the email (optional)…"
              aria-label="Personal note"
              className={`${INPUT} mt-1.5 w-full resize-none`}
            />
            <DocumentActionGroup
              surfaceKey="accounts"
              regionKey="invoice-send-confirmation"
              className="mt-1.5"
            >
              <DocumentAction
                actionKey={
                  act === 'send' ? 'confirm-issue-and-send' : 'confirm-resend'
                }
                variant="primary"
                disabled={busy}
                loading={busy}
                loadingLabel="Sending…"
                onClick={() =>
                  void (act === 'send' ? doIssueAndSend() : doResend())
                }
              >
                {act === 'send' ? 'Issue & send' : 'Resend email'}
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-invoice-send"
                variant="tertiary"
                onClick={() => setAct(null)}
              >
                never mind
              </DocumentAction>
            </DocumentActionGroup>
          </div>
        )}

        {act === 'payment' && (
          <div className="mt-3 border-t border-dashed border-[var(--color-pearl)] pt-2.5">
            <p className="text-[11px] text-[var(--color-charcoal)]">
              Balance {formatCurrency(balance, invoice.currency)} — record a
              payment received outside Stripe.
            </p>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <label className="flex flex-col gap-0.5">
                <span className={LABEL}>amount ($)</span>
                <input
                  autoFocus
                  inputMode="decimal"
                  value={amountDollars}
                  onChange={(e) => setAmountDollars(e.target.value)}
                  placeholder={(balance / 100).toFixed(2)}
                  className={INPUT}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={LABEL}>method</span>
                <select
                  value={method}
                  onChange={(e) =>
                    setMethod(
                      e.target.value as Exclude<InvoicePaymentMethod, 'stripe'>,
                    )
                  }
                  className={`${INPUT} [&_option]:bg-[var(--doc-paper,#FAF7F2)]`}
                >
                  {MANUAL_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {INVOICE_PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={LABEL}>reference</span>
                <input
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="Check # / wire"
                  className={INPUT}
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className={LABEL}>received</span>
                <input
                  type="date"
                  value={receivedDate}
                  onChange={(e) => setReceivedDate(e.target.value)}
                  className={INPUT}
                />
              </label>
            </div>
            {amountCents > balance && (
              <p
                className="mt-1 font-mono text-[9px] uppercase tracking-[0.05em]"
                style={{ color: TERRACOTTA_INK }}
              >
                amount exceeds the remaining balance
              </p>
            )}
            <DocumentActionGroup
              surfaceKey="accounts"
              regionKey="invoice-payment-confirmation"
              className="mt-2"
            >
              <DocumentAction
                actionKey="confirm-record-payment"
                variant="primary"
                disabled={!paymentValid || busy}
                loading={busy}
                loadingLabel="Recording…"
                onClick={() => void doRecordPayment()}
              >
                Record payment
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-record-payment"
                variant="tertiary"
                onClick={() => setAct(null)}
              >
                never mind
              </DocumentAction>
            </DocumentActionGroup>
          </div>
        )}

        {act === 'void' && (
          <div className="mt-3 border-t border-dashed border-[var(--color-pearl)] pt-2.5">
            <p className="text-[11px] text-[var(--color-charcoal)]">
              Voiding releases any linked payment milestones and time entries so
              they can be billed again. This cannot be undone.
            </p>
            <textarea
              autoFocus
              rows={2}
              value={voidReason}
              onChange={(e) => setVoidReason(e.target.value)}
              placeholder="Reason (required) — duplicate, wrong amounts…"
              aria-label="Void reason"
              className={`${INPUT} mt-1.5 w-full resize-none`}
            />
            <DocumentActionGroup
              surfaceKey="accounts"
              regionKey="void-invoice-confirmation"
              className="mt-1.5"
            >
              <DocumentAction
                actionKey="confirm-void-invoice"
                variant="danger"
                disabled={!voidReason.trim() || busy}
                loading={busy}
                loadingLabel="Voiding…"
                onClick={() => void doVoid()}
              >
                Void invoice
              </DocumentAction>
              <DocumentAction
                actionKey="cancel-void-invoice"
                variant="tertiary"
                onClick={() => setAct(null)}
              >
                never mind
              </DocumentAction>
            </DocumentActionGroup>
          </div>
        )}
      </div>
    </div>
  );
}
