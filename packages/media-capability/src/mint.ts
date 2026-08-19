import { toBase64Url } from "./base64url";
import { MAX_CAPABILITY_TTL_SECONDS } from "./constants";
import { importPrivateKey } from "./keys";
import { isValidClaimsShape } from "./shape";
import type { MediaCapabilityClaims } from "./types";

const HEADER = { alg: "EdDSA", typ: "MCAP" } as const;

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
 * Mint a compact media capability token: hand-rolled, NOT a JWT library —
 * `base64url(header).base64url(payload).base64url(signature)`, signed with
 * Ed25519 over the ASCII bytes of `header.payload`.
 *
 * Refuses to mint claims that would not round-trip cleanly through
 * verifyCapability's own shape guard (see shape.ts), and enforces temporal
 * sanity beyond plain presence: exp must be a real, finite future instant no
 * more than MAX_CAPABILITY_TTL_SECONDS away, and a caller-supplied iat must
 * not be in the future (a token cannot have been issued before "now").
 */
export async function mintCapability(
  privateKeyPem: string,
  claims: MediaCapabilityClaims,
): Promise<string> {
  if (!isValidClaimsShape(claims)) {
    throw new Error(
      "mintCapability: claims failed shape validation — objectId/bucket/key/aud must be " +
        "non-empty strings, version and exp must be finite numbers, presetAllowList must be " +
        "an array of strings, and iat (if supplied) must be a finite number",
    );
  }

  const now = Math.floor(Date.now() / 1000);

  if (claims.iat !== undefined && claims.iat > now) {
    throw new Error("mintCapability: claims.iat must not be in the future");
  }
  const iat = claims.iat ?? now;

  if (claims.exp <= now) {
    throw new Error("mintCapability: claims.exp must be in the future");
  }
  if (claims.exp - iat > MAX_CAPABILITY_TTL_SECONDS) {
    throw new Error(
      `mintCapability: claims.exp exceeds the maximum capability TTL of ${MAX_CAPABILITY_TTL_SECONDS}s`,
    );
  }

  const payload: MediaCapabilityClaims = { ...claims, iat };

  const encoder = new TextEncoder();
  const headerB64 = toBase64Url(encoder.encode(JSON.stringify(HEADER)));
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;

  const privateKey = await importPrivateKey(privateKeyPem);
  const signature = await getSubtle().sign(
    { name: "Ed25519" },
    privateKey,
    encoder.encode(signingInput),
  );
  const sigB64 = toBase64Url(new Uint8Array(signature));

  return `${signingInput}.${sigB64}`;
}
