'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  useArAging,
  useSendInvoice,
  invoiceDaysOverdue,
  type Invoice,
} from '@patina/supabase';
import { formatCurrency, formatInvoiceDate, invoiceBalanceCents } from '@patina/shared';
import { ListPageHeader } from '@/components/portal/list-page-header';
import { MetricsRow } from '@/components/portal/metrics-row';
import { LoadingStrata } from '@/components/portal/loading-strata';
import { useToast } from '@/components/portal/toast-provider';
import { Button, StatusBadge } from '@/components/ui/controls';
import { useHydrated } from '@/hooks/use-hydrated';

// Accounts Receivable workspace: aging buckets over open invoices
// (sent / partially_paid with a due date), the flagged "needs follow-up" set
// (invoice-reminders exhausted its 4-stage cadence and stamped ar_flagged_at),
// and a per-row manual "Send reminder" nudge (invoice-send {type:'reminder'} —
// overdue-notice template, automated cadence counters untouched).

const ROW_GRID = '1fr 100px 90px 110px 150px 130px';

export default function ArPage() {
  const hydrated = useHydrated();
  const { aging, isLoading } = useArAging();

  if (!hydrated || isLoading) return <LoadingStrata />;

  const metrics = aging.buckets.map((bucket) => ({
    label: bucket.label,
    value: formatCurrency(bucket.balanceCents),
    subtitle: `${bucket.invoices.length} invoice${bucket.invoices.length === 1 ? '' : 's'}`,
    trend:
      bucket.key === 'current' || bucket.invoices.length === 0
        ? ('neutral' as const)
        : ('down' as const),
  }));

  return (
    <div className="pt-8">
      <ListPageHeader
        title="Accounts Receivable"
        subtitle="Aging and reminder follow-up on open invoices"
      />

      {/* Aging buckets */}
      <MetricsRow metrics={metrics} />

      {/* Needs follow-up: automated cadence exhausted */}
      {aging.flagged.length > 0 && (
        <section className="mb-10">
          <div className="mb-2 flex items-baseline gap-3">
            <h2 className="type-label text-[var(--text-primary)]">Needs follow-up</h2>
            <span className="type-meta-small text-[var(--text-muted)]">
              Automated reminders exhausted — these need a personal touch
            </span>
          </div>
          <ArTable invoices={aging.flagged} />
        </section>
      )}

      {/* All open invoices */}
      <section>
        <div className="mb-2 flex items-baseline gap-3">
          <h2 className="type-label text-[var(--text-primary)]">Open invoices</h2>
          <span className="type-meta-small text-[var(--text-muted)]">
            {aging.openInvoices.length} open ·{' '}
            {formatCurrency(aging.totalBalanceCents)} outstanding
          </span>
        </div>
        {aging.openInvoices.length > 0 ? (
          <ArTable invoices={aging.openInvoices} />
        ) : (
          <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
            Nothing outstanding. Issued invoices with a due date will appear here until they
            are paid.
          </p>
        )}
      </section>
    </div>
  );
}

function ArTable({ invoices }: { invoices: Invoice[] }) {
  return (
    <div>
      <div
        className="grid items-center gap-6 border-b border-[var(--border-subtle)] py-1.5"
        style={{ gridTemplateColumns: ROW_GRID }}
      >
        <span className="type-meta-small">Invoice</span>
        <span className="type-meta-small text-right">Due</span>
        <span className="type-meta-small text-right">Overdue</span>
        <span className="type-meta-small text-right">Balance</span>
        <span className="type-meta-small text-right">Reminders</span>
        <span className="type-meta-small text-right">Action</span>
      </div>
      {invoices.map((invoice) => (
        <ArRow key={invoice.id} invoice={invoice} />
      ))}
    </div>
  );
}

function ArRow({ invoice }: { invoice: Invoice }) {
  const { toast } = useToast();
  const sendInvoice = useSendInvoice();
  const [sending, setSending] = useState(false);

  const daysOverdue = invoiceDaysOverdue(invoice);
  const flagged = invoice.ar_flagged_at != null;
  const subtitleParts: string[] = [];
  if (invoice.project?.name) subtitleParts.push(invoice.project.name);
  if (invoice.client?.full_name) subtitleParts.push(invoice.client.full_name);

  const handleSendReminder = async () => {
    setSending(true);
    try {
      const result = await sendInvoice.mutateAsync({
        invoiceId: invoice.id,
        projectId: invoice.project_id,
        type: 'reminder',
      });
      toast(
        result.suppressed
          ? 'Reminder suppressed (client opted out of email)'
          : `Reminder sent to ${result.recipient}`,
        result.suppressed ? 'warning' : 'success'
      );
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed to send reminder', 'error');
    } finally {
      setSending(false);
    }
  };

  return (
    <div
      className="grid items-center gap-6 border-b border-[var(--border-subtle)] py-3 transition-colors hover:bg-[var(--bg-hover)]"
      style={{ gridTemplateColumns: ROW_GRID }}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link
            href={`/portal/billing/invoices/${invoice.id}`}
            className="type-label truncate text-[var(--text-primary)] no-underline hover:underline"
          >
            {invoice.invoice_number ?? 'Invoice'}
          </Link>
          {flagged && (
            <StatusBadge tone="error" dot>
              Flagged
            </StatusBadge>
          )}
        </div>
        {subtitleParts.length > 0 && (
          <div className="type-meta-small mt-0.5 truncate text-[var(--text-muted)]">
            {subtitleParts.join(' · ')}
          </div>
        )}
      </div>
      <span className="type-meta-small text-right text-[var(--text-muted)]">
        {formatInvoiceDate(invoice.due_date)}
      </span>
      <span
        className="type-meta-small text-right"
        style={{ color: daysOverdue > 0 ? 'var(--color-error)' : 'var(--text-muted)' }}
      >
        {daysOverdue > 0 ? `${daysOverdue}d` : '—'}
      </span>
      <span className="text-right font-heading text-[0.9rem] text-[var(--text-primary)]">
        {formatCurrency(invoiceBalanceCents(invoice), invoice.currency)}
      </span>
      <span className="type-meta-small text-right text-[var(--text-muted)]">
        {invoice.reminder_count > 0 ? (
          <>
            {invoice.reminder_count} sent
            {invoice.last_reminder_at && (
              <span className="block">last {formatInvoiceDate(invoice.last_reminder_at)}</span>
            )}
          </>
        ) : (
          'none'
        )}
      </span>
      <span className="flex justify-end">
        <Button
          variant="secondary"
          size="sm"
          disabled={sending}
          onClick={handleSendReminder}
        >
          {sending ? 'Sending…' : 'Send reminder'}
        </Button>
      </span>
    </div>
  );
}
