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
    MessageStatus: "failed",
  });
  const res = await handleStatusCallback(req, deps(fake));
  assertEquals(res.status, 204);
  const row = (fake._data.sms_messages ?? [])[0] as {
    twilio_status: string;
    error_code: string;
    error_message: string;
  };
  assertEquals(row.twilio_status, "failed");
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

Deno.test("no matching notification_log row (e.g. a userId-path send with no link) does not fail the webhook", async () => {
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
