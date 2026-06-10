'use client';

import { useEffect, useState } from 'react';
import { Button, Select, Textarea } from '@/components/ui/controls';
import { ALL_PHASES, PHASE_CONFIG, normalizePhaseSlug } from '@/types/project-ui';
import { useStopTimer, useDiscardTimer, type RunningTimer } from '@/hooks/use-time-tracking';
import { formatElapsedSeconds, formatMinutes } from '@/lib/parse-duration';
import { useToast } from '@/components/portal/toast-provider';

interface StopTimerDialogProps {
  /** The running entry (duration_minutes IS NULL) being stopped. */
  timer: RunningTimer;
  onClose: () => void;
  /** Called after the entry is saved (not on discard). */
  onStopped?: () => void;
}

/**
 * Stop-timer composer (Wave 2). Mount conditionally — `{open && <StopTimer…/>}`
 * — so state re-initializes from the timer row on every open. Same house
 * dialog pattern as LogTimeDialog.
 */
export function StopTimerDialog({ timer, onClose, onStopped }: StopTimerDialogProps) {
  const [phase, setPhase] = useState<string>(() =>
    timer.phase_key ??
    (timer.project?.current_phase ? normalizePhaseSlug(timer.project.current_phase) : '')
  );
  const [notes, setNotes] = useState(timer.notes ?? '');
  const [billable, setBillable] = useState(timer.billable ?? true);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const stopTimer = useStopTimer();
  const discardTimer = useDiscardTimer();
  const { toast } = useToast();

  // Live elapsed readout while the dialog is open.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSeconds = Math.max(0, (now - new Date(timer.started_at).getTime()) / 1000);
  const elapsedMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
  const busy = stopTimer.isPending || discardTimer.isPending;

  const handleStop = async () => {
    setError(null);
    try {
      await stopTimer.mutateAsync({
        entryId: timer.id,
        notes: notes.trim() || null,
        phaseKey: phase || null,
        billable,
      });
      toast(`Logged ${formatMinutes(elapsedMinutes)} to ${timer.project?.name ?? 'project'}`, 'success');
      onStopped?.();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not stop the timer. Please try again.');
    }
  };

  const handleDiscard = async () => {
    if (!confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    setError(null);
    try {
      await discardTimer.mutateAsync({ entryId: timer.id });
      toast('Timer discarded — no time was logged', 'info');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not discard the timer. Please try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={busy ? undefined : onClose}
    >
      <div
        className="w-[90vw] max-w-md rounded-md border bg-[var(--bg-surface)] p-5"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Stop Timer
        </h3>
        <p className="type-body" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          {timer.project?.name ?? 'Untitled project'}
        </p>

        {/* Elapsed readout */}
        <div
          className="mb-3 flex items-baseline justify-between rounded-sm border px-3 py-2.5"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-primary)' }}
        >
          <span className="type-meta-small text-[var(--text-muted)]">Elapsed</span>
          <span className="font-mono text-[1.15rem] tabular-nums text-[var(--text-primary)]">
            {formatElapsedSeconds(elapsedSeconds)}
          </span>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <div>
          <label htmlFor="stop-timer-phase" className="mb-1.5 block type-meta-small">
            Phase
          </label>
          <Select
            id="stop-timer-phase"
            value={phase}
            onChange={(e) => setPhase(e.target.value)}
          >
            <option value="">No phase</option>
            {ALL_PHASES.map((p) => (
              <option key={p} value={p}>
                {PHASE_CONFIG[p].label}
              </option>
            ))}
          </Select>
        </div>

        <div className="mt-3">
          <label htmlFor="stop-timer-notes" className="mb-1.5 block type-meta-small">
            Notes
          </label>
          <Textarea
            id="stop-timer-notes"
            autoFocus
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="What did you work on?"
            className="resize-y"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            id="stop-timer-billable"
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-[var(--border-default)] accent-[var(--accent-primary)]"
          />
          <label htmlFor="stop-timer-billable" className="cursor-pointer select-none type-meta-small">
            Billable
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleDiscard}
            disabled={busy}
            loading={discardTimer.isPending}
            className="text-[var(--color-terracotta)] hover:text-[var(--color-terracotta)]"
          >
            {confirmingDiscard ? 'Discard — really?' : 'Discard'}
          </Button>
          <div className="ml-auto flex gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Keep running
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleStop}
              disabled={busy}
              loading={stopTimer.isPending}
            >
              {stopTimer.isPending ? 'Saving…' : 'Stop & Save'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
