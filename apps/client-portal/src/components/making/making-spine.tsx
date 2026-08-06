'use client';

import { createContext, useContext } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import {
  PHASE_DISPLAY_CONFIG,
  getPhaseLabel,
  getPhaseSlugFromLabel,
  normalizePhaseSlug,
  type PhaseSlug,
} from '@patina/types';

import type { MilestoneDetail } from '@/types/project';

/* ── The Spine ───────────────────────────────────────────────────────────────
   One vertical rule runs from the first meeting to installation day, and the
   whole engagement is drawn on it. Closed chapters compress to a dated mono
   line apiece (a receipt). Today opens the current phase's segment — three
   times the ink, the way the deck draws it. The open chapter (gates, tolls,
   tracking rows) is handed in as `children` and sits between the marker and
   the future. What is still ahead is sketched: the same rule, dashed.

   This file owns the frame, not the contents. It is presentational: server-
   fetched `milestones` in, JSX out, no fetching of its own. Integration wires
   the hooks and passes the open chapter down.

   Grace under thin data is the point — the surface renders for ANY real
   project, not just rich ones. No completed phases and the spine simply
   starts at the marker; nothing scheduled ahead and it ends after the open
   chapter; no target end date and the horizon foot is silent. There is never
   an empty-state card, because a card would be a second thing to read.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The only lane signal that survives into `MilestoneDetail`: phases on the
 * `thread` lane are tagged, main-lane phases carry `tags: []`. Concurrent
 * workstreams are their own story and stay off the main spine.
 */
export const THREAD_LANE_TAG = 'Concurrent workstream';

/** The rule's colour when nothing in the data names a phase. */
const QUIET_INK = 'var(--border-default)';

/** The sketched future's rule: 5px of ink, 6px of paper, forever. */
const DASHED_RULE =
  'repeating-linear-gradient(180deg, currentColor 0 5px, transparent 5px 11px)';

const SHORT_DATE = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});
const SHORT_DATE_WITH_YEAR = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
});
const LONG_MONTH_DAY = new Intl.DateTimeFormat('en-US', {
  month: 'long',
  day: 'numeric',
});
const LONG_MONTH = new Intl.DateTimeFormat('en-US', { month: 'long' });

// ─── dates ───────────────────────────────────────────────────────────────────

/**
 * Parse a spine date without letting a date-only string slide a day.
 * `new Date('2026-03-12')` is UTC midnight, which prints as March 11 anywhere
 * west of Greenwich — so date-only strings are built from local components
 * instead. Returns `null` for anything unparseable; the spine then simply
 * omits the date rather than printing "Invalid Date" at a client.
 */
export function parseSpineDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const parsed = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** `MAR 12` — and the year too, once it is not this year. */
export function formatSpineDate(date: Date, today?: Date): string {
  if (today && today.getFullYear() !== date.getFullYear()) {
    return SHORT_DATE_WITH_YEAR.format(date);
  }
  return SHORT_DATE.format(date);
}

/**
 * The Monday of the week a date falls in. Targets ahead are always spoken as
 * the week they land in — "the week of October 12" — because that is the
 * promise the studio can actually keep.
 */
export function startOfWeek(date: Date): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return monday;
}

// ─── phases ──────────────────────────────────────────────────────────────────

/** One main-lane phase, resolved to its client label and its spine ink. */
export interface SpinePhase {
  id: string;
  index: number;
  slug: PhaseSlug;
  /** Discovery · Design · Design Refinement · Procurement · Installation · Completion */
  label: string;
  /**
   * The phase row's own name — `project_phases.name`, which is the STUDIO's
   * wording ("Construction Documentation", "Schematic Design").
   *
   * NEVER RENDERED ON THIS SURFACE. It is kept only because it is the fallback
   * `normalizePhaseSlug` reads when a row carries no `phase_key`. The client
   * reads client phase labels; printing this field puts AIA-practice
   * vocabulary on a homeowner's letterhead.
   */
  title: string;
  /** `var(--phase-…)`, straight from PHASE_DISPLAY_CONFIG. */
  color: string;
  status: MilestoneDetail['status'];
  startDate?: string;
  targetDate?: string;
  completionDate?: string;
  description?: string;
  checklistDone: number;
  checklistTotal: number;
}

export interface SpinePhases {
  /** Closed chapters, in phase order. */
  settled: SpinePhase[];
  /** The open chapter — the first phase that is neither closed nor upcoming. */
  current: SpinePhase | null;
  /** Everything still ahead, in phase order. */
  future: SpinePhase[];
}

function phaseInk(slug: PhaseSlug): string {
  return PHASE_DISPLAY_CONFIG[slug].color;
}

function toSpinePhase(milestone: MilestoneDetail): SpinePhase {
  // `phase` is the DB phase_key; falling back to the row's name lets
  // normalizePhaseSlug's reverse-label lookup rescue older rows.
  const slug = normalizePhaseSlug(milestone.phase ?? milestone.title);
  const checklist = milestone.checklist ?? [];
  return {
    id: milestone.id,
    index: milestone.index,
    slug,
    label: getPhaseLabel(slug, 'client'),
    title: milestone.title,
    color: phaseInk(slug),
    status: milestone.status,
    startDate: milestone.startDate,
    targetDate: milestone.targetDate,
    completionDate: milestone.completionDate,
    description: milestone.description,
    checklistDone: checklist.filter((task) => task.completed).length,
    checklistTotal: checklist.length,
  };
}

/**
 * Split the server's phases into the three parts of the spine. Only phases
 * that exist in the data are ever drawn — a project with two phases gets two
 * segments, never a ghosted six-phase armature.
 */
export function splitSpinePhases(milestones: MilestoneDetail[]): SpinePhases {
  const main = milestones
    .filter((milestone) => !(milestone.tags ?? []).includes(THREAD_LANE_TAG))
    .slice()
    .sort((a, b) => a.index - b.index)
    .map(toSpinePhase);

  const settled = main.filter((phase) => phase.status === 'completed');
  // 'attention' and 'blocked' are open chapters too — a phase that needs the
  // client is emphatically not "upcoming".
  const open = main.filter(
    (phase) =>
      phase.status === 'in_progress' ||
      phase.status === 'attention' ||
      phase.status === 'blocked',
  );
  const current = open[0] ?? null;
  const future = main.filter(
    (phase) => phase.status !== 'completed' && phase.id !== current?.id,
  );

  return { settled, current, future };
}

/**
 * A phase string resolved to a slug ONLY when it is actually recognised.
 *
 * `normalizePhaseSlug` always answers — it falls back to `'consultation'` for
 * anything it cannot place, which is the right guarantee for
 * `PHASE_DISPLAY_CONFIG[…]` lookups and the wrong one for a label a client
 * reads. `project.currentPhase` is `project_phases.name || phase_key`, so on a
 * real project it usually carries the studio's free-text name ("Construction
 * Documentation") — which normalizes to Discovery and prints a phase the house
 * left months ago. This returns `null` instead, and the surface stays mute.
 *
 * No alias in `PHASE_SLUG_ALIASES` maps to `'consultation'`, so a
 * `'consultation'` answer is trustworthy exactly when the value names that
 * phase by slug or by one of its labels.
 */
export function recognisePhaseSlug(value: string | null | undefined): PhaseSlug | null {
  const text = value?.trim();
  if (!text) return null;
  const slug = normalizePhaseSlug(text);
  if (slug !== 'consultation') return slug;
  const normalized = text.toLowerCase();
  return normalized === 'consultation' || getPhaseSlugFromLabel(normalized) === 'consultation'
    ? 'consultation'
    : null;
}

/** The open chapter's client label and ink — one resolution, two readers. */
export interface OpenChapter {
  /** The client phase label, when the data names a phase we recognise. */
  label?: string;
  /** The ink the open chapter (and the masthead's phase vital) is written in. */
  ink: string;
}

/**
 * Where the client stands, resolved once.
 *
 * The open phase ROW wins, because its `phase_key` is a real phase key. Only
 * when no row is open does `project.currentPhase` get a hearing, and then only
 * if `recognisePhaseSlug` actually recognises it — the masthead and the spine
 * marker read this same function so the two can never disagree about what
 * chapter is open.
 */
export function openChapterOf(
  phases: SpinePhases,
  currentPhase?: string | null,
): OpenChapter {
  if (phases.current) {
    return { label: phases.current.label, ink: phases.current.color };
  }
  const slug = recognisePhaseSlug(currentPhase);
  return slug
    ? { label: getPhaseLabel(slug, 'client'), ink: phaseInk(slug) }
    : { ink: QUIET_INK };
}

/** The open chapter's span, when the phase carries both ends of it. */
function phaseSpan(phase: SpinePhase): string | undefined {
  const from = parseSpineDate(phase.startDate);
  const to = parseSpineDate(phase.targetDate);
  if (!from || !to) return undefined;
  const opens = LONG_MONTH.format(from);
  const closes = LONG_MONTH.format(to);
  if (opens === closes && from.getFullYear() === to.getFullYear()) return undefined;
  return `${opens} through ${closes}`;
}

/** The first clause of a description, kept short enough to stay a one-liner. */
function firstClause(text: string | undefined, max = 88): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  const sentence = trimmed.split('. ')[0].replace(/\.$/, '').trim();
  if (!sentence) return undefined;
  return sentence.length > max
    ? `${sentence.slice(0, max - 1).trimEnd()}…`
    : sentence;
}

/**
 * What closed, in as few words as the data honestly supports: a settled
 * checklist, then the opening clause of the description. Never invented, and
 * never `phase.title` — that field is the studio's own phase naming
 * ("Schematic Design", "Construction Documentation"), and a receipt reading
 * "Design closed · Schematic Design" hands a homeowner the designer's
 * vocabulary. A receipt of just "Design closed" is the honest, compressed line
 * the deck draws.
 */
function closingDetail(phase: SpinePhase): string | undefined {
  if (phase.checklistTotal > 0 && phase.checklistDone === phase.checklistTotal) {
    return `${phase.checklistTotal} ${phase.checklistTotal === 1 ? 'step' : 'steps'} complete`;
  }
  return firstClause(phase.description);
}

// ─── receipts ────────────────────────────────────────────────────────────────

/**
 * One settled thing on the spine. Closed phases become these here; executed
 * commercial instruments become these in Integration, which passes them in as
 * `instrumentReceipts` so they land at their execution dates.
 */
export interface SpineReceiptEntry {
  id: string;
  /** ISO date this settled. */
  date?: string;
  /** The bold lead: "Discovery closed", "Furnishings authorization executed". */
  lead: string;
  /** The quiet remainder of the one-liner. */
  detail?: string;
  /** Spine ink; defaults to the pearl rule when the entry names no phase. */
  color?: string;
}

export function receiptFromPhase(phase: SpinePhase): SpineReceiptEntry {
  return {
    id: `phase:${phase.id}`,
    date: phase.completionDate,
    lead: `${phase.label} closed`,
    detail: closingDetail(phase),
    color: phase.color,
  };
}

/**
 * Order the settled block by date. An undated entry does not sink to the
 * bottom — it inherits the date of the entry before it, so a phase missing its
 * `completed_at` still sits with its neighbours instead of after the
 * instruments that were executed inside it.
 */
export function orderReceipts(entries: SpineReceiptEntry[]): SpineReceiptEntry[] {
  let carried = Number.NEGATIVE_INFINITY;
  return entries
    .map((entry, index) => {
      const at = parseSpineDate(entry.date)?.getTime();
      if (at !== undefined) carried = at;
      return { entry, index, at: at ?? carried };
    })
    .sort((a, b) => (a.at === b.at ? a.index - b.index : a.at - b.at))
    .map((row) => row.entry);
}

// ─── the ink the open chapter is written in ──────────────────────────────────

export interface SpineInk {
  /** The open phase's colour — what the open chapter's rule is drawn in. */
  color: string;
  /** The open phase's client label, when a phase is open. */
  label?: string;
  /** The open chapter's rule is heavy; the settled past is not. */
  weight: SpineRuleWeight;
}

const SpineInkContext = createContext<SpineInk>({
  color: QUIET_INK,
  weight: 'rule',
});

/**
 * The open chapter's ink, for rows composed by Integration. A gate, a toll, or
 * a tracking row placed in `children` reads this so its segment continues the
 * current phase's line without prop-drilling the colour through every layer.
 */
export function useSpineInk(): SpineInk {
  return useContext(SpineInkContext);
}

// ─── the row ─────────────────────────────────────────────────────────────────

export type SpineMarkerKind = 'node' | 'now' | 'none';
export type SpineRuleWeight = 'rule' | 'heavy';

export interface SpineRowProps {
  /** The mono date column at the left. */
  when?: ReactNode;
  /** Spine ink for this row's segment, usually `var(--phase-…)`. */
  color?: string;
  /** The node drawn on the rule at this row. */
  marker?: SpineMarkerKind;
  /** 6px of ink instead of 2px — the open chapter. */
  weight?: SpineRuleWeight;
  /** Draw the rule dashed: the sketched future. */
  dashed?: boolean;
  /** The line resumes lighter — after a gate, below the marker. */
  dim?: boolean;
  /** Begin the rule at the node: this is the spine's first row. */
  capTop?: boolean;
  /** End the rule at the node: this is the spine's last row. */
  capBottom?: boolean;
  className?: string;
  testId?: string;
  children: ReactNode;
}

/**
 * One row of the spine: date column, segment column, body. Exported because
 * the open chapter's entries are composed elsewhere and must sit on this same
 * grid — a gate or a tracking row that does not use `SpineRow` will leave a
 * gap in the line.
 */
export function SpineRow({
  when,
  color = QUIET_INK,
  marker = 'none',
  weight = 'rule',
  dashed = false,
  dim = false,
  capTop = false,
  capBottom = false,
  className = '',
  testId,
  children,
}: SpineRowProps) {
  return (
    <div
      data-testid={testId}
      className={`grid grid-cols-[62px_20px_minmax(0,1fr)] sm:grid-cols-[86px_20px_minmax(0,1fr)] ${className}`}
    >
      <div className="pr-3 pt-[13px] text-right font-mono text-[8.5px] uppercase leading-[1.35] tracking-[0.15em] text-[var(--color-quiet-ink)] sm:pr-3.5">
        {when}
      </div>
      <SpineSegment
        color={color}
        marker={marker}
        weight={weight}
        dashed={dashed}
        dim={dim}
        capTop={capTop}
        capBottom={capBottom}
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function SpineSegment({
  color,
  marker,
  weight,
  dashed,
  dim,
  capTop,
  capBottom,
}: Required<
  Pick<
    SpineRowProps,
    'color' | 'marker' | 'weight' | 'dashed' | 'dim' | 'capTop' | 'capBottom'
  >
>) {
  // Where the rule meets the node — the centre of whichever node this row draws.
  const centre = marker === 'now' ? 21 : 20;
  const ruleStyle: CSSProperties = {
    top: capTop ? centre : 0,
    bottom: capBottom ? `calc(100% - ${centre}px)` : 0,
    ...(dashed ? { backgroundImage: DASHED_RULE } : null),
  };
  // The ink and the caps are also written as data attributes: they are what a
  // test or a prod probe needs to read, and jsdom will not hand back a
  // `var(--phase-…)` colour or a `calc()` offset from the inline style.
  const cap =
    capTop && capBottom ? 'both' : capTop ? 'top' : capBottom ? 'bottom' : 'none';

  return (
    <div aria-hidden className="relative" style={{ color }} data-spine-ink={color}>
      <span
        data-spine-rule={dashed ? 'dashed' : 'solid'}
        data-spine-weight={weight}
        data-spine-cap={cap}
        className={[
          'absolute block',
          weight === 'heavy' ? 'w-[6px] -ml-[3px] left-1/2' : 'w-[2px] -ml-px left-1/2',
          dashed ? 'bg-transparent' : 'bg-current',
          dim ? 'opacity-40' : '',
        ].join(' ')}
        style={ruleStyle}
      />
      {marker === 'node' && (
        <span
          data-spine-node="node"
          className="absolute left-1/2 top-[14px] -ml-[6px] block h-3 w-3 rounded-full border-2 border-current bg-[var(--bg-primary)]"
        />
      )}
      {marker === 'now' && (
        <span
          data-spine-node="now"
          className="absolute left-1/2 top-[12px] -ml-[9px] block h-[18px] w-[18px] rounded-full border-[3px] border-current bg-[var(--bg-primary)]"
        />
      )}
    </div>
  );
}

// ─── the settled receipt ─────────────────────────────────────────────────────

export interface SpineReceiptProps extends SpineReceiptEntry {
  /** Today, for deciding whether a receipt needs its year spelled out. */
  today?: Date;
  capTop?: boolean;
  capBottom?: boolean;
}

/**
 * A closed chapter, compressed to one dated mono line. The date sits in the
 * spine's own column; the fact sits on the line.
 */
export function SpineReceipt({
  date,
  lead,
  detail,
  color,
  today,
  capTop = false,
  capBottom = false,
}: SpineReceiptProps) {
  const settledOn = parseSpineDate(date);

  return (
    <SpineRow
      testId="spine-receipt"
      color={color ?? QUIET_INK}
      marker="node"
      capTop={capTop}
      capBottom={capBottom}
      when={
        settledOn ? (
          <b className="block font-medium text-[var(--text-primary)]">
            {formatSpineDate(settledOn, today)}
          </b>
        ) : null
      }
    >
      <p className="m-0 border-b border-[var(--border-subtle)] py-[13px] pl-2 font-mono text-[10px] uppercase leading-[1.4] tracking-[0.1em] text-[var(--color-quiet-ink)]">
        <span className="font-medium text-[var(--text-primary)]">{lead}</span>
        {detail ? <span> &middot; {detail}</span> : null}
      </p>
    </SpineRow>
  );
}

// ─── you are here ────────────────────────────────────────────────────────────

export interface SpineMarkerProps {
  /** The open phase's client label. */
  label?: string;
  /** The open chapter's span, e.g. "July through September". */
  span?: string;
  color?: string;
  /** Today. Omitted during SSR and the first client paint; see useHydrated. */
  today?: Date;
  capTop?: boolean;
  capBottom?: boolean;
}

/**
 * The marker: where the client stands, stated flatly. It is the one row that
 * always renders — with no closed phases the spine simply begins here.
 */
export function SpineMarker({
  label,
  span,
  color = QUIET_INK,
  today,
  capTop = false,
  capBottom = false,
}: SpineMarkerProps) {
  const openChapter = label
    ? `${label} — the open chapter${span ? `, ${span}` : ''}.`
    : undefined;

  return (
    <SpineRow
      testId="spine-marker"
      color={color}
      marker="now"
      weight="heavy"
      capTop={capTop}
      capBottom={capBottom}
      when={
        <>
          {today ? (
            <b className="block font-medium text-[var(--text-primary)]">
              {formatSpineDate(today, today)}
            </b>
          ) : null}
          <span className="block">Today</span>
        </>
      }
    >
      <div className="pb-4 pl-2">
        <p className="m-0 pt-4 font-mono text-[12.5px] font-semibold uppercase leading-none tracking-[0.26em] text-[var(--text-primary)]">
          You are here
        </p>
        {openChapter ? (
          <p className="m-0 mt-[7px] font-heading text-[13.5px] italic leading-[1.45] text-[var(--text-body)]">
            {openChapter}
          </p>
        ) : null}
      </div>
    </SpineRow>
  );
}

// ─── the sketched future ─────────────────────────────────────────────────────

export interface SpineFutureProps {
  /** ISO target date, softened to the week it lands in. */
  date?: string;
  lead: string;
  detail?: string;
  color?: string;
  today?: Date;
  capTop?: boolean;
  capBottom?: boolean;
}

/**
 * A phase still ahead: the same rule, dashed, with the week it is aimed at
 * when the data carries one. No target date and the row simply keeps its
 * place on the line without pretending to a date.
 */
export function SpineFuture({
  date,
  lead,
  detail,
  color,
  today,
  capTop = false,
  capBottom = false,
}: SpineFutureProps) {
  const target = parseSpineDate(date);
  const week = target ? startOfWeek(target) : null;

  return (
    <SpineRow
      testId="spine-future"
      color={color ?? QUIET_INK}
      marker="node"
      dashed
      dim
      capTop={capTop}
      capBottom={capBottom}
      when={
        week ? (
          <>
            <span className="block">Week of</span>
            <b className="block font-medium text-[var(--text-body)]">
              {formatSpineDate(week, today)}
            </b>
          </>
        ) : null
      }
    >
      <p className="m-0 py-[13px] pl-2 font-mono text-[10px] uppercase leading-[1.4] tracking-[0.1em] text-[var(--color-quiet-ink)] opacity-75">
        <span className="font-medium text-[var(--text-body)]">{lead}</span>
        {detail ? <span> &middot; {detail}</span> : null}
      </p>
    </SpineRow>
  );
}

// ─── the horizon foot ────────────────────────────────────────────────────────

export interface SpineHorizonProps {
  /** `project.projectedCompletionDate`. */
  date?: string;
  today?: Date;
}

/**
 * One plain sentence at the foot of the spine, and only when a target end date
 * exists. A date already behind us is not a horizon, so the sentence goes
 * quiet rather than promising a walkthrough that has been and gone.
 */
export function SpineHorizon({ date, today }: SpineHorizonProps) {
  const target = parseSpineDate(date);
  if (!target) return null;
  const week = startOfWeek(target);
  if (today && week.getTime() < startOfWeek(today).getTime()) return null;

  return (
    <div
      data-testid="spine-horizon"
      className="mt-3 border-t border-[var(--border-subtle)] pt-[13px]"
    >
      <p className="m-0 font-heading text-[14px] italic leading-[1.6] text-[var(--text-body)]">
        If nothing changes, we walk through your finished rooms the week of{' '}
        {LONG_MONTH_DAY.format(week)}.
      </p>
    </div>
  );
}

// ─── the spine ───────────────────────────────────────────────────────────────

export interface MakingSpineProps {
  /** Server-fetched phases. Thread-lane rows are filtered out here. */
  milestones: MilestoneDetail[];
  /** `project.currentPhase` — names the open chapter when no phase row is open. */
  currentPhase?: string;
  /** Executed commercial instruments, already worded by Integration. */
  instrumentReceipts?: SpineReceiptEntry[];
  /**
   * Today. Leave undefined during SSR and the first client paint — the date
   * column then reads simply TODAY, identical on both — and pass a real Date
   * once hydrated (see `useHydrated`).
   */
  today?: Date;
  /** `project.projectedCompletionDate` — the horizon foot's only source. */
  horizonDate?: string;
  /**
   * The open chapter: gates, tolls, and tracking rows, in the order they
   * should be read. They land between the marker and the sketched future.
   * Compose them from `SpineRow` so the line runs through them.
   */
  children?: ReactNode;
  className?: string;
}

export function MakingSpine({
  milestones,
  currentPhase,
  instrumentReceipts,
  today,
  horizonDate,
  children,
  className = '',
}: MakingSpineProps) {
  const { settled, current, future } = splitSpinePhases(milestones);
  const receipts = orderReceipts([
    ...settled.map(receiptFromPhase),
    ...(instrumentReceipts ?? []),
  ]);

  // A project can be mid-flight with no phase row open — an activation that
  // never got its phases, a job between chapters. project.currentPhase still
  // names where it stands, so the marker is not left mute where it can be
  // trusted; `openChapterOf` is what decides that, and the masthead reads the
  // same function.
  const { label: openLabel, ink: openInk } = openChapterOf({ settled, current, future }, currentPhase);
  const openSpan = current ? phaseSpan(current) : undefined;

  const hasOpenChapter = Boolean(children);
  // Nothing scheduled and nothing open: the marker is the end of the line.
  const spineEndsAtMarker = future.length === 0 && !hasOpenChapter;

  return (
    <SpineInkContext.Provider
      value={{ color: openInk, label: openLabel, weight: 'heavy' }}
    >
      <section data-testid="making-spine" className={`relative ${className}`}>
        {receipts.length > 0 && (
          <div data-testid="spine-settled">
            {receipts.map((receipt, position) => (
              <SpineReceipt
                key={receipt.id}
                {...receipt}
                today={today}
                capTop={position === 0}
              />
            ))}
          </div>
        )}

        <SpineMarker
          label={openLabel}
          span={openSpan}
          color={openInk}
          today={today}
          capTop={receipts.length === 0}
          capBottom={spineEndsAtMarker}
        />

        {hasOpenChapter && (
          <div data-testid="spine-open-chapter">{children}</div>
        )}

        {future.length > 0 && (
          <div data-testid="spine-future-block">
            {future.map((phase, position) => (
              <SpineFuture
                key={phase.id}
                date={phase.targetDate}
                lead={phase.label}
                // No `detail`: the only thing the row carries beyond its label
                // is `project_phases.name`, which is the studio's vocabulary.
                // "Procurement · Construction Documentation" is a sentence
                // written for an architect, not for the client reading it.
                color={phase.color}
                today={today}
                capBottom={position === future.length - 1}
              />
            ))}
          </div>
        )}

        <SpineHorizon date={horizonDate} today={today} />
      </section>
    </SpineInkContext.Provider>
  );
}
