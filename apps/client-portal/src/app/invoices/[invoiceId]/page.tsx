'use client';

import { use } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Printer } from 'lucide-react';
import { useInvoice, type Invoice, type InvoicePayment } from '@patina/supabase';
import {
  INVOICE_PAYMENT_METHOD_LABELS,
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  isInvoiceOverdue,
} from '@patina/shared';

// Client-facing invoice detail. RLS only exposes issued (non-draft) invoices
// on the client's own projects, with their lines and payments. Payment itself
// is offline for now — no pay button until the Stripe wave.

function statusHeadline(invoice: Invoice, overdue: boolean): string {
  if (invoice.status === 'paid') return 'Paid in full';
  if (invoice.status === 'void') return 'Voided by your designer';
  if (overdue) return 'Past due';
  if (invoice.status === 'partially_paid') return 'Partially paid';
  return 'Awaiting payment';
}

export default function ClientInvoiceDetailPage({
  params,
}: {
  params: Promise<{ invoiceId: string }>;
}) {
  const { invoiceId } = use(params);
  const { data: invoice, isLoading } = useInvoice(invoiceId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
      </div>
    );
  }

  if (!invoice || invoice.status === 'draft') {
    return (
      <div className="mx-auto max-w-2xl px-6 py-16 text-center">
        <p className="type-body-small">Invoice not found.</p>
        <Link
          href="/invoices"
          className="type-meta mt-4 inline-flex items-center gap-1 text-[var(--accent-primary)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to invoices
        </Link>
      </div>
    );
  }

  const overdue = isInvoiceOverdue(invoice);
  const balance = invoiceBalanceCents(invoice);
  const succeededPayments = (invoice.payments ?? []).filter((p) => p.status === 'succeeded');
  const pendingPayments = (invoice.payments ?? []).filter((p) => p.status === 'pending');
  const designerName =
    invoice.designer?.full_name?.trim() ||
    invoice.designer?.business_name?.trim() ||
    'your designer';
  const taxPercent = (Number(invoice.tax_rate) * 100).toFixed(2).replace(/\.?0+$/, '');

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Link
        href="/invoices"
        className="type-meta inline-flex items-center gap-1 text-[var(--accent-primary)] no-underline hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to invoices
      </Link>

      <div className="mt-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p
            className="type-meta"
            style={{ color: overdue ? 'var(--color-terracotta, #C77B6E)' : 'var(--text-muted)' }}
          >
            {statusHeadline(invoice, overdue)}
          </p>
          <h1 className="type-page-title mt-1">{invoice.invoice_number ?? 'Invoice'}</h1>
          {invoice.project?.name && (
            <p className="type-body-small mt-1 text-[var(--text-muted)]">
              {invoice.project.name} · from {designerName}
            </p>
          )}
        </div>
        <Link
          href={`/invoices/${invoice.id}/print`}
          className="type-meta inline-flex min-h-[44px] items-center gap-2 rounded-md border border-[var(--border-default)] px-4 no-underline transition hover:bg-[var(--bg-surface)]"
        >
          <Printer className="h-3.5 w-3.5" aria-hidden />
          Print / save PDF
        </Link>
      </div>

      {/* Amount summary */}
      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Total</p>
          <p className="type-data-large mt-1">
            {formatCurrency(invoice.total_cents, invoice.currency)}
          </p>
        </div>
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Paid</p>
          <p className="type-data-large mt-1">
            {formatCurrency(invoice.amount_paid_cents, invoice.currency)}
          </p>
        </div>
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">{invoice.status === 'void' ? 'Status' : 'Balance'}</p>
          <p className="type-data-large mt-1">
            {invoice.status === 'void' ? 'Void' : formatCurrency(balance, invoice.currency)}
          </p>
          {invoice.due_date && balance > 0 && invoice.status !== 'void' && (
            <p
              className="type-meta-small mt-1"
              style={{ color: overdue ? 'var(--color-terracotta, #C77B6E)' : 'var(--text-muted)' }}
            >
              Due {formatInvoiceDate(invoice.due_date)}
            </p>
          )}
        </div>
      </div>

      {pendingPayments.length > 0 && (
        <p className="type-body-small mt-4 rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-3 text-[var(--text-muted)]">
          A payment of{' '}
          {formatCurrency(
            pendingPayments.reduce((sum, p) => sum + p.amount_cents, 0),
            invoice.currency
          )}{' '}
          is processing. The balance above will update once it clears.
        </p>
      )}

      {/* Line items */}
      <section className="mt-10">
        <h2 className="type-section-head">What&rsquo;s included</h2>
        <div className="mt-4">
          {(invoice.line_items ?? []).map((line) => (
            <div
              key={line.id}
              className="flex items-baseline justify-between gap-4 border-b border-[var(--border-subtle,var(--border-default))] py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text-primary)]">{line.description}</p>
                {Number(line.quantity) !== 1 && (
                  <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
                    {Number(line.quantity)} × {formatCurrency(line.unit_amount_cents, invoice.currency)}
                  </p>
                )}
              </div>
              <span className="type-label text-[var(--text-primary)]">
                {formatCurrency(line.amount_cents, invoice.currency)}
              </span>
            </div>
          ))}

          <div className="ml-auto mt-4 max-w-xs">
            <div className="flex justify-between py-0.5">
              <span className="type-meta-small">Subtotal</span>
              <span className="type-label">
                {formatCurrency(invoice.subtotal_cents, invoice.currency)}
              </span>
            </div>
            <div className="flex justify-between py-0.5">
              <span className="type-meta-small">Tax{taxPercent ? ` (${taxPercent}%)` : ''}</span>
              <span className="type-label">
                {formatCurrency(invoice.tax_cents, invoice.currency)}
              </span>
            </div>
            <div className="flex justify-between border-t border-[var(--border-default)] py-1.5">
              <span className="type-label">Total</span>
              <span className="font-heading text-base font-semibold text-[var(--text-primary)]">
                {formatCurrency(invoice.total_cents, invoice.currency)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Note from the designer + how to pay */}
      {invoice.memo && (
        <section className="mt-10">
          <h2 className="type-section-head">A note from {designerName}</h2>
          <p className="type-body mt-3 whitespace-pre-line">{invoice.memo}</p>
          {balance > 0 && invoice.status !== 'void' && (
            <p className="type-body-small mt-3 text-[var(--text-muted)]">
              Your designer accepts payment by check or wire — payment details are on the invoice.
            </p>
          )}
        </section>
      )}

      {/* Payments received */}
      <section className="mt-10">
        <h2 className="type-section-head">Payments</h2>
        {succeededPayments.length > 0 || pendingPayments.length > 0 ? (
          <div className="mt-4">
            {[...succeededPayments, ...pendingPayments].map((payment) => (
              <PaymentRow key={payment.id} payment={payment} currency={invoice.currency} />
            ))}
          </div>
        ) : (
          <p className="type-body-small mt-3 text-[var(--text-muted)]">
            No payments recorded yet.
          </p>
        )}
      </section>

      {invoice.status === 'void' && (
        <p className="type-body-small mt-10 text-[var(--text-muted)]">
          This invoice was voided{invoice.voided_at ? ` on ${formatInvoiceDate(invoice.voided_at)}` : ''}
          {' '}— nothing is owed on it. Reach out to {designerName} with any questions.
        </p>
      )}
    </div>
  );
}

function PaymentRow({ payment, currency }: { payment: InvoicePayment; currency: string }) {
  const pending = payment.status === 'pending';
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-[var(--border-subtle,var(--border-default))] py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-[var(--text-primary)]">
          {INVOICE_PAYMENT_METHOD_LABELS[payment.method]}
          {payment.reference ? ` · ${payment.reference}` : ''}
        </p>
        <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
          {pending
            ? 'Payment processing'
            : `Received ${formatInvoiceDate(payment.received_at ?? payment.created_at)}`}
        </p>
      </div>
      <span className="type-label text-[var(--text-primary)]">
        {formatCurrency(payment.amount_cents, currency)}
      </span>
    </div>
  );
}
