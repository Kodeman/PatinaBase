'use client';

import { useMemo, useState } from 'react';
import {
  useAdminNominations,
  useSetNominationStatus,
  type AdminNominationRow,
} from '@patina/supabase';
import { LayerChip, NominationStatusBanner } from '@patina/catalog-ui';
import { LoadingStrata } from '@/components/portal/loading-strata';

type StatusFilter =
  | 'all'
  | 'submitted'
  | 'under_review'
  | 'contacted'
  | 'onboarding'
  | 'live'
  | 'declined';

const FILTER_OPTIONS: Array<{ key: StatusFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'under_review', label: 'Under review' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'onboarding', label: 'Onboarding' },
  { key: 'live', label: 'Live' },
  { key: 'declined', label: 'Declined' },
];

const NEXT_STEPS: Record<
  string,
  Array<{ to: AdminNominationRow['status']; label: string }>
> = {
  submitted: [
    { to: 'under_review', label: 'Move to Under review' },
    { to: 'declined', label: 'Decline' },
  ],
  under_review: [
    { to: 'contacted', label: 'Mark Contacted' },
    { to: 'declined', label: 'Decline' },
  ],
  contacted: [
    { to: 'onboarding', label: 'Move to Onboarding' },
    { to: 'declined', label: 'Decline' },
  ],
  onboarding: [
    { to: 'live', label: 'Publish Live' },
    { to: 'declined', label: 'Decline' },
  ],
  live: [],
  declined: [],
};

/**
 * Patina admin nomination triage tool (PRD §5.5, S3.5). Lists every
 * vendor_nominations row with state-transition CTAs that drive the
 * state machine via `set_nomination_status` (migration 00160). The
 * RPC is super_admin-gated server-side; this page is a thin
 * client-side surface that assumes super_admin role and surfaces a
 * clear "not authorized" message on RPC errors.
 */
export default function AdminNominationsPage() {
  const [filter, setFilter] = useState<StatusFilter>('submitted');
  const { data, isLoading, error } = useAdminNominations({
    status: filter === 'all' ? undefined : (filter as AdminNominationRow['status']),
  });

  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h1 className="type-section-head">Catalog Nominations</h1>
        <p className="font-body text-[0.85rem] leading-relaxed text-[var(--text-muted)]">
          Drive vendor nominations through the pipeline. The state machine in
          migration 00158 enforces legal transitions server-side — illegal
          moves raise a clear error.
        </p>
      </header>

      <div role="group" aria-label="Status filter" className="flex flex-wrap items-center gap-1">
        {FILTER_OPTIONS.map((opt) => {
          const active = opt.key === filter;
          return (
            <button
              key={opt.key}
              type="button"
              onClick={() => setFilter(opt.key)}
              className="rounded-md px-3 py-1.5 text-[0.78rem]"
              style={{
                background: active ? 'var(--accent-primary)' : 'transparent',
                color: active ? '#fff' : 'var(--text-muted)',
                border: '1px solid var(--border-default)',
                borderColor: active ? 'var(--accent-primary)' : 'var(--border-default)',
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <LoadingStrata />
      ) : error ? (
        <div className="rounded-md border border-[var(--color-error,#C77B6E)] bg-[rgba(199,123,110,0.06)] p-4 text-sm text-[var(--color-error,#C77B6E)]">
          {error.message}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--text-muted)]">
          No nominations in this state.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((nom) => (
            <NominationRow key={nom.id} nomination={nom} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NominationRow({ nomination }: { nomination: AdminNominationRow }) {
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [outreachSummary, setOutreachSummary] = useState('');
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string } | null>(
    null,
  );
  const setStatus = useSetNominationStatus({
    onSuccess: () => {
      setFeedback({ kind: 'success', message: 'Nomination updated.' });
      setDeclineOpen(false);
      setDeclineReason('');
    },
    onError: (err) => setFeedback({ kind: 'error', message: err.message }),
  });

  const next = NEXT_STEPS[nomination.status] ?? [];
  const contact = nomination.manufacturer_contact as
    | { name?: string; email?: string }
    | null;

  return (
    <li className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <LayerChip layer="catalog" size="sm" />
            <span className="type-meta-small text-[var(--text-muted)]">
              Nomination {nomination.id.slice(0, 8)}…
            </span>
          </div>
          <p className="text-[0.9rem] text-[var(--text-primary)]">
            Vendor <code>{nomination.vendor_id.slice(0, 8)}…</code> · Studio{' '}
            <code>{nomination.studio_id.slice(0, 8)}…</code>
          </p>
          {contact?.email && (
            <p className="type-meta-small text-[var(--text-muted)]">
              Maker contact: {contact.name ?? '—'} · {contact.email}
            </p>
          )}
          <blockquote
            className="mt-2 rounded-md px-3 py-2 text-[0.84rem] italic text-[var(--text-body, #5C4A3C)]"
            style={{ background: 'rgba(196, 165, 123, 0.06)' }}
          >
            “{nomination.recommendation_note}”
          </blockquote>
          {nomination.fit_signals && nomination.fit_signals.length > 0 && (
            <ul className="mt-1 flex flex-wrap gap-1.5">
              {nomination.fit_signals.map((s) => (
                <li
                  key={s}
                  className="type-meta-small rounded px-2 py-0.5"
                  style={{
                    background: 'rgba(168, 181, 160, 0.12)',
                    color: 'var(--color-sage, #A8B5A0)',
                  }}
                >
                  {s.replaceAll('_', ' ')}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="min-w-[200px] max-w-[280px]">
          <NominationStatusBanner
            status={nomination.status}
            detail={nomination.decline_reason ?? undefined}
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {next.map((step) => {
          const isDecline = step.to === 'declined';
          if (isDecline) {
            return (
              <button
                key={step.to}
                type="button"
                onClick={() => setDeclineOpen(true)}
                disabled={setStatus.isPending}
                className="rounded-md px-3 py-1.5 text-[0.78rem]"
                style={{
                  border: '1px solid var(--color-terracotta, #D4A090)',
                  color: 'var(--color-terracotta, #D4A090)',
                  background: 'transparent',
                }}
              >
                Decline
              </button>
            );
          }
          return (
            <button
              key={step.to}
              type="button"
              onClick={() =>
                setStatus.mutate({
                  nominationId: nomination.id,
                  toStatus: step.to,
                  patinaOutreachSummary:
                    step.to === 'contacted' && outreachSummary
                      ? outreachSummary
                      : undefined,
                })
              }
              disabled={setStatus.isPending}
              className="rounded-md px-3 py-1.5 text-[0.78rem]"
              style={{
                background: 'var(--accent-primary)',
                color: '#fff',
                cursor: setStatus.isPending ? 'wait' : 'pointer',
              }}
            >
              {step.label}
            </button>
          );
        })}
        {nomination.status === 'contacted' && (
          <input
            type="text"
            value={outreachSummary}
            onChange={(e) => setOutreachSummary(e.target.value)}
            placeholder="Outreach summary (saved on next transition)"
            className="h-8 rounded-md border border-[var(--border-default)] px-2 text-[0.78rem]"
            style={{ minWidth: 240 }}
          />
        )}
      </div>

      {declineOpen && (
        <div className="mt-3 flex flex-col gap-2 rounded-md border p-3"
          style={{
            borderColor: 'rgba(212, 160, 144, 0.55)',
            background: 'rgba(212, 160, 144, 0.08)',
          }}
        >
          <label
            className="type-meta-small"
            style={{
              color: 'var(--color-terracotta, #D4A090)',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            Decline reason (visible to nominator)
          </label>
          <textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={3}
            className="rounded-md border border-[var(--border-default)] bg-[var(--bg-surface)] p-2 text-sm"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDeclineOpen(false)}
              className="rounded-md px-3 py-1.5 text-[0.78rem] text-[var(--text-muted)]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!declineReason.trim() || setStatus.isPending}
              onClick={() =>
                setStatus.mutate({
                  nominationId: nomination.id,
                  toStatus: 'declined',
                  declineReason: declineReason.trim(),
                })
              }
              className="rounded-md px-3 py-1.5 text-[0.78rem] text-white"
              style={{
                background: declineReason.trim()
                  ? 'var(--color-terracotta, #D4A090)'
                  : 'var(--border-default)',
              }}
            >
              Confirm decline
            </button>
          </div>
        </div>
      )}

      {feedback && (
        <div
          role="alert"
          className="mt-3 rounded-md px-3 py-2 text-sm"
          style={{
            background:
              feedback.kind === 'success'
                ? 'rgba(168, 181, 160, 0.12)'
                : 'rgba(199, 123, 110, 0.08)',
            color:
              feedback.kind === 'success'
                ? 'var(--color-sage, #A8B5A0)'
                : 'var(--color-error, #C77B6E)',
          }}
        >
          {feedback.message}
        </div>
      )}
    </li>
  );
}
