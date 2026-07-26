'use client';

/**
 * Phase timeline (Field Coordination Wave 5 — the light-PM slice). A horizontal
 * band across the top of the project document: the project's phases as segments
 * spanning start_date → target_end_date (00066 columns), status-tinted, with a
 * today line. Phases without dates ride as compact "unplaced" chips. Clicking a
 * segment or chip opens a small date editor that writes start_date /
 * target_end_date straight back (useUpdateProjectPhaseDates).
 *
 * Not a Gantt clone, not a PM dashboard — one glance at where the work sits in
 * time, editable in place. Zero shadows (D4); typography-first.
 */

import { useMemo, useState } from 'react';
import { useProjectPhases, useUpdateProjectPhaseDates } from '@patina/supabase';
import { getPhaseLabel } from '@patina/types';
import { fmtDay } from '@/lib/document/format';
import { DocumentAction, DocumentActionRow } from './document-action';

interface PhaseRow {
  id: string;
  name: string;
  phase_key: string | null;
  status: string;
  start_date: string | null;
  target_end_date: string | null;
  sort_order: number;
}

const DAY_MS = 86_400_000;

/** Parse a bare YYYY-MM-DD as LOCAL midnight (never slips a day, per format.ts). */
function parseDate(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00` : iso);
  const t = d.getTime();
  return Number.isNaN(t) ? null : t;
}

/** Status → segment fill + ink (the doc's existing status color conventions). */
function phaseColor(status: string): {
  fill: string;
  ink: string;
  muted: boolean;
} {
  switch (status) {
    case 'completed':
      return { fill: 'var(--color-sage)', ink: '#fff', muted: false };
    case 'in_progress':
    case 'active':
      return { fill: 'var(--color-clay)', ink: '#fff', muted: false };
    case 'delayed':
      return { fill: 'var(--color-terracotta)', ink: '#fff', muted: false };
    default: // pending / unknown
      return {
        fill: 'var(--color-pearl)',
        ink: 'var(--color-charcoal)',
        muted: true,
      };
  }
}

function phaseLabel(p: PhaseRow): string {
  return p.phase_key ? getPhaseLabel(p.phase_key, 'designer') : p.name;
}

export function PhaseTimeline({ projectId }: { projectId: string }) {
  const { data: phasesRaw } = useProjectPhases(projectId);
  const updateDates = useUpdateProjectPhaseDates();
  const [editId, setEditId] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState('');
  const [draftEnd, setDraftEnd] = useState('');

  const phases = useMemo(
    () =>
      [...((phasesRaw ?? []) as PhaseRow[])].sort(
        (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0),
      ),
    [phasesRaw],
  );

  const { dated, unplaced, windowStart, span } = useMemo(() => {
    const withDates = phases.filter(
      (p) => parseDate(p.start_date) && parseDate(p.target_end_date),
    );
    const without = phases.filter(
      (p) => !(parseDate(p.start_date) && parseDate(p.target_end_date)),
    );
    if (withDates.length === 0) {
      return { dated: [], unplaced: without, windowStart: 0, span: 0 };
    }
    const starts = withDates.map((p) => parseDate(p.start_date)!);
    const ends = withDates.map((p) => parseDate(p.target_end_date)!);
    const today = Date.now();
    // Extend the window to include today so the today line is always visible.
    let lo = Math.min(...starts, today);
    let hi = Math.max(...ends, today);
    // Pad ~4% each side so end-caps aren't flush to the frame.
    const pad = Math.max((hi - lo) * 0.04, DAY_MS);
    lo -= pad;
    hi += pad;
    return {
      dated: withDates,
      unplaced: without,
      windowStart: lo,
      span: hi - lo || 1,
    };
  }, [phases]);

  const openEditor = (p: PhaseRow) => {
    setEditId(p.id);
    setDraftStart(p.start_date ?? '');
    setDraftEnd(p.target_end_date ?? '');
  };

  const saveEditor = () => {
    if (!editId) return;
    updateDates.mutate(
      {
        phaseId: editId,
        projectId,
        startDate: draftStart || null,
        targetEndDate: draftEnd || null,
      },
      { onSuccess: () => setEditId(null) },
    );
  };

  const clearEditor = () => {
    if (!editId) return;
    updateDates.mutate(
      { phaseId: editId, projectId, startDate: null, targetEndDate: null },
      { onSuccess: () => setEditId(null) },
    );
  };

  if (phases.length === 0) return null;

  const todayPct =
    span > 0
      ? Math.min(100, Math.max(0, ((Date.now() - windowStart) / span) * 100))
      : null;
  const editing = editId ? (phases.find((p) => p.id === editId) ?? null) : null;

  return (
    <section aria-label="Phase timeline" className="mb-6 mt-2">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-mono text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
          The schedule
        </h3>
        <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
          tap a phase to set dates
        </span>
      </div>

      {/* The band — dated phases as positioned segments over a shared track. */}
      {dated.length > 0 ? (
        <div className="relative h-9 w-full rounded-[6px] border border-[var(--color-pearl)] bg-[rgba(250,247,242,0.6)]">
          {dated.map((p) => {
            const start = parseDate(p.start_date)!;
            const end = parseDate(p.target_end_date)!;
            const left = ((start - windowStart) / span) * 100;
            const width = Math.max(((end - start) / span) * 100, 3);
            const { fill, ink, muted } = phaseColor(p.status);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => openEditor(p)}
                title={`${phaseLabel(p)} · ${p.start_date ? fmtDay(p.start_date) : '—'} – ${p.target_end_date ? fmtDay(p.target_end_date) : '—'}`}
                className={`absolute top-[3px] flex h-[calc(100%-6px)] items-center overflow-hidden rounded-[4px] px-2 text-left transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                  editId === p.id
                    ? 'outline outline-[1.5px] outline-offset-[1px] outline-[var(--color-clay)]'
                    : ''
                } ${muted ? 'border border-dashed border-[var(--color-aged-oak)]' : ''}`}
                style={{
                  left: `${left}%`,
                  width: `${width}%`,
                  background: fill,
                }}
              >
                <span
                  className="truncate font-mono text-[8.5px] font-semibold uppercase tracking-[0.04em]"
                  style={{ color: ink }}
                >
                  {phaseLabel(p)}
                </span>
              </button>
            );
          })}

          {/* Today line */}
          {todayPct != null && (
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-0 z-[1] w-px bg-[var(--color-charcoal)]"
              style={{ left: `${todayPct}%` }}
            >
              <span className="absolute -top-[1px] left-[1px] font-mono text-[7px] uppercase tracking-[0.06em] text-[var(--color-charcoal)]">
                today
              </span>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-[6px] border border-dashed border-[var(--color-pearl)] px-3 py-2.5 text-[11px] italic text-[var(--text-muted)]">
          No phase dates set yet — tap a phase below to schedule it.
        </p>
      )}

      {/* Unplaced phases — no dates yet — as compact chips. */}
      {unplaced.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)]">
            Unplaced
          </span>
          {unplaced.map((p) => {
            const { muted } = phaseColor(p.status);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => openEditor(p)}
                className={`min-h-11 min-w-11 rounded-[4px] border px-2 py-1 font-mono text-[8.5px] uppercase tracking-[0.04em] transition-colors hover:border-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)] ${
                  editId === p.id
                    ? 'border-[var(--color-clay)] text-[var(--color-clay)]'
                    : 'border-[var(--color-pearl)] text-[var(--color-aged-oak)]'
                } ${muted ? '' : 'bg-[rgba(196,165,123,0.06)]'}`}
              >
                {phaseLabel(p)}
              </button>
            );
          })}
        </div>
      )}

      {/* The date editor for the selected phase (the "popover"). */}
      {editing && (
        <div className="mt-2.5 rounded-[7px] border border-[var(--color-pearl)] bg-white px-3 py-2.5">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-[12px] font-medium text-[var(--color-charcoal)]">
              {phaseLabel(editing)}
            </span>
            <button
              type="button"
              onClick={() => setEditId(null)}
              className="min-h-11 min-w-11 font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--text-muted)] hover:text-[var(--color-clay)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]"
            >
              Close
            </button>
          </div>
          <DocumentActionRow
            surfaceKey="open-document"
            regionKey="phase-dates"
            className="items-end"
            aria-label="Phase date actions"
          >
            <label className="flex flex-col gap-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
              Starts
              <input
                type="date"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                aria-label="Phase start date"
                className="rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 py-1 text-[11px] normal-case tracking-normal text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-0.5 font-mono text-[8px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
              Target end
              <input
                type="date"
                value={draftEnd}
                min={draftStart || undefined}
                onChange={(e) => setDraftEnd(e.target.value)}
                aria-label="Phase target end date"
                className="rounded-[4px] border border-[var(--color-pearl)] bg-white px-2 py-1 text-[11px] normal-case tracking-normal text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
              />
            </label>
            <DocumentAction
              actionKey="save-phase-dates"
              variant="primary"
              onClick={saveEditor}
              loading={updateDates.isPending}
              loadingLabel="Saving…"
            >
              Save
            </DocumentAction>
            {(editing.start_date || editing.target_end_date) && (
              <DocumentAction
                actionKey="clear-phase-dates"
                variant="tertiary"
                onClick={clearEditor}
                disabled={updateDates.isPending}
                className="text-[var(--color-terracotta)] decoration-[var(--color-terracotta)]"
              >
                Clear
              </DocumentAction>
            )}
          </DocumentActionRow>
          {updateDates.isError && (
            <p className="mt-1.5 text-[10px] text-[var(--color-terracotta)]">
              Couldn’t save — try again.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
