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
  buildAudienceRenderModel,
  canonicalStringify,
  type RenderMedia,
  sha256Hex,
} from "./render-model.ts";
import { buildPagePlan, selectionRows } from "./pdf.ts";
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

// F7 (SQ-1292). A typed round client price over a cost that does not divide it
// stores a repeating markup (00809). The pins below are psql output on the same
// snapshot: `wire` is the jsonb text PostgREST delivers, `sql` is
// _spec_book_canonical_json of it and `checksum` its sha256, as
// prepare_spec_book_issue computes. 00818 rounds markupPercent to four places.
const F7_SNAPSHOT_PINS = {
  pre00818: {
    wire:
      '{"items": [{"pricing": {"currency": "USD", "markupPercent": 33.3333333333333333, "tradePriceCents": 180000, "clientPriceCents": 240000}, "quantity": 1, "ffeItemId": "81800000-0000-4000-8000-000000000501"}, {"pricing": {"currency": "USD", "markupPercent": 42.8571428571428571, "tradePriceCents": 70000, "clientPriceCents": 100000}, "quantity": 3, "ffeItemId": "81800000-0000-4000-8000-000000000502"}], "contractVersion": 1}',
    sql:
      '{"contractVersion":1,"items":[{"ffeItemId":"81800000-0000-4000-8000-000000000501","pricing":{"clientPriceCents":240000,"currency":"USD","markupPercent":33.3333333333333333,"tradePriceCents":180000},"quantity":1},{"ffeItemId":"81800000-0000-4000-8000-000000000502","pricing":{"clientPriceCents":100000,"currency":"USD","markupPercent":42.8571428571428571,"tradePriceCents":70000},"quantity":3}]}',
    checksum:
      "a293abdfa689dcf23e4cd223a06ccb7b9d57d6dc379562473adfdb8f176b7f62",
  },
  post00818: {
    wire:
      '{"items": [{"pricing": {"currency": "USD", "markupPercent": 33.3333, "tradePriceCents": 180000, "clientPriceCents": 240000}, "quantity": 1, "ffeItemId": "81800000-0000-4000-8000-000000000501"}, {"pricing": {"currency": "USD", "markupPercent": 42.8571, "tradePriceCents": 70000, "clientPriceCents": 100000}, "quantity": 3, "ffeItemId": "81800000-0000-4000-8000-000000000502"}], "contractVersion": 1}',
    sql:
      '{"contractVersion":1,"items":[{"ffeItemId":"81800000-0000-4000-8000-000000000501","pricing":{"clientPriceCents":240000,"currency":"USD","markupPercent":33.3333,"tradePriceCents":180000},"quantity":1},{"ffeItemId":"81800000-0000-4000-8000-000000000502","pricing":{"clientPriceCents":100000,"currency":"USD","markupPercent":42.8571,"tradePriceCents":70000},"quantity":3}]}',
    checksum:
      "9056f0acba43ddf0d8b80385a736fc69f5500961d1a59db538a39659370640ce",
  },
};

Deno.test("F7: a 00818 repeating-decimal snapshot round-trips through JSON.parse and canonicalStringify to the SQL checksum", async () => {
  const fixed = F7_SNAPSHOT_PINS.post00818;
  const text = canonicalStringify(JSON.parse(fixed.wire));
  assertEquals(text, fixed.sql);
  assertEquals(await sha256Hex(text), fixed.checksum);

  // Why 00818 rounds: the full-precision markup does not survive the parse.
  const unrounded = F7_SNAPSHOT_PINS.pre00818;
  const drifted = canonicalStringify(JSON.parse(unrounded.wire));
  assertEquals(drifted.includes('"markupPercent":33.333333333333336'), true);
  assertEquals(drifted === unrounded.sql, false);
});

Deno.test("F7: the renderer accepts a frozen snapshot whose markup is a rounded repeating decimal", async () => {
  // The edge function gets render_snapshot through JSON.parse and the
  // checksum SQL computed. SQL prints a JSON number's digits exactly; every
  // other number in the fixture is an integer, which both sides print alike.
  const markupLiteral = "33.3333"; // trim_scale(round(33.3333333333333333, 4))
  const snapshot = frozenSnapshot();
  const items = snapshot.items as Array<Record<string, unknown>>;
  items[0].pricing = {
    ...(items[0].pricing as Record<string, unknown>),
    markupPercent: "__F7_MARKUP__",
  };
  const wire = JSON.stringify(snapshot).replace(
    '"__F7_MARKUP__"',
    markupLiteral,
  );
  const sqlCanonical = canonicalStringify(snapshot).replace(
    '"__F7_MARKUP__"',
    markupLiteral,
  );

  const repo = await repository();
  repo.claim = { ...repo.claim!, audience: "internal" };
  repo.revision.renderSnapshot = JSON.parse(wire);
  repo.revision.snapshotChecksum = await sha256Hex(sqlCanonical);
  const result = await runSpecBookRender(repo, ARTIFACT_ID).catch(() => null);
  assertEquals(repo.failed, []);
  assertEquals(repo.uploads.length, 1);
  assertEquals(result?.finalized, true);
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

Deno.test("SKU without value and na false has no printed row", () => {
  assertEquals(selectionRows({ sku: { na: false } }), []);
});

Deno.test("SKU value prints instead of the na boolean", () => {
  assertEquals(selectionRows({ sku: { na: false, value: "EW-600" } }), [
    ["sku", "EW-600"],
  ]);
});

Deno.test("SKU marked na true prints N/A", () => {
  assertEquals(selectionRows({ sku: { na: true, value: "EW-600" } }), [
    ["sku", "N/A"],
  ]);
});

Deno.test("object dimensions print labeled W D H and one unit", () => {
  assertEquals(
    selectionRows({
      dimensions: { value: { depth: 68, height: 82, unit: "in", width: 22 } },
    }),
    [["dimensions", "W 22 × D 68 × H 82 in"]],
  );
});

Deno.test("partial object dimensions print only present axes", () => {
  assertEquals(
    selectionRows({
      dimensions: { value: { height: 82, unit: "in", width: 22 } },
    }),
    [["dimensions", "W 22 × H 82 in"]],
  );
});

Deno.test("diameter and seat height dimensions retain both measurements", () => {
  assertEquals(
    selectionRows({
      dimensions: { value: { diameter: 42, seatHeight: 18, unit: "in" } },
    }),
    [["dimensions", "Dia 42 in · Seat H 18 in"]],
  );
});

Deno.test("W D H dimensions retain additional measurements in stable order", () => {
  assertEquals(
    selectionRows({
      dimensions: {
        value: {
          seatDepth: 19,
          diameter: 42,
          height: 82,
          depth: 68,
          width: 22,
          unit: "in",
        },
      },
    }),
    [["dimensions", "W 22 × D 68 × H 82 in · Dia 42 in · Seat Depth 19 in"]],
  );
});

Deno.test("dimensions accept the units alias", () => {
  assertEquals(
    selectionRows({
      dimensions: { value: { width: 60, depth: 40, units: "cm" } },
    }),
    [["dimensions", "W 60 × D 40 cm"]],
  );
});

Deno.test("N/A selection retains its reason", () => {
  assertEquals(
    selectionRows({ sku: { na: true, naReason: "By approved drawing" } }),
    [["sku", "N/A — By approved drawing"]],
  );
});

Deno.test("N/A selection without a reason remains bare", () => {
  assertEquals(
    selectionRows({ sku: { na: true, value: "EW-600" } }),
    [["sku", "N/A"]],
  );
  assertEquals(selectionRows({ dimensions: { na: true } }), [[
    "dimensions",
    "N/A",
  ]]);
});

Deno.test("unresolved dimensions finish and material omit empty na false envelopes", () => {
  assertEquals(
    selectionRows({
      dimensions: { na: false },
      finish: { na: false },
      material: { na: false },
    }),
    [],
  );
});

Deno.test("client trade chapter is labeled Category; internal remains Trade", async () => {
  for (const audience of ["client", "internal"] as const) {
    const model = await buildAudienceRenderModel(frozenSnapshot(), audience, {
      revisionNumber: 1,
      createdAt: "2026-07-30T15:05:00.000Z",
      issueType: "full",
    });
    model.chapters[0].kind = "trade";
    const divider = buildPagePlan(model).find((page) =>
      page.kind === "chapter" && page.chapterId === model.chapters[0].id
    );
    assertEquals(
      divider?.kind === "chapter" && divider.eyebrow,
      audience === "client" ? "Category" : "Trade",
    );
  }
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
