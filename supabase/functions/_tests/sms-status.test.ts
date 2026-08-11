// Deno test for the sms-status webhook handler (signature verification,
// MessageStatus allowlisting, and Twilio error capture).
// Run: deno test --no-check -A supabase/functions/_tests/sms-status.test.ts

import {
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
