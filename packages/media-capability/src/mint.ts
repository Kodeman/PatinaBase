import { toBase64Url } from "./base64url";
import { importPrivateKey } from "./keys";
import type { MediaCapabilityClaims } from "./types";

const HEADER = { alg: "EdDSA", typ: "MCAP" } as const;
const REQUIRED_FIELDS = [
  "objectId",
  "version",
  "bucket",
  "key",
  "presetAllowList",
  "exp",
  "aud",
] as const;

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
 */
export async function mintCapability(
  privateKeyPem: string,
  claims: MediaCapabilityClaims,
): Promise<string> {
  if (!claims || typeof claims !== "object") {
    throw new Error("mintCapability: claims is required");
  }
  for (const field of REQUIRED_FIELDS) {
    if (claims[field] === undefined || claims[field] === null) {
      throw new Error(`mintCapability: claims.${field} is required`);
    }
  }

  const payload: MediaCapabilityClaims = {
    ...claims,
    iat: claims.iat ?? Math.floor(Date.now() / 1000),
  };

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
