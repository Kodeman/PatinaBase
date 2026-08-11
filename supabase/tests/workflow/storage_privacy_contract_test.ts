/// <reference lib="deno.ns" />

// Local HTTP proof for the database/storage-metadata privacy contracts.
//
// Run only after a clean local reset:
//   WORKFLOW_STORAGE_LOCAL_STACK=1 deno test --allow-env --allow-net --allow-run \
//     supabase/tests/workflow/storage_privacy_contract_test.ts

const BUCKET = "proposal-mood-boards";
const DESIGNER_EMAIL = "designer@patina.dev";
const DESIGNER_PASSWORD = "password123";
const PROPOSAL_ID = "b3900000-0000-4000-8000-000000000001";
const BOARD_ID = "c4340000-0000-4000-8000-000000000001";
const ITEM_ID = "c4341000-0000-4000-8000-000000000001";
const OBJECT_NAME = `${PROPOSAL_ID}/boards/${BOARD_ID}/released-v1.png`;
const RELEASED_BYTES = new TextEncoder().encode("released-v1");
const REPLACEMENT_BYTES = new TextEncoder().encode("forged-v2");

interface LocalStack {
  apiUrl: URL;
  dbUrl: string;
  anonKey: string;
  serviceRoleKey: string;
}

function assert(condition: unknown, detail: string): asserts condition {
  if (!condition) throw new Error(detail);
}

function assertBytes(
  actual: Uint8Array,
  expected: Uint8Array,
  id: string,
): void {
  assert(
    actual.length === expected.length &&
      actual.every((byte, index) => byte === expected[index]),
    `${id}: response bytes changed`,
  );
}

function bytesEqual(actual: Uint8Array, expected: Uint8Array): boolean {
  return actual.length === expected.length &&
    actual.every((byte, index) => byte === expected[index]);
}

function parseStatusEnv(output: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=("(?:[^"\\]|\\.)*")$/);
    if (match) values.set(match[1], JSON.parse(match[2]));
  }
  return values;
}

async function commandOutput(command: string, args: string[]): Promise<string> {
  const result = await new Deno.Command(command, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const stdout = new TextDecoder().decode(result.stdout).trim();
  const stderr = new TextDecoder().decode(result.stderr).trim();
  assert(result.success, `${command} failed (${result.code}): ${stderr}`);
  return stdout;
}

async function loadLocalStack(): Promise<LocalStack> {
  assert(
    Deno.env.get("WORKFLOW_STORAGE_LOCAL_STACK") === "1",
    "refusing Storage mutations without WORKFLOW_STORAGE_LOCAL_STACK=1",
  );
  const values = parseStatusEnv(
    await commandOutput("supabase", ["status", "-o", "env"]),
  );
  const apiRaw = values.get("API_URL");
  const dbUrl = values.get("DB_URL");
  const anonKey = values.get("ANON_KEY");
  const serviceRoleKey = values.get("SERVICE_ROLE_KEY");
  assert(
    apiRaw && dbUrl && anonKey && serviceRoleKey,
    "local Supabase status is incomplete",
  );

  const apiUrl = new URL(apiRaw);
  const database = new URL(dbUrl);
  const localHost = (host: string) =>
    host === "127.0.0.1" || host === "localhost";
  assert(
    apiUrl.protocol === "http:" && localHost(apiUrl.hostname) &&
      apiUrl.port === "54321",
    `refusing non-local Storage API ${apiUrl.origin}`,
  );
  assert(
    localHost(database.hostname) && database.port === "54322",
    `refusing non-local Postgres ${database.hostname}:${database.port}`,
  );
  return { apiUrl, dbUrl, anonKey, serviceRoleKey };
}

function encodedObjectPath(): string {
  return OBJECT_NAME.split("/").map(encodeURIComponent).join("/");
}

function objectUrl(stack: LocalStack, visibility = ""): URL {
  const prefix = visibility ? `${visibility}/` : "";
  return new URL(
    `/storage/v1/object/${prefix}${BUCKET}/${encodedObjectPath()}`,
    stack.apiUrl,
  );
}

function authHeaders(apiKey: string, bearer: string): Headers {
  return new Headers({ apikey: apiKey, Authorization: `Bearer ${bearer}` });
}

async function responseDetail(response: Response): Promise<string> {
  return (await response.clone().text()).slice(0, 500);
}

async function signInDesigner(stack: LocalStack): Promise<string> {
  const response = await fetch(
    new URL("/auth/v1/token?grant_type=password", stack.apiUrl),
    {
      method: "POST",
      headers: { apikey: stack.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        email: DESIGNER_EMAIL,
        password: DESIGNER_PASSWORD,
      }),
    },
  );
  const body = await response.json() as {
    access_token?: unknown;
    message?: unknown;
  };
  assert(
    response.ok,
    `designer sign-in failed (${response.status}): ${String(body.message)}`,
  );
  assert(
    typeof body.access_token === "string",
    "designer sign-in returned no access token",
  );
  return body.access_token;
}

async function runSql(stack: LocalStack, sql: string): Promise<void> {
  await commandOutput("psql", [
    stack.dbUrl,
    "-v",
    "ON_ERROR_STOP=1",
    "-c",
    sql,
  ]);
}

async function upload(
  stack: LocalStack,
  bearer: string,
  bytes: Uint8Array,
  upsert: boolean,
  apiKey = stack.anonKey,
): Promise<Response> {
  const headers = authHeaders(apiKey, bearer);
  headers.set("Content-Type", "image/png");
  headers.set("x-upsert", String(upsert));
  return await fetch(objectUrl(stack), {
    method: "POST",
    headers,
    body: bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    ) as ArrayBuffer,
  });
}

async function createSignedUrl(
  stack: LocalStack,
  bearer: string,
): Promise<URL> {
  const headers = authHeaders(stack.anonKey, bearer);
  headers.set("Content-Type", "application/json");
  const response = await fetch(
    new URL(
      `/storage/v1/object/sign/${BUCKET}/${encodedObjectPath()}`,
      stack.apiUrl,
    ),
    { method: "POST", headers, body: JSON.stringify({ expiresIn: 60 }) },
  );
  const body = await response.json() as {
    signedURL?: unknown;
    signedUrl?: unknown;
    message?: unknown;
  };
  assert(
    response.ok,
    `authorized sign failed (${response.status}): ${String(body.message)}`,
  );
  const signed = body.signedURL ?? body.signedUrl;
  assert(typeof signed === "string", "authorized sign returned no URL");
  return new URL(signed.startsWith("/object/") ? `/storage/v1${signed}` : signed, stack.apiUrl);
}

Deno.test("T02/T14 private working bytes and released object immutability", async () => {
  const stack = await loadLocalStack();
  const designerToken = await signInDesigner(stack);

  const existing = await commandOutput("psql", [
    stack.dbUrl,
    "-Atc",
    `SELECT count(*) FROM storage.objects WHERE bucket_id='${BUCKET}' AND name='${OBJECT_NAME}'`,
  ]);
  assert(
    existing === "0",
    `fixture object already exists (${OBJECT_NAME}); reset the local stack`,
  );

  await runSql(
    stack,
    `
    INSERT INTO public.proposal_boards (id, proposal_id, name, sections, status, sort_order)
    VALUES ('${BOARD_ID}', '${PROPOSAL_ID}', 'HTTP privacy contract', '[]'::jsonb, 'active', 999)
    ON CONFLICT (id) DO NOTHING;
  `,
  );

  const created = await upload(stack, designerToken, RELEASED_BYTES, false);
  assert(
    created.ok,
    `working upload failed (${created.status}): ${await responseDetail(
      created,
    )}`,
  );

  await runSql(
    stack,
    `
    INSERT INTO public.proposal_board_items (
      id, board_id, type, x, y, width, height, z_index, image_url, content, data
    ) VALUES (
      '${ITEM_ID}', '${BOARD_ID}', 'image', 0, 0, 100, 100, 1,
      '${OBJECT_NAME}', NULL, '{}'::jsonb
    );
  `,
  );

  const publicGet = await fetch(objectUrl(stack, "public"), {
    headers: { apikey: stack.anonKey },
  });
  const publicBody = new Uint8Array(await publicGet.arrayBuffer());
  assert(
    !publicGet.ok,
    `H01/T02: unauthenticated public GET returned ${publicGet.status}`,
  );
  assert(
    !bytesEqual(publicBody, RELEASED_BYTES),
    "H01/T02: public GET exposed protected bytes",
  );

  const workingSigned = await createSignedUrl(stack, designerToken);
  const workingGet = await fetch(workingSigned);
  assert(
    workingGet.ok,
    `H03: signed working GET failed (${workingGet.status})`,
  );
  assertBytes(
    new Uint8Array(await workingGet.arrayBuffer()),
    RELEASED_BYTES,
    "H03",
  );

  await runSql(
    stack,
    `
    SELECT set_config('app.proposal_send_id', '${PROPOSAL_ID}', false);
    UPDATE public.proposals SET status='sent', sent_at=now() WHERE id='${PROPOSAL_ID}';
    SELECT set_config('app.proposal_send_id', '', false);
  `,
  );

  const releasedSigned = await createSignedUrl(stack, designerToken);
  const releasedGet = await fetch(releasedSigned);
  assert(
    releasedGet.ok,
    `H05: signed released GET failed (${releasedGet.status})`,
  );
  assertBytes(
    new Uint8Array(await releasedGet.arrayBuffer()),
    RELEASED_BYTES,
    "H05",
  );

  const serviceOverwrite = await upload(
    stack,
    stack.serviceRoleKey,
    REPLACEMENT_BYTES,
    true,
    stack.serviceRoleKey,
  );
  assert(
    !serviceOverwrite.ok,
    `H06/T14: service_role overwrite returned ${serviceOverwrite.status}`,
  );

  const removeHeaders = authHeaders(stack.serviceRoleKey, stack.serviceRoleKey);
  removeHeaders.set("Content-Type", "application/json");
  const serviceDelete = await fetch(
    new URL(`/storage/v1/object/${BUCKET}`, stack.apiUrl),
    {
      method: "DELETE",
      headers: removeHeaders,
      body: JSON.stringify({ prefixes: [OBJECT_NAME] }),
    },
  );
  assert(
    !serviceDelete.ok,
    `H06/T14: service_role delete returned ${serviceDelete.status}`,
  );

  const afterMutation = await fetch(releasedSigned);
  assert(
    afterMutation.ok,
    `H06/T14: immutable signed GET failed (${afterMutation.status})`,
  );
  assertBytes(
    new Uint8Array(await afterMutation.arrayBuffer()),
    RELEASED_BYTES,
    "H06/T14",
  );

  console.log(
    `Storage HTTP PASS: H01/T02 public=${publicGet.status}; H03/H05 signed=200; ` +
      `H06/T14 service overwrite=${serviceOverwrite.status} delete=${serviceDelete.status}; bytes unchanged`,
  );
});
