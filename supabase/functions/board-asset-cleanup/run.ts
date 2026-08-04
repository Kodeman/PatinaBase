import {
  BOARD_ASSET_BUCKET,
  BOARD_ASSET_GRACE_DAYS,
  type BoardReferenceDataset,
  buildBoardReferenceCounts,
  type CandidateRow,
  type CleanupMode,
  planCleanup,
  type ReferenceCounts,
} from "./core.ts";

export interface BoardAssetCleanupRunPort {
  loadReferenceDataset(): Promise<BoardReferenceDataset>;
  listBoardObjects(): Promise<string[]>;
  loadCandidates(): Promise<CandidateRow[]>;
  resetCandidates(objectNames: string[]): Promise<void>;
  insertCandidates(
    objectNames: string[],
    now: Date,
    jobRunId: number,
  ): Promise<void>;
  observeCandidates(
    candidates: CandidateRow[],
    referenceCounts: ReferenceCounts,
    now: Date,
    jobRunId: number,
  ): Promise<void>;
  deleteEligibleObjects(
    objectNames: string[],
    now: Date,
    jobRunId: number,
  ): Promise<{ deleted: number; rescued: number }>;
  finishRun(
    status: "succeeded" | "failed" | "skipped",
    detail: Record<string, unknown>,
    error?: string | null,
  ): Promise<void>;
}

export interface BoardAssetCleanupRunInput {
  port: BoardAssetCleanupRunPort;
  jobRunId: number;
  now: Date;
  mode: CleanupMode;
}

export interface BoardAssetCleanupRunDetail extends Record<string, unknown> {
  bucket_id: string;
  grace_days: number;
  scanned_objects: number;
  referenced_objects: number;
  reference_fields: number;
  candidates_first_seen: number;
  candidates_observed: number;
  candidates_reset: number;
  eligible_objects: number;
  rescued_at_delete_boundary: number;
  deleted_objects: number;
}

/**
 * Execute one complete reconciliation run behind an injectable persistence
 * boundary. The edge handler supplies Supabase/Storage adapters; tests use an
 * in-memory ledger so first sight, continuous grace, deletion, and job closure
 * are proven as one workflow rather than as disconnected helper assertions.
 */
export async function runBoardAssetCleanup(
  input: BoardAssetCleanupRunInput,
): Promise<BoardAssetCleanupRunDetail> {
  const [dataset, objectNames, candidates] = await Promise.all([
    input.port.loadReferenceDataset(),
    input.port.listBoardObjects(),
    input.port.loadCandidates(),
  ]);
  const referenceCounts = buildBoardReferenceCounts(dataset);
  const plan = planCleanup({
    objectNames,
    referenceCounts,
    candidates,
    now: input.now,
    dryRun: input.mode.dry_run,
    destructiveEnabled: input.mode.destructive_enabled,
  });

  // Reset first so a restored reference can never retain stale eligibility.
  await input.port.resetCandidates(plan.resetCandidateNames);
  await input.port.insertCandidates(
    plan.newCandidateNames,
    input.now,
    input.jobRunId,
  );
  await input.port.observeCandidates(
    plan.observedCandidates,
    referenceCounts,
    input.now,
    input.jobRunId,
  );

  const deletion = plan.deleteObjectNames.length > 0
    ? await input.port.deleteEligibleObjects(
      plan.deleteObjectNames,
      input.now,
      input.jobRunId,
    )
    : { deleted: 0, rescued: 0 };

  const referencedObjects =
    objectNames.filter((name) => (referenceCounts.get(name) ?? 0) > 0).length;
  const detail: BoardAssetCleanupRunDetail = {
    ...input.mode,
    bucket_id: BOARD_ASSET_BUCKET,
    grace_days: BOARD_ASSET_GRACE_DAYS,
    scanned_objects: objectNames.length,
    referenced_objects: referencedObjects,
    reference_fields: [...referenceCounts.values()].reduce(
      (sum, count) => sum + count,
      0,
    ),
    candidates_first_seen: plan.newCandidateNames.length,
    candidates_observed: plan.observedCandidates.length,
    candidates_reset: plan.resetCandidateNames.length,
    eligible_objects: plan.eligibleObjectNames.length,
    rescued_at_delete_boundary: deletion.rescued,
    deleted_objects: deletion.deleted,
  };
  await input.port.finishRun("succeeded", detail);
  return detail;
}
