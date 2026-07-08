// _shared/twilio-verify.ts — Twilio inbound webhook signature verification.
//
// Twilio signs each webhook with X-Twilio-Signature so a public endpoint
// (verify_jwt = false) can still prove the request came from Twilio. The
// algorithm (https://www.twilio.com/docs/usage/security#validating-requests):
//
//   1. Take the full request URL Twilio POSTed to (query string included).
//      This MUST equal the URL configured on the Messaging Service byte-for-byte
//      — we use SMS_INBOUND_PUBLIC_URL, never the request's own Host header
//      (which a proxy/tunnel can rewrite).
//   2. Sort the POST body params alphabetically by name; append each name
//      immediately followed by its value (no separators) to the URL.
//   3. HMAC-SHA1 that string with the Twilio auth token as the key.
//   4. Base64-encode the digest; constant-time compare to X-Twilio-Signature.
//
// Everything here is pure + dependency-free (Web Crypto) so it unit-tests with
// known vectors and injects nothing.

/** Base64-encode raw bytes (no line wrapping). */
function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/**
 * Compute the expected X-Twilio-Signature for a URL + POST params.
 * `params` is the parsed application/x-www-form-urlencoded body.
 */
export async function computeTwilioSignature(
  authToken: string,
  url: string,
  params: Record<string, string>,
): Promise<string> {
  // URL first, then each param (name+value) in alphabetical name order.
  let data = url;
  for (const key of Object.keys(params).sort()) {
    data += key + params[key];
  }

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(authToken),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    cryptoKey,
    new TextEncoder().encode(data),
  );
  return bytesToBase64(new Uint8Array(sig));
}

/** Length-safe, constant-time string compare (no early return on mismatch). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Verify an inbound Twilio request. Returns true only when the computed
 * signature matches `signature` (the X-Twilio-Signature header). A missing
 * token or signature is a hard fail.
 */
export async function verifyTwilioSignature(
  authToken: string | undefined,
  url: string,
  params: Record<string, string>,
  signature: string | null,
): Promise<boolean> {
  if (!authToken || !signature) return false;
  const expected = await computeTwilioSignature(authToken, url, params);
  return timingSafeEqual(expected, signature);
}
