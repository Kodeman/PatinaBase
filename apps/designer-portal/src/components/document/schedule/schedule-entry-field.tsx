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
  /**
   * Sign policy for the DURATION branch. Default 'unsigned' — a phase
   * duration must be a positive day count, so a signed-form input ('+2w',
   * '-3d', even '+5d' whose value is positive) or any parse resolving to
   * days <= 0 is rejected inline with no write. Milestone-OFFSET surfaces
   * pass 'signed' explicitly (offsets are relative to the phase end;
   * negative/zero are meaningful there). Load-bearing: duration_days has a
   * positive CHECK in the DB (00324), and a negative value would run
   * activate_proposal_as_project's legacy date cascade backwards.
   *
   * 'relative' (R100 — the spine's Edit-dates ripple field only): an
   * UNSIGNED parse ('28d', '4w') still means an absolute duration, same as
   * 'unsigned'. A SIGNED parse ('+5d', '-3d') means a delta off the
   * phase's last COMMITTED duration (`baselineDays`) — the committed
   * result is `max(1, baselineDays + delta)`, floored the same way a drag
   * gesture is clamped, never a negative or zero write. Without a
   * `baselineDays` to shift, a signed input is rejected inline (there is
   * nothing to be relative TO).
   */
  durationSign?: 'unsigned' | 'signed' | 'relative';
  /**
   * The phase's last COMMITTED effective duration in days — required only
   * when `durationSign === 'relative'` and only to resolve a SIGNED input.
   * `null`/`undefined` means "no committed baseline" (e.g. a phase whose
   * duration is legacy-dates-derived rather than an authored day count) —
   * a signed entry is then rejected rather than silently guessing a base.
   */
  baselineDays?: number | null;
  /** Override the "valid parse, wrong kind" reason text (default:
   *  REASON_FOR_KIND[accept[0]]). E.g. a proposal milestone date field
   *  (`accept={['anchor']}`) rejects a typed duration with "proposals carry
   *  anchored dates only" instead of the generic reason (R101.3). */
  wrongKindReason?: string;
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

const UNSIGNED_REASON = 'Durations must be positive — e.g. 3w or 10d';
const NO_BASELINE_REASON = 'No committed duration to shift — enter an absolute duration';

export function ScheduleEntryField({
  today,
  bareNumberUnit = 'reject',
  accept = ['duration', 'anchor'],
  durationSign = 'unsigned',
  baselineDays,
  wrongKindReason,
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
      setError(wrongKindReason ?? REASON_FOR_KIND[accept[0] ?? 'duration']);
      return;
    }
    if (parsed.kind === 'duration') {
      // Unsigned surfaces (phase durations) reject BOTH a non-positive
      // result AND the signed input FORM itself ('+5d' parses to a
      // positive 5, but a leading sign is offset grammar — accepting it
      // here would teach a different meaning than the milestone fields
      // give it).
      if (durationSign === 'unsigned' && (parsed.days <= 0 || /^[+-]/.test(trimmed))) {
        setError(UNSIGNED_REASON);
        return;
      }
      if (durationSign === 'relative') {
        const isSignedInput = /^[+-]/.test(trimmed);
        if (isSignedInput) {
          // A signed parse is a DELTA off the last committed duration, not
          // a day count on its own — resolve it here so the parent (and
          // CommittedEntry) only ever sees an absolute day count, same
          // shape as every other duration commit. Floored at 1, mirroring
          // the drag clamp (a shift that would zero/negative the phase
          // still leaves it at least one day long).
          if (baselineDays == null) {
            setError(NO_BASELINE_REASON);
            return;
          }
          onCommit({ kind: 'duration', days: Math.max(1, baselineDays + parsed.days) });
          return;
        }
        // Unsigned input in 'relative' mode is still an absolute duration
        // (parseScheduleEntry already guarantees days > 0 for an unsigned
        // parse — this mirrors 'unsigned' mode's check for symmetry/safety
        // rather than because it's reachable today).
        if (parsed.days <= 0) {
          setError(UNSIGNED_REASON);
          return;
        }
      }
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
