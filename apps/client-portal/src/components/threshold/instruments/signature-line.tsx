'use client';

import { useState } from 'react';

import { SIGNATURE_NOTICE } from '../consent-copy';

/* ── THE RULED LINE (P-18) ───────────────────────────────────────────────────
   A name on a paper is written on a rule with the date beside it. That is the
   whole instrument: the word over the rule saying what to write, the rule
   itself, today's date set in mono where a dated signature sets it, and the
   one sentence that says what the typed name is.

   THE SENTENCE IS NOT REWRITTEN HERE. `SIGNATURE_NOTICE` is the retired sign
   route's own line, drift-guarded in `consent-copy.ts`; the line is printed,
   never composed, and never twice on one act.

   NO VALIDATION VOICE. The rule does not report that it is empty and it never
   turns a colour. Two characters is the floor the signing route and the
   Stage-2 response RPC both hold, so `signatureIsComplete` is what an act
   should ask before arming itself — the act simply stays unarmed until there
   is a name, the way the doors already work. ──────────────────────────────── */

/** The floor `/api/proposals/[id]/sign` and `_respond_project_approval_checked` both keep. */
export const MIN_SIGNATURE_LENGTH = 2;

/** Whether this is a name an act may be taken on. */
export function signatureIsComplete(value: string): boolean {
  return value.trim().length >= MIN_SIGNATURE_LENGTH;
}

/** "5 September 2026" — a date a signature is dated with, year included. */
const SIGNED_ON = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export function signedOnLabel(on: Date): string {
  return SIGNED_ON.format(on);
}

export interface SignatureLineProps {
  /** The input's own id — the label points at it. */
  id: string;
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  /** The word over the rule. */
  label?: string;
  /** The date set beside the name. Defaults to the day the line was drawn. */
  on?: Date;
  /** The electronic-signature sentence. Suppressed only where the act's own
   *  copy already carries it, so it is never printed twice on one paper. */
  notice?: boolean;
  /** The input's test id; the date and the notice take it as a prefix. */
  testId: string;
  /** Anything else describing the field, e.g. an act's hint sentence. */
  describedBy?: string;
}

export function SignatureLine({
  id,
  value,
  onChange,
  disabled = false,
  label = 'Type your full name',
  on,
  notice = true,
  testId,
  describedBy,
}: SignatureLineProps) {
  // The date is the day she came to the paper, fixed once: a line that
  // re-dates itself on every keystroke is not a date.
  const [drawnOn] = useState(() => on ?? new Date());
  const dated = on ?? drawnOn;

  return (
    <div data-signature-line="" className="max-w-[52ch]">
      <label
        className="block font-mono text-[11px] uppercase tracking-[0.13em] text-[var(--text-muted)]"
        htmlFor={id}
      >
        {label}
      </label>
      <div className="mt-1.5 flex flex-wrap items-end gap-x-4 gap-y-1">
        <input
          id={id}
          type="text"
          value={value}
          autoComplete="name"
          disabled={disabled}
          data-testid={testId}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className="min-w-[12rem] flex-1 border-0 border-b border-current bg-transparent px-0.5 py-1 font-heading text-[1.1rem] text-[var(--text-primary)]"
        />
        <span
          data-testid={`${testId}-date`}
          className="border-b border-[var(--border-default)] px-0.5 py-1 font-mono text-[12px] tracking-[0.06em] text-[var(--text-muted)]"
        >
          {signedOnLabel(dated)}
        </span>
      </div>
      {notice && (
        <p
          data-testid={`${testId}-notice`}
          className="mt-1.5 max-w-[52ch] text-[12px] leading-snug text-[var(--text-muted)]"
        >
          {SIGNATURE_NOTICE}
        </p>
      )}
    </div>
  );
}
