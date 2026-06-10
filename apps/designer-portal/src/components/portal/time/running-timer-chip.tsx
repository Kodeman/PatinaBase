'use client';

import { useEffect, useState } from 'react';
import { useHydrated } from '@/hooks/use-hydrated';
import { useRunningTimer } from '@/hooks/use-time-tracking';
import { formatElapsedSeconds } from '@/lib/parse-duration';
import { StopTimerDialog } from './stop-timer-dialog';

/**
 * Top-bar chip for the running timer (Wave 2). Renders nothing when no timer
 * is running. Ticks client-side from started_at (no refetch polling); click
 * opens the StopTimerDialog. Gated on hydration like the utility-bar badges
 * so SSR and first client paint render the same (empty) tree.
 */
export function RunningTimerChip() {
  const hydrated = useHydrated();
  const { data: timer } = useRunningTimer();
  const [stopOpen, setStopOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const timerId = timer?.id;
  useEffect(() => {
    if (!timerId) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [timerId]);

  if (!hydrated || !timer) return null;

  const elapsedSeconds = Math.max(0, (now - new Date(timer.started_at).getTime()) / 1000);
  const projectName = timer.project?.name ?? 'Untitled project';

  return (
    <>
      <button
        type="button"
        onClick={() => setStopOpen(true)}
        title={`Timer running on ${projectName} — click to stop`}
        aria-label={`Timer running on ${projectName} — click to stop`}
        className="mr-3 flex h-8 max-w-[240px] flex-shrink items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--bg-primary)] px-3 transition-colors hover:border-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-1"
      >
        {/* Pulsing clay dot — motion-safe so prefers-reduced-motion gets a static dot */}
        <span className="relative flex h-2 w-2 flex-shrink-0">
          <span className="absolute inline-flex h-full w-full rounded-full bg-[var(--accent-primary)] opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--accent-primary)]" />
        </span>
        <span
          className="truncate text-[0.72rem] text-[var(--text-primary)]"
          style={{ fontFamily: 'var(--font-body)' }}
        >
          {projectName}
        </span>
        <span className="flex-shrink-0 font-mono text-[0.72rem] tabular-nums text-[var(--text-muted)]">
          {formatElapsedSeconds(elapsedSeconds)}
        </span>
      </button>

      {stopOpen && <StopTimerDialog timer={timer} onClose={() => setStopOpen(false)} />}
    </>
  );
}
