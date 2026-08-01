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
import { DocumentAction, DocumentActionRow } from './document-action';
import { useMobileShell } from './mobile/mobile-shell';

/* The Scored Ink (I107) on a bespoke control: Pause/Resume stay hand-rolled —
   they drive a live clock, not a document act — but they lose the box. The
   button keeps its 44px target as invisible padding; the word inside carries
   the hairline (.da-score-hover), and .da-glyph-btn supplies the bare-control
   base: no fill, no border, aged-oak turning charcoal, clay focus ring. */
const T_BTN =
  'da-glyph-btn doc-type-meta inline-flex min-h-11 min-w-11 items-center justify-center uppercase tracking-[0.06em] disabled:opacity-50';

/** The minute-scale notation that can stay legible inside the 56px spine. */
function compactElapsed(totalSeconds: number): string {
  const minutes = Math.floor(Math.max(0, totalSeconds) / 60);
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`;
}

/**
 * The 1180–1439 timer doorway. It is intentionally a readout, not a second
 * toolbar: the narrow spine names the timer state and opens the shared paper
 * timer sheet for Pause / Resume / + Log.
 */
export function CompactSpineTimerDoorway() {
  const { heldProjectId, running, paused, elapsedSeconds } = useDocumentTime();
  const { sheet, openTimer } = useMobileShell();

  if (!heldProjectId) return null;

  const stateLabel = paused ? 'Paused' : running ? 'In hand' : 'In hand';
  const elapsed = compactElapsed(elapsedSeconds);

  return (
    <button
      type="button"
      data-compact-spine-timer-doorway
      data-spine-timer-regime="compact-only-1180-1439"
      aria-label={`Open time controls, ${stateLabel}, ${elapsed} elapsed`}
      aria-controls="mobile-timer-sheet"
      aria-expanded={sheet?.kind === 'timer'}
      onClick={(event) => {
        // Pointer activation does not focus buttons consistently across
        // browsers. Establish the doorway as the modal's return target before
        // the sheet mounts and captures document.activeElement.
        event.currentTarget.focus({ preventScroll: true });
        openTimer();
      }}
      className="da-score-hover mt-3 hidden min-h-11 w-full min-w-11 flex-col items-center justify-center gap-1 py-2 text-center text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)] min-[1180px]:flex min-[1440px]:hidden"
    >
      <span
        data-timer-state={paused ? 'paused' : 'running'}
        className="doc-type-meta flex max-w-full flex-col items-center leading-[1.15]"
      >
        <i
          aria-hidden
          className="mb-0.5 block h-1.5 w-1.5 rounded-full"
          style={{
            background: paused ? 'var(--color-pearl)' : 'var(--color-sage)',
          }}
        />
        {paused ? (
          'Paused'
        ) : (
          <>
            In
            <br />
            hand
          </>
        )}
      </span>
      <span className="doc-type-meta font-mono font-semibold tracking-[0.03em] text-[var(--color-charcoal)]">
        {elapsed}
      </span>
    </button>
  );
}

export function SpineTimer() {
  const {
    heldProjectId,
    running,
    paused,
    elapsedSeconds,
    manualLog,
    pause,
    resume,
  } = useDocumentTime();
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
    <div
      data-full-spine-timer
      className="mt-4 hidden rounded-[5px] border border-[var(--color-pearl)] bg-[rgba(252,250,246,0.85)] px-3 py-2.5 min-[980px]:block"
    >
      <p className="doc-type-meta flex items-center gap-1.5 font-semibold uppercase tracking-[0.1em] text-[var(--color-quiet-ink)]">
        <span
          aria-hidden
          className="inline-block h-[6px] w-[6px] rounded-full"
          style={{
            background: paused ? 'var(--color-pearl)' : 'var(--color-sage)',
          }}
        />
        In hand{paused ? ' · paused' : ''}
      </p>
      <p className="mb-2 mt-1 font-mono text-[17px] tracking-[0.04em] text-[var(--color-charcoal)]">
        {fmtElapsedQuiet(elapsedSeconds)}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {running && (
          <button type="button" className={T_BTN} onClick={pause}>
            <span className="da-score-hover block">Pause</span>
          </button>
        )}
        {paused && (
          <button type="button" className={T_BTN} onClick={resume}>
            <span className="da-score-hover block">Resume</span>
          </button>
        )}
        <DocumentAction
          actionKey="open-manual-time-entry"
          surfaceKey="timer"
          regionKey="timer-controls"
          variant="secondary"
          onClick={() => setFormOpen((v) => !v)}
        >
          + Log
        </DocumentAction>
      </div>
      {formOpen && (
        <div className="mt-2 space-y-1.5">
          <input
            type="number"
            min={1}
            placeholder="Minutes"
            aria-label="Minutes"
            className="doc-type-control min-h-11 w-full rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-2 text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void addEntry();
            }}
          />
          <select
            aria-label="Activity"
            className="doc-type-control min-h-11 w-full rounded-[3px] border border-[var(--color-pearl)] bg-[var(--doc-paper)] px-2 py-2 text-[var(--color-charcoal)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-quiet-ink)]"
            value={activity}
            onChange={(e) => setActivity(e.target.value)}
          >
            {ACTIVITIES.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
          <DocumentActionRow
            surfaceKey="timer"
            regionKey="manual-time-entry"
            aria-label="Manual time entry actions"
          >
            <DocumentAction
              actionKey="add-manual-time-entry"
              variant="primary"
              disabled={!valid || busy}
              loading={busy}
              loadingLabel="Adding…"
              onClick={() => void addEntry()}
            >
              Add entry
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}
    </div>
  );
}
