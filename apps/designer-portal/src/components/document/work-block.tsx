'use client';

/**
 * The Work (R23) — the quiet block each active section carries: deliverables
 * as checkable lines in the paper's grammar (a square tick that fills sage —
 * a stamp, not a SaaS checkbox), ≤5-second capture, optional due dates, and
 * the gate line: an approval gate IS a client decision. Declined from scope:
 * kanban, assignees, priority flags.
 */

import { useMemo, useRef, useState } from 'react';
import {
  gateState,
  useCreateSectionTask,
  useSectionGates,
  useSectionLoggedMinutes,
  useSectionTasks,
} from '@/hooks/use-section-work';
import type { SectionKey } from '@/lib/document/desk-derivation';
import { fmtDay, todayYmd } from '@/lib/document/format';
import { useToggleSectionTask } from '@/hooks/use-section-work';
import { Stamp } from './stamp';
import {
  DocumentAction,
  DocumentActionRow,
} from './document-action';
import { GuidedEmptyState } from './guided-empty-state';
import { SectionLoadingLine } from './section-loading-line';
import { FolioPopover, FolioCalendar, type FolioSelection } from './date';
import { ScheduleThreadPanel } from './schedule-thread-panel';

// The gate's Golden-Hour stamp (HTML §1 .stamp.st-gh) — a gate IS a decision,
// and the section's closing line wears the stamp the client will grant.
const GATE_STAMP = {
  label: 'Gate',
  color: 'var(--color-golden-hour)',
  ink: 'var(--color-golden-hour-ink)',
} as const;
// The .gate row treatment: a faint golden wash over a golden top rule.
const GATE_ROW =
  'flex items-center gap-2.5 border-t border-[rgba(207,174,52,0.35)] bg-[rgba(232,197,71,0.06)] px-3 py-2';

const fmtHours = (minutes: number) => {
  const h = minutes / 60;
  return Number.isInteger(h) ? `${h}h` : `${h.toFixed(1)}h`;
};

/** The capture chip's compact span label: "Aug 25 – 28" when both ends share
 *  a month, "Jul 30 – Aug 3" (both months spelled out) when they don't. */
function chipSpanLabel(start: string, end: string) {
  const startLabel = fmtDay(start);
  const endLabel = fmtDay(end);
  const startMonth = startLabel.split(' ')[0];
  const endMonth = endLabel.split(' ')[0];
  return startMonth === endMonth ? `${startLabel} – ${endLabel.split(' ')[1]}` : `${startLabel} – ${endLabel}`;
}

/**
 * The single choke point every `setWhen` call routes a fresh commit through
 * (the calendar's own onCommit, the Thread's onSet): a span whose start and
 * end land on the same day is really a day pick, not a one-day-wide window —
 * clicking the same grid cell twice in span mode, or a Thread placement with
 * lasts=1, both produce {kind:'span', start===end} otherwise. Collapsing it
 * HERE, before it ever reaches `when` state, means every consumer of `when`
 * (the chip label, save()'s dueDate/startsOn split) sees the day shape and
 * never has to re-check the same-day case itself.
 */
function normalizeWhen(selection: FolioSelection): FolioSelection {
  return selection.kind === 'span' && selection.start === selection.end
    ? { kind: 'day', date: selection.start }
    : selection;
}

export function WorkBlock({
  projectId,
  sectionKey,
  sectionLabel,
  clientName,
}: {
  projectId: string;
  sectionKey: SectionKey;
  sectionLabel: string;
  clientUserId: string | null;
  clientName: string;
}) {
  const tasksQuery = useSectionTasks(projectId);
  const gatesQuery = useSectionGates(projectId);
  const tasks = tasksQuery.data;
  const gates = gatesQuery.data;
  const { data: loggedMinutes } = useSectionLoggedMinutes(
    projectId,
    sectionKey,
  );
  const createTask = useCreateSectionTask(projectId);
  const toggleTask = useToggleSectionTask(projectId);

  const [capturing, setCapturing] = useState(false);
  const [title, setTitle] = useState('');
  const [when, setWhen] = useState<FolioSelection | null>(null);
  const [estimateH, setEstimateH] = useState('');
  const [folioOpen, setFolioOpen] = useState(false);
  const [folioMode, setFolioMode] = useState<'calendar' | 'thread'>('calendar');
  const dateChipRef = useRef<HTMLButtonElement>(null);

  const sectionTasks = useMemo(
    () => (tasks ?? []).filter((t) => t.section_key === sectionKey),
    [tasks, sectionKey],
  );
  const gate = useMemo(
    () => (gates ?? []).find((g) => g.section_key === sectionKey) ?? null,
    [gates, sectionKey],
  );

  const estTotal = sectionTasks.reduce(
    (s, t) => s + (t.estimate_minutes ?? 0),
    0,
  );
  const total = sectionTasks.length;
  const doneCount = sectionTasks.filter((t) => t.status === 'done').length;

  const save = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const estMin = estimateH ? Math.round(parseFloat(estimateH) * 60) : null;
    // due_date stays the ONE "when it's needed" source (overdue logic, Desk
    // derivation) whichever shape the Folio commits: a day sets it alone, a
    // span sets it to the window's END and starts_on to the window's START.
    const dates =
      when == null
        ? { dueDate: null, startsOn: null }
        : when.kind === 'day'
          ? { dueDate: when.date, startsOn: null }
          : { dueDate: when.end, startsOn: when.start };
    createTask.mutate({
      title: trimmed,
      sectionKey,
      dueDate: dates.dueDate,
      startsOn: dates.startsOn,
      estimateMinutes: estMin && estMin > 0 ? estMin : null,
    });
    setTitle('');
    setWhen(null);
    setEstimateH('');
    setCapturing(false);
    setFolioOpen(false);
    setFolioMode('calendar');
  };

  // "Aug 20" for a day, "Aug 25 – 28" for a span — the chip's own footprint,
  // never the Folio's fuller weekday readout (that lives inside the panel).
  const whenLabel =
    when == null ? null : when.kind === 'day' ? fmtDay(when.date) : chipSpanLabel(when.start, when.end);

  if (tasksQuery.isLoading || gatesQuery.isLoading) {
    return <SectionLoadingLine label="Reading the work" className="mb-1 mt-4" />;
  }

  if (tasksQuery.isError || gatesQuery.isError) {
    return (
      <div className="mb-1 mt-4 border-y border-[var(--color-pearl)] py-3">
        <p role="alert" className="text-[11.5px] text-[var(--color-terracotta-ink)]">
          The work could not be read.
        </p>
        <DocumentAction
          actionKey="retry-section-work"
          surfaceKey="open-document"
          regionKey={`${sectionKey}-work-error`}
          variant="secondary"
          onClick={() => void Promise.all([tasksQuery.refetch(), gatesQuery.refetch()])}
        >
          Try again
        </DocumentAction>
      </div>
    );
  }

  if (sectionTasks.length === 0 && !gate && !capturing) {
    return (
      <GuidedEmptyState
        className="mb-1 mt-4"
        title={`Plan the ${sectionLabel.toLowerCase()} work`}
        description="List the concrete work here so the next action and due date stay visible in the document."
        inputs={['Task', 'Optional due date', 'Optional estimate']}
        action={{ key: 'add-task', label: 'Add the first task', onClick: () => setCapturing(true) }}
      />
    );
  }

  return (
    <div id="document-task-controls" tabIndex={-1} className="mb-2 mt-4 rounded-[6px] border border-[var(--color-pearl)] bg-[rgba(252,250,246,0.7)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]">
      <div className="flex items-baseline justify-between border-b border-[var(--color-pearl)] px-3 py-1.5">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--text-muted)]">
          The work{total > 0 ? ` · ${doneCount} of ${total}` : ''}
        </span>
        {estTotal > 0 && (
          <span className="font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
            {fmtHours(loggedMinutes ?? 0)} of {fmtHours(estTotal)} est.
          </span>
        )}
      </div>

      <ul className="px-1.5">
        {sectionTasks.map((t) => {
          const done = t.status === 'done';
          const overdue = !done && t.due_date && t.due_date <= todayYmd();
          return (
            <li
              key={t.id}
              className="border-b border-dashed border-[var(--color-pearl)]"
            >
              <button
                type="button"
                onClick={() => toggleTask.mutate(t)}
                className="grid w-full grid-cols-[auto_1fr_auto] items-baseline gap-2.5 px-1 py-1.5 text-left hover:bg-[rgba(196,165,123,0.04)]"
              >
                {/* The tick is a stamp, not a SaaS checkbox: sage-wash fill
                    + a sage ✓ when done (HTML §1 .tick.done). */}
                <span
                  aria-hidden
                  className="relative top-px inline-flex h-[13px] w-[13px] items-center justify-center rounded-[3px] border-[1.5px] text-[8px] font-bold leading-none"
                  style={{
                    borderColor: done
                      ? 'var(--color-sage)'
                      : 'var(--doc-ink-border)',
                    background: done ? 'rgba(168,181,160,0.15)' : 'transparent',
                    color: 'var(--color-sage)',
                  }}
                >
                  {done ? '✓' : ''}
                </span>
                <span
                  className={`text-[12px] leading-snug ${
                    done
                      ? 'text-[var(--text-muted)]'
                      : 'text-[var(--color-charcoal)]'
                  }`}
                >
                  {t.title}
                </span>
                <span
                  className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.05em]"
                  style={{ color: overdue ? 'var(--color-terracotta-ink)' : 'var(--text-muted)' }}
                >
                  {done
                    ? t.completed_at
                      ? `done · ${fmtDay(t.completed_at)}`
                      : 'done'
                    : t.starts_on && t.due_date
                      ? `due ${fmtDay(t.starts_on)} – ${fmtDay(t.due_date)}`
                      : t.due_date
                        ? `due ${fmtDay(t.due_date)}`
                        : ''}
                  {!done && t.estimate_minutes
                    ? ` · ${fmtHours(t.estimate_minutes)}`
                    : ''}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {capturing ? (
        <div
          className="flex items-center gap-2 border-b border-dashed border-[var(--color-pearl)] px-1 py-1.5"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setCapturing(false);
            }
            if (e.key === 'Enter') save();
          }}
        >
          <span
            aria-hidden
            className="inline-block h-[11px] w-[11px] border border-dashed"
            style={{ borderColor: 'var(--doc-ink-border)' }}
          />
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What needs doing"
            className="min-w-0 flex-1 bg-transparent text-[12px] text-[var(--color-charcoal)] outline-none placeholder:italic placeholder:text-[var(--text-muted)]"
          />
          <span className="relative inline-block shrink-0">
            <button
              type="button"
              ref={dateChipRef}
              onClick={() => {
                setFolioMode('calendar');
                setFolioOpen((open) => !open);
              }}
              aria-haspopup="dialog"
              aria-expanded={folioOpen}
              aria-label="Due date"
              className={`whitespace-nowrap bg-transparent font-mono text-[11px] outline-none ${
                whenLabel ? 'text-[var(--text-muted)]' : 'italic text-[var(--text-muted)]'
              }`}
            >
              {whenLabel ?? 'date'}
            </button>

            {folioOpen && (
              // Contains its own Enter presses (day picks, the SET button)
              // so they never bubble to the row's onKeyDown and submit the
              // task mid-pick — Escape is unaffected, FolioPopover already
              // eats that at the document capture phase before it gets here.
              <span onKeyDown={(e) => e.key === 'Enter' && e.stopPropagation()}>
                <FolioPopover
                  aria-label="Set date"
                  align="end"
                  onClose={() => setFolioOpen(false)}
                  returnFocusRef={dateChipRef}
                >
                  {folioMode === 'calendar' ? (
                    <FolioCalendar
                      value={when}
                      today={todayYmd()}
                      modes={['day', 'span']}
                      onCommit={(selection) => {
                        setWhen(normalizeWhen(selection));
                        setFolioOpen(false);
                      }}
                      footerExtra={
                        <button
                          type="button"
                          onClick={() => setFolioMode('thread')}
                          className="mt-1 block font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-clay-ink)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-aged-oak)]"
                        >
                          Place it in the schedule
                        </button>
                      }
                    />
                  ) : (
                    <ScheduleThreadPanel
                      projectId={projectId}
                      today={todayYmd()}
                      onSet={(placement) => {
                        setWhen(
                          normalizeWhen({ kind: 'span', start: placement.startsOn, end: placement.dueDate }),
                        );
                        setFolioOpen(false);
                        setFolioMode('calendar');
                      }}
                      onBack={() => setFolioMode('calendar')}
                    />
                  )}
                </FolioPopover>
              </span>
            )}
          </span>
          <input
            value={estimateH}
            onChange={(e) =>
              setEstimateH(e.target.value.replace(/[^0-9.]/g, ''))
            }
            placeholder="est h"
            aria-label="Estimate (hours)"
            className="w-10 bg-transparent text-right font-mono text-[11px] text-[var(--text-muted)] outline-none placeholder:text-[var(--text-muted)]"
          />
          <DocumentAction
            actionKey="create-task"
            surfaceKey="open-document"
            regionKey={`${sectionKey}-task-capture`}
            variant="primary"
            onClick={save}
            disabled={!title.trim()}
          >
            Add
          </DocumentAction>
        </div>
      ) : (
        <DocumentActionRow
          surfaceKey="open-document"
          regionKey={`${sectionKey}-work-actions`}
          className="px-1 py-1.5"
          aria-label={`${sectionLabel} work actions`}
        >
          <DocumentAction
            actionKey="add-task"
            variant="secondary"
            onClick={() => setCapturing(true)}
          >
            + Task
          </DocumentAction>
        </DocumentActionRow>
      )}

      {gate && (
        <div className={GATE_ROW}>
          <Stamp
            label={GATE_STAMP.label}
            color={GATE_STAMP.color}
            ink={GATE_STAMP.ink}
          />
          {gateState(gate) === 'requested' && (
            <span className="text-[11px] italic text-[var(--text-muted)]">
              {sectionLabel} sign-off requested · awaiting {clientName}
              {gate.due_date ? ` · due ${fmtDay(gate.due_date)}` : ''}
            </span>
          )}
          {gateState(gate) === 'declined' && (
            <>
              <span className="text-[11px] italic" style={{ color: 'var(--color-terracotta-ink)' }}>
                Changes requested
                {gate.options.find((o) => o.selected)?.client_note
                  ? ` — “${gate.options.find((o) => o.selected)?.client_note}”`
                  : ''}
              </span>
            </>
          )}
          {gateState(gate) === 'approved' && (
            <span className="text-[11px] italic text-[var(--text-muted)]">
              {sectionLabel} approved by {clientName}
              {gate.responded_at ? ` · ${fmtDay(gate.responded_at)}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
