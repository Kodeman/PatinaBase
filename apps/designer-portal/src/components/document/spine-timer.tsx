'use client';

/**
 * The spine timer (spec v1.2 §9, D9/D11): IN HAND + the clock + Pause and
 * "+ Log", per the prototype v0.4 .timerbox recipe. Presentational — it
 * takes its state from the provider (D13: the timer components take a
 * state; they aren't forked per surface; mobile remounts this in Slice 6).
 */

import { useState } from 'react';
import { useDocumentTime } from '@/hooks/document-time-provider';
import { ACTIVITIES, fmtElapsedQuiet } from '@/lib/document/time-derivation';

const T_BTN =
  'rounded-[3px] border border-[var(--color-pearl)] px-2 py-[3px] font-mono text-[8.5px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:border-[var(--color-clay)] hover:text-[var(--color-clay)] disabled:opacity-50';

export function SpineTimer() {
  const { heldProjectId, running, paused, elapsedSeconds, manualLog } = useDocumentTime();
  const { pause, resume } = useDocumentTime();
  const [formOpen, setFormOpen] = useState(false);
  const [minutes, setMinutes] = useState('');
  const [activity, setActivity] = useState('design');
  const [busy, setBusy] = useState(false);

  // Time attaches to projects (00177 FK) — pre-project documents carry no
  // timer in v1.
  if (!heldProjectId) return null;

  const parsed = parseInt(minutes, 10);
  const valid = Number.isFinite(parsed) && parsed >= 1;

  const addEntry = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await manualLog(parsed, activity);
      setMinutes('');
      setFormOpen(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 hidden rounded-[5px] border border-[var(--color-pearl)] bg-[rgba(252,250,246,0.85)] px-3 py-2.5 min-[980px]:block">
      <p className="flex items-center gap-1.5 font-mono text-[8.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-clay)]">
        <span
          aria-hidden
          className="inline-block h-[6px] w-[6px] rounded-full"
          style={{ background: paused ? 'var(--color-pearl)' : 'var(--color-sage)' }}
        />
        In hand{paused ? ' · paused' : ''}
      </p>
      <p className="mb-2 mt-1 font-mono text-[17px] tracking-[0.04em] text-[var(--color-charcoal)]">
        {fmtElapsedQuiet(elapsedSeconds)}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {running && (
          <button type="button" className={T_BTN} onClick={pause}>
            Pause
          </button>
        )}
        {paused && (
          <button type="button" className={T_BTN} onClick={resume}>
            Resume
          </button>
        )}
        <button type="button" className={T_BTN} onClick={() => setFormOpen((v) => !v)}>
          + Log
        </button>
      </div>
      {formOpen && (
        <div className="mt-2 space-y-1.5">
          <input
            type="number"
            min={1}
            placeholder="Minutes"
            aria-label="Minutes"
            className="w-full rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-1 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addEntry();
            }}
          />
          <select
            aria-label="Activity"
            className="w-full rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-1 text-[11px] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          >
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!valid || busy}
            onClick={() => void addEntry()}
            className="rounded-[3px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-2.5 py-1 text-[10.5px] font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Add entry
          </button>
        </div>
      )}
    </div>
  );
}
