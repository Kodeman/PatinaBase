'use client';

/**
 * Return teaching's selection hooks (system-architecture §2, §5).
 *
 * They hand the cached teaching reads, the flags and at-rest to the pure
 * `selectTeachingNote`, which decides everything about eligibility. The hooks
 * only write, and only when a note is displayed or ends:
 *  - displayed: `visit.unsolicitedShown` + `recentUnsolicited` (not the act
 *    slot, which is exempt), and `seen.<key>.first` (once) / `.last`;
 *  - × → `seen.<key>.out = dismissed`; the act → `acted`; both reset
 *    `ignoredStreak`;
 *  - any other end (unmount, or `onSeen('closed')`) is a close, written as
 *    the leaves `nextStateAfterClose` changes.
 * Writes are serialised, and each is computed at its turn from the state the
 * previous patch returned (R1: the RPC SETS counters, it never increments).
 * A failed teaching write never interrupts the studio.
 *
 * The Desk note resolves once, at the Desk's first ready render, from what is
 * already cached. If a teaching read is still loading then, there is no note
 * this visit. The Desk writes nothing before that moment, so its own writes
 * never hold the Desk off at-rest rule 1.
 *
 * `boundaries` defaults to a log where nothing ever fired; W3 passes the real
 * tagged-boundary log.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useProjects } from '@patina/supabase';
import { TEACHING_RELEASES, initialCursorFor, sizeOf } from '@/content/teaching-releases';
import { captureTeachingEvent, type TeachingEventName } from '@/lib/analytics/teaching-events';
import { DOCUMENT_SURFACE_KEYS } from '@/lib/help-system/document-surface-keys';
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
  TeachingRelease,
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

export type SinceLine = ReturnType<typeof sinceLineFor>;

type Outcome = 'dismissed' | 'acted' | 'closed';
type Leaf = [path: string[], value: unknown];
type Job = (state: TeachingNoteState) => Leaf[];
type Write = (job: Job) => void;

const NEVER_FIRED: BoundaryLog = { firedOn: () => false };
const DESK = DOCUMENT_SURFACE_KEYS.desk;
/** The Desk arbiter's teaching order (§2): an owner capability, then a release, then a faster way. */
const DESK_KIND_ORDER: readonly TeachingKind[] = ['owner_capability', 'release', 'faster_way'];
const NO_BINDINGS: TeachingBindingsData = {};

const iso = (ms: number): string => new Date(ms).toISOString();

// ─── Session memory ───────────────────────────────────────────────────────────

let writes: Promise<void> = Promise.resolve();
let cursorWritten = false;
/** The Desk visit's reads were still loading at first paint: no retry this visit. */
let deskDeferred = false;
const alreadyKnewReported = new Set<string>();

/** Tests (and a sign-out) start a fresh session. */
export function resetTeachingNoteSession(): void {
  writes = Promise.resolve();
  cursorWritten = false;
  deskDeferred = false;
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

/** Every Desk load: a new visit starts after VISIT_GAP_MS away, else the visit stays active. */
const visitJob =
  (at: number): Job =>
  (s) =>
    isNewVisit(s, at)
      ? [
          [
            ['visit'],
            {
              startedAt: iso(at),
              prevStartedAt: s.visit?.startedAt,
              lastActiveAt: iso(at),
              unsolicitedShown: null,
            },
          ],
        ]
      : [[['visit', 'lastActiveAt'], iso(at)]];

const displayJob =
  (noteKey: string, exempt: boolean, at: number): Job =>
  (s) => [
    ...(exempt
      ? []
      : ([
          [['visit', 'unsolicitedShown'], noteKey],
          [['recentUnsolicited'], [...(s.recentUnsolicited ?? []), iso(at)].slice(-UNSOLICITED_PER_7D)],
        ] as Leaf[])),
    ...(s.seen?.[noteKey]?.first ? [] : ([[['seen', noteKey, 'first'], iso(at)]] as Leaf[])),
    [['seen', noteKey, 'last'], iso(at)],
  ];

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
  const releases = releasesQuery.data as readonly TeachingRelease[] | undefined;
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
    /** The system gate resolved off: teaching does not exist here, and nothing is written. */
    off: !system.isLoading && !system.value,
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
 * `already_knew` is reported by the hook, not the selector (§7): once per note
 * per session, for a live note that could reach her (her audience, its flag on).
 */
function useAlreadyKnew(r: Reads): void {
  const { notes, releases, state, signals, flags, loading, off } = r;
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
      if (alreadyKnewReported.has(note.noteKey) || state.seen?.[note.noteKey]?.out) continue;
      if (note.audience !== 'all' && note.audience !== signals.role) continue;
      if (note.flag && !flags[note.flag]?.value) continue;
      if (!alreadyKnew(note, x)) continue;
      alreadyKnewReported.add(note.noteKey);
      capture('help.teaching_note.already_knew', note, note.surfaceKey);
    }
  }, [notes, releases, state, signals, flags, loading, off]);
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
  note: TeachingNote | null;
  view: TeachingNoteView | null;
  sinceLine: SinceLine;
  deferred: boolean;
  newVisit: boolean;
}

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
): DeskDecision {
  const at = Date.now();
  const none = { at, note: null, view: null, sinceLine: null, deferred: false, newVisit: false };
  if (r.off) return none;
  if (r.loading || o.bindingsLoading || !r.state) return { ...none, deferred: !o.taken };

  const newVisit = isNewVisit(r.state, at);
  if (deskDeferred && !newVisit) return none;
  // Selection sees the visit this load starts; the write follows after paint.
  const state: TeachingNoteState = newVisit
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
  const sinceLine = sinceLineFor(state, r.releases ?? [], o.pinnedProjectIds, at);
  if (o.taken || !r.signals) return { ...none, sinceLine, newVisit };

  const x = inputsFor(r, 'desk', { ...o, state, signals: r.signals, now: at });
  let note: TeachingNote | null = null;
  for (const kind of DESK_KIND_ORDER) {
    note = selectTeachingNote('desk', DESK, { ...x, notes: x.notes.filter((n) => n.kind === kind) });
    if (note) break;
  }
  note ??= selectTeachingNote('desk', DESK, x);
  const view = note ? viewOf(note, o.bindings) : null;
  return { at, note: view ? note : null, view, sinceLine, deferred: false, newVisit };
}

/**
 * The Desk's teaching note (§5), for the Desk arbiter's single slot.
 *
 * Beyond §5's `pinnedProjectIds`, the arbiter passes `ready` (the Desk's first
 * paint has come: decide now) and `taken` (a line ahead of teaching holds the
 * slot: select nothing, but still record the Desk load). Both default so a
 * lone caller decides at its first render. `decided` is true from the render
 * after the decision, so the arbiter never ranks a note not yet chosen.
 */
export function useReturnNote(opts: {
  pinnedProjectIds: string[];
  ready?: boolean;
  taken?: boolean;
  boundaries?: BoundaryLog;
}): TeachingNoteResult & { sinceLine: SinceLine; decided: boolean } {
  const { pinnedProjectIds, ready = true, taken = false, boundaries = NEVER_FIRED } = opts;
  const r = useTeachingReads();
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
    setDecision(
      decideDesk(r, {
        taken,
        bindingsLoading: !!pinned && projectsLoading,
        atRest,
        boundaries,
        pinnedProjectIds,
        bindings: projectName ? { projectName } : NO_BINDINGS,
        surfaceMountedAt,
      })
    );
  }

  useEffect(() => {
    if (!decision) return;
    if (decision.deferred) deskDeferred = true;
    else if (decision.newVisit) deskDeferred = false;
  }, [decision]);

  // Every Desk load is recorded once, after the decision, so the write never
  // holds off the at-rest check the decision itself made.
  const recorded = useRef(false);
  const { off, state, write } = r;
  useEffect(() => {
    if (!decision || recorded.current || off || !state) return;
    recorded.current = true;
    write(visitJob(decision.at));
  }, [decision, off, state, write]);
  useCursorOnce(r, decision !== null);
  useAlreadyKnew(r);

  const note = decision?.note ?? null;
  const view = decision?.view ?? null;
  const bind = useNoteLifecycle(note, view, 'desk', DESK, write);
  return { note: view, bind, sinceLine: decision?.sinceLine ?? null, decided: decision !== null };
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
  const { slot, host, anchor, bindings = NO_BINDINGS, boundaries = NEVER_FIRED } = opts;
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
