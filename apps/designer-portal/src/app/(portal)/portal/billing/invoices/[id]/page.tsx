'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  useInvoice,
  useIssueInvoice,
  useSendInvoice,
  useRecordPayment,
  useVoidInvoice,
  type Invoice,
  type InvoicePaymentMethod,
} from '@patina/supabase';
import {
  INVOICE_STATUS_LABELS,
  INVOICE_PAYMENT_METHOD_LABELS,
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  isInvoiceOverdue,
  timeLineHoursLabel,
} from '@patina/shared';
import { PageActionBar } from '@/components/portal/page-action-bar';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useToast } from '@/components/portal/toast-provider';
import {
  Button,
  Input,
  Select,
  Textarea,
  StatusBadge,
  type StatusTone,
} from '@/components/ui/controls';
import { useHydrated } from '@/hooks/use-hydrated';
import { invoiceStatusToTone } from '@/lib/invoice-ui';

const MANUAL_METHODS: Exclude<InvoicePaymentMethod, 'stripe'>[] = [
  'check',
  'wire',
  'ach_manual',
  'cash',
  'other',
];

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-meta)',
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  color: 'var(--text-muted)',
};

function dollarsToCents(value: string): number {
  const parsed = parseFloat(value.replace(/[^0-9.\-]/g, ''));
  return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const hydrated = useHydrated();
  const { toast } = useToast();

  const { data: invoice, isLoading } = useInvoice(id);
  const issueInvoice = useIssueInvoice();
  const sendInvoice = useSendInvoice();
  const voidInvoice = useVoidInvoice();

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [sendDialogMode, setSendDialogMode] = useState<'issue' | 'resend' | null>(null);

  if (!hydrated || isLoading) return <LoadingStrata />;
  if (!invoice) {
    return (
      <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
        Invoice not found.
      </p>
    );
  }

  const overdue = isInvoiceOverdue(invoice);
  const balance = invoiceBalanceCents(invoice);
  const isDraft = invoice.status === 'draft';
  const canRecordPayment = invoice.status === 'sent' || invoice.status === 'partially_paid';
  const canVoid =
    ['draft', 'sent', 'partially_paid'].includes(invoice.status) &&
    invoice.amount_paid_cents === 0;

  const canResend = invoice.status === 'sent' || invoice.status === 'partially_paid';

  // Issue & Send: issue_invoice RPC first (number, totals, milestone flips),
  // then the invoice-send edge function. A send failure does NOT roll back the
  // issue — the designer can Resend from the now-issued invoice.
  const handleIssueAndSend = async (message?: string) => {
    let issued: Invoice;
    try {
      issued = await issueInvoice.mutateAsync({
        invoiceId: invoice.id,
        projectId: invoice.project_id,
      });
      toast(`Invoice ${issued.invoice_number} issued`, 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to issue invoice', 'error');
      return;
    }
    try {
      const result = await sendInvoice.mutateAsync({
        invoiceId: invoice.id,
        projectId: invoice.project_id,
        message,
      });
      toast(
        result.emailSent ? `Invoice emailed to ${result.recipient}` : 'Invoice issued — email skipped',
        result.emailSent ? 'success' : 'info'
      );
    } catch (e) {
      toast(
        e instanceof Error
          ? `Issued, but the email failed: ${e.message}. Use Resend to retry.`
          : 'Issued, but the email failed. Use Resend to retry.',
        'error'
      );
    }
    setSendDialogMode(null);
  };

  const handleResend = async (message?: string) => {
    try {
      const result = await sendInvoice.mutateAsync({
        invoiceId: invoice.id,
        projectId: invoice.project_id,
        message,
      });
      toast(
        result.emailSent ? `Invoice emailed to ${result.recipient}` : 'Email skipped (recipient suppressed)',
        result.emailSent ? 'success' : 'info'
      );
      setSendDialogMode(null);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to send invoice', 'error');
    }
  };

  return (
    <div className="pt-8">
      <PageActionBar
        status={{
          tone: invoiceStatusToTone(invoice.status, overdue),
          label: overdue ? 'Overdue' : INVOICE_STATUS_LABELS[invoice.status],
          dot: true,
        }}
        meta={
          <>
            <span className="type-label text-[var(--text-primary)]">
              {invoice.invoice_number ?? 'Draft invoice'}
            </span>
            {invoice.project && (
              <Link
                href={`/portal/projects/${invoice.project.id}`}
                className="type-meta-small text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
              >
                {invoice.project.name}
              </Link>
            )}
            {invoice.client?.full_name && (
              <span className="type-meta-small text-[var(--text-muted)]">
                {invoice.client.full_name}
              </span>
            )}
          </>
        }
        actions={
          <>
            {isDraft && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setSendDialogMode('issue')}
              >
                Issue &amp; Send
              </Button>
            )}
            {canResend && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setSendDialogMode('resend')}
              >
                Resend
              </Button>
            )}
            {canRecordPayment && (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => setShowPaymentModal(true)}
              >
                Record payment
              </Button>
            )}
            {!isDraft && invoice.status !== 'void' && (
              <Button asChild variant="secondary" size="sm">
                <Link href={`/portal/billing/invoices/${invoice.id}/print`}>Print</Link>
              </Button>
            )}
            {canVoid && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowVoidDialog(true)}
              >
                Void
              </Button>
            )}
          </>
        }
      />

      {/* Status timeline */}
      <StatusTimeline invoice={invoice} />

      {/* Key dates + balance strip */}
      <div className="mb-8 flex flex-wrap gap-8 border-b border-[var(--border-subtle)] pb-6">
        <div>
          <div style={labelStyle}>Issued</div>
          <div className="type-body text-[0.9rem]">{formatInvoiceDate(invoice.issue_date)}</div>
        </div>
        <div>
          <div style={labelStyle}>Due</div>
          <div
            className="type-body text-[0.9rem]"
            style={{ color: overdue ? 'var(--color-error)' : undefined }}
          >
            {formatInvoiceDate(invoice.due_date)}
            {isDraft && ` (net ${invoice.payment_terms_days})`}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Total</div>
          <div className="font-heading text-[0.95rem] font-semibold">
            {formatCurrency(invoice.total_cents, invoice.currency)}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Paid</div>
          <div className="font-heading text-[0.95rem]">
            {formatCurrency(invoice.amount_paid_cents, invoice.currency)}
          </div>
        </div>
        <div>
          <div style={labelStyle}>Balance</div>
          <div
            className="font-heading text-[0.95rem] font-semibold"
            style={{ color: balance > 0 && !isDraft ? 'var(--color-terracotta)' : 'var(--color-sage)' }}
          >
            {invoice.status === 'void' ? '—' : formatCurrency(balance, invoice.currency)}
          </div>
        </div>
      </div>

      {invoice.status === 'void' && invoice.void_reason && (
        <p className="type-body mb-8 rounded-md border border-[var(--border-default)] bg-[var(--bg-hover)] p-3 text-[0.82rem] text-[var(--text-muted)]">
          Voided {formatInvoiceDate(invoice.voided_at)} — {invoice.void_reason}
        </p>
      )}

      {/* Line items */}
      <h3 className="mb-2" style={labelStyle}>
        Line Items
      </h3>
      <div className="mb-8">
        <div
          className="grid items-center gap-4 border-b border-[var(--border-subtle)] py-1.5"
          style={{ gridTemplateColumns: '1fr 70px 110px 110px' }}
        >
          <span className="type-meta-small">Description</span>
          <span className="type-meta-small text-right">Qty</span>
          <span className="type-meta-small text-right">Unit</span>
          <span className="type-meta-small text-right">Amount</span>
        </div>
        {(invoice.line_items ?? []).map((line) => (
          <div
            key={line.id}
            className="grid items-center gap-4 border-b border-[var(--border-subtle)] py-2.5"
            style={{ gridTemplateColumns: '1fr 70px 110px 110px' }}
          >
            <div className="min-w-0">
              <span className="type-body text-[0.85rem]">{line.description}</span>
              {line.kind === 'milestone' && (
                <span className="type-meta-small ml-2 text-[var(--text-muted)]">milestone</span>
              )}
              {line.kind === 'time' && (
                <span className="type-meta-small ml-2 text-[var(--text-muted)]">
                  logged time
                  {timeLineHoursLabel(line.metadata) ? ` · ${timeLineHoursLabel(line.metadata)}` : ''}
                </span>
              )}
            </div>
            {/* Time lines are a single rolled-up amount (qty 1, unit = total);
                showing "1 × $X" would read like an hourly rate, so dash both. */}
            <span className="type-body text-right text-[0.85rem]">
              {line.kind === 'time' ? '—' : Number(line.quantity)}
            </span>
            <span className="type-body text-right text-[0.85rem]">
              {line.kind === 'time'
                ? '—'
                : formatCurrency(line.unit_amount_cents, invoice.currency)}
            </span>
            <span className="text-right font-heading text-[0.85rem]">
              {formatCurrency(line.amount_cents, invoice.currency)}
            </span>
          </div>
        ))}
        {/* Totals */}
        <div className="ml-auto mt-3 max-w-xs">
          <div className="flex justify-between py-0.5">
            <span className="type-meta-small">Subtotal</span>
            <span className="font-heading text-[0.85rem]">
              {formatCurrency(invoice.subtotal_cents, invoice.currency)}
            </span>
          </div>
          <div className="flex justify-between py-0.5">
            <span className="type-meta-small">
              Tax ({(Number(invoice.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '')}%)
            </span>
            <span className="font-heading text-[0.85rem]">
              {formatCurrency(invoice.tax_cents, invoice.currency)}
            </span>
          </div>
          <div className="flex justify-between border-t border-[var(--border-subtle)] py-1.5">
            <span className="type-label">Total</span>
            <span className="font-heading text-[1rem] font-semibold">
              {formatCurrency(invoice.total_cents, invoice.currency)}
            </span>
          </div>
        </div>
      </div>

      {invoice.memo && (
        <div className="mb-8 max-w-xl">
          <h3 className="mb-1" style={labelStyle}>
            Memo
          </h3>
          <p className="type-body text-[0.85rem] text-[var(--text-body)]">{invoice.memo}</p>
        </div>
      )}

      {/* Payments history */}
      <h3 className="mb-2" style={labelStyle}>
        Payments
      </h3>
      {(invoice.payments ?? []).length > 0 ? (
        <div className="mb-12">
          <div
            className="grid items-center gap-4 border-b border-[var(--border-subtle)] py-1.5"
            style={{ gridTemplateColumns: '120px 1fr 120px 110px' }}
          >
            <span className="type-meta-small">Received</span>
            <span className="type-meta-small">Method · Reference</span>
            <span className="type-meta-small text-right">Status</span>
            <span className="type-meta-small text-right">Amount</span>
          </div>
          {(invoice.payments ?? []).map((payment) => (
            <div
              key={payment.id}
              className="grid items-center gap-4 border-b border-[var(--border-subtle)] py-2.5"
              style={{ gridTemplateColumns: '120px 1fr 120px 110px' }}
            >
              <span className="type-body text-[0.85rem]">
                {formatInvoiceDate(payment.received_at ?? payment.created_at)}
              </span>
              <span className="type-body min-w-0 truncate text-[0.85rem]">
                {INVOICE_PAYMENT_METHOD_LABELS[payment.method]}
                {payment.reference && (
                  <span className="ml-2 text-[var(--text-muted)]">{payment.reference}</span>
                )}
                {payment.note && (
                  <span className="ml-2 italic text-[var(--text-muted)]">{payment.note}</span>
                )}
              </span>
              <span className="flex justify-end">
                <StatusBadge tone={paymentStatusTone(payment.status)}>
                  {payment.status}
                </StatusBadge>
              </span>
              <span className="text-right font-heading text-[0.85rem]">
                {formatCurrency(payment.amount_cents, invoice.currency)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body mb-12 py-2 text-[0.82rem] italic text-[var(--text-muted)]">
          No payments recorded yet.
        </p>
      )}

      <SendDialog
        mode={sendDialogMode}
        invoice={invoice}
        pending={issueInvoice.isPending || sendInvoice.isPending}
        onClose={() => setSendDialogMode(null)}
        onConfirm={(message) =>
          sendDialogMode === 'issue' ? handleIssueAndSend(message) : handleResend(message)
        }
      />

      <RecordPaymentModal
        open={showPaymentModal}
        invoice={invoice}
        onClose={() => setShowPaymentModal(false)}
      />

      <VoidDialog
        open={showVoidDialog}
        invoice={invoice}
        pending={voidInvoice.isPending}
        onClose={() => setShowVoidDialog(false)}
        onConfirm={async (reason) => {
          try {
            await voidInvoice.mutateAsync({
              invoiceId: invoice.id,
              projectId: invoice.project_id,
              reason,
            });
            toast('Invoice voided', 'info');
            setShowVoidDialog(false);
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Failed to void invoice', 'error');
          }
        }}
      />
    </div>
  );
}

function paymentStatusTone(status: string): StatusTone {
  switch (status) {
    case 'succeeded':
      return 'success';
    case 'failed':
      return 'error';
    case 'refunded':
      return 'warning';
    default:
      return 'neutral';
  }
}

/** Chip timeline: created → sent → (partially paid) → paid | void. */
function StatusTimeline({ invoice }: { invoice: Invoice }) {
  const steps: Array<{ label: string; date: string | null; reached: boolean; tone: StatusTone }> = [
    { label: 'Created', date: invoice.created_at, reached: true, tone: 'neutral' },
    {
      label: 'Sent',
      date: invoice.sent_at,
      reached: !!invoice.sent_at,
      tone: 'warning',
    },
  ];
  if (invoice.status === 'void') {
    steps.push({ label: 'Void', date: invoice.voided_at, reached: true, tone: 'error' });
  } else {
    if (invoice.status === 'partially_paid' || invoice.amount_paid_cents > 0) {
      steps.push({
        label: 'Partially paid',
        date: null,
        reached: invoice.amount_paid_cents > 0,
        tone: 'info',
      });
    }
    steps.push({
      label: 'Paid',
      date: invoice.paid_at,
      reached: invoice.status === 'paid',
      tone: 'success',
    });
  }

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {steps.map((step, i) => (
        <span key={step.label} className="flex items-center gap-2">
          {i > 0 && <span className="text-[var(--text-muted)] opacity-40">→</span>}
          <StatusBadge tone={step.reached ? step.tone : 'neutral'} dot={step.reached}>
            {step.label}
            {step.reached && step.date ? ` · ${formatInvoiceDate(step.date)}` : ''}
          </StatusBadge>
        </span>
      ))}
    </div>
  );
}

/**
 * Issue & Send / Resend confirmation with an optional personal note that
 * lands as a quoted block in the client's email.
 */
function SendDialog({
  mode,
  invoice,
  pending,
  onClose,
  onConfirm,
}: {
  mode: 'issue' | 'resend' | null;
  invoice: Invoice;
  pending: boolean;
  onClose: () => void;
  onConfirm: (message?: string) => void;
}) {
  const [message, setMessage] = useState('');

  if (!mode) return null;

  const isIssue = mode === 'issue';
  const recipient = invoice.client?.email;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-md rounded-md border bg-[var(--bg-surface)] p-5"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.1rem',
            fontWeight: 600,
            marginBottom: '0.25rem',
          }}
        >
          {isIssue ? 'Issue & Send' : `Resend ${invoice.invoice_number ?? 'invoice'}`}
        </h3>
        <p
          className="type-body"
          style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}
        >
          {isIssue
            ? 'Issuing assigns the invoice number, locks the totals, and emails the invoice to your client.'
            : 'Sends the invoice email to your client again.'}
          {recipient ? (
            <>
              {' '}
              It will go to <strong>{recipient}</strong>.
            </>
          ) : (
            <> We&rsquo;ll email the client on this project.</>
          )}
        </p>

        <div className="mb-1" style={labelStyle}>
          Personal note (optional)
        </div>
        <Textarea
          autoFocus
          rows={3}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="A short note included in the email…"
        />

        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={pending}
            loading={pending}
            onClick={() => onConfirm(message.trim() || undefined)}
          >
            {isIssue ? 'Issue & send' : 'Resend email'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function RecordPaymentModal({
  open,
  invoice,
  onClose,
}: {
  open: boolean;
  invoice: Invoice;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const recordPayment = useRecordPayment();
  const balance = invoiceBalanceCents(invoice);

  const [amountDollars, setAmountDollars] = useState('');
  const [method, setMethod] = useState<Exclude<InvoicePaymentMethod, 'stripe'>>('check');
  const [reference, setReference] = useState('');
  const [receivedDate, setReceivedDate] = useState(() => new Date().toISOString().slice(0, 10));

  if (!open) return null;

  const amountCents = dollarsToCents(amountDollars);
  const valid = amountCents > 0 && amountCents <= balance && !!receivedDate;

  const submit = async () => {
    try {
      await recordPayment.mutateAsync({
        invoiceId: invoice.id,
        projectId: invoice.project_id,
        amountCents,
        method,
        reference: reference.trim() || undefined,
        receivedAt: new Date(`${receivedDate}T12:00:00`).toISOString(),
      });
      toast(`Payment of ${formatCurrency(amountCents)} recorded`, 'success');
      setAmountDollars('');
      setReference('');
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to record payment', 'error');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-md rounded-md border bg-[var(--bg-surface)] p-5"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.1rem',
            fontWeight: 600,
            marginBottom: '0.25rem',
          }}
        >
          Record Payment
        </h3>
        <p
          className="type-body"
          style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}
        >
          {invoice.invoice_number} · balance {formatCurrency(balance, invoice.currency)}
        </p>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <div>
            <div className="mb-1" style={labelStyle}>
              Amount ($)
            </div>
            <Input
              autoFocus
              inputMode="decimal"
              value={amountDollars}
              onChange={(e) => setAmountDollars(e.target.value)}
              placeholder={(balance / 100).toFixed(2)}
            />
          </div>
          <div>
            <div className="mb-1" style={labelStyle}>
              Method
            </div>
            <Select
              value={method}
              onChange={(e) =>
                setMethod(e.target.value as Exclude<InvoicePaymentMethod, 'stripe'>)
              }
            >
              {MANUAL_METHODS.map((m) => (
                <option key={m} value={m}>
                  {INVOICE_PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <div className="mb-1" style={labelStyle}>
              Reference
            </div>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Check # / wire confirmation"
            />
          </div>
          <div>
            <div className="mb-1" style={labelStyle}>
              Received
            </div>
            <Input
              type="date"
              value={receivedDate}
              onChange={(e) => setReceivedDate(e.target.value)}
            />
          </div>
        </div>

        {amountCents > balance && (
          <p className="type-body mb-2 text-[0.78rem] text-[var(--color-error)]">
            Amount exceeds the remaining balance.
          </p>
        )}

        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            disabled={!valid || recordPayment.isPending}
            loading={recordPayment.isPending}
            onClick={submit}
          >
            Record payment
          </Button>
        </div>
      </div>
    </div>
  );
}

function VoidDialog({
  open,
  invoice,
  pending,
  onClose,
  onConfirm,
}: {
  open: boolean;
  invoice: Invoice;
  pending: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={onClose}
    >
      <div
        className="w-[90vw] max-w-md rounded-md border bg-[var(--bg-surface)] p-5"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          style={{
            fontFamily: 'var(--font-heading)',
            fontSize: '1.1rem',
            fontWeight: 600,
            marginBottom: '0.25rem',
          }}
        >
          Void {invoice.invoice_number ?? 'this draft'}?
        </h3>
        <p
          className="type-body"
          style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}
        >
          Voiding releases any linked payment milestones and time entries so they can be billed
          again. This cannot be undone.
        </p>
        <Textarea
          autoFocus
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Reason (required) — e.g. duplicate, wrong amounts…"
        />
        <div className="mt-3 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={!reason.trim() || pending}
            loading={pending}
            onClick={() => onConfirm(reason.trim())}
          >
            Void invoice
          </Button>
        </div>
      </div>
    </div>
  );
}
