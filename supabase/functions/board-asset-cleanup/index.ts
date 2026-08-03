// board-asset-cleanup — service-only, two-pass mood-board Storage GC.
//
// 00410's daily pg_cron calls dispatch_board_asset_gc(true), which creates the
// job_runs row and invokes this function with its id. The function scans exact
// persisted references, reconciles a durable 14-day candidate ledger, and
// completes that existing run through finish_board_asset_gc_run().
//
// Deletion has two independent gates: body.dry_run must be literal false AND
// BOARD_ASSET_CLEANUP_DESTRUCTIVE_ENABLED must be exactly "true". The scheduled
// payload is always dry-run=true and the environment switch is intentionally
// absent by default, so today's production posture cannot delete objects.

// deno-lint-ignore-file no-explicit-any no-import-prefix

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2";
import {
  bearerRole,
  BOARD_ASSET_BUCKET,
  BOARD_ASSET_GRACE_DAYS,
  type BoardReferenceDataset,
  type BoardTemplateReferenceRow,
  buildBoardReferenceCounts,
  type CandidateRow,
  DESTRUCTIVE_ENV,
  destructiveCleanupEnabled,
  type LiveBoardItemReferenceRow,
  normalizeBoardObjectReference,
  planCleanup,
  type ProjectBoardReferenceRow,
  type ProposalBoardReferenceRow,
  type ReferenceCounts,
  resolveCleanupMode,
} from "./core.ts";

const FUNCTION_NAME = "board-asset-cleanup";
const JOB_NAME = "board-asset-gc";
const PAGE_SIZE = 1_000;
const MUTATION_BATCH_SIZE = 50;
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface CleanupBody {
  dry_run?: unknown;
  grace_days?: unknown;
  job_name?: unknown;
  job_run_id?: unknown;
}

interface PageResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

interface StorageEntry {
  id: string | null;
  name: string;
  metadata?: unknown;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function messageOf(error: unknown): string {
  return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}

function log(event: string, fields: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    fn: FUNCTION_NAME,
    event,
    ...fields,
  }));
}

function chunks<T>(values: T[], size = MUTATION_BATCH_SIZE): T[][] {
  const result: T[][] = [];
  for (let offset = 0; offset < values.length; offset += size) {
    result.push(values.slice(offset, offset + size));
  }
  return result;
}

async function allPages<T>(
  label: string,
  load: (from: number, to: number) => Promise<PageResult>,
): Promise<T[]> {
  const result: T[] = [];
  for (let from = 0;; from += PAGE_SIZE) {
    const page = await load(from, from + PAGE_SIZE - 1);
    if (page.error) {
      throw new Error(`${label} query failed: ${page.error.message}`);
    }
    const rows = (page.data ?? []) as T[];
    result.push(...rows);
    if (rows.length < PAGE_SIZE) return result;
  }
}

async function loadReferenceDataset(
  admin: SupabaseClient,
): Promise<BoardReferenceDataset> {
  const [liveItems, projectSnapshots, templates, boards] = await Promise.all([
    allPages<LiveBoardItemReferenceRow>(
      "proposal_board_items",
      async (from, to) => {
        const result = await admin.from("proposal_board_items")
          .select("image_url,data").order("id", { ascending: true }).range(
            from,
            to,
          );
        return { data: result.data, error: result.error };
      },
    ),
    allPages<ProjectBoardReferenceRow>("project_boards", async (from, to) => {
      const result = await admin.from("project_boards")
        .select("cover_image_url,items").order("id", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    allPages<BoardTemplateReferenceRow>("board_templates", async (from, to) => {
      const result = await admin.from("board_templates")
        .select("cover_url,items,sections").order("id", { ascending: true })
        .range(from, to);
      return { data: result.data, error: result.error };
    }),
    allPages<ProposalBoardReferenceRow>("proposal_boards", async (from, to) => {
      const result = await admin.from("proposal_boards")
        .select("id,proposal_id,project_id,cover_image_url")
        .order("id", { ascending: true }).range(from, to);
      return { data: result.data, error: result.error };
    }),
  ]);
  return { liveItems, projectSnapshots, templates, boards };
}

async function listDirectory(
  admin: SupabaseClient,
  prefix: string,
): Promise<StorageEntry[]> {
  const result: StorageEntry[] = [];
  for (let offset = 0;; offset += PAGE_SIZE) {
    const page = await admin.storage.from(BOARD_ASSET_BUCKET).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (page.error) {
      throw new Error(
        `storage list failed at ${prefix || "<root>"}: ${page.error.message}`,
      );
    }
    const rows = (page.data ?? []) as StorageEntry[];
    result.push(...rows);
    if (rows.length < PAGE_SIZE) return result;
  }
}

/** Enumerate only `{uuid}/boards/{uuid}/...`, never another bucket subtree. */
async function listBoardObjects(admin: SupabaseClient): Promise<string[]> {
  const roots = await listDirectory(admin, "");
  const objectNames = new Set<string>();

  for (const root of roots) {
    if (root.id !== null || !UUID_RE.test(root.name)) continue;
    const boardsRoot = `${root.name}/boards`;
    const pending = [boardsRoot];
    while (pending.length > 0) {
      const prefix = pending.pop()!;
      const entries = await listDirectory(admin, prefix);
      for (const entry of entries) {
        const fullName = `${prefix}/${entry.name}`;
        if (entry.id === null) {
          // Direct children of /boards are board ids. Deeper folders are
          // allowed for future derivative layouts, but every final key is
          // normalized again before it can enter the deletion plan.
          if (prefix === boardsRoot && !UUID_RE.test(entry.name)) continue;
          pending.push(fullName);
          continue;
        }
        const normalized = normalizeBoardObjectReference(fullName);
        if (normalized) objectNames.add(normalized);
      }
    }
  }

  return [...objectNames].sort();
}

function normalizeCandidate(row: any): CandidateRow {
  return {
    bucket_id: String(row.bucket_id),
    object_name: String(row.object_name),
    first_unreferenced_at: String(row.first_unreferenced_at),
    last_scanned_at: String(row.last_scanned_at),
    eligible_after: String(row.eligible_after),
    last_reference_count: Number(row.last_reference_count),
    deleted_at: row.deleted_at === null ? null : String(row.deleted_at),
    last_job_run_id: row.last_job_run_id === null
      ? null
      : Number(row.last_job_run_id),
    detail:
      row.detail && typeof row.detail === "object" && !Array.isArray(row.detail)
        ? row.detail as Record<string, unknown>
        : {},
    created_at: String(row.created_at),
  };
}

async function loadCandidates(admin: SupabaseClient): Promise<CandidateRow[]> {
  const rows = await allPages<any>(
    "board_asset_gc_candidates",
    async (from, to) => {
      const result = await admin.from("board_asset_gc_candidates")
        .select(
          "bucket_id,object_name,first_unreferenced_at,last_scanned_at,eligible_after,last_reference_count,deleted_at,last_job_run_id,detail,created_at",
        )
        .eq("bucket_id", BOARD_ASSET_BUCKET)
        .order("object_name", { ascending: true }).range(from, to);
      return { data: result.data, error: result.error };
    },
  );
  return rows.map(normalizeCandidate);
}

async function deleteCandidateRows(
  admin: SupabaseClient,
  objectNames: string[],
): Promise<void> {
  for (const batch of chunks([...new Set(objectNames)])) {
    if (batch.length === 0) continue;
    const result = await admin.from("board_asset_gc_candidates").delete()
      .eq("bucket_id", BOARD_ASSET_BUCKET).in("object_name", batch);
    if (result.error) {
      throw new Error(`candidate reset failed: ${result.error.message}`);
    }
  }
}

async function insertNewCandidates(
  admin: SupabaseClient,
  objectNames: string[],
  now: Date,
  jobRunId: number,
): Promise<void> {
  const firstUnreferencedAt = now.toISOString();
  const eligibleAfter = new Date(
    now.getTime() + BOARD_ASSET_GRACE_DAYS * 24 * 60 * 60 * 1_000,
  ).toISOString();
  for (const batch of chunks(objectNames)) {
    if (batch.length === 0) continue;
    const rows = batch.map((objectName) => ({
      bucket_id: BOARD_ASSET_BUCKET,
      object_name: objectName,
      first_unreferenced_at: firstUnreferencedAt,
      last_scanned_at: firstUnreferencedAt,
      eligible_after: eligibleAfter,
      last_reference_count: 0,
      deleted_at: null,
      last_job_run_id: jobRunId,
      detail: {
        state: "candidate",
        first_seen_job_run_id: jobRunId,
        grace_days: BOARD_ASSET_GRACE_DAYS,
      },
    }));
    const result = await admin.from("board_asset_gc_candidates").upsert(rows, {
      onConflict: "bucket_id,object_name",
      ignoreDuplicates: true,
    });
    if (result.error) {
      throw new Error(`candidate insert failed: ${result.error.message}`);
    }
  }
}

async function updateObservedCandidates(
  admin: SupabaseClient,
  candidates: CandidateRow[],
  counts: ReferenceCounts,
  now: Date,
  jobRunId: number,
): Promise<void> {
  for (const batch of chunks(candidates)) {
    if (batch.length === 0) continue;
    const rows = batch.map((candidate) => ({
      bucket_id: BOARD_ASSET_BUCKET,
      object_name: candidate.object_name,
      first_unreferenced_at: candidate.first_unreferenced_at,
      last_scanned_at: now.toISOString(),
      eligible_after: candidate.eligible_after,
      last_reference_count: counts.get(candidate.object_name) ?? 0,
      deleted_at: candidate.deleted_at,
      last_job_run_id: jobRunId,
      detail: {
        ...(candidate.detail ?? {}),
        last_observed_job_run_id: jobRunId,
        last_observed_at: now.toISOString(),
      },
      created_at: candidate.created_at,
    }));
    const result = await admin.from("board_asset_gc_candidates").upsert(rows, {
      onConflict: "bucket_id,object_name",
    });
    if (result.error) {
      throw new Error(`candidate update failed: ${result.error.message}`);
    }
  }
}

async function finishRun(
  admin: SupabaseClient,
  runId: number,
  status: "succeeded" | "failed" | "skipped",
  detail: Record<string, unknown>,
  error: string | null = null,
): Promise<void> {
  const result = await admin.rpc("finish_board_asset_gc_run", {
    p_run_id: runId,
    p_status: status,
    p_detail: detail,
    p_error: error,
  });
  if (result.error) {
    throw new Error(`job completion failed: ${result.error.message}`);
  }
}

async function deleteEligibleObjects(input: {
  admin: SupabaseClient;
  plannedNames: string[];
  now: Date;
  jobRunId: number;
}): Promise<{ deleted: number; rescued: number }> {
  // Re-read every reference source and the candidate ledger at the destructive
  // boundary. This narrows the race window and, critically, prevents an old
  // eligible row from deleting an object whose grace was reset concurrently.
  const [latestDataset, latestCandidates] = await Promise.all([
    loadReferenceDataset(input.admin),
    loadCandidates(input.admin),
  ]);
  const latestCounts = buildBoardReferenceCounts(latestDataset);
  const candidateByName = new Map(
    latestCandidates.map((candidate) => [candidate.object_name, candidate]),
  );
  const safeToDelete: string[] = [];
  const rescued: string[] = [];

  for (const requested of input.plannedNames) {
    const objectName = normalizeBoardObjectReference(requested);
    const candidate = objectName ? candidateByName.get(objectName) : undefined;
    const eligibleAt = candidate ? Date.parse(candidate.eligible_after) : NaN;
    if (
      !objectName || (latestCounts.get(objectName) ?? 0) > 0 || !candidate ||
      candidate.deleted_at !== null || candidate.last_reference_count !== 0 ||
      !Number.isFinite(eligibleAt) || eligibleAt > input.now.getTime()
    ) {
      if (objectName) rescued.push(objectName);
      continue;
    }
    safeToDelete.push(objectName);
  }

  await deleteCandidateRows(
    input.admin,
    rescued.filter((objectName) => (latestCounts.get(objectName) ?? 0) > 0),
  );

  let deleted = 0;
  for (const batch of chunks(safeToDelete)) {
    const removal = await input.admin.storage.from(BOARD_ASSET_BUCKET).remove(
      batch,
    );
    if (removal.error) {
      throw new Error(`storage delete failed: ${removal.error.message}`);
    }

    const markedAt = new Date().toISOString();
    const marked = await input.admin.from("board_asset_gc_candidates").update({
      deleted_at: markedAt,
      last_scanned_at: markedAt,
      last_reference_count: 0,
      last_job_run_id: input.jobRunId,
      detail: {
        state: "deleted",
        deleted_by_job_run_id: input.jobRunId,
      },
    }).eq("bucket_id", BOARD_ASSET_BUCKET).in("object_name", batch)
      .is("deleted_at", null).lte("eligible_after", input.now.toISOString());
    if (marked.error) {
      throw new Error(
        `candidate delete receipt failed: ${marked.error.message}`,
      );
    }
    deleted += batch.length;
  }

  return { deleted, rescued: rescued.length };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  // verify_jwt=true authenticates the JWT at the gateway; the decoded claim is
  // the defense-in-depth authorization boundary against normal user tokens.
  if (bearerRole(req.headers.get("Authorization")) !== "service_role") {
    return json({ error: "service_role_required" }, 403);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const body = await req.json().catch(() => ({})) as CleanupBody;
  const runId = typeof body.job_run_id === "number" &&
      Number.isSafeInteger(body.job_run_id) && body.job_run_id > 0
    ? body.job_run_id
    : null;
  if (runId === null) return json({ error: "valid_job_run_id_required" }, 422);

  if (
    body.job_name !== JOB_NAME ||
    (body.grace_days !== undefined &&
      body.grace_days !== BOARD_ASSET_GRACE_DAYS)
  ) {
    const detail = {
      phase: "input_validation",
      grace_days: BOARD_ASSET_GRACE_DAYS,
    };
    try {
      await finishRun(
        admin,
        runId,
        "failed",
        detail,
        "invalid cleanup dispatch payload",
      );
    } catch (error) {
      log("job_completion_failed", {
        job_run_id: runId,
        error: messageOf(error),
      });
    }
    return json({ error: "invalid_dispatch_payload" }, 422);
  }

  const now = new Date();
  const destructiveEnabled = destructiveCleanupEnabled(
    Deno.env.get(DESTRUCTIVE_ENV),
  );
  const mode = resolveCleanupMode(body.dry_run, destructiveEnabled);
  log("started", { job_run_id: runId, ...mode });

  try {
    const [dataset, objectNames, candidates] = await Promise.all([
      loadReferenceDataset(admin),
      listBoardObjects(admin),
      loadCandidates(admin),
    ]);
    const referenceCounts = buildBoardReferenceCounts(dataset);
    const plan = planCleanup({
      objectNames,
      referenceCounts,
      candidates,
      now,
      dryRun: mode.dry_run,
      destructiveEnabled,
    });

    // Reset first: a referenced/missing/re-uploaded object must lose all stale
    // eligibility before any new first-sighting row is inserted.
    await deleteCandidateRows(admin, plan.resetCandidateNames);
    await insertNewCandidates(admin, plan.newCandidateNames, now, runId);
    await updateObservedCandidates(
      admin,
      plan.observedCandidates,
      referenceCounts,
      now,
      runId,
    );

    const deletion = plan.deleteObjectNames.length > 0
      ? await deleteEligibleObjects({
        admin,
        plannedNames: plan.deleteObjectNames,
        now,
        jobRunId: runId,
      })
      : { deleted: 0, rescued: 0 };

    const referencedObjects = objectNames.filter((name) =>
      (referenceCounts.get(name) ?? 0) > 0
    ).length;
    const detail = {
      ...mode,
      bucket_id: BOARD_ASSET_BUCKET,
      grace_days: BOARD_ASSET_GRACE_DAYS,
      scanned_objects: objectNames.length,
      referenced_objects: referencedObjects,
      reference_fields: [...referenceCounts.values()].reduce(
        (sum, n) => sum + n,
        0,
      ),
      candidates_first_seen: plan.newCandidateNames.length,
      candidates_observed: plan.observedCandidates.length,
      candidates_reset: plan.resetCandidateNames.length,
      eligible_objects: plan.eligibleObjectNames.length,
      rescued_at_delete_boundary: deletion.rescued,
      deleted_objects: deletion.deleted,
    };
    await finishRun(admin, runId, "succeeded", detail);
    log("completed", { job_run_id: runId, ...detail });
    return json({ ok: true, ...detail });
  } catch (error) {
    const message = messageOf(error);
    log("failed", { job_run_id: runId, error: message });
    try {
      await finishRun(
        admin,
        runId,
        "failed",
        { ...mode, phase: "cleanup", grace_days: BOARD_ASSET_GRACE_DAYS },
        message,
      );
    } catch (completionError) {
      log("job_completion_failed", {
        job_run_id: runId,
        error: messageOf(completionError),
      });
    }
    return json({ error: "cleanup_failed" }, 500);
  }
});
