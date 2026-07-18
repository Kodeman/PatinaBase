import {
  assert,
  assertEquals,
  assertFalse,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  handleSiteRequestDispatch,
  type SiteRequestDispatchContext,
  type SiteRequestDispatchDeps,
} from "./core.ts";

const REQUEST_ID = "11111111-1111-4111-8111-111111111111";
const context: SiteRequestDispatchContext = {
  request_id: REQUEST_ID,
  status: "sent",
  access_id: "22222222-2222-4222-8222-222222222222",
  token: "opaque_raw_token_1234567890abcdefghij",
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

function deps(
  overrides: Partial<SiteRequestDispatchDeps> = {},
): SiteRequestDispatchDeps {
  return {
    callerRole: () => "authenticated",
    prepare: () => Promise.resolve(context),
    sendSms: () => Promise.resolve({ sent: true, twilioSid: "SM123" }),
    markDispatched: () => Promise.resolve({ idempotent: false }),
    logNotification: () => Promise.resolve(),
    processLifecycle: () =>
      Promise.resolve({ expired_count: 0, due_reminders: [] }),
    recordDispatch: () => Promise.resolve(),
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

Deno.test(
  "designer send preserves RPC authorization then acks access only after accepted SMS",
  async () => {
    const calls: string[] = [];
    let smsBody = "";
    const res = await handleSiteRequestDispatch(
      request("send"),
      deps({
        prepare: (_req, action) => {
          calls.push(`prepare:${action}`);
          return Promise.resolve(context);
        },
        sendSms: (_ctx, input) => {
          calls.push("sms");
          smsBody = input.body;
          return Promise.resolve({ sent: true, twilioSid: "SM123" });
        },
        markDispatched: (_ctx, provider) => {
          calls.push(`mark:${provider}`);
          return Promise.resolve({ idempotent: false });
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(calls, ["prepare:send", "sms", "mark:SM123"]);
    assertStringIncludes(
      smsBody,
      `https://client.patina.cloud/field/${context.token}`,
    );
    assertFalse((await res.text()).includes(context.token!));
  },
);

Deno.test(
  "failed SMS leaves the raw access unacknowledged so retry can safely remint",
  async () => {
    let marked = false;
    const res = await handleSiteRequestDispatch(
      request("send"),
      deps({
        sendSms: () =>
          Promise.resolve({ sent: false, reason: "twilio_unavailable" }),
        markDispatched: () => {
          marked = true;
          return Promise.resolve({});
        },
      }),
    );
    assertEquals(res.status, 502);
    assertFalse(marked);
  },
);

Deno.test(
  "accepted SMS retries the idempotent dispatch acknowledgement and ignores log failure",
  async () => {
    let attempts = 0;
    const res = await handleSiteRequestDispatch(
      request("send"),
      deps({
        logNotification: () =>
          Promise.reject(new Error("notification_log unavailable")),
        markDispatched: () => {
          attempts += 1;
          if (attempts < 3) {
            return Promise.reject(new Error("transient ack failure"));
          }
          return Promise.resolve({ idempotent: false });
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(attempts, 3);
  },
);

Deno.test(
  "awaiting consent sends only the YES opt-in invite and never creates an access ack",
  async () => {
    let template = "";
    let marked = false;
    const res = await handleSiteRequestDispatch(
      request("send"),
      deps({
        prepare: () =>
          Promise.resolve({
            ...context,
            needs_consent: true,
            token: null,
            access_id: null,
            status: "awaiting_consent",
          }),
        sendSms: (_ctx, input) => {
          template = input.templateKey;
          return Promise.resolve({ sent: true });
        },
        markDispatched: () => {
          marked = true;
          return Promise.resolve({});
        },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(template, "sms_optin_invite");
    assertFalse(marked);
    assertEquals((await res.json()).status, "awaiting_consent");
  },
);

Deno.test(
  "consent-granted trigger is service-role only and duplicate trigger is a no-op",
  async () => {
    const forbidden = await handleSiteRequestDispatch(
      request("consent-granted"),
      deps(),
    );
    assertEquals(forbidden.status, 403);

    let sent = false;
    const duplicate = await handleSiteRequestDispatch(
      request("consent-granted"),
      deps({
        callerRole: () => "service_role",
        prepare: () =>
          Promise.resolve({ ...context, reused: true, token: null }),
        sendSms: () => {
          sent = true;
          return Promise.resolve({ sent: true });
        },
      }),
    );
    assertEquals(duplicate.status, 200);
    assertEquals((await duplicate.json()).idempotent, true);
    assertFalse(sent);
  },
);

Deno.test(
  "nudge sends without exposing/reminting a raw access token and relies on DB daily limit",
  async () => {
    let body = "";
    let marked = false;
    const res = await handleSiteRequestDispatch(
      request("nudge", { note: "Need this before noon." }),
      deps({
        prepare: () =>
          Promise.resolve({
            ...context,
            token: null,
            access_id: context.access_id,
            reused: true,
            action: "nudge",
          }),
        sendSms: (_ctx, input) => {
          body = input.body;
          return Promise.resolve({ sent: true });
        },
        markDispatched: () => {
          marked = true;
          return Promise.resolve({});
        },
      }),
    );
    assertEquals(res.status, 200);
    assertStringIncludes(body, "Need this before noon.");
    assertFalse(marked);
  },
);

Deno.test(
  "deferred quiet-hours SMS is accepted and acknowledged exactly like provider queueing",
  async () => {
    let marked = false;
    const res = await handleSiteRequestDispatch(
      request("resend"),
      deps({
        sendSms: () =>
          Promise.resolve({
            sent: false,
            deferred: true,
            messageId: "deferred-row",
          }),
        markDispatched: (_ctx, provider) => {
          marked = provider === "deferred-row";
          return Promise.resolve({ idempotent: false });
        },
      }),
    );
    assertEquals(res.status, 200);
    assert(marked);
    assertEquals((await res.json()).deferred, true);
  },
);

Deno.test(
  "service lifecycle sends once-only due reminders without needing the raw link token",
  async () => {
    let recorded = false;
    let message = "";
    const res = await handleSiteRequestDispatch(
      request("lifecycle"),
      deps({
        callerRole: () => "service_role",
        processLifecycle: () =>
          Promise.resolve({
            expired_count: 2,
            due_reminders: [
              { ...context, token: null, action: "due-reminder" },
            ],
          }),
        sendSms: (_ctx, input) => {
          message = input.body;
          return Promise.resolve({ sent: true, twilioSid: "SM-due" });
        },
        recordDispatch: (_ctx, action, result) => {
          recorded = action === "due-reminder" && result.twilioSid === "SM-due";
          return Promise.resolve();
        },
      }),
    );
    assertEquals(res.status, 200);
    assertStringIncludes(message, "private link from our earlier message");
    assert(recorded);
    assertEquals(await res.json(), {
      ok: true,
      expiredCount: 2,
      dueRemindersSent: 1,
      dueRemindersFailed: 0,
    });
  },
);
