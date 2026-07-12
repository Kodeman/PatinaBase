// catalog-commit.ts — pure logic for the gated catalog-normalizer commit
// route (WP-2.4, app/api/admin/catalog/commit-batch). Extracted so the
// approval gate, the auto-commit eligibility filter, and the review
// field-correction merge are unit-testable without a live Supabase client.
//
// Nothing here talks to the network or a database — the route (route.ts)
// owns fetching rows, calling Supabase, and writing products/
// promotion_audit_log/audit_logs.

export interface CatalogFeedItemForCommit {
  id: string;
  batch_id: string;
  status: string; // catalog_feed_items.status
  confidence: number | null;
  normalized: Record<string, unknown> | null;
  match_product_id: string | null;
  action: 'create' | 'update' | 'skip' | null;
  committed_product_id: string | null;
}

export interface AgentTaskGate {
  status: string; // agent_tasks.status
}

const AUTO_COMMIT_THRESHOLD = 0.9;

/** True only when the batch/item's gate task has been explicitly approved. */
export function isApproved(task: AgentTaskGate | null | undefined): boolean {
  return !!task && task.status === 'approved';
}

/**
 * Rows eligible for BATCH (auto) commit: normalized, confidence >= 0.9, and
 * not already committed. Guarding on committed_product_id is what makes a
 * re-POST of the same batch a no-op — once a row is committed this filter
 * permanently excludes it.
 */
export function selectEligibleBatchRows(
  items: CatalogFeedItemForCommit[],
): CatalogFeedItemForCommit[] {
  return items.filter(
    (i) =>
      i.status === 'normalized' &&
      (i.confidence ?? 0) >= AUTO_COMMIT_THRESHOLD &&
      i.committed_product_id == null,
  );
}

/**
 * A single row is eligible for ITEM (post-review) commit once its
 * catalog_review gate task is approved and it hasn't already been committed.
 * Unlike batch rows, item-mode rows are NOT confidence-gated — a human
 * already reviewed them.
 */
export function isItemEligibleForCommit(
  item: CatalogFeedItemForCommit,
  gateTask: AgentTaskGate | null | undefined,
): boolean {
  return item.committed_product_id == null && isApproved(gateTask);
}

/**
 * Merge a reviewer's field corrections (agent_tasks.payload.field_corrections,
 * written by review_agent_task's p_payload_patch) over the normalizer's
 * output. A shallow overlay is intentional — normalized fields are flat
 * scalars/arrays; the reviewer resubmits a whole corrected value per field,
 * not a nested deep-patch.
 */
export function applyFieldCorrections(
  normalized: Record<string, unknown>,
  corrections: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!corrections) return normalized;
  return { ...normalized, ...corrections };
}

/** True once every row in the batch is either committed or explicitly rejected/skipped. */
export function isBatchFullyResolved(items: Array<{ status: string }>): boolean {
  const OPEN = new Set(['pending', 'normalized', 'review_queued']);
  return items.every((i) => !OPEN.has(i.status));
}
