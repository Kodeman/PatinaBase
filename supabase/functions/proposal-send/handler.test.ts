// deno-lint-ignore-file require-await

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createProposalSendHandler,
  type PersistedProviderRequest,
  type ProposalDeliveryState,
  type ProposalSendGateway,
  type ProposalSendSnapshot,
  type ProviderResult,
} from "./handler.ts";

const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_ID = "10000000-0000-4000-8000-000000000002";
const FOREIGN_ID = "10000000-0000-4000-8000-000000000003";
const CLIENT_ID = "10000000-0000-4000-8000-000000000004";
const PROPOSAL_ID = "20000000-0000-4000-8000-000000000001";
const DISPATCH_ID = "30000000-0000-4000-8000-000000000001";
const SENT_AT = "2026-07-31T12:00:00.123456+00:00";
const IDEMPOTENCY_KEY = `proposal-send/${DISPATCH_ID}`;

function snapshot(): ProposalSendSnapshot {
  return {
    id: DISPATCH_ID,
    proposalId: PROPOSAL_ID,
    sentAt: SENT_AT,
    designerId: OWNER_ID,
    clientId: CLIENT_ID,
    proposalTitle: "Walker Residence",
    personalMessage: "I look forward to your thoughts.",
    ccEmail: "finance@test.invalid",
    validUntil: "2026-08-15T00:00:00+00:00",
    totalAmount: 1_320_000,
    recipientEmail: "alex@test.invalid",
    recipientName: "Alex Walker",
    designerName: "Olive Designer",
    senderName: "Olive Studio",
    studioName: "Olive Studio",
    studioLogoUrl: "https://assets.test.invalid/original-logo.png",
    clientPortalPath: `/proposals/${PROPOSAL_ID}`,
  };
}

function harness(options: {
  callerId?: string;
  studioComember?: boolean;
  exactInstanceMissing?: boolean;
  initialState?: ProposalDeliveryState;
  initialAttempts?: number;
  persistedRequest?: boolean;
  beginFailure?: string;
  prepareFailure?: string;
  suppressed?: string;
  replaySuppressed?: string;
  replaySuppressionFailure?: string;
  providerResults?: ProviderResult[];
  emailLogFailure?: boolean;
  inAppLogFailure?: boolean;
} = {}) {
  let state = options.initialState ?? "pending";
  let attempts = options.initialAttempts ?? 0;
  let claimToken: string | undefined;
  let previousClaimState: "pending" | "failed" | "ambiguous" | undefined;
  let storedRequest: PersistedProviderRequest | undefined = options
      .persistedRequest
    ? {
      body: '{"immutable":true}',
      from: "Olive Studio <hello@test.invalid>",
      to: ["alex@test.invalid"],
      subject: "Persisted proposal",
      idempotencyKey: IDEMPOTENCY_KEY,
      dryRun: false,
    }
    : undefined;
  let gatewayCreations = 0;
  let claims = 0;
  let prepares = 0;
  let persists = 0;
  let releases = 0;
  let replaySuppressionChecks = 0;
  let studioChecks = 0;
  const providerRequests: PersistedProviderRequest[] = [];
  const logCalls = { email: 0, inApp: 0 };
  const immutableSnapshot = snapshot();

  const gateway: ProposalSendGateway = {
    async loadExactInstance(input) {
      if (
        options.exactInstanceMissing || input.dispatchId !== DISPATCH_ID ||
        input.proposalId !== PROPOSAL_ID || input.sentAt !== SENT_AT
      ) {
        throw new Error("nonce/timestamp mismatch");
      }
      return {
        id: DISPATCH_ID,
        proposalId: PROPOSAL_ID,
        sentAt: SENT_AT,
        designerId: OWNER_ID,
        clientId: CLIENT_ID,
        deliveryState: state,
        attemptCount: attempts,
      };
    },
    async isActiveStudioComember() {
      studioChecks += 1;
      return options.studioComember ?? false;
    },
    async claimDispatch(input) {
      claims += 1;
      assertEquals(input, {
        proposalId: PROPOSAL_ID,
        sentAt: SENT_AT,
        dispatchId: DISPATCH_ID,
      });
      if (
        state === "delivered" || state === "suppressed" ||
        state === "unconfirmed"
      ) {
        return { claimed: false, deliveryState: state, attemptCount: attempts };
      }
      if (state === "in_flight") {
        return { claimed: false, deliveryState: state, attemptCount: attempts };
      }
      if (state === "ambiguous" && attempts >= 3) {
        state = "unconfirmed";
        return {
          claimed: false,
          deliveryState: state,
          attemptCount: attempts,
          retryExhausted: true,
        };
      }
      if (state === "failed" && attempts >= 3) {
        return {
          claimed: false,
          deliveryState: state,
          attemptCount: attempts,
          retryExhausted: true,
        };
      }
      previousClaimState = state as "pending" | "failed" | "ambiguous";
      state = "in_flight";
      claimToken = `claim-${claims}`;
      return {
        claimed: true,
        deliveryState: "in_flight",
        claimToken,
        attemptCount: attempts,
        previousDeliveryState: previousClaimState,
        dispatch: immutableSnapshot,
        request: storedRequest,
        idempotencyKey: IDEMPOTENCY_KEY,
      };
    },
    async prepareRequest(input) {
      prepares += 1;
      if (options.prepareFailure) throw new Error(options.prepareFailure);
      if (options.suppressed) {
        return { state: "suppressed", reason: options.suppressed };
      }
      const body = JSON.stringify({
        from: "Olive Studio <hello@test.invalid>",
        to: [input.dispatch.recipientEmail],
        cc: input.dispatch.ccEmail ? [input.dispatch.ccEmail] : undefined,
        subject: input.subject,
        html: input.html,
      });
      return {
        state: "ready",
        request: {
          body,
          from: "Olive Studio <hello@test.invalid>",
          to: [input.dispatch.recipientEmail],
          cc: input.dispatch.ccEmail ? [input.dispatch.ccEmail] : undefined,
          subject: input.subject,
          idempotencyKey: input.idempotencyKey,
          dryRun: false,
        },
      };
    },
    async checkReplaySuppression() {
      replaySuppressionChecks += 1;
      if (options.replaySuppressionFailure) {
        throw new Error(options.replaySuppressionFailure);
      }
      return options.replaySuppressed
        ? { state: "suppressed" as const, reason: options.replaySuppressed }
        : { state: "clear" as const };
    },
    async persistRequest(input) {
      persists += 1;
      assertEquals(input.claimToken, claimToken);
      if (storedRequest) assertEquals(input.request, storedRequest);
      storedRequest ??= structuredClone(input.request);
      return structuredClone(storedRequest);
    },
    async beginProviderAttempt(input) {
      assertEquals(input.claimToken, claimToken);
      if (options.beginFailure) throw new Error(options.beginFailure);
      attempts += 1;
      return {
        attemptCount: attempts,
        retryDeadline: "2026-08-01T11:00:00Z",
      };
    },
    async sendPrepared(request) {
      providerRequests.push(structuredClone(request));
      return options.providerResults?.shift() ?? {
        state: "delivered",
        id: "provider-1",
      };
    },
    async completeDispatch(input) {
      assertEquals(input.claimToken, claimToken);
      state = input.deliveryState === "ambiguous" && attempts >= 3
        ? "unconfirmed"
        : input.deliveryState;
      claimToken = undefined;
      return {
        deliveryState: state,
        attemptCount: attempts,
        retryDeadline: "2026-08-01T11:00:00Z",
        retryExhausted: state === "unconfirmed" ||
          (state === "failed" && attempts >= 3),
        lastError: input.error,
      };
    },
    async suppressDispatch(input) {
      state = "suppressed";
      claimToken = undefined;
      return {
        deliveryState: state,
        attemptCount: attempts,
        retryExhausted: false,
        lastError: input.reason,
      };
    },
    async releaseDispatch(input) {
      releases += 1;
      state = previousClaimState ?? "pending";
      claimToken = undefined;
      return {
        deliveryState: state,
        attemptCount: attempts,
        retryExhausted: state === "failed" && attempts >= 3,
        lastError: input.error,
      };
    },
    async syncEmailLog() {
      logCalls.email += 1;
      if (options.emailLogFailure) throw new Error("email log unavailable");
    },
    async syncInAppLog() {
      logCalls.inApp += 1;
      if (options.inAppLogFailure) throw new Error("in-app log unavailable");
    },
  };

  const handler = createProposalSendHandler({
    async authenticate(authorization) {
      return authorization === "Bearer valid"
        ? { userId: options.callerId ?? OWNER_ID }
        : null;
    },
    createGateway() {
      gatewayCreations += 1;
      return gateway;
    },
    clientPortalUrl: "https://client.test.invalid",
  });

  return {
    handler,
    providerRequests,
    logCalls,
    get gatewayCreations() {
      return gatewayCreations;
    },
    get claims() {
      return claims;
    },
    get prepares() {
      return prepares;
    },
    get persists() {
      return persists;
    },
    get releases() {
      return releases;
    },
    get replaySuppressionChecks() {
      return replaySuppressionChecks;
    },
    get studioChecks() {
      return studioChecks;
    },
  };
}

function request(
  body: unknown = {
    proposalId: PROPOSAL_ID,
    sentAt: SENT_AT,
    dispatchId: DISPATCH_ID,
  },
  authorization = "Bearer valid",
): Request {
  return new Request("https://edge.test.invalid/proposal-send", {
    method: "POST",
    headers: {
      Authorization: authorization,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function body(response: Response): Promise<Record<string, unknown>> {
  return await response.json();
}

Deno.test("proposal-send authenticates before constructing service-role gateway", async () => {
  const h = harness();
  const preflight = await h.handler(
    new Request("https://edge.test.invalid/proposal-send", {
      method: "OPTIONS",
    }),
  );
  assertEquals(preflight.status, 200);
  assertEquals(preflight.headers.get("access-control-allow-origin"), "*");

  const response = await h.handler(request(undefined, "Bearer invalid"));
  assertEquals(response.status, 401);
  assertEquals(h.gatewayCreations, 0);
});

Deno.test("proposal-send requires the complete immutable instance tuple", async () => {
  for (
    const payload of [
      {},
      { proposalId: PROPOSAL_ID, sentAt: SENT_AT },
      { proposalId: PROPOSAL_ID, dispatchId: DISPATCH_ID },
    ]
  ) {
    const h = harness();
    const response = await h.handler(request(payload));
    assertEquals(response.status, 400);
    assertEquals(h.gatewayCreations, 0);
  }
});

Deno.test("nonce/timestamp mismatch fails without minting or claiming a row", async () => {
  const h = harness({ exactInstanceMissing: true });
  const response = await h.handler(request());
  assertEquals(response.status, 409);
  assertEquals(await body(response), {
    error: "proposal_send_instance_mismatch",
  });
  assertEquals(h.claims, 0);
});

Deno.test("only owner or active design-studio co-member may claim", async () => {
  const foreign = harness({ callerId: FOREIGN_ID });
  const denied = await foreign.handler(request());
  assertEquals(denied.status, 403);
  assertEquals(foreign.claims, 0);

  const member = harness({ callerId: MEMBER_ID, studioComember: true });
  const allowed = await member.handler(request());
  assertEquals(allowed.status, 200);
  assertEquals((await body(allowed)).delivery_state, "delivered");
  assertEquals(member.studioChecks, 1);
});

Deno.test("first authorized attempt persists before one provider upload", async () => {
  const h = harness();
  const response = await h.handler(request());
  const result = await body(response);

  assertEquals(result.delivery_state, "delivered");
  assertEquals(result.ok, true);
  assertEquals(h.prepares, 1);
  assertEquals(h.persists, 1);
  assertEquals(h.providerRequests.length, 1);
  assertEquals(h.providerRequests[0].idempotencyKey, IDEMPOTENCY_KEY);
  assert(h.providerRequests[0].body.includes("Walker Residence"));
  assert(h.providerRequests[0].body.includes("original-logo.png"));
  assert(h.providerRequests[0].body.includes("finance@test.invalid"));
});

Deno.test("ambiguous retries replay byte-identical request and stop at three", async () => {
  const h = harness({
    providerResults: [
      { state: "ambiguous", error: "timeout one" },
      { state: "ambiguous", error: "timeout two" },
      { state: "ambiguous", error: "timeout three" },
    ],
  });
  const response = await h.handler(request());
  const result = await body(response);

  assertEquals(result.delivery_state, "unconfirmed");
  assertEquals(result.retry_exhausted, true);
  assertEquals(result.retryable, false);
  assertEquals(h.providerRequests.length, 3);
  assertEquals(
    new Set(h.providerRequests.map((item) => item.body)).size,
    1,
  );
  assertEquals(
    new Set(h.providerRequests.map((item) => item.idempotencyKey)).size,
    1,
  );
});

Deno.test("known provider failure is surfaced as failed and remains retryable", async () => {
  const h = harness({
    providerResults: [{ state: "failed", error: "Resend API 503" }],
  });
  const response = await h.handler(request());
  assertEquals(await body(response), {
    ok: false,
    delivery_state: "failed",
    attempt_count: 1,
    retryable: true,
    retry_exhausted: false,
    detail: "Resend API 503",
  });
});

Deno.test("third definitive provider failure stays failed and exhausts retries", async () => {
  const h = harness({
    initialState: "failed",
    initialAttempts: 2,
    persistedRequest: true,
    providerResults: [{ state: "failed", error: "Resend API 422" }],
  });
  const response = await h.handler(request());
  assertEquals(await body(response), {
    ok: false,
    delivery_state: "failed",
    attempt_count: 3,
    retryable: false,
    retry_exhausted: true,
    detail: "Resend API 422",
  });
});

Deno.test("failed replay checks suppression only and reuses exact persisted bytes", async () => {
  const h = harness({
    initialState: "failed",
    initialAttempts: 1,
    persistedRequest: true,
  });
  const response = await h.handler(request());
  assertEquals((await body(response)).delivery_state, "delivered");
  assertEquals(h.replaySuppressionChecks, 1);
  assertEquals(h.prepares, 0);
  assertEquals(h.persists, 0);
  assertEquals(h.providerRequests, [{
    body: '{"immutable":true}',
    from: "Olive Studio <hello@test.invalid>",
    to: ["alex@test.invalid"],
    subject: "Persisted proposal",
    idempotencyKey: IDEMPOTENCY_KEY,
    dryRun: false,
  }]);
});

Deno.test("new suppression terminalizes a definitively failed replay", async () => {
  const h = harness({
    initialState: "failed",
    initialAttempts: 1,
    persistedRequest: true,
    replaySuppressed: "email_suppressed",
  });
  const response = await h.handler(request());
  const result = await body(response);
  assertEquals(result.delivery_state, "suppressed");
  assertEquals(result.retryable, false);
  assertEquals(h.replaySuppressionChecks, 1);
  assertEquals(h.providerRequests.length, 0);
});

Deno.test("new suppression after ambiguity is terminal unconfirmed", async () => {
  const h = harness({
    initialState: "ambiguous",
    initialAttempts: 1,
    persistedRequest: true,
    replaySuppressed: "email_suppressed",
  });
  const response = await h.handler(request());
  const result = await body(response);
  assertEquals(result.delivery_state, "unconfirmed");
  assertEquals(result.retryable, false);
  assertEquals(result.retry_exhausted, true);
  assertEquals(h.providerRequests.length, 0);
});

Deno.test("replay suppression read failure restores prior delivery semantics", async () => {
  for (const initialState of ["failed", "ambiguous"] as const) {
    const h = harness({
      initialState,
      initialAttempts: 1,
      persistedRequest: true,
      replaySuppressionFailure: "email_suppression_check_failed: unavailable",
    });
    const response = await h.handler(request());
    const result = await body(response);
    assertEquals(result.delivery_state, initialState);
    assertEquals(result.retryable, true);
    assertEquals(h.releases, 1);
    assertEquals(h.providerRequests.length, 0);
  }
});

Deno.test("suppression is never reported as delivery", async () => {
  const h = harness({ suppressed: "email_suppressed" });
  const response = await h.handler(request());
  const result = await body(response);
  assertEquals(result.ok, false);
  assertEquals(result.delivery_state, "suppressed");
  assertEquals(result.retryable, false);
  assertEquals(h.providerRequests.length, 0);
});

Deno.test("policy-read failure fails closed to pending before provider", async () => {
  const h = harness({ prepareFailure: "email_suppression_check_failed" });
  const response = await h.handler(request());
  const result = await body(response);
  assertEquals(result.delivery_state, "pending");
  assertEquals(result.ok, false);
  assertEquals(result.retryable, true);
  assertEquals(h.releases, 1);
  assertEquals(h.providerRequests.length, 0);
});

Deno.test("provider attempt start failure releases to retryable pending", async () => {
  const h = harness({ beginFailure: "database unavailable" });
  const response = await h.handler(request());
  const result = await body(response);
  assertEquals(result.delivery_state, "pending");
  assertEquals(result.ok, false);
  assertEquals(result.retryable, true);
  assertEquals(result.attempt_count, 0);
  assertEquals(h.releases, 1);
  assertEquals(h.providerRequests.length, 0);
});

Deno.test("delivered and live concurrent instances dedupe without upload", async () => {
  for (const initialState of ["delivered", "in_flight"] as const) {
    const h = harness({ initialState, initialAttempts: 1 });
    const response = await h.handler(request());
    const result = await body(response);
    assertEquals(result.delivery_state, initialState);
    assertEquals(result.ok, initialState === "delivered");
    assertEquals(h.providerRequests.length, 0);
  }
});

Deno.test("notification-log failure is isolated from provider delivery", async () => {
  const h = harness({ emailLogFailure: true, inAppLogFailure: true });
  const response = await h.handler(request());
  assertEquals((await body(response)).delivery_state, "delivered");
  assertEquals(h.providerRequests.length, 1);
  assertEquals(h.logCalls, { email: 1, inApp: 1 });
});
