import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { FakeTime } from "https://deno.land/std@0.224.0/testing/time.ts";
import { RunDeadline, systemClock } from "./lib.ts";

// Capture the real entry point without listening on a port. No handler copy
// or replacement adapter: requests below traverse the production Supabase SDK.
let handler: (req: Request) => Promise<Response>;
const serve = stub(Deno, "serve", (fn: unknown) => {
  handler = fn as typeof handler;
  return {} as Deno.HttpServer;
});
try {
  await import("./index.ts");
} finally {
  serve.restore();
}

const PROJECT = "84300000-0000-4000-8000-000000000001";
const ROW = {
  id: "r1", project_id: PROJECT, lease_token: "t1", source_kind: "concept",
  source_ref: { table: "project_rooms", id: "room1" },
  source_url: `${PROJECT}/84300000-0000-4000-8000-000000000011/render.png`,
};
const TOKEN = `${btoa('{}')}.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;

async function withEnv(test: () => Promise<void>) {
  const values: Record<string, string> = {
    SUPABASE_URL: "https://strata.example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
    MEDIA_WORKER_URL: "https://media.example.test",
    PLATE_INGEST_SECRET: "test-ingest-secret",
  };
  const saved = Object.keys(values).map((key) => [key, Deno.env.get(key)] as const);
  for (const [key, value] of Object.entries(values)) Deno.env.set(key, value);
  try {
    await test();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

async function advance(time: FakeTime, to: number) {
  while (time.now < to) await time.tickAsync(Math.min(1_000, to - time.now));
  await time.runMicrotasks();
}

function post(body: BodyInit = JSON.stringify({ job_run_id: 42 })) {
  return new Request("https://edge.example.test/client-plate-copy", {
    method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body,
  });
}

// Failing the row and finishing the run take until 48 s, so run shutdown
// (run.close() in the handler's finally) cannot be what aborts the signing
// fetch at 45 s: only the address step's own signal can.
Deno.test("handler: hung production signing fetch is aborted by the address step at 45 s, before shutdown at 48 s", () => withEnv(async () => {
  const time = new FakeTime(0);
  let signedAt: number | null = null;
  let abortedAt: number | null = null;
  let finishedAt: number | null = null;
  const settles: string[] = [];
  const transport = stub(globalThis, "fetch", (input, init) => {
    const url = String(input);
    if (url.includes("/object/sign/")) {
      signedAt = Date.now();
      return new Promise<Response>((_resolve, reject) => {
        const signal = init!.signal!;
        signal.addEventListener("abort", () => {
          abortedAt = Date.now();
          reject(signal.reason);
        }, { once: true });
      });
    }
    if (url.endsWith("/claim_client_plate_requests")) return Promise.resolve(Response.json([ROW]));
    if (url.endsWith("/client_plate_source_owned")) return Promise.resolve(Response.json(true));
    if (url.endsWith("/fail_client_plate_request") || url.endsWith("/finish_client_plate_copy_run")) {
      settles.push(url.slice(url.lastIndexOf("/") + 1));
      return new Promise<Response>((resolve) => setTimeout(() => resolve(Response.json(null)), 1_500));
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const response = handler(post()).then((value) => { finishedAt = Date.now(); return value; });
    await advance(time, 70_000);
    assertEquals(signedAt, 0, "the production Storage adapter actually started signing");
    assertEquals(settles, ["fail_client_plate_request", "finish_client_plate_copy_run"]);
    assert(finishedAt !== null && finishedAt >= 48_000 && finishedAt <= 50_000, `shutdown at ${finishedAt}, after the delayed fail and finish`);
    assertEquals(abortedAt, 45_000, "the address step cancels the signing transport before shutdown");
    assertEquals((await response).status, 200);
  } finally {
    transport.restore();
    time.restore();
  }
}));

Deno.test("handler: ownership answered at 61 s never starts the production signing fetch", () => withEnv(async () => {
  const time = new FakeTime(0);
  let signs = 0;
  let finishedAt: number | null = null;
  const transport = stub(globalThis, "fetch", (input) => {
    const url = String(input);
    if (url.endsWith("/claim_client_plate_requests")) return Promise.resolve(Response.json([ROW]));
    if (url.endsWith("/client_plate_source_owned")) {
      // An already-sent ownership answer can arrive despite cancellation.
      return new Promise<Response>((resolve) => setTimeout(() => resolve(Response.json(true)), 61_000));
    }
    if (url.includes("/object/sign/")) {
      signs++;
      return Promise.resolve(Response.json({ signedURL: "/object/sign/test?token=test" }));
    }
    if (url.endsWith("/fail_client_plate_request") || url.endsWith("/finish_client_plate_copy_run")) {
      return Promise.resolve(Response.json(null));
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const response = handler(post()).then((value) => { finishedAt = Date.now(); return value; });
    await advance(time, 70_000);
    assertEquals(finishedAt, 45_000);
    assertEquals(signs, 0, "no signing is admitted after the ownership step was aborted");
    assertEquals((await response).status, 200);
  } finally {
    transport.restore();
    time.restore();
  }
}));

Deno.test("handler: incomplete request JSON is cancelled and the handler settles at 50 s", () => withEnv(async () => {
  const time = new FakeTime(0);
  let cancelledAt: number | null = null;
  let finishedAt: number | null = null;
  let calls = 0;
  const body = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{"job_run_id":')); },
    cancel() { cancelledAt = Date.now(); },
  });
  const transport = stub(globalThis, "fetch", () => {
    calls++;
    throw new Error("an incomplete body must not open or claim a run");
  });
  try {
    const response = handler(post(body)).then((value) => { finishedAt = Date.now(); return value; });
    await advance(time, 50_000);
    assertEquals(cancelledAt, 50_000, "deadline cancels the incoming body stream");
    assertEquals(finishedAt, 50_000, "entry-to-response deadline includes body acquisition");
    assertEquals((await response).status, 408);
    assertEquals(calls, 0);
  } finally {
    transport.restore();
    time.restore();
  }
}));

Deno.test("RunDeadline.close: aborts every outstanding controller instead of leaving transports alive", () => {
  const time = new FakeTime(0);
  try {
    const run = new RunDeadline(systemClock);
    const signals = [run.by(45_000), run.by(48_000), run.by(50_000)];
    run.close();
    assert(signals.every((signal) => signal.aborted), "shutdown owns all outstanding cancellation");
    run.close();
  } finally {
    time.restore();
  }
});
