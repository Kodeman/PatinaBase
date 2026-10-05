// deno-lint-ignore-file no-import-prefix

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  bearerRole,
  buildBoardReferenceCounts,
  type CandidateRow,
  destructiveCleanupEnabled,
  normalizeBoardObjectReference,
  planCleanup,
  resolveBoardCropReference,
  resolveCleanupMode,
} from "./core.ts";

const OWNER = "11111111-1111-4111-8111-111111111111";
const BOARD = "22222222-2222-4222-8222-222222222222";
const OTHER_BOARD = "33333333-3333-4333-8333-333333333333";
const BASE = `${OWNER}/boards/${BOARD}`;

function publicUrl(key: string): string {
  return `https://strata.example/storage/v1/object/public/proposal-mood-boards/${key}`;
}

function fakeJwt(role: string): string {
  const encode = (value: string) =>
    btoa(value)
      .replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `${encode('{"alg":"HS256"}')}.${encode(JSON.stringify({ role }))}.sig`;
}

function candidate(
  objectName: string,
  overrides: Partial<CandidateRow> = {},
): CandidateRow {
  return {
    bucket_id: "proposal-mood-boards",
    object_name: objectName,
    first_unreferenced_at: "2026-07-01T00:00:00.000Z",
    last_scanned_at: "2026-07-01T00:00:00.000Z",
    eligible_after: "2026-07-15T00:00:00.000Z",
    last_reference_count: 0,
    deleted_at: null,
    last_job_run_id: 1,
    detail: {},
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

Deno.test("service boundary accepts only a service-role claim after gateway auth", () => {
  assertEquals(bearerRole(`Bearer ${fakeJwt("service_role")}`), "service_role");
  assertEquals(
    bearerRole(`Bearer ${fakeJwt("authenticated")}`),
    "authenticated",
  );
  assertEquals(bearerRole("Bearer malformed"), null);
  assertEquals(bearerRole(null), null);
});

Deno.test("cleanup mode is dry-run by default and requires both deletion gates", () => {
  assertEquals(destructiveCleanupEnabled(undefined), false);
  assertEquals(destructiveCleanupEnabled("TRUE"), false);
  assertEquals(destructiveCleanupEnabled("true"), true);

  assertEquals(resolveCleanupMode(undefined, false), {
    requested_dry_run: true,
    destructive_requested: false,
    destructive_enabled: false,
    dry_run: true,
    forced_dry_run: false,
  });
  assertEquals(resolveCleanupMode(false, false).dry_run, true);
  assertEquals(resolveCleanupMode(false, false).forced_dry_run, true);
  assertEquals(resolveCleanupMode("false", true).dry_run, true);
  assertEquals(resolveCleanupMode(false, true).dry_run, false);
});

Deno.test("object normalization is confined to the mood-board board namespace", () => {
  const key = `${BASE}/source image.jpg`;
  assertEquals(normalizeBoardObjectReference(key), key);
  assertEquals(
    normalizeBoardObjectReference(
      `proposal-mood-boards/${BASE}/source%20image.jpg`,
    ),
    key,
  );
  assertEquals(
    normalizeBoardObjectReference(
      `https://strata.example/storage/v1/object/public/proposal-mood-boards/${BASE}/source%20image.jpg?download=1`,
    ),
    key,
  );
  assertEquals(
    normalizeBoardObjectReference(
      `https://strata.example/storage/v1/render/image/public/proposal-mood-boards/${BASE}/thumb.webp?width=300`,
    ),
    `${BASE}/thumb.webp`,
  );

  const rejected = [
    `https://strata.example/storage/v1/object/public/other-bucket/${BASE}/x.jpg`,
    `https://example.com/x/proposal-mood-boards/${BASE}/x.jpg`,
    `${OWNER}/not-boards/${BOARD}/x.jpg`,
    `not-a-uuid/boards/${BOARD}/x.jpg`,
    `${OWNER}/boards/not-a-uuid/x.jpg`,
    `${BASE}/%2e%2e/secret.jpg`,
    `${BASE}/nested%2Fescape.jpg`,
  ];
  for (const value of rejected) {
    assertEquals(normalizeBoardObjectReference(value), null, value);
  }
});

// ── SQ-387: crops on project boards (project-ffe-working) ──────────────────

const PROJECT = "44444444-4444-4444-8444-444444444444";
const OTHER_PROJECT = "55555555-5555-4555-8555-555555555555";
const PROJECT_SCOPE = { boardId: BOARD, projectId: PROJECT };
const PROJECT_KEY = `${PROJECT}/boards/${BOARD}/66666666-6666-4666-8666-666666666666.webp`;
const WORKING = "https://strata.example/storage/v1/object";

Deno.test("SQ-387: a project-board raw key resolves to the working bucket", () => {
  assertEquals(resolveBoardCropReference(PROJECT_KEY, PROJECT_SCOPE), {
    bucket: "project-ffe-working",
    path: PROJECT_KEY,
  });
  // The project id is matched however the stored uuid is cased.
  assertEquals(
    resolveBoardCropReference(PROJECT_KEY, { boardId: BOARD.toUpperCase(), projectId: PROJECT.toUpperCase() }),
    { bucket: "project-ffe-working", path: PROJECT_KEY },
  );
});

Deno.test("SQ-387: a project-board signed or public URL resolves to the working bucket", () => {
  for (
    const url of [
      `${WORKING}/sign/project-ffe-working/${PROJECT_KEY}?token=eyJhbGciOi.eyJ1cmwiOi.c2ln`,
      `${WORKING}/public/project-ffe-working/${PROJECT_KEY}`,
    ]
  ) {
    assertEquals(resolveBoardCropReference(url, PROJECT_SCOPE), {
      bucket: "project-ffe-working",
      path: PROJECT_KEY,
    }, url);
  }
});

Deno.test("SQ-387: a key under another project is refused", () => {
  const foreign = `${OTHER_PROJECT}/boards/${BOARD}/x.webp`;
  assertEquals(resolveBoardCropReference(foreign, PROJECT_SCOPE), null);
  assertEquals(resolveBoardCropReference(`${WORKING}/sign/project-ffe-working/${foreign}?token=t`, PROJECT_SCOPE), null);
});

Deno.test("SQ-387: a key under another board of the same project is refused", () => {
  const sibling = `${PROJECT}/boards/${OTHER_BOARD}/x.webp`;
  assertEquals(resolveBoardCropReference(sibling, PROJECT_SCOPE), null);
  assertEquals(resolveBoardCropReference(`${WORKING}/public/project-ffe-working/${sibling}`, PROJECT_SCOPE), null);
  // A board-less or flat key is no board picture.
  assertEquals(resolveBoardCropReference(`${PROJECT}/x.webp`, PROJECT_SCOPE), null);
  assertEquals(resolveBoardCropReference(`${PROJECT}/boards/${BOARD}`, PROJECT_SCOPE), null);
});

Deno.test("SQ-387: traversal, encoded traversal and unsafe names are refused", () => {
  const base = `${PROJECT}/boards/${BOARD}`;
  const rejected = [
    `${base}/../../${OTHER_PROJECT}/boards/${OTHER_BOARD}/x.webp`,
    `${base}/%2e%2e/%2E%2E/${OTHER_PROJECT}/x.webp`,
    `${base}/.%2e/x.webp`,
    `${base}/./x.webp`,
    `${base}/nested%2Fescape.webp`,
    `${base}/%252e%252e/x.webp`,
    `${base}/x.webp%3Fdownload`,
    `/${PROJECT_KEY}`,
    `project-ffe-working/${PROJECT_KEY}`,
    `${WORKING}/sign/project-ffe-working/${base}/../../${OTHER_PROJECT}/boards/${BOARD}/x.webp?token=t`,
    `${WORKING}/sign/project-ffe-working/${base}/%2e%2e/x.webp?token=t`,
    `${WORKING}/sign/project-ffe-working/${PROJECT}/boards/${OTHER_BOARD}/..\\..\\${BOARD}/x.webp`,
    `https://example.com/x/project-ffe-working/${PROJECT_KEY}`,
    `${WORKING}/sign/other-bucket/${PROJECT_KEY}?token=t`,
    `ftp://strata.example/storage/v1/object/public/project-ffe-working/${PROJECT_KEY}`,
  ];
  for (const value of rejected) {
    assertEquals(resolveBoardCropReference(value, PROJECT_SCOPE), null, value);
  }
});

Deno.test("SQ-387: proposal-board references resolve exactly as before", () => {
  const values = [
    `${BASE}/source image.jpg`,
    `proposal-mood-boards/${BASE}/source%20image.jpg`,
    publicUrl(`${BASE}/thumb.webp`),
    `https://strata.example/storage/v1/object/sign/proposal-mood-boards/${BASE}/x.webp?token=t`,
    `${BASE}/%2e%2e/secret.jpg`,
    PROJECT_KEY,
    `${WORKING}/sign/project-ffe-working/${PROJECT_KEY}?token=t`,
    null,
    "",
  ];
  for (const scope of [null, { boardId: BOARD, projectId: null }]) {
    for (const value of values) {
      const path = normalizeBoardObjectReference(value);
      assertEquals(
        resolveBoardCropReference(value, scope),
        path ? { bucket: "proposal-mood-boards", path } : null,
        String(value),
      );
    }
  }
  // On a project board a proposal-bucket Storage URL still names that bucket,
  // but a raw key is read as a working-bucket key and never falls back.
  assertEquals(resolveBoardCropReference(publicUrl(`${BASE}/thumb.webp`), PROJECT_SCOPE), {
    bucket: "proposal-mood-boards",
    path: `${BASE}/thumb.webp`,
  });
  assertEquals(resolveBoardCropReference(`${BASE}/thumb.webp`, PROJECT_SCOPE), null);
});

Deno.test("reference fixture keeps live, frozen, template, original, thumbnail, and cover assets", () => {
  const shared = `${OWNER}/boards/${OTHER_BOARD}/shared.jpg`;
  const original = `${BASE}/original.jpg`;
  const thumbnail = `${BASE}/thumbnail.webp`;
  const snapshot = `${BASE}/snapshot.jpg`;
  const template = `${BASE}/template.jpg`;
  const cover = `${BASE}/cover.png`;
  const sharedEdition = `${BASE}/shared-edition.webp`;
  const orphan = `${BASE}/orphan.jpg`;

  const counts = buildBoardReferenceCounts({
    liveItems: [
      { image_url: publicUrl(shared), data: {} },
      {
        image_url: null,
        data: {
          media: {
            original_image_url: publicUrl(original),
            derivatives: { thumbnail: { url: publicUrl(thumbnail) } },
          },
        },
      },
    ],
    projectSnapshots: [{
      cover_image_url: null,
      items: [{ data: { image_url: publicUrl(snapshot) } }],
    }],
    templates: [{
      cover_url: null,
      items: [{ image: { url: publicUrl(template) } }],
      sections: [],
    }],
    boards: [{
      id: BOARD,
      proposal_id: OWNER,
      project_id: null,
      cover_image_url: null,
    }],
    shares: [{
      board_payload: { board: { items: [{ image_url: publicUrl(sharedEdition) }] } },
    }],
  });

  for (const key of [shared, original, thumbnail, snapshot, template, cover, sharedEdition]) {
    assert((counts.get(key) ?? 0) > 0, `${key} should remain live`);
  }
  assertEquals(counts.get(orphan), undefined);

  const plan = planCleanup({
    objectNames: [
      shared,
      original,
      thumbnail,
      snapshot,
      template,
      cover,
      sharedEdition,
      orphan,
    ],
    referenceCounts: counts,
    candidates: [],
    now: new Date("2026-08-03T00:00:00.000Z"),
    dryRun: false,
    destructiveEnabled: true,
  });
  assertEquals(plan.newCandidateNames, [orphan]);
  assertEquals(plan.deleteObjectNames, []);
  assertEquals(plan.eligibleObjectNames, []);
});

Deno.test("two-pass plan never deletes first sight and dry-run never deletes eligible rows", () => {
  const firstSight = `${BASE}/first.jpg`;
  const eligible = `${BASE}/eligible.jpg`;
  const existing = candidate(eligible);

  const dryRun = planCleanup({
    objectNames: [firstSight, eligible],
    referenceCounts: new Map(),
    candidates: [existing],
    now: new Date("2026-08-03T00:00:00.000Z"),
    dryRun: true,
    destructiveEnabled: true,
  });
  assertEquals(dryRun.newCandidateNames, [firstSight]);
  assertEquals(dryRun.eligibleObjectNames, [eligible]);
  assertEquals(dryRun.deleteObjectNames, []);

  const disabled = planCleanup({
    objectNames: [eligible],
    referenceCounts: new Map(),
    candidates: [existing],
    now: new Date("2026-08-03T00:00:00.000Z"),
    dryRun: false,
    destructiveEnabled: false,
  });
  assertEquals(disabled.deleteObjectNames, []);

  const armed = planCleanup({
    objectNames: [eligible],
    referenceCounts: new Map(),
    candidates: [existing],
    now: new Date("2026-08-03T00:00:00.000Z"),
    dryRun: false,
    destructiveEnabled: true,
  });
  assertEquals(armed.deleteObjectNames, [eligible]);
});

Deno.test("reference restoration and missing storage reset the continuous grace window", () => {
  const restored = `${BASE}/restored.jpg`;
  const missing = `${BASE}/missing.jpg`;
  const deletionReceipt = `${BASE}/deleted.jpg`;
  const counts = new Map([[restored, 1]]);
  const plan = planCleanup({
    objectNames: [restored],
    referenceCounts: counts,
    candidates: [
      candidate(restored),
      candidate(missing),
      candidate(deletionReceipt, {
        deleted_at: "2026-07-20T00:00:00.000Z",
      }),
    ],
    now: new Date("2026-08-03T00:00:00.000Z"),
    dryRun: true,
    destructiveEnabled: false,
  });
  assertEquals(plan.resetCandidateNames, [missing, restored]);
  assertEquals(plan.newCandidateNames, []);
});
