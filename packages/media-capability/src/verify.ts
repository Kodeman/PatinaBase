import { fromBase64Url, isCanonicalBase64Url } from "./base64url";
import { MAX_TOKEN_LENGTH_CHARS } from "./constants";
import { importPublicKey } from "./keys";
import { isValidClaimsShape } from "./shape";
import type { VerifyCapabilityResult } from "./types";

function getSubtle(): SubtleCrypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c || !c.subtle) {
    throw new Error(
      "@patina/media-capability: globalThis.crypto.subtle is unavailable in this runtime",
    );
  }
  return c.subtle;
}

/**
 * Verify a compact media capability token minted by mintCapability.
 *
 * Does NOT enforce `claims.aud` against any expected value — there is no
 * expected-audience parameter in this function's contract. A verified
 * token's `claims.aud` is returned as-is; the caller is responsible for
 * comparing it against whatever audience it expects to be.
 */
export async function verifyCapability(
  publicKeyPem: string,
  token: string,
): Promise<VerifyCapabilityResult> {
  // ── length cap FIRST — before any base64/JSON/crypto work ────────────────
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "malformed_token" };
  }
  if (token.length > MAX_TOKEN_LENGTH_CHARS) {
    return { ok: false, reason: "token_too_large" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "malformed_token" };
  }
  const [headerB64, payloadB64, sigB64] = parts;

  // ── canonical-encoding check on all three segments, before decoding any
  // of them for real. A non-canonical (padded, or trailing-bit-garbage)
  // segment decodes to the same bytes as its canonical form but is a
  // DIFFERENT string — accepting it lets one signature verify under many
  // distinct token strings, defeating string-keyed replay/revocation.
  if (
    !isCanonicalBase64Url(headerB64) ||
    !isCanonicalBase64Url(payloadB64) ||
    !isCanonicalBase64Url(sigB64)
  ) {
    return { ok: false, reason: "non_canonical_encoding" };
  }

  const decoder = new TextDecoder();

  let header: unknown;
  try {
    header = JSON.parse(decoder.decode(fromBase64Url(headerB64)));
  } catch {
    return { ok: false, reason: "malformed_header" };
  }
  if (typeof header !== "object" || header === null) {
    return { ok: false, reason: "malformed_header" };
  }
  const headerObj = header as Record<string, unknown>;
  if (headerObj.alg !== "EdDSA") {
    return { ok: false, reason: "unsupported_alg" };
  }
  // typ is minted 'MCAP'. A token shaped like a generic JWT (typ: 'JWT', or
  // any other value) — same alg, a real signature, attacker-chosen
  // bucket/key/presetAllowList claims — must not verify just because alg
  // and signature line up. typ pins this token to ITS OWN format.
  if (headerObj.typ !== "MCAP") {
    return { ok: false, reason: "unsupported_typ" };
  }

  let rawClaims: unknown;
  try {
    rawClaims = JSON.parse(decoder.decode(fromBase64Url(payloadB64)));
  } catch {
    return { ok: false, reason: "malformed_payload" };
  }
  // A validly-signed JSON `null` or scalar payload (e.g. the literal text
  // "42") parses without throwing but is not an object — guard before
  // reading any field off it.
  if (typeof rawClaims !== "object" || rawClaims === null) {
    return { ok: false, reason: "malformed_payload" };
  }
  // Full runtime shape validation — rejects e.g. presetAllowList as a
  // string (a gateway's `.includes(preset)` would then substring-match) and
  // exp: Infinity (typeof Infinity === 'number' is true; only
  // Number.isFinite catches it — see shape.ts).
  if (!isValidClaimsShape(rawClaims)) {
    return { ok: false, reason: "malformed_payload" };
  }
  const claims = rawClaims;

  let signature: Uint8Array;
  let publicKey: CryptoKey;
  try {
    signature = fromBase64Url(sigB64);
    publicKey = await importPublicKey(publicKeyPem);
  } catch {
    return { ok: false, reason: "invalid_public_key" };
  }

  const signingInput = `${headerB64}.${payloadB64}`;
  let valid: boolean;
  try {
    valid = await getSubtle().verify(
      { name: "Ed25519" },
      publicKey,
      signature as BufferSource,
      new TextEncoder().encode(signingInput) as BufferSource,
    );
  } catch {
    // A malformed signature (wrong length, etc.) can throw rather than
    // return false — either way it is not a valid signature.
    valid = false;
  }
  if (!valid) {
    return { ok: false, reason: "invalid_signature" };
  }

  // isValidClaimsShape already proved claims.exp is a finite number — this
  // is the actual wall-clock comparison.
  if (Math.floor(Date.now() / 1000) >= claims.exp) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, claims };
}
