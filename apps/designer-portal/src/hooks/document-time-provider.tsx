'use client';

/**
 * The document time system (spec v1.2 §9, R4/D9/D10/D11).
 *
 * One provider above the Desk and every document so the mechanics are ONE
 * everywhere: picking up a document chains out ANY running timer (the old
 * zones' header TimerButton included) through the log-offer strip; putting
 * down offers the elapsed time; the offer rides across navigation. The
 * sub-60s rule follows start mode (R4): `timer_auto` discards silently,
 * `timer_manual` keeps the shipped round-up.
 *
 * Close-out WRITES the entry first, then offers adjustment (D10) — a
 * dismissed strip still leaves the truth logged; Discard deletes it.
 * Operations are serialized through a promise queue: an unmounting document
 * (release) and a mounting one (hold) must never race over the single
 * running-timer row.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import {
  useCreateTimeEntry,
  useDiscardTimer,
  useDeleteTimeEntry,
  useRunningTimer,
  useStartTimer,
  useStopTimer,
  useUpdateTimeEntry,
  type RunningTimer,
} from '@/hooks/use-time-tracking';
import {
  closeOutTimer,
  idleSecondsFromPings,
  inHandTodayMinutes,
  longestIdleGapSeconds,
  RUNAWAY_IDLE_SECONDS,
  suggestedMinutes,
  todayStartISO,
  type LogOffer,
  type TimeSource,
} from '@/lib/document/time-derivation';
import {
  commercialDocumentKeys,
  fetchProjectBillingAuthority,
} from '@/hooks/use-commercial-documents';
import { automaticTimeBillingIntent } from '@/lib/document/authority-hours';
import { queryKeys } from '@/lib/react-query';

// R64 — grace added past the last activity ping when bounding an abandoned
// timer's end, so a normal trailing pause near the threshold isn't shaved.
const RUNAWAY_END_GRACE_SECONDS = 60;

const getSupabase = () => createBrowserClient() as any;

export interface HeldDocument {
  projectId: string;
  projectName: string;
  phaseKey: string | null;
  /** F-3 route 1 — the engagement the presence channel is keyed on. The studio
   *  drawer prints `You and Marit` beside the account, and it mounts in
   *  `(document)/layout.tsx` above any engagement; the held document is the one
   *  thing that already travels from the page to studio chrome. */
  engagementId?: string | null;
}

interface DocumentTimeValue {
  /** The held document's live timer state (null off-document). */
  heldProjectId: string | null;
  /** The held document's engagement — the presence channel's key (F-3). */
  heldEngagementId: string | null;
  running: boolean;
  paused: boolean;
  elapsedSeconds: number;
  /** A stopped timer waiting in the strip. */
  offer: LogOffer | null;
  /**
   * D-B54 — whether the offer OWNS the thumb edge, published once so the two
   * components that share that edge cannot answer it differently.
   *
   * `MobileBar` yielded on a bare `offer`, while `LogStrip` refused to paint
   * an offer belonging to a project other than the one in hand — so opening a
   * document while a timer ran on another project left BOTH null and the
   * phone with no bottom chrome at all. An offer only takes the edge when the
   * strip will actually paint it.
   */
  offerOwnsEdge: boolean;
  /** Today's minutes across every engagement, live timer included. */
  inHandToday: number;
  hold: (doc: HeldDocument) => void;
  release: () => void;
  pause: () => void;
  resume: () => void;
  manualLog: (minutes: number, activity: string) => Promise<void>;
  logOffer: (minutes: number, activity: string | null) => Promise<void>;
  discardOffer: () => Promise<void>;
}

const DocumentTimeContext = createContext<DocumentTimeValue | null>(null);

export function useDocumentTime(): DocumentTimeValue {
  const value = useContext(DocumentTimeContext);
  if (!value) throw new Error('useDocumentTime requires DocumentTimeProvider');
  return value;
}

export function DocumentTimeProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const { data: runningTimer } = useRunningTimer();
  const startTimer = useStartTimer();
  const stopTimer = useStopTimer();
  const discardTimer = useDiscardTimer();
  const createEntry = useCreateTimeEntry();
  const updateEntry = useUpdateTimeEntry();
  const deleteEntry = useDeleteTimeEntry();

  const [held, setHeld] = useState<HeldDocument | null>(null);
  const heldRef = useRef<HeldDocument | null>(null);
  const [pausedFor, setPausedFor] = useState<string | null>(null);
  const pausedRef = useRef<string | null>(null);
  const [offer, setOffer] = useState<LogOffer | null>(null);
  const queueRef = useRef<Promise<void>>(Promise.resolve());

  // D10 idle detection: activity pings while a timer runs. A gap between
  // pings longer than the threshold is annotated as quiet time — never
  // subtracted. Reset when a new timer starts.
  const pingsRef = useRef<number[]>([]);
  useEffect(() => {
    const ping = () => {
      const arr = pingsRef.current;
      const t = Date.now();
      // Coalesce bursts: one ping per ~20s keeps the array small.
      if (arr.length === 0 || t - arr[arr.length - 1] > 20_000) arr.push(t);
    };
    const events = ['pointermove', 'keydown', 'pointerdown', 'wheel', 'visibilitychange'];
    events.forEach((e) => window.addEventListener(e, ping, { passive: true }));
    return () => events.forEach((e) => window.removeEventListener(e, ping));
  }, []);

  // useMutation results change identity every render — pin them behind a
  // ref so hold/release stay referentially stable (the page effect depends
  // on them; unstable callbacks would re-hold on every render).
  const api = useRef({ startTimer, stopTimer, discardTimer, createEntry, updateEntry, deleteEntry });
  api.current = { startTimer, stopTimer, discardTimer, createEntry, updateEntry, deleteEntry };

  // One serialized lane for every timer-row operation. A rejection here is
  // swallowed ON PURPOSE so one failed close-out/start can't wedge the chain
  // for every hold/release after it — but a silently swallowed failure also
  // violates the chain's own ordering guarantee (a stop that never actually
  // ran still lets the next hold proceed as if it had). Surface it instead
  // of hiding it, so a broken sequence is at least observable.
  const enqueue = useCallback((op: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(op).catch((error) => {
      if (process.env.NODE_ENV !== 'production') {
        console.error('[document-time] a queued timer operation failed', error);
      }
    });
  }, []);

  /** The single running row, read from the server (the cache can lag a
   *  header-started timer or another tab). */
  const fetchRunning = useCallback(async (): Promise<RunningTimer | null> => {
    const supabase = getSupabase();
    const { data: userData } = await supabase.auth.getUser();
    if (!userData?.user?.id) return null;
    const { data, error } = await supabase
      .from('project_time_entries')
      .select('*, project:projects(name, current_phase)')
      .is('duration_minutes', null)
      .eq('user_id', userData.user.id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as RunningTimer | null;
  }, []);

  const invalidateTimeSurfaces = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['document-time-today'] });
    void qc.invalidateQueries({ queryKey: ['margin-items'] });
  }, [qc]);

  /** Resolve billable intent from the server-owned authority summary. Any
   * missing or failed authority read fails closed, while the timer still
   * records truthful time as explicitly nonbillable. */
  const automaticBillableIntent = useCallback(
    async (projectId: string): Promise<boolean> => {
      try {
        const authority = await qc.fetchQuery({
          queryKey: commercialDocumentKeys.authority(projectId),
          queryFn: () => fetchProjectBillingAuthority(projectId),
          staleTime: 30_000,
        });
        return automaticTimeBillingIntent(authority).billable;
      } catch {
        return false;
      }
    },
    [qc],
  );

  /** Stop (or silently discard) a running row per the R4 source rule. */
  const closeOut = useCallback(
    async (
      timer: RunningTimer,
      opts: { offerStrip: boolean; projectName?: string; phaseKey?: string | null },
    ) => {
      const startMs = new Date(timer.started_at).getTime();
      const nowMs = Date.now();

      // R64 — auto-pause at last-activity. If nothing pinged for ≥ the runaway
      // threshold (a tab left open, a closed laptop), the timer was abandoned:
      // bound the effective end to the last activity ping + a small grace so
      // raw seconds can't balloon. Normal sessions end at `now` unchanged.
      const activityMs = pingsRef.current.filter((t) => t >= startMs);
      const lastActivityMs = activityMs.length ? activityMs[activityMs.length - 1] : startMs;
      const trailingIdleSeconds = (nowMs - lastActivityMs) / 1000;
      const endMs =
        trailingIdleSeconds >= RUNAWAY_IDLE_SECONDS
          ? Math.min(nowMs, lastActivityMs + RUNAWAY_END_GRACE_SECONDS * 1000)
          : nowMs;

      const elapsed = Math.max(0, (endMs - startMs) / 1000);
      const source = ((timer as { source?: string }).source ?? 'timer_manual') as TimeSource;
      const ruling = closeOutTimer(source, elapsed);

      // D10: idle gaps inside THIS entry's (bounded) window, annotation only.
      const window = [startMs, ...activityMs.filter((t) => t <= endMs), endMs];
      const idleSeconds = idleSecondsFromPings(window);
      const longestGap = longestIdleGapSeconds(window);
      pingsRef.current = [];

      if (ruling.action === 'discard_silently') {
        await api.current.discardTimer.mutateAsync({ entryId: timer.id });
        // useDiscardTimer's own onSuccess fires invalidateQueries without
        // awaiting/returning it too — same gap as useStopTimer/useStartTimer
        // below. Await it here so a queued op right behind this one reads
        // the settled cache, not the stale still-running row.
        await qc.invalidateQueries({ queryKey: queryKeys.time.runningTimer() });
        invalidateTimeSurfaces();
        return;
      }

      // R64 — abandonment guard: a single contiguous idle gap ≥ the runaway
      // threshold proposes ACTIVE time (raw − idle), not the full elapsed.
      // Normal short idle keeps the shipped full-raw D10 behavior. The sub-60s
      // discard already happened above (ruling), so the offer is ≥ 1 min.
      const proposedMinutes = suggestedMinutes({
        rawSeconds: Math.round(elapsed),
        idleSeconds,
        longestIdleGapSeconds: longestGap,
      });

      // R4: phase auto-fills from the document's current phase at log time —
      // only when the row didn't already carry one from start.
      const autoPhase = timer.phase_key
        ? undefined
        : (opts.phaseKey ?? timer.project?.current_phase ?? null);

      await api.current.stopTimer.mutateAsync({
        entryId: timer.id,
        durationMinutesOverride: proposedMinutes,
        rawSeconds: Math.round(elapsed),
        idleSeconds,
        ...(autoPhase !== undefined ? { phaseKey: autoPhase } : {}),
      });
      // useStopTimer's own onSuccess fires invalidateQueries without
      // awaiting/returning it, so mutateAsync above resolves before the
      // runningTimer cache has actually refetched. hold()'s own queue
      // ordering is safe regardless (fetchRunning reads Supabase directly,
      // not this cache) — but the cached runningTimer backs the display
      // read (heldTimer/elapsedSeconds below, and the spine clock any other
      // mounted consumer reads). Wait for the refetch here so that display
      // doesn't lag behind the row this call just stopped.
      await qc.invalidateQueries({ queryKey: queryKeys.time.runningTimer() });
      invalidateTimeSurfaces();

      if (opts.offerStrip) {
        setOffer({
          entryId: timer.id,
          projectId: timer.project_id,
          projectName: opts.projectName ?? timer.project?.name ?? 'this document',
          rawSeconds: Math.round(elapsed),
          suggestedMinutes: proposedMinutes,
          phaseKey: timer.phase_key ?? autoPhase ?? null,
          source,
          idleSeconds,
        });
      }
    },
    [invalidateTimeSurfaces, qc],
  );

  /** Pick up a document: chain out whatever runs, then start (D11,
   *  ratified R19 — auto-start is no longer provisional). */
  const hold = useCallback(
    (doc: HeldDocument) => {
      heldRef.current = doc;
      setHeld(doc);
      enqueue(async () => {
        if (heldRef.current?.projectId !== doc.projectId) return; // superseded
        const timer = await fetchRunning();
        if (timer?.project_id === doc.projectId) return; // adopt as-is
        if (timer) {
          await closeOut(timer, { offerStrip: true });
        }
        if (pausedRef.current === doc.projectId) return;
        const billable = await automaticBillableIntent(doc.projectId);
        if (heldRef.current?.projectId !== doc.projectId) return;
        await api.current.startTimer
          .mutateAsync({
            projectId: doc.projectId,
            phaseKey: doc.phaseKey,
            source: 'timer_auto',
            billable,
            quiet: true,
          })
          .catch(() => {});
        // Same gap as closeOut's stopTimer above: useStartTimer's onSuccess
        // doesn't await its own invalidateQueries either, so without this
        // the cache can still read the PREVIOUS document's (or no) timer
        // for a window after this row exists.
        await qc.invalidateQueries({ queryKey: queryKeys.time.runningTimer() });
      });
    },
    [enqueue, fetchRunning, closeOut, automaticBillableIntent, qc],
  );

  /** Put down: close out the held document's timer through the strip. */
  const release = useCallback(() => {
    const doc = heldRef.current;
    heldRef.current = null;
    setHeld(null);
    pausedRef.current = null;
    setPausedFor(null);
    if (!doc) return;
    enqueue(async () => {
      const timer = await fetchRunning();
      if (timer && timer.project_id === doc.projectId) {
        await closeOut(timer, {
          offerStrip: true,
          projectName: doc.projectName,
          phaseKey: doc.phaseKey,
        });
      }
    });
  }, [enqueue, fetchRunning, closeOut]);

  /** Pause: log the segment quietly (adjust later in Hours); no strip. */
  const pause = useCallback(() => {
    const doc = heldRef.current;
    if (!doc) return;
    pausedRef.current = doc.projectId;
    setPausedFor(doc.projectId);
    enqueue(async () => {
      const timer = await fetchRunning();
      if (timer && timer.project_id === doc.projectId) {
        await closeOut(timer, { offerStrip: false, phaseKey: doc.phaseKey });
      }
    });
  }, [enqueue, fetchRunning, closeOut]);

  const resume = useCallback(() => {
    const doc = heldRef.current;
    if (!doc) return;
    pausedRef.current = null;
    setPausedFor(null);
    enqueue(async () => {
      const timer = await fetchRunning();
      if (timer) return;
      const billable = await automaticBillableIntent(doc.projectId);
      if (heldRef.current?.projectId !== doc.projectId) return;
      await api.current.startTimer
        .mutateAsync({
          projectId: doc.projectId,
          phaseKey: doc.phaseKey,
          source: 'timer_auto',
          billable,
          quiet: true,
        })
        .catch(() => {});
      await qc.invalidateQueries({ queryKey: queryKeys.time.runningTimer() });
    });
  }, [enqueue, fetchRunning, automaticBillableIntent, qc]);

  /** "+ Log" — a typed entry against the held document (source manual_entry). */
  const manualLog = useCallback(
    async (minutes: number, activity: string) => {
      const doc = heldRef.current;
      if (!doc || minutes < 1) return;
      await api.current.createEntry.mutateAsync({
        projectId: doc.projectId,
        durationMinutes: Math.round(minutes),
        phaseKey: doc.phaseKey,
        activity,
        source: 'manual_entry',
      });
      invalidateTimeSurfaces();
    },
    [invalidateTimeSurfaces],
  );

  /** Strip "Log": persist the (possibly adjusted) duration + activity. */
  const logOffer = useCallback(
    async (minutes: number, activity: string | null) => {
      if (!offer || minutes < 1) return;
      await api.current.updateEntry.mutateAsync({
        id: offer.entryId,
        projectId: offer.projectId,
        updates: { duration_minutes: Math.round(minutes), activity },
      });
      invalidateTimeSurfaces();
      setOffer(null);
    },
    [offer, invalidateTimeSurfaces],
  );

  /** Strip "Discard": the moment wasn't work — delete the entry. */
  const discardOffer = useCallback(async () => {
    if (!offer) return;
    await api.current.deleteEntry.mutateAsync({ id: offer.entryId, projectId: offer.projectId });
    invalidateTimeSurfaces();
    setOffer(null);
  }, [offer, invalidateTimeSurfaces]);

  // ── The clock ──
  const [nowMs, setNowMs] = useState(() => Date.now());
  const ticking = Boolean(runningTimer);
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  const heldTimer = runningTimer && held && runningTimer.project_id === held.projectId;
  const elapsedSeconds = heldTimer
    ? Math.max(0, (nowMs - new Date(runningTimer.started_at).getTime()) / 1000)
    : 0;

  // ── "In hand today" (D9 readout in the drawer) ──
  const { data: todayMinutes } = useQuery({
    queryKey: ['document-time-today'],
    refetchInterval: 60_000,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) return 0;
      const { data, error } = await supabase
        .from('project_time_entries')
        .select('duration_minutes')
        .eq('user_id', userData.user.id)
        .gte('started_at', todayStartISO(new Date()))
        .not('duration_minutes', 'is', null);
      if (error) throw error;
      return (data ?? []).reduce(
        (sum: number, row: { duration_minutes: number | null }) =>
          sum + (row.duration_minutes ?? 0),
        0,
      );
    },
  });
  const inHandToday = inHandTodayMinutes(
    todayMinutes ?? 0,
    runningTimer?.started_at ?? null,
    new Date(nowMs),
  );

  const value = useMemo<DocumentTimeValue>(
    () => ({
      heldProjectId: held?.projectId ?? null,
      heldEngagementId: held?.engagementId ?? null,
      running: Boolean(heldTimer),
      paused: pausedFor !== null && pausedFor === held?.projectId,
      elapsedSeconds,
      offer,
      offerOwnsEdge:
        offer !== null &&
        !(held?.projectId && held.projectId !== offer.projectId),
      inHandToday,
      hold,
      release,
      pause,
      resume,
      manualLog,
      logOffer,
      discardOffer,
    }),
    [
      held,
      heldTimer,
      pausedFor,
      elapsedSeconds,
      offer,
      inHandToday,
      hold,
      release,
      pause,
      resume,
      manualLog,
      logOffer,
      discardOffer,
    ],
  );

  return (
    <DocumentTimeContext.Provider value={value}>{children}</DocumentTimeContext.Provider>
  );
}

/** Page-side hook: hold the document while mounted (D11 pick-up = start). */
export function useHoldDocument(doc: HeldDocument | null) {
  const { hold, release } = useDocumentTime();
  const projectId = doc?.projectId ?? null;
  const docRef = useRef(doc);
  docRef.current = doc;
  useEffect(() => {
    if (!projectId) return;
    hold(docRef.current!);
    return () => release();
  }, [projectId, hold, release]);
}
