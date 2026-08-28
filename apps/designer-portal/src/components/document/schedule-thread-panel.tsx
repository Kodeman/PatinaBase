'use client';

/**
 * ScheduleThreadPanel — the Schedule Thread (Date Instruments, lane D2). A
 * work-block date chip's `footerExtra` link swaps its FolioPopover's content
 * into this panel instead of closing it: "place it in the schedule," not
 * "pick a day." `onBack` swaps it back to the Folio calendar view; the
 * popover itself (Esc/outside-click/focus-return) stays owned by the caller.
 *
 * Reads `useResolvedSchedule` + `useInstallWindow` itself (both React-Query
 * deduped — mounting this beside the Rule/Spine never re-fetches). All
 * placement math is the pure `schedule-thread.ts` (`@patina/utils`
 * underneath it); this component only wires selection state to that math and
 * paints the result — no date arithmetic lives here. Self-contained: it
 * shares no component with schedule-rule.tsx (the mini strip below is a
 * handful of plain divs sized by percentage, not the Rule's scaled canvas).
 */

import { useMemo, useState } from 'react';
import { useInstallWindow, useResolvedSchedule } from '@patina/supabase';
import { epochDayFromISO } from '@patina/utils';
import {
  computeThreadPlacement,
  deriveThreadAnchors,
  threadConsequence,
  type ThreadAnchor,
  type ThreadMilestone,
  type ThreadPhase,
} from '@/lib/document/schedule-thread';
import { fmtDay } from '@/lib/document/format';
import { DocumentAction } from './document-action';
import { SectionLoadingLine } from './section-loading-line';

export interface ScheduleThreadPanelProps {
  projectId: string;
  /** Injected clock, 'YYYY-MM-DD' — the caller's, never read here. */
  today: string;
  /** Fires ONLY on SET, with the computed placement. */
  onSet: (placement: { startsOn: string; dueDate: string }) => void;
  /** Quiet BACK link — returns the popover to the calendar view. */
  onBack: () => void;
}

const MIN_BY = 0;
const MIN_LASTS = 1;

/** A bordered-square −/+ stepper, floored at `min`. */
function Stepper({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (next: number) => void;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className="flex h-[18px] w-[18px] items-center justify-center rounded-[2px] border border-[var(--color-pearl)] font-mono text-[11px] leading-none text-[var(--color-mocha)] hover:border-[var(--color-clay)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        −
      </button>
      <span className="w-5 text-center font-mono text-[11px] text-[var(--color-charcoal)]">{value}</span>
      <button
        type="button"
        aria-label={`Increase ${label}`}
        onClick={() => onChange(value + 1)}
        className="flex h-[18px] w-[18px] items-center justify-center rounded-[2px] border border-[var(--color-pearl)] font-mono text-[11px] leading-none text-[var(--color-mocha)] hover:border-[var(--color-clay)]"
      >
        +
      </button>
    </span>
  );
}

/**
 * The proportional mini strip — main-lane phase bands as light clay washes
 * (DM Mono name labels), a terracotta today tick, and the live placement (if
 * any) as a stronger clay band. Pure divs positioned by percentage across
 * `[min, max]` epoch day of everything being drawn — no canvas, no scale
 * abstraction shared with the Rule.
 */
function MiniStrip({
  phases,
  today,
  placement,
}: {
  phases: ThreadPhase[];
  today: string;
  placement: { startsOn: string; dueDate: string } | null;
}) {
  const mainPhases = phases.filter(
    (p): p is ThreadPhase & { start: string; end: string } => p.lane === 'main' && p.start != null && p.end != null,
  );

  const dates = [
    ...mainPhases.flatMap((p) => [p.start, p.end]),
    today,
    ...(placement ? [placement.startsOn, placement.dueDate] : []),
  ];
  const epochs = dates.map((d) => epochDayFromISO(d)).filter((e): e is number => e != null);
  if (epochs.length === 0) return null;

  const minEpoch = Math.min(...epochs);
  const maxEpoch = Math.max(...epochs);
  const span = Math.max(1, maxEpoch - minEpoch);
  const pct = (iso: string) => {
    const e = epochDayFromISO(iso);
    if (e == null) return 0;
    return Math.min(100, Math.max(0, ((e - minEpoch) / span) * 100));
  };

  return (
    <div
      aria-hidden
      className="relative mt-2 h-[24px] w-full overflow-hidden rounded-[2px] border border-[var(--color-pearl)] bg-[rgba(252,250,246,0.6)]"
    >
      {mainPhases.map((p) => {
        const left = pct(p.start);
        const width = Math.max(pct(p.end) - left, 1.5);
        return (
          <div
            key={p.id}
            className="absolute top-0 h-full overflow-hidden bg-[rgba(196,165,123,0.14)]"
            style={{ left: `${left}%`, width: `${width}%` }}
          >
            <span className="block truncate px-1 pt-[3px] font-mono text-[11px] uppercase leading-none tracking-[0.06em] text-[var(--color-aged-oak)]">
              {p.name}
            </span>
          </div>
        );
      })}

      {placement && (
        <div
          className="absolute top-0 h-full bg-[rgba(196,165,123,0.55)]"
          style={{
            left: `${pct(placement.startsOn)}%`,
            width: `${Math.max(pct(placement.dueDate) - pct(placement.startsOn), 1.5)}%`,
          }}
        />
      )}

      <div
        className="absolute top-0 h-full w-px bg-[var(--color-terracotta)]"
        style={{ left: `${pct(today)}%` }}
      />
    </div>
  );
}

/** Where the "· leaves N…" / "· after install begins" clause starts, or -1. */
function clauseStart(consequence: string): number {
  const leaves = consequence.indexOf(' · leaves ');
  if (leaves !== -1) return leaves;
  return consequence.indexOf(' · after install begins');
}

export function ScheduleThreadPanel({ projectId, today, onSet, onBack }: ScheduleThreadPanelProps) {
  const schedule = useResolvedSchedule(projectId);
  const installWindowQuery = useInstallWindow(projectId);

  const threadResolved = useMemo(() => {
    if (!schedule.resolved) return null;
    const phaseNameById = new Map(schedule.phases.map((p) => [p.id, p.name]));
    const milestoneNameById = new Map(schedule.milestones.map((m) => [m.id, m.name]));
    const phases: ThreadPhase[] = schedule.resolved.phases.map((rp) => ({
      ...rp,
      name: phaseNameById.get(rp.id) ?? '',
    }));
    const milestones: ThreadMilestone[] = schedule.resolved.milestones.map((rm) => ({
      ...rm,
      name: milestoneNameById.get(rm.id) ?? '',
    }));
    return { phases, milestones };
  }, [schedule.resolved, schedule.phases, schedule.milestones]);

  const installWindow = useMemo(
    () => (installWindowQuery.data ? { starts_on: installWindowQuery.data.starts_on } : null),
    [installWindowQuery.data],
  );

  const anchors = useMemo<ThreadAnchor[]>(
    () => (threadResolved ? deriveThreadAnchors(threadResolved, installWindow, today) : []),
    [threadResolved, installWindow, today],
  );

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [byWorkdays, setByWorkdays] = useState(MIN_BY);
  const [lastsWorkdays, setLastsWorkdays] = useState(MIN_LASTS);

  // Prefer the caller's own pick; otherwise Today (the natural default
  // anchor) when it's on the list, otherwise whatever sorted first.
  const selectedAnchor =
    anchors.find((a) => a.key === selectedKey) ??
    anchors.find((a) => a.key === 'today') ??
    anchors[0] ??
    null;

  // by 0 from a weekend anchor rolls to the next workday; the consequence
  // line is the disclosure.
  const placement = useMemo(
    () => (selectedAnchor ? computeThreadPlacement(selectedAnchor.date, byWorkdays, lastsWorkdays) : null),
    [selectedAnchor, byWorkdays, lastsWorkdays],
  );

  const installStart = installWindow?.starts_on ?? null;
  const consequence = threadConsequence(placement, installStart, today);
  const isLoading = schedule.isLoading || installWindowQuery.isLoading;
  const isError = schedule.isError || installWindowQuery.isError;

  if (isLoading) {
    return (
      <div className="w-[420px] max-w-full p-4">
        <SectionLoadingLine label="Reading the schedule" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="w-[420px] max-w-full p-4">
        <p role="alert" className="mb-2 text-[11.5px] text-[var(--color-terracotta-ink)]">
          The schedule could not be read.
        </p>
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-clay-ink)]"
        >
          Back
        </button>
      </div>
    );
  }

  const idx = clauseStart(consequence);
  const consequenceMain = idx === -1 ? consequence : consequence.slice(0, idx);
  const consequenceTail = idx === -1 ? '' : consequence.slice(idx);

  return (
    <div className="w-[420px] max-w-full p-4 pb-[14px]">
      <p className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-aged-oak)]">
        Where does this work belong?
      </p>

      {/* `deriveThreadAnchors` always contributes Today (given a parseable
          `today`), so this list is never truly empty in practice — a
          schedule with nothing else resolved still offers Today as a place
          to anchor against, so no separate "no schedule" branch is needed. */}
      <div
        role="group"
        aria-label="Anchor"
        className="mb-3 flex max-h-[132px] flex-col gap-[3px] overflow-y-auto pr-1"
      >
        {anchors.map((a) => {
          const on = selectedAnchor?.key === a.key;
          return (
            <button
              key={a.key}
              type="button"
              aria-pressed={on}
              onClick={() => setSelectedKey(a.key)}
              className={`flex items-center justify-between gap-2 rounded-[2px] border px-2 py-1 text-left font-mono text-[11px] uppercase tracking-[0.05em] ${
                on
                  ? 'border-[var(--color-clay)] bg-[rgba(196,165,123,0.12)] text-[var(--color-charcoal)]'
                  : 'border-[var(--color-pearl)] text-[var(--color-aged-oak)] hover:border-[var(--color-clay)]'
              }`}
            >
              <span className="truncate normal-case tracking-normal">{a.label}</span>
              <span className="shrink-0">{fmtDay(a.date)}</span>
            </button>
          );
        })}
      </div>

      <p className="mb-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 font-mono text-[11px] uppercase tracking-[0.05em] text-[var(--color-mocha)]">
        <span>After</span>
        <span className="normal-case italic text-[var(--color-charcoal)]">{selectedAnchor?.label ?? '—'}</span>
        <span>by</span>
        <Stepper label="workdays after anchor" value={byWorkdays} min={MIN_BY} onChange={setByWorkdays} />
        <span>workdays</span>
        <span className="text-[var(--color-pearl)]">·</span>
        <span>lasts</span>
        <Stepper
          label="workdays the task lasts"
          value={lastsWorkdays}
          min={MIN_LASTS}
          onChange={setLastsWorkdays}
        />
        <span>workdays</span>
      </p>

      <MiniStrip phases={threadResolved?.phases ?? []} today={today} placement={placement} />

      <p className="mb-3 mt-2.5 leading-snug">
        <span className="font-[family-name:var(--font-display)] text-[15px] text-[var(--color-charcoal)]">
          {consequenceMain || '—'}
        </span>
        {consequenceTail && <span className="text-[11px] text-[var(--text-muted)]">{consequenceTail}</span>}
      </p>

      <div className="flex items-center justify-between gap-3 border-t border-[var(--color-pearl)] pt-[13px]">
        <button
          type="button"
          onClick={onBack}
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--color-aged-oak)] underline decoration-dotted underline-offset-2 hover:text-[var(--color-clay-ink)]"
        >
          Back
        </button>
        <DocumentAction
          actionKey="set-schedule-thread-placement"
          surfaceKey="open-document"
          regionKey="schedule-thread"
          variant="primary"
          disabled={placement == null}
          onClick={() => {
            if (placement != null) onSet(placement);
          }}
        >
          Set
        </DocumentAction>
      </div>
    </div>
  );
}
