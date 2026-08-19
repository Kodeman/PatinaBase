import { fromBase64Url } from "./base64url";
import { importPublicKey } from "./keys";
import type { MediaCapabilityClaims, VerifyCapabilityResult } from "./types";

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
  if (typeof token !== "string" || token.length === 0) {
    return { ok: false, reason: "malformed_token" };
  }

  const parts = token.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "malformed_token" };
  }
  const [headerB64, payloadB64, sigB64] = parts;

  const decoder = new TextDecoder();

  let header: unknown;
  try {
    header = JSON.parse(decoder.decode(fromBase64Url(headerB64)));
  } catch {
    return { ok: false, reason: "malformed_header" };
  }
  if (
    typeof header !== "object" ||
    header === null ||
    (header as Record<string, unknown>).alg !== "EdDSA"
  ) {
    return { ok: false, reason: "unsupported_alg" };
  }

  let claims: MediaCapabilityClaims;
  try {
    claims = JSON.parse(
      decoder.decode(fromBase64Url(payloadB64)),
    ) as MediaCapabilityClaims;
  } catch {
    return { ok: false, reason: "malformed_payload" };
  }

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

  if (
    typeof claims.exp !== "number" ||
    Math.floor(Date.now() / 1000) >= claims.exp
  ) {
    return { ok: false, reason: "expired" };
  }

  return { ok: true, claims };
}
