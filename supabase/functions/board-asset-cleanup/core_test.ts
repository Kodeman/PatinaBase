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
