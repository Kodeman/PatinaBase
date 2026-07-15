'use client';

/**
 * ScheduleEntryField — the ONE grammar-driven inline field (Slice 03 §3,
 * R100 entry grammar). Every duration/date the compose surfaces accept passes
 * through `parseScheduleEntry` (@patina/utils) here: "Edit dates" on a phase
 * (duration + anchor), and the milestone composer's offset-or-date field.
 * The ghost-add line has its own duration field (it needs a live compute line
 * as you type) — everything else is this.
 *
 * Behavior (R100 · D4 — no modal, no wizard, no preview-gate):
 *   · Direct commit on Enter or blur: a VALID parse fires `onCommit`.
 *   · Esc cancels the in-progress field WITHOUT writing (`onCancel`) — Esc is
 *     the ONLY path that cancels, so tabbing between sibling fields (an empty
 *     blur) never tears the surface down mid-move.
 *   · Invalid input → an inline DM-Mono terracotta reason under the field and
 *     NO write, whether the invalidity is discovered on Enter or on blur; an
 *     empty field is a quiet no-op (no write, no reason).
 *   · `accept` narrows which parse kinds a surface allows — a phase anchor
 *     field passes `['anchor']`; a duration field `['duration']`. A valid
 *     parse of the wrong kind reads as invalid with a surface-shaped reason.
 *
 * Pure controlled field: it never touches the DB. The parent maps the
 * ParsedEntry to a column (duration→duration_days/offset_days, anchor→
 * anchor_date) and writes. Clock injected (`today`), like the parser itself.
 */

import { useState, type KeyboardEvent } from 'react';
import { parseScheduleEntry, type ParsedEntry } from '@patina/utils';

/** A committed parse — never the `invalid` arm (that path stays in the field). */
export type CommittedEntry =
  | { kind: 'duration'; days: number }
  | { kind: 'anchor'; date: string };

export interface ScheduleEntryFieldProps {
  /** Injected clock, 'YYYY-MM-DD' — feeds year inference in the parser. */
  today: string;
  /** Bare-number default: phases 'weeks', milestone offsets 'days', else reject. */
  bareNumberUnit?: 'days' | 'weeks' | 'reject';
  /** Which parse kinds this surface accepts. Default: both. */
  accept?: Array<'duration' | 'anchor'>;
  placeholder?: string;
  initialValue?: string;
  autoFocus?: boolean;
  /** Fires with a VALID, accepted parse on Enter or blur. */
  onCommit: (entry: CommittedEntry) => void;
  /** Esc, an empty commit, or a blur that couldn't parse — no write. */
  onCancel?: () => void;
  className?: string;
  'aria-label': string;
}

const REASON_FOR_KIND: Record<'duration' | 'anchor', string> = {
  duration: 'this field takes a duration (3w, 10d) — not a date',
  anchor: 'this field takes a date (Sep 21, 9/21) — not a duration',
};

export function ScheduleEntryField({
  today,
  bareNumberUnit = 'reject',
  accept = ['duration', 'anchor'],
  placeholder,
  initialValue = '',
  autoFocus = true,
  onCommit,
  onCancel,
  className = '',
  'aria-label': ariaLabel,
}: ScheduleEntryFieldProps) {
  const [text, setText] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);

  // Commit-if-valid, else surface the reason. Never cancels — an empty field
  // is a silent no-op; only Esc (below) tears the field down.
  const attempt = () => {
    const trimmed = text.trim();
    if (trimmed === '') {
      setError(null);
      return;
    }
    const parsed: ParsedEntry = parseScheduleEntry(trimmed, today, { bareNumberUnit });
    if (parsed.kind === 'invalid') {
      setError(parsed.reason);
      return;
    }
    if (!accept.includes(parsed.kind)) {
      setError(REASON_FOR_KIND[accept[0] ?? 'duration']);
      return;
    }
    onCommit(parsed);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      attempt();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel?.();
    }
  };

  return (
    <span className={`inline-flex flex-col ${className}`}>
      <input
        autoFocus={autoFocus}
        type="text"
        aria-label={ariaLabel}
        aria-invalid={error != null}
        value={text}
        placeholder={placeholder}
        onChange={(e) => {
          setText(e.target.value);
          if (error) setError(null);
        }}
        onKeyDown={handleKeyDown}
        onBlur={attempt}
        className="rounded-[3px] border border-[var(--color-pearl)] bg-[var(--color-off-white)] px-[0.6rem] py-[0.3rem] font-mono text-[0.72rem] text-[var(--color-charcoal)] placeholder:italic placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)] focus:outline-none"
      />
      {error && (
        <span className="mt-[0.25rem] font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-terracotta)]">
          {error}
        </span>
      )}
    </span>
  );
}
