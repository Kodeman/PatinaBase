'use client';

/**
 * The Ledger (R7.4) — every note in one place, filterable by bucket + status,
 * sortable by date or weight, each row scannable at a glance. Selecting a row
 * opens its detail (triage lives there). The close-the-loop cards (R7.6) ride
 * the top for the author's own shipped-and-unseen notes; opening the Ledger
 * marks them seen (clearing the capture-button badge). Rendered inside the
 * Studio Drawer's sheet, like Orders/Accounts/Hours.
 */

import { useEffect, useState } from 'react';
import {
  useFeedback,
  useUnseenShipped,
  useMarkFeedbackSeen,
  type Feedback,
  type FeedbackBucket,
  type FeedbackStatus,
} from '@patina/supabase';
import { BUCKETS, STATUSES, bucketMeta, statusMeta, weightDots } from '@/lib/document/feedback';
import { FeedbackDetail } from './feedback-detail';
import { ShippedCard } from './feedback-loop';
import { openFeedbackSheet } from './feedback-sheet';

function age(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const h = Math.floor(ms / 3_600_000);
  if (h < 1) return 'now';
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function FeedbackLedger() {
  const [bucket, setBucket] = useState<FeedbackBucket | 'all'>('all');
  const [status, setStatus] = useState<FeedbackStatus | 'all'>('all');
  const [sort, setSort] = useState<'date' | 'weight'>('date');
  const [selected, setSelected] = useState<string | null>(null);

  const { data: notes, isLoading } = useFeedback({
    bucket: bucket === 'all' ? undefined : bucket,
    status: status === 'all' ? undefined : status,
    sort,
  });

  // Snapshot the author's shipped-and-unseen notes once on open, then mark them
  // seen — so the cards persist for this view while the badge clears.
  const { data: unseen } = useUnseenShipped();
  const markSeen = useMarkFeedbackSeen();
  const [shippedCards, setShippedCards] = useState<Feedback[] | null>(null);
  useEffect(() => {
    if (shippedCards === null && unseen && unseen.length > 0) {
      setShippedCards(unseen);
      unseen.forEach((n) => markSeen.mutate(n.id));
    }
  }, [unseen, shippedCards, markSeen]);

  if (selected) {
    return <FeedbackDetail id={selected} onBack={() => setSelected(null)} />;
  }

  const isFiltered = bucket !== 'all' || status !== 'all';

  return (
    <div className="mx-auto max-w-2xl">
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-xl text-[var(--color-pearl)]">Feedback</h2>
        <button
          type="button"
          onClick={() => setSort((s) => (s === 'date' ? 'weight' : 'date'))}
          className="font-mono text-[10px] uppercase tracking-[0.06em] text-[rgba(250,247,242,0.5)] hover:text-[var(--color-pearl)]"
        >
          Sort · {sort === 'date' ? 'Newest' : 'Weight'} ▾
        </button>
      </div>

      {/* Close-the-loop cards for the author's freshly-shipped notes. */}
      {shippedCards && shippedCards.length > 0 && (
        <div className="mt-3 flex flex-col gap-2">
          {shippedCards.map((n) => (
            <ShippedCard key={n.id} note={n} />
          ))}
        </div>
      )}

      {/* Bucket filter. */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <FilterChip label="All" on={bucket === 'all'} onClick={() => setBucket('all')} />
        {BUCKETS.map((b) => (
          <FilterChip key={b.key} label={b.label} color={b.colorVar} on={bucket === b.key} onClick={() => setBucket(b.key)} />
        ))}
      </div>
      {/* Status filter. */}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <FilterChip label="Any status" on={status === 'all'} onClick={() => setStatus('all')} />
        {STATUSES.map((s) => (
          <FilterChip key={s.key} label={s.label} color={s.colorVar} on={status === s.key} onClick={() => setStatus(s.key)} />
        ))}
      </div>

      <div className="mt-3">
        {isLoading ? (
          <p className="py-8 text-center text-[13px] text-[rgba(250,247,242,0.5)]">Loading…</p>
        ) : !notes || notes.length === 0 ? (
          <EmptyState filtered={isFiltered} />
        ) : (
          <ul className="divide-y divide-[rgba(250,247,242,0.1)]">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setSelected(n.id)}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: bucketMeta(n.bucket).colorVar }} />
                  <span className="flex-1 truncate text-[14px] text-[var(--color-pearl)]">
                    {n.note || <span className="text-[rgba(250,247,242,0.45)]">{bucketMeta(n.bucket).label}</span>}
                  </span>
                  <WeightDots weight={weightDots(n.weight)} />
                  <StatusPill status={n.status} />
                  <span className="w-7 shrink-0 text-right font-mono text-[10px] text-[rgba(250,247,242,0.4)]">{age(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterChip({ label, color, on, onClick }: { label: string; color?: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border px-2 py-1 font-mono text-[10px] uppercase tracking-[0.05em] transition-colors"
      style={{
        borderColor: on ? color ?? 'var(--color-clay)' : 'rgba(250,247,242,0.14)',
        color: on ? 'var(--color-pearl)' : 'rgba(250,247,242,0.5)',
        background: on ? `color-mix(in srgb, ${color ?? 'var(--color-clay)'} 14%, transparent)` : 'transparent',
      }}
    >
      {label}
    </button>
  );
}

function WeightDots({ weight }: { weight: number }) {
  if (weight === 0) return <span className="w-[26px] shrink-0" aria-hidden />;
  return (
    <span className="flex w-[26px] shrink-0 items-center gap-0.5" aria-label={`weight ${weight}/3`}>
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-1 w-1 rounded-full" style={{ background: i < weight ? 'var(--color-golden-hour)' : 'rgba(250,247,242,0.2)' }} />
      ))}
    </span>
  );
}

function StatusPill({ status }: { status: FeedbackStatus }) {
  const sm = statusMeta(status);
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em]"
      style={{ borderColor: `color-mix(in srgb, ${sm.colorVar} 45%, rgba(250,247,242,0.14))`, color: sm.colorVar }}
    >
      {sm.label}
    </span>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <p className="py-10 text-center text-[13px] text-[rgba(250,247,242,0.5)]">
        No notes match that filter yet.
      </p>
    );
  }
  return (
    <div className="py-10 text-center">
      <p className="font-heading text-[15px] text-[var(--color-pearl)]">No notes yet</p>
      <p className="mx-auto mt-1 max-w-[26ch] text-[13px] leading-snug text-[rgba(250,247,242,0.55)]">
        The button’s bottom-right whenever something strikes you — good or bad. Two taps and it’s here.
      </p>
      <button
        type="button"
        onClick={() => openFeedbackSheet()}
        className="mt-3 rounded-md bg-[var(--color-clay)] px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--color-charcoal)]"
      >
        Leave the first note
      </button>
    </div>
  );
}
