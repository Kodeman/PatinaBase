// Deno test for the sms-status webhook handler (signature verification,
// MessageStatus allowlisting, and Twilio error capture).
// Run: deno test --no-check -A supabase/functions/_tests/sms-status.test.ts

import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { handleStatusCallback } from "../sms-status/handler.ts";
import { createFakeSupabase } from "./fake-supabase.ts";
import { signTwilio } from "./sign-twilio.ts";

const TOKEN = "test-auth-token";
const URL = "https://example.patina.cloud/functions/v1/sms-status";

function envOf(map: Record<string, string>) {
  return (k: string) => map[k];
}

async function signedRequest(
  params: Record<string, string>,
): Promise<Request> {
  const sig = await signTwilio(TOKEN, URL, params);
  return new Request(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": sig,
    },
    body: new URLSearchParams(params).toString(),
  });
}

const deps = (fake: unknown) => ({
  supabase: fake as never,
  getEnv: envOf({ TWILIO_AUTH_TOKEN: TOKEN, SMS_STATUS_CALLBACK_URL: URL }),
});

Deno.test("a signed callback updates twilio_status", async () => {
  const fake = createFakeSupabase({
    sms_messages: [
      {
        id: "m1",
        twilio_sid: "SM123",
        twilio_status: "sent",
        direction: "outbound",
        body: "hi",
      },
    ],
  });
  const req = await signedRequest({
    MessageSid: "SM123",
    MessageStatus: "delivered",
  });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 204);
  const row = (fake._data.sms_messages ?? [])[0] as { twilio_status: string };
  assertEquals(row.twilio_status, "delivered");
});

Deno.test("'undelivered' with ErrorCode=30034 writes error_code/error_message", async () => {
  const fake = createFakeSupabase({
    sms_messages: [
      {
        id: "m1",
        twilio_sid: "SM456",
        twilio_status: "sent",
        direction: "outbound",
        body: "hi",
      },
    ],
  });
  const req = await signedRequest({
    MessageSid: "SM456",
    MessageStatus: "undelivered",
    ErrorCode: "30034",
    ErrorMessage: "Message blocked",
  });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 204);
  const row = (fake._data.sms_messages ?? [])[0] as {
    twilio_status: string;
    error_code: string;
    error_message: string;
  };
  assertEquals(row.twilio_status, "undelivered");
  assertEquals(row.error_code, "30034");
  assertEquals(row.error_message, "Message blocked");
});

Deno.test("a callback without ErrorCode does not null an existing error_code", async () => {
  const fake = createFakeSupabase({
    sms_messages: [
      {
        id: "m1",
        twilio_sid: "SM789",
        twilio_status: "undelivered",
        direction: "outbound",
        body: "hi",
        error_code: "30034",
        error_message: "Message blocked",
      },
    ],
  });
  const req = await signedRequest({
    MessageSid: "SM789",
    MessageStatus: "undelivered",
  });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 204);
  const row = (fake._data.sms_messages ?? [])[0] as {
    twilio_status: string;
    error_code: string;
    error_message: string;
  };
  assertEquals(row.twilio_status, "undelivered");
  assertEquals(
    row.error_code,
    "30034",
    "absent ErrorCode must not null the prior value",
  );
  assertEquals(row.error_message, "Message blocked");
});

Deno.test("a bad signature is rejected with 403", async () => {
  const fake = createFakeSupabase({ sms_messages: [] });
  const req = new Request(URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Twilio-Signature": "not-a-real-signature",
    },
    body: new URLSearchParams({
      MessageSid: "SM1",
      MessageStatus: "delivered",
    }).toString(),
  });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 403);
});

Deno.test("an unknown MessageStatus is rejected with 400", async () => {
  const fake = createFakeSupabase({ sms_messages: [] });
  const req = await signedRequest({
    MessageSid: "SM1",
    MessageStatus: "not_a_real_status",
  });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 400);
});

// ── item 5: honest notification_log statuses ────────────────────────────────

Deno.test("'delivered' flips the LINKED notification_log row (matched by provider_id) from sending to delivered", async () => {
  const fake = createFakeSupabase({
    sms_messages: [
      { id: "m1", twilio_sid: "SM999", twilio_status: "sent", direction: "outbound", body: "hi" },
    ],
    notification_log: [
      {
        id: "n1", user_id: "u1", type: "site_request_send", channel: "sms",
        status: "sending", provider_id: "SM999",
      },
    ],
  });
  const req = await signedRequest({ MessageSid: "SM999", MessageStatus: "delivered" });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 204);
  const row = (fake._data.notification_log ?? [])[0] as { status: string; sent_at?: string };
  assertEquals(row.status, "delivered");
  assert(row.sent_at, "sent_at is stamped on delivery");
});

Deno.test("'failed' flips the LINKED notification_log row to failed and carries the error", async () => {
  const fake = createFakeSupabase({
    sms_messages: [
      { id: "m1", twilio_sid: "SM998", twilio_status: "sent", direction: "outbound", body: "hi" },
    ],
    notification_log: [
      {
        id: "n1", user_id: "u1", type: "site_request_send", channel: "sms",
        status: "sending", provider_id: "SM998",
      },
    ],
  });
  const req = await signedRequest({
    MessageSid: "SM998",
    MessageStatus: "failed",
    ErrorCode: "30003",
    ErrorMessage: "Unreachable destination handset",
  });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 204);
  const row = (fake._data.notification_log ?? [])[0] as { status: string; error?: string };
  assertEquals(row.status, "failed");
  assertEquals(row.error, "Unreachable destination handset");
});

Deno.test("an intermediate status (e.g. 'sent') leaves notification_log alone — it's already 'sending'", async () => {
  const fake = createFakeSupabase({
    sms_messages: [
      { id: "m1", twilio_sid: "SM997", twilio_status: "queued", direction: "outbound", body: "hi" },
    ],
    notification_log: [
      {
        id: "n1", user_id: "u1", type: "site_request_send", channel: "sms",
        status: "sending", provider_id: "SM997",
      },
    ],
  });
  const req = await signedRequest({ MessageSid: "SM997", MessageStatus: "sent" });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 204);
  const row = (fake._data.notification_log ?? [])[0] as { status: string };
  assertEquals(row.status, "sending", "an intermediate callback must not touch notification_log");
});

Deno.test("no matching notification_log row (e.g. a party send with no account) does not fail the webhook", async () => {
  const fake = createFakeSupabase({
    sms_messages: [
      { id: "m1", twilio_sid: "SM996", twilio_status: "sent", direction: "outbound", body: "hi" },
    ],
    notification_log: [],
  });
  const req = await signedRequest({ MessageSid: "SM996", MessageStatus: "delivered" });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 204);
});

Deno.test("a non-sms notification_log row sharing a provider_id string is never touched", async () => {
  const fake = createFakeSupabase({
    sms_messages: [
      { id: "m1", twilio_sid: "SMshared", twilio_status: "sent", direction: "outbound", body: "hi" },
    ],
    notification_log: [
      { id: "n1", user_id: "u1", type: "email_thing", channel: "email", status: "sending", provider_id: "SMshared" },
    ],
  });
  const req = await signedRequest({ MessageSid: "SMshared", MessageStatus: "delivered" });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 204);
  const row = (fake._data.notification_log ?? [])[0] as { status: string; channel: string };
  assertEquals(row.channel, "email");
  assertEquals(row.status, "sending", "channel gate keeps this email row untouched");
});

// The transition table is exercised through signed real-handler requests, not
// a duplicate implementation of the production helper.
const RECEIPT_CASES: Record<string, string[]> = {
  claimed: [
    "accepted",
    "scheduled",
    "queued",
    "sending",
    "sent",
    "delivered",
    "read",
    "failed",
    "undelivered",
    "canceled",
  ],
  accepted: [
    "accepted",
    "scheduled",
    "queued",
    "sending",
    "sent",
    "delivered",
    "read",
    "failed",
    "undelivered",
    "canceled",
  ],
  scheduled: [
    "scheduled",
    "queued",
    "sending",
    "sent",
    "delivered",
    "read",
    "failed",
    "undelivered",
    "canceled",
  ],
  queued: [
    "queued",
    "sending",
    "sent",
    "delivered",
    "read",
    "failed",
    "undelivered",
    "canceled",
  ],
  sending: [
    "sending",
    "sent",
    "delivered",
    "read",
    "failed",
    "undelivered",
    "canceled",
  ],
  sent: ["sent", "delivered", "read", "failed", "undelivered", "canceled"],
  delivered: ["delivered", "read"],
  read: ["read"],
  failed: ["failed"],
  undelivered: ["undelivered"],
  canceled: ["canceled"],
  receiving: ["receiving", "received"],
  received: ["received"],
  suppressed: [],
  expired: [],
  dry_run: [],
  deferred: [],
};
const CALLBACK_STATUSES = [
  "accepted",
  "scheduled",
  "queued",
  "sending",
  "sent",
  "delivered",
  "read",
  "failed",
  "undelivered",
  "canceled",
  "receiving",
  "received",
];

Deno.test("signed receipt transition table applies atomically to selection and ordinary messages", async () => {
  for (const selection of [false, true]) {
    for (const [before, accepted] of Object.entries(RECEIPT_CASES)) {
      for (const incoming of CALLBACK_STATUSES) {
        const fake = createFakeSupabase({
          sms_messages: [{
            id: "m1",
            twilio_sid: "SM_matrix",
            direction: "outbound",
            template_key: selection ? "sms_selection" : "sms_daily_digest",
            twilio_status: before,
            error_code: "prior-code",
            error_message: "prior-message",
          }],
        });
        const res = await handleStatusCallback(
          await signedRequest({
            MessageSid: "SM_matrix",
            MessageStatus: incoming,
            ErrorCode: "incoming-code",
            ErrorMessage: "incoming-message",
          }),
          deps(fake),
        );
        assertEquals(res.status, 204);
        const row = fake._data.sms_messages[0];
        const advances = accepted.includes(incoming);
        assertEquals(
          row.twilio_status,
          advances ? incoming : before,
          before + " -> " + incoming,
        );
        assertEquals(
          row.error_code,
          advances ? "incoming-code" : "prior-code",
          "rejected stale receipt cannot mutate error_code",
        );
        assertEquals(
          row.error_message,
          advances ? "incoming-message" : "prior-message",
          "rejected stale receipt cannot mutate error_message",
        );
      }
    }
  }
});

Deno.test("reverse and concurrent callback order converges without terminal revival or delivery regression", async () => {
  for (
    const [a, b, expected] of [
      ["failed", "sent", "failed"],
      ["delivered", "queued", "delivered"],
      ["sent", "undelivered", "undelivered"],
      ["delivered", "sent", "delivered"],
    ]
  ) {
    for (const statuses of [[a, b], [b, a]]) {
      for (const concurrent of [false, true]) {
        const fake = createFakeSupabase({
          sms_messages: [{
            id: "m1",
            twilio_sid: "SM_race",
            twilio_status: "queued",
          }],
        });
        const requests = await Promise.all(
          statuses.map((MessageStatus) =>
            signedRequest({ MessageSid: "SM_race", MessageStatus })
          ),
        );
        if (concurrent) {
          const results = await Promise.all(
            requests.map((req) => handleStatusCallback(req, deps(fake))),
          );
          assert(results.every((res) => res.status === 204));
        } else {
          for (const req of requests) {
            assertEquals(
              (await handleStatusCallback(req, deps(fake))).status,
              204,
            );
          }
        }
        assertEquals(
          fake._data.sms_messages[0].twilio_status,
          expected,
          statuses.join(" -> "),
        );
      }
    }
  }
});

Deno.test("duplicate receipts retain provider codes and terminal notification outcome", async () => {
  const fake = createFakeSupabase({
    sms_messages: [{
      id: "m1",
      twilio_sid: "SM_duplicate",
      twilio_status: "sent",
    }],
    notification_log: [{
      id: "n1",
      provider_id: "SM_duplicate",
      channel: "sms",
      status: "sending",
    }],
  });
  for (
    const fields of [
      {
        MessageStatus: "undelivered",
        ErrorCode: "30034",
        ErrorMessage: "Blocked",
      },
      { MessageStatus: "undelivered" },
      { MessageStatus: "undelivered", ErrorCode: "", ErrorMessage: "" },
      {
        MessageStatus: "delivered",
        ErrorCode: "wrong-code",
        ErrorMessage: "stale",
      },
      { MessageStatus: "sent" },
    ]
  ) {
    assertEquals(
      (await handleStatusCallback(
        await signedRequest(
          { MessageSid: "SM_duplicate", ...fields } as Record<string, string>,
        ),
        deps(fake),
      )).status,
      204,
    );
  }
  assertEquals(fake._data.sms_messages[0].twilio_status, "undelivered");
  assertEquals(fake._data.sms_messages[0].error_code, "30034");
  assertEquals(fake._data.sms_messages[0].error_message, "Blocked");
  assertEquals(fake._data.notification_log[0].status, "failed");
  assertEquals(fake._data.notification_log[0].error, "Blocked");
});

Deno.test("unmatched SID and failed conditional update never change a linked notification", async () => {
  const fake = createFakeSupabase({
    sms_messages: [{ id: "m1", twilio_sid: "SM_known", twilio_status: "sent" }],
    notification_log: [{
      id: "n1",
      provider_id: "SM_other",
      channel: "sms",
      status: "sending",
    }],
  });
  assertEquals(
    (await handleStatusCallback(
      await signedRequest({
        MessageSid: "SM_unknown",
        MessageStatus: "delivered",
      }),
      deps(fake),
    )).status,
    204,
  );
  assertEquals(fake._data.sms_messages[0].twilio_status, "sent");
  assertEquals(fake._data.notification_log[0].status, "sending");
  fake._data.notification_log[0].provider_id = "SM_known";
  assert(fake._failUpdateIds);
  fake._failUpdateIds.add("m1");
  const req = await signedRequest({MessageSid: "SM_known", MessageStatus: "delivered"});
  assertEquals((await handleStatusCallback(req, deps(fake))).status, 500);
  assertEquals(fake._data.sms_messages[0].twilio_status, "sent");
  assertEquals(fake._data.notification_log[0].status, "sending");
});


Deno.test("notification-only receipts use the schema status vocabulary and preserve terminal rows", async () => {
  for (const before of ["queued", "sending", "delivered", "opened", "clicked", "bounced", "failed", "suppressed"]) {
    for (const incoming of CALLBACK_STATUSES) {
      const fake = createFakeSupabase({
        sms_messages: [],
        notification_log: [{ id: "n1", provider_id: "SM_notification", channel: "sms",
          status: before, error: "original error", sent_at: "original time" }],
      });
      const res = await handleStatusCallback(await signedRequest({
        MessageSid: "SM_notification", MessageStatus: incoming,
        ErrorCode: "30034", ErrorMessage: "incoming error",
      }), deps(fake));
      assertEquals(res.status, 204);
      const settles = before === "sending" && ["delivered", "failed", "undelivered"].includes(incoming);
      const row = fake._data.notification_log[0];
      assertEquals(row.status, settles ? (incoming === "delivered" ? "delivered" : "failed") : before,
        before + " -> " + incoming);
      assertEquals(row.error, settles ? "incoming error" : "original error", "ignored transition preserves error");
      if (settles && incoming === "delivered") assert(row.sent_at !== "original time");
      else assertEquals(row.sent_at, "original time");
      assertEquals(row.error_code, undefined, "notification_log has no error_code column");
      assertEquals(fake._data.sms_messages.length, 0);
    }
  }
});

Deno.test("notification-only duplicates and stale callbacks preserve first terminal outcome and error", async () => {
  for (const terminal of ["delivered", "failed", "undelivered"]) {
    const fake = createFakeSupabase({ notification_log: [{ id: "n1", provider_id: "SM_duplicate_log",
      channel: "sms", status: "sending" }] });
    for (const fields of [
      { MessageStatus: terminal, ErrorCode: "30034", ErrorMessage: "first error" },
      { MessageStatus: terminal },
      { MessageStatus: terminal, ErrorCode: "", ErrorMessage: "" },
      { MessageStatus: terminal, ErrorCode: "different", ErrorMessage: "duplicate error" },
      { MessageStatus: terminal === "delivered" ? "failed" : "delivered", ErrorMessage: "reversed" },
      { MessageStatus: "queued", ErrorMessage: "stale" },
      { MessageStatus: "sent" },
    ]) {
      assertEquals((await handleStatusCallback(await signedRequest({
        MessageSid: "SM_duplicate_log", ...fields,
      } as Record<string, string>), deps(fake))).status, 204);
      assertEquals(fake._data.notification_log[0].status, terminal === "delivered" ? "delivered" : "failed");
      assertEquals(fake._data.notification_log[0].error, "first error");
    }
  }
});

Deno.test("notification-only reversed and concurrent receipts atomically keep the first terminal winner", async () => {
  for (const statuses of [["delivered", "failed"], ["failed", "delivered"], ["sent", "delivered"], ["undelivered", "queued"]]) {
    for (const concurrent of [false, true]) {
      const fake = createFakeSupabase({ notification_log: [{ id: "n1", provider_id: "SM_log_race",
        channel: "sms", status: "sending" }] });
      const requests = await Promise.all(statuses.map(MessageStatus => signedRequest({
        MessageSid: "SM_log_race", MessageStatus, ErrorMessage: MessageStatus,
      })));
      if (concurrent) {
        const results = await Promise.all(requests.map(req => handleStatusCallback(req, deps(fake))));
        assert(results.every(res => res.status === 204));
      } else {
        for (const req of requests) assertEquals((await handleStatusCallback(req, deps(fake))).status, 204);
      }
      const row = fake._data.notification_log[0];
      const outcomes = statuses.filter(s => ["delivered", "failed", "undelivered"].includes(s));
      assert(outcomes.includes(row.error as string), "winner must be a terminal receipt, not intermediate error");
      if (!concurrent) assertEquals(row.error, outcomes[0]);
      assertEquals(row.status, row.error === "delivered" ? "delivered" : "failed");
      const snapshot = { ...row };
      for (const MessageStatus of [...statuses].reverse()) {
        await handleStatusCallback(await signedRequest({ MessageSid: "SM_log_race", MessageStatus,
          ErrorMessage: "late error" }), deps(fake));
      }
      assertEquals(row, snapshot, "reversed duplicates preserve the entire terminal notification");
    }
  }
});

Deno.test("an ignored existing message receipt cannot settle even a still-sending linked notification", async () => {
  for (const [before, incoming] of [["failed", "delivered"], ["delivered", "failed"], ["read", "delivered"], ["suppressed", "undelivered"]]) {
    const fake = createFakeSupabase({
      sms_messages: [{ id: "m1", twilio_sid: "SM_stale", twilio_status: before, error_code: "original" }],
      notification_log: [{ id: "n1", provider_id: "SM_stale", channel: "sms", status: "sending", error: "original" }],
    });
    assertEquals((await handleStatusCallback(await signedRequest({ MessageSid: "SM_stale",
      MessageStatus: incoming, ErrorCode: "wrong", ErrorMessage: "wrong" }), deps(fake))).status, 204);
    assertEquals(fake._data.sms_messages[0].twilio_status, before);
    assertEquals(fake._data.sms_messages[0].error_code, "original");
    assertEquals(fake._data.notification_log[0].status, "sending", "UPDATE 0 is not absence");
    assertEquals(fake._data.notification_log[0].error, "original");
  }
});

Deno.test("notification-only lookup keeps unknown SID and non-SMS channels untouched", async () => {
  const fake = createFakeSupabase({ notification_log: [
    { id: "n1", provider_id: "SM_email", channel: "email", status: "sending" },
    { id: "n2", provider_id: "SM_push", channel: "push", status: "sending" },
    { id: "n3", provider_id: "SM_other", channel: "sms", status: "sending" },
  ] });
  const snapshot = structuredClone(fake._data.notification_log);
  for (const sid of ["SM_unknown", "SM_email", "SM_push"]) {
    assertEquals((await handleStatusCallback(await signedRequest({ MessageSid: sid,
      MessageStatus: "delivered" }), deps(fake))).status, 204);
  }
  assertEquals(fake._data.notification_log, snapshot);
});

// Inject at the query execution seam so UPDATE-0 and a failing absence SELECT
// stay distinguishable, without changing the shared fake or skipping signing.
function failQuery(fake: ReturnType<typeof createFakeSupabase>, tableName: string, operation: "select" | "update", throws: boolean) {
  const from = fake.from.bind(fake);
  fake.from = ((table: string) => {
    const query = from(table);
    if (table !== tableName) return query;
    let updating = false;
    const proxy = new Proxy(query, {
      get(target, prop) {
        if (prop === "update") return (...args: unknown[]) => {
          updating = true;
          // deno-lint-ignore no-explicit-any
          (target.update as any)(...args);
          return proxy;
        };
        if (prop === "then" || prop === "maybeSingle") {
          if ((updating ? "update" : "select") === operation) {
            const run = () => throws ? Promise.reject(new Error("synthetic DB failure"))
              : Promise.resolve({ data: null, error: { message: "synthetic DB failure" } });
            return prop === "maybeSingle" ? run : (resolve: never, reject: never) => run().then(resolve, reject);
          }
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? (...args: unknown[]) => {
          const result = value.apply(target, args);
          return result === target ? proxy : result;
        } : value;
      },
    });
    return proxy;
  }) as typeof fake.from;
}

Deno.test("message update and absence-read errors are retryable and never fall through to notifications", async () => {
  for (const operation of ["select", "update"] as const) {
    for (const throws of [false, true]) {
      for (const existing of [false, true]) {
        const fake = createFakeSupabase({
          sms_messages: existing ? [{ id: "m1", twilio_sid: "SM_error", twilio_status: "failed" }] : [],
          notification_log: [{ id: "n1", provider_id: "SM_error", channel: "sms", status: "sending", error: "original" }],
        });
        failQuery(fake, "sms_messages", operation, throws);
        const before = structuredClone(fake._data);
        assertEquals((await handleStatusCallback(await signedRequest({ MessageSid: "SM_error",
          MessageStatus: "delivered", ErrorMessage: "wrong" }), deps(fake))).status, 500);
        assertEquals(fake._data, before, "failure is not evidence of absence; no row may mutate");
      }
    }
  }
});

Deno.test("notification update errors return retryable failure and a duplicate can settle both representations", async () => {
  for (const linked of [false, true]) {
    for (const throws of [false, true]) {
      const fake = createFakeSupabase({
        sms_messages: linked ? [{ id: "m1", twilio_sid: "SM_retry", twilio_status: "sent" }] : [],
        notification_log: [{ id: "n1", provider_id: "SM_retry", channel: "sms", status: "sending" }],
      });
      const from = fake.from;
      failQuery(fake, "notification_log", "update", throws);
      const request = () => signedRequest({ MessageSid: "SM_retry", MessageStatus: "delivered" });
      assertEquals((await handleStatusCallback(await request(), deps(fake))).status, 500);
      assertEquals(fake._data.notification_log[0].status, "sending");
      if (linked) assertEquals(fake._data.sms_messages[0].twilio_status, "delivered");
      fake.from = from;
      assertEquals((await handleStatusCallback(await request(), deps(fake))).status, 204);
      assertEquals(fake._data.notification_log[0].status, "delivered");
    }
  }
});
