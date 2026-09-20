import {
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type DispatchCompletion,
  dispatchCompletionStatus,
  handleSiteRequestDispatch,
  type SiteRequestDispatchContext,
  type SiteRequestDispatchDeps,
} from "./core.ts";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const OUTBOX_ID = "77777777-7777-4777-8777-777777777777";
const TOKEN = "sr_0123456789abcdefghijklmnopqrstuvwxyzABCDEFG";
const prepared: SiteRequestDispatchContext = {
  request_id: REQUEST_ID,
  status: "draft",
  outbox_id: OUTBOX_ID,
  access_id: null,
  token: null,
  expires_at: "2026-08-01T00:00:00Z",
  needs_consent: false,
  reused: false,
  party_id: "33333333-3333-4333-8333-333333333333",
  project_id: "44444444-4444-4444-8444-444444444444",
  assignee_phone: "+13125551212",
  assignee_name: "Dan",
  designer_name: "Leah",
  studio_name: "Middlewest Studio",
  site_name: "Killkenny West",
  due_at: "2026-07-20T17:00:00Z",
  due_context: "before drywall",
  item_count: 2,
  action: "send",
};
const claimed = {
  ...prepared,
  access_id: "22222222-2222-4222-8222-222222222222",
  token: TOKEN,
};

function deps(
  overrides: Partial<SiteRequestDispatchDeps> = {},
): SiteRequestDispatchDeps {
  return {
    callerRole: () => "authenticated",
    prepare: () => Promise.resolve(prepared),
    claimDispatch: () => Promise.resolve(claimed),
    completeDispatch: () => Promise.resolve({ status: "sent" }),
    pendingDispatches: () => Promise.resolve([]),
    shouldDefer: () => false,
    sendSms: () => Promise.resolve({ sent: true, twilioSid: "SM123" }),
    logNotification: () => Promise.resolve(),
    processLifecycle: () => Promise.resolve({ expired_count: 0 }),
    pendingDeliveryNotifications: () => Promise.resolve([]),
    claimDeliveryNotification: () => Promise.resolve(null),
    sendDeliveryNotification: () => Promise.resolve({ sent: true }),
    completeDeliveryNotification: () => Promise.resolve(),
    clientPortalUrl: "https://client.patina.cloud",
    ...overrides,
  };
}

function request(action: string, extra: Record<string, unknown> = {}): Request {
  return new Request("http://localhost/functions/v1/site-request-dispatch", {
    method: "POST",
    headers: {
      Authorization: "Bearer verified-jwt",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, request_id: REQUEST_ID, ...extra }),
  });
}

Deno.test("raw token is provider-only and the persisted SMS body is redacted", async () => {
  let providerBody = "";
  let persistedBody = "";
  const res = await handleSiteRequestDispatch(
    request("send"),
    deps({
      sendSms: (_context, input) => {
        providerBody = input.body;
        persistedBody = input.auditBody;
        return Promise.resolve({ sent: true, twilioSid: "SM123" });
      },
    }),
  );
  assertEquals(res.status, 200);
  assertStringIncludes(providerBody, `/field/${TOKEN}`);
  assertFalse(persistedBody.includes(TOKEN));
  assertFalse((await res.text()).includes(TOKEN));
});

Deno.test("quiet hours leave identifiers queued without claiming or minting", async () => {
  let claimedCount = 0;
  const res = await handleSiteRequestDispatch(
    request("send"),
    deps({
      shouldDefer: () => true,
      claimDispatch: () => {
        claimedCount += 1;
        return Promise.resolve(claimed);
      },
    }),
  );
  assertEquals(res.status, 202);
  assertEquals(claimedCount, 0);
  assertEquals((await res.json()).queued, true);
});

Deno.test("provider failure stays retryable and records only a generic safe error", async () => {
  let completion: {
    sent: boolean;
    providerMessageId?: string;
    error?: string;
  } | undefined;
  let loggedReason = "";
  const res = await handleSiteRequestDispatch(
    request("send"),
    deps({
      sendSms: () =>
        Promise.resolve({
          sent: false,
          reason: `Twilio 500 echoed ${TOKEN}`,
        }),
      logNotification: (_context, _action, result) => {
        loggedReason = result.reason ?? "";
        return Promise.resolve();
      },
      completeDispatch: (_id, result) => {
        completion = result;
        return Promise.resolve({ status: "retry" });
      },
    }),
  );
  assertEquals(res.status, 202);
  assertEquals(loggedReason, "sms_provider_error");
  assertEquals(completion, {
    sent: false,
    providerMessageId: undefined,
    error: "sms_provider_error",
    terminal: false,
  });
  // The retry path is unchanged: the outbox is asked for 'retry', never the
  // terminal word, and the designer is honestly told it is still queued.
  assertEquals(dispatchCompletionStatus(completion!), "retry");
  assertEquals((await res.json()).queued, true);
});

Deno.test("completion retries after provider acceptance instead of falsely failing", async () => {
  let attempts = 0;
  const res = await handleSiteRequestDispatch(
    request("send"),
    deps({
      completeDispatch: () => {
        attempts += 1;
        return attempts < 3
          ? Promise.reject(new Error("db unavailable"))
          : Promise.resolve({ status: "sent" });
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(attempts, 3);
});

Deno.test("consent invite never needs or mints guest access", async () => {
  let body = "";
  const consent = {
    ...prepared,
    action: "consent-invite",
    needs_consent: true,
  };
  const res = await handleSiteRequestDispatch(
    request("send"),
    deps({
      prepare: () => Promise.resolve(consent),
      claimDispatch: () => Promise.resolve(consent),
      sendSms: (_context, input) => {
        body = input.body;
        return Promise.resolve({ sent: true });
      },
    }),
  );
  assertEquals(res.status, 200);
  assertStringIncludes(body, "Reply YES");
  assertFalse(body.includes("/field/"));
});

Deno.test("lifecycle sweeps retryable SMS and batched designer push outboxes", async () => {
  let pushCompleted = false;
  const res = await handleSiteRequestDispatch(
    request("lifecycle"),
    deps({
      callerRole: () => "service_role",
      pendingDispatches: () => Promise.resolve([OUTBOX_ID]),
      pendingDeliveryNotifications: () =>
        Promise.resolve([
          "88888888-8888-4888-8888-888888888888",
        ]),
      claimDeliveryNotification: () =>
        Promise.resolve({
          outbox_id: "88888888-8888-4888-8888-888888888888",
          request_id: REQUEST_ID,
          user_id: "99999999-9999-4999-8999-999999999999",
          notification_log_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          title: "Delivery ready",
          body: "2 items are ready",
          entity_type: "site_request",
          entity_id: REQUEST_ID,
          deliverable_count: 2,
        }),
      completeDeliveryNotification: (_id, result) => {
        pushCompleted = result.sent;
        return Promise.resolve();
      },
    }),
  );
  assertEquals(res.status, 200);
  assertEquals(pushCompleted, true);
  assertEquals(await res.json(), {
    ok: true,
    expiredCount: 0,
    dispatchesSent: 1,
    dispatchesQueued: 0,
    dispatchesRefused: 0,
    deliveryNotificationsSent: 1,
    deliveryNotificationsQueued: 0,
  });
});

// ── Gate refusals are policy decisions, not carrier weather (SQ-118) ────────
// sendPartySms refuses with a REASON when a gate says no. Retrying re-asks the
// same gate forever, so each of these must finish the outbox row instead, keep
// the word sms.ts used, and tell the designer which gate refused.
const REFUSALS = [
  "campaign_not_approved",
  "client_link_unavailable",
  "consent_evidence_required",
  "contact_rule_forbids_sms",
  "dead_end",
  "empty_body",
  "field_line_phase_off",
  "no_phone_number",
  "not_consented",
  "not_invitable",
  "opted_out",
  "prompts_paused",
  "selection_input_required",
  "suppressed",
];

async function refuse(reason: string) {
  let completion: DispatchCompletion | undefined;
  let loggedReason = "";
  const res = await handleSiteRequestDispatch(
    request("send"),
    deps({
      sendSms: () => Promise.resolve({ sent: false, reason }),
      logNotification: (_context, _action, result) => {
        loggedReason = result.reason ?? "";
        return Promise.resolve();
      },
      completeDispatch: (_id, result) => {
        completion = result;
        return Promise.resolve({ status: "cancelled" });
      },
    }),
  );
  return { res, completion, loggedReason };
}

for (const reason of REFUSALS) {
  Deno.test(`${reason} ends the outbox row and names the refusal`, async () => {
    const { res, completion, loggedReason } = await refuse(reason);
    // Terminal, with the outbox's own permanent status and no retry.
    assertEquals(completion?.terminal, true);
    assertEquals(dispatchCompletionStatus(completion!), "cancelled");
    // Verbatim: never collapsed into the provider's generic word.
    assertEquals(completion?.error, reason);
    assertEquals(loggedReason, reason);
    // The designer is told it was refused and why — not that it is queued.
    assertEquals(res.status, 409);
    const body = await res.json();
    assertEquals(body, {
      ok: false,
      error: "send_refused",
      reason,
      status: "draft",
    });
    assertEquals(body.queued, undefined);
  });
}

Deno.test("quiet-hours deferral is still the outbox's own retry, not a refusal", async () => {
  let completion: DispatchCompletion | undefined;
  const res = await handleSiteRequestDispatch(
    request("send"),
    deps({
      sendSms: () =>
        Promise.resolve({ sent: false, deferred: true, reason: "quiet_hours" }),
      completeDispatch: (_id, result) => {
        completion = result;
        return Promise.resolve({ status: "retry" });
      },
    }),
  );
  assertEquals(completion?.terminal, false);
  assertEquals(dispatchCompletionStatus(completion!), "retry");
  assertEquals(completion?.error, "quiet_hours");
  assertEquals(res.status, 202);
  assertEquals((await res.json()).queued, true);
});

Deno.test("a refused sweep row is counted as refused, never as queued", async () => {
  const res = await handleSiteRequestDispatch(
    request("lifecycle"),
    deps({
      callerRole: () => "service_role",
      pendingDispatches: () => Promise.resolve([OUTBOX_ID]),
      sendSms: () =>
        Promise.resolve({ sent: false, reason: "field_line_phase_off" }),
      completeDispatch: () => Promise.resolve({ status: "cancelled" }),
    }),
  );
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.dispatchesRefused, 1);
  assertEquals(body.dispatchesQueued, 0);
  assertEquals(body.dispatchesSent, 0);
});

Deno.test("consent and lifecycle remain service-role only", async () => {
  assertEquals(
    (await handleSiteRequestDispatch(request("consent-granted"), deps()))
      .status,
    403,
  );
  assertEquals(
    (await handleSiteRequestDispatch(request("lifecycle"), deps())).status,
    403,
  );
});
