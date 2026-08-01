import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildResendRequestHeaders,
  checkEmailSuppression,
  prepareCompliantEmail,
  type PreparedResendRequest,
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

Deno.test("rate cap counts terminal unconfirmed delivery", async () => {
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
