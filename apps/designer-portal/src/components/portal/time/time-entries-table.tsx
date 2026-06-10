'use client';

import Link from 'next/link';
import { normalizePhaseSlug } from '@patina/types';
import { formatCurrency } from '@patina/shared';
import { PHASE_CONFIG } from '@/types/project-ui';
import { StatusBadge } from '@/components/ui/controls';
import { formatHoursLabel, groupEntriesByWeek } from '@/lib/time-billing';

// Row contract: the project time page passes ProjectTimeEntry merged with the
// unbilled view's amount_cents; the studio report passes StudioTimeEntry
// (adds project name). Everything beyond the base fields is optional so both
// callers type-check without casts.
export interface TimeEntryRow {
  id: string;
  project_id: string;
  phase_key: string | null;
  user_id: string;
  started_at: string;
  duration_minutes: number;
  notes: string | null;
  billable: boolean;
  invoice_id: string | null;
  /** View-resolved amount (unbilled rows only) — column renders when ANY row has one. */
  amount_cents?: number | null;
  profile?: { full_name: string | null } | null;
  project?: { name: string | null } | null;
}

export interface TimeEntriesTableProps {
  entries: TimeEntryRow[];
  /** Show the project column (studio report). */
  showProject?: boolean;
  /** When provided, un-invoiced rows render a delete action. */
  onDelete?: (entry: TimeEntryRow) => void;
  deletePendingId?: string | null;
  emptyLabel?: string;
}

function phaseLabel(phaseKey: string | null): string | null {
  if (!phaseKey) return null;
  const slug = normalizePhaseSlug(phaseKey);
  return (PHASE_CONFIG as Record<string, { label?: string }>)[slug]?.label ?? phaseKey;
}

function entryDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

/**
 * Week-grouped (local Monday start) time-entry table shared by the project
 * time page and the studio report. Entries arrive newest-first; groups render
 * newest week first with per-week hour (and, when priced, amount) subtotals.
 */
export function TimeEntriesTable({
  entries,
  showProject = false,
  onDelete,
  deletePendingId,
  emptyLabel = 'No time entries yet.',
}: TimeEntriesTableProps) {
  if (entries.length === 0) {
    return (
      <p className="type-body py-8 text-center italic text-[var(--text-muted)]">{emptyLabel}</p>
    );
  }

  const weeks = groupEntriesByWeek(entries);
  const showAmount = entries.some((e) => e.amount_cents != null);
  const gridTemplateColumns = [
    '140px', // date
    showProject ? '1.2fr' : null, // project
    '1fr', // notes / phase
    '120px', // who
    '110px', // status
    '70px', // hours
    showAmount ? '100px' : null, // amount
    onDelete ? '36px' : null, // actions
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div>
      {/* Column header */}
      <div
        className="grid items-center gap-3 border-b border-[var(--border-default)] py-1.5"
        style={{ gridTemplateColumns }}
      >
        <span className="type-meta-small">Date</span>
        {showProject && <span className="type-meta-small">Project</span>}
        <span className="type-meta-small">Notes</span>
        <span className="type-meta-small">Logged by</span>
        <span className="type-meta-small">Status</span>
        <span className="type-meta-small text-right">Hours</span>
        {showAmount && <span className="type-meta-small text-right">Amount</span>}
        {onDelete && <span />}
      </div>

      {weeks.map((week) => (
        <div key={week.weekStart} data-testid="time-week-group">
          {/* Week subtotal header */}
          <div className="flex items-baseline justify-between bg-[var(--bg-hover)] px-2 py-1.5">
            <span className="type-meta-small uppercase tracking-wider text-[var(--text-muted)]">
              {week.label}
            </span>
            <span className="type-meta-small text-[var(--text-muted)]">
              {formatHoursLabel(week.totalMinutes)}
              {showAmount && week.amountCents > 0 && ` · ${formatCurrency(week.amountCents)}`}
            </span>
          </div>

          {week.entries.map((entry) => {
            const phase = phaseLabel(entry.phase_key);
            return (
              <div
                key={entry.id}
                data-testid="time-entry-row"
                className="grid items-baseline gap-3 border-b border-[var(--border-subtle)] py-2.5"
                style={{ gridTemplateColumns }}
              >
                <span className="type-body text-[0.82rem]">{entryDate(entry.started_at)}</span>
                {showProject && (
                  <Link
                    href={`/portal/projects/${entry.project_id}/time`}
                    className="type-body min-w-0 truncate text-[0.82rem] text-[var(--accent-primary)] no-underline hover:text-[var(--text-primary)]"
                  >
                    {entry.project?.name ?? 'Untitled project'}
                  </Link>
                )}
                <span className="type-body min-w-0 truncate text-[0.82rem]">
                  {entry.notes || <span className="italic text-[var(--text-muted)]">—</span>}
                  {phase && (
                    <span className="type-meta-small ml-2 text-[var(--text-muted)]">{phase}</span>
                  )}
                </span>
                <span className="type-body min-w-0 truncate text-[0.82rem] text-[var(--text-muted)]">
                  {entry.profile?.full_name ?? '—'}
                </span>
                <span>
                  {!entry.billable ? (
                    <StatusBadge tone="neutral">Non-billable</StatusBadge>
                  ) : entry.invoice_id ? (
                    <Link
                      href={`/portal/billing/invoices/${entry.invoice_id}`}
                      className="no-underline"
                    >
                      <StatusBadge tone="info">Invoiced</StatusBadge>
                    </Link>
                  ) : (
                    <StatusBadge tone="warning">Unbilled</StatusBadge>
                  )}
                </span>
                <span className="text-right font-heading text-[0.85rem]">
                  {formatHoursLabel(entry.duration_minutes)}
                </span>
                {showAmount && (
                  <span className="text-right font-heading text-[0.85rem]">
                    {entry.amount_cents != null ? formatCurrency(entry.amount_cents) : '—'}
                  </span>
                )}
                {onDelete && (
                  <span className="text-right">
                    {/* Invoiced entries are locked by the 00177 guard trigger —
                        no delete affordance; detach via voiding the invoice. */}
                    {!entry.invoice_id && (
                      <button
                        type="button"
                        aria-label="Delete entry"
                        title="Delete entry"
                        disabled={deletePendingId === entry.id}
                        className="cursor-pointer text-[var(--text-muted)] hover:text-[var(--color-error)] disabled:opacity-50"
                        onClick={() => onDelete(entry)}
                      >
                        ×
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
