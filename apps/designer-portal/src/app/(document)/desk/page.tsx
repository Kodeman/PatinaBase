'use client';

/**
 * The Desk (spec v1.1 §7) — read-only in Slice 1.
 * Date + the ⌘K affordance are the only chrome. One roster of every live job,
 * grouped by stage, carries the whole studio; nothing folds on first paint.
 * No metric tiles, badges, feeds, or dashboard furniture.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  useProfile,
  useOrganizations,
  useOrganizationMembers,
  useBoardsReactionRollup,
  useRecentBoards,
  useStudioUnbilledTime,
  useProjectLeads,
  useNeedStates,
} from '@patina/supabase';
import { useDeskEngagements } from '@/hooks/use-desk-engagements';
import { useViewerStudio } from '@/hooks/use-viewer-studio';
import { useAuth } from '@/hooks/use-auth';
import { useHydrated } from '@/hooks/use-hydrated';
import { useFeatureFlag } from '@/hooks/use-feature-flag';
import {
  openCommandBar,
  captureLeadPending,
  openProjectPending,
} from '@/components/document/command-bar';
import { documentEvents } from '@/lib/analytics/document-events';
import { DeskRoster } from '@/components/document/desk-roster';
import {
  deriveDeskRoster,
  pinnedProjectIdsFromRoster,
} from '@/lib/document/desk-roster-derivation';
import { useDeskLineState } from '@/components/document/desk-arbiter';
import { deriveDeskNeedList } from '@/lib/document/desk-need-list';
import { deriveHandoffNeeds, type DeskScope } from '@/lib/document/desk-scope';
import { WEEKDAY_FORMAT, dayMonth } from '@/lib/document/dates';
import { DeskContents } from '@/components/document/desk-contents';
import { RecentBoardsStrip } from '@/components/document/recent-boards-strip';
import { DeskBoardsReactionRollup } from '@/components/document/desk-boards-reaction-rollup';
import { MarginNote } from '@/components/document/margin-note';
import { useArrivalWaiting } from '@/components/document/arrival/arrival-mount';
import { DaySheet } from '@/components/document/day-sheet';
import { deriveDaySheet } from '@/lib/document/day-sheet';
import {
  START_DESK_WALKTHROUGH_EVENT,
  clearDeskWalkthroughLater,
  useDeskWalkthroughOffer,
  useSuppressDeskFirstTouch,
} from '@/components/document/help/desk-walkthrough';
import { CaptureLeadSheet } from '@/components/document/overlays/capture-lead-sheet';
import { OpenProjectSheet } from '@/components/document/overlays/open-project-sheet';
import {
  DocumentAction,
  DocumentActionGroup,
} from '@/components/document/document-action';
import { useDocumentSurface } from '@/lib/help-system/use-document-surface';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { STUDIO_VERBS } from '@/lib/document/registry';

// F24 — the two header acts print their registry sub-labels; the registry
// (A3-L3's file) is the one place these strings are stored, so the header
// reads the same words the Desk Contents' Begin column and ⌘K do.
const CAPTURE_LEAD_SUBLABEL = STUDIO_VERBS.find(
  (verb) => verb.key === 'capture-lead',
)?.subLabel;
const OPEN_PROJECT_SUBLABEL = STUDIO_VERBS.find(
  (verb) => verb.key === 'open-project',
)?.subLabel;

/** `desk-first-touch` is a first-hour line (return-teaching §2). */
const FIRST_HOUR_MS = 60 * 60 * 1000;

export default function DeskPage() {
  useDocumentSurface(DOCUMENT_SURFACE_KEYS.desk); // R89 — scope help to the Desk
  const { data, isLoading, isError, isSuccess, isPlaceholderData, refetch } =
    useDeskEngagements();
  const { user } = useAuth();
  const { data: profile, isLoading: profileLoading } = useProfile();
  const hydrated = useHydrated();
  const suppressFirstTouch = useSuppressDeskFirstTouch(); // R97 — hold the note during modal/tour
  const showWalkthroughOffer = useDeskWalkthroughOffer(); // R97 — existing-designer tour offer
  const [captureOpen, setCaptureOpen] = useState(false);
  const [openProjectOpen, setOpenProjectOpen] = useState(false);

  // US-19 FR2 F2-2 — the roster prints each act by its one name.
  const oneVoice = useFeatureFlag('one-voice').value === true;
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const studio = orgs?.find((o) => o.type === 'design_studio') ?? orgs?.[0] ?? null;
  const {
    data: studioMembers,
    isLoading: studioMembersLoading,
    isPending: studioMembersPending,
  } = useOrganizationMembers(studio?.id ?? '');
  const { data: projectLeads } = useProjectLeads(studio?.id ?? '');
  const { data: needStates } = useNeedStates(studio?.id ?? '');
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
  // PP-2 — the Desk's one date style. The greeting says the same idiom the
  // day's line says beneath it, and neither composes its own formatter.
  const dateLabel = hydrated
    ? `${WEEKDAY_FORMAT.format(now)} · ${dayMonth(now)}`.toUpperCase()
    : '';
  const name =
    profile?.display_name || profile?.full_name || user?.name || null;
  // The Desk greeting uses the real first name; with none resolved we greet
  // plainly ("Good morning.") rather than the old "Good morning, there".
  const firstName = name?.trim().split(/\s+/)[0] || null;

  // The roster is the Desk's one population — every live job, grouped by
  // stage, in the paper's own section order.
  const roster = useMemo(
    () =>
      deriveDeskRoster(
        {
          folders: data?.folders ?? [],
          chips: data?.chips ?? [],
          live: data?.live ?? [],
          oneVoice,
          unreadFeeds: data?.unreadFeeds,
          scope: deskScope,
          leads: projectLeads,
          meUserId: user?.id,
        },
        new Date(),
      ),
    [data, deskScope, oneVoice, projectLeads, user?.id],
  );

  // A quiet Desk (no live jobs at all) lets the Studio index rise to fill the
  // space — larger, and earlier in the composition — rather than sitting as
  // bottom front matter. Only known once the read resolves.
  const deskEmpty = !!data && roster.liveCount === 0;
  const myHandoffNote = studioMembers
    ?.find((m) => m.user_id === user?.id)
    ?.handoff_note?.trim();
  // The Day Sheet (slice 4): the top five of the one ranked need list, the
  // hand-offs riding it like any other need.
  const sheet = useMemo(() => {
    const at = new Date();
    const handoffs = deriveHandoffNeeds(
      data?.live ?? [],
      projectLeads ?? new Map(),
      user?.id,
      needStates,
      Boolean(myHandoffNote),
    );
    const needs = deriveDeskNeedList(
      {
        folders: data?.folders ?? [],
        chips: data?.chips ?? [],
        live: data?.live ?? [],
      },
      at,
      handoffs,
    );
    return deriveDaySheet({
      needs,
      states: needStates ?? new Map(),
      leads: projectLeads ?? new Map(),
      meUserId: user?.id,
      scope: deskScope,
      unreadFeeds: data?.unreadFeeds ?? [],
      now: at,
    });
  }, [data, projectLeads, user?.id, needStates, myHandoffNote, deskScope]);

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

  const rosterBlock =
    (isLoading && !data) || arrivalHeld ? (
      <div
        className="space-y-3"
        aria-hidden
        data-tour-anchor="desk-needs-your-hand"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-6 rounded-[3px] border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          />
        ))}
      </div>
    ) : (
      <>
        <DaySheet
          sheet={sheet}
          scope={deskScope}
          onScope={setDeskScope}
          oneVoice={oneVoice}
          now={now}
        />
        <DeskRoster
          roster={roster}
          studioMembers={studioMembers}
          belowHead={deskLine}
        />
      </>
    );

  return (
    <main
      data-arrival={arrivalRoot ? 'desk' : undefined}
      data-arrival-ready={arrivalReady ? '' : undefined}
      className="mx-auto w-full max-w-[1120px] px-[clamp(1.5rem,5vw,4rem)] pb-28 pt-14"
    >
      <header className="mb-12 flex items-baseline justify-between gap-4">
        <div>
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
          {/* US-14 `head` is the arrival's landing focus on both surfaces
              (the Document's is its letterhead header); here its text is
              also the card's place line. */}
          <p
            data-part="head"
            tabIndex={-1}
            className="doc-type-meta mt-1 uppercase tracking-[0.09em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
          >
            {dateLabel || ' '}
          </p>
        </div>
        <DocumentActionGroup
          surfaceKey="desk"
          regionKey="desk-head"
          aria-label="Desk actions"
        >
          <div className="flex flex-col items-end gap-0.5">
            <DocumentAction
              actionKey="capture-lead"
              variant="primary"
              leading="＋"
              data-tour-anchor="desk-capture-lead"
              onClick={() => setCaptureOpen(true)}
            >
              Capture a lead
            </DocumentAction>
            {CAPTURE_LEAD_SUBLABEL && (
              <span className="doc-type-meta uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {CAPTURE_LEAD_SUBLABEL}
              </span>
            )}
          </div>
          {/* R79 — the quiet secondary act beside capture: a project that
              skips the proposal (a repeat client, handshake work). */}
          <div className="flex flex-col items-end gap-0.5">
            <DocumentAction
              actionKey="open-project"
              variant="secondary"
              leading="＋"
              onClick={() => setOpenProjectOpen(true)}
            >
              Open a project
            </DocumentAction>
            {OPEN_PROJECT_SUBLABEL && (
              <span className="doc-type-meta uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {OPEN_PROJECT_SUBLABEL}
              </span>
            )}
          </div>
          <DocumentAction
            actionKey="find-anything"
            variant="tertiary"
            data-tour-anchor="desk-find-anything"
            onClick={() => openCommandBar()}
            trailing={
              <kbd className="rounded-[3px] border border-[var(--border-default)] px-1 py-px font-mono">
                ⌘K
              </kbd>
            }
          >
            Find anything
          </DocumentAction>
        </DocumentActionGroup>
      </header>

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
            The desk could not be read.
          </p>
          <p className="doc-type-body mt-2">
            Something interrupted the read — often a session that needs
            refreshing. Try again, or reload the page.
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
      />

      {/* R79 — the no-proposal front door: same overlay contract as capture. */}
      <OpenProjectSheet
        open={openProjectOpen}
        onClose={() => setOpenProjectOpen(false)}
      />
    </main>
  );
}
