import {
  isProjectArtifactApproval,
  type CoordinationItem,
} from '@patina/supabase';
import type { MarginItemRow } from './margin-derivation';

/** Removes only Stage-2 decision rows; all other margin history remains intact. */
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
