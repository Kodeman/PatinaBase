// Test gateways intentionally satisfy async production interfaces with
// synchronous fakes.
// deno-lint-ignore-file require-await

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createProposalSendHandler,
  type DispatchClaim,
  type ProposalEmail,
  type ProposalSendGateway,
  type ProposalSendRow,
} from "./handler.ts";

const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const MEMBER_ID = "10000000-0000-4000-8000-000000000002";
const CLIENT_ID = "10000000-0000-4000-8000-000000000003";
const FOREIGN_ID = "10000000-0000-4000-8000-000000000004";
const PROPOSAL_ID = "20000000-0000-4000-8000-000000000001";
const SENT_AT = "2026-07-31T12:00:00.123456+00:00";

function proposal(
  overrides: Partial<ProposalSendRow> = {},
): ProposalSendRow {
  return {
    id: PROPOSAL_ID,
    title: "Walker Residence",
    status: "sent",
    sent_at: SENT_AT,
    personal_message: "I look forward to your thoughts.",
    cc_email: null,
    valid_until: "2026-08-15T00:00:00+00:00",
    total_amount: 1320000,
    client_id: CLIENT_ID,
    designer_client_id: "30000000-0000-4000-8000-000000000001",
    designer_id: OWNER_ID,
    project_id: null,
    designer: { full_name: "Olive Designer", email: "olive@test.invalid" },
    client: { full_name: "Alex Walker", email: "alex@test.invalid" },
    ...overrides,
  };
}

type DispatchStatus = "empty" | "claimed" | "delivered" | "failed";

function harness(options: {
  callerId?: string;
  proposal?: ProposalSendRow;
  isStudioComember?: boolean;
  resolveFailures?: number;
  emailResults?: Array<{
    success: boolean;
    suppressed?: boolean;
    id?: string;
    error?: string;
  }>;
} = {}) {
  let dispatchStatus: DispatchStatus = "empty";
  let attemptCount = 0;
  let resolveFailures = options.resolveFailures ?? 0;
  const notificationIds: string[] = [];
  const storedNotificationIds = new Set<string>();
  const emails: ProposalEmail[] = [];
  const completions: Array<{
    succeeded: boolean;
    claimToken: string;
    error?: string;
  }> = [];
  let gatewayCreations = 0;
  let claims = 0;
  let studioChecks = 0;

  const gateway: ProposalSendGateway = {
    async loadProposal() {
      return options.proposal ?? proposal();
    },
    async isActiveStudioComember() {
      studioChecks += 1;
      return options.isStudioComember ?? false;
    },
    async claimDispatch(_proposalId, sentAt): Promise<DispatchClaim> {
      claims += 1;
      assertEquals(sentAt, SENT_AT);
      if (dispatchStatus === "delivered") {
        return {
          claimed: false,
          duplicate: true,
          inFlight: false,
          notificationLogId: "notification-1",
          attemptCount,
        };
      }
      if (dispatchStatus === "claimed") {
        return {
          claimed: false,
          duplicate: true,
          inFlight: true,
          notificationLogId: "notification-1",
          attemptCount,
        };
      }
      attemptCount += 1;
      dispatchStatus = "claimed";
      return {
        claimed: true,
        duplicate: attemptCount > 1,
        inFlight: false,
        claimToken: `claim-${attemptCount}`,
        notificationLogId: "notification-1",
        attemptCount,
      };
    },
    async resolveSender() {
      if (resolveFailures > 0) {
        resolveFailures -= 1;
        throw new Error("studio identity temporarily unavailable");
      }
      return {
        designerName: "Olive Designer",
        senderName: "Olive Studio",
      };
    },
    async ensureInAppNotification(_proposal, notificationLogId) {
      notificationIds.push(notificationLogId);
      storedNotificationIds.add(notificationLogId);
    },
    async sendEmail(email) {
      emails.push(email);
      return options.emailResults?.shift() ?? {
        success: true,
        id: "provider-1",
      };
    },
    async completeDispatch(input) {
      completions.push({
        succeeded: input.succeeded,
        claimToken: input.claimToken,
        error: input.error,
      });
      dispatchStatus = input.succeeded ? "delivered" : "failed";
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
    emails,
    completions,
    notificationIds,
    storedNotificationIds,
    get gatewayCreations() {
      return gatewayCreations;
    },
    get claims() {
      return claims;
    },
    get studioChecks() {
      return studioChecks;
    },
  };
}

function request(
  body: unknown = { proposalId: PROPOSAL_ID, sentAt: SENT_AT },
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

async function responseBody(
  response: Response,
): Promise<Record<string, unknown>> {
  return await response.json();
}

Deno.test("proposal-send keeps browser CORS and authenticates before gateway construction", async () => {
  const h = harness();
  const preflight = await h.handler(
    new Request("https://edge.test.invalid/proposal-send", {
      method: "OPTIONS",
    }),
  );
  assertEquals(preflight.status, 200);
  assertEquals(preflight.headers.get("access-control-allow-origin"), "*");

  const unauthenticated = await h.handler(request(undefined, "Bearer invalid"));
  assertEquals(unauthenticated.status, 401);
  assertEquals(h.gatewayCreations, 0);
});

Deno.test("proposal owner can dispatch the exact sent instance", async () => {
  const h = harness({ callerId: OWNER_ID });
  const response = await h.handler(request());

  assertEquals(response.status, 200);
  assertEquals(h.studioChecks, 0);
  assertEquals(h.emails.length, 1);
  assertEquals(h.emails[0].to, "alex@test.invalid");
  assertEquals(
    h.emails[0].idempotencyKey,
    `proposal-send/${PROPOSAL_ID}/${SENT_AT}`,
  );
  assertEquals(h.completions, [
    { succeeded: true, claimToken: "claim-1", error: undefined },
  ]);
});

Deno.test("eligible studio co-member can dispatch an owner's proposal", async () => {
  const h = harness({ callerId: MEMBER_ID, isStudioComember: true });
  const response = await h.handler(request());

  assertEquals(response.status, 200);
  assertEquals(h.studioChecks, 1);
  assertEquals(h.emails.length, 1);
});

Deno.test("foreign designer and proposal client cannot dispatch", async () => {
  for (const callerId of [FOREIGN_ID, CLIENT_ID]) {
    const h = harness({ callerId, isStudioComember: false });
    const response = await h.handler(request());
    assertEquals(response.status, 403);
    assertEquals(await responseBody(response), { error: "not_authorized" });
    assertEquals(h.claims, 0);
    assertEquals(h.emails.length, 0);
  }
});

Deno.test("draft and accepted proposals are not dispatchable", async () => {
  for (const status of ["draft", "accepted"]) {
    const h = harness({ proposal: proposal({ status }) });
    const response = await h.handler(request());
    assertEquals(response.status, 409);
    assertEquals(await responseBody(response), { error: "proposal_not_sent" });
    assertEquals(h.claims, 0);
  }
});

Deno.test("handler rejects a delayed request for a different sent instance", async () => {
  const h = harness();
  const response = await h.handler(
    request({
      proposalId: PROPOSAL_ID,
      sentAt: "2026-07-31T11:59:00.000000+00:00",
    }),
  );
  assertEquals(response.status, 409);
  assertEquals(await responseBody(response), {
    error: "proposal_send_instance_changed",
  });
  assertEquals(h.claims, 0);
});

Deno.test("duplicate invocation neither sends nor stacks an in-app notification", async () => {
  const h = harness();
  const first = await h.handler(request());
  const second = await h.handler(request());

  assertEquals(first.status, 200);
  assertEquals(second.status, 200);
  assertEquals(await responseBody(second), {
    ok: true,
    duplicate: true,
    in_flight: false,
    attempt_count: 1,
  });
  assertEquals(h.emails.length, 1);
  assertEquals(h.notificationIds, ["notification-1"]);
  assertEquals(h.storedNotificationIds.size, 1);
});

Deno.test("pre-send failure releases the lease and retries with the same notification id", async () => {
  const h = harness({ resolveFailures: 1 });
  const first = await h.handler(request());
  const second = await h.handler(request());

  assertEquals(first.status, 502);
  assertEquals(second.status, 200);
  assertEquals(h.emails.length, 1);
  assertEquals(h.notificationIds, ["notification-1", "notification-1"]);
  assertEquals(h.storedNotificationIds.size, 1);
  assertEquals(h.completions.map((item) => item.succeeded), [false, true]);
});

Deno.test("ambiguous provider retry reuses the exact provider idempotency key", async () => {
  const h = harness({
    emailResults: [
      { success: false, error: "connection closed after request upload" },
      { success: true, id: "provider-existing-request" },
    ],
  });
  const first = await h.handler(request());
  const second = await h.handler(request());

  assertEquals(first.status, 502);
  assertEquals(second.status, 200);
  assertEquals(h.emails.length, 2);
  assertEquals(h.emails[0].idempotencyKey, h.emails[1].idempotencyKey);
  assertEquals(
    h.emails[0].idempotencyKey,
    `proposal-send/${PROPOSAL_ID}/${SENT_AT}`,
  );
  assertEquals(h.completions.map((item) => item.succeeded), [false, true]);
});

Deno.test("request must include both proposal id and exact sent timestamp", async () => {
  const h = harness();
  for (const body of [{}, { proposalId: PROPOSAL_ID }, { sentAt: SENT_AT }]) {
    const response = await h.handler(request(body));
    assertEquals(response.status, 400);
    assertEquals(await responseBody(response), {
      error: "proposalId_and_sentAt_required",
    });
  }
  assertEquals(h.gatewayCreations, 0);
  assert(!h.emails.length);
});
