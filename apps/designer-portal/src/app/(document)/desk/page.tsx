'use client';

/**
 * The Desk (spec v1.1 §7) — read-only in Slice 1.
 * Date + the ⌘K affordance are the only chrome. One roster of every live job,
 * grouped by stage, carries the whole studio; nothing folds on first paint.
 * No metric tiles, badges, feeds, or dashboard furniture.
 */

import { LegacyDeskBody } from '@/components/document/frame/legacy-desk-body';
import { DeskTodaySkeleton } from '@/components/loading';
import { usePaperRenderer } from '@/hooks/use-paper-renderer';

import {
  lazy,
  Suspense,
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
  useRunningTimer,
  useProjectLeads,
  useNeedStates,
  useTeammateActed,
} from '@patina/supabase';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import { useViewerStudio } from '@/hooks/use-viewer-studio';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import { useLoadingRegister } from '@/components/loading';
import {
  openCommandBar,
  captureLeadPending,
  openProjectPending,
} from '@/components/document/command-bar';
import { documentEvents } from '@/lib/analytics/document-events';
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
import { MarginNote } from '@/components/document/margin-note';
import { useArrivalWaiting } from '@/components/document/arrival/arrival-mount';
import { deriveDaySheet, groupSheetByJob } from '@/lib/document/day-sheet';
import {
  START_DESK_WALKTHROUGH_EVENT,
  clearDeskWalkthroughLater,
  useDeskWalkthroughOffer,
  useSuppressDeskFirstTouch,
} from '@/components/document/help/desk-walkthrough';
import { type CapturedLead } from '@/components/document/overlays/capture-lead-sheet';
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

/** The Desk while the renderer is undecided, or its round-8 body is loading:
 *  Today's quiet frames, never either body (the latch mounts one, once). */
function DeskPending({ dateLabel }: { dateLabel?: string }) {
  return (
    <main
      data-desk-renderer-pending
      className="mx-auto w-full max-w-[1120px] px-[clamp(1.5rem,5vw,4rem)] pb-28 pt-14"
    >
      <DeskTodaySkeleton dateLabel={dateLabel} />
    </main>
  );
}

// WP-01.8 — the round-8 studio and its stylesheet load only once the latch
// says round 8, so the legacy Desk never downloads either.
const Round8Desk = lazy(() => import('@/components/document/studio/round8-desk'));

/** `desk-first-touch` is a first-hour line (return-teaching §2). */
const FIRST_HOUR_MS = 60 * 60 * 1000;

export default function DeskPage() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.desk); // R89 — scope help to the Desk
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const studio = orgs?.find((o) => o.type === 'design_studio') ?? orgs?.[0] ?? null;
  const studioId = studio?.id ?? '';
  const seatedStudioIds = useMemo(
    () => (orgs ?? []).filter((o) => o.type === 'design_studio').map((o) => o.id),
    [orgs],
  );
  const { data, isLoading, isError, isSuccess, isPlaceholderData, refetch } =
    useDeskEngagements({ organizationId: studioId || null });
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const runningTimerRead = useRunningTimer();
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
  // SQ-1806 — whoever holds a job is named from every studio she sits in: the
  // Desk's jobs span them all, while `studio` is only the first one read.
  const { data: seatedMembers } = useOrganizationMembers(seatedStudioIds);
  const names = useMemo(
    () =>
      new Map(
        [...people, ...deriveRosterPeople(seatedMembers ?? [])].map((person) => [person.id, person.name] as const),
      ),
    [people, seatedMembers],
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
              className="inline-flex min-h-11 items-center font-heading text-[15px] italic text-[var(--color-aged-oak)] underline decoration-[var(--color-aged-oak)] decoration-1 underline-offset-2 transition-colors hover:text-[var(--color-clay-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] motion-reduce:transition-none"
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
    !profileLoading &&
    !runningTimerRead.isPending &&
    deskLineDecided;
  // US-14 post-ship patch 1 — while the Desk's arrival wait is armed the
  // skeleton stands until ready, so the route root first appears ready. A root
  // this mount has shown is never taken back.
  const arrivalWaiting = useArrivalWaiting('/desk');
  const arrivalRootShown = useRef(false);
  const arrivalHeld = arrivalWaiting && !arrivalReady && !arrivalRootShown.current;
  const arrivalRoot = deskRead && hydrated && !arrivalHeld;
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
    const initialFocus = document.activeElement;
    let finished = false;
    const land = (waitForAnchor = true): boolean => {
      const anchor = place.anchor ? document.getElementById(place.anchor) : null;
      const room = document.documentElement.scrollHeight - window.innerHeight;
      if (waitForAnchor && place.anchor && !anchor) return false;
      if (anchor && !anchor.matches('a, button, input, select, textarea, [tabindex]')) anchor.tabIndex = -1;
      if (place.y <= room) {
        window.scrollTo({ top: place.y, behavior: 'auto' });
        anchor?.focus({ preventScroll: true });
        return true;
      }
      if (!anchor) return false;
      anchor.scrollIntoView({ block: 'start', behavior: 'auto' });
      anchor.focus({ preventScroll: true });
      return true;
    };
    const readerOwnsFocus = () => document.activeElement !== document.body && document.activeElement !== initialFocus;
    const attempt = (waitForAnchor = true) => {
      if (finished) return;
      if (readerOwnsFocus() || land(waitForAnchor)) {
        finished = true;
        placeToRestore = null;
      }
    };
    attempt();
    if (finished) return;
    const hands = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;
    const grow = new ResizeObserver(() => {
      attempt();
      if (finished) settle();
    });
    const wait = window.setTimeout(() => { attempt(false); settle(); }, 3000);
    // A cleanup only stops watching: a dev rehearsal remount tries again.
    function stop() {
      grow.disconnect();
      window.clearTimeout(wait);
      hands.forEach((hand) => window.removeEventListener(hand, settle));
      document.removeEventListener('focusin', onFocusIn);
    }
    function settle() {
      finished = true;
      placeToRestore = null;
      stop();
    }
    const onFocusIn = (event: FocusEvent) => {
      const anchor = place.anchor ? document.getElementById(place.anchor) : null;
      if (!anchor?.contains(event.target as Node)) settle();
    };
    document.addEventListener('focusin', onFocusIn);
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

  const paper = usePaperRenderer();
  // Round 8 names the control she pressed itself, and Back returns focus to it.
  const holdPlace = (anchor: string | null) => {
    pressedAnchor.current = anchor;
    holdDeskPlace(anchor);
  };

  if (paper.renderer === 'pending') return <DeskPending dateLabel={dateLabel} />;
  if (paper.renderer === 'round8') {
    return (
      <Suspense fallback={<DeskPending dateLabel={dateLabel} />}>
        <Round8Desk
          sheet={sheet}
          cards={cards}
          ledger={ledger}
          recorded={recorded}
          scope={deskScope}
          onScope={setDeskScope}
          oneVoice={oneVoice}
          now={now}
          dateLabel={dateLabel}
          teammateActed={teammateActed}
          names={names}
          holderOf={holderOf}
          deskLine={deskLine}
          othersHold={othersHold}
          loading={isLoading && !data}
          loadingRegister={loadingRegister}
          deskEmpty={deskEmpty}
          arrivalHeld={arrivalHeld}
          arrivalRoot={arrivalRoot}
          arrivalReady={arrivalReady}
          deskRead={deskRead}
          deskRoot={deskRoot}
          notePress={notePress}
          firstName={firstName}
          greetingWord={greetingWord}
          isError={isError}
          refetch={refetch}
          captureOpen={captureOpen}
          setCaptureOpen={setCaptureOpen}
          openProjectOpen={openProjectOpen}
          setOpenProjectOpen={setOpenProjectOpen}
          setRecorded={setRecorded}
          studioName={studio?.name ?? null}
          viewerName={name}
          roster={roster}
          live={data?.live ?? []}
          holdPlace={holdPlace}
        />
      </Suspense>
    );
  }

  return (
    <LegacyDeskBody
      sheet={sheet}
      cards={cards}
      ledger={ledger}
      recorded={recorded}
      scope={deskScope}
      onScope={setDeskScope}
      oneVoice={oneVoice}
      now={now}
      dateLabel={dateLabel}
      teammateActed={teammateActed}
      names={names}
      holderOf={holderOf}
      deskLine={deskLine}
      othersHold={othersHold}
      loading={isLoading && !data}
      loadingRegister={loadingRegister}
      deskEmpty={deskEmpty}
      arrivalHeld={arrivalHeld}
      arrivalRoot={arrivalRoot}
      arrivalReady={arrivalReady}
      deskRead={deskRead}
      deskRoot={deskRoot}
      notePress={notePress}
      firstName={firstName}
      greetingWord={greetingWord}
      isError={isError}
      refetch={refetch}
      captureOpen={captureOpen}
      setCaptureOpen={setCaptureOpen}
      openProjectOpen={openProjectOpen}
      setOpenProjectOpen={setOpenProjectOpen}
      setRecorded={setRecorded}
    />
  );
}
