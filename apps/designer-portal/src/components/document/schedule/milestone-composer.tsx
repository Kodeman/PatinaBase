'use client';

/**
 * MilestoneComposer — add one milestone inside a phase (Slice 03 §3, R100).
 * Three quiet fields: a name, one of four kinds (Sign-off · Decision ·
 * Delivery · Event — the stamp language the proposal already speaks), and an
 * offset-or-date field that runs the ONE grammar (`parseScheduleEntry`,
 * bareNumberUnit 'days'): a signed offset ("-3d", "+2d") relative to the
 * phase end, or a hard date ("Sep 21") that anchors the milestone. Empty =
 * "at phase end".
 *
 * Surface-agnostic by construction: it collects the values and hands them to
 * `onSubmit`; the caller writes (the spine → useAddScheduleMilestone; the
 * proposal composer will reuse it later against proposal_schedule_milestones).
 * No modal, no wizard (D4); Esc cancels without writing.
 */

import { useState, type KeyboardEvent } from 'react';
import { parseScheduleEntry, type MilestoneKind } from '@patina/utils';

export interface MilestoneDraft {
  name: string;
  kind: MilestoneKind;
  offsetDays?: number;
  anchorDate?: string;
}

export interface MilestoneComposerProps {
  today: string;
  onSubmit: (draft: MilestoneDraft) => void;
  onCancel: () => void;
  busy?: boolean;
  /** Inline terracotta line when the WRITE failed — the composer stays open
   *  with everything typed. Local parse errors take precedence while present. */
  errorText?: string | null;
}

const KINDS: Array<{ key: MilestoneKind; label: string }> = [
  { key: 'signoff', label: 'Sign-off' },
  { key: 'decision', label: 'Decision' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'event', label: 'Event' },
];

export function MilestoneComposer({
  today,
  onSubmit,
  onCancel,
  busy = false,
  errorText = null,
}: MilestoneComposerProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<MilestoneKind>('event');
  const [whenText, setWhenText] = useState('');
  const [error, setError] = useState<string | null>(null);
  // A local parse reason outranks the write error while both exist.
  const shownError = error ?? errorText;

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('name the milestone');
      return;
    }
    const trimmedWhen = whenText.trim();
    if (trimmedWhen === '') {
      onSubmit({ name: trimmedName, kind }); // at phase end (DB default offset)
      return;
    }
    const parsed = parseScheduleEntry(trimmedWhen, today, { bareNumberUnit: 'days' });
    if (parsed.kind === 'invalid') {
      setError(parsed.reason);
      return;
    }
    // schedule_anchor_set (target 'milestone', the anchor arm) fires in the
    // caller's onSuccess (schedule-spine.tsx handleAddMilestone) — this
    // component only signals intent via onSubmit.
    if (parsed.kind === 'duration') onSubmit({ name: trimmedName, kind, offsetDays: parsed.days });
    else onSubmit({ name: trimmedName, kind, anchorDate: parsed.date });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
  };

  const clearError = () => {
    if (error) setError(null);
  };

  return (
    <div className="mt-[0.5rem] max-w-[440px] border-l-2 border-[var(--color-pearl)] pl-[0.8rem]">
      <input
        autoFocus
        type="text"
        aria-label="Milestone name"
        value={name}
        placeholder="Milestone name…"
        onChange={(e) => {
          setName(e.target.value);
          clearError();
        }}
        onKeyDown={onKeyDown}
        className="w-full border-b border-[var(--color-pearl)] bg-transparent pb-[3px] font-heading text-[0.98rem] text-[var(--color-charcoal)] placeholder:italic placeholder:text-[var(--text-muted)] focus:border-[var(--color-clay)] focus:outline-none"
      />

      {/* four quiet kinds — persistent, never a dropdown (D4) */}
      <div className="mt-[0.55rem] flex flex-wrap gap-[0.4rem]">
        {KINDS.map((k) => {
          const selected = k.key === kind;
          return (
            <button
              key={k.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setKind(k.key)}
              className={`rounded-[3px] border px-[0.5rem] py-[0.2rem] font-mono text-[0.58rem] uppercase tracking-[0.06em] ${
                selected
                  ? 'border-[var(--color-charcoal)] text-[var(--color-charcoal)]'
                  : 'border-[var(--color-pearl)] text-[var(--color-aged-oak)]'
              }`}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      <div className="mt-[0.55rem] flex items-baseline gap-[0.35rem]">
        <label className="inline-flex items-baseline gap-[0.35rem] rounded-[3px] border border-[var(--color-pearl)] bg-[var(--color-off-white)] px-[0.6rem] py-[0.3rem]">
          <span className="font-mono text-[0.6rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
            When
          </span>
          <input
            type="text"
            aria-label="Milestone offset or date"
            value={whenText}
            placeholder="At phase end · -3d · Sep 21"
            onChange={(e) => {
              setWhenText(e.target.value);
              clearError();
            }}
            onKeyDown={onKeyDown}
            className="w-[170px] bg-transparent font-mono text-[0.72rem] text-[var(--color-charcoal)] placeholder:italic placeholder:text-[var(--text-muted)] focus:outline-none"
          />
        </label>
      </div>

      {shownError && (
        <div className="mt-[0.35rem] font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-terracotta)]">
          {shownError}
        </div>
      )}

      <div className="mt-[0.6rem] flex items-center gap-[0.9rem]">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="font-mono text-[0.6rem] uppercase tracking-[0.07em] text-[var(--color-clay)] disabled:opacity-50"
        >
          Add milestone
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="font-mono text-[0.6rem] uppercase tracking-[0.07em] text-[var(--color-aged-oak)]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
