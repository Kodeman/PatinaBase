'use client';

/**
 * Return teaching's selection hooks (system-architecture §2, §5).
 *
 * They hand the cached teaching reads, the flags and at-rest to the pure
 * `selectTeachingNote`, which decides everything about eligibility. The hooks
 * write only while the `teaching-notes` flag has resolved on (loading counts
 * as off), and only these leaves:
 *  - a Desk load: the `visit` leaves (a new visit, or `lastActiveAt`);
 *  - displayed: `visit.unsolicitedShown` + `recentUnsolicited` (not the act
 *    slot, which is exempt), and `seen.<key>.first` (once) / `.last`. The
 *    Desk's since-line and setup whisper, once on screen, claim
 *    `visit.unsolicitedShown` the same way (the since-line also counts in
 *    `recentUnsolicited`);
 *  - × → `seen.<key>.out = dismissed`; the act → `acted`; both reset
 *    `ignoredStreak`; a success signal before any display → `already_knew`;
 *  - any other end (unmount, or `onSeen('closed')`) is a close, written as
 *    the leaves `nextStateAfterClose` changes.
 * Writes are serialised, and each is computed at its turn from the state the
 * previous patch returned (R1: the RPC SETS counters, it never increments).
 * A failed teaching write never interrupts the studio.
 *
 * The Desk note resolves once per Desk load, at the first ready render where
 * every teaching read has arrived. Until then it is undecided and writes
 * nothing. Its writes follow the decision, so they never hold the Desk off
 * at-rest rule 1.
 *
 * `boundaries` defaults to the page session's tagged-boundary log
 * (`lib/teaching/boundaries.ts`); tests pass their own.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { TeachingRelease as TeachingReleaseDoc } from '@patina/help-system';
import { useProjects } from '@patina/supabase';
import type { SinceLineItem } from '@/components/document/teaching/since-line';
import { TEACHING_RELEASES, initialCursorFor, sizeOf } from '@/content/teaching-releases';
import { captureTeachingEvent, type TeachingEventName } from '@/lib/analytics/teaching-events';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
import { boundaryLog, setCurrentTeachingSurface } from '@/lib/teaching/boundaries';
import {
  DEFAULT_MAX_DISPLAYS,
  TEACHING_SYSTEM_FLAG,
  UNSOLICITED_PER_7D,
} from '@/lib/teaching/constants';
import {
  alreadyKnew,
  isNewVisit,
  labelFor,
  nextStateAfterClose,
  resolveBindings,
  selectTeachingNote,
  sinceLineFor,
} from '@/lib/teaching/select';
import type {
  BoundaryLog,
  SelectInputs,
  TeachingBindingsData,
  TeachingKind,
  TeachingNote,
  TeachingNoteBinding,
  TeachingNoteState,
  TeachingNoteView,
  TeachingSlot,
} from '@/lib/teaching/types';
import { useFeatureFlags } from './use-feature-flags';
import { useTeachingAtRest } from './use-teaching-at-rest';
import {
  TEACHING_NOTE_STATE_KEY,
  useTeachingNoteState,
  useTeachingNotes,
  useTeachingReleases,
  useTeachingSignals,
} from './use-teaching-data';

/** What the hooks spread onto `<MarginNote>`: the §5 binding plus the primitive's teaching props. */
export interface TeachingMarginNoteBind extends TeachingNoteBinding {
  act?: { label: string; href: string };
  placement: 'default' | 'anchor';
  captureEvents: false;
}

export interface TeachingNoteResult {
  note: TeachingNoteView | null;
  bind: TeachingMarginNoteBind | null;
}

/** The Desk's since-line (§5): releases only, at most three, with their published headlines. */
export type SinceLine = { items: SinceLineItem[]; changesHref: string } | null;

type Outcome = 'dismissed' | 'acted' | 'closed';
type Leaf = [path: string[], value: unknown];
type Job = (state: TeachingNoteState) => Leaf[];
type Write = (job: Job) => void;

/** `already_knew` never depends on a boundary. */
const NEVER_FIRED: BoundaryLog = { firedOn: () => false };
const DESK = DOCUMENT_SURFACE_KEYS.desk;
/** The Desk arbiter's teaching order (§2): an owner capability, then a release, then a faster way. */
const DESK_KIND_ORDER: readonly TeachingKind[] = ['owner_capability', 'release', 'faster_way'];
const NO_BINDINGS: TeachingBindingsData = {};
/** The Desk lines besides a note that take the visit's one unsolicited slot (`visit.unsolicitedShown`). */
const SINCE_LINE = 'since-line';
const WHISPER = 'setup-whisper';

const iso = (ms: number): string => new Date(ms).toISOString();

// ─── Session memory ───────────────────────────────────────────────────────────

let writes: Promise<void> = Promise.resolve();
let cursorWritten = false;
/** Notes whose `already_knew` write is queued this session. */
const alreadyKnewReported = new Set<string>();

/** Tests (and a sign-out) start a fresh session. */
export function resetTeachingNoteSession(): void {
  writes = Promise.resolve();
  cursorWritten = false;
  alreadyKnewReported.clear();
}

// ─── Writes ───────────────────────────────────────────────────────────────────

function enqueue(
  read: () => TeachingNoteState | undefined,
  patch: (path: string[], value: unknown) => Promise<unknown>,
  job: Job
): void {
  writes = writes
    .then(async () => {
      const state = read();
      if (!state) return;
      for (const [path, value] of job(state)) await patch(path, value);
    })
    .catch(() => undefined);
}

const cursorJob =
  (createdAt: string): Job =>
  (s) =>
    s.cursor?.lastSeenReleaseId === undefined
      ? [[['cursor'], { lastSeenReleaseId: initialCursorFor(createdAt, TEACHING_RELEASES) }]]
      : [];

/**
 * A Desk load whose cached state says a new visit starts may be a stale tab's.
 * A no-op write (`v`) returns the stored row first, so `visitJob` decides from
 * it and a stale tab never restarts, and clears, a visit another tab is in.
 */
const confirmVisitJob =
  (at: number): Job =>
  (s) =>
    isNewVisit(s, at) ? [[['v'], 1]] : [];

/**
 * Every Desk load, leaf by leaf: a new visit starts after VISIT_GAP_MS away,
 * else the visit stays active. The RPC refuses a JSON null (it arrives as SQL
 * NULL), so the last visit's note is cleared with ''. `startedAt` goes last:
 * a retry after a partial write then never rolls `prevStartedAt` onto it.
 */
const visitJob =
  (at: number): Job =>
  (s) =>
    isNewVisit(s, at)
      ? [
          ...(s.visit?.startedAt ? ([[['visit', 'prevStartedAt'], s.visit.startedAt]] as Leaf[]) : []),
          ...(s.visit?.unsolicitedShown ? ([[['visit', 'unsolicitedShown'], '']] as Leaf[]) : []),
          [['visit', 'lastActiveAt'], iso(at)],
          [['visit', 'startedAt'], iso(at)],
        ]
      : [[['visit', 'lastActiveAt'], iso(at)]];

/** The visit's one unsolicited slot, and (unless the whisper) a place in the 7-day cap. */
const claimLeaves = (s: TeachingNoteState, key: string, at: number, counted: boolean): Leaf[] => [
  [['visit', 'unsolicitedShown'], key],
  ...(counted
    ? ([[['recentUnsolicited'], [...(s.recentUnsolicited ?? []), iso(at)].slice(-UNSOLICITED_PER_7D)]] as Leaf[])
    : []),
];

const displayJob =
  (noteKey: string, exempt: boolean, at: number): Job =>
  (s) => [
    ...(exempt ? [] : claimLeaves(s, noteKey, at, true)),
    ...(s.seen?.[noteKey]?.first ? [] : ([[['seen', noteKey, 'first'], iso(at)]] as Leaf[])),
    [['seen', noteKey, 'last'], iso(at)],
  ];

/** The since-line or the whisper on screen: it claims the visit's slot unless a line already has. */
const unsolicitedJob =
  (key: string, at: number): Job =>
  (s) =>
    s.visit?.unsolicitedShown ? [] : claimLeaves(s, key, at, key === SINCE_LINE);

/** `already_knew`, stored once; the event goes with the write, so a later session reports nothing. */
const alreadyKnewJob =
  (note: TeachingNote): Job =>
  (s) => {
    const seen = s.seen?.[note.noteKey];
    if (seen?.out || seen?.first) return [];
    capture('help.teaching_note.already_knew', note, note.surfaceKey);
    return [[['seen', note.noteKey, 'out'], 'already_knew']];
  };

const outcomeJob =
  (noteKey: string, out: 'dismissed' | 'acted'): Job =>
  (s) => [
    [['seen', noteKey, 'out'], out],
    ...(s.ignoredStreak ? ([[['ignoredStreak'], 0]] as Leaf[]) : []),
  ];

/** A close, as leaves. Reports `receded` with the reason the resulting state gives. */
const closeJob =
  (note: TeachingNote, at: number, surfaceKey: string): Job =>
  (s) => {
    const next = nextStateAfterClose(s, note.noteKey, at, note.maxDisplays ?? DEFAULT_MAX_DISPLAYS);
    const entry = next.seen?.[note.noteKey] ?? {};
    const retired = !s.seen?.[note.noteKey]?.out && entry.out === 'retired_max';
    capture('help.teaching_note.receded', note, surfaceKey, retired ? 'retired_max' : 'closed');
    return [
      [['seen', note.noteKey, 'n'], entry.n],
      ...(retired ? ([[['seen', note.noteKey, 'out'], 'retired_max']] as Leaf[]) : []),
      [['ignoredStreak'], next.ignoredStreak],
      ...(next.quiet?.until !== s.quiet?.until
        ? ([[['quiet', 'until'], next.quiet?.until ?? null]] as Leaf[])
        : []),
    ];
  };

function capture(
  name: TeachingEventName,
  note: TeachingNote,
  surfaceKey: string,
  reason?: 'closed' | 'retired_max'
): void {
  captureTeachingEvent(name, {
    note_key: note.noteKey,
    kind: note.kind,
    trigger: note.trigger,
    surface_key: surfaceKey,
    release_id: note.releaseId,
    size_class: sizeOf(note.releaseId, TEACHING_RELEASES),
    audience: note.audience,
    reason,
  });
}

// ─── Reads ────────────────────────────────────────────────────────────────────

function useTeachingReads() {
  const notesQuery = useTeachingNotes();
  const releasesQuery = useTeachingReleases();
  const { state, patch } = useTeachingNoteState();
  const signalsQuery = useTeachingSignals();
  const notes = notesQuery.data as readonly TeachingNote[] | undefined;
  const releases = releasesQuery.data as readonly TeachingReleaseDoc[] | undefined;
  const signals = signalsQuery.data as SelectInputs['signals'] | null | undefined;

  const flagNames = useMemo(() => {
    const named = new Set<string>();
    for (const note of notes ?? []) if (note.flag) named.add(note.flag);
    return [TEACHING_SYSTEM_FLAG, ...[...named].sort()];
  }, [notes]);
  const flags = useFeatureFlags(flagNames);

  const queryClient = useQueryClient();
  const write = useCallback<Write>(
    (job) =>
      enqueue(
        () => queryClient.getQueryData<TeachingNoteState>(TEACHING_NOTE_STATE_KEY),
        patch,
        job
      ),
    [queryClient, patch]
  );

  const system = flags[TEACHING_SYSTEM_FLAG];
  return {
    notes,
    releases,
    state: state as TeachingNoteState | undefined,
    signals,
    flags,
    /** The system gate is not on yet (off, or still loading): nothing shows and nothing is written. */
    off: system.isLoading || system.value !== true,
    loading:
      notes === undefined ||
      releases === undefined ||
      state === undefined ||
      signals === undefined ||
      Object.values(flags).some((flag) => flag.isLoading),
    write,
  };
}

type Reads = ReturnType<typeof useTeachingReads>;

function inputsFor(
  r: Reads,
  slot: TeachingSlot,
  extra: {
    state: TeachingNoteState;
    signals: SelectInputs['signals'];
    now: number;
    atRest: boolean;
    boundaries: BoundaryLog;
    pinnedProjectIds: string[];
    bindings: TeachingBindingsData;
    surfaceMountedAt: number;
  }
): SelectInputs {
  return {
    notes: r.notes ?? [],
    releases: r.releases ?? [],
    state: extra.state,
    signals: extra.signals,
    flags: r.flags,
    now: extra.now,
    atRest: { desk: false, anchor: false, act: false, [slot]: extra.atRest },
    boundaries: extra.boundaries,
    pinnedProjectIds: extra.pinnedProjectIds,
    bindings: extra.bindings,
    surfaceMountedAt: extra.surfaceMountedAt,
  };
}

/** `sinceLineFor` ranks the published releases; their headlines come from the same docs. */
function sinceLineOf(
  state: TeachingNoteState,
  releases: readonly TeachingReleaseDoc[],
  pinnedProjectIds: string[],
  now: number
): SinceLine {
  const line = sinceLineFor(state, releases, pinnedProjectIds, now);
  if (!line) return null;
  const headlines = new Map(releases.map((release) => [release.id, release.headline]));
  return {
    items: line.items.map((release) => ({ id: release.id, headline: headlines.get(release.id) ?? '' })),
    changesHref: line.changesHref,
  };
}

function viewOf(note: TeachingNote, bindings: TeachingBindingsData): TeachingNoteView | null {
  const resolved = resolveBindings(note, bindings);
  if (!resolved) return null;
  return {
    noteKey: note.noteKey,
    kind: note.kind,
    body: resolved.body,
    label: labelFor(note, TEACHING_RELEASES),
    act: resolved.act,
    recedeOn: note.recedeOn ?? [],
  };
}

/**
 * `already_knew` is recorded by the hook, not the selector (§7), for a live
 * note that could reach her (her audience, its flag on) whose success signal
 * came before any display: `seen.<key>.out`, written once with its event.
 */
function useAlreadyKnew(r: Reads): void {
  const { notes, releases, state, signals, flags, loading, off, write } = r;
  useEffect(() => {
    if (loading || off || !notes || !releases || !state || !signals) return;
    const x: SelectInputs = {
      notes,
      releases,
      state,
      signals,
      flags,
      now: Date.now(),
      atRest: { desk: false, anchor: false, act: false },
      boundaries: NEVER_FIRED,
      pinnedProjectIds: [],
      bindings: NO_BINDINGS,
      surfaceMountedAt: 0,
    };
    for (const note of notes) {
      const seen = state.seen?.[note.noteKey];
      if (alreadyKnewReported.has(note.noteKey) || seen?.out || seen?.first) continue;
      if (note.audience !== 'all' && note.audience !== signals.role) continue;
      if (note.flag && !flags[note.flag]?.value) continue;
      if (!alreadyKnew(note, x)) continue;
      alreadyKnewReported.add(note.noteKey);
      write(alreadyKnewJob(note));
    }
  }, [notes, releases, state, signals, flags, loading, off, write]);
}

/** Writes the first-load cursor (§1.3) once, from the value the selector already assumes. */
function useCursorOnce(r: Reads, enabled: boolean): void {
  const { off, state, signals, write } = r;
  useEffect(() => {
    if (!enabled || cursorWritten || off || !state || !signals) return;
    if (state.cursor?.lastSeenReleaseId !== undefined) return;
    cursorWritten = true;
    write(cursorJob(signals.createdAt));
  }, [enabled, off, state, signals, write]);
}

/**
 * The shown note's writes and events. Displayed once per mount; an end that is
 * neither × nor the act is a close. The close waits a tick after unmount, so
 * StrictMode's rehearsal unmount, which remounts at once, is not a close.
 */
function useNoteLifecycle(
  note: TeachingNote | null,
  view: TeachingNoteView | null,
  slot: TeachingSlot,
  surfaceKey: string,
  write: Write
): TeachingMarginNoteBind | null {
  const outcome = useRef<Outcome | null>(null);
  const displayed = useRef<string | null>(null);
  const closing = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const end = useCallback(
    (how: Outcome) => {
      if (!note || outcome.current) return;
      outcome.current = how;
      if (how === 'closed') {
        write(closeJob(note, Date.now(), surfaceKey));
        return;
      }
      write(outcomeJob(note.noteKey, how));
      capture(how === 'acted' ? 'help.teaching_note.acted' : 'help.teaching_note.dismissed', note, surfaceKey);
    },
    [note, surfaceKey, write]
  );

  useEffect(() => {
    if (!note || !view) return;
    clearTimeout(closing.current);
    if (displayed.current !== note.noteKey) {
      displayed.current = note.noteKey;
      outcome.current = null;
      write(displayJob(note.noteKey, slot === 'act', Date.now()));
      capture('help.teaching_note.shown', note, surfaceKey);
    }
    return () => {
      closing.current = setTimeout(() => end('closed'), 0);
    };
  }, [note, view, slot, surfaceKey, write, end]);

  const placement = slot === 'anchor' ? 'anchor' : 'default';
  return useMemo<TeachingMarginNoteBind | null>(
    () =>
      view
        ? {
            noteKey: view.noteKey,
            seen: false,
            actionEvents: view.recedeOn,
            label: view.label,
            act: view.act ?? undefined,
            placement,
            captureEvents: false,
            onSeen: end,
          }
        : null,
    [view, placement, end]
  );
}

// ─── The Desk ─────────────────────────────────────────────────────────────────

interface DeskDecision {
  at: number;
  /** Teaching was on and every read had arrived: this Desk load is recorded. */
  live: boolean;
  note: TeachingNote | null;
  view: TeachingNoteView | null;
  sinceLine: SinceLine;
  /** The stored visit's unsolicited line, already shown (none in a new visit). */
  unsolicitedShown: string | null;
}

/** The Desk load's decision, or null while a teaching read is still loading: undecided, nothing written. */
function decideDesk(
  r: Reads,
  o: {
    taken: boolean;
    bindingsLoading: boolean;
    atRest: boolean;
    boundaries: BoundaryLog;
    pinnedProjectIds: string[];
    bindings: TeachingBindingsData;
    surfaceMountedAt: number;
  }
): DeskDecision | null {
  const at = Date.now();
  const none = { at, live: false, note: null, view: null, sinceLine: null, unsolicitedShown: null };
  if (r.off) return none;
  if (r.loading || o.bindingsLoading || !r.state) return null;

  // Selection sees the visit this load starts; the write follows after paint.
  const state: TeachingNoteState = isNewVisit(r.state, at)
    ? {
        ...r.state,
        visit: {
          startedAt: iso(at),
          prevStartedAt: r.state.visit?.startedAt,
          lastActiveAt: iso(at),
          unsolicitedShown: null,
        },
      }
    : r.state;
  // One unsolicited line per visit, from the stored visit (a reload included):
  // once another line has shown, no since-line.
  const unsolicitedShown = state.visit?.unsolicitedShown || null;
  const sinceLine =
    unsolicitedShown && unsolicitedShown !== SINCE_LINE
      ? null
      : sinceLineOf(state, r.releases ?? [], o.pinnedProjectIds, at);
  const decided: DeskDecision = { ...none, live: true, sinceLine, unsolicitedShown };
  // The since-line is the visit's one unsolicited note: with it, no teaching note.
  if (o.taken || !r.signals || sinceLine) return decided;

  const x = inputsFor(r, 'desk', { ...o, state, signals: r.signals, now: at });
  let note: TeachingNote | null = null;
  for (const kind of DESK_KIND_ORDER) {
    note = selectTeachingNote('desk', DESK, { ...x, notes: x.notes.filter((n) => n.kind === kind) });
    if (note) break;
  }
  note ??= selectTeachingNote('desk', DESK, x);
  const view = note ? viewOf(note, o.bindings) : null;
  return { ...decided, note: view ? note : null, view };
}

/**
 * The Desk's teaching note (§5), for the Desk arbiter's single slot.
 *
 * Beyond §5's `pinnedProjectIds`, the arbiter passes `ready` (the Desk's first
 * paint has come: decide now), `taken` (a line ahead of teaching holds the
 * slot: select nothing, but still record the Desk load) and `onScreen` (its
 * line now showing, when that is teaching's slot or the whisper: the
 * since-line or the whisper is recorded as the visit's one unsolicited line).
 * They default so a lone caller decides at its first render. `decided` is
 * true from the render after the decision, so the arbiter never ranks a note
 * not yet chosen; `unsolicitedShown` is the stored visit's line, already
 * shown, so the arbiter holds back the whisper after another line.
 */
export function useReturnNote(opts: {
  pinnedProjectIds: string[];
  ready?: boolean;
  taken?: boolean;
  onScreen?: 'teaching-note' | 'setup-whisper' | null;
  boundaries?: BoundaryLog;
}): TeachingNoteResult & { sinceLine: SinceLine; decided: boolean; unsolicitedShown: string | null } {
  const { pinnedProjectIds, ready = true, taken = false, onScreen = null, boundaries = boundaryLog } = opts;
  const r = useTeachingReads();
  // A tagged boundary that fires while the Desk is up is the Desk's.
  useEffect(() => setCurrentTeachingSurface(DESK), []);
  const atRest = useTeachingAtRest({ surfaceKey: DESK, host: null, slot: 'desk' });
  const [surfaceMountedAt] = useState(() => Date.now());

  // "Bound to a pinned project" resolves from the first job holding her pen.
  const { data: projects, isLoading: projectsLoading } = useProjects();
  const pinned = pinnedProjectIds[0];
  const projectName = pinned
    ? (projects as Array<{ id: string; name?: string | null }> | undefined)?.find((p) => p.id === pinned)
        ?.name ?? undefined
    : undefined;

  const [decision, setDecision] = useState<DeskDecision | null>(null);
  if (ready && decision === null) {
    const decided = decideDesk(r, {
      taken,
      bindingsLoading: !!pinned && projectsLoading,
      atRest,
      boundaries,
      pinnedProjectIds,
      bindings: projectName ? { projectName } : NO_BINDINGS,
      surfaceMountedAt,
    });
    if (decided) setDecision(decided);
  }

  // A live Desk load is recorded once, after the decision, so the write never
  // holds off the at-rest check the decision itself made. A decision made
  // while teaching was off writes nothing, even once the flag turns on.
  const recorded = useRef(false);
  const { off, write } = r;
  const live = !!decision?.live && !off;
  useEffect(() => {
    if (!live || !decision || recorded.current) return;
    recorded.current = true;
    write(confirmVisitJob(decision.at));
    write(visitJob(decision.at));
  }, [live, decision, write]);
  useCursorOnce(r, live);
  useAlreadyKnew(r);

  const note = decision?.note ?? null;
  const view = decision?.view ?? null;
  const bind = useNoteLifecycle(note, view, 'desk', DESK, write);

  // The arbiter's since-line or whisper, once on screen, is the visit's one
  // unsolicited line; a note records itself when displayed.
  const sinceLine = decision?.sinceLine ?? null;
  const unsolicited = onScreen === 'setup-whisper' ? WHISPER : onScreen === 'teaching-note' && sinceLine ? SINCE_LINE : null;
  useEffect(() => {
    if (live && unsolicited) write(unsolicitedJob(unsolicited, Date.now()));
  }, [live, unsolicited, write]);

  return {
    note: view,
    bind,
    sinceLine,
    decided: decision !== null,
    unsolicitedShown: decision?.unsolicitedShown ?? null,
  };
}

// ─── In place and at the act ──────────────────────────────────────────────────

/**
 * A note in place (`anchor`, in a sheet's margin after its completion act) or
 * above a send act (`act`). Evaluated while the surface is open; once a note
 * appears it stays for the mount. `anchor` narrows to one placement on the
 * surface; `bindings` carries the surface's own values (invoice, person).
 */
export function useTeachingNoteFor(
  surfaceKey: string,
  opts: {
    slot: 'anchor' | 'act';
    host: HTMLElement | null;
    anchor?: string;
    bindings?: TeachingBindingsData;
    boundaries?: BoundaryLog;
  }
): TeachingNoteResult {
  const { slot, host, anchor, bindings = NO_BINDINGS, boundaries = boundaryLog } = opts;
  const r = useTeachingReads();
  const atRest = useTeachingAtRest({ surfaceKey, host, slot });
  const [surfaceMountedAt] = useState(() => Date.now());
  const [held, setHeld] = useState<{ note: TeachingNote; view: TeachingNoteView } | null>(null);

  const x =
    !r.loading && !r.off && r.state && r.signals
      ? inputsFor(r, slot, {
          state: r.state,
          signals: r.signals,
          now: Date.now(),
          atRest,
          boundaries,
          pinnedProjectIds: [],
          bindings,
          surfaceMountedAt,
        })
      : null;

  if (!held && x) {
    const pool = anchor === undefined ? x : { ...x, notes: x.notes.filter((n) => n.anchor === anchor) };
    const note = selectTeachingNote(slot, surfaceKey, pool);
    const view = note ? viewOf(note, bindings) : null;
    if (note && view) setHeld({ note, view });
  }

  useCursorOnce(r, true);
  useAlreadyKnew(r);

  const bind = useNoteLifecycle(held?.note ?? null, held?.view ?? null, slot, surfaceKey, r.write);
  return { note: held?.view ?? null, bind };
}
