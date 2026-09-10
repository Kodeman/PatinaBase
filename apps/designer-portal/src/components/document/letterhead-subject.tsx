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

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

const ADD_LABEL = 'Add a subject line';

/** D5 — 15px, wrapping, no clip. One class set for the print and the input, so
 *  the rect does not move on the swap. */
const TYPE = 'text-[15px] leading-[1.35] text-[var(--text-muted)]';

function SaveDot({ state, errorMsg }: { state: SaveState; errorMsg: string | null }) {
  if (state === 'idle') return null;
  return (
    <span
      role="status"
      aria-live="polite"
      className={`font-mono text-[11px] uppercase tracking-[0.05em] ${
        state === 'error' ? 'text-[var(--color-terracotta-ink)]' : 'text-[var(--color-sage)]'
      }`}
    >
      {state === 'saving' && '· saving…'}
      {state === 'saved' && '✓'}
      {state === 'error' && `· ${errorMsg ?? "couldn't save"}`}
    </span>
  );
}

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
          className={`w-full min-w-0 flex-1 border-b border-transparent bg-transparent hover:border-[var(--color-pearl)] focus:border-[var(--color-clay)] focus:outline-none disabled:opacity-60 ${TYPE}`}
        />
      ) : printed ? (
        /* The visible line IS the control — no pencil, no second glyph. */
        <p
          ref={(el) => {
            trigger.current = el;
          }}
          data-letterhead-subject
          role="button"
          tabIndex={0}
          aria-label="Edit the subject line"
          onClick={beginEdit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              beginEdit();
            }
          }}
          className={`min-w-0 cursor-text break-words text-left ${TYPE}`}
        >
          {printed}
        </p>
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
