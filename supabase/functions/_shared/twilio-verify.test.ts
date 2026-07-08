// Deno test for the Twilio inbound signature verifier.
// Run: deno test --no-check -A supabase/functions/_shared/twilio-verify.test.ts

import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  computeTwilioSignature,
  timingSafeEqual,
  verifyTwilioSignature,
} from "./twilio-verify.ts";

// Canonical vector from Twilio's request-validation docs.
const DOC_TOKEN = "12345";
const DOC_URL = "https://mycompany.com/myapp.php?foo=1&bar=2";
const DOC_PARAMS: Record<string, string> = {
  CallSid: "CA1234567890ABCDE",
  Caller: "+14158675309",
  Digits: "1234",
  From: "+14158675309",
  To: "+18005551212",
};
const DOC_EXPECTED = "RSOYDt4T1cUTdK1PDd93/VVr8B8=";

Deno.test("computeTwilioSignature matches the Twilio documentation vector", async () => {
  const sig = await computeTwilioSignature(DOC_TOKEN, DOC_URL, DOC_PARAMS);
  assertEquals(sig, DOC_EXPECTED);
});

Deno.test("verifyTwilioSignature accepts a known-good signature", async () => {
  const url = "https://api.patina.cloud/functions/v1/sms-inbound";
  const params = { From: "+15551234567", To: "+15557654321", Body: "done 1", MessageSid: "SMabc" };
  const good = await computeTwilioSignature("shh-secret", url, params);
  assert(await verifyTwilioSignature("shh-secret", url, params, good));
});

Deno.test("verifyTwilioSignature rejects a tampered param", async () => {
  const url = "https://api.patina.cloud/functions/v1/sms-inbound";
  const params = { From: "+15551234567", To: "+15557654321", Body: "done 1", MessageSid: "SMabc" };
  const good = await computeTwilioSignature("shh-secret", url, params);
  const tampered = { ...params, Body: "done 2" }; // attacker flips the item
  assert(!(await verifyTwilioSignature("shh-secret", url, tampered, good)));
});

Deno.test("verifyTwilioSignature rejects a wrong URL", async () => {
  const params = { From: "+15551234567", To: "+15557654321", Body: "hi", MessageSid: "SMabc" };
  const good = await computeTwilioSignature("shh-secret", "https://real.example/hook", params);
  assert(!(await verifyTwilioSignature("shh-secret", "https://evil.example/hook", params, good)));
});

Deno.test("verifyTwilioSignature fails closed on a missing token or signature", async () => {
  const params = { From: "+1", To: "+2", Body: "x", MessageSid: "SM1" };
  assert(!(await verifyTwilioSignature(undefined, "u", params, "sig")));
  assert(!(await verifyTwilioSignature("t", "u", params, null)));
});

Deno.test("timingSafeEqual basic behavior", () => {
  assert(timingSafeEqual("abc", "abc"));
  assert(!timingSafeEqual("abc", "abd"));
  assert(!timingSafeEqual("abc", "abcd"));
});
