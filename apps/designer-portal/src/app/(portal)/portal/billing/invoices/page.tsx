'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useInvoices, type Invoice } from '@patina/supabase';
import {
  INVOICE_STATUS_LABELS,
  formatCurrency,
  formatInvoiceDate,
  invoiceBalanceCents,
  isInvoiceOverdue,
  type InvoiceStatus,
} from '@patina/shared';
import { ListPageHeader } from '@/components/portal/list-page-header';
import { MetricsRow } from '@/components/portal/metrics-row';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { Button, FilterPill, StatusBadge } from '@/components/ui/controls';
import { useHydrated } from '@/hooks/use-hydrated';
import { invoiceStatusToTone } from '@/lib/invoice-ui';

type FilterKey = 'all' | InvoiceStatus | 'overdue';

const STATUS_FILTERS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Drafts' },
  { key: 'sent', label: 'Sent' },
  { key: 'partially_paid', label: 'Partially paid' },
  { key: 'paid', label: 'Paid' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'void', label: 'Void' },
];

export default function InvoicesPage() {
  const router = useRouter();
  const hydrated = useHydrated();
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all');

  // Fetch unfiltered and slice client-side: the totals strip needs the full
  // set regardless of the active pill, and designer invoice volumes are small.
  const { data: invoices, isLoading } = useInvoices();

  const filtered = useMemo(() => {
    const rows = invoices ?? [];
    if (activeFilter === 'all') return rows;
    if (activeFilter === 'overdue') return rows.filter((inv) => isInvoiceOverdue(inv));
    return rows.filter((inv) => inv.status === activeFilter);
  }, [invoices, activeFilter]);

  const filterCounts = useMemo(() => {
    const rows = invoices ?? [];
    const counts: Record<FilterKey, number> = {
      all: rows.length,
      draft: 0,
      sent: 0,
      partially_paid: 0,
      paid: 0,
      void: 0,
      overdue: rows.filter((inv) => isInvoiceOverdue(inv)).length,
    };
    for (const inv of rows) counts[inv.status] += 1;
    return counts;
  }, [invoices]);

  const metrics = useMemo(() => {
    const rows = invoices ?? [];
    const live = rows.filter((inv) => inv.status === 'sent' || inv.status === 'partially_paid');
    const outstanding = live.reduce((sum, inv) => sum + invoiceBalanceCents(inv), 0);
    const overdueRows = live.filter((inv) => isInvoiceOverdue(inv));
    const overdue = overdueRows.reduce((sum, inv) => sum + invoiceBalanceCents(inv), 0);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    const collectedThisMonth = rows.reduce(
      (sum, inv) =>
        sum +
        (inv.payments ?? [])
          .filter(
            (p) =>
              p.status === 'succeeded' &&
              p.received_at &&
              new Date(p.received_at) >= monthStart
          )
          .reduce((s, p) => s + p.amount_cents, 0),
      0
    );

    return [
      {
        label: 'Outstanding',
        value: formatCurrency(outstanding),
        subtitle: `${live.length} open invoice${live.length === 1 ? '' : 's'}`,
        trend: 'neutral' as const,
      },
      {
        label: 'Overdue',
        value: formatCurrency(overdue),
        subtitle:
          overdueRows.length > 0
            ? `${overdueRows.length} past due`
            : 'nothing past due',
        trend: overdueRows.length > 0 ? ('down' as const) : ('neutral' as const),
      },
      {
        label: 'Collected This Month',
        value: formatCurrency(collectedThisMonth),
        subtitle: undefined,
        trend: 'up' as const,
      },
    ];
  }, [invoices]);

  // Skeleton until hydrated so SSR (empty cache) and first client paint (warm
  // singleton cache) render the same tree — prevents hydration mismatch.
  if (!hydrated || isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <ListPageHeader
        title="Invoices"
        subtitle="Design-fee billing across your projects"
        actions={
          <Button
            variant="primary"
            onClick={() => router.push('/portal/billing/invoices/new')}
          >
            + New Invoice
          </Button>
        }
      />

      {/* Totals strip */}
      <MetricsRow metrics={metrics} />

      {/* Status filter pills */}
      <div className="mb-6 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <FilterPill
            key={f.key}
            active={activeFilter === f.key}
            count={filterCounts[f.key]}
            onClick={() => setActiveFilter(f.key)}
          >
            {f.label}
          </FilterPill>
        ))}
      </div>

      {/* Column headers */}
      <div
        className="grid items-center gap-6 border-b border-[var(--border-subtle)] py-1.5"
        style={{ gridTemplateColumns: '1fr 110px 110px 110px 130px' }}
      >
        <span className="type-meta-small">Invoice</span>
        <span className="type-meta-small text-right">Due</span>
        <span className="type-meta-small text-right">Total</span>
        <span className="type-meta-small text-right">Balance</span>
        <span className="type-meta-small text-right">Status</span>
      </div>

      {filtered.length > 0 ? (
        <div>
          {filtered.map((invoice) => (
            <InvoiceListRow key={invoice.id} invoice={invoice} />
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          {activeFilter === 'all'
            ? 'No invoices yet. Create your first invoice to bill a project milestone or design fee.'
            : 'No invoices match this filter.'}
        </p>
      )}
    </div>
  );
}

function InvoiceListRow({ invoice }: { invoice: Invoice }) {
  const overdue = isInvoiceOverdue(invoice);
  const balance = invoiceBalanceCents(invoice);
  const subtitleParts: string[] = [];
  if (invoice.project?.name) subtitleParts.push(invoice.project.name);
  if (invoice.client?.full_name) subtitleParts.push(invoice.client.full_name);
  if (invoice.issue_date) subtitleParts.push(`Issued ${formatInvoiceDate(invoice.issue_date)}`);

  return (
    <Link
      href={`/portal/billing/invoices/${invoice.id}`}
      className="grid items-center gap-6 border-b border-[var(--border-subtle)] py-3 no-underline transition-colors hover:bg-[var(--bg-hover)]"
      style={{ gridTemplateColumns: '1fr 110px 110px 110px 130px' }}
    >
      <div className="min-w-0">
        <div className="type-label truncate text-[var(--text-primary)]">
          {invoice.invoice_number ?? 'Draft'}
          {invoice.memo && (
            <span className="ml-2 font-normal text-[var(--text-muted)]">{invoice.memo}</span>
          )}
        </div>
        {subtitleParts.length > 0 && (
          <div className="type-meta-small mt-0.5 truncate text-[var(--text-muted)]">
            {subtitleParts.join(' · ')}
          </div>
        )}
      </div>
      <span
        className="type-meta-small text-right"
        style={{ color: overdue ? 'var(--color-error)' : 'var(--text-muted)' }}
      >
        {formatInvoiceDate(invoice.due_date)}
      </span>
      <span className="text-right font-heading text-[0.9rem] text-[var(--text-primary)]">
        {formatCurrency(invoice.total_cents, invoice.currency)}
      </span>
      <span className="text-right font-heading text-[0.9rem] text-[var(--text-muted)]">
        {invoice.status === 'void' ? '—' : formatCurrency(balance, invoice.currency)}
      </span>
      <span className="flex justify-end">
        <StatusBadge tone={invoiceStatusToTone(invoice.status, overdue)} dot>
          {overdue ? 'Overdue' : INVOICE_STATUS_LABELS[invoice.status]}
        </StatusBadge>
      </span>
    </Link>
  );
}
