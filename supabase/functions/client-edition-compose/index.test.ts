import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { stub } from "https://deno.land/std@0.224.0/testing/mock.ts";
import { FakeTime } from "https://deno.land/std@0.224.0/testing/time.ts";

// Capture the real entry point without listening on a port: requests below
// traverse the production handler and the production Supabase SDK.
let handler: (req: Request) => Promise<Response>;
const serve = stub(Deno, "serve", ((fn: unknown) => {
  handler = fn as typeof handler;
  return {} as Deno.HttpServer;
}) as never);
try {
  await import("./index.ts");
} finally {
  serve.restore();
}

const SERVICE = `${btoa("{}")}.${btoa(JSON.stringify({ role: "service_role" }))}.signature`;
const USER = `${btoa("{}")}.${btoa(JSON.stringify({ role: "authenticated", sub: "user-1" }))}.signature`;

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

function post(token: string, body: BodyInit = JSON.stringify({ job_run_id: 42 })) {
  return new Request("https://edge.example.test/client-edition-compose", {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    body,
  });
}

/** A fetch that never answers until its signal aborts it. */
function hung(init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    if (signal?.aborted) return reject(signal.reason);
    signal?.addEventListener("abort", () => reject(signal.reason), { once: true });
  });
}

Deno.test("handler: a caller lookup that never answers ends at the invocation's deadline, forbidden", () =>
  withEnv(async () => {
    const time = new FakeTime(0);
    let finishedAt: number | null = null;
    const fetched: string[] = [];
    const transport = stub(globalThis, "fetch", (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      fetched.push(url);
      if (url.includes("/auth/v1/user")) return hung(init);
      throw new Error(`unexpected fetch ${url}`);
    });
    try {
      const response = handler(post(USER)).then((value) => {
        finishedAt = Date.now();
        return value;
      });
      await advance(time, 125_000);
      assertEquals(finishedAt, 120_000, "the handler waited past its budget on the caller lookup");
      assertEquals((await response).status, 403);
      assertEquals(fetched.every((url) => url.includes("/auth/v1/user")), true, "a run was opened or claimed");
    } finally {
      transport.restore();
      time.restore();
    }
  }));

Deno.test("handler: a request body that never ends is cancelled at the invocation's deadline, before any run", () =>
  withEnv(async () => {
    const time = new FakeTime(0);
    let cancelledAt: number | null = null;
    let finishedAt: number | null = null;
    let calls = 0;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"job_run_id":'));
      },
      cancel() {
        cancelledAt = Date.now();
      },
    });
    const transport = stub(globalThis, "fetch", () => {
      calls++;
      throw new Error("an incomplete body must not open or claim a run");
    });
    try {
      const response = handler(post(SERVICE, body)).then((value) => {
        finishedAt = Date.now();
        return value;
      });
      await advance(time, 125_000);
      assertEquals(finishedAt, 120_000, "the handler waited past its budget on the body");
      assertEquals(cancelledAt, 120_000, "the body read was not cancelled");
      const answer = await response;
      assertEquals([answer.status, await answer.json()], [408, { error: "request_body_timeout" }]);
      assertEquals(calls, 0);
    } finally {
      transport.restore();
      time.restore();
    }
  }));

Deno.test("handler: the run's finish that never answers is cut off at the invocation's deadline", () =>
  withEnv(async () => {
    const time = new FakeTime(0);
    let finishedAt: number | null = null;
    const finishes: number[] = [];
    // The body ends at 117 s, too late for any edition: the run is skipped and finished.
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(JSON.stringify({ job_run_id: 42 })));
          controller.close();
        }, 117_000);
      },
    });
    const transport = stub(globalThis, "fetch", (input, init) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.endsWith("/finish_client_edition_compose_run")) {
        finishes.push(Date.now());
        return hung(init);
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    try {
      const response = handler(post(SERVICE, body)).then((value) => {
        finishedAt = Date.now();
        return value;
      });
      await advance(time, 130_000);
      assertEquals(finishedAt, 120_000, "the run's finish outlived the invocation's budget");
      assertEquals(finishes[0], 117_000);
      const answer = await response;
      assertEquals([answer.status, (await answer.json()).claimed], [200, 0]);
    } finally {
      transport.restore();
      time.restore();
    }
  }));
