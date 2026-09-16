'use client';

/**
 * The subject line (R4) — the studio's own one-line description of the
 * engagement, printed under the name and edited in place.
 *
 * `subject ?? assembled`: the stored line if there is one, otherwise the line
 * the page assembles from discovery (project type · N rooms). The assembled
 * line is a PRINT, never a value — the editor opens pre-filled with the stored
 * subject alone, and the assembled line stands behind it as the placeholder.
 * Committing the assembled words would freeze a description the discovery row
 * is still moving.
 *
 * P5 — with neither a subject nor an assembled line the paper prints no empty
 * line at all; the door stays open as one tertiary act, except on a project
 * paper, which prints nothing.
 *
 * Blur-save, Enter, Esc: the R40/R70 law, in the shape `LetterheadTitle` wears
 * one line above.
 */

import { useEffect, useRef, useState } from 'react';
import { useUpdateEngagementSubject } from '@patina/supabase';
import type { EngagementKind } from '@/lib/document/desk-derivation';
import { DocumentAction } from './document-action';
import { SaveDot, type SaveState } from './letterhead-vitals';

const ADD_LABEL = 'Add a subject line';

/** D5 — 15px, wrapping, no clip. One class set for the print and the input, so
 *  the rect does not move on the swap. */
const TYPE = 'text-[15px] leading-[1.35] text-[var(--text-muted)]';

/** D2 — the letterhead's own ring, on every control it carries. */
const RING =
  'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]';

export function LetterheadSubject({
  kind,
  id,
  subject,
  assembled,
}: {
  kind: EngagementKind;
  /** The engagement's own id — `document_state.engagement_id`. */
  id: string;
  /** The stored line. Null until the studio writes one. */
  subject: string | null;
  /** The derived line, printed in its place. Never written. */
  assembled: string | null;
}) {
  const mutation = useUpdateEngagementSubject();
  const [state, setState] = useState<SaveState>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const trigger = useRef<HTMLElement | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  const beginEdit = () => {
    // Never the assembled line: the field opens on what is STORED, so pressing
    // Enter on an untouched editor cannot persist a derivation.
    setValue(subject ?? '');
    setEditing(true);
  };

  const leaveEdit = (restoreFocus = true) => {
    setEditing(false);
    if (restoreFocus)
      window.requestAnimationFrame(() =>
        trigger.current?.focus({ preventScroll: true }),
      );
  };

  const commit = async () => {
    const next = value.trim();
    const current = subject ?? '';
    if (next === current) return; // unchanged never saves
    setState('saving');
    setErrorMsg(null);
    try {
      await mutation.mutateAsync({ kind, id, subject: next === '' ? null : next });
      setState('saved');
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setState('idle'), 1800);
    } catch (e) {
      setState('error');
      setErrorMsg(e instanceof Error ? e.message : 'Could not save just now.');
    }
  };

  const printed = subject ?? assembled;

  // P5 — a project paper's vitals already carry phase · target · money, so an
  // empty project head prints nothing at all, not even the act.
  if (printed === null && kind === 'project') return null;

  return (
    <div className="mt-1 flex min-w-0 items-baseline gap-2">
      {editing ? (
        <input
          type="text"
          aria-label="Subject line"
          placeholder={assembled ?? ADD_LABEL}
          autoFocus
          value={value}
          onFocus={(e) => {
            const end = e.currentTarget.value.length;
            e.currentTarget.setSelectionRange(end, end);
          }}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            void commit();
            leaveEdit(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void commit();
              leaveEdit();
            } else if (e.key === 'Escape') {
              // The shell puts the paper down on Escape (D1) and its listener
              // is on `document`, outside React's tree — so both propagations
              // stop here, or "leave it alone" also closes the document.
              e.stopPropagation();
              e.nativeEvent.stopImmediatePropagation();
              e.preventDefault();
              setValue(subject ?? '');
              leaveEdit();
            }
          }}
          disabled={state === 'saving'}
          // The 44px target is taken back out of the flow so the letterhead's
          // own height does not change when the print swaps for the field.
          className={`-my-3 w-full min-w-0 flex-1 border-b border-transparent bg-transparent hover:border-[var(--color-pearl)] focus:border-[var(--color-clay)] disabled:opacity-60 min-h-[44px] ${RING} ${TYPE}`}
        />
      ) : printed ? (
        /* The visible line IS the control — no pencil, no second glyph. The
           line names the control: an `aria-label` here REPLACES the subject in
           the accessible name, so the one line R4 exists to print would never
           be spoken. */
        <button
          type="button"
          ref={(el) => {
            trigger.current = el;
          }}
          data-letterhead-subject
          onClick={beginEdit}
          // The 44px target is taken back out of the flow, so the printed line
          // keeps its baseline under the name.
          className={`-my-3 min-w-0 cursor-text break-words py-3 text-left ${RING} ${TYPE}`}
        >
          {printed}
          <span className="sr-only"> — edit the subject line</span>
        </button>
      ) : (
        <DocumentAction
          ref={(el) => {
            trigger.current = el;
          }}
          actionKey="letterhead-subject-add"
          surfaceKey="letterhead"
          regionKey="subject"
          variant="tertiary"
          className="!text-[13px]"
          onClick={beginEdit}
        >
          {ADD_LABEL}
        </DocumentAction>
      )}
      <SaveDot state={state} errorMsg={errorMsg} />
    </div>
  );
}
