// Opt-in local-stack integration proof for AC3.11, AC3.21, and AC3.22.
//
// Run only against a freshly reset LOCAL Supabase stack:
//   MOOD_BOARD_LOCAL_STACK=1 deno test \
//     --config supabase/functions/deno.json \
//     --import-map supabase/tests/mood_boards/storage_lifecycle_import_map.json \
//     --allow-env --allow-net --allow-read --allow-run \
//     supabase/tests/mood_boards/storage_lifecycle_integration_test.ts
//
// The test obtains credentials from `supabase status -o env`, then refuses to
// mutate unless both the API and Postgres hosts/ports are the canonical local
// endpoints. It also refuses a non-empty mood-board bucket/candidate ledger so
// a developer's unrelated local assets are never swept.

import {
  createMoodBoardCoverLifecycle,
  MOOD_BOARD_COVER_DEBOUNCE_MS,
} from "../../../apps/designer-portal/src/lib/mood-board-assets/board-cover-lifecycle.ts";

const FIXTURE = "mood-board-storage-integration";
const BUCKET = "proposal-mood-boards";
const LOCAL_EDGE_CONTAINER = "supabase_edge_runtime_supabase";
const EDGE_ENV_FILE =
  "supabase/functions/_tests/board-asset-cleanup.integration.env.example";
const PROJECT_ID = "b0000000-0000-0000-0000-0000000000d1";
const PROPOSAL_ID = "b3900000-0000-4000-8000-000000000001";
const STUDIO_ID = "b0000000-0000-0000-0000-000000000001";
const DESIGNER_ID = "a0000000-0000-0000-0000-000000000004";
const BOARD_ID = "c4211000-0000-4000-8000-000000000001";
const SECOND_BOARD_ID = "c4211000-0000-4000-8000-000000000002";
const FIRST_ITEM_ID = "c4211100-0000-4000-8000-000000000001";
const SECOND_ITEM_ID = "c4211100-0000-4000-8000-000000000002";
const SNAPSHOT_ID = "c4212000-0000-4000-8000-000000000001";
const TEMPLATE_ID = "c4213000-0000-4000-8000-000000000001";
const BASE = `${PROPOSAL_ID}/boards/${BOARD_ID}`;

const OBJECTS = {
  cover: `${BASE}/cover.png`,
  pasted: `${BASE}/pasted-by-reference.png`,
  original: `${BASE}/original-image.png`,
  template: `${BASE}/template-image.png`,
  snapshot: `${BASE}/frozen-snapshot.png`,
  orphan: `${BASE}/orphan.png`,
} as const;

const ALL_OBJECTS = Object.values(OBJECTS);
const REFERENCED_OBJECTS = ALL_OBJECTS.filter((name) =>
  name !== OBJECTS.orphan
);

// A valid 1×1 PNG. The production painter's 800×600 raster contract remains
// covered by its focused unit tests; this fixture proves the derived object and
// database lifecycle against real local services.
const PNG_BYTES = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nWQAAAAASUVORK5CYII=",
  ),
  (value) => value.charCodeAt(0),
);

interface LocalStack {
  apiUrl: URL;
  dbUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

interface EdgeProcess {
  child: Deno.ChildProcess;
  status: Promise<Deno.CommandStatus>;
  isExited(): boolean;
  stdout: Promise<string>;
  stderr: Promise<string>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals(
  actual: unknown,
  expected: unknown,
  message: string,
): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) {
    throw new Error(`${message}\nexpected ${right}\nactual   ${left}`);
  }
}

function parseStatusEnv(output: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=("(?:[^"\\]|\\.)*")$/);
    if (!match) continue;
    values.set(match[1], JSON.parse(match[2]));
  }
  return values;
}

async function commandOutput(command: string, args: string[]): Promise<string> {
  const result = await new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!result.success) {
    const error = new TextDecoder().decode(result.stderr).trim();
    throw new Error(`${command} failed (${result.code}): ${error}`);
  }
  return new TextDecoder().decode(result.stdout).trim();
}

async function loadLocalStack(): Promise<LocalStack> {
  assert(
    Deno.env.get("MOOD_BOARD_LOCAL_STACK") === "1",
    "refusing integration mutations: set MOOD_BOARD_LOCAL_STACK=1 explicitly",
  );
  const values = parseStatusEnv(
    await commandOutput("supabase", ["status", "-o", "env"]),
  );
  const apiRaw = values.get("API_URL");
  const dbRaw = values.get("DB_URL");
  const anonKey = values.get("ANON_KEY");
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
  assert(
    apiRaw && dbRaw && anonKey && serviceRoleKey,
    "local Supabase status is incomplete",
  );

  const apiUrl = new URL(apiRaw);
  const dbUrl = new URL(dbRaw);
  const localHost = (host: string) =>
    host === "127.0.0.1" || host === "localhost";
  assert(
    apiUrl.protocol === "http:" && localHost(apiUrl.hostname) &&
      apiUrl.port === "54321",
    `refusing non-local Supabase API: ${apiUrl.origin}`,
  );
  assert(
    dbUrl.protocol === "postgresql:" && localHost(dbUrl.hostname) &&
      dbUrl.port === "54322",
    `refusing non-local Postgres: ${dbUrl.hostname}:${dbUrl.port}`,
  );

  const tokenParts = serviceRoleKey.split(".");
  assert(tokenParts.length === 3, "local service-role key is not a JWT");
  const payload = JSON.parse(
    atob(
      tokenParts[1].replace(/-/g, "+").replace(/_/g, "/") +
        "=".repeat((4 - tokenParts[1].length % 4) % 4),
    ),
  ) as { role?: unknown };
  assert(
    payload.role === "service_role",
    "local key does not carry service_role",
  );
  return { apiUrl, dbUrl: dbRaw, anonKey, serviceRoleKey };
}

function authHeaders(stack: LocalStack): Headers {
  return new Headers({
    apikey: stack.serviceRoleKey,
    Authorization: `Bearer ${stack.serviceRoleKey}`,
  });
}

function publicObjectUrl(stack: LocalStack, objectName: string): string {
  const encoded = objectName.split("/").map(encodeURIComponent).join("/");
  return new URL(`/storage/v1/object/public/${BUCKET}/${encoded}`, stack.apiUrl)
    .toString();
}

function restUrl(
  stack: LocalStack,
  table: string,
  filters: Record<string, string> = {},
): URL {
  const url = new URL(`/rest/v1/${table}`, stack.apiUrl);
  for (const [key, value] of Object.entries(filters)) {
    url.searchParams.set(key, value);
  }
  return url;
}

async function jsonResponse(
  response: Response,
  operation: string,
): Promise<unknown> {
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(
      `${operation} failed (${response.status}): ${text.slice(0, 500)}`,
    );
  }
  return body;
}

async function selectRows(
  stack: LocalStack,
  table: string,
  filters: Record<string, string>,
): Promise<Record<string, unknown>[]> {
  const headers = authHeaders(stack);
  const body = await jsonResponse(
    await fetch(restUrl(stack, table, filters), { headers }),
    `select ${table}`,
  );
  assert(Array.isArray(body), `select ${table} did not return rows`);
  return body as Record<string, unknown>[];
}

async function insertRows(
  stack: LocalStack,
  table: string,
  rows: Record<string, unknown> | Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  const headers = authHeaders(stack);
  headers.set("Content-Type", "application/json");
  headers.set("Prefer", "return=representation");
  const body = await jsonResponse(
    await fetch(restUrl(stack, table), {
      method: "POST",
      headers,
      body: JSON.stringify(rows),
    }),
    `insert ${table}`,
  );
  assert(Array.isArray(body), `insert ${table} did not return rows`);
  return body as Record<string, unknown>[];
}

async function updateRows(
  stack: LocalStack,
  table: string,
  filters: Record<string, string>,
  changes: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const headers = authHeaders(stack);
  headers.set("Content-Type", "application/json");
  headers.set("Prefer", "return=representation");
  const body = await jsonResponse(
    await fetch(restUrl(stack, table, filters), {
      method: "PATCH",
      headers,
      body: JSON.stringify(changes),
    }),
    `update ${table}`,
  );
  assert(Array.isArray(body), `update ${table} did not return rows`);
  return body as Record<string, unknown>[];
}

async function deleteRows(
  stack: LocalStack,
  table: string,
  filters: Record<string, string>,
): Promise<void> {
  const headers = authHeaders(stack);
  await jsonResponse(
    await fetch(restUrl(stack, table, filters), { method: "DELETE", headers }),
    `delete ${table}`,
  );
}

async function uploadObject(
  stack: LocalStack,
  objectName: string,
  bytes = PNG_BYTES,
): Promise<void> {
  const encoded = objectName.split("/").map(encodeURIComponent).join("/");
  const headers = authHeaders(stack);
  headers.set("Content-Type", "image/png");
  headers.set("cache-control", "300");
  headers.set("x-upsert", "true");
  await jsonResponse(
    await fetch(
      new URL(`/storage/v1/object/${BUCKET}/${encoded}`, stack.apiUrl),
      {
        method: "POST",
        headers,
        body: bytes,
      },
    ),
    `upload ${objectName}`,
  );
}

async function removeObjects(
  stack: LocalStack,
  objectNames: string[],
): Promise<void> {
  const headers = authHeaders(stack);
  headers.set("Content-Type", "application/json");
  const response = await fetch(
    new URL(`/storage/v1/object/${BUCKET}`, stack.apiUrl),
    {
      method: "DELETE",
      headers,
      body: JSON.stringify({ prefixes: objectNames }),
    },
  );
  if (!response.ok && response.status !== 404) {
    const text = await response.text();
    throw new Error(
      `remove fixture objects failed (${response.status}): ${
        text.slice(0, 500)
      }`,
    );
  }
}

async function objectResponse(
  stack: LocalStack,
  objectName: string,
): Promise<Response> {
  const url = new URL(publicObjectUrl(stack, objectName));
  url.searchParams.set("integration_probe", crypto.randomUUID());
  return await fetch(url, { cache: "no-store" });
}

async function psqlScalar(stack: LocalStack, sql: string): Promise<string> {
  return await commandOutput("psql", [
    stack.dbUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-Atqc",
    sql,
  ]);
}

async function cleanupFixture(stack: LocalStack): Promise<void> {
  await removeObjects(stack, ALL_OBJECTS).catch(() => undefined);
  await deleteRows(stack, "board_asset_gc_candidates", {
    object_name: `like.${BASE}/*`,
  }).catch(() => undefined);
  await deleteRows(stack, "document_shares", {
    board_id: `in.(${BOARD_ID},${SECOND_BOARD_ID})`,
  }).catch(() => undefined);
  await deleteRows(stack, "project_boards", { id: `eq.${SNAPSHOT_ID}` }).catch(
    () => undefined,
  );
  await deleteRows(stack, "board_templates", { id: `eq.${TEMPLATE_ID}` }).catch(
    () => undefined,
  );
  await deleteRows(stack, "proposal_boards", {
    id: `in.(${BOARD_ID},${SECOND_BOARD_ID})`,
  }).catch(() => undefined);
  await deleteRows(stack, "job_runs", {
    "detail->>fixture": `eq.${FIXTURE}`,
  }).catch(() => undefined);
}

async function assertPristineAssetScope(stack: LocalStack): Promise<void> {
  const objectCount = Number(
    await psqlScalar(
      stack,
      `SELECT count(*) FROM storage.objects WHERE bucket_id = '${BUCKET}'`,
    ),
  );
  const candidateCount = Number(
    await psqlScalar(
      stack,
      "SELECT count(*) FROM public.board_asset_gc_candidates",
    ),
  );
  assert(
    objectCount === 0,
    `refusing to sweep a non-empty local ${BUCKET} bucket (${objectCount} objects); reset or use a disposable stack`,
  );
  assert(
    candidateCount === 0,
    `refusing to mutate a non-empty local GC ledger (${candidateCount} rows); reset or use a disposable stack`,
  );
}

async function seedDatabase(stack: LocalStack): Promise<void> {
  const projects = await selectRows(stack, "projects", {
    id: `eq.${PROJECT_ID}`,
    select: "id,designer_id",
  });
  assert(
    projects.length === 1,
    "fresh local seed project is missing; run pnpm supabase:reset",
  );
  const proposals = await selectRows(stack, "proposals", {
    id: `eq.${PROPOSAL_ID}`,
    select: "id,designer_id",
  });
  assert(
    proposals.length === 1,
    "fresh local seed proposal is missing; run pnpm supabase:reset",
  );

  await insertRows(stack, "proposal_boards", [
    {
      id: BOARD_ID,
      proposal_id: PROPOSAL_ID,
      name: "Storage integration board",
      status: "active",
      sections: [{ id: "main", name: "Main" }],
      sort_order: 901,
    },
    {
      id: SECOND_BOARD_ID,
      proposal_id: PROPOSAL_ID,
      name: "Storage integration reference board",
      status: "active",
      sections: [],
      sort_order: 902,
    },
  ]);

  await insertRows(stack, "proposal_board_items", [
    {
      id: FIRST_ITEM_ID,
      board_id: BOARD_ID,
      type: "image",
      image_url: null,
      data: { original_image_url: publicObjectUrl(stack, OBJECTS.original) },
      z_index: 1,
    },
    {
      id: SECOND_ITEM_ID,
      board_id: SECOND_BOARD_ID,
      type: "image",
      image_url: publicObjectUrl(stack, OBJECTS.pasted),
      data: {},
      z_index: 1,
    },
  ]);

  await insertRows(stack, "project_boards", {
    id: SNAPSHOT_ID,
    project_id: PROJECT_ID,
    name: "Frozen integration reference",
    items: [{ data: { image_url: publicObjectUrl(stack, OBJECTS.snapshot) } }],
    sections: [],
    sort_order: 901,
  });

  await insertRows(stack, "board_templates", {
    id: TEMPLATE_ID,
    template_key: "studio.integration.mood-board-storage",
    name: "Storage integration template",
    kind: "studio",
    studio_id: STUDIO_ID,
    created_by: DESIGNER_ID,
    canvas_width: 1200,
    canvas_height: 800,
    sections: [],
    items: [{ image_url: publicObjectUrl(stack, OBJECTS.template) }],
  });
}

async function waitFor<T>(
  load: () => Promise<T>,
  accept: (value: T) => boolean,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last: T;
  do {
    last = await load();
    if (accept(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 125));
  } while (Date.now() < deadline);
  throw new Error(
    `condition did not settle within ${timeoutMs}ms: ${JSON.stringify(last!)}`,
  );
}

async function proveCoverLifecycle(stack: LocalStack): Promise<void> {
  const initialRows = await selectRows(stack, "proposal_boards", {
    id: `eq.${SECOND_BOARD_ID}`,
    select: "cover_image_url",
  });
  assertEquals(
    initialRows,
    [{ cover_image_url: null }],
    "coverless board must retain fallback state",
  );
  const missingCover = await objectResponse(
    stack,
    `${PROPOSAL_ID}/boards/${SECOND_BOARD_ID}/cover.png`,
  );
  assert(
    !missingCover.ok,
    "coverless board unexpectedly has a canonical Storage object",
  );
  await missingCover.body?.cancel();

  const lifecycle = createMoodBoardCoverLifecycle({
    async write(snapshot) {
      assert(
        snapshot.boardId === BOARD_ID,
        "cover lifecycle wrote the wrong board",
      );
      await uploadObject(stack, OBJECTS.cover);
      const rows = await updateRows(
        stack,
        "proposal_boards",
        { id: `eq.${BOARD_ID}` },
        { cover_image_url: publicObjectUrl(stack, OBJECTS.cover) },
      );
      assert(
        rows.length === 1,
        "cover URL persistence did not update one board",
      );
    },
  });

  const input = {
    canvasWidth: 1200,
    canvasHeight: 800,
    backgroundColor: "#FAF8F5",
    sections: [],
    items: [],
  };
  lifecycle.update({ boardId: BOARD_ID, signature: "baseline", input });
  const editedAt = Date.now();
  lifecycle.update({ boardId: BOARD_ID, signature: "edited", input });

  const before = await selectRows(stack, "proposal_boards", {
    id: `eq.${BOARD_ID}`,
    select: "cover_image_url",
  });
  assertEquals(
    before,
    [{ cover_image_url: null }],
    "cover wrote before its edit debounce",
  );

  const settled = await waitFor(
    () =>
      selectRows(stack, "proposal_boards", {
        id: `eq.${BOARD_ID}`,
        select: "cover_image_url",
      }),
    (rows) =>
      rows[0]?.cover_image_url === publicObjectUrl(stack, OBJECTS.cover),
    MOOD_BOARD_COVER_DEBOUNCE_MS + 10_000,
  );
  const elapsed = Date.now() - editedAt;
  lifecycle.dispose();
  assert(
    elapsed >= MOOD_BOARD_COVER_DEBOUNCE_MS - 250,
    `cover persisted too early (${elapsed}ms)`,
  );
  assertEquals(
    settled,
    [{ cover_image_url: publicObjectUrl(stack, OBJECTS.cover) }],
    "canonical cover URL was not persisted",
  );
  const cover = await objectResponse(stack, OBJECTS.cover);
  assert(cover.ok, `canonical cover GET failed (${cover.status})`);
  assertEquals(
    [...new Uint8Array(await cover.arrayBuffer())],
    [...PNG_BYTES],
    "downloaded cover bytes differ from the uploaded derivative",
  );
}

function cleanupEdgeUrl(stack: LocalStack): URL {
  return new URL("/functions/v1/board-asset-cleanup", stack.apiUrl);
}

async function cleanupEdgeStatus(stack: LocalStack): Promise<number | null> {
  try {
    const response = await fetch(cleanupEdgeUrl(stack), {
      method: "GET",
      headers: authHeaders(stack),
      signal: AbortSignal.timeout(1_000),
    });
    await response.body?.cancel();
    return response.status;
  } catch {
    return null;
  }
}

async function stopLocalEdgeRuntime(): Promise<void> {
  const inspect = await new Deno.Command("docker", {
    args: [
      "inspect",
      LOCAL_EDGE_CONTAINER,
      "--format",
      '{{index .Config.Labels "com.supabase.cli.project"}}',
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!inspect.success) return;
  const project = new TextDecoder().decode(inspect.stdout).trim();
  assert(
    project === "supabase",
    `refusing to stop unexpected Edge Runtime container project ${project}`,
  );
  await commandOutput("docker", ["stop", LOCAL_EDGE_CONTAINER]);
}

async function startCleanupEdge(stack: LocalStack): Promise<EdgeProcess> {
  const existingStatus = await cleanupEdgeStatus(stack);
  assert(
    existingStatus !== 405,
    "refusing to reuse an already-served board-asset-cleanup function; stop the local edge runtime first",
  );
  const root = new URL("../../../", import.meta.url).pathname;
  const destructiveSetting = await Deno.readTextFile(
    new URL(
      `../../../${EDGE_ENV_FILE}`,
      import.meta.url,
    ),
  );
  const supabaseConfig = await Deno.readTextFile(
    new URL("../../../supabase/config.toml", import.meta.url),
  );
  assert(
    /^BOARD_ASSET_CLEANUP_DESTRUCTIVE_ENABLED=true$/m.test(destructiveSetting),
    "local edge env fixture must explicitly arm destructive cleanup",
  );
  assert(
    /\[functions\.board-asset-cleanup\]\s*verify_jwt\s*=\s*true/m.test(
      supabaseConfig,
    ),
    "production board-asset-cleanup config must keep gateway JWT verification enabled",
  );
  const child = new Deno.Command("supabase", {
    cwd: root,
    args: [
      "functions",
      "serve",
      // CLI v2.72's local gateway verifies ES256 JWTs as HS256 and returns 401.
      // Production config remains verify_jwt=true; this local-only override is
      // compensated by (and tests) the handler's service_role claim boundary.
      "--no-verify-jwt",
      "--env-file",
      EDGE_ENV_FILE,
    ],
    stdout: "piped",
    stderr: "piped",
  }).spawn();
  const stdout = new Response(child.stdout).text();
  const stderr = new Response(child.stderr).text();
  let exited = false;
  const status = child.status.then((result) => {
    exited = true;
    return result;
  });
  const isExited = () => exited;

  try {
    await waitFor(
      () => cleanupEdgeStatus(stack),
      (status) => status === 405 || isExited(),
      60_000,
    );
    assert(!isExited(), "cleanup edge exited before becoming ready");
    return { child, status, isExited, stdout, stderr };
  } catch (error) {
    if (!isExited()) child.kill("SIGTERM");
    await status.catch(() => undefined);
    await stopLocalEdgeRuntime();
    const logs = `${await stdout}\n${await stderr}`.trim().slice(-4_000);
    throw new Error(`${String(error)}\n${logs}`);
  }
}

async function stopCleanupEdge(edge: EdgeProcess | null): Promise<void> {
  if (!edge) return;
  if (!edge.isExited()) edge.child.kill("SIGTERM");
  await edge.status.catch(() => undefined);
  await Promise.all([edge.stdout, edge.stderr]);
  await stopLocalEdgeRuntime();
}

async function createJobRun(
  stack: LocalStack,
  sequence: number,
): Promise<number> {
  const rows = await insertRows(stack, "job_runs", {
    job_name: "board-asset-gc",
    status: "running",
    detail: { fixture: FIXTURE, sequence },
  });
  const id = Number(rows[0]?.id);
  assert(
    Number.isSafeInteger(id) && id > 0,
    "job_runs did not return a safe id",
  );
  return id;
}

async function invokeCleanup(
  stack: LocalStack,
  jobRunId: number,
  dryRun: boolean,
): Promise<Record<string, unknown>> {
  const headers = authHeaders(stack);
  headers.set("Content-Type", "application/json");
  const response = await fetch(cleanupEdgeUrl(stack), {
    method: "POST",
    headers,
    body: JSON.stringify({
      dry_run: dryRun,
      grace_days: 14,
      job_name: "board-asset-gc",
      job_run_id: jobRunId,
    }),
  });
  const body = await jsonResponse(response, `cleanup job ${jobRunId}`);
  assert(
    body && typeof body === "object" && !Array.isArray(body),
    "cleanup returned no detail",
  );
  return body as Record<string, unknown>;
}

async function assertAnonDenied(stack: LocalStack): Promise<void> {
  const response = await fetch(cleanupEdgeUrl(stack), {
    method: "POST",
    headers: {
      apikey: stack.anonKey,
      Authorization: `Bearer ${stack.anonKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  const body = await response.json() as { error?: unknown };
  assert(
    response.status === 403 && body.error === "service_role_required",
    `anon token crossed the cleanup handler boundary (${response.status} ${
      JSON.stringify(body)
    })`,
  );
}

async function assertObjectsExist(
  stack: LocalStack,
  objectNames: string[],
): Promise<void> {
  for (const objectName of objectNames) {
    const response = await objectResponse(stack, objectName);
    assert(
      response.ok,
      `${objectName} unexpectedly missing (${response.status})`,
    );
    await response.body?.cancel();
  }
}

async function assertJobSucceeded(
  stack: LocalStack,
  id: number,
): Promise<void> {
  const rows = await selectRows(stack, "job_runs", {
    id: `eq.${id}`,
    select: "id,status,finished_at,detail,error",
  });
  assert(rows.length === 1, `job ${id} is missing`);
  assert(
    rows[0].status === "succeeded",
    `job ${id} did not succeed: ${JSON.stringify(rows[0])}`,
  );
  assert(
    typeof rows[0].finished_at === "string",
    `job ${id} has no finished_at`,
  );
  assert(rows[0].error === null, `job ${id} recorded an error`);
}

Deno.test({
  name:
    "real local Storage + DB cover lifecycle and two-pass board asset cleanup",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    const stack = await loadLocalStack();
    let edge: EdgeProcess | null = null;
    await cleanupFixture(stack);
    try {
      await assertPristineAssetScope(stack);
      await seedDatabase(stack);
      await proveCoverLifecycle(stack);

      for (
        const objectName of ALL_OBJECTS.filter((name) => name !== OBJECTS.cover)
      ) {
        await uploadObject(stack, objectName);
      }
      await assertObjectsExist(stack, ALL_OBJECTS);

      edge = await startCleanupEdge(stack);
      await assertAnonDenied(stack);

      const dryRunId = await createJobRun(stack, 1);
      const dryRun = await invokeCleanup(stack, dryRunId, true);
      assert(dryRun.dry_run === true, "first pass was not dry-run");
      assert(
        dryRun.candidates_first_seen === 1,
        `first pass candidate drift: ${JSON.stringify(dryRun)}`,
      );
      assert(dryRun.deleted_objects === 0, "first pass deleted an object");
      await assertJobSucceeded(stack, dryRunId);

      const candidates = await selectRows(stack, "board_asset_gc_candidates", {
        object_name: `like.${BASE}/*`,
        select:
          "object_name,first_unreferenced_at,eligible_after,deleted_at,last_job_run_id",
        order: "object_name.asc",
      });
      assertEquals(
        candidates.map((row) => row.object_name),
        [OBJECTS.orphan],
        "dry-run must list exactly the fixture orphan",
      );
      await assertObjectsExist(stack, ALL_OBJECTS);

      const beforeGraceId = await createJobRun(stack, 2);
      const beforeGrace = await invokeCleanup(stack, beforeGraceId, false);
      assert(
        beforeGrace.eligible_objects === 0,
        "new candidate became eligible before 14 days",
      );
      assert(
        beforeGrace.deleted_objects === 0,
        "destructive mode deleted before 14 days",
      );
      await assertJobSucceeded(stack, beforeGraceId);
      await assertObjectsExist(stack, ALL_OBJECTS);

      const now = Date.now();
      const firstUnreferencedAt = new Date(now - 15 * 24 * 60 * 60 * 1_000);
      const eligibleAfter = new Date(
        firstUnreferencedAt.getTime() + 14 * 24 * 60 * 60 * 1_000,
      );
      const aged = await updateRows(
        stack,
        "board_asset_gc_candidates",
        { object_name: `eq.${OBJECTS.orphan}` },
        {
          first_unreferenced_at: firstUnreferencedAt.toISOString(),
          eligible_after: eligibleAfter.toISOString(),
        },
      );
      assert(
        aged.length === 1,
        "fixture orphan was not aged to the deletion boundary",
      );

      const afterGraceId = await createJobRun(stack, 3);
      const afterGrace = await invokeCleanup(stack, afterGraceId, false);
      assert(
        afterGrace.eligible_objects === 1,
        `aged orphan not eligible: ${JSON.stringify(afterGrace)}`,
      );
      assert(
        afterGrace.deleted_objects === 1,
        `aged orphan not deleted: ${JSON.stringify(afterGrace)}`,
      );
      await assertJobSucceeded(stack, afterGraceId);

      const orphan = await objectResponse(stack, OBJECTS.orphan);
      assert(!orphan.ok, `deleted orphan still resolves (${orphan.status})`);
      await orphan.body?.cancel();
      await assertObjectsExist(stack, REFERENCED_OBJECTS);

      const receipt = await selectRows(stack, "board_asset_gc_candidates", {
        object_name: `eq.${OBJECTS.orphan}`,
        select:
          "object_name,deleted_at,last_job_run_id,last_reference_count,detail",
      });
      assert(receipt.length === 1, "deletion receipt is missing");
      assert(
        typeof receipt[0].deleted_at === "string",
        "deletion receipt lacks deleted_at",
      );
      assert(
        receipt[0].last_job_run_id === afterGraceId,
        "deletion receipt points to the wrong job",
      );
      assert(
        receipt[0].last_reference_count === 0,
        "deleted orphan gained a reference",
      );

      const jobs = await selectRows(stack, "job_runs", {
        "detail->>fixture": `eq.${FIXTURE}`,
        select: "id,status,finished_at",
        order: "id.asc",
      });
      assertEquals(
        jobs.map((job) => job.status),
        ["succeeded", "succeeded", "succeeded"],
        "job_runs must record every dry/pre-grace/post-grace pass",
      );
      console.log(
        `AC3.11/AC3.21/AC3.22 local proof: 30s cover persisted; ${REFERENCED_OBJECTS.length} references retained; one aged orphan deleted; ${jobs.length} jobs closed`,
      );
    } finally {
      await stopCleanupEdge(edge);
      await cleanupFixture(stack);
    }
  },
});
