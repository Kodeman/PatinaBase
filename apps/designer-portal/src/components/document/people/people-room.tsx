'use client';

/**
 * The People Room (R50 / R57) — the unified relationship layer as a walk-in
 * Room (D14), the second tenant of the reusable Rooms shell. A left rail of
 * Strata-ruled VIEWS over one directory of every party; an ask bar over people
 * + history; the foot carries a live Engine nudge derived from the nurture
 * queue. Zero shadows (D4), typography-first, put-down returns to origin.
 *
 * Wave-0 wires the shell, the navigation contract, and the directory; Tracks
 * A–D fill their view slots (see ./views, ./types).
 */

import { useMemo, useState } from 'react';
import { usePeopleDirectory, type PartyRole } from '@patina/supabase';
import { deriveNurtureQueue, humanizeSince } from '@/lib/document/people-derivation';
import { RoomShell } from '../rooms/room-shell';
import { DirectoryView } from './views/directory-view';
import { PersonProfile } from './views/person-profile';
import { ThreadsView } from './views/threads-view';
import { NurtureView } from './views/nurture-view';
import { ReviewsView } from './views/reviews-view';
import { PortfolioView } from './views/portfolio-view';
import { OutreachView } from './views/outreach-view';
import type { PeopleView, PeopleViewProps } from './types';

const VIEWS: Array<{ key: PeopleView; name: string }> = [
  { key: 'directory', name: 'Directory' },
  { key: 'threads', name: 'Threads' },
  { key: 'nurture', name: 'Nurture' },
  { key: 'reviews', name: 'Reviews' },
  { key: 'portfolio', name: 'Portfolio' },
  { key: 'outreach', name: 'Outreach' },
];

/** The quiet descending mark beside a view row (prototype .vr-mark). */
function RailMark() {
  return (
    <span aria-hidden className="flex w-[11px] shrink-0 flex-col items-start gap-[1.5px]">
      <i className="block h-[2px] w-[11px] rounded-[1px] bg-[var(--color-clay)]" />
      <i className="block h-[2px] w-[8px] rounded-[1px] bg-[var(--color-clay)] opacity-60" />
      <i className="block h-[2px] w-[5px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
    </span>
  );
}

export function PeopleRoom() {
  const [view, setView] = useState<PeopleView>('directory');
  const [openPerson, setOpenPerson] = useState<{ id: string; role: PartyRole } | null>(null);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const { data: all } = usePeopleDirectory({ role: 'all' });
  const now = useMemo(() => new Date(), []);

  // The live Engine nudge: the strongest dormant tie from the nurture queue.
  const nudge = useMemo(() => {
    const queue = deriveNurtureQueue(all ?? [], now);
    const due = queue.filter((e) => e.due);
    const top = due[0];
    if (!top) return null;
    return {
      count: due.length,
      name: top.person.display_name,
      since: humanizeSince(top.person.last_touch_at, now),
    };
  }, [all, now]);

  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast((t) => (t === message ? null : t)), 3600);
  };

  const nav: PeopleViewProps = {
    openPerson: (id, role) => {
      setOpenPerson({ id, role });
    },
    openThread: (threadId) => {
      setOpenPerson(null);
      setPendingThreadId(threadId);
      setView('threads');
    },
    goView: (v) => {
      setOpenPerson(null);
      setPendingThreadId(null);
      setView(v);
    },
    notify,
  };

  const askEngine = () => {
    const q = ask.trim().toLowerCase();
    if (!q) return;
    if (/(reconnect|quiet|touch|drift|nurture)/.test(q)) {
      nav.goView('nurture');
      notify('The Engine surfaced who is drifting out of touch — see the Nurture queue.');
    } else if (/(maker|vendor|supplier)/.test(q)) {
      nav.goView('directory');
      notify('Filter the directory to your makers.');
    } else {
      notify(
        `The Engine searches people, threads, and history for “${ask.trim()}” — and recommends who to reconnect with.`,
      );
    }
  };

  const body = openPerson ? (
    <PersonProfile
      personId={openPerson.id}
      role={openPerson.role}
      onBack={() => setOpenPerson(null)}
      {...nav}
    />
  ) : view === 'directory' ? (
    <DirectoryView {...nav} />
  ) : view === 'threads' ? (
    <ThreadsView {...nav} pendingThreadId={pendingThreadId} />
  ) : view === 'nurture' ? (
    <NurtureView {...nav} />
  ) : view === 'reviews' ? (
    <ReviewsView {...nav} />
  ) : view === 'portfolio' ? (
    <PortfolioView {...nav} />
  ) : (
    <OutreachView {...nav} />
  );

  return (
    <RoomShell title="The People Room" count={all ? `${all.length} people` : undefined}>
      {/* Ask bar — over people + history (derivation-backed v1). */}
      <div className="mx-auto max-w-[1100px] px-4 pt-3 sm:px-6">
        <div className="flex max-w-[460px] items-center gap-2.5 rounded-[24px] border border-[var(--color-pearl)] bg-white px-4 py-2.5 focus-within:border-[var(--color-clay)]">
          <span aria-hidden className="text-[0.8rem] text-[var(--color-clay)]">
            ✦
          </span>
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') askEngine();
            }}
            placeholder="Find someone — or ask the Engine who to reconnect with"
            className="min-w-0 flex-1 bg-transparent text-[0.78rem] text-[var(--color-charcoal)] outline-none placeholder:text-[var(--color-aged-oak)]"
          />
        </div>
      </div>

      <div className="mx-auto flex max-w-[1100px] gap-0">
        {/* Left rail — Strata-ruled views (not tabs). */}
        <aside className="w-[160px] shrink-0 border-r border-[var(--doc-ink-border)]/40 py-3 sm:w-[188px]">
          <div className="mb-2 px-4 font-mono text-[0.44rem] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]">
            In this room
          </div>
          {VIEWS.map((v) => {
            const on = !openPerson && view === v.key;
            return (
              <button
                key={v.key}
                type="button"
                onClick={() => nav.goView(v.key)}
                className={`relative flex w-full items-center gap-2.5 px-4 py-2 text-left transition-colors ${
                  on ? 'bg-[rgba(196,165,123,0.11)]' : 'hover:bg-[rgba(196,165,123,0.06)]'
                }`}
              >
                {on && (
                  <span
                    aria-hidden
                    className="absolute inset-y-0 left-0 w-[2.5px] bg-[var(--color-clay)]"
                  />
                )}
                <RailMark />
                <span className="flex-1 text-[0.8rem] font-medium text-[var(--color-charcoal)]">
                  {v.name}
                </span>
                {v.key === 'directory' && all && (
                  <span className="font-mono text-[0.5rem] text-[var(--color-aged-oak)]">
                    {all.length}
                  </span>
                )}
              </button>
            );
          })}

          {nudge && (
            <button
              type="button"
              onClick={() => nav.goView('nurture')}
              className="mx-3 mt-4 block rounded-[8px] border border-[rgba(196,165,123,0.3)] bg-[rgba(196,165,123,0.07)] px-3 py-2.5 text-left"
            >
              <span className="mb-1 block font-mono text-[0.42rem] font-semibold uppercase tracking-[0.08em] text-[var(--color-clay)]">
                ✦ The Engine
              </span>
              <span className="block text-[0.66rem] leading-relaxed text-[var(--color-mocha)]">
                <b className="font-semibold text-[var(--color-charcoal)]">{nudge.count} {nudge.count === 1 ? 'person' : 'people'}</b>{' '}
                drifting out of touch. {nudge.name} is your strongest dormant tie ({nudge.since}).
              </span>
            </button>
          )}
        </aside>

        {/* Main panel. */}
        <main className="min-w-0 flex-1 px-5 py-4 sm:px-8">
          <div className="mx-auto max-w-[760px]">{body}</div>
        </main>
      </div>

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-[72px] left-1/2 z-[65] max-w-[80%] -translate-x-1/2 rounded-[8px] border border-[rgba(196,165,123,0.3)] bg-[var(--color-charcoal)] px-4 py-2.5 text-[0.74rem] text-[var(--color-off-white)] motion-safe:animate-[doc-fade_200ms_ease-out]"
        >
          {toast}
        </div>
      )}
    </RoomShell>
  );
}
