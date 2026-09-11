import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildResendRequestHeaders,
  buildUnsubscribeHeaders,
  checkEmailSuppression,
  generateUnsubscribeUrl,
  prepareCompliantEmail,
  type PreparedResendRequest,
  sendCompliantEmail,
  sendPreparedResendRequest,
} from "./send-email.ts";

Deno.test("buildResendRequestHeaders forwards one stable provider key", () => {
  assertEquals(buildResendRequestHeaders("test-key", "proposal-send/nonce"), {
    "Content-Type": "application/json",
    Authorization: "Bearer test-key",
    "Idempotency-Key": "proposal-send/nonce",
  });
});

Deno.test("buildResendRequestHeaders omits an absent provider key", () => {
  assertEquals(buildResendRequestHeaders("test-key"), {
    "Content-Type": "application/json",
    Authorization: "Bearer test-key",
  });
});

function complianceClient(options: {
  profile?: { email_suppressed: boolean } | null;
  profileError?: { message: string };
  count?: number;
  capError?: { message: string };
  onCapStatuses?: (statuses: string[]) => void;
}) {
  return {
    from(table: string) {
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        in(column: string, values: string[]) {
          if (table === "notification_log" && column === "status") {
            options.onCapStatuses?.(values);
          }
          return query;
        },
        gte() {
          if (table !== "notification_log") throw new Error("wrong table");
          return Promise.resolve({
            count: options.count ?? 0,
            error: options.capError ?? null,
          });
        },
        maybeSingle() {
          if (table !== "profiles") throw new Error("wrong table");
          return Promise.resolve({
            data: options.profile === undefined
              ? { email_suppressed: false }
              : options.profile,
            error: options.profileError ?? null,
          });
        },
      };
      return query;
    },
  };
}

const emailOptions = {
  to: "client@test.invalid",
  subject: "Proposal ready",
  html: "<p>Ready</p>",
  userId: "10000000-0000-4000-8000-000000000001",
  notificationType: "proposal_sent",
  category: "operational" as const,
  idempotencyKey: "proposal-send/nonce",
  failClosedPolicyReads: true,
};

Deno.test("suppression lookup failure is fail-closed", async () => {
  await assertRejects(
    () =>
      prepareCompliantEmail(
        complianceClient({
          profileError: { message: "db unavailable" },
        }) as never,
        emailOptions,
      ),
    Error,
    "email_suppression_check_failed",
  );
});

Deno.test("rate-cap lookup failure is fail-closed", async () => {
  await assertRejects(
    () =>
      prepareCompliantEmail(
        complianceClient({ capError: { message: "db unavailable" } }) as never,
        emailOptions,
      ),
    Error,
    "email_rate_cap_check_failed",
  );
});

Deno.test("rate cap counts provider-accepted 'sent' and terminal unconfirmed delivery", async () => {
  const previousSecret = Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET");
  Deno.env.set("UNSUBSCRIBE_TOKEN_SECRET", "test-only-secret");
  try {
    let statuses: string[] = [];
    const result = await prepareCompliantEmail(
      complianceClient({
        onCapStatuses: (values) => {
          statuses = values;
        },
      }) as never,
      emailOptions,
    );
    assertEquals(result.state, "ready");
    assertEquals(statuses, [
      "sent",
      "delivered",
      "sending",
      "opened",
      "clicked",
      "unconfirmed",
    ]);
  } finally {
    if (previousSecret === undefined) {
      Deno.env.delete("UNSUBSCRIBE_TOKEN_SECRET");
    } else {
      Deno.env.set("UNSUBSCRIBE_TOKEN_SECRET", previousSecret);
    }
  }
});

Deno.test("missing suppression policy row is fail-closed", async () => {
  await assertRejects(
    () =>
      prepareCompliantEmail(
        complianceClient({ profile: null }) as never,
        emailOptions,
      ),
    Error,
    "email_suppression_check_failed",
  );
});

Deno.test("legacy direct callers retain fail-open policy-read behavior", async () => {
  const previousSecret = Deno.env.get("UNSUBSCRIBE_TOKEN_SECRET");
  Deno.env.set("UNSUBSCRIBE_TOKEN_SECRET", "test-only-secret");
  try {
    const result = await prepareCompliantEmail(
      complianceClient({
        profileError: { message: "suppression store unavailable" },
        capError: { message: "rate store unavailable" },
      }) as never,
      { ...emailOptions, failClosedPolicyReads: false },
    );
    assertEquals(result.state, "ready");
  } finally {
    if (previousSecret === undefined) {
      Deno.env.delete("UNSUBSCRIBE_TOKEN_SECRET");
    } else {
      Deno.env.set("UNSUBSCRIBE_TOKEN_SECRET", previousSecret);
    }
  }
});

Deno.test("suppressed profile produces no provider request", async () => {
  const result = await prepareCompliantEmail(
    complianceClient({ profile: { email_suppressed: true } }) as never,
    emailOptions,
  );
  assertEquals(result, { state: "suppressed", reason: "email_suppressed" });
});

Deno.test("replay suppression check never reapplies notification-log rate cap", async () => {
  const queriedTables: string[] = [];
  const client = {
    from(table: string) {
      queriedTables.push(table);
      if (table !== "profiles") {
        throw new Error(`unexpected policy table: ${table}`);
      }
      const query = {
        select() {
          return query;
        },
        eq() {
          return query;
        },
        maybeSingle() {
          return Promise.resolve({
            data: { email_suppressed: false },
            error: null,
          });
        },
      };
      return query;
    },
  };

  assertEquals(
    await checkEmailSuppression(
      client as never,
      "10000000-0000-4000-8000-000000000001",
      { failClosed: true },
    ),
    { state: "clear" },
  );
  assertEquals(queriedTables, ["profiles"]);
});

Deno.test("prepared upload forwards exact bytes and key", async () => {
  const request: PreparedResendRequest = {
    body: '{"from":"Patina","to":["client@test.invalid"]}',
    from: "Patina",
    to: ["client@test.invalid"],
    subject: "Ready",
    idempotencyKey: "proposal-send/nonce",
    dryRun: false,
  };
  let uploadedBody = "";
  let uploadedKey: string | null = null;
  const result = await sendPreparedResendRequest(request, {
    apiKey: "test-key",
    fetchImpl: ((_url: string | URL | Request, init?: RequestInit) => {
      uploadedBody = String(init?.body);
      uploadedKey = new Headers(init?.headers).get("idempotency-key");
      return Promise.resolve(
        new Response(JSON.stringify({ id: "provider-1" }), { status: 200 }),
      );
    }) as typeof fetch,
  });
  assertEquals(result, { state: "delivered", id: "provider-1" });
  assertEquals(uploadedBody, request.body);
  assertEquals(uploadedKey, request.idempotencyKey);
});

Deno.test("transport error is ambiguous, not a definitive failure", async () => {
  const request: PreparedResendRequest = {
    body: "{}",
    from: "Patina",
    to: ["client@test.invalid"],
    subject: "Ready",
    idempotencyKey: "proposal-send/nonce",
    dryRun: false,
  };
  const result = await sendPreparedResendRequest(request, {
    apiKey: "test-key",
    fetchImpl: (() =>
      Promise.reject(new Error("connection reset"))) as typeof fetch,
  });
  assertEquals(result, { state: "ambiguous", error: "connection reset" });
});

Deno.test("provider timeout aborts well below the database lease", async () => {
  const request: PreparedResendRequest = {
    body: "{}",
    from: "Patina",
    to: ["client@test.invalid"],
    subject: "Ready",
    idempotencyKey: "proposal-send/nonce",
    dryRun: false,
  };
  const result = await sendPreparedResendRequest(request, {
    timeoutMs: 5,
    apiKey: "test-key",
    fetchImpl: ((_url: string | URL | Request, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("provider timeout", "AbortError")));
      })) as typeof fetch,
  });
  assertEquals(result.state, "ambiguous");
});

Deno.test("known non-2xx provider response is failed", async () => {
  const request: PreparedResendRequest = {
    body: "{}",
    from: "Patina",
    to: ["client@test.invalid"],
    subject: "Ready",
    idempotencyKey: "proposal-send/nonce",
    dryRun: false,
  };
  const result = await sendPreparedResendRequest(request, {
    apiKey: "test-key",
    fetchImpl: (() =>
      Promise.resolve(
        new Response("bad request", { status: 400 }),
      )) as typeof fetch,
  });
  assertEquals(result, {
    state: "failed",
    error: "Resend API 400: bad request",
  });
});

/* The client portal's route tree is retired: `/preferences` is a 308 onto the
   one project page and nothing there reads a token. The one-click header must
   therefore name `/api/unsubscribe` — a route the portal keeps, which the
   middleware answers before both the sign-in gate and the retirement fold —
   whatever base URL a caller hands in. notification-digest passes
   CLIENT_PORTAL_URL, so this is the assertion that keeps its mail working. */
Deno.test("one-click unsubscribe always names /api/unsubscribe, never /preferences", async () => {
  Deno.env.set("UNSUBSCRIBE_TOKEN_SECRET", "test-secret-for-unsubscribe-header");
  try {
    const url = await generateUnsubscribeUrl(
      "user-1",
      "reminder_digest",
      "https://client.patina.cloud",
    );
    assertEquals(
      url.startsWith("https://client.patina.cloud/api/unsubscribe?token="),
      true,
    );
    assertEquals(url.includes("/preferences"), false);

    const headers = buildUnsubscribeHeaders(url);
    assertEquals(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
    assertEquals(headers["List-Unsubscribe"].includes("/preferences"), false);
    assertEquals(headers["List-Unsubscribe"], `<${url}>`);
  } finally {
    Deno.env.delete("UNSUBSCRIBE_TOKEN_SECRET");
  }
});

/* ── Deliverability: text part, provider tags, notification_log refs ────────
   The three carried on every send through the chokepoint. */

/** Minimal client: clears policy reads, records the notification_log insert. */
function loggingClient(captured: { insert?: Record<string, unknown> }) {
  return {
    from(table: string) {
      const query: Record<string, unknown> = {
        select: () => query,
        eq: () => query,
        in: () => query,
        gte: () => Promise.resolve({ count: 0, error: null }),
        maybeSingle: () =>
          Promise.resolve({ data: { email_suppressed: false }, error: null }),
        single: () =>
          Promise.resolve({ data: { id: "log-1" }, error: null }),
        insert: (row: Record<string, unknown>) => {
          if (table === "notification_log") captured.insert = row;
          return query;
        },
        update: () => query,
      };
      return query;
    },
  };
}

Deno.test("the Resend body carries a derived text part when the caller omits one", async () => {
  const result = await prepareCompliantEmail(
    loggingClient({}) as never,
    {
      ...emailOptions,
      category: "transactional" as const,
      html:
        '<head><style>.a{color:red}</style></head><p>Your proposal is ready.</p>' +
        '<a href="https://client.patina.cloud/p/1">Review proposal</a>',
    },
  );
  assertEquals(result.state, "ready");
  if (result.state !== "ready") return;
  const body = JSON.parse(result.request.body);
  assertEquals(
    body.text,
    "Your proposal is ready.\nReview proposal (https://client.patina.cloud/p/1)",
  );
});

Deno.test("a caller-written text part is never overwritten", async () => {
  const result = await prepareCompliantEmail(
    loggingClient({}) as never,
    {
      ...emailOptions,
      category: "transactional" as const,
      text: "Hand-written.",
    },
  );
  if (result.state !== "ready") throw new Error("expected ready");
  assertEquals(JSON.parse(result.request.body).text, "Hand-written.");
});

Deno.test("every send is tagged with its category and template", async () => {
  const result = await prepareCompliantEmail(
    loggingClient({}) as never,
    {
      ...emailOptions,
      category: "transactional" as const,
      templateId: "invoice-reminder/stage 2",
    },
  );
  if (result.state !== "ready") throw new Error("expected ready");
  assertEquals(JSON.parse(result.request.body).tags, [
    { name: "category", value: "transactional" },
    { name: "template", value: "invoice-reminder-stage-2" },
  ]);
});

Deno.test("a caller's own tag wins over the derived one of the same name", async () => {
  const result = await prepareCompliantEmail(
    loggingClient({}) as never,
    {
      ...emailOptions,
      category: "transactional" as const,
      templateId: "invoice-sent",
      tags: [
        { name: "category", value: "billing" },
        { name: "studio", value: "middlewest" },
      ],
    },
  );
  if (result.state !== "ready") throw new Error("expected ready");
  assertEquals(JSON.parse(result.request.body).tags, [
    { name: "category", value: "billing" },
    { name: "template", value: "invoice-sent" },
    { name: "studio", value: "middlewest" },
  ]);
});

/** Runs `fn` with a stubbed fetch and a known EMAIL_DEV_MODE, then restores
 * both. sendCompliantEmail's live path posts to Resend, so a test that reaches
 * it must never depend on the ambient env to stay off the network. */
async function withStubbedSend(
  devMode: string | null,
  fn: (calls: Array<{ url: string; body: unknown }>) => Promise<void>,
): Promise<void> {
  const previousMode = Deno.env.get("EMAIL_DEV_MODE");
  const previousKey = Deno.env.get("RESEND_API_KEY");
  const realFetch = globalThis.fetch;
  const calls: Array<{ url: string; body: unknown }> = [];

  if (devMode === null) Deno.env.delete("EMAIL_DEV_MODE");
  else Deno.env.set("EMAIL_DEV_MODE", devMode);
  Deno.env.set("RESEND_API_KEY", "test-key");
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: typeof input === "string" ? input : input.toString(),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return Promise.resolve(
      new Response(JSON.stringify({ id: "re_stub_1" }), { status: 200 }),
    );
  }) as typeof fetch;

  try {
    await fn(calls);
  } finally {
    globalThis.fetch = realFetch;
    if (previousMode === undefined) Deno.env.delete("EMAIL_DEV_MODE");
    else Deno.env.set("EMAIL_DEV_MODE", previousMode);
    if (previousKey === undefined) Deno.env.delete("RESEND_API_KEY");
    else Deno.env.set("RESEND_API_KEY", previousKey);
  }
}

Deno.test("the notification_log insert stamps ref_type, ref_id and recipient", async () => {
  const captured: { insert?: Record<string, unknown> } = {};
  await withStubbedSend(null, async (calls) => {
    await sendCompliantEmail(loggingClient(captured) as never, {
      ...emailOptions,
      category: "transactional" as const,
      failClosedPolicyReads: false,
      ref: { type: "invoice", id: "20000000-0000-4000-8000-000000000002" },
    });
    assertEquals(calls.length, 1);
    assertEquals(calls[0].url, "https://api.resend.com/emails");
    const body = calls[0].body as { text?: string };
    assertEquals(typeof body.text, "string");
  });
  assertEquals(captured.insert?.ref_type, "invoice");
  assertEquals(captured.insert?.ref_id, "20000000-0000-4000-8000-000000000002");
  assertEquals(captured.insert?.recipient, "client@test.invalid");
});

Deno.test("a ref-stamped send with no userId still logs, with a null user_id", async () => {
  const captured: { insert?: Record<string, unknown> } = {};
  await withStubbedSend(null, async () => {
    await sendCompliantEmail(loggingClient(captured) as never, {
      ...emailOptions,
      userId: undefined,
      category: "transactional" as const,
      ref: { type: "client_review", id: "30000000-0000-4000-8000-000000000003" },
    });
  });
  assertEquals(captured.insert?.user_id, null);
  assertEquals(captured.insert?.ref_type, "client_review");
  assertEquals(captured.insert?.recipient, "client@test.invalid");
});

Deno.test("a send with neither a userId nor a ref writes no log row", async () => {
  const captured: { insert?: Record<string, unknown> } = {};
  await withStubbedSend(null, async () => {
    await sendCompliantEmail(loggingClient(captured) as never, {
      ...emailOptions,
      userId: undefined,
      category: "transactional" as const,
    });
  });
  assertEquals(captured.insert, undefined);
});
