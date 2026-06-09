'use client';

import { useState } from 'react';
import { Button, Input, Select, Textarea } from '@/components/ui/controls';
import { ALL_PHASES, PHASE_CONFIG, type ProjectPhase } from '@/types/project-ui';
import { useCreateTimeEntry } from '@/hooks/use-time-tracking';
import { parseDurationToMinutes, formatMinutes } from '@/lib/parse-duration';

interface LogTimeDialogProps {
  open: boolean;
  projectId: string;
  /** Pre-select a phase (e.g. the project's current phase). */
  defaultPhase?: ProjectPhase;
  onClose: () => void;
  /** Called after a successful save (e.g. to toast). */
  onLogged?: () => void;
}

const todayISO = () => new Date().toISOString().slice(0, 10);

/**
 * Manual time entry composer (Wave 1 — timers come later). Duration accepts
 * "1:30", "1.5h", "90m", "1h 30m", or a bare number (small = hours).
 */
export function LogTimeDialog({ open, projectId, defaultPhase, onClose, onLogged }: LogTimeDialogProps) {
  const [date, setDate] = useState(todayISO);
  const [duration, setDuration] = useState('');
  const [phase, setPhase] = useState<string>(defaultPhase ?? '');
  const [notes, setNotes] = useState('');
  const [billable, setBillable] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const createEntry = useCreateTimeEntry();

  if (!open) return null;

  const parsedMinutes = duration.trim() ? parseDurationToMinutes(duration) : null;

  const reset = () => {
    setDate(todayISO());
    setDuration('');
    setPhase(defaultPhase ?? '');
    setNotes('');
    setBillable(true);
    setError(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const submit = async () => {
    const minutes = parseDurationToMinutes(duration);
    if (!minutes) {
      setError('Enter a duration like “1:30”, “1.5h”, or “90m”.');
      return;
    }
    setError(null);
    try {
      await createEntry.mutateAsync({
        projectId,
        durationMinutes: minutes,
        // Noon local avoids the entry drifting a day under timezone conversion.
        startedAt: new Date(`${date}T12:00:00`).toISOString(),
        phaseKey: phase || null,
        notes: notes.trim() || null,
        billable,
      });
      onLogged?.();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not log time. Please try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={handleClose}
    >
      <div
        className="w-[90vw] max-w-md rounded-md border bg-[var(--bg-surface)] p-5"
        style={{ borderColor: 'var(--border-default)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          Log Time
        </h3>
        <p className="type-body" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
          Record hours worked on this project. Time is internal — clients never see it.
        </p>

        {error && (
          <div
            role="alert"
            className="mb-3 rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="log-time-date" className="mb-1.5 block type-meta-small">
              Date
            </label>
            <Input
              id="log-time-date"
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="log-time-duration" className="mb-1.5 block type-meta-small">
              Duration
            </label>
            <Input
              id="log-time-duration"
              autoFocus
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="1:30, 1.5h, or 90m"
            />
            {parsedMinutes ? (
              <p className="mt-1 type-meta-small text-[var(--text-muted)]">
                = {formatMinutes(parsedMinutes)} ({(parsedMinutes / 60).toFixed(2)}h)
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-3">
          <label htmlFor="log-time-phase" className="mb-1.5 block type-meta-small">
            Phase
          </label>
          <Select
            id="log-time-phase"
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
          <label htmlFor="log-time-notes" className="mb-1.5 block type-meta-small">
            Notes
          </label>
          <Textarea
            id="log-time-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="What did you work on?"
            className="resize-y"
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <input
            id="log-time-billable"
            type="checkbox"
            checked={billable}
            onChange={(e) => setBillable(e.target.checked)}
            className="h-4 w-4 cursor-pointer rounded border-[var(--border-default)] accent-[var(--accent-primary)]"
          />
          <label htmlFor="log-time-billable" className="cursor-pointer select-none type-meta-small">
            Billable
          </label>
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={createEntry.isPending || !duration.trim()}
            loading={createEntry.isPending}
          >
            {createEntry.isPending ? 'Saving…' : 'Log time'}
          </Button>
        </div>
      </div>
    </div>
  );
}
