'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { useInvoices, type Invoice } from '@patina/supabase';
import {
  INVOICE_STATUS_LABELS,
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  isInvoiceOverdue,
  type InvoiceStatus,
} from '@patina/shared';
import { StrataMark } from '@/components/strata-mark';
import { QueryFailure } from '@/components/query-failure';

// Invoices across all of the client's projects. RLS scopes the query to
// issued (non-draft) invoices on projects where the signed-in user is the
// client — no client-side ownership filtering needed.

function statusLabel(invoice: Invoice): string {
  if (isInvoiceOverdue(invoice)) return 'Past due';
  const labels: Record<InvoiceStatus, string> = {
    ...INVOICE_STATUS_LABELS,
    sent: 'Awaiting payment',
    partially_paid: 'Partially paid',
  };
  return labels[invoice.status] ?? invoice.status;
}

function partitionInvoices(invoices: Invoice[] | undefined) {
  const list = (invoices ?? []).filter((i) => i.status !== 'draft');
  const open = list.filter((i) => i.status === 'sent' || i.status === 'partially_paid');
  const paid = list.filter((i) => i.status === 'paid');
  const archived = list.filter((i) => i.status === 'void');
  return { open, paid, archived };
}

export default function ClientInvoicesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      }
    >
      <InvoicesPageInner />
    </Suspense>
  );
}

function InvoicesPageInner() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get('project') ?? undefined;

  const { data, isLoading, isError, refetch } = useInvoices(
    projectId ? { projectId } : undefined
  );
  const { open, paid, archived } = partitionInvoices(data);
  const projectName = projectId
    ? (data ?? []).find((i) => i.project?.name)?.project?.name
    : undefined;

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="type-page-title">Your Invoices</h1>
      <p className="type-body mt-2">
        Invoices from your designer{projectName ? ` for ${projectName}` : ''}. Each one lists
        what&rsquo;s included, when payment is due, and what has been received so far.
      </p>
      {projectId && (
        <Link
          href="/invoices"
          className="type-meta mt-3 inline-flex items-center gap-1 text-[var(--accent-primary)] no-underline hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All invoices
        </Link>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-[var(--text-muted)]" />
        </div>
      )}

      {isError && !isLoading && (
        <QueryFailure
          className="mt-8"
          title="Unable to load invoices"
          message="Your invoice history is still there, but it could not be opened just now."
          onRetry={refetch}
        />
      )}

      {!isLoading && !isError && open.length === 0 && paid.length === 0 && archived.length === 0 && (
        <div className="py-16 text-center">
          <p className="type-body-small">
            No invoices yet. When your designer sends one, it will appear here.
          </p>
        </div>
      )}

      {open.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4 text-[var(--accent-primary)]">
            Awaiting payment ({open.length})
          </h2>
          <ul className="space-y-0">
            {open.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </ul>
        </section>
      )}

      {open.length > 0 && (paid.length > 0 || archived.length > 0) && <StrataMark variant="mini" />}

      {paid.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4 text-patina-sage">Paid ({paid.length})</h2>
          <ul className="space-y-0">
            {paid.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </ul>
        </section>
      )}

      {archived.length > 0 && (
        <section className="mt-8">
          <h2 className="type-meta mb-4">Archive ({archived.length})</h2>
          <ul className="space-y-0">
            {archived.map((invoice) => (
              <InvoiceRow key={invoice.id} invoice={invoice} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function InvoiceRow({ invoice }: { invoice: Invoice }) {
  const overdue = isInvoiceOverdue(invoice);
  const balance = invoiceBalanceCents(invoice);
  const showBalance = invoice.status === 'partially_paid';

  return (
    <li>
      <Link
        href={`/invoices/${invoice.id}`}
        className="block border-b border-[var(--border-default)] py-5 no-underline transition hover:bg-[var(--bg-surface)]"
      >
        <div className="flex items-baseline justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p
              className="type-meta"
              style={{ color: overdue ? 'var(--color-terracotta, #C77B6E)' : 'var(--text-muted)' }}
            >
              {statusLabel(invoice)}
              {invoice.sent_at && ` · sent ${formatInvoiceDate(invoice.sent_at)}`}
            </p>
            <h3 className="font-heading text-lg text-[var(--text-primary)]">
              {invoice.invoice_number ?? 'Invoice'}
            </h3>
            {invoice.project?.name && (
              <p className="type-body-small mt-1 truncate text-[var(--text-muted)]">
                {invoice.project.name}
              </p>
            )}
          </div>
          <div className="text-right">
            <p className="font-heading text-base text-[var(--text-primary)]">
              {invoice.status === 'void'
                ? '—'
                : formatCurrency(showBalance ? balance : invoice.total_cents, invoice.currency)}
            </p>
            {showBalance && (
              <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
                of {formatCurrency(invoice.total_cents, invoice.currency)}
              </p>
            )}
            {invoice.due_date && (invoice.status === 'sent' || invoice.status === 'partially_paid') && (
              <p className="type-meta-small mt-0.5 text-[var(--text-muted)]">
                Due {formatInvoiceDate(invoice.due_date)}
              </p>
            )}
          </div>
        </div>
      </Link>
    </li>
  );
}
