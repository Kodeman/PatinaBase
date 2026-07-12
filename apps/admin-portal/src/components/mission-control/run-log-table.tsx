'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { RunRow } from '@/lib/run-rows';
import { StatusDot } from '@/components/portal';
import { StaleBadge } from './stale-badge';

// The Run Log table (WP-1.4). One row per unified run. Hairline ledger rules,
// no shadows — the Failure column is the point: an errored run must be legible,
// so its message is a one-line truncation that expands to the full text on
// click / Enter. Horizontal scroll on mobile keeps the columns intact.

interface RunLogTableProps {
  rows: RunRow[];
}

// done/succeeded → sage · running/queued → dusty-blue · failed → terracotta ·
// awaiting_review → clay · everything else (skipped/cancelled) → muted.
function statusColor(status: string): string {
  switch (status) {
    case 'done':
    case 'succeeded':
    case 'approved':
      return 'var(--color-sage)';
    case 'running':
    case 'queued':
      return 'var(--color-dusty-blue)';
    case 'failed':
    case 'rejected':
      return 'var(--color-terracotta)';
    case 'awaiting_review':
      return 'var(--color-clay)';
    default:
      return 'var(--text-muted)';
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

function formatStarted(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDuration(ms: number | null): string | null {
  if (ms == null) return null;
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  const rem = Math.round(s % 60);
  return `${m}m ${rem}s`;
}

function formatCost(costUsd: number | null): string {
  return costUsd == null ? '—' : `$${costUsd.toFixed(2)}`;
}

export function RunLogTable({ rows }: RunLogTableProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse" data-testid="run-log-table">
        <thead>
          <tr className="border-b border-[var(--border-default)]">
            <th className="type-meta-small px-4 py-3 text-left align-middle first:pl-0">Status</th>
            <th className="type-meta-small px-4 py-3 text-left align-middle">Run</th>
            <th className="type-meta-small px-4 py-3 text-left align-middle">Started</th>
            <th className="type-meta-small px-4 py-3 text-right align-middle">Cost</th>
            <th className="type-meta-small px-4 py-3 text-left align-middle">Failure</th>
            <th className="type-meta-small px-4 py-3 text-left align-middle">Retries</th>
            <th className="type-meta-small px-4 py-3 text-left align-middle last:pr-0">Flags</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const duration = formatDuration(row.durationMs);
            const isOpen = expanded.has(row.id);
            return (
              <tr
                key={row.id}
                data-testid="run-log-row"
                data-kind={row.kind}
                data-status={row.status}
                className="border-b border-[var(--border-subtle)] align-top"
              >
                {/* Status */}
                <td className="px-4 py-4 align-top first:pl-0">
                  <StatusDot
                    color={statusColor(row.status)}
                    label={statusLabel(row.status)}
                    size="sm"
                  />
                </td>

                {/* Run — DM Mono name + source */}
                <td className="px-4 py-4 align-top">
                  <div
                    className="text-[0.8rem] text-[var(--text-primary)]"
                    style={{ fontFamily: 'var(--font-meta)' }}
                  >
                    {row.name}
                  </div>
                  <div className="type-meta-small mt-0.5 text-[var(--text-muted)]">{row.source}</div>
                </td>

                {/* Started / Duration */}
                <td className="px-4 py-4 align-top">
                  <div className="type-body-small text-[var(--text-primary)]">
                    {formatStarted(row.startedAt)}
                  </div>
                  {duration && (
                    <div className="type-meta-small mt-0.5 text-[var(--text-muted)]">{duration}</div>
                  )}
                </td>

                {/* Cost */}
                <td
                  className="px-4 py-4 text-right align-top text-[0.8rem] text-[var(--text-muted)]"
                  style={{ fontFamily: 'var(--font-meta)' }}
                >
                  {formatCost(row.costUsd)}
                </td>

                {/* Failure — truncated one-liner, expands on click / Enter */}
                <td className="max-w-[22rem] px-4 py-4 align-top">
                  {row.error ? (
                    <button
                      type="button"
                      onClick={() => toggle(row.id)}
                      aria-expanded={isOpen}
                      data-testid="run-log-failure"
                      className={`w-full cursor-pointer text-left text-[0.75rem] text-[var(--color-terracotta)] ${
                        isOpen ? 'whitespace-pre-wrap break-words' : 'truncate'
                      }`}
                      title={isOpen ? 'Collapse' : row.error}
                    >
                      {row.error}
                    </button>
                  ) : (
                    <span className="type-meta-small text-[var(--text-muted)]">—</span>
                  )}
                </td>

                {/* Retries — attempts/max + re-run lineage link */}
                <td className="whitespace-nowrap px-4 py-4 align-top">
                  {row.retryCount != null ? (
                    <span
                      className="text-[0.72rem] text-[var(--text-muted)]"
                      style={{ fontFamily: 'var(--font-meta)' }}
                    >
                      {row.retryCount}
                      {row.maxAttempts != null ? `/${row.maxAttempts}` : ''}
                    </span>
                  ) : (
                    <span className="type-meta-small text-[var(--text-muted)]">—</span>
                  )}
                  {row.parentTaskId && (
                    <Link
                      href={`/mission-control?task=${row.parentTaskId}` as any}
                      data-testid="run-log-rerun-link"
                      className="mt-0.5 block text-[0.62rem] uppercase tracking-[0.06em] text-[var(--accent-primary)] no-underline hover:underline"
                      style={{ fontFamily: 'var(--font-meta)' }}
                    >
                      re-run of ↗
                    </Link>
                  )}
                </td>

                {/* Flags */}
                <td className="px-4 py-4 align-top last:pr-0">
                  <StaleBadge flaggedStaleAt={row.flaggedStaleAt} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
