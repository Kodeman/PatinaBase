// deno test --no-check -A --config supabase/functions/deno.json supabase/functions/client-plate-copy/
import { assert, assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fetchAddress,
  mapPool,
  parseJobRunId,
  type PlateRequest,
  recordPayload,
  resolveSource,
  shortenError,
  type SourceAuthority,
  SourceNotOwned,
  summarizeRun,
  validateIngestResponse,
} from "./lib.ts";

const PROJECT = "84300000-0000-4000-8000-000000000001";
const OTHER_PROJECT = "84300000-0000-4000-8000-000000000002";
const ROOM = "84300000-0000-4000-8000-000000000011";
const OWNER = "84300000-0000-4000-8000-0000000000a1";
const SCAN = "84300000-0000-4000-8000-000000000301";
const PROPOSAL = "84300000-0000-4000-8000-0000000000f1";
const SHA = "a".repeat(64);
const SUPABASE = "https://strata.example.supabase.co/";

// Each private bucket's object layout (its storage policy): room-renders
// <project>/<room>/<file>; room-scans <type>/<owner>/<scan>/<file>;
// proposal-mood-boards <proposal>/...
const RENDER_PATH = `${PROJECT}/${ROOM}/kitchen-v1.png`;
const SCAN_PATH = `photos/${OWNER}/${SCAN}/still-1.jpg`;
const BOARD_PATH = `${PROPOSAL}/boards/b1/cover.jpg`;

function request(table: string, sourceKind: string, sourceUrl: string): PlateRequest {
  return {
    id: "r1",
    project_id: PROJECT,
    source_kind: sourceKind,
    source_ref: { table, id: "s1" },
    source_url: sourceUrl,
    lease_token: "t1",
  };
}

function answer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sha256: SHA,
    width: 1600,
    height: 1200,
    format: "jpeg",
    ground: "white",
    dominantHex: "#efe9e0",
    lqip: "data:image/webp;base64,AAAA",
    originalKey: `plates/${PROJECT}/${SHA}/original.jpg`,
    crops: { wide: { rect: [0, 0, 1600, 900], widths: [800, 1600] } },
    ...overrides,
  };
}

function authority(owned: boolean | Error) {
  const calls = { owned: 0, signed: [] as string[] };
  const value: SourceAuthority = {
    owned() {
      calls.owned++;
      return owned instanceof Error ? Promise.reject(owned) : Promise.resolve(owned);
    },
    sign(bucket, path) {
      calls.signed.push(`${bucket}/${path}`);
      return Promise.resolve(`https://signed.test/${bucket}/${path}?token=t`);
    },
  };
  return { value, calls };
}

Deno.test("resolveSource: a library hotlink is fetched as it is", () => {
  assertEquals(
    resolveSource(request("project_ffe_item_images", "maker", "https://img.test/chair.jpg"), SUPABASE),
    { kind: "direct", url: "https://img.test/chair.jpg" },
  );
});

Deno.test("resolveSource: an upload gets the public project-item-images URL", () => {
  assertEquals(
    resolveSource(request("project_ffe_item_images", "upload", `${PROJECT}/my photo.jpg`), SUPABASE),
    {
      kind: "direct",
      url: `https://strata.example.supabase.co/storage/v1/object/public/project-item-images/${PROJECT}/my%20photo.jpg`,
    },
  );
});

Deno.test("resolveSource: concept renders, scans and board covers are signed in their private bucket", () => {
  assertEquals(resolveSource(request("project_rooms", "concept", RENDER_PATH), SUPABASE), {
    kind: "signed",
    bucket: "room-renders",
    path: RENDER_PATH,
  });
  assertEquals(resolveSource(request("room_scan_images", "scan", `/${SCAN_PATH}`), SUPABASE), {
    kind: "signed",
    bucket: "room-scans",
    path: SCAN_PATH,
  });
  assertEquals(resolveSource(request("project_boards", "board", BOARD_PATH), SUPABASE), {
    kind: "signed",
    bucket: "proposal-mood-boards",
    path: BOARD_PATH,
  });
});

Deno.test("resolveSource: a render outside the project's folder or a dot segment is not the project's", () => {
  for (const path of [
    `${OTHER_PROJECT}/${ROOM}/kitchen-v1.png`,
    `${PROJECT}/kitchen.png`,
    `${PROJECT}/${ROOM}/../../${OTHER_PROJECT}/${ROOM}/kitchen-v1.png`,
  ]) {
    assertEquals(resolveSource(request("project_rooms", "concept", path), SUPABASE), { kind: "not_owned" }, path);
  }
  for (const [table, path] of [
    ["room_scan_images", `photos/${OWNER}/${SCAN}/../../../photos/x/y/still-1.jpg`],
    ["room_scan_images", `photos/${OWNER}//still-1.jpg`],
    ["project_boards", `${PROPOSAL}/%2E%2E/other/cover.jpg`],
  ]) {
    assertEquals(resolveSource(request(table, "scan", path), SUPABASE), { kind: "not_owned" }, path);
  }
});

Deno.test("resolveSource: an outside board cover is fetched as it is", () => {
  assertEquals(resolveSource(request("project_boards", "board", "https://img.test/cover.jpg"), SUPABASE), {
    kind: "direct",
    url: "https://img.test/cover.jpg",
  });
});

Deno.test("resolveSource: an unknown table or a blank address has no source", () => {
  assertEquals(resolveSource(request("plan_prints", "sheet", "prints/a.pdf"), SUPABASE), null);
  assertEquals(resolveSource(request("project_rooms", "concept", "   "), SUPABASE), null);
});

const PRIVATE_SOURCES = [
  { table: "project_rooms", kind: "concept", bucket: "room-renders", path: RENDER_PATH },
  { table: "room_scan_images", kind: "scan", bucket: "room-scans", path: SCAN_PATH },
  { table: "project_boards", kind: "board", bucket: "proposal-mood-boards", path: BOARD_PATH },
];

for (const source of PRIVATE_SOURCES) {
  Deno.test(`fetchAddress: a ${source.bucket} object the project owns is signed`, async () => {
    const { value, calls } = authority(true);
    assertEquals(
      await fetchAddress(request(source.table, source.kind, source.path), SUPABASE, value),
      `https://signed.test/${source.bucket}/${source.path}?token=t`,
    );
    assertEquals(calls, { owned: 1, signed: [`${source.bucket}/${source.path}`] });
  });

  Deno.test(`fetchAddress: a ${source.bucket} object the database places elsewhere is never signed`, async () => {
    const { value, calls } = authority(false);
    await assertRejects(
      () => fetchAddress(request(source.table, source.kind, source.path), SUPABASE, value),
      SourceNotOwned,
      "source_not_owned",
    );
    assertEquals(calls, { owned: 1, signed: [] });
  });
}

Deno.test("fetchAddress: a render under another project is refused before the database is asked", async () => {
  const { value, calls } = authority(true);
  await assertRejects(
    () => fetchAddress(request("project_rooms", "concept", `${OTHER_PROJECT}/${ROOM}/kitchen-v1.png`), SUPABASE, value),
    SourceNotOwned,
  );
  assertEquals(calls, { owned: 0, signed: [] });
});

Deno.test("fetchAddress: a failed ownership check signs nothing", async () => {
  const { value, calls } = authority(new Error("ownership check failed: timeout"));
  await assertRejects(
    () => fetchAddress(request("room_scan_images", "scan", SCAN_PATH), SUPABASE, value),
    Error,
    "ownership check failed",
  );
  assertEquals(calls.signed, []);
});

Deno.test("fetchAddress: a hotlink or outside cover needs neither the check nor a signature", async () => {
  const { value, calls } = authority(false);
  assertEquals(
    await fetchAddress(request("project_ffe_item_images", "maker", "https://img.test/chair.jpg"), SUPABASE, value),
    "https://img.test/chair.jpg",
  );
  assertEquals(
    await fetchAddress(request("project_boards", "board", "https://img.test/cover.jpg"), SUPABASE, value),
    "https://img.test/cover.jpg",
  );
  assertEquals(calls, { owned: 0, signed: [] });
  await assertRejects(() => fetchAddress(request("plan_prints", "sheet", "a.pdf"), SUPABASE, value), Error, "no fetch address");
});

Deno.test("shortenError: a refused source is recorded as source_not_owned", () => {
  assertEquals(shortenError(new SourceNotOwned()), "source_not_owned");
});

Deno.test("validateIngestResponse: a full answer is accepted with its fields", () => {
  const checked = validateIngestResponse(answer(), PROJECT);
  assert(checked.ok);
  assertEquals(checked.asset.sha256, SHA);
  assertEquals(checked.asset.width, 1600);
  assertEquals(checked.asset.ground, "white");
  assertEquals(checked.asset.crops, { wide: { rect: [0, 0, 1600, 900], widths: [800, 1600] } });
});

Deno.test("validateIngestResponse: missing optional facts become null and crops {}", () => {
  const checked = validateIngestResponse(
    answer({ format: undefined, ground: undefined, dominantHex: undefined, lqip: undefined, crops: undefined }),
    PROJECT,
  );
  assert(checked.ok);
  assertEquals(
    [checked.asset.format, checked.asset.ground, checked.asset.dominantHex, checked.asset.lqip],
    [null, null, null, null],
  );
  assertEquals(checked.asset.crops, {});
});

Deno.test("validateIngestResponse: a malformed answer is refused with its reason", () => {
  const refused = (body: unknown) => {
    const checked = validateIngestResponse(body, PROJECT);
    return checked.ok ? null : checked.error;
  };
  assertEquals(refused(null), "ingest answer is not an object");
  assertEquals(refused([answer()]), "ingest answer is not an object");
  assertEquals(refused(answer({ sha256: "A".repeat(64) })), "ingest answer has no sha256");
  assertEquals(refused(answer({ width: 0 })), "ingest answer has no width and height");
  assertEquals(refused(answer({ height: 12.5 })), "ingest answer has no width and height");
  assertEquals(
    refused(answer({ originalKey: `plates/other-project/${SHA}/original.jpg` })),
    "ingest answer's original is outside plates/<project>/<sha256>/",
  );
  assertEquals(refused(answer({ ground: "sky" })), "ingest answer has an unknown ground");
  assertEquals(refused(answer({ lqip: "x".repeat(801) })), "ingest answer's lqip is over 800 characters");
  assertEquals(refused(answer({ dominantHex: 7 })), "ingest answer has a non-text format, dominantHex or lqip");
  assertEquals(refused(answer({ crops: [] })), "ingest answer's crops is not an object");
});

Deno.test("recordPayload: the answer carries the request's source", () => {
  const checked = validateIngestResponse(answer(), PROJECT);
  assert(checked.ok);
  const payload = recordPayload(checked.asset, request("project_rooms", "concept", "a.png"));
  assertEquals(payload.source_kind, "concept");
  assertEquals(payload.source_ref, { table: "project_rooms", id: "s1" });
  assertEquals(payload.originalKey, `plates/${PROJECT}/${SHA}/original.jpg`);
});

Deno.test("shortenError: one line, at most 200 characters", () => {
  assertEquals(shortenError(new Error("ingest 502:\n  bad   gateway")), "ingest 502: bad gateway");
  const long = shortenError("x".repeat(500));
  assertEquals(long.length, 200);
  assert(long.endsWith("…"));
  assertEquals(shortenError({ code: "E1" }), '{"code":"E1"}');
  assertEquals(shortenError(""), "copy failed");
  assertEquals(shortenError(undefined), "undefined");
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  assertEquals(shortenError(circular), "[object Object]");
});

Deno.test("shortenError: a signed URL's token never reaches the queue", () => {
  assertEquals(
    shortenError("fetch failed https://x.supabase.co/storage/v1/object/sign/room-renders/a.png?token=SECRET123 (403)"),
    "fetch failed https://x.supabase.co/storage/v1/object/sign/room-renders/a.png (403)",
  );
});

Deno.test("parseJobRunId: a positive integer or digit string, else null", () => {
  assertEquals(parseJobRunId({ job_run_id: 42 }), 42);
  assertEquals(parseJobRunId({ job_run_id: "42" }), 42);
  assertEquals(parseJobRunId({ job_run_id: 0 }), null);
  assertEquals(parseJobRunId({ job_run_id: "4x" }), null);
  assertEquals(parseJobRunId({}), null);
  assertEquals(parseJobRunId(null), null);
});

Deno.test("summarizeRun: skipped with nothing claimed, failed when every copy failed, else succeeded", () => {
  assertEquals(summarizeRun({ claimed: 0, recorded: 0, failed: 0 }).status, "skipped");
  assertEquals(summarizeRun({ claimed: 2, recorded: 0, failed: 2 }), {
    status: "failed",
    detail: { claimed: 2, recorded: 0, failed: 2 },
    error: "all 2 copies failed",
  });
  assertEquals(summarizeRun({ claimed: 3, recorded: 2, failed: 1 }).status, "succeeded");
});

Deno.test("mapPool: keeps order and never runs more than the limit at once", async () => {
  let inFlight = 0;
  let peak = 0;
  const results = await mapPool([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5 * (8 - n)));
    inFlight--;
    return n * 10;
  });
  assertEquals(results, [10, 20, 30, 40, 50, 60, 70]);
  assertEquals(peak, 3);
  assertEquals(await mapPool([], 3, async (n: number) => n), []);
});
