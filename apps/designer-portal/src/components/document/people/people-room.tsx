'use client';

/**
 * The People Room (R50 / R57) — the unified relationship layer as a walk-in
 * Room (D14), the second tenant of the reusable Rooms shell. A left rail of
 * Strata-ruled VIEWS over one directory of every party; an ask bar over people
 * + history; the foot carries a live Engine nudge derived from the nurture
 * queue. Zero shadows (D4), typography-first, put-down returns to origin.
 *
 * Track A owns the shell, the ask bar, and the Directory. The Directory's role
 * filter is LIFTED here (controlled) so the ask bar can route "makers" straight
 * to the filtered roster. Tracks B–D fill their view slots (see ./views, ./types).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  usePeopleDirectory,
  isFieldRosterRole,
  type PartyRole,
} from '@patina/supabase';
import {
  deriveNurtureQueue,
  humanizeSince,
} from '@/lib/document/people-derivation';
import { RoomShell } from '../rooms/room-shell';
import {
  DirectoryView,
  type DirectoryRole,
  type MakerLens,
} from './views/directory-view';
import { PersonProfile } from './views/person-profile';
import { PartyProfileSheet } from './party-profile-sheet';
import { ThreadsView } from './views/threads-view';
import { NurtureView } from './views/nurture-view';
import { ReviewsView } from './views/reviews-view';
import { PortfolioView } from './views/portfolio-view';
import { OutreachView } from './views/outreach-view';
import { AskBar, routePeopleAsk } from './directory/ask-bar';
import { AddPersonSheet } from './directory/add-person-sheet';
import type { PeopleView, PeopleViewProps } from './types';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { useMobilePrimaryAction } from '../mobile/mobile-shell';

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
    <span
      aria-hidden
      className="flex w-[11px] shrink-0 flex-col items-start gap-[1.5px]"
    >
      <i className="block h-[2px] w-[11px] rounded-[1px] bg-[var(--color-clay)]" />
      <i className="block h-[2px] w-[8px] rounded-[1px] bg-[var(--color-clay)] opacity-60" />
      <i className="block h-[2px] w-[5px] rounded-[1px] bg-[var(--color-clay)] opacity-30" />
    </span>
  );
}

export function PeopleRoom() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.people); // R89 — scope help to the People room
  const router = useRouter();
  const [view, setView] = useState<PeopleView>('directory');
  const [openPerson, setOpenPerson] = useState<{
    id: string;
    role: PartyRole;
  } | null>(null);
  // Field parties (gc/sub/installer/receiver) open the field-coordination party
  // sheet (SMS thread + field link) rather than the relationship profile (D1:
  // an overlay over the Room, which never unmounts).
  const [openParty, setOpenParty] = useState<{
    id: string;
    role: PartyRole;
  } | null>(null);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [ask, setAsk] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  // The Directory's role filter lives here (controlled) so the ask bar can set it.
  const [roleFilter, setRoleFilter] = useState<DirectoryRole>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [addKind, setAddKind] = useState<'client' | 'maker'>('client');
  // R51/R83 — the quiet inline confirmation band the Directory shows after an
  // add (never a toast). Cleared when the designer moves on (view/filter).
  const [notice, setNotice] = useState<string | null>(null);
  // R78 — the Makers filter's lens (roster | marketplace), lifted so walking
  // into a profile and back doesn't drop the designer out of the marketplace.
  const [makerLens, setMakerLens] = useState<MakerLens>('roster');
  // F4 — a person to scroll into view + quietly highlight in the Directory
  // once their row is on screen (set by the ?person= deep-link, or by a
  // return from that person's profile). Self-clears on a short timer.
  const [highlightPersonId, setHighlightPersonId] = useState<string | null>(
    null,
  );

  useMobilePrimaryAction({
    actionKey: 'add-person',
    surfaceKey: 'people',
    regionKey: 'room-head',
    label: 'Add person',
    target: { kind: 'press', onPress: () => setAddOpen(true) },
  });

  const { data: all } = usePeopleDirectory({ role: 'all' });
  const now = useMemo(() => new Date(), []);

  // Deep-link entry (R78/R60/F4): /people?person=<id>&role=<role> opens
  // straight onto a profile — the Orders book's "relationship & profile →"
  // cross-link lands here, and so does ⌘K's person row (F4's receiving end:
  // ⌘K doesn't always know the role, so a bare `?person=<id>` resolves the
  // role from the roster itself once it loads). R82: /people?thread=<id>
  // lands on the Threads view with that conversation open — the Post's
  // Letters carry the designer here (never a copy; the same shared thread
  // the margin renders). Read once on mount from the location itself (the
  // Room is client-only; no Suspense-bound useSearchParams needed) —
  // `deepLinkHandledRef` keeps this from re-firing (and re-opening a profile
  // the designer already closed) once `all` finishes loading or refetches.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const person = params.get('person');
    const roleParam = params.get('role');
    const thread = params.get('thread');
    const add = params.get('add');
    const roles: PartyRole[] = [
      'client',
      'lead',
      'maker',
      'gc',
      'team',
      'sub',
      'installer',
      'receiver',
    ];

    if (person) {
      const urlRole =
        roleParam && (roles as string[]).includes(roleParam)
          ? (roleParam as PartyRole)
          : null;
      const resolved =
        urlRole ?? all?.find((p) => p.person_id === person)?.role ?? null;
      if (!resolved) {
        // No role in the URL, and the roster hasn't resolved this person yet
        // — wait for `all` rather than dropping the deep-link. Once it has
        // loaded and there's still no match, give up quietly.
        if (all) deepLinkHandledRef.current = true;
        return;
      }
      deepLinkHandledRef.current = true;
      setView('directory');
      if (isFieldRosterRole(resolved)) {
        setOpenParty({ id: person, role: resolved });
      } else {
        // Land the tab a click from that row would have left active, so
        // backing out of the profile shows it in context, not under "All".
        if (
          resolved === 'maker' ||
          resolved === 'client' ||
          resolved === 'lead' ||
          resolved === 'team'
        ) {
          setRoleFilter(resolved);
        }
        setHighlightPersonId(person);
        window.setTimeout(() => {
          setHighlightPersonId((h) => (h === person ? null : h));
        }, 2200);
        setOpenPerson({ id: person, role: resolved });
      }
    } else if (thread) {
      deepLinkHandledRef.current = true;
      setPendingThreadId(thread);
      setView('threads');
    } else if (add === 'maker' || add === 'client') {
      // R78 — ⌘K "Add a maker" lands here and cold-starts the add sheet.
      deepLinkHandledRef.current = true;
      setAddKind(add);
      setAddOpen(true);
    } else {
      deepLinkHandledRef.current = true;
    }
  }, [all]);

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
      // A manual open supersedes any stray deep-link highlight (F4).
      setHighlightPersonId(null);
      // A field party opens the field sheet; everyone else the relationship profile.
      if (isFieldRosterRole(role)) setOpenParty({ id, role });
      else setOpenPerson({ id, role });
    },
    openThread: (threadId) => {
      setOpenPerson(null);
      setPendingThreadId(threadId);
      setView('threads');
    },
    goView: (v) => {
      setOpenPerson(null);
      setPendingThreadId(null);
      setNotice(null);
      setHighlightPersonId(null);
      setView(v);
    },
    notify,
  };

  /** Route the directory to a role filter AND surface the Directory view. */
  const filterDirectory = (role: DirectoryRole) => {
    setRoleFilter(role);
    nav.goView('directory');
  };

  const askEngine = () => {
    const route = routePeopleAsk(ask);
    if (!route) return;
    switch (route.kind) {
      case 'nurture':
        nav.goView('nurture');
        notify(
          'The Engine surfaced who is drifting out of touch — see the Nurture queue.',
        );
        break;
      case 'directory': {
        filterDirectory(route.role);
        const what =
          route.role === 'maker'
            ? 'your makers'
            : route.role === 'gc'
              ? 'your general contractors'
              : route.role === 'lead'
                ? 'your open leads'
                : 'your roster';
        notify(`Filtered the directory to ${what}.`);
        break;
      }
      case 'search':
        // F3 — a real filter now, not a toast: the Directory already reads
        // `ask` live as its search prop, so switching to it is the whole act.
        nav.goView('directory');
        break;
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
    <DirectoryView
      {...nav}
      role={roleFilter}
      onRoleChange={(r) => {
        setNotice(null);
        setRoleFilter(r);
      }}
      notice={notice}
      makerLens={makerLens}
      onMakerLens={setMakerLens}
      search={ask}
      highlightPersonId={highlightPersonId}
      onAddPerson={(kind) => {
        setAddKind(kind);
        setAddOpen(true);
      }}
    />
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
    <RoomShell
      title="The People Room"
      count={all ? `${all.length} people` : undefined}
      action={
        <DocumentActionGroup
          surfaceKey="people"
          regionKey="room-head"
          aria-label="People actions"
        >
          <DocumentAction
            actionKey="add-person"
            variant="primary"
            leading="+"
            onClick={() => setAddOpen(true)}
          >
            Add person
          </DocumentAction>
        </DocumentActionGroup>
      }
    >
      {/* Ask bar — over people + history (derivation-backed v1). */}
      <AskBar value={ask} onChange={setAsk} onAsk={askEngine} />

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
                  on
                    ? 'bg-[rgba(196,165,123,0.11)]'
                    : 'hover:bg-[rgba(196,165,123,0.06)]'
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
                <b className="font-semibold text-[var(--color-charcoal)]">
                  {nudge.count} {nudge.count === 1 ? 'person' : 'people'}
                </b>{' '}
                drifting out of touch. {nudge.name} is your strongest dormant
                tie ({nudge.since}).
              </span>
            </button>
          )}
        </aside>

        {/* Main panel. */}
        <main className="min-w-0 flex-1 px-5 py-4 sm:px-8">
          <div className="mx-auto max-w-[760px]">{body}</div>
        </main>
      </div>

      {/* Add a person — a paper sheet over the Room. */}
      <AddPersonSheet
        open={addOpen}
        initialKind={addKind}
        onClose={() => setAddOpen(false)}
        onAdded={(message, kind) => {
          // Land them where they'll show: the Directory, filtered to the kind
          // just added — with the confirmation INLINE above the roster (R83:
          // no toast; R51's quiet grammar).
          filterDirectory(kind);
          setNotice(message);
        }}
        onGoToLeads={() => router.push('/portal/pipeline')}
      />

      {/* Field party sheet — the SMS/field-link surface for a GC / sub /
          installer / receiver, over the Room (D1). */}
      <PartyProfileSheet
        open={!!openParty}
        partyId={openParty?.id ?? null}
        role={openParty?.role ?? 'sub'}
        onClose={() => setOpenParty(null)}
      />

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
