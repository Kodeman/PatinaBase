import {
  isProjectArtifactApproval,
  type CoordinationItem,
} from '@patina/supabase';
import type { MarginItemRow } from './margin-derivation';

export type MarginDecisionClassificationState = 'ready' | 'loading' | 'error';

export interface ClassifiedMarginItems {
  items: MarginItemRow[];
  decisionState: MarginDecisionClassificationState;
  withheldDecisionCount: number;
}

/** Removes only Stage-2 decision rows after the classifier read has succeeded. */
export function excludeProjectApprovalsFromMargin(
  rows: readonly MarginItemRow[],
  coordinationItems: readonly CoordinationItem[],
): MarginItemRow[] {
  const approvalIds = new Set(
    coordinationItems.filter(isProjectArtifactApproval).map((item) => item.id),
  );
  if (approvalIds.size === 0) return [...rows];
  return rows.filter(
    (row) => row.kind !== 'decision' || !approvalIds.has(row.item_id),
  );
}

/**
 * A margin decision may not mount until its Stage-2/legacy contract has been
 * classified. Messages, notes, money, and time remain available while that
 * narrow read is pending or unavailable.
 */
export function classifyMarginItems(
  rows: readonly MarginItemRow[],
  coordinationItems: readonly CoordinationItem[],
  state: MarginDecisionClassificationState,
): ClassifiedMarginItems {
  const decisionCount = rows.filter((row) => row.kind === 'decision').length;
  if (decisionCount === 0) {
    return {
      items: [...rows],
      decisionState: 'ready',
      withheldDecisionCount: 0,
    };
  }
  if (state !== 'ready') {
    return {
      items: rows.filter((row) => row.kind !== 'decision'),
      decisionState: state,
      withheldDecisionCount: decisionCount,
    };
  }
  return {
    items: excludeProjectApprovalsFromMargin(rows, coordinationItems),
    decisionState: 'ready',
    withheldDecisionCount: 0,
  };
}

export function marginDecisionClassificationState({
  projectId,
  coordinationItems,
  isLoading,
  isError,
}: {
  projectId: string | null;
  coordinationItems: readonly CoordinationItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
}): MarginDecisionClassificationState {
  // Stage-2 approvals are project-only. Proposal margins can safely preserve
  // their legacy decision rows without a project classifier query.
  if (!projectId) return 'ready';
  if (isError) return 'error';
  if (isLoading || coordinationItems === undefined) return 'loading';
  return 'ready';
}

/** Only legacy drafts may enter the generic coordination composer. */
export function legacyCoordinationDrafts(
  items: readonly CoordinationItem[],
): CoordinationItem[] {
  return items.filter(
    (item) => item.status === 'draft' && !isProjectArtifactApproval(item),
  );
}

/** Shared accessible status for every desktop/mobile margin presentation. */
export function MarginDecisionClassificationNotice({
  state,
}: {
  state: MarginDecisionClassificationState;
}) {
  if (state === 'ready') return null;
  if (state === 'loading') {
    return (
      <p
        role="status"
        aria-live="polite"
        data-testid="margin-decision-classification-loading"
        className="w-full text-[12px] text-[var(--text-muted)]"
      >
        Checking decision authority before showing margin decisions…
      </p>
    );
  }
  return (
    <p
      role="alert"
      data-testid="margin-decision-classification-error"
      className="w-full text-[12px] text-[var(--color-terracotta-ink)]"
    >
      Margin decisions are hidden because their approval authority could not be
      verified. Try again when the project record is available.
    </p>
  );
}
