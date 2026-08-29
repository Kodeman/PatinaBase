'use client';

/**
 * MilestoneComposer — add one milestone inside a phase (Slice 03 §3, R100).
 * Three quiet fields: a name, one of four kinds (Sign-off · Decision ·
 * Delivery · Event — the stamp language the proposal already speaks), and a
 * WHEN preset row in the same chip grammar as the kind chips: "At phase end"
 * (default — no `offsetDays` key at all, the DB default supplies the
 * meaning), "Before end" (a bordered −/+ stepper, min 1, submits a negative
 * `offsetDays`), or "Pick a date" (a quiet date chip that opens the Calendar
 * Folio, submits `anchorDate`). Date Instruments lane D3 — the WHEN field no
 * longer free-parses text (`parseScheduleEntry` moves to Edit-dates-style
 * surfaces only); this composer now hands the Folio a committed day.
 *
 * Surface-agnostic by construction: it collects the values and hands them to
 * `onSubmit`; the caller writes (the spine → useAddScheduleMilestone; the
 * proposal composer will reuse it later against proposal_schedule_milestones).
 * No modal, no wizard (D4); Esc cancels without writing.
 */

import { useRef, useState, type KeyboardEvent } from 'react';
import type { MilestoneKind } from '@patina/utils';
import { FolioCalendar, FolioPopover, type FolioSelection } from '@/components/document/date';
import { fmtDay } from '@/lib/document/format';
import { DocumentAction, DocumentActionGroup } from '../document-action';

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

type WhenMode = 'end' | 'before' | 'date';

const WHEN_OPTIONS: Array<{ key: WhenMode; label: string }> = [
  { key: 'end', label: 'At phase end' },
  { key: 'before', label: 'Before end' },
  { key: 'date', label: 'Pick a date' },
];

const DEFAULT_BEFORE_DAYS = 3;

export function MilestoneComposer({
  today,
  onSubmit,
  onCancel,
  busy = false,
  errorText = null,
}: MilestoneComposerProps) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<MilestoneKind>('event');
  const [whenMode, setWhenModeState] = useState<WhenMode>('end');
  const [beforeDays, setBeforeDays] = useState(DEFAULT_BEFORE_DAYS);
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  const [folioOpen, setFolioOpen] = useState(false);
  const dateChipRef = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  // A local validation reason outranks the write error while both exist.
  const shownError = error ?? errorText;

  const clearError = () => {
    if (error) setError(null);
  };

  const setWhenMode = (mode: WhenMode) => {
    setWhenModeState(mode);
    clearError();
  };

  const submit = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('name the milestone');
      return;
    }
    if (whenMode === 'end') {
      onSubmit({ name: trimmedName, kind }); // at phase end (DB default offset)
      return;
    }
    if (whenMode === 'before') {
      onSubmit({ name: trimmedName, kind, offsetDays: -beforeDays });
      return;
    }
    if (anchorDate == null) {
      setError('pick a date');
      return;
    }
    // schedule_anchor_set (target 'milestone', the anchor arm) fires in the
    // caller's onSuccess (schedule-spine.tsx handleAddMilestone) — this
    // component only signals intent via onSubmit.
    onSubmit({ name: trimmedName, kind, anchorDate });
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
              className={`group inline-flex min-h-11 min-w-11 items-center justify-center px-[0.5rem] py-[0.2rem] font-mono text-[11px] uppercase tracking-[0.06em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none ${
                selected
                  ? 'text-[var(--color-charcoal)]'
                  : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]'
              }`}
            >
              <span
                className={`da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100 ${
                  selected ? 'da-score-on' : ''
                }`}
              >
                {k.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* WHEN — same chip grammar as the kind row above (D3, Date Instruments) */}
      <div role="group" aria-label="Milestone timing" className="mt-[0.55rem] flex flex-wrap gap-[0.4rem]">
        {WHEN_OPTIONS.map((w) => {
          const selected = w.key === whenMode;
          return (
            <button
              key={w.key}
              type="button"
              aria-pressed={selected}
              onClick={() => setWhenMode(w.key)}
              className={`group inline-flex min-h-11 min-w-11 items-center justify-center px-[0.5rem] py-[0.2rem] font-mono text-[11px] uppercase tracking-[0.06em] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] motion-reduce:transition-none ${
                selected
                  ? 'text-[var(--color-charcoal)]'
                  : 'text-[var(--color-aged-oak)] hover:text-[var(--color-charcoal)]'
              }`}
            >
              <span
                className={`da-score-hover group-hover:after:scale-x-100 group-focus-visible:after:scale-x-100 ${
                  selected ? 'da-score-on' : ''
                }`}
              >
                {w.label}
              </span>
            </button>
          );
        })}
      </div>

      {whenMode === 'before' && (
        <div className="mt-[0.55rem] inline-flex items-center gap-[0.5rem] rounded-[3px] border border-[var(--color-pearl)] bg-[var(--color-off-white)] px-[0.6rem] py-[0.3rem]">
          <button
            type="button"
            aria-label="Fewer days before end"
            disabled={beforeDays <= 1}
            onClick={() => {
              setBeforeDays((n) => Math.max(1, n - 1));
              clearError();
            }}
            className="flex h-5 w-5 items-center justify-center rounded-[2px] border border-[var(--color-pearl)] font-mono text-[0.7rem] text-[var(--color-mocha)] hover:border-[var(--color-clay)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            −
          </button>
          <span className="font-mono text-[0.72rem] text-[var(--color-charcoal)]">
            {beforeDays} {beforeDays === 1 ? 'day' : 'days'} before end
          </span>
          <button
            type="button"
            aria-label="More days before end"
            onClick={() => {
              setBeforeDays((n) => n + 1);
              clearError();
            }}
            className="flex h-5 w-5 items-center justify-center rounded-[2px] border border-[var(--color-pearl)] font-mono text-[0.7rem] text-[var(--color-mocha)] hover:border-[var(--color-clay)]"
          >
            +
          </button>
        </div>
      )}

      {whenMode === 'date' && (
        <div className="relative mt-[0.55rem] inline-block">
          <button
            ref={dateChipRef}
            type="button"
            aria-label="Milestone date"
            onClick={() => setFolioOpen((o) => !o)}
            className="inline-flex items-baseline gap-[0.35rem] rounded-[3px] border border-[var(--color-pearl)] bg-[var(--color-off-white)] px-[0.6rem] py-[0.3rem] font-mono text-[0.72rem] text-[var(--color-charcoal)] hover:border-[var(--color-clay)]"
          >
            {anchorDate ? fmtDay(anchorDate) : 'Pick a date…'}
          </button>
          {folioOpen && (
            <FolioPopover
              onClose={() => setFolioOpen(false)}
              aria-label="Milestone date"
              returnFocusRef={dateChipRef}
            >
              <FolioCalendar
                value={anchorDate ? { kind: 'day', date: anchorDate } : null}
                today={today}
                modes={['day']}
                onCommit={(selection: FolioSelection) => {
                  if (selection.kind === 'day') setAnchorDate(selection.date);
                  setFolioOpen(false);
                  clearError();
                }}
              />
            </FolioPopover>
          )}
        </div>
      )}

      {shownError && (
        <div className="mt-[0.35rem] font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--color-terracotta-ink)]">
          {shownError}
        </div>
      )}

      <DocumentActionGroup
        surfaceKey="schedule"
        regionKey="milestone-composer"
        className="mt-[0.6rem]"
      >
        <DocumentAction
          actionKey="add-milestone"
          variant="primary"
          onClick={submit}
          disabled={busy}
          loading={busy}
          loadingLabel="Adding…"
        >
          Add milestone
        </DocumentAction>
        <DocumentAction
          actionKey="cancel-add-milestone"
          variant="tertiary"
          onClick={onCancel}
        >
          Cancel
        </DocumentAction>
      </DocumentActionGroup>
    </div>
  );
}
