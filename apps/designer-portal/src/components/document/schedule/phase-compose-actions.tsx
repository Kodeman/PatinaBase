'use client';

/**
 * PhaseComposeActions — the persistent quiet DM-Mono action cluster a phase
 * heading wears in compose (Slice 03 §3, R102 "no hover reveal"). The available
 * actions are always visible (touch exists; a hover-revealed affordance is a
 * lie): + Item (reuses the coordination ItemComposer), + Milestone (reveals
 * MilestoneComposer under the meta), Edit dates (arms the drafting line — the
 * Rule scrolls in and the phase's bar takes focus; B3 removed the typed panel),
 * and, for pending phases only, Delete (swaps in the inline typographic
 * confirm — never a modal, D4).
 *
 * Pure/stateless: which panel is open lives in the spine (one object across
 * all phases), so this only signals intent.
 */

import { DocumentAction, DocumentActionGroup } from '../document-action';

export interface PhaseComposeActionsProps {
  onAddItem: () => void;
  onAddMilestone: () => void;
  onEditDates: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

export function PhaseComposeActions({
  onAddItem,
  onAddMilestone,
  onEditDates,
  onDelete,
  canDelete,
}: PhaseComposeActionsProps) {
  return (
    <DocumentActionGroup
      surfaceKey="schedule"
      regionKey="phase-compose-actions"
      className="flex-none"
    >
      <DocumentAction
        actionKey="add-phase-item"
        variant="secondary"
        onClick={onAddItem}
      >
        Add item
      </DocumentAction>
      <DocumentAction
        actionKey="add-phase-milestone"
        variant="secondary"
        onClick={onAddMilestone}
      >
        Add milestone
      </DocumentAction>
      <DocumentAction
        actionKey="edit-phase-dates"
        variant="secondary"
        onClick={onEditDates}
      >
        Edit dates
      </DocumentAction>
      {canDelete && (
        <DocumentAction
          actionKey="open-delete-phase"
          variant="tertiary"
          onClick={onDelete}
          className="text-[var(--color-terracotta)]"
        >
          Delete
        </DocumentAction>
      )}
    </DocumentActionGroup>
  );
}
