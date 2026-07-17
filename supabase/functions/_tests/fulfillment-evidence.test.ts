/// <reference lib="deno.ns" />
// ^ see catalog-normalizer.test.ts / apns-send.test.ts for why this reference
// is needed against the monorepo root tsconfig.json.
//
// fulfillment-evidence (S7) — client evidence-upload flow. Pure handler +
// fake-supabase (_tests/fake-supabase.ts) — no live stack, no network,
// mirroring fulfillment-notify.test.ts's offline idiom. Real Request/
// FormData/File objects are used directly (Deno's fetch API is global), so
// handleEvidence is exercised exactly as index.ts's Deno.serve would call it.
// Run:
//   deno test --no-check -A supabase/functions/_tests/fulfillment-evidence.test.ts

import { assert, assertEquals, assertMatch, assertStrictEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { getEvidenceContext, handleEvidence, uploadEvidence, type EvidenceDeps } from "../fulfillment-evidence/core.ts";
import { createFakeSupabase } from "./fake-supabase.ts";

const VALID_TOKEN = "a".repeat(64);
const OTHER_VALID_TOKEN = "b".repeat(64);
const EXPIRED_TOKEN = "c".repeat(64);

const VALID_CONTEXT = {
  valid: true,
  exception_id: "exc-1",
  exception_type: "damage",
  order_no: 42,
  item_name: "Heirloom Oak Dining Table",
  already_uploaded: 0,
  expires_at: "2026-08-01T00:00:00Z",
};

function makeDeps(overrides?: {
  contextHandler?: (args: Record<string, unknown>) => { data: unknown; error: unknown };
  appendHandler?: (args: Record<string, unknown>) => { data: unknown; error: unknown };
}) {
  let appendCalled = false;
  const appendCalls: Record<string, unknown>[] = [];

  const fake = createFakeSupabase(
    {},
    {
      fulfillment_evidence_token_context:
        overrides?.contextHandler ??
        ((args) => {
          if (args.p_token === VALID_TOKEN) return { data: VALID_CONTEXT, error: null };
          return { data: { valid: false }, error: null };
        }),
      fulfillment_append_evidence:
        overrides?.appendHandler ??
        ((args) => {
          appendCalled = true;
          appendCalls.push(args);
          const keys = args.p_keys as string[];
          return { data: { exception_id: args.p_token === VALID_TOKEN ? "exc-1" : null, added: keys.length }, error: null };
        }),
    },
  );

  const deps: EvidenceDeps = { supabase: fake as unknown as EvidenceDeps["supabase"] };
  return { deps, fake, appendCalled: () => appendCalled, appendCalls };
}

function makeImageFile(name = "photo.jpg", type = "image/jpeg", contents = "fake-bytes"): File {
  return new File([contents], name, { type });
}

// ── (a) context action ──────────────────────────────────────────────────

Deno.test("context action: a valid token returns the RPC's context verbatim", async () => {
  const { deps } = makeDeps();
  const ctx = await getEvidenceContext(deps, VALID_TOKEN);
  assertEquals(ctx, VALID_CONTEXT);
});

Deno.test("context action via handleEvidence: JSON POST {action:'context', token} returns 200 + context", async () => {
  const { deps } = makeDeps();
  const req = new Request("http://localhost/fulfillment-evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "context", token: VALID_TOKEN }),
  });
  const res = await handleEvidence(deps, req);
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body, VALID_CONTEXT);
});

Deno.test("context action: an invalid/expired token returns {valid:false}, not an error", async () => {
  const { deps } = makeDeps();
  const ctx = await getEvidenceContext(deps, EXPIRED_TOKEN);
  assertEquals(ctx, { valid: false });
});

// ── (b) multipart upload — happy path ───────────────────────────────────

Deno.test("upload: multipart with a valid token uploads N files to project-documents and appends N keys", async () => {
  const { deps, fake, appendCalls } = makeDeps();

  const form = new FormData();
  form.set("token", VALID_TOKEN);
  form.append("files", makeImageFile("one.jpg"));
  form.append("files", makeImageFile("two.png", "image/png"));
  form.append("files", makeImageFile("three.heic", "image/heic"));

  const req = new Request("http://localhost/fulfillment-evidence", { method: "POST", body: form });
  const res = await handleEvidence(deps, req);

  assertEquals(res.status, 200);
  const body = await res.json();
  assertStrictEquals(body.success, true);
  assertStrictEquals(body.added, 3);
  assertEquals(body.keys.length, 3);

  // Every upload landed in project-documents under fulfillment/evidence/<exception_id>/...
  assertEquals(fake._uploads.length, 3);
  for (const upload of fake._uploads) {
    assertStrictEquals(upload.bucket, "project-documents");
    assertMatch(upload.path, /^fulfillment\/evidence\/exc-1\/[^/]+\.(jpg|png|heic)$/);
  }
  // Extensions preserved per-file, sanitized + lowercased.
  assert(fake._uploads.some((u) => u.path.endsWith(".jpg")));
  assert(fake._uploads.some((u) => u.path.endsWith(".png")));
  assert(fake._uploads.some((u) => u.path.endsWith(".heic")));

  // fulfillment_append_evidence called exactly once with all 3 keys, actor 'client'.
  assertEquals(appendCalls.length, 1);
  assertEquals(appendCalls[0].p_token, VALID_TOKEN);
  assertEquals((appendCalls[0].p_keys as string[]).length, 3);
  assertStrictEquals(appendCalls[0].p_actor, "client");
});

Deno.test("upload: uploadEvidence() directly — single file round-trip", async () => {
  const { deps, fake } = makeDeps();
  const result = await uploadEvidence(deps, VALID_TOKEN, [makeImageFile()]);
  assertEquals(result.status, 200);
  assertStrictEquals(result.body.success, true);
  assertStrictEquals(result.body.added, 1);
  assertEquals(fake._uploads.length, 1);
});

Deno.test("upload: a filename with no extension defaults to jpg", async () => {
  const { deps, fake } = makeDeps();
  const req = new Request("http://localhost/fulfillment-evidence", {
    method: "POST",
    body: (() => {
      const form = new FormData();
      form.set("token", VALID_TOKEN);
      form.append("files", makeImageFile("noext", "image/jpeg"));
      return form;
    })(),
  });
  const res = await handleEvidence(deps, req);
  assertEquals(res.status, 200);
  assertMatch(fake._uploads[0].path, /\.jpg$/);
});

// ── (c) invalid/expired token → 403, no storage, no append ─────────────

Deno.test("upload: an invalid/expired token returns 403, uploads NOTHING, and never calls fulfillment_append_evidence", async () => {
  const { deps, fake, appendCalled } = makeDeps();

  const form = new FormData();
  form.set("token", EXPIRED_TOKEN);
  form.append("files", makeImageFile());

  const req = new Request("http://localhost/fulfillment-evidence", { method: "POST", body: form });
  const res = await handleEvidence(deps, req);

  assertEquals(res.status, 403);
  const body = await res.json();
  assertMatch(String(body.error), /invalid or expired token/);

  assertEquals(fake._uploads.length, 0, "no file should have been uploaded for an invalid token");
  assertStrictEquals(appendCalled(), false, "fulfillment_append_evidence must never be called for an invalid token");
});

Deno.test("upload: a well-formed but unknown token behaves identically to an expired one (403, no side effects)", async () => {
  const { deps, fake, appendCalled } = makeDeps();

  const result = await uploadEvidence(deps, OTHER_VALID_TOKEN, [makeImageFile()]);
  assertEquals(result.status, 403);
  assertEquals(fake._uploads.length, 0);
  assertStrictEquals(appendCalled(), false);
});

// ── format / shape guards ───────────────────────────────────────────────

Deno.test("context action: a malformed token (wrong shape) is rejected before any RPC call", async () => {
  const { deps, fake } = makeDeps();
  const req = new Request("http://localhost/fulfillment-evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "context", token: "not-a-real-token" }),
  });
  const res = await handleEvidence(deps, req);
  assertEquals(res.status, 400);
  // No table/rpc traffic at all — the fake's rpc call would still resolve
  // (handlers default to {data:null}), so the real assertion is the 400 status
  // plus zero uploads, proving we never got as far as calling the DB layer's
  // upload path.
  assertEquals(fake._uploads.length, 0);
});

Deno.test("upload: no files provided returns 400 without touching the token/append RPCs", async () => {
  const { deps, appendCalled } = makeDeps();
  const form = new FormData();
  form.set("token", VALID_TOKEN);
  const req = new Request("http://localhost/fulfillment-evidence", { method: "POST", body: form });
  const res = await handleEvidence(deps, req);
  assertEquals(res.status, 400);
  assertStrictEquals(appendCalled(), false);
});

Deno.test("JSON body: an action other than 'context' is rejected with 400", async () => {
  const { deps } = makeDeps();
  const req = new Request("http://localhost/fulfillment-evidence", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "upload", token: VALID_TOKEN }),
  });
  const res = await handleEvidence(deps, req);
  assertEquals(res.status, 400);
});

Deno.test("upload: fulfillment_append_evidence raising 'invalid or expired token' (TOCTOU) surfaces as 403", async () => {
  const { deps, fake } = makeDeps({
    appendHandler: () => ({ data: null, error: { message: "fulfillment_append_evidence: invalid or expired token" } }),
  });
  const result = await uploadEvidence(deps, VALID_TOKEN, [makeImageFile()]);
  assertEquals(result.status, 403);
  // The file WAS uploaded (context check passed) even though the append then
  // failed — this documents the narrow TOCTOU window rather than hiding it.
  assertEquals(fake._uploads.length, 1);
});
