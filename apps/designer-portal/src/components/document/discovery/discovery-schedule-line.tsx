'use client';

/**
 * The Discovery fold's schedule line (Arrival Arc R106 §5 / build-plan 2.5,
 * scene 04 of `match-ceremony-prototype.html`). Sits at the top of the fold,
 * above the essentials — the arc-born engagement's first honest fact: what
 * was offered, or what was booked, plus a quiet reference to the intro
 * thread. Renders NOTHING when this relationship carries no `match_
 * ceremonies` row (a non-arc engagement) — byte-identical to today's
 * Discovery fold for every pre-arc client.
 */

import { useState } from 'react';
import { useCeremonyForRelationship, useRefreshOfferedSlots } from '@patina/supabase';
import {
  deriveCeremonyScheduleState,
  firstNameOf,
  fmtCeremonySlot,
} from '@/lib/document/ceremony-schedule';

const SLOT_DURATION_MINUTES = 45;
const MIN_SLOTS = 2;
const MAX_SLOTS = 3;

/** ISO → the local `YYYY-MM-DDTHH:mm` shape `datetime-local` wants. */
function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A fresh default: 10:00 AM the day after the latest slot (or tomorrow). */
function nextDefaultStart(existing: { starts_at: string }[]): string {
  const base = existing.length
    ? new Date(Math.max(...existing.map((s) => new Date(s.starts_at).getTime())))
    : new Date();
  const d = new Date(base);
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
  return d.toISOString();
}

interface DraftSlot {
  key: string;
  starts_at: string;
}

function freshDraft(): DraftSlot[] {
  const first = nextDefaultStart([]);
  const second = nextDefaultStart([{ starts_at: first }]);
  return [
    { key: 'a', starts_at: first },
    { key: 'b', starts_at: second },
  ];
}

const dot = (color: string) => (
  <span
    className="mr-2 inline-block h-[7px] w-[7px] rounded-full align-middle"
    style={{ backgroundColor: color }}
  />
);

export function DiscoveryScheduleLine({
  designerClientId,
  clientName,
}: {
  designerClientId: string;
  clientName: string;
}) {
  const { data: ceremony, isLoading } = useCeremonyForRelationship(designerClientId);
  const refresh = useRefreshOfferedSlots();
  const [reofferOpen, setReofferOpen] = useState(false);
  const [draft, setDraft] = useState<DraftSlot[]>(() => freshDraft());

  // No ceremony (or still resolving) — render nothing new, byte-identical to
  // a non-arc engagement's Discovery fold.
  if (isLoading || !ceremony) return null;

  const state = deriveCeremonyScheduleState(ceremony);
  if (state.kind === 'none') return null;

  const editSlot = (key: string, localValue: string) => {
    const parsed = new Date(localValue);
    if (Number.isNaN(parsed.getTime())) return; // ignore a half-typed value
    setDraft((d) => d.map((s) => (s.key === key ? { ...s, starts_at: parsed.toISOString() } : s)));
  };
  const addSlot = () => {
    if (draft.length >= MAX_SLOTS) return;
    setDraft((d) => [
      ...d,
      { key: `s${d.length}-${Date.now()}`, starts_at: nextDefaultStart(d.map((s) => ({ starts_at: s.starts_at }))) },
    ]);
  };
  const removeSlot = (key: string) => setDraft((d) => d.filter((s) => s.key !== key));

  const submitReoffer = () => {
    if (draft.length < MIN_SLOTS) return;
    refresh.mutate(
      {
        ceremonyId: ceremony.id,
        designerClientId,
        slots: draft.map((s) => ({ starts_at: s.starts_at, duration_minutes: SLOT_DURATION_MINUTES })),
      },
      { onSuccess: () => setReofferOpen(false) },
    );
  };

  const name = firstNameOf(clientName);

  return (
    <div className="mb-4 rounded-[3px] border border-[var(--color-pearl)] bg-[rgba(196,165,123,0.06)] px-4 py-3">
      {state.kind === 'picked' && (
        <p className="text-[13.5px] text-[var(--color-charcoal)]">
          {dot('var(--color-clay)')}
          Discovery call · {fmtCeremonySlot(state.startsAt, ceremony.timezone)} · booked
        </p>
      )}

      {state.kind === 'offered-fresh' && (
        <div>
          <p className="text-[13.5px] text-[var(--color-charcoal)]">
            {dot('var(--color-clay)')}
            Times offered · {state.slots.length} slot{state.slots.length === 1 ? '' : 's'} · awaiting{' '}
            {name}&rsquo;s pick
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 pl-[19px]">
            {state.slots.map((s) => (
              <li key={s.id} className="font-mono text-[10.5px] text-[var(--text-muted)]">
                {fmtCeremonySlot(s.starts_at, ceremony.timezone)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {state.kind === 'offered-stale' && (
        <div>
          <p className="text-[13.5px] text-[var(--color-charcoal)]">
            {dot('var(--color-terracotta)')}
            The offered times went by
          </p>
          {!reofferOpen ? (
            <button
              type="button"
              onClick={() => {
                setDraft(freshDraft());
                setReofferOpen(true);
              }}
              className="mt-1.5 ml-[19px] font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-clay)] underline-offset-2 hover:underline"
            >
              Offer fresh times →
            </button>
          ) : (
            <div className="mt-2.5 ml-[19px]">
              {draft.map((s) => (
                <div
                  key={s.key}
                  className="mb-1.5 flex items-center gap-3 rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-3 py-2"
                >
                  <input
                    type="datetime-local"
                    value={toLocalInputValue(s.starts_at)}
                    onChange={(e) => editSlot(s.key, e.target.value)}
                    aria-label="Offered time"
                    className="min-w-0 flex-1 bg-transparent font-heading text-[13.5px] text-[var(--color-charcoal)]"
                  />
                  <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                    {SLOT_DURATION_MINUTES} min
                  </span>
                  {draft.length > MIN_SLOTS && (
                    <button
                      type="button"
                      onClick={() => removeSlot(s.key)}
                      aria-label="Remove this time"
                      className="shrink-0 font-mono text-[11px] text-[var(--text-muted)] hover:text-[var(--color-terracotta)]"
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}
              <div className="mt-1.5 flex items-center gap-3">
                {draft.length < MAX_SLOTS && (
                  <button
                    type="button"
                    onClick={addSlot}
                    className="rounded-full border border-[var(--color-pearl)] px-3 py-1 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--color-mocha)] hover:border-[var(--color-clay)]"
                  >
                    ＋ Add a time
                  </button>
                )}
                <button
                  type="button"
                  onClick={submitReoffer}
                  disabled={draft.length < MIN_SLOTS || refresh.isPending}
                  className="rounded-[3px] border border-[var(--color-mocha)] bg-white px-3 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-mocha)] transition-colors hover:bg-[var(--color-mocha)] hover:text-[#f6efe2] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-white disabled:hover:text-[var(--color-mocha)]"
                >
                  {refresh.isPending ? 'Sending…' : 'Send fresh times →'}
                </button>
                <button
                  type="button"
                  onClick={() => setReofferOpen(false)}
                  className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-charcoal)]"
                >
                  Cancel
                </button>
              </div>
              {refresh.isError && (
                <p className="mt-1.5 text-[11px] text-[var(--color-terracotta)]">
                  {(refresh.error as { message?: string } | null)?.message || 'Could not send fresh times.'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {ceremony.thread_id && (
        <p className="mt-2 border-t border-dashed border-[var(--color-pearl)] pt-2 font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          The introduction ·{' '}
          <a
            href={`/people?thread=${ceremony.thread_id}`}
            className="text-[var(--color-mocha)] underline-offset-2 hover:underline"
          >
            view the thread →
          </a>
        </p>
      )}
    </div>
  );
}
