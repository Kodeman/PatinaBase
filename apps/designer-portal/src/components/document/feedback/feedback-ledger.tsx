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
import { MessageSquarePlus } from 'lucide-react';
import { DocSheetHead } from '../overlays/doc-sheet';
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
      <DocSheetHead icon={MessageSquarePlus} title="Feedback" />
      <div className="flex items-baseline justify-between">
        <h2 className="font-heading text-xl text-[var(--color-charcoal)]">Feedback</h2>
        <button
          type="button"
          onClick={() => setSort((s) => (s === 'date' ? 'weight' : 'date'))}
          className="font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]"
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
          <p className="py-8 text-center text-[13px] text-[var(--color-aged-oak)]">Loading…</p>
        ) : !notes || notes.length === 0 ? (
          <EmptyState filtered={isFiltered} />
        ) : (
          <ul className="divide-y divide-[var(--color-pearl)]">
            {notes.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => setSelected(n.id)}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: bucketMeta(n.bucket).colorVar }} />
                  <span className="flex-1 truncate text-[14px] text-[var(--color-charcoal)]">
                    {n.note || <span className="text-[var(--color-aged-oak)]">{bucketMeta(n.bucket).label}</span>}
                  </span>
                  <WeightDots weight={weightDots(n.weight)} />
                  <StatusPill status={n.status} />
                  <span className="w-7 shrink-0 text-right font-mono text-[10px] text-[var(--color-aged-oak)]">{age(n.created_at)}</span>
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
        borderColor: on ? color ?? 'var(--color-clay)' : 'var(--color-pearl)',
        color: on ? 'var(--color-charcoal)' : 'var(--color-aged-oak)',
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
        <span key={i} className="h-1 w-1 rounded-full" style={{ background: i < weight ? 'var(--color-golden-hour)' : 'var(--color-pearl)' }} />
      ))}
    </span>
  );
}

function StatusPill({ status }: { status: FeedbackStatus }) {
  const sm = statusMeta(status);
  return (
    <span
      className="shrink-0 rounded-full border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.06em]"
      style={{ borderColor: `color-mix(in srgb, ${sm.colorVar} 45%, var(--color-pearl))`, color: sm.colorVar }}
    >
      {sm.label}
    </span>
  );
}

function EmptyState({ filtered }: { filtered: boolean }) {
  if (filtered) {
    return (
      <p className="py-10 text-center text-[13px] text-[var(--color-aged-oak)]">
        No notes match that filter yet.
      </p>
    );
  }
  return (
    <div className="py-10 text-center">
      <p className="font-heading text-[15px] text-[var(--color-charcoal)]">No notes yet</p>
      <p className="mx-auto mt-1 max-w-[26ch] text-[13px] leading-snug text-[var(--color-aged-oak)]">
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
