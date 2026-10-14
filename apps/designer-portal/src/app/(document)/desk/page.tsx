'use client';

/**
 * The Desk (spec v1.1 §7) — read-only in Slice 1.
 * Date + the ⌘K affordance are the only chrome. One roster of every live job,
 * grouped by stage, carries the whole studio; nothing folds on first paint.
 * No metric tiles, badges, feeds, or dashboard furniture.
 */

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import {
  useProfile,
  useOrganizations,
  useOrganizationMembers,
  useBoardsReactionRollup,
  useRecentBoards,
  useStudioUnbilledTime,
  useProjectLeads,
  useNeedStates,
  useTeammateActed,
} from '@patina/supabase';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import { useViewerStudio } from '@/hooks/use-viewer-studio';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { DeskTodaySkeleton, useLoadingRegister } from '@/components/loading';
import {
  openCommandBar,
  captureLeadPending,
  openProjectPending,
} from '@/components/document/command-bar';
import { documentEvents } from '@/lib/analytics/document-events';
import { DeskRoster } from '@/components/document/desk-roster';
import {
  deriveDeskLedger,
  deriveDeskRoster,
  deriveRosterPeople,
  pinnedProjectIdsFromRoster,
  type DeskRosterInput,
} from '@/lib/document/desk-roster-derivation';
import { useDeskLineState } from '@/components/document/desk-arbiter';
import { deriveDeskNeedList } from '@/lib/document/desk-need-list';
import { studioOutboundNeed } from '@/lib/document/desk-derivation';
import {
  deriveHandoffNeeds,
  deskDesignersOf,
  deskHolderOf,
  type DeskScope,
} from '@/lib/document/desk-scope';
import { WEEKDAY_FORMAT, dayMonth } from '@/lib/document/dates';
import { DeskContents } from '@/components/document/desk-contents';
import { RecentBoardsStrip } from '@/components/document/recent-boards-strip';
import { DeskBoardsReactionRollup } from '@/components/document/desk-boards-reaction-rollup';
import { MarginNote } from '@/components/document/margin-note';
import { useArrivalWaiting } from '@/components/document/arrival/arrival-mount';
import { DaySheet } from '@/components/document/day-sheet';
import { EmptyState } from '@/components/document/empty-state';
import { deriveDaySheet, groupSheetByJob } from '@/lib/document/day-sheet';
import {
  START_DESK_WALKTHROUGH_EVENT,
  clearDeskWalkthroughLater,
  useDeskWalkthroughOffer,
  useSuppressDeskFirstTouch,
} from '@/components/document/help/desk-walkthrough';
import { CaptureLeadSheet, type CapturedLead } from '@/components/document/overlays/capture-lead-sheet';
import { OpenProjectSheet } from '@/components/document/overlays/open-project-sheet';
import {
  DocumentAction,
  DocumentActionGroup,
} from '@/components/document/document-action';
import { RegionRule } from '@/components/document/region/region-rule';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';

// F6 — Back keeps the place. The Desk holds its scroll offset (and the row
// last pressed) for this tab when it is left, and puts it back only when a
// history traversal lands here; a fresh entry belongs to the arrival.
const DESK_PLACE_KEY = 'patina.desk.place';

interface DeskPlace {
  y: number;
  anchor: string | null;
}

let deskMounted = false;
// Read when a Back lands on the Desk, before the Desk mounts and holds again.
let placeToRestore: DeskPlace | null = null;
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    placeToRestore =
      !deskMounted && window.location.pathname === '/desk' ? heldDeskPlace() : null;
  });
}

function holdDeskPlace(anchor: string | null): void {
  try {
    const place: DeskPlace = { y: window.scrollY, anchor };
    window.sessionStorage.setItem(DESK_PLACE_KEY, JSON.stringify(place));
  } catch {
    /* storage disabled — Back lands where the browser puts it */
  }
}

function heldDeskPlace(): DeskPlace | null {
  try {
    const raw = window.sessionStorage.getItem(DESK_PLACE_KEY);
    const held = raw ? (JSON.parse(raw) as Partial<DeskPlace> | null) : null;
    if (!held || typeof held.y !== 'number') return null;
    return { y: held.y, anchor: typeof held.anchor === 'string' ? held.anchor : null };
  } catch {
    return null;
  }
}

/** `desk-first-touch` is a first-hour line (return-teaching §2). */
const FIRST_HOUR_MS = 60 * 60 * 1000;

export default function DeskPage() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.desk); // R89 — scope help to the Desk
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const studio = orgs?.find((o) => o.type === 'design_studio') ?? orgs?.[0] ?? null;
  const studioId = studio?.id ?? '';
  const { data, isLoading, isError, isSuccess, isPlaceholderData, refetch } =
    useDeskEngagements({ organizationId: studioId || null });
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const hydrated = useHydrated();
  const suppressFirstTouch = useSuppressDeskFirstTouch(); // R97 — hold the note during modal/tour
  const showWalkthroughOffer = useDeskWalkthroughOffer(); // R97 — existing-designer tour offer
  const [captureOpen, setCaptureOpen] = useState(false);
  // U-Q7 — the inquiry she just recorded, for this visit's one line.
  const [recorded, setRecorded] = useState<CapturedLead | null>(null);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);

  const oneVoice = useFeatureFlag('one-voice').value === true;
  // US-34 N10 — the loading register: Today's frames become filled bars.
  const loadingRegister = useLoadingRegister();
  const {
    data: studioMembers,
    isLoading: studioMembersLoading,
    isPending: studioMembersPending,
  } = useOrganizationMembers(studio?.id ?? '');
  const { data: projectLeads, isSuccess: projectLeadsRead } = useProjectLeads(studioId);
  const { data: needStates } = useNeedStates(studio?.id ?? '');
  // U-Q4 — teammates' acts, as facts; never merged into her own states.
  const { data: teammateActed, isSuccess: teammateActedRead } = useTeammateActed(studio?.id ?? '');
  // N4 — Mine by default, held per person in this browser.
  const [deskScope, setDeskScopeState] = useState<DeskScope>('mine');
  const scopeStoreKey = user?.id ? `patina.desk.scope.${user.id}` : null;
  useEffect(() => {
    if (!scopeStoreKey) return;
    try {
      const held = window.localStorage.getItem(scopeStoreKey);
      if (held === 'mine' || held === 'studio') setDeskScopeState(held);
    } catch {
      /* storage disabled — Mine stands */
    }
  }, [scopeStoreKey]);
  const setDeskScope = (scope: DeskScope) => {
    setDeskScopeState(scope);
    if (!scopeStoreKey) return;
    try {
      window.localStorage.setItem(scopeStoreKey, scope);
    } catch {
      /* storage disabled — the choice lasts this visit */
    }
  };

  // A9: no mobile primary action is registered here — the header's
  // "Capture a lead" (below) is the one on-screen CTA at every viewport, and
  // the mobile dock falls back to its documented default (the "In hand /
  // Today" glance, mobile-bar.tsx) instead of duplicating it.

  // R21 week-one watch: the Desk's composition on each load (folder/chip
  // counts + need-line kinds) so noise — esp. sent-unacknowledged frequency
  // at the 1d threshold — reads off telemetry, not observation.
  const deskSig = data
    ? `${data.folders.length}:${data.chips.length}:${data.folders
        .map((f) => f.need.kind)
        .sort()
        .join(',')}`
    : null;
  useEffect(() => {
    if (!data) return;
    const need_kinds: Record<string, number> = {};
    for (const f of data.folders)
      need_kinds[f.need.kind] = (need_kinds[f.need.kind] ?? 0) + 1;
    documentEvents.deskRendered({
      folder_count: data.folders.length,
      chip_count: data.chips.length,
      need_kinds,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deskSig]);

  // ⌘K's "Capture a lead" action dispatches this — open the sheet from there
  // too, so the front door is reachable by command as well as by the CTA. When
  // the command was run from another surface, the event fired before this
  // listener existed; the pending flag carries the intent across the route.
  useEffect(() => {
    if (captureLeadPending.value) {
      captureLeadPending.value = false;
      setCaptureOpen(true);
    }
    const onOpen = () => {
      captureLeadPending.value = false;
      setCaptureOpen(true);
    };
    window.addEventListener('document:open-capture-lead', onOpen);
    return () =>
      window.removeEventListener('document:open-capture-lead', onOpen);
  }, []);

  // R79 — same contract for ⌘K's "Open a project".
  useEffect(() => {
    if (openProjectPending.value) {
      openProjectPending.value = false;
      setOpenProjectOpen(true);
    }
    const onOpen = () => {
      openProjectPending.value = false;
      setOpenProjectOpen(true);
    };
    window.addEventListener('document:open-open-project', onOpen);
    return () =>
      window.removeEventListener('document:open-open-project', onOpen);
  }, []);

  // Time-derived greeting + date are client-only — server vs client timezone
  // would otherwise mismatch on hydration. useHydrated keeps SSR and the first
  // client render identical ('Hello' / blank date), then fills in after mount.
  const now = new Date();
  const greetingWord = !hydrated
    ? 'Hello'
    : now.getHours() < 12
      ? 'Good morning'
      : now.getHours() < 18
        ? 'Good afternoon'
        : 'Good evening';
  // PP-2 — the Desk's one date style. U-Q3 — it prints in Today's eyebrow,
  // "Monday 12 October · Today"; the eyebrow sets the caps.
  const dateLabel = hydrated ? `${WEEKDAY_FORMAT.format(now)} ${dayMonth(now)}` : '';
  const name =
    profile?.display_name || profile?.full_name || user?.name || null;
  // The Desk greeting uses the real first name; with none resolved we greet
  // plainly ("Good morning.") rather than the old "Good morning, there".
  const firstName = name?.trim().split(/\s+/)[0] || null;

  // The roster is the Desk's one population — every live job, grouped by
  // stage, in the paper's own section order.
  const rosterInput = useMemo<DeskRosterInput>(
    () => ({
      folders: data?.folders ?? [],
      chips: data?.chips ?? [],
      live: data?.live ?? [],
      oneVoice,
      unreadFeeds: data?.unreadFeeds,
      scope: deskScope,
      leads: projectLeads,
      meUserId: user?.id,
    }),
    [data, deskScope, oneVoice, projectLeads, user?.id],
  );
  const roster = useMemo(() => deriveDeskRoster(rosterInput, new Date()), [rosterInput]);

  // Today's cards take each job's name and stage from the full roster, keyed
  // by the id the sheet's lines carry (`project_id ?? engagement_id`).
  const rosterJobs = useMemo(
    () =>
      new Map(
        roster.groups.flatMap((group) => group.lines).map((line) => [line.projectId ?? line.engagementId, line]),
      ),
    [roster],
  );
  const people = useMemo(() => deriveRosterPeople(studioMembers ?? []), [studioMembers]);
  const names = useMemo(
    () => new Map(people.map((person) => [person.id, person.name] as const)),
    [people],
  );
  const holderOf = useMemo(
    () => deskHolderOf(projectLeads ?? new Map(), user?.id, deskDesignersOf(data?.live ?? []), names),
    [projectLeads, user?.id, data, names],
  );

  // A quiet Desk (no live jobs at all) lets the Studio index rise to fill the
  // space — larger, and earlier in the composition — rather than sitting as
  // bottom front matter. Only known once the read resolves.
  const deskEmpty = !!data && data.live.length === 0 && !data.studioDrafts?.length;
  // SQ-778 N3 — her seat (the invite note and its writer); handoffNoteFor
  // decides per job whether the note is that job's.
  const mySeat = studioMembers?.find((m) => m.user_id === user?.id) ?? null;
  // The Day Sheet (slice 4): the top five of the one ranked need list, the
  // hand-offs riding it like any other need.
  const sheet = useMemo(() => {
    const at = new Date();
    const handoffs = deriveHandoffNeeds(
      data?.live ?? [],
      projectLeads ?? new Map(),
      user?.id,
      needStates,
      mySeat,
      at,
    );
    // SQ-751 F8 — the person scope runs before the studio errands collapse to
    // one line, so her own Pulse survives in Mine.
    const needs = deriveDeskNeedList(
      {
        folders: data?.folders ?? [],
        chips: data?.chips ?? [],
        live: data?.live ?? [],
        scope: deskScope,
        leads: projectLeads ?? new Map(),
        meUserId: user?.id,
      },
      at,
      handoffs,
    );
    const studioNeed = studioOutboundNeed(data?.studioDrafts ?? [], at);
    if (studioNeed && studioId) {
      needs.push({
        key: studioNeed.key,
        projectId: studioId,
        projectName: 'Studio',
        studioLevel: true,
        studioId,
        need: studioNeed,
      });
    }
    return deriveDaySheet({
      needs,
      states: needStates ?? new Map(),
      leads: projectLeads ?? new Map(),
      meUserId: user?.id,
      scope: deskScope,
      designers: deskDesignersOf(data?.live ?? []),
      teammateActs: teammateActed,
      // SQ-751 F5 — who leads each job is a feed: until a studio's leads
      // answer, Mine is not known to be empty. A seat with no studio has none.
      unreadFeeds: [
        ...(data?.unreadFeeds ?? []),
        ...(studioId && !projectLeadsRead ? ['project leads'] : []),
        // R14 — the studio's scope settles a line on its holder's act (U-Q4):
        // until those facts answer, an open line there may already be done.
        ...(studioId && deskScope === 'studio' && !teammateActedRead ? ['teammates’ acts'] : []),
      ],
      now: at,
    });
  }, [
    data,
    projectLeads,
    projectLeadsRead,
    studioId,
    user?.id,
    needStates,
    teammateActed,
    teammateActedRead,
    mySeat,
    deskScope,
  ]);

  // US-28 change 1/2 — Today as cards, one per job; the ledger takes every
  // job Today does not, read on the same ranked list.
  const cards = useMemo(
    () => groupSheetByJob(sheet.lines, rosterJobs, holderOf),
    [sheet, rosterJobs, holderOf],
  );
  const ledger = useMemo(
    () => deriveDeskLedger({ roster: rosterInput, sheet, cards, people, holderOf, now: new Date() }),
    [rosterInput, sheet, cards, people, holderOf],
  );
  // Mine — whose the rest of the studio's jobs are, by the names that carry them.
  const othersHold = useMemo(() => {
    if (deskScope !== 'mine') return null;
    const holders = [
      ...new Set(
        (data?.live ?? [])
          .map((row) => holderOf(row.project_id ?? row.engagement_id))
          .filter((holder) => !holder.mine && holder.name)
          .map((holder) => `${holder.name}’s`),
      ),
    ];
    if (holders.length === 0) return null;
    const list = holders.length === 1 ? holders[0] : `${holders.slice(0, -1).join(', ')} and ${holders.at(-1)}`;
    return `The rest of the studio’s jobs are ${list}.`;
  }, [deskScope, data, holderOf]);

  // The Desk arbiter (return-teaching §2): these four lines keep their own
  // conditions, and at most one of them, or the teaching note, renders per
  // visit, below the roster head. `pending` holds the pick until a line's
  // inputs resolve.
  const pinnedProjectIds = useMemo(
    () => pinnedProjectIdsFromRoster(roster.groups.flatMap((group) => group.lines)),
    [roster],
  );
  const accountAgeMs = profile?.created_at
    ? now.getTime() - Date.parse(profile.created_at)
    : Number.NaN;
  const { node: deskLine, decided: deskLineDecided } = useDeskLineState({
    ready: hydrated && !!data && !isError,
    pinnedProjectIds,
    lines: {
      'hire-handoff': { when: false, node: null },
      // R94 — the one first-touch note: what the Desk is, and the ⌘K move.
      // Recedes forever on the first ⌘K open or the × (never a tour). R97 —
      // held while the walkthrough modal/tour is on screen, and retired on
      // tour completion (the tour teaches ⌘K itself). First hour only (§2).
      'desk-first-touch': {
        when: profileLoading ? 'pending' : accountAgeMs < FIRST_HOUR_MS,
        node: (
          <MarginNote
            noteKey="desk-first-touch"
            commandBar
            suppressed={suppressFirstTouch}
            className="mb-10"
          >
            This is your Desk. Folders that need you gather here; the rest stays
            quiet.{' '}
            <span className="font-mono text-[12px] not-italic tracking-[0.02em] text-[var(--text-muted)]">
              ⌘K
            </span>{' '}
            finds anything by name — try “invoice”.
          </MarginNote>
        ),
      },
      // R97 — existing designers (created before the ship date) get a quiet
      // one-time offer instead of the auto-modal. The inline link starts the
      // walkthrough; the note recedes on that same event (actionEvents) or
      // the ×. The Desk Walkthrough gates eligibility; the primitive gates
      // once-only.
      'desk-walkthrough-offer': {
        when: showWalkthroughOffer,
        node: (
          <MarginNote
            noteKey="desk-walkthrough-offer"
            actionEvents={[START_DESK_WALKTHROUGH_EVENT]}
            // A deferred ("Show me later") record only earns one re-offer
            // (decisions #2) — clear it as soon as this note is seen,
            // whether dismissed (×) or acted on (the tour starting).
            onSeen={clearDeskWalkthroughLater}
            className="mb-10"
          >
            New desk, same studio — your projects are all here as documents
            now.{' '}
            <button
              type="button"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent(START_DESK_WALKTHROUGH_EVENT),
                )
              }
              className="inline-flex min-h-11 items-center font-heading text-[15px] italic text-[var(--color-aged-oak)] underline decoration-[var(--color-aged-oak)] decoration-1 underline-offset-2 transition-colors hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none"
            >
              The walkthrough is six quick stops
            </button>{' '}
            if you&apos;d like the lay of it.
          </MarginNote>
        ),
      },
      // US-25 slice 4 — the setup whisper left the Desk; the Account sheet's
      // Studio page carries the setup checklist it pointed to.
      'setup-whisper': { when: false, node: null },
    },
  });

  // US-14 arrival marks (inert). The route root is marked only while the
  // roster itself renders — never the skeleton or the error state — and is
  // ready once hydrated and at the first non-placeholder read. Ready also
  // waits for the reads that print inside the root after the roster mounts
  // (the day's line's answered notes, the boards rollup): an answer landing
  // mid-arrival would end it as a mutation. Same query keys as DeskRoster,
  // DeskBoardsReactionRollup, RecentBoardsStrip and DeskContents, so these
  // share their fetches. The day's line must also be picked.
  //
  // Round 5 — the studio members print the roster's "By person" facet, a
  // second-wave read behind the organizations read. With no studio the query
  // is disabled, and a disabled query with no data stays `isPending` in
  // TanStack v5, so it counts as settled only once there is a studio to read.
  // While the organizations read is out, `viewerStudio.isSettled` holds ready.
  const studioMembersSettled = !studio || !studioMembersPending;
  const reactionRollupRead = useBoardsReactionRollup();
  const recentBoardsRead = useRecentBoards(8);
  const viewerStudio = useViewerStudio();
  const unbilledTimeRead = useStudioUnbilledTime();
  const deskRead = !isError && !!data;
  const arrivalReady =
    deskRead &&
    hydrated &&
    isSuccess &&
    !isPlaceholderData &&
    !reactionRollupRead.isPending &&
    !recentBoardsRead.isPending &&
    viewerStudio.isSettled &&
    studioMembersSettled &&
    !unbilledTimeRead.isPending &&
    deskLineDecided;
  // US-14 post-ship patch 1 — while the Desk's arrival wait is armed the
  // skeleton stands until ready, so the route root first appears ready. A root
  // this mount has shown is never taken back.
  const arrivalWaiting = useArrivalWaiting('/desk');
  const arrivalRootShown = useRef(false);
  const arrivalHeld = arrivalWaiting && !arrivalReady && !arrivalRootShown.current;
  const arrivalRoot = deskRead && !arrivalHeld;
  // Latched at commit, not in render: a render React throws away must not
  // count as a shown root.
  useLayoutEffect(() => {
    if (arrivalRoot) arrivalRootShown.current = true;
  }, [arrivalRoot]);

  // F6 — the row last pressed, held with the offset as its fallback.
  const pressedAnchor = useRef<string | null>(null);
  const deskRoot = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    deskMounted = true;
    const onHide = () => holdDeskPlace(pressedAnchor.current);
    window.addEventListener('pagehide', onHide);
    return () => {
      // A layout cleanup runs before the Desk leaves the page, so the offset
      // is still the Desk's own, whichever way she left.
      holdDeskPlace(pressedAnchor.current);
      window.removeEventListener('pagehide', onHide);
      deskMounted = false;
      // A real leave drops a place the Desk never got to put back; React's
      // dev rehearsal of an unmount remounts before this runs.
      window.setTimeout(() => {
        if (!deskMounted) placeToRestore = null;
      });
    };
  }, []);
  // Restored once the root latches. The roster can still be filling in then,
  // so a place the page cannot yet hold is tried again as the page grows,
  // until it lands, her hand moves the page, or the wait runs out.
  useLayoutEffect(() => {
    const place = placeToRestore;
    if (!arrivalRoot || !place) return;
    const land = (): boolean => {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (place.y <= room) {
        window.scrollTo({ top: place.y, behavior: 'auto' });
        return true;
      }
      const row = place.anchor ? document.getElementById(place.anchor) : null;
      if (!row) return false;
      row.scrollIntoView({ block: 'start', behavior: 'auto' });
      return true;
    };
    if (land()) {
      placeToRestore = null;
      return;
    }
    const hands = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    const grow = new ResizeObserver(() => {
      if (land()) settle();
    });
    const wait = window.setTimeout(settle, 3000);
    // A cleanup only stops watching: a dev rehearsal remount tries again.
    function stop() {
      grow.disconnect();
      window.clearTimeout(wait);
      hands.forEach((hand) => window.removeEventListener(hand, settle));
    }
    function settle() {
      placeToRestore = null;
      stop();
    }
    // The Desk's own root grows as the roster fills in; the body does not.
    grow.observe(deskRoot.current ?? document.body);
    hands.forEach((hand) => window.addEventListener(hand, settle, { passive: true }));
    return stop;
  }, [arrivalRoot]);
  const notePress = (event: ReactMouseEvent<HTMLElement>) => {
    const target = event.target as Element | null;
    if (!target?.closest?.('a[href]')) return;
    pressedAnchor.current = target.closest('[data-ledger-row]')?.id ?? null;
  };

  const rosterBlock =
    ((isLoading && !data) || arrivalHeld) && loadingRegister ? (
      <DeskTodaySkeleton dateLabel={dateLabel} />
    ) : (isLoading && !data) || arrivalHeld ? (
      // Loading is not empty: Today's eyebrow and three quiet frames where
      // its cards will stand, no ledger yet.
      <section
        className="section"
        aria-labelledby="desk-loading-head"
        aria-busy="true"
        data-tour-anchor="desk-needs-your-hand"
      >
        <div className="sec-head">
          <p id="desk-loading-head" className="eb">
            <svg className="orn" viewBox="0 0 34 12" aria-hidden="true" focusable="false">
              <path d="M0 2h34M0 6h28M0 10h20" />
            </svg>
            <span>{dateLabel ? `${dateLabel} · Today` : 'Today'}</span>
          </p>
        </div>
        <p className="sr-only">Loading today’s lines.</p>
        <div className="cards-wrap" aria-hidden="true">
          <div className="cards">
            {[0, 1, 2].map((i) => (
              <div key={i} className="desk-loading-frame" />
            ))}
          </div>
        </div>
      </section>
    ) : deskEmpty && sheet.unchecked.length === 0 ? (
      <div data-tour-anchor="desk-needs-your-hand">
        <EmptyState eyebrow={dateLabel ? `${dateLabel} · Today` : 'Today'}>
          No project files yet. Record an inquiry or create a project file to begin.
        </EmptyState>
      </div>
    ) : (
      <>
        <DaySheet
          sheet={sheet}
          cards={cards}
          scope={deskScope}
          onScope={setDeskScope}
          oneVoice={oneVoice}
          now={now}
          dateLabel={dateLabel}
          teammateActed={teammateActed}
          names={names}
        />
        <DeskRoster
          ledger={ledger}
          holderOf={holderOf}
          belowHead={
            <>
              {deskLine}
              {/* U-Q7 — the visit line, above Also yours; the inquiry
                  itself is a row of the ledger, read like any other. */}
              {recorded && (
                <p data-desk-visit role="status" className="t-body-sm text-[var(--text-muted)] [overflow-wrap:anywhere]">
                  {`${recorded.name} recorded · just now · `}
                  <DocumentAction
                    actionKey="desk-visit-open-brief"
                    variant="tertiary"
                    href={`/doc/${recorded.id}`}
                    aria-label={`Open the brief — ${recorded.name}`}
                  >
                    Open the brief
                  </DocumentAction>
                </p>
              )}
            </>
          }
          othersHold={othersHold}
        />
      </>
    );

  return (
    <main
      data-arrival={arrivalRoot ? 'desk' : undefined}
      data-arrival-ready={arrivalReady ? '' : undefined}
      className="mx-auto w-full max-w-[1120px] px-[clamp(1.5rem,5vw,4rem)] pb-28 pt-14"
      ref={deskRoot}
      onClickCapture={notePress}
    >
      {/* F1 — one header line: the greeting, then the acts on its baseline.
          The date moved to Today's eyebrow (U-Q3). */}
      <header className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 pb-3">
        {/* The signature move: greeting in Playfair, the first name in
            Playfair italic, Aged Oak. Kept modest so the folios lead. */}
        <h1
            data-tour-anchor="desk-greeting"
          className="font-heading text-[1.7rem] font-normal text-[var(--text-primary)]"
        >
          {firstName ? (
            <>
              {greetingWord},{' '}
              <span className="italic text-[var(--text-muted)]">
                {firstName}
              </span>
            </>
          ) : (
            <>{greetingWord}.</>
          )}
        </h1>
        {/* At 390 the header is two rows: Find on the greeting's, then the
            creates. This Find stands only there, so focus follows the eye
            at both widths; the wide one closes the acts' row. */}
        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="desk-find"
          aria-label="Find"
          className="min-[600px]:hidden"
        >
          <DocumentAction
            actionKey="find-anything"
            variant="tertiary"
            leading="⌕"
            aria-label="Find anything"
            onClick={() => openCommandBar()}
          >
            Find
          </DocumentAction>
        </DocumentActionGroup>
        {/* No filled act on the Desk: both creates are secondary (F1). At
            390 each prints its short word; its name stays whole (2.5.3). */}
        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="desk-head"
          aria-label="Desk actions"
          className="max-[599px]:basis-full"
        >
          <DocumentAction
            actionKey="capture-lead"
            variant="secondary"
            leading="＋"
            aria-label="Record an inquiry"
            data-tour-anchor="desk-capture-lead"
            onClick={() => setCaptureOpen(true)}
          >
            <span className="max-[599px]:hidden">Record an inquiry</span>
            <span aria-hidden="true" className="min-[600px]:hidden">
              Inquiry
            </span>
          </DocumentAction>
          {/* R79 — the quiet act beside capture: a project that skips the
              proposal (a repeat client, handshake work). */}
          <DocumentAction
            actionKey="open-project"
            variant="secondary"
            leading="＋"
            aria-label="Create a project file"
            onClick={() => setOpenProjectOpen(true)}
          >
            <span className="max-[599px]:hidden">Create a project file</span>
            <span aria-hidden="true" className="min-[600px]:hidden">
              Project
            </span>
          </DocumentAction>
          <DocumentAction
            actionKey="find-anything"
            variant="tertiary"
            data-tour-anchor="desk-find-anything"
            className="max-[599px]:hidden"
            onClick={() => openCommandBar()}
            trailing={
              // The ⌘K hint is for a fine pointer only.
              <kbd className="hidden rounded-[3px] border border-[var(--border-default)] px-1 py-px font-mono [@media(hover:hover)_and_(pointer:fine)]:inline">
                ⌘K
              </kbd>
            }
          >
            Find anything
          </DocumentAction>
        </DocumentActionGroup>
      </header>
      {/* F2 — the double rule opens the day under the header. */}
      <RegionRule weight="strong" className="mb-12 max-[599px]:mb-6" />

      {isError ? (
        // I64 whole-desk error state: one coherent surface, not a half-desk.
        // A 0-row auth-degraded read now throws (use-desk-engagements.ts), so
        // this branch means a genuine read failure — never mix it with the
        // Needs-your-hand / In-motion / Contents populations below, which
        // would otherwise render past it independently and produce exactly
        // the incoherent half-desk this replaces. Everything past the
        // greeting is replaced, including the first-touch note (it describes
        // desk contents that did not load) and the open-requests/Contents/
        // reconnect/field populations (each fetches its own data and would
        // otherwise float, working, beside a "could not be read" message).
        <div
          role="alert"
          data-testid="desk-error-state"
          className="mt-16 max-w-[440px]"
        >
          <p className="font-heading text-[15px] italic text-[var(--text-muted)]">
            Your studio overview couldn't load.
          </p>
          <p className="doc-type-body mt-2">
            Try again or reload this page.
          </p>
          <DocumentActionGroup
            surfaceKey="desk"
            regionKey="desk-error"
            className="mt-4"
            aria-label="Desk recovery"
          >
            <DocumentAction
              actionKey="try-again"
              variant="primary"
              onClick={() => void refetch()}
            >
              Try again
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      ) : (
        // Held with its read in hand, the block the ready Desk replaces is
        // marked: a press on it ends the wait and the roster prints under her
        // finger, so the arrival swallows that press's click. The header above
        // stays live chrome (round 4).
        <div data-arrival-held={deskRead && arrivalHeld ? 'desk' : undefined}>
          {/* The roster takes the full width of the desk at every viewport.
              IA-17's ≥1280px boards rail took a 260px column out of it, which
              left the ledger row narrower than its own fixed tracks — the
              sentence column resolved to 0px and broke one character to a
              line. The boards go back below the roster, where they were. */}
          {rosterBlock}
          {/* D5 — the recents strip returns (B2-L2 deleted it along with
              the folio grid it used to sit beside). It keeps its own
              quiet doorway shape rather than a roster line: a board has
              no stage and no need line, so it never fit the roster's
              one-line-per-job grammar. It renders nothing of its own once
              its query resolves empty, so a boardless studio sees no seam
              here at all. */}
          <RecentBoardsStrip />
          <DeskBoardsReactionRollup />

          {/* R95 — on a quiet Desk the Studio index rises here, at full weight, to
              fill the space the folders would occupy. */}
          {deskEmpty && <DeskContents prominent />}

          {/* R95 — the Studio Contents page: book-style front matter (Rooms /
              Ledgers / Begin), labels + doorways only. On a working Desk it sits
              here as quiet front matter after the roster; on a quiet Desk it
              has already risen above (deskEmpty), so it renders in exactly one place. */}
          {!deskEmpty && <DeskContents />}
        </div>
      )}

      {/* The capture front door (G1 · R62) — an overlay over the Desk, never a
          route; the Desk beneath does not unmount (D1). */}
      <CaptureLeadSheet
        open={captureOpen}
        onClose={() => setCaptureOpen(false)}
        onCreated={setRecorded}
      />

      {/* R79 — the no-proposal front door: same overlay contract as capture. */}
      <OpenProjectSheet
        open={openProjectOpen}
        onClose={() => setOpenProjectOpen(false)}
      />
    </main>
  );
}
