// deno-lint-ignore-file no-import-prefix

import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  type ClaimedArtifact,
  type FrozenRevision,
  type ProjectDocumentRecord,
  runSpecBookRender,
  SpecBookRenderError,
  type SpecBookRenderRepository,
} from "./core.ts";
import {
  canonicalStringify,
  type RenderMedia,
  sha256Hex,
} from "./render-model.ts";
import { frozenSnapshot } from "./test-fixtures.ts";

const ARTIFACT_ID = "40000000-0000-4000-8000-000000000001";
const REVISION_ID = "30000000-0000-4000-8000-000000000001";

class FakeRepository implements SpecBookRenderRepository {
  claim: ClaimedArtifact | null = {
    id: ARTIFACT_ID,
    revisionId: REVISION_ID,
    audience: "client",
    format: "pdf",
    attemptCount: 1,
    mode: "render",
  };
  revision!: FrozenRevision;
  baseRevision: FrozenRevision | null = null;
  uploadError: Error | null = null;
  finalizeError: Error | null = null;
  uploads: Array<{ path: string; bytes: Uint8Array }> = [];
  documents: ProjectDocumentRecord[] = [];
  ready: unknown[] = [];
  failed: Array<{ id: string; code: string; message: string }> = [];
  finalizeCalls: string[] = [];
  loadRevisionCalls = 0;
  loadBaseRevisionCalls = 0;
  resolveImageCalls = 0;

  claimArtifact(): Promise<ClaimedArtifact | null> {
    return Promise.resolve(this.claim);
  }
  loadRevision(): Promise<FrozenRevision> {
    this.loadRevisionCalls += 1;
    return Promise.resolve(this.revision);
  }
  loadBaseRevision(): Promise<FrozenRevision | null> {
    this.loadBaseRevisionCalls += 1;
    return Promise.resolve(this.baseRevision);
  }
  resolveImage(_media: RenderMedia): Promise<string | null> {
    this.resolveImageCalls += 1;
    return Promise.resolve(null);
  }
  uploadPdf(path: string, bytes: Uint8Array): Promise<void> {
    if (this.uploadError) return Promise.reject(this.uploadError);
    this.uploads.push({ path, bytes });
    return Promise.resolve();
  }
  upsertProjectDocument(record: ProjectDocumentRecord): Promise<string> {
    this.documents.push(record);
    return Promise.resolve(record.id);
  }
  markArtifactReady(input: unknown): Promise<void> {
    this.ready.push(input);
    return Promise.resolve();
  }
  markArtifactFailed(id: string, code: string, message: string): Promise<void> {
    this.failed.push({ id, code, message });
    return Promise.resolve();
  }
  finalizeRevision(id: string): Promise<void> {
    this.finalizeCalls.push(id);
    return this.finalizeError
      ? Promise.reject(this.finalizeError)
      : Promise.resolve();
  }
}

async function repository(): Promise<FakeRepository> {
  const repo = new FakeRepository();
  const snapshot = frozenSnapshot();
  repo.revision = {
    id: REVISION_ID,
    specBookId: "10000000-0000-4000-8000-000000000001",
    revisionNumber: 1,
    issueType: "full",
    baseRevisionId: null,
    renderSnapshot: snapshot,
    snapshotChecksum: await sha256Hex(canonicalStringify(snapshot)),
    createdBy: "50000000-0000-4000-8000-000000000001",
    createdAt: "2026-07-30T15:05:00.000Z",
  };
  return repo;
}

Deno.test("successful render archives deterministic path, upserts document, and marks ready", async () => {
  const repo = await repository();
  const result = await runSpecBookRender(repo, ARTIFACT_ID);
  const path = "20000000-0000-4000-8000-000000000001/spec-books/" +
    `${REVISION_ID}/client.pdf`;
  assertEquals(result.storagePath, path);
  assertEquals(result.finalized, true);
  assertEquals(repo.uploads.length, 1);
  assertEquals(repo.uploads[0].path, path);
  assertEquals(repo.documents[0].id, ARTIFACT_ID);
  assertEquals(
    repo.documents[0].projectId,
    "20000000-0000-4000-8000-000000000001",
  );
  assertEquals(repo.documents[0].version, "r1");
  assertEquals(repo.ready.length, 1);
  assertEquals(repo.failed, []);
  assertEquals(repo.finalizeCalls, [REVISION_ID]);
});

Deno.test("production finalization guard lets the later sibling finalize", async () => {
  const early = await repository();
  const later = await repository();
  const laterArtifactId = "40000000-0000-4000-8000-000000000002";
  later.claim = {
    ...later.claim!,
    id: laterArtifactId,
    audience: "vendor",
  };

  const readyAudiences = new Set<string>();
  let releaseLater!: () => void;
  const earlyFinalizeAttempted = new Promise<void>((resolve) => {
    releaseLater = resolve;
  });
  early.markArtifactReady = (input: unknown): Promise<void> => {
    early.ready.push(input);
    readyAudiences.add("client");
    return Promise.resolve();
  };
  early.finalizeRevision = (id: string): Promise<void> => {
    early.finalizeCalls.push(id);
    releaseLater();
    return Promise.reject(
      new SpecBookRenderError(
        "finalization_guard",
        "all requested artifacts must be durable before finalization",
      ),
    );
  };
  later.markArtifactReady = async (input: unknown): Promise<void> => {
    await earlyFinalizeAttempted;
    later.ready.push(input);
    readyAudiences.add("vendor");
  };
  later.finalizeRevision = (id: string): Promise<void> => {
    later.finalizeCalls.push(id);
    return readyAudiences.size === 2
      ? Promise.resolve()
      : Promise.reject(new Error("later audience finalized too early"));
  };

  const [earlyResult, laterResult] = await Promise.all([
    runSpecBookRender(early, ARTIFACT_ID),
    runSpecBookRender(later, laterArtifactId),
  ]);
  assertEquals(earlyResult.finalized, false);
  assertEquals(laterResult.finalized, true);
  assertEquals(early.ready.length, 1);
  assertEquals(later.ready.length, 1);
  assertEquals(early.failed, []);
  assertEquals(later.failed, []);
});

Deno.test("non-guard finalization failures remain fatal after the artifact is durable", async () => {
  const repo = await repository();
  repo.finalizeError = new SpecBookRenderError(
    "finalization_guard",
    "database connection unavailable",
  );
  await assertRejects(
    () => runSpecBookRender(repo, ARTIFACT_ID),
    SpecBookRenderError,
    "database connection unavailable",
  );
  assertEquals(repo.ready.length, 1);
  assertEquals(repo.failed, []);
});

Deno.test("ready artifact retry finalizes existing durable identity without rendering or mutation", async () => {
  const repo = await repository();
  repo.claim = {
    id: ARTIFACT_ID,
    revisionId: REVISION_ID,
    audience: "client",
    format: "pdf",
    attemptCount: 2,
    mode: "finalize",
    storagePath: "project/spec-books/revision/client.pdf",
    checksumSha256: "a".repeat(64),
    sizeBytes: 486,
  };

  const first = await runSpecBookRender(repo, ARTIFACT_ID);
  const second = await runSpecBookRender(repo, ARTIFACT_ID);

  assertEquals(first, second);
  assertEquals(first.finalized, true);
  assertEquals(first.storagePath, "project/spec-books/revision/client.pdf");
  assertEquals(first.checksumSha256, "a".repeat(64));
  assertEquals(first.sizeBytes, 486);
  assertEquals(repo.loadRevisionCalls, 0);
  assertEquals(repo.loadBaseRevisionCalls, 0);
  assertEquals(repo.resolveImageCalls, 0);
  assertEquals(repo.uploads, []);
  assertEquals(repo.documents, []);
  assertEquals(repo.ready, []);
  assertEquals(repo.failed, []);
  assertEquals(repo.finalizeCalls, [REVISION_ID, REVISION_ID]);
});

Deno.test("upload failure marks the same artifact failed and retryable", async () => {
  const repo = await repository();
  repo.uploadError = new Error("storage temporarily unavailable");
  await assertRejects(
    () => runSpecBookRender(repo, ARTIFACT_ID),
    Error,
    "storage temporarily unavailable",
  );
  assertEquals(repo.ready, []);
  assertEquals(repo.failed, [{
    id: ARTIFACT_ID,
    code: "render_failed",
    message: "storage temporarily unavailable",
  }]);
});

Deno.test("snapshot checksum mismatch fails before image resolution or upload", async () => {
  const repo = await repository();
  repo.revision.snapshotChecksum = "0".repeat(64);
  await assertRejects(
    () => runSpecBookRender(repo, ARTIFACT_ID),
    SpecBookRenderError,
    "checksum mismatch",
  );
  assertEquals(repo.uploads, []);
  assertEquals(repo.failed[0].code, "snapshot_checksum_mismatch");
});

Deno.test("addendum rejects a base snapshot checksum mismatch before rendering", async () => {
  const repo = await repository();
  const base = await repository();
  repo.revision.issueType = "addendum";
  repo.revision.baseRevisionId = base.revision.id;
  repo.revision.renderSnapshot = frozenSnapshot({
    issue: {
      type: "addendum",
      reason: "Finish revision",
      baseRevisionId: base.revision.id,
    },
  });
  repo.revision.snapshotChecksum = await sha256Hex(
    canonicalStringify(repo.revision.renderSnapshot),
  );
  repo.baseRevision = base.revision;
  repo.baseRevision.snapshotChecksum = "0".repeat(64);

  await assertRejects(
    () => runSpecBookRender(repo, ARTIFACT_ID),
    SpecBookRenderError,
    "base snapshot checksum mismatch",
  );
  assertEquals(repo.uploads, []);
  assertEquals(repo.failed[0].code, "base_snapshot_checksum_mismatch");
});

Deno.test("non-claimable ready or concurrently claimed artifact does not mutate failure state", async () => {
  const repo = await repository();
  repo.claim = null;
  await assertRejects(
    () => runSpecBookRender(repo, ARTIFACT_ID),
    SpecBookRenderError,
    "not pending",
  );
  assertEquals(repo.failed, []);
});
