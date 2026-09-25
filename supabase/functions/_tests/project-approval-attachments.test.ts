// NI-06 project-approval-attachments (CONTRACT-C revision 4 §C.3.1, §C.3.2, §C.9).
// Drives lib.ts through an in-memory AttachmentsPort: storage, the resolver and the
// first-writer-wins recorder are faked with the semantics 00670 installs.
import {
  assert,
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { crypto } from "jsr:@std/crypto@1";
import { encodeHex } from "jsr:@std/encoding@1/hex";
import {
  type AttachmentsPort,
  handleDecisionRequest,
  hashStream,
  MATERIALIZE_BUDGET_MS,
  parseRequest,
  type RecordArgs,
  type RpcResult,
  type SignedItem,
  SWEEP_AGE_MS,
  sweepAll,
} from "../project-approval-attachments/lib.ts";
import { buildPort } from "../project-approval-attachments/port.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const DECISION = "6a700000-0000-4000-8000-000000000001";
const OTHER_DECISION = "6a700000-0000-4000-8000-000000000002";
const ATT_A = "6a710000-0000-4000-8000-00000000000a";
const ATT_B = "6a710000-0000-4000-8000-00000000000b";
const T0 = Date.parse("2026-09-25T12:00:00Z");

const bytes = (text: string) => new TextEncoder().encode(text);
const sha = (data: Uint8Array<ArrayBuffer>) => encodeHex(crypto.subtle.digestSync("SHA-256", data));

interface ManifestItem {
  attachmentId: string;
  sha256: string;
  sizeBytes: number | null;
  contentType: string | null;
  sourcePath: string | null;
}

interface Stored {
  bytes: Uint8Array<ArrayBuffer>;
  createdAtMs: number;
}

const envelope = (status: string, decisionId = DECISION) => ({
  data: {
    contract: "shared_direction_v1",
    servedAt: "2026-09-25T12:00:00Z",
    decisionId,
    status,
    review: null,
    attachments: null,
    editionFigures: null,
  },
  error: null,
});

class World {
  now = T0;
  sources = new Map<string, Uint8Array<ArrayBuffer>>();
  objects = new Map<string, Stored>();
  recorded = new Map<string, { path: string; sizeBytes: number }>();
  manifests = new Map<string, ManifestItem[]>();
  edition: RpcResult = envelope("ok");
  resolverFails = new Set<string>();
  resolverNull = false;
  signOverride?: (paths: string[]) => { data: SignedItem[] | null; error: unknown };
  recordGate?: (args: RecordArgs) => Promise<void>;
  recordError = false;
  beforeCopy?: () => void;
  copyAdvanceMs = 0;
  attempts = 0;
  calls = { edition: 0, resolver: 0, storage: 0, sign: 0, record: 0 };

  addSource(decisionId: string, attachmentId: string, content: string, sizeBytes: number | null = null) {
    const data = bytes(content);
    const sourcePath = `project-x/plans/${attachmentId}-${this.sources.size}.pdf`;
    this.sources.set(sourcePath, data);
    const list = this.manifests.get(decisionId) ?? [];
    list.push({ attachmentId, sha256: sha(data), sizeBytes, contentType: "application/pdf", sourcePath });
    this.manifests.set(decisionId, list);
    return { sourcePath, sha256: sha(data) };
  }

  finals() {
    return [...this.objects.keys()].filter((path) => !path.includes("/_staging/"));
  }

  port(): AttachmentsPort {
    return {
      getEdition: () => {
        this.calls.edition += 1;
        return Promise.resolve(this.edition);
      },
      resolveObjects: (decisionId) => {
        this.calls.resolver += 1;
        if (this.resolverFails.has(decisionId)) {
          return Promise.resolve({ data: null, error: { message: "boom" } });
        }
        if (this.resolverNull) return Promise.resolve({ data: null, error: null });
        const manifest = this.manifests.get(decisionId) ?? [];
        return Promise.resolve({
          data: manifest.map((item, index) => {
            const recorded = this.recorded.get(`${decisionId}/${item.attachmentId}`);
            return {
              attachmentId: item.attachmentId,
              kind: "plan_sheet",
              position: index + 1,
              label: `sheet ${index + 1}`,
              sha256: item.sha256,
              sizeBytes: recorded ? recorded.sizeBytes : item.sizeBytes,
              contentType: item.contentType,
              recorded: Boolean(recorded),
              objectPath: recorded?.path ?? null,
              source: recorded ? null : { bucket: "project-documents", path: item.sourcePath },
            };
          }),
          error: null,
        });
      },
      copyToStaging: (source, stagingPath) => {
        this.calls.storage += 1;
        this.beforeCopy?.();
        this.now += this.copyAdvanceMs;
        const data = this.sources.get(source.path);
        if (!data) return Promise.resolve(false);
        this.objects.set(stagingPath, { bytes: data.slice(), createdAtMs: this.now });
        return Promise.resolve(true);
      },
      openObject: (path) => {
        this.calls.storage += 1;
        const object = this.objects.get(path);
        if (!object) return Promise.resolve(null);
        const chunks = [object.bytes.slice(0, 3), object.bytes.slice(3)];
        return Promise.resolve({
          stream: new ReadableStream<Uint8Array>({
            start(controller) {
              for (const chunk of chunks) controller.enqueue(chunk);
              controller.close();
            },
          }),
          contentType: "application/pdf",
        });
      },
      move: (fromPath, toPath) => {
        this.calls.storage += 1;
        const object = this.objects.get(fromPath);
        if (!object || this.objects.has(toPath)) return Promise.resolve(false);
        this.objects.delete(fromPath);
        this.objects.set(toPath, { ...object, createdAtMs: this.now });
        return Promise.resolve(true);
      },
      remove: (paths) => {
        this.calls.storage += 1;
        for (const path of paths) this.objects.delete(path);
        return Promise.resolve();
      },
      record: async (args) => {
        this.calls.record += 1;
        await this.recordGate?.(args);
        if (this.recordError) return { data: null, error: { message: "connection reset" } };
        const item = (this.manifests.get(args.p_decision_id) ?? [])
          .find((candidate) => candidate.attachmentId === args.p_attachment_id);
        if (!item || item.sha256 !== args.p_sha256) {
          return { data: null, error: { message: "checksum refused" } };
        }
        if (!this.objects.has(args.p_object_path)) {
          return { data: null, error: { message: "no stored edition object" } };
        }
        const key = `${args.p_decision_id}/${args.p_attachment_id}`;
        if (!this.recorded.has(key)) {
          this.recorded.set(key, { path: args.p_object_path, sizeBytes: args.p_size_bytes });
        }
        return { data: this.recorded.get(key)!.path === args.p_object_path, error: null };
      },
      list: (prefix) => {
        this.calls.storage += 1;
        return Promise.resolve(
          [...this.objects.entries()]
            .filter(([path]) => path.startsWith(prefix))
            .map(([path, object]) => ({ path, createdAtMs: object.createdAtMs })),
        );
      },
      sign: (paths) => {
        this.calls.sign += 1;
        if (this.signOverride) return Promise.resolve(this.signOverride(paths));
        return Promise.resolve({
          data: paths.map((path) =>
            this.objects.has(path)
              ? { error: null, path, signedUrl: `https://signed.test/${path}?token=t` }
              : { error: "Object not found", path, signedUrl: null }
          ),
          error: null,
        });
      },
      newAttemptId: () => {
        this.attempts += 1;
        return `00000000-0000-4000-8000-${String(this.attempts).padStart(12, "0")}`;
      },
      now: () => this.now,
    };
  }
}

/** A world where DECISION's two sheets are already recorded. */
async function recordedWorld() {
  const world = new World();
  world.addSource(DECISION, ATT_A, "%PDF-sheet-a");
  world.addSource(DECISION, ATT_B, "%PDF-sheet-b");
  const first = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(first.status, 200);
  world.calls = { edition: 0, resolver: 0, storage: 0, sign: 0, record: 0 };
  return world;
}

Deno.test("200: ok signs every recorded object and returns attachmentId, signedUrl, sizeBytes", async () => {
  const world = await recordedWorld();
  const result = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(result.status, 200);
  const urls = result.body.urls as { attachmentId: string; signedUrl: string; sizeBytes: number }[];
  assertEquals(urls.map((url) => url.attachmentId), [ATT_A, ATT_B]);
  assertEquals(urls.map((url) => url.sizeBytes), [12, 12]);
  assert(urls.every((url) => url.signedUrl.startsWith("https://signed.test/")));
  assertEquals(result.body.expiresInSeconds, 300);
  assertEquals(Object.keys(urls[0]).sort(), ["attachmentId", "signedUrl", "sizeBytes"]);
  // Nothing materialized on the sign path, and no storage path is returned.
  assertEquals(world.calls.record, 0);
  assert(!JSON.stringify(result.body).includes('"objectPath"'));
});

Deno.test("404: not_found is identical for a nonexistent and an existing-denied id, with zero storage calls", async () => {
  const bodies: unknown[] = [];
  for (const decisionId of [DECISION, OTHER_DECISION]) {
    const world = await recordedWorld();
    world.edition = envelope("not_found", decisionId);
    const result = await handleDecisionRequest(world.port(), decisionId);
    assertEquals(result.status, 404);
    bodies.push(result.body);
    assertEquals(world.calls, { edition: 1, resolver: 0, storage: 0, sign: 0, record: 0 });
  }
  assertEquals(bodies[0], { error: "not_found" });
  assertEquals(bodies[0], bodies[1]);
});

Deno.test("404: revoked and unauthorized answer {error: status} before any storage work", async () => {
  for (const status of ["revoked", "unauthorized"]) {
    const world = await recordedWorld();
    world.edition = envelope(status);
    const result = await handleDecisionRequest(world.port(), DECISION);
    assertEquals(result, { status: 404, body: { error: status } });
    assertEquals(world.calls, { edition: 1, resolver: 0, storage: 0, sign: 0, record: 0 });
  }
});

Deno.test("503 edition_unavailable: RPC error, null body and undecodable envelopes never answer 404", async () => {
  const good = envelope("ok").data;
  const answers: RpcResult[] = [
    { data: null, error: { message: "PGRST202", code: "PGRST202" } },
    { data: good, error: { message: "timeout" } },
    { data: null, error: null },
    { data: "not json", error: null },
    { data: [good], error: null },
    { data: { ...good, contract: "shared_direction_v2" }, error: null },
    { data: { ...good, status: "gone" }, error: null },
    { data: { ...good, decisionId: OTHER_DECISION }, error: null },
  ];
  for (const answer of answers) {
    const world = await recordedWorld();
    world.edition = answer;
    const result = await handleDecisionRequest(world.port(), DECISION);
    assertEquals(result, { status: 503, body: { error: "edition_unavailable" } });
    assertEquals(world.calls, { edition: 1, resolver: 0, storage: 0, sign: 0, record: 0 });
  }
});

Deno.test("503 media_unavailable: a missing object or any failed signing item returns no URLs", async () => {
  // A recorded object that storage no longer has: the per-item error keeps the batch length.
  const missing = await recordedWorld();
  missing.objects.delete(missing.recorded.get(`${DECISION}/${ATT_B}`)!.path);
  assertEquals(await handleDecisionRequest(missing.port(), DECISION), {
    status: 503,
    body: { error: "media_unavailable" },
  });

  const variants: ((paths: string[]) => { data: SignedItem[] | null; error: unknown })[] = [
    () => ({ data: null, error: { message: "storage down" } }),
    (paths) => ({ data: [{ error: null, path: paths[0], signedUrl: "https://x" }], error: null }),
    (paths) => ({
      data: [
        { error: null, path: paths[1], signedUrl: "https://x" },
        { error: null, path: paths[0], signedUrl: "https://y" },
      ],
      error: null,
    }),
    (paths) => ({
      data: [
        { error: null, path: paths[0], signedUrl: "https://x" },
        { error: null, path: paths[1], signedUrl: "" },
      ],
      error: null,
    }),
    (paths) => ({
      data: [
        { error: null, path: paths[0], signedUrl: "https://x" },
        { error: "Object not found", path: paths[1], signedUrl: "https://y" },
      ],
      error: null,
    }),
  ];
  for (const variant of variants) {
    const world = await recordedWorld();
    world.signOverride = variant;
    const result = await handleDecisionRequest(world.port(), DECISION);
    assertEquals(result, { status: 503, body: { error: "media_unavailable" } });
    assertEquals(world.calls.sign, 1);
  }
});

Deno.test("503 media_unavailable: a resolver error or a served null set; a budget edition signs nothing", async () => {
  const failing = await recordedWorld();
  failing.resolverFails.add(DECISION);
  assertEquals((await handleDecisionRequest(failing.port(), DECISION)).status, 503);

  const nullSet = await recordedWorld();
  nullSet.resolverNull = true;
  assertEquals(await handleDecisionRequest(nullSet.port(), DECISION), {
    status: 503,
    body: { error: "media_unavailable" },
  });

  const budget = new World();
  assertEquals(await handleDecisionRequest(budget.port(), DECISION), {
    status: 200,
    body: { urls: [], expiresInSeconds: 300 },
  });
  assertEquals(budget.calls.sign, 0);
});

Deno.test("materialization: staged copy is verified, published to the attempt's own path and recorded", async () => {
  const world = new World();
  const { sha256 } = world.addSource(DECISION, ATT_A, "%PDF-sheet-a");
  const result = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(result.status, 200);
  const recorded = world.recorded.get(`${DECISION}/${ATT_A}`)!;
  assertEquals(recorded.path, `${DECISION}/${ATT_A}/${sha256}/00000000-0000-4000-8000-000000000001`);
  assertEquals(recorded.sizeBytes, 12);
  assertEquals(world.finals(), [recorded.path]);
  assertEquals([...world.objects.keys()].filter((path) => path.includes("_staging")), []);
});

Deno.test("409: a staging mismatch records nothing and leaves no final or staging object", async () => {
  const world = new World();
  const { sourcePath } = world.addSource(DECISION, ATT_A, "%PDF-sheet-a");
  world.sources.set(sourcePath, bytes("%PDF-overwritten"));
  const result = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(result, { status: 409, body: { error: "media_integrity_failed" } });
  assertEquals(world.calls.record, 0);
  assertEquals(world.recorded.size, 0);
  assertEquals(world.objects.size, 0);
});

Deno.test("source mutated mid-attempt: the staging hash fails and nothing publishes; the retry records verified bytes", async () => {
  const world = new World();
  const { sourcePath, sha256 } = world.addSource(DECISION, ATT_A, "%PDF-sheet-a");
  const original = world.sources.get(sourcePath)!;
  // A co-member overwrites the source between the resolver read and the copy.
  world.beforeCopy = () => world.sources.set(sourcePath, bytes("%PDF-replaced"));
  assertEquals((await handleDecisionRequest(world.port(), DECISION)).status, 409);
  assertEquals(world.objects.size, 0);

  world.beforeCopy = undefined;
  world.sources.set(sourcePath, original);
  const retry = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(retry.status, 200);
  const recorded = world.recorded.get(`${DECISION}/${ATT_A}`)!;
  assert(recorded.path.startsWith(`${DECISION}/${ATT_A}/${sha256}/`));
  assertEquals(sha(world.objects.get(recorded.path)!.bytes), sha256);
});

Deno.test("two concurrent attempts: exactly one recorded object and no orphan once the suspended loser resumes", async () => {
  const world = new World();
  world.addSource(DECISION, ATT_A, "%PDF-sheet-a");
  let releaseFirst!: () => void;
  const firstHeld = new Promise<void>((resolve) => (releaseFirst = resolve));
  let reachedRecord!: () => void;
  const firstAtRecord = new Promise<void>((resolve) => (reachedRecord = resolve));
  let gated = false;
  world.recordGate = async () => {
    if (gated) return;
    gated = true;
    reachedRecord();
    await firstHeld; // suspended between move and record
  };

  const first = handleDecisionRequest(world.port(), DECISION);
  await firstAtRecord;
  const second = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(second.status, 200);
  const winner = world.recorded.get(`${DECISION}/${ATT_A}`)!.path;
  assertEquals(world.finals().length, 2); // the loser's own object is still published

  releaseFirst();
  const loser = await first;
  assertEquals(loser.status, 200);
  assertEquals(world.recorded.get(`${DECISION}/${ATT_A}`)!.path, winner);
  assertEquals(world.finals(), [winner]);
  assertEquals(world.objects.size, 1);
});

Deno.test("interrupted attempt: the unrecorded published object is swept after 24 h and the retry records a fresh one", async () => {
  const world = new World();
  world.addSource(DECISION, ATT_A, "%PDF-sheet-a");
  world.recordError = true;
  assertEquals((await handleDecisionRequest(world.port(), DECISION)).status, 503);
  const orphan = world.finals();
  assertEquals(orphan.length, 1);
  assertEquals(world.recorded.size, 0);

  world.recordError = false;
  world.now += SWEEP_AGE_MS + 60_000;
  const retry = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(retry.status, 200);
  const recorded = world.recorded.get(`${DECISION}/${ATT_A}`)!.path;
  assertNotEquals(recorded, orphan[0]);
  assertEquals(world.finals(), [recorded]);
});

Deno.test("same checksum, two attachments: two objects at two paths and two rows", async () => {
  const world = new World();
  world.addSource(DECISION, ATT_A, "%PDF-identical");
  world.addSource(DECISION, ATT_B, "%PDF-identical");
  const result = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(result.status, 200);
  const a = world.recorded.get(`${DECISION}/${ATT_A}`)!.path;
  const b = world.recorded.get(`${DECISION}/${ATT_B}`)!.path;
  assertNotEquals(a, b);
  assertEquals(world.finals().sort(), [a, b].sort());
  assertEquals((result.body.urls as unknown[]).length, 2);
});

Deno.test("resumable: past the time budget the request answers 202 materializing, then completes", async () => {
  const world = new World();
  world.addSource(DECISION, ATT_A, "%PDF-sheet-a");
  world.addSource(DECISION, ATT_B, "%PDF-sheet-b");
  world.copyAdvanceMs = MATERIALIZE_BUDGET_MS;
  const first = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(first, {
    status: 202,
    body: { status: "materializing", ready: 1, total: 2, retryAfterSeconds: 2 },
  });
  assertEquals(world.calls.sign, 0);
  const second = await handleDecisionRequest(world.port(), DECISION);
  assertEquals(second.status, 200);
  assertEquals(world.recorded.size, 2);
});

Deno.test("sweep mode: removes stale staging and stale unrecorded finals, never a recorded or fresh object", async () => {
  const world = await recordedWorld();
  const recordedA = world.recorded.get(`${DECISION}/${ATT_A}`)!.path;
  const stale = T0 - SWEEP_AGE_MS - 1;
  const put = (path: string, createdAtMs: number) =>
    world.objects.set(path, { bytes: bytes("x"), createdAtMs });
  const shaA = world.manifests.get(DECISION)![0].sha256;
  put(`${DECISION}/_staging/00000000-0000-4000-8000-0000000000a1`, stale);
  put(`${DECISION}/_staging/00000000-0000-4000-8000-0000000000a2`, T0);
  put(`${DECISION}/${ATT_A}/${shaA}/00000000-0000-4000-8000-0000000000a3`, stale);
  put(`${DECISION}/${ATT_A}/${shaA}/00000000-0000-4000-8000-0000000000a4`, T0);
  world.objects.get(recordedA)!.createdAtMs = stale;
  // A decision whose resolver fails keeps its finals; its stale staging still goes.
  world.resolverFails.add(OTHER_DECISION);
  put(`${OTHER_DECISION}/${ATT_A}/${shaA}/00000000-0000-4000-8000-0000000000b1`, stale);
  put(`${OTHER_DECISION}/_staging/00000000-0000-4000-8000-0000000000b2`, stale);

  const result = await sweepAll(world.port());
  assertEquals(result.removed, 3);
  assertEquals(result.skipped, 1);
  assertEquals([...world.objects.keys()].sort(), [
    `${DECISION}/_staging/00000000-0000-4000-8000-0000000000a2`,
    `${DECISION}/${ATT_A}/${shaA}/00000000-0000-4000-8000-0000000000a4`,
    recordedA,
    world.recorded.get(`${DECISION}/${ATT_B}`)!.path,
    `${OTHER_DECISION}/${ATT_A}/${shaA}/00000000-0000-4000-8000-0000000000b1`,
  ].sort());
});

Deno.test("parseRequest and hashStream", async () => {
  assertEquals(parseRequest({ mode: "sweep" }), { kind: "sweep" });
  assertEquals(parseRequest({ decisionId: DECISION.toUpperCase() }), {
    kind: "decision",
    decisionId: DECISION,
  });
  assertEquals(parseRequest({ decisionId: "nope" }), null);
  assertEquals(parseRequest(null), null);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes("ab"));
      controller.enqueue(bytes("c"));
      controller.close();
    },
  });
  assertEquals(await hashStream(stream), {
    sha256: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    sizeBytes: 3,
  });
});

// ── Local stack (N1): the real port against PostgREST and Storage ────────────────────
// Runs only when SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY point at
// a local stack with 00670 applied. Fixture ids are random per run and marker-tagged
// `sq235-ni06`; the recorded row and its object are immutable by design and stay.
const LOCAL = {
  url: Deno.env.get("SUPABASE_URL") ?? "",
  anonKey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
};
const LOCAL_READY = /^http:\/\/(127\.0\.0\.1|localhost):/.test(LOCAL.url) &&
  Boolean(LOCAL.anonKey && LOCAL.serviceRoleKey);

// deno-lint-ignore no-explicit-any
function must(result: { data: any; error: any }, step: string): any {
  if (result.error) throw new Error(`${step}: ${JSON.stringify(result.error)}`);
  return result.data;
}

Deno.test({
  name: "local stack: ok materializes through the public recorder wrapper and signs verified bytes",
  ignore: !LOCAL_READY,
  sanitizeOps: false,
  sanitizeResources: false,
  fn: async () => {
    const noSession = { auth: { persistSession: false, autoRefreshToken: false } };
    const admin = createClient(LOCAL.url, LOCAL.serviceRoleKey, noSession);
    const tag = crypto.randomUUID().slice(0, 8);
    const password = `sq235-${crypto.randomUUID()}`;
    const makeUser = async (role: string) =>
      must(
        await admin.auth.admin.createUser({
          email: `sq235-ni06-${role}-${tag}@test.invalid`,
          password,
          email_confirm: true,
        }),
        `create ${role}`,
      ).user!.id;
    const designerId = await makeUser("designer");
    const leadId = await makeUser("lead");
    const studioId = crypto.randomUUID();
    const projectId = crypto.randomUUID();

    must(
      await admin.from("profiles").upsert([
        { id: designerId, email: `sq235-ni06-designer-${tag}@test.invalid`, full_name: "NI06 Designer", is_designer: true },
        { id: leadId, email: `sq235-ni06-lead-${tag}@test.invalid`, full_name: "NI06 Lead", is_designer: false },
      ]),
      "profiles",
    );
    must(
      await admin.from("organizations").insert({
        id: studioId, type: "design_studio", name: `sq235-ni06 ${tag}`, slug: `sq235-ni06-${tag}`, status: "active",
      }),
      "organization",
    );
    must(
      await admin.from("organization_members").insert({
        user_id: designerId, organization_id: studioId, role: "owner", status: "active", joined_at: new Date().toISOString(),
      }),
      "membership",
    );
    const ownerRole = must(
      await admin.from("roles").select("id").eq("name", "studio_owner").single(),
      "studio_owner role",
    ) as { id: string };
    must(
      await admin.from("user_roles").insert({ user_id: designerId, role_id: ownerRole.id, granted_by: designerId }),
      "user_roles",
    );
    must(
      await admin.from("designer_clients").insert({
        designer_id: designerId, client_id: leadId, client_name: "NI06 Lead", status: "active", source: "direct",
      }),
      "designer_clients",
    );
    must(
      await admin.from("projects").insert({
        id: projectId, name: `sq235-ni06 ${tag}`, designer_id: designerId, client_id: leadId,
        created_by: designerId, studio_id: studioId, status: "active",
      }),
      "project",
    );

    const pdf = bytes(`%PDF-1.4 sq235-ni06 ${tag}`);
    const pdfSha = sha(pdf);
    const storagePath = `${projectId}/plans/a101-${tag}.pdf`;
    must(
      await admin.storage.from("project-documents").upload(storagePath, pdf, { contentType: "application/pdf" }),
      "upload source",
    );

    const session = must(
      await createClient(LOCAL.url, LOCAL.anonKey, noSession).auth.signInWithPassword({
        email: `sq235-ni06-designer-${tag}@test.invalid`,
        password,
      }),
      "sign in",
    ).session!;
    const designer = createClient(LOCAL.url, LOCAL.anonKey, {
      ...noSession,
      global: { headers: { Authorization: `Bearer ${session.access_token}` } },
    });
    must(await designer.rpc("create_project_phase", {
      p_project_id: projectId, p_phase_key: "design", p_name: "Design", p_sort_order: 0,
    }), "phase");
    const phaseId = (must(
      await admin.from("project_phases").select("id").eq("project_id", projectId).eq("phase_key", "design")
        .single(),
      "phase id",
    ) as { id: string }).id;
    must(await designer.rpc("set_project_decision_authority", {
      p_project_id: projectId, p_decision_lead_id: leadId, p_required_coapprover_id: null, p_expected_revision: 0,
    }), "authority");
    must(await designer.rpc("file_plan_prints", {
      p_project_id: projectId,
      p_idempotency_key: `sq235-${tag}`,
      p_entries: [{
        kind: "new_sheet",
        sheet: { number: "A-101", title: "Ground floor" },
        print: { storage_path: storagePath, sha256: pdfSha, size_bytes: pdf.byteLength },
      }],
      p_source_filename: "sq235.pdf",
    }), "file_plan_prints");
    must(await designer.rpc("create_plan_issue", {
      p_project_id: projectId, p_name: "Issue one", p_idempotency_key: `sq235-issue-${tag}`,
    }), "create_plan_issue");
    const issue = must(
      await admin.from("plan_issues").select("id").eq("project_id", projectId).single(),
      "issue",
    ) as { id: string };
    const created = must(await designer.rpc("create_project_approval_decision", {
      p_project_id: projectId,
      p_payload: {
        title: "NI06 edition", question: "Approve?", context: "sq235-ni06 fixture.",
        dueAt: new Date(Date.now() + 5 * 86_400_000).toISOString(), phaseId, sectionKey: "project",
        artifactKind: "plan_issue", artifactId: issue.id,
        costCentsDelta: 0, scheduleDaysDelta: 0, leadTimeDaysDelta: 0,
      },
      p_idempotency_key: `sq235-decision-${tag}`,
      p_why: null,
    }), "create decision") as { decisionId: string };
    const decisionId = created.decisionId;

    // A negative answer from the real RPC: an id the caller cannot read.
    const port = buildPort(LOCAL, `Bearer ${session.access_token}`);
    assertEquals(await handleDecisionRequest(port, crypto.randomUUID()), {
      status: 404,
      body: { error: "not_found" },
    });

    const result = await handleDecisionRequest(port, decisionId);
    assertEquals(result.status, 200, JSON.stringify(result.body));
    const urls = result.body.urls as { attachmentId: string; signedUrl: string; sizeBytes: number }[];
    assertEquals(urls.length, 1);
    assertEquals(urls[0].sizeBytes, pdf.byteLength);
    const downloaded = new Uint8Array(await (await fetch(urls[0].signedUrl)).arrayBuffer());
    assertEquals(sha(downloaded), pdfSha);

    // Read back through the service-role resolver: recorded at a per-attempt final path.
    const resolved = must(
      await admin.rpc("project_approval_attachment_objects", { p_decision_id: decisionId }),
      "resolver",
    ) as { attachmentId: string; recorded: boolean; objectPath: string }[];
    assertEquals(resolved.length, 1);
    assert(resolved[0].recorded);
    assert(
      new RegExp(`^${decisionId}/${resolved[0].attachmentId}/${pdfSha}/[0-9a-f-]{36}$`)
        .test(resolved[0].objectPath),
    );
    const recordArgs = {
      p_decision_id: decisionId,
      p_attachment_id: resolved[0].attachmentId,
      p_sha256: pdfSha,
      p_size_bytes: pdf.byteLength,
      p_content_type: "application/pdf",
      p_object_path: resolved[0].objectPath,
    };
    // N1: the public wrapper is reachable through PostgREST with the service key and
    // idempotent for the recorded path; an authenticated caller is denied.
    assertEquals(
      must(await admin.rpc("record_project_approval_edition_object", recordArgs), "re-record"),
      true,
    );
    const denied = await designer.rpc("record_project_approval_edition_object", recordArgs);
    assert(denied.error, "authenticated must be denied on the recorder wrapper");
    // No staging object is left behind.
    const left = must(
      await admin.storage.from("project-approval-editions").listV2({ prefix: `${decisionId}/_staging/` }),
      "list staging",
    );
    assertEquals(left.objects.length, 0);
    // A second request signs the recorded copy without materializing again.
    const again = await handleDecisionRequest(port, decisionId);
    assertEquals(again.status, 200);
  },
});
