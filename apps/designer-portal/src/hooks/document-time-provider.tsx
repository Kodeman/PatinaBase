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
  inHandTodayMinutes,
  todayStartISO,
  type LogOffer,
  type TimeSource,
} from '@/lib/document/time-derivation';

const getSupabase = () => createBrowserClient() as any;

export interface HeldDocument {
  projectId: string;
  projectName: string;
  phaseKey: string | null;
}

interface DocumentTimeValue {
  /** The held document's live timer state (null off-document). */
  heldProjectId: string | null;
  running: boolean;
  paused: boolean;
  elapsedSeconds: number;
  /** A stopped timer waiting in the strip. */
  offer: LogOffer | null;
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

  // useMutation results change identity every render — pin them behind a
  // ref so hold/release stay referentially stable (the page effect depends
  // on them; unstable callbacks would re-hold on every render).
  const api = useRef({ startTimer, stopTimer, discardTimer, createEntry, updateEntry, deleteEntry });
  api.current = { startTimer, stopTimer, discardTimer, createEntry, updateEntry, deleteEntry };

  // One serialized lane for every timer-row operation.
  const enqueue = useCallback((op: () => Promise<void>) => {
    queueRef.current = queueRef.current.then(op).catch(() => {});
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

  /** Stop (or silently discard) a running row per the R4 source rule. */
  const closeOut = useCallback(
    async (
      timer: RunningTimer,
      opts: { offerStrip: boolean; projectName?: string; phaseKey?: string | null },
    ) => {
      const elapsed = Math.max(
        0,
        (Date.now() - new Date(timer.started_at).getTime()) / 1000,
      );
      const source = ((timer as { source?: string }).source ?? 'timer_manual') as TimeSource;
      const ruling = closeOutTimer(source, elapsed);

      if (ruling.action === 'discard_silently') {
        await api.current.discardTimer.mutateAsync({ entryId: timer.id });
        invalidateTimeSurfaces();
        return;
      }

      // R4: phase auto-fills from the document's current phase at log time —
      // only when the row didn't already carry one from start.
      const autoPhase = timer.phase_key
        ? undefined
        : (opts.phaseKey ?? timer.project?.current_phase ?? null);

      await api.current.stopTimer.mutateAsync({
        entryId: timer.id,
        durationMinutesOverride: ruling.durationMinutes,
        rawSeconds: Math.round(elapsed),
        ...(autoPhase !== undefined ? { phaseKey: autoPhase } : {}),
      });
      invalidateTimeSurfaces();

      if (opts.offerStrip) {
        setOffer({
          entryId: timer.id,
          projectId: timer.project_id,
          projectName: opts.projectName ?? timer.project?.name ?? 'this document',
          rawSeconds: Math.round(elapsed),
          suggestedMinutes: ruling.durationMinutes,
          phaseKey: timer.phase_key ?? autoPhase ?? null,
          source,
        });
      }
    },
    [invalidateTimeSurfaces],
  );

  /** Pick up a document: chain out whatever runs, then start (D11). */
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
        await api.current.startTimer
          .mutateAsync({
            projectId: doc.projectId,
            phaseKey: doc.phaseKey,
            source: 'timer_auto',
            quiet: true,
          })
          .catch(() => {});
      });
    },
    [enqueue, fetchRunning, closeOut],
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
      await api.current.startTimer
        .mutateAsync({
          projectId: doc.projectId,
          phaseKey: doc.phaseKey,
          source: 'timer_auto',
          quiet: true,
        })
        .catch(() => {});
    });
  }, [enqueue, fetchRunning]);

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
      running: Boolean(heldTimer),
      paused: pausedFor !== null && pausedFor === held?.projectId,
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
