import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { ingestPlate, recordPlate } from "./ingest.ts";
import type { PlateRequest } from "./lib.ts";

const request: PlateRequest = {
  id: "request", project_id: "project", asset_id: "asset", source_kind: "upload",
  source_ref: null, source_url: "https://source.test/photo.jpg", lease_token: "lease",
};
const worker = { workerUrl: "https://worker.test", secret: "test-secret" };

function database(data: unknown, error: unknown = null) {
  const calls: unknown[] = [];
  const query = {
    select(fields: string) { calls.push(fields); return query; },
    eq(field: string, value: string) { calls.push([field, value]); return query; },
    abortSignal(signal: AbortSignal) { calls.push(signal); return query; },
    maybeSingle() { return Promise.resolve({ data, error }); },
  };
  const admin = { from(table: string) { calls.push(table); return query; } };
  return { admin: admin as unknown as Parameters<typeof ingestPlate>[0], calls };
}

Deno.test("ingest payload forwards latest designer focal and subject box with auth and deadline", async () => {
  const db = database({ focal: [0.7, 0.4], subject_box: [0.2, 0.1, 0.6, 0.8] });
  const signal = new AbortController().signal;
  using send = stub(globalThis, "fetch", (_url, init) => {
    assertEquals(_url, "https://worker.test/plates/ingest");
    assertEquals(init?.headers, { Authorization: "Bearer test-secret", "Content-Type": "application/json" });
    assertEquals(init?.signal, signal);
    assertEquals(JSON.parse(String(init?.body)), {
      projectId: "project", requestId: "request", sourceKind: "upload", sourceUrl: "https://signed.test/photo.jpg",
      focal: [0.7, 0.4], subjectBox: [0.2, 0.1, 0.6, 0.8],
    });
    return Promise.resolve(new Response("{}"));
  });
  await ingestPlate(db.admin, worker, request, "https://signed.test/photo.jpg", signal);
  assertEquals(db.calls, ["client_plate_assets", "focal, subject_box", ["project_id", "project"], ["id", "asset"], signal]);
  assertEquals(send.calls.length, 1);
});

Deno.test("ingest payload sends null geometry for unset, missing and new assets", async () => {
  using send = stub(globalThis, "fetch", (_url, init) => {
    const body = JSON.parse(String(init?.body));
    assertEquals(body.focal, null);
    assertEquals(body.subjectBox, null);
    return Promise.resolve(new Response("{}"));
  });
  for (const data of [{ focal: null, subject_box: null }, null]) {
    await ingestPlate(database(data).admin, worker, request, request.source_url, new AbortController().signal);
  }
  const fresh = database(null);
  await ingestPlate(fresh.admin, worker, { ...request, asset_id: null }, request.source_url, new AbortController().signal);
  assertEquals(fresh.calls, []);
  assertEquals(send.calls.length, 3);
});

Deno.test("geometry lookup errors fail rather than silently ingesting default crops", async () => {
  using send = stub(globalThis, "fetch", () => Promise.resolve(new Response("{}")));
  await assertRejects(
    () => ingestPlate(database(null, { message: "offline" }).admin, worker, request, request.source_url, new AbortController().signal),
    Error, "plate geometry lookup failed: offline",
  );
  assertEquals(send.calls.length, 0);
});

Deno.test("settle payload carries the exact framing sent to ingest despite a later focal change", async () => {
  const original = { focal: [0.7, 0.4], subject_box: [0.2, 0.1, 0.6, 0.8] };
  const db = database(original);
  const signal = new AbortController().signal;
  let sent: Record<string, unknown> = {};
  using send = stub(globalThis, "fetch", (_url, init) => {
    sent = JSON.parse(String(init?.body));
    return Promise.resolve(new Response("{}"));
  });
  const { response, framing } = await ingestPlate(db.admin, worker, request, request.source_url, signal);
  await response.text();
  original.focal = [0.1, 0.2];
  original.subject_box = [0, 0, 1, 1];
  const calls: unknown[] = [];
  const admin = { rpc(name: string, args: unknown) {
    calls.push([name, args]);
    return { abortSignal(given: AbortSignal) { calls.push(given); return Promise.resolve({ error: null }); } };
  } } as unknown as Parameters<typeof recordPlate>[0];
  const asset = { sha256: "a".repeat(64), width: 1600, height: 1200, format: "jpeg", ground: null,
    dominantHex: null, lqip: null, originalKey: "plates/project/a/original.jpg", crops: {} };
  await recordPlate(admin, request, asset, framing, signal);
  assertEquals(framing, { focal: sent.focal, subjectBox: sent.subjectBox });
  assertEquals(calls, [["record_client_plate_asset", {
    p_request_id: request.id, p_lease_token: request.lease_token,
    p_asset: { ...asset, source_kind: request.source_kind, source_ref: request.source_ref },
    p_framing: { focal: [0.7, 0.4], subjectBox: [0.2, 0.1, 0.6, 0.8] },
  }], signal]);
  assertEquals(send.calls.length, 1);
});
