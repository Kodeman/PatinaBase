'use client';

import Link from 'next/link';
import { Receipt } from 'lucide-react';
import { useProjectInvoices, type Invoice } from '@patina/supabase';
import {
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  isInvoiceOverdue,
} from '@patina/shared';

interface ProjectInvoicesSummaryProps {
  projectId: string;
}

/**
 * Invoices card on the client project page — sits with the other financial
 * panels (BudgetOverview). RLS limits the query to issued (non-draft)
 * invoices on the client's own project; renders nothing when there are none.
 */
export function ProjectInvoicesSummary({ projectId }: ProjectInvoicesSummaryProps) {
  const { data, isLoading } = useProjectInvoices(projectId);

  const invoices = (data ?? []).filter((i) => i.status !== 'draft' && i.status !== 'void');

  if (isLoading) {
    return (
      <div className="py-6">
        <div className="h-4 w-32 animate-pulse rounded bg-[var(--color-pearl)]" />
      </div>
    );
  }

  if (invoices.length === 0) {
    return null;
  }

  const open = invoices.filter((i) => i.status === 'sent' || i.status === 'partially_paid');
  const outstandingCents = open.reduce((sum, i) => sum + invoiceBalanceCents(i), 0);
  const paidCents = invoices.reduce((sum, i) => sum + (i.amount_paid_cents || 0), 0);
  const recent = invoices.slice(0, 3);

  return (
    <div className="mt-8">
      <div className="flex items-baseline justify-between">
        <h3 className="type-section-head">Invoices</h3>
        <Link
          href={`/invoices?project=${projectId}`}
          className="type-meta text-[var(--accent-primary)] no-underline hover:underline"
        >
          View all ({invoices.length})
        </Link>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Outstanding</p>
          <p className="type-data-large mt-1">{formatCurrency(outstandingCents)}</p>
        </div>
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Paid to Date</p>
          <p className="type-data-large mt-1">{formatCurrency(paidCents)}</p>
        </div>
        <div className="border-b border-[var(--border-default)] pb-4">
          <p className="type-meta">Awaiting payment</p>
          <p className="type-data-large mt-1">{open.length}</p>
        </div>
      </div>

      <div className="mt-4 space-y-0">
        {recent.map((invoice) => (
          <SummaryRow key={invoice.id} invoice={invoice} />
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ invoice }: { invoice: Invoice }) {
  const overdue = isInvoiceOverdue(invoice);
  const open = invoice.status === 'sent' || invoice.status === 'partially_paid';

  return (
    <Link
      href={`/invoices/${invoice.id}`}
      className="flex items-center justify-between border-b border-[var(--border-subtle)] py-3 no-underline transition hover:bg-[var(--bg-surface)]"
    >
      <div className="flex min-w-0 items-center gap-3">
        <Receipt className="h-3.5 w-3.5 flex-shrink-0 text-[var(--accent-primary)]" aria-hidden />
        <div className="min-w-0">
          <p className="truncate text-sm text-[var(--text-primary)]">
            {invoice.invoice_number ?? 'Invoice'}
          </p>
          <p
            className="type-meta-small mt-0.5"
            style={{ color: overdue ? 'var(--color-terracotta, #C77B6E)' : 'var(--text-muted)' }}
          >
            {invoice.status === 'paid'
              ? `Paid ${formatInvoiceDate(invoice.paid_at)}`
              : overdue
                ? `Past due · was due ${formatInvoiceDate(invoice.due_date)}`
                : `Due ${formatInvoiceDate(invoice.due_date)}`}
          </p>
        </div>
      </div>
      <span className="type-label text-[var(--text-primary)]">
        {formatCurrency(
          open ? invoiceBalanceCents(invoice) : invoice.total_cents,
          invoice.currency
        )}
      </span>
    </Link>
  );
}
