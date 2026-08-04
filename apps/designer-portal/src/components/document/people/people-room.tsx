'use client';

/**
 * The People Room (R50 / R57) — the unified relationship layer as a walk-in
 * Room (D14), the second tenant of the reusable Rooms shell. A grouped
 * relationship index becomes a compact disclosure below the desktop canvas;
 * an ask line searches people + history, and a live Engine nudge derives from
 * the nurture queue. Zero shadows (D4), typography-first, origin preserved.
 *
 * Track A owns the shell, the ask bar, and the Directory. The Directory's role
 * filter is LIFTED here (controlled) so the ask bar can route "makers" straight
 * to the filtered roster. Tracks B–D fill their view slots (see ./views, ./types).
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  usePeopleDirectory,
  useOrganizations,
  isFieldRosterRole,
  type PartyRole,
} from '@patina/supabase';
import type { ContactScope } from '@patina/types';
import {
  deriveNurtureQueue,
  humanizeSince,
} from '@/lib/document/people-derivation';
import { DIRECTORY_ROLES } from '@/lib/document/directory-roles';
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
import { YourEyePanel } from './profile/your-eye';
import { AskBar, routePeopleAsk } from './directory/ask-bar';
import { DEFAULT_CONTACT_SCOPE } from './directory/scope-lens';
import { AddPersonSheet } from './directory/add-person-sheet';
import type { PeopleView, PeopleViewProps } from './types';
import {
  PeopleCompactSelector,
  PeopleDesktopRail,
  peopleViewFromParam,
} from './view-shell';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { useMobilePrimaryAction } from '../mobile/mobile-shell';

// R21 dissolve — `/people?view=<key>` still receives every permanent redirect
// off the retired zone tree. `peopleViewFromParam` owns that stable key map.
// The `?role=` param map itself (DIRECTORY_ROLES) now lives in
// lib/document/directory-roles.ts — dependency-free, so a spec can pin it
// without importing this whole Room.

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
  // Call Sheet Wave 2 — the MINE · STUDIO lens (slide 8), lifted for the same
  // reason as makerLens. U6 (Wave 4): STUDIO is now the default — see
  // scope-lens.tsx's DEFAULT_CONTACT_SCOPE, the single source of truth.
  const [scope, setScope] = useState<ContactScope>(DEFAULT_CONTACT_SCOPE);
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

  // Wave 4 (00420) scope ruling — left STUDIO-wide (unscoped) on purpose.
  // `all` does two jobs here: the Room-wide "N people" count (browse) and the
  // ?person= deep-link role resolution (must reach anyone ⌘K or a cross-link
  // could have named, including a studio-mate's party). Both genuinely need
  // the wide read, so `all` stays unscoped.
  const { data: all } = usePeopleDirectory({ role: 'all' });
  // W5 fix — the Engine nudge (relationship-action, `nudge` useMemo below)
  // is a personal to-do, not a browse surface: studio visibility ≠ shared
  // nurture queues. Feeding it from the studio-wide `all` let it surface a
  // studio-mate's dormant tie as if it were the signed-in designer's own
  // relationship to chase. A separate `scope:'mine'` read feeds ONLY the
  // nudge; `all` above is untouched so the count/deep-link uses keep the
  // wide read they actually need.
  const { data: mine } = usePeopleDirectory({ role: 'all', scope: 'mine' });
  const now = useMemo(() => new Date(), []);

  // Call Sheet Wave 2 — the active studio, for the Companies chip / rolodex
  // marker (same "prefer design_studio, else first org" resolution as the
  // Account sheet's studio page). Null while orgs are still loading.
  const { data: orgs } = useOrganizations();
  const organizationId = useMemo(
    () => orgs?.find((o) => o.type === 'design_studio')?.id ?? orgs?.[0]?.id ?? null,
    [orgs],
  );

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
  //
  // Params the Room has ANSWERED are erased from the address (`view`, `role`,
  // `add` — the ones that only describe an opening state). `person` and `thread`
  // stay: they name what is on screen, so they keep their share/refresh
  // semantics exactly as they were.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const stripHandledParams = (keys: string[]) => {
      if (!keys.some((k) => params.get(k) !== null)) return;
      const rest = new URLSearchParams(params.toString());
      for (const k of keys) rest.delete(k);
      const qs = rest.toString();
      router.replace(qs ? `/people?${qs}` : '/people', { scroll: false });
    };
    const person = params.get('person');
    const roleParam = params.get('role');
    const thread = params.get('thread');
    const add = params.get('add');
    const viewParam = params.get('view');
    // Call Sheet Wave 2 — an opening-state param exactly like `view`/`role`
    // (never carries identity), so it's read + stripped the same way.
    const scopeParam = params.get('scope');
    const wantedScope: ContactScope | null =
      scopeParam === 'mine' || scopeParam === 'studio' ? scopeParam : null;
    if (wantedScope) setScope(wantedScope);
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
      // The dissolve's add-quick-action redirect emits BOTH keys
      // (/portal/clients?add=1 → /people?role=client&add=client), so the roster
      // behind the sheet has to be filtered too — closing the sheet should leave
      // the designer on the Clients tab they asked for, not under "All".
      const wantedRole =
        roleParam && (DIRECTORY_ROLES as readonly string[]).includes(roleParam)
          ? (roleParam as DirectoryRole)
          : null;
      if (wantedRole) setRoleFilter(wantedRole);
      setAddKind(add);
      setAddOpen(true);
      stripHandledParams(['add', 'role', 'view', 'scope']);
    } else {
      deepLinkHandledRef.current = true;
      // R21 dissolve — the rail and the Directory's role filter are addressable
      // now. `?view=` names a rail view; a BARE `?role=` (no person) filters the
      // Directory, which is what /portal/clients and /portal/vendors became.
      // Both together (`?view=directory&role=maker`) is coherent, so neither
      // clobbers the other; an unknown value is ignored in silence.
      const wantedView = peopleViewFromParam(viewParam);
      const wantedRole =
        roleParam && (DIRECTORY_ROLES as readonly string[]).includes(roleParam)
          ? (roleParam as DirectoryRole)
          : null;
      if (wantedRole) setRoleFilter(wantedRole);
      if (wantedView) setView(wantedView);
      else if (wantedRole) setView('directory');
      stripHandledParams(['view', 'role', 'scope']);
    }
  }, [all, router]);

  // The live Engine nudge: the strongest dormant tie from the nurture queue.
  // Reads `mine` (scope:'mine'), NOT `all` — see the note above `mine`.
  const nudge = useMemo(() => {
    const queue = deriveNurtureQueue(mine ?? [], now);
    const due = queue.filter((e) => e.due);
    const top = due[0];
    if (!top) return null;
    return {
      count: due.length,
      name: top.person.display_name,
      since: humanizeSince(top.person.last_touch_at, now),
    };
  }, [mine, now]);

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
      organizationId={organizationId}
      scope={scope}
      onScopeChange={setScope}
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
  ) : view === 'your-eye' ? (
    // R21 dissolve — the panel is self-contained (its own hooks, no nav
    // contract); it reads the designer, not a party in the roster.
    <YourEyePanel />
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

      <PeopleCompactSelector
        currentView={view}
        profileOpen={!!openPerson}
        directoryCount={all?.length}
        nudge={nudge}
        onSelect={nav.goView}
      />

      <div
        data-people-layout
        data-people-current-view={openPerson ? 'profile' : view}
        className="mx-auto flex w-full max-w-[1100px]"
      >
        <PeopleDesktopRail
          activeView={openPerson ? null : view}
          directoryCount={all?.length}
          nudge={nudge}
          onSelect={nav.goView}
        />
        {/* Main panel. */}
        <main
          data-people-main-panel
          className="min-w-0 w-full flex-1 px-4 py-6 sm:px-6 min-[1180px]:px-8"
        >
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
        // R21 dissolve — /portal/pipeline is gone; open leads are Desk folders.
        onGoToLeads={() => router.push('/desk')}
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
          data-people-status
          className="fixed bottom-[var(--doc-shell-floating-bottom)] left-1/2 z-[65] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 rounded-[4px] border border-[rgba(250,247,242,0.18)] bg-[var(--color-charcoal)] px-4 py-3 font-body text-[14px] leading-relaxed text-[var(--color-off-white)] motion-safe:animate-[doc-fade_200ms_ease-out]"
        >
          {toast}
        </div>
      )}
    </RoomShell>
  );
}
