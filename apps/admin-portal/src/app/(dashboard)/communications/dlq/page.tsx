'use client';

import { useMemo, useState } from 'react';
import {
  useDlqEntries,
  useRetryDlqEntry,
  useBulkRetryDlq,
  type DlqEntry,
} from '@patina/supabase/hooks';
import { cn } from '@/lib/utils';
import {
  AlertTriangle,
  Inbox,
  RotateCcw,
  CheckCircle2,
} from 'lucide-react';

type RangeKey = '24h' | '7d' | '30d' | 'all';

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string }> = [
  { value: '24h', label: '24h' },
  { value: '7d', label: '7d' },
  { value: '30d', label: '30d' },
  { value: 'all', label: 'All' },
];

function rangeToSince(range: RangeKey): string | null {
  if (range === 'all') return null;
  const now = new Date();
  if (range === '24h') now.setHours(now.getHours() - 24);
  if (range === '7d') now.setDate(now.getDate() - 7);
  if (range === '30d') now.setDate(now.getDate() - 30);
  return now.toISOString();
}

function formatRelative(value: string): string {
  const then = new Date(value).getTime();
  if (!Number.isFinite(then)) return '—';
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(value).toLocaleDateString();
}

function truncate(s: string | null, n = 80): string {
  if (!s) return '—';
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

export default function DlqPage() {
  const [range, setRange] = useState<RangeKey>('7d');
  const [typeFilter, setTypeFilter] = useState<string>('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageError, setPageError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<string | null>(null);

  const since = rangeToSince(range);
  const { data, isLoading, isError, error, refetch } = useDlqEntries({
    since,
    type: typeFilter || null,
    limit: 100,
    offset: 0,
  });

  const retryOne = useRetryDlqEntry();
  const bulkRetry = useBulkRetryDlq();

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const r of rows) set.add(r.type);
    return Array.from(set).sort();
  }, [rows]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const someSelected = selected.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((r) => r.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onRetryRow = async (row: DlqEntry) => {
    setPageError(null);
    setBulkResult(null);
    try {
      await retryOne.mutateAsync(row.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Retry failed');
    }
  };

  const onBulkRetry = async () => {
    if (selected.size === 0 || bulkRetry.isPending) return;
    setPageError(null);
    setBulkResult(null);
    try {
      const ids = Array.from(selected).slice(0, 50);
      const res = await bulkRetry.mutateAsync(ids);
      setBulkResult(`Retried ${res.succeeded}/${res.total} entries.`);
      setSelected(new Set());
      await refetch();
    } catch (e) {
      setPageError(e instanceof Error ? e.message : 'Bulk retry failed');
    }
  };

  return (
    <div className="min-h-screen bg-patina-off-white">
      <header className="bg-white border-b border-patina-clay-beige/20 px-8 py-6">
        <div className="flex items-center gap-3 mb-2">
          <AlertTriangle className="w-5 h-5 text-patina-mocha-brown" />
          <h1 className="text-2xl font-display font-semibold text-patina-charcoal">
            Failed sends
          </h1>
        </div>
        <p className="text-sm text-patina-clay-beige">
          Notifications that failed to deliver after retries. Replay rebuilds the job and
          dispatches it again.
          {total > 0 && ` · ${total} failed`}
        </p>
      </header>

      <div className="px-8 py-6 max-w-6xl">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-patina-clay-beige/40 bg-white p-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setRange(opt.value)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  range === opt.value
                    ? 'bg-patina-mocha-brown text-white'
                    : 'text-patina-charcoal hover:bg-patina-off-white',
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-md',
              'bg-white border border-patina-clay-beige/40 text-patina-charcoal',
            )}
          >
            <option value="">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          <div className="ml-auto flex items-center gap-2">
            {someSelected && (
              <button
                type="button"
                disabled={bulkRetry.isPending}
                onClick={onBulkRetry}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md',
                  'bg-patina-mocha-brown text-white',
                  'hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed',
                )}
              >
                <RotateCcw className="w-3.5 h-3.5" />
                {bulkRetry.isPending
                  ? 'Retrying…'
                  : `Retry selected (${Math.min(selected.size, 50)})`}
              </button>
            )}
          </div>
        </div>

        {pageError && (
          <div className="mb-4 p-3 bg-red-50 rounded-lg flex items-start gap-2 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{pageError}</p>
          </div>
        )}
        {bulkResult && (
          <div className="mb-4 p-3 bg-green-50 rounded-lg flex items-start gap-2 border border-green-200">
            <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
            <p className="text-sm text-green-700">{bulkResult}</p>
          </div>
        )}
        {isError && (
          <div className="mb-4 p-3 bg-red-50 rounded-lg flex items-start gap-2 border border-red-200">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">
              {(error as Error)?.message ?? 'Failed to load'}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="py-12 text-center text-patina-clay-beige">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center bg-white rounded-xl border border-patina-clay-beige/20">
            <Inbox className="w-8 h-8 mx-auto mb-3 text-patina-clay-beige/60" />
            <p className="text-patina-clay-beige">No failed sends in this window.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-patina-clay-beige/20 overflow-hidden">
            <table className="w-full">
              <thead className="bg-patina-off-white">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="text-left text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-4 py-3">
                    When
                  </th>
                  <th className="text-left text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-4 py-3">
                    Recipient
                  </th>
                  <th className="text-left text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-4 py-3">
                    Type
                  </th>
                  <th className="text-left text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-4 py-3">
                    Template
                  </th>
                  <th className="text-left text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-4 py-3">
                    Error
                  </th>
                  <th className="text-right text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-4 py-3">
                    Tries
                  </th>
                  <th className="text-left text-xs font-medium text-patina-clay-beige uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-patina-clay-beige/20">
                {rows.map((row) => {
                  const replayed = !!row.replayed_at;
                  const checked = selected.has(row.id);
                  const isWorking = retryOne.isPending && retryOne.variables === row.id;
                  return (
                    <tr key={row.id}>
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleOne(row.id)}
                          aria-label={`Select ${row.id}`}
                        />
                      </td>
                      <td className="px-4 py-3 align-top text-sm text-patina-charcoal whitespace-nowrap">
                        {formatRelative(row.created_at)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-sm font-medium text-patina-charcoal">
                          {row.recipient_email ?? '—'}
                        </p>
                        {row.recipient_name && (
                          <p className="text-xs text-patina-clay-beige">
                            {row.recipient_name}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-sm text-patina-charcoal">
                        {row.type}
                      </td>
                      <td className="px-4 py-3 align-top text-sm text-patina-charcoal">
                        {row.template_id ?? '—'}
                      </td>
                      <td
                        className="px-4 py-3 align-top text-sm text-patina-charcoal max-w-xs"
                        title={row.error ?? undefined}
                      >
                        {truncate(row.error)}
                      </td>
                      <td className="px-4 py-3 align-top text-right text-sm text-patina-charcoal">
                        {row.retry_count}
                      </td>
                      <td className="px-4 py-3 align-top">
                        {replayed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">
                            <CheckCircle2 className="w-3 h-3" />
                            Replayed
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700">
                            Failed
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 align-top text-right">
                        <button
                          onClick={() => onRetryRow(row)}
                          disabled={isWorking || bulkRetry.isPending}
                          className={cn(
                            'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md',
                            'bg-white border border-patina-clay-beige/40 text-patina-charcoal',
                            'hover:bg-patina-off-white disabled:opacity-50',
                          )}
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          {isWorking ? 'Retrying…' : 'Retry'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
