'use client';

/**
 * PhaseComposeActions — the persistent quiet DM-Mono action cluster a phase
 * heading wears in compose (Slice 03 §3, R102 "no hover reveal"). Four real
 * <button>s, always visible (touch exists; a hover-revealed affordance is a
 * lie): + Item (reuses the coordination ItemComposer), + Milestone (reveals
 * MilestoneComposer under the meta), Edit dates (reveals the grammar fields),
 * Delete (swaps in the inline typographic confirm — never a modal, D4).
 *
 * Pure/stateless: which panel is open lives in the spine (one object across
 * all phases), so this only signals intent.
 */

export interface PhaseComposeActionsProps {
  onAddItem: () => void;
  onAddMilestone: () => void;
  onEditDates: () => void;
  onDelete: () => void;
}

const actionCls =
  'font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-clay)] hover:opacity-80';

export function PhaseComposeActions({
  onAddItem,
  onAddMilestone,
  onEditDates,
  onDelete,
}: PhaseComposeActionsProps) {
  return (
    <div className="flex flex-none items-center gap-[0.7rem]">
      <button type="button" onClick={onAddItem} className={actionCls}>
        + Item
      </button>
      <button type="button" onClick={onAddMilestone} className={actionCls}>
        + Milestone
      </button>
      <button type="button" onClick={onEditDates} className={actionCls}>
        Edit dates
      </button>
      <button
        type="button"
        onClick={onDelete}
        className="font-mono text-[0.58rem] uppercase tracking-[0.06em] text-[var(--color-aged-oak)] hover:opacity-80"
      >
        Delete
      </button>
    </div>
  );
}
