'use client';

/**
 * Phase section — one ledger-spine entry (C6, Slice 01 read).
 * Prototype: `.mb-entry` / `.mb-spinecell` / `.mb-node` / `.mb-meta` /
 * `.mb-item` in the-document-schedule-master-direction.html.
 *
 * State speaks through weight, never chrome:
 *   · closed — one light line (400 Playfair, aged-oak) over a solid mocha
 *     spine segment and a small filled node; body only when unfolded.
 *   · active — the open chapter: 600 Playfair charcoal, clay-ringed node,
 *     always expanded (milestones, then blocking-first items, then threads).
 *   · future — muted heading over a dashed pearl segment and a hollow node;
 *     body only when unfolded.
 *
 * Slice 01 is READ: no + Item / + Milestone / Edit dates anywhere (they
 * arrive Slices 03/04 — a dead link is a designer-visible lie). The ONLY
 * heading interaction is unfold/fold on closed/future phases — a real
 * <button aria-expanded>. Anchored phases wear the charcoal anchor chip.
 * Segments are drawn per-entry, full height, so the spine reads continuous.
 * Pure presentational: items arrive already sorted (sortItemsBlockingFirst);
 * the meta line arrives composed (phaseMeta). Zero shadows (D4).
 */

import type { ResolvedMilestone, ResolvedPhase } from '@patina/utils';
import type { CoordinationItem, ProjectParty } from '@patina/supabase';
import type { SectionTask } from '@/hooks/use-section-work';
import type { SpinePhaseState } from '@/lib/document/schedule-spine-derivation';
import { OpenItemRow } from '../coordination/open-item-row';
import { MilestoneRow, AnchorChip } from './milestone-row';
import { ThreadStitch } from './thread-stitch';

export interface PhaseSectionProps {
  phase: ResolvedPhase;
  name: string;
  state: SpinePhaseState;
  /** DOM id + scroll target for the Rule's minimap reveal (phaseAnchorId).
   *  Omitted → the entry renders exactly as before (byte-identical). */
  anchorId?: string;
  /** The milestone currently flashed by a minimap reveal, or null. Passed
   *  straight to each MilestoneRow; undefined → no row ever highlights. */
  highlightMilestoneId?: string | null;
  expanded: boolean;
  /** null = not foldable (the active phase never folds). */
  onToggle: (() => void) | null;
  /** Pre-composed by phaseMeta — '' renders nothing. */
  metaLine: string;
  /** This phase's resolved milestones, augmented with display names. */
  milestones: Array<ResolvedMilestone & { name: string }>;
  /** Already filtered (itemsForPhase) + sorted blocking-first by the caller. */
  items: CoordinationItem[];
  /** All section tasks — each row's "blocks N tasks" derivation. */
  tasks: SectionTask[];
  /** Concrete party rows for the ball-in-court chip resolution. */
  parties: ProjectParty[];
  clientName: string;
  /** Thread-lane phases stitched into this entry (threadsFor hosting). */
  threads: Array<{ phase: ResolvedPhase; name: string }>;
  onOpenItem: (id: string) => void;
  /** 'YYYY-MM-DD' — for the milestone stamps' overdue arithmetic. */
  today: string;
}

/** Heading weight/size/ink per state (`.mb-entry h3` + state variants). */
const HEADING_CLS: Record<SpinePhaseState, string> = {
  active: 'text-[1.28rem] font-semibold text-[var(--color-charcoal)]',
  closed: 'text-[1.02rem] font-normal text-[var(--color-aged-oak)]',
  future: 'text-[1.1rem] font-normal text-[var(--color-aged-oak)]',
};

/** Per-entry bottom breathing room (`.mb-body` padding in the slide). */
const BODY_PAD: Record<SpinePhaseState, string> = {
  active: 'pb-[0.9rem]',
  closed: 'pb-[1.2rem]',
  future: 'pb-[1.1rem]',
};

export function PhaseSection({
  phase,
  name,
  state,
  anchorId,
  highlightMilestoneId,
  expanded,
  onToggle,
  metaLine,
  milestones,
  items,
  tasks,
  parties,
  clientName,
  threads,
  onOpenItem,
  today,
}: PhaseSectionProps) {
  // The ball-in-court chip resolves the concrete party the court-group way:
  // a live project_parties row named by the item wins, else the embedded
  // court_party the item carried, else the generic court token (partyFor).
  const partyForItem = (item: CoordinationItem) =>
    parties.find((p) => p.id === item.court_party_id) ?? item.court_party ?? null;

  const anchorChip = phase.anchored ? (
    <AnchorChip date={phase.start} className="ml-[0.7rem] align-[3px]" />
  ) : null;

  return (
    <div
      id={anchorId}
      className={`grid grid-cols-[30px_minmax(0,1fr)] gap-x-[1.1rem]${
        anchorId ? ' scroll-mt-24' : ''
      }`}
    >
      {/* ── spine cell — per-entry segment + node so the line reads continuous ── */}
      <div className="relative" aria-hidden>
        {state === 'future' ? (
          <span
            className="absolute bottom-0 left-[6px] top-0 w-[1.5px]"
            style={{
              background:
                'repeating-linear-gradient(to bottom, var(--color-pearl) 0 5px, transparent 5px 10px)',
            }}
          />
        ) : (
          <span className="absolute bottom-0 left-[6px] top-0 w-[2px] bg-[var(--color-mocha)]" />
        )}
        {state === 'closed' ? (
          <span className="absolute left-[2px] top-[10px] h-[10px] w-[10px] rounded-full bg-[var(--color-mocha)]" />
        ) : state === 'active' ? (
          <span className="absolute left-0 top-[8px] h-[14px] w-[14px] rounded-full border-[2.5px] border-[var(--color-clay)] bg-[var(--color-off-white)]" />
        ) : (
          <span className="absolute left-0 top-[8px] h-[14px] w-[14px] rounded-full border-[1.5px] border-[var(--color-pearl)] bg-[var(--color-off-white)]" />
        )}
      </div>

      {/* ── body ── */}
      <div className={BODY_PAD[state]}>
        <h3 className={`font-heading leading-tight ${HEADING_CLS[state]}`}>
          {onToggle ? (
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              className="cursor-pointer text-left"
            >
              {name}
              {anchorChip}
              {/* The unfold mark stays visible — never hover-revealed (touch
                  exists; a hidden affordance on a closed chapter is a lie). */}
              <span className="ml-4 font-mono text-[0.58rem] font-normal uppercase tracking-[0.08em] text-[var(--color-clay)]">
                {expanded ? 'Fold' : 'Unfold'}
              </span>
            </button>
          ) : (
            <>
              {name}
              {anchorChip}
            </>
          )}
        </h3>

        {metaLine && (
          <div className="mb-[0.2rem] mt-[0.15rem] font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[var(--color-clay)]">
            {metaLine}
          </div>
        )}

        {/* Collapsed closed/future entries stop here — history in a whisper. */}
        {expanded && (
          <div className="max-w-[640px]">
            {milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                milestone={m}
                today={today}
                highlighted={highlightMilestoneId === m.id}
              />
            ))}

            {items.length > 0 && (
              <ul className="mt-[0.6rem]">
                {items.map((item, i) => (
                  <li
                    key={item.id}
                    className={i === 0 ? 'border-t border-[var(--color-pearl)]' : ''}
                  >
                    <OpenItemRow
                      item={item}
                      tasks={tasks}
                      onOpen={() => onOpenItem(item.id)}
                      court={{
                        court: item.court,
                        party: partyForItem(item),
                        clientName,
                      }}
                    />
                  </li>
                ))}
              </ul>
            )}

            {threads.map((t) => (
              <ThreadStitch
                key={t.phase.id}
                name={t.name}
                start={t.phase.start}
                end={t.phase.end}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
