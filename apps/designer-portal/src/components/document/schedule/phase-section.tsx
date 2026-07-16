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

import type { ReactNode } from 'react';
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
  /** phaseMeta's separate terracotta segment (Slice 03 — a chain_does_not_fit
   *  conflict naming THIS phase as its anchor). null/undefined → the entry
   *  renders byte-identically to Slice 01/02 (no extra line, no extra DOM). */
  overrunText?: string | null;
  /** Slice 04 — the ripple's downstream preview for this phase (phaseGhostLine:
   *  '→ Jun 26 – Jul 29'), shown while a time edit is in flight. Rendered as a
   *  dashed-terracotta mono span. null/undefined (no active ripple, or this
   *  phase didn't move) → no extra DOM, byte-identical to before. */
  ghostLine?: string | null;
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
  // ── Compose (Slice 03) — all optional; omit every one and the entry
  //    renders byte-identically to the read-only Slice 01 markup. ──
  /** The persistent quiet mono action cluster on the heading (PhaseComposeActions). */
  headingActions?: ReactNode;
  /** A revealed compose surface under the meta line — the grammar fields, the
   *  milestone composer, or the delete confirm. Renders regardless of fold. */
  composePanel?: ReactNode;
  /** When the phase is anchored, its heading chip becomes a one-click unpin. */
  onUnpinPhaseAnchor?: () => void;
  /** When a milestone is anchored, its chip becomes a one-click unpin. */
  onUnpinMilestoneAnchor?: (milestoneId: string) => void;
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
  overrunText,
  ghostLine,
  milestones,
  items,
  tasks,
  parties,
  clientName,
  threads,
  onOpenItem,
  today,
  headingActions,
  composePanel,
  onUnpinPhaseAnchor,
  onUnpinMilestoneAnchor,
}: PhaseSectionProps) {
  // The ball-in-court chip resolves the concrete party the court-group way:
  // a live project_parties row named by the item wins, else the embedded
  // court_party the item carried, else the generic court token (partyFor).
  const partyForItem = (item: CoordinationItem) =>
    parties.find((p) => p.id === item.court_party_id) ?? item.court_party ?? null;

  const anchorChip = phase.anchored ? (
    <AnchorChip date={phase.start} className="ml-[0.7rem] align-[3px]" onUnpin={onUnpinPhaseAnchor} />
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
        {(() => {
          // The unfold mark stays visible — never hover-revealed (touch exists;
          // a hidden affordance on a closed chapter is a lie).
          const foldLabel = expanded ? 'Fold' : 'Unfold';
          const foldCls =
            'ml-4 font-mono text-[0.58rem] font-normal uppercase tracking-[0.08em] text-[var(--color-clay)]';
          // An unpinnable anchor chip renders a real <button>; it must never
          // nest inside the fold toggle <button> (invalid HTML — the walk's
          // hydration warning). When the chip is inert (a <span>, the read-only
          // path) it nests harmlessly and the markup stays byte-identical to
          // Slice 01.
          const chipInteractive = phase.anchored && !!onUnpinPhaseAnchor;
          const headingEl = (
            <h3 className={`font-heading leading-tight ${HEADING_CLS[state]}`}>
              {onToggle ? (
                chipInteractive ? (
                  // Split the toggle into two sibling affordances (name + fold
                  // mark) that flank the chip: the visual order (name · chip ·
                  // fold mark) and click-to-fold behavior are preserved, and no
                  // interactive element nests inside another.
                  <>
                    <button
                      type="button"
                      onClick={onToggle}
                      aria-expanded={expanded}
                      className="cursor-pointer text-left"
                    >
                      {name}
                    </button>
                    {anchorChip}
                    <button
                      type="button"
                      onClick={onToggle}
                      aria-expanded={expanded}
                      aria-label={foldLabel}
                      className={`cursor-pointer ${foldCls}`}
                    >
                      {foldLabel}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={expanded}
                    className="cursor-pointer text-left"
                  >
                    {name}
                    {anchorChip}
                    <span className={foldCls}>{foldLabel}</span>
                  </button>
                )
              ) : (
                <>
                  {name}
                  {anchorChip}
                </>
              )}
            </h3>
          );
          // No compose actions → the heading renders exactly as Slice 01 did.
          return headingActions ? (
            <div className="flex items-baseline justify-between gap-4">
              {headingEl}
              {headingActions}
            </div>
          ) : (
            headingEl
          );
        })()}

        {metaLine && (
          <div className="mb-[0.2rem] mt-[0.15rem] font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[var(--color-clay)]">
            {metaLine}
          </div>
        )}

        {/* Slice 03 — the chain-doesn't-fit overrun, inked separately from the
            meta line above so it can wear terracotta without the clay text
            around it. Absent whenever this phase isn't the conflict's anchor
            (the common case) — no extra DOM, byte-identical to before. */}
        {overrunText && (
          <div className="mb-[0.2rem] font-mono text-[0.6rem] uppercase tracking-[0.08em] text-[var(--color-terracotta)]">
            {overrunText}
          </div>
        )}

        {/* Slice 04 — the ripple's downstream preview: this phase's new range
            while a time edit is in flight. A dashed-terracotta mono span (the
            dashed underline reads it as provisional — nothing has moved yet).
            Absent when no ripple touches this phase → byte-identical to before. */}
        {ghostLine && (
          <div className="mb-[0.2rem] font-mono text-[0.6rem] uppercase tracking-[0.08em]">
            <span className="border-b border-dashed border-[var(--color-terracotta)] text-[var(--color-terracotta)]">
              {ghostLine}
            </span>
          </div>
        )}

        {/* The revealed compose surface (grammar fields / milestone composer /
            delete confirm) sits under the meta, visible regardless of fold. */}
        {composePanel}

        {/* Collapsed closed/future entries stop here — history in a whisper. */}
        {expanded && (
          <div className="max-w-[640px]">
            {milestones.map((m) => (
              <MilestoneRow
                key={m.id}
                milestone={m}
                today={today}
                highlighted={highlightMilestoneId === m.id}
                onUnpinAnchor={
                  onUnpinMilestoneAnchor ? () => onUnpinMilestoneAnchor(m.id) : undefined
                }
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
