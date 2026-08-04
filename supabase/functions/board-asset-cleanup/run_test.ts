// deno-lint-ignore-file no-import-prefix

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BOARD_ASSET_BUCKET,
  type BoardReferenceDataset,
  buildBoardReferenceCounts,
  type CandidateRow,
  normalizeBoardObjectReference,
  type ReferenceCounts,
  resolveCleanupMode,
} from "./core.ts";
import { type BoardAssetCleanupRunPort, runBoardAssetCleanup } from "./run.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const BOARD = "22222222-2222-4222-8222-222222222222";
const SECOND_BOARD = "33333333-3333-4333-8333-333333333333";
const BASE = `${OWNER}/boards/${BOARD}`;

function publicUrl(objectName: string): string {
  return `https://strata.example/storage/v1/object/public/${BOARD_ASSET_BUCKET}/${objectName}`;
}

class MemoryCleanupPort implements BoardAssetCleanupRunPort {
  readonly objects: Set<string>;
  readonly candidates = new Map<string, CandidateRow>();
  readonly finishes: Array<{
    status: "succeeded" | "failed" | "skipped";
    detail: Record<string, unknown>;
    error: string | null;
  }> = [];
  readonly deletionRequests: string[][] = [];

  constructor(
    readonly dataset: BoardReferenceDataset,
    objectNames: string[],
  ) {
    this.objects = new Set(objectNames);
  }

  async loadReferenceDataset(): Promise<BoardReferenceDataset> {
    return structuredClone(this.dataset);
  }

  async listBoardObjects(): Promise<string[]> {
    return [...this.objects].sort();
  }

  async loadCandidates(): Promise<CandidateRow[]> {
    return [...this.candidates.values()].map((row) => structuredClone(row));
  }

  async resetCandidates(objectNames: string[]): Promise<void> {
    for (const objectName of objectNames) this.candidates.delete(objectName);
  }

  async insertCandidates(
    objectNames: string[],
    now: Date,
    jobRunId: number,
  ): Promise<void> {
    const observedAt = now.toISOString();
    const eligibleAfter = new Date(
      now.getTime() + 14 * 24 * 60 * 60 * 1_000,
    ).toISOString();
    for (const objectName of objectNames) {
      if (this.candidates.has(objectName)) continue;
      this.candidates.set(objectName, {
        bucket_id: BOARD_ASSET_BUCKET,
        object_name: objectName,
        first_unreferenced_at: observedAt,
        last_scanned_at: observedAt,
        eligible_after: eligibleAfter,
        last_reference_count: 0,
        deleted_at: null,
        last_job_run_id: jobRunId,
        detail: { state: "candidate" },
        created_at: observedAt,
      });
    }
  }

  async observeCandidates(
    candidates: CandidateRow[],
    referenceCounts: ReferenceCounts,
    now: Date,
    jobRunId: number,
  ): Promise<void> {
    for (const candidate of candidates) {
      this.candidates.set(candidate.object_name, {
        ...candidate,
        last_scanned_at: now.toISOString(),
        last_reference_count: referenceCounts.get(candidate.object_name) ?? 0,
        last_job_run_id: jobRunId,
      });
    }
  }

  async deleteEligibleObjects(
    objectNames: string[],
    now: Date,
    jobRunId: number,
  ): Promise<{ deleted: number; rescued: number }> {
    this.deletionRequests.push([...objectNames]);
    const latestCounts = buildBoardReferenceCounts(this.dataset);
    let deleted = 0;
    let rescued = 0;
    for (const requested of objectNames) {
      const objectName = normalizeBoardObjectReference(requested);
      const candidate = objectName ? this.candidates.get(objectName) : null;
      if (
        !objectName || !candidate ||
        (latestCounts.get(objectName) ?? 0) > 0 ||
        candidate.deleted_at !== null ||
        Date.parse(candidate.eligible_after) > now.getTime()
      ) {
        rescued += 1;
        continue;
      }
      assert(this.objects.delete(objectName), "eligible object must exist");
      this.candidates.set(objectName, {
        ...candidate,
        deleted_at: now.toISOString(),
        last_scanned_at: now.toISOString(),
        last_job_run_id: jobRunId,
        detail: { state: "deleted", deleted_by_job_run_id: jobRunId },
      });
      deleted += 1;
    }
    return { deleted, rescued };
  }

  async finishRun(
    status: "succeeded" | "failed" | "skipped",
    detail: Record<string, unknown>,
    error: string | null = null,
  ): Promise<void> {
    this.finishes.push({ status, detail: structuredClone(detail), error });
  }
}

Deno.test(
  "seeded cleanup workflow preserves every reference leg and deletes only after continuous grace",
  async () => {
    const pastedFromSecondBoard = `${OWNER}/boards/${SECOND_BOARD}/pasted.jpg`;
    const original = `${BASE}/original.jpg`;
    const template = `${BASE}/template.jpg`;
    const frozenSnapshot = `${BASE}/snapshot.jpg`;
    const cover = `${BASE}/cover.png`;
    const orphan = `${BASE}/orphan.jpg`;
    const dataset: BoardReferenceDataset = {
      liveItems: [
        { image_url: publicUrl(pastedFromSecondBoard), data: {} },
        {
          image_url: null,
          data: { original_image_url: publicUrl(original) },
        },
      ],
      projectSnapshots: [{
        cover_image_url: null,
        items: [{ data: { image_url: publicUrl(frozenSnapshot) } }],
      }],
      templates: [{
        cover_url: null,
        items: [{ image_url: publicUrl(template) }],
        sections: [],
      }],
      boards: [{
        id: BOARD,
        proposal_id: OWNER,
        project_id: null,
        cover_image_url: null,
      }],
    };
    const referenced = [
      pastedFromSecondBoard,
      original,
      template,
      frozenSnapshot,
      cover,
    ];
    const port = new MemoryCleanupPort(dataset, [...referenced, orphan]);
    const firstSeen = new Date("2026-08-03T12:00:00.000Z");

    const first = await runBoardAssetCleanup({
      port,
      jobRunId: 101,
      now: firstSeen,
      mode: resolveCleanupMode(true, true),
    });

    assertEquals([...port.candidates.keys()], [orphan]);
    assertEquals([...port.objects].sort(), [...referenced, orphan].sort());
    assertEquals(port.deletionRequests, []);
    assertEquals(first.candidates_first_seen, 1);
    assertEquals(first.deleted_objects, 0);
    assertEquals(port.finishes[0].status, "succeeded");
    assertEquals(port.finishes[0].detail, first);

    const beforeGrace = new Date(
      firstSeen.getTime() + (14 * 24 * 60 * 60 - 1) * 1_000,
    );
    const second = await runBoardAssetCleanup({
      port,
      jobRunId: 102,
      now: beforeGrace,
      mode: resolveCleanupMode(false, true),
    });
    assertEquals(second.eligible_objects, 0);
    assertEquals(second.deleted_objects, 0);
    assert(port.objects.has(orphan));

    const afterGrace = new Date(
      firstSeen.getTime() + (14 * 24 * 60 * 60 + 1) * 1_000,
    );
    const third = await runBoardAssetCleanup({
      port,
      jobRunId: 103,
      now: afterGrace,
      mode: resolveCleanupMode(false, true),
    });

    assertEquals(port.deletionRequests, [[orphan]]);
    assertEquals(third.eligible_objects, 1);
    assertEquals(third.deleted_objects, 1);
    assert(!port.objects.has(orphan));
    for (const objectName of referenced) assert(port.objects.has(objectName));
    assertEquals(
      port.candidates.get(orphan)?.deleted_at,
      afterGrace.toISOString(),
    );
    assertEquals(port.finishes.length, 3);
    assertEquals(port.finishes[2].status, "succeeded");
    assertEquals(port.finishes[2].detail, third);
  },
);
