import {
  fromBase64Url,
  generateCapabilityKeyPair,
  importPrivateKey,
  MAX_CAPABILITY_TTL_SECONDS,
  mintCapability,
  toBase64Url,
  verifyCapability,
} from "./index";
import type { MediaCapabilityClaims } from "./types";

function baseClaims(
  overrides: Partial<MediaCapabilityClaims> = {},
): MediaCapabilityClaims {
  return {
    objectId: "obj-0000",
    version: 1,
    bucket: "patina-processed",
    key: "projects/p1/renders/hero.jpg",
    presetAllowList: ["thumb", "hero"],
    exp: Math.floor(Date.now() / 1000) + 300,
    aud: "media-svc",
    ...overrides,
  };
}

function getSubtle(): SubtleCrypto {
  return (globalThis as { crypto: Crypto }).crypto.subtle;
}

/**
 * Signs an arbitrary header/payload JSON text pair with a REAL private key,
 * bypassing mintCapability's own input validation entirely. Used only to
 * construct adversarial-but-validly-signed tokens that prove verifyCapability
 * defends itself independent of what a well-behaved mint call would ever
 * produce (e.g. a payload whose raw JSON text is `1e999`, which
 * JSON.stringify(Infinity) could never produce, but a hand-crafted payload
 * can).
 */
async function signRawToken(
  privateKeyPem: string,
  headerJson: string,
  payloadJson: string,
): Promise<string> {
  const encoder = new TextEncoder();
  const headerB64 = toBase64Url(encoder.encode(headerJson));
  const payloadB64 = toBase64Url(encoder.encode(payloadJson));
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

const MCAP_HEADER_JSON = JSON.stringify({ alg: "EdDSA", typ: "MCAP" });

describe("@patina/media-capability", () => {
  it("round-trips: a token minted with a private key verifies with its matching public key", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const claims = baseClaims({ objectId: "obj-round-trip" });

    const token = await mintCapability(privateKeyPem, claims);
    expect(token.split(".")).toHaveLength(3);

    const result = await verifyCapability(publicKeyPem, token);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    expect(result.claims.objectId).toBe("obj-round-trip");
    expect(result.claims.version).toBe(1);
    expect(result.claims.bucket).toBe("patina-processed");
    expect(result.claims.key).toBe("projects/p1/renders/hero.jpg");
    expect(result.claims.presetAllowList).toEqual(["thumb", "hero"]);
    expect(result.claims.aud).toBe("media-svc");
    expect(typeof result.claims.iat).toBe("number");
  });

  it("expiry: refuses a token whose exp has already passed", async () => {
    // mintCapability now refuses a past exp outright (see the dedicated
    // C-4 test below) — an already-expired token is signed directly here to
    // isolate verifyCapability's OWN expiry enforcement from mint's input
    // validation, which is a separate, separately-tested concern.
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      ...baseClaims({ objectId: "obj-expired" }),
      exp: now - 10,
      iat: now - 20,
    };
    const token = await signRawToken(
      privateKeyPem,
      MCAP_HEADER_JSON,
      JSON.stringify(payload),
    );

    const result = await verifyCapability(publicKeyPem, token);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("expired");
  });

  it("wrong-key: refuses a token verified against a public key that did not mint it", async () => {
    const minter = await generateCapabilityKeyPair();
    const impostor = await generateCapabilityKeyPair();
    const claims = baseClaims({ objectId: "obj-wrong-key" });

    const token = await mintCapability(minter.privateKeyPem, claims);
    const result = await verifyCapability(impostor.publicKeyPem, token);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("invalid_signature");
  });

  it("tampered-payload: refuses a token whose payload segment was altered after signing", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const claims = baseClaims({ objectId: "obj-tampered" });

    const token = await mintCapability(privateKeyPem, claims);
    const [header, payload, signature] = token.split(".");

    const flipIndex = 0;
    const original = payload[flipIndex];
    const replacement = original === "A" ? "B" : "A";
    const tamperedPayload = replacement + payload.slice(flipIndex + 1);
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    expect(tamperedToken).not.toBe(token);

    const result = await verifyCapability(publicKeyPem, tamperedToken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(["invalid_signature", "malformed_payload"]).toContain(result.reason);
  });

  it("wrong-audience: verifyCapability does not enforce aud — the caller must check it", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const claims = baseClaims({ objectId: "obj-aud", aud: "orders-svc" });

    const token = await mintCapability(privateKeyPem, claims);
    const result = await verifyCapability(publicKeyPem, token);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    const expectedAud = "projects-svc";
    expect(result.claims.aud).toBe("orders-svc");
    expect(result.claims.aud).not.toBe(expectedAud);
  });

  it("rejects a structurally malformed token", async () => {
    const { publicKeyPem } = await generateCapabilityKeyPair();
    const result = await verifyCapability(
      publicKeyPem,
      "not-a-capability-token",
    );
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("malformed_token");
  });

  it("mintCapability refuses claims missing a required field", async () => {
    const { privateKeyPem } = await generateCapabilityKeyPair();
    const incomplete = { ...baseClaims() } as Partial<MediaCapabilityClaims>;
    delete incomplete.bucket;

    await expect(
      mintCapability(privateKeyPem, incomplete as MediaCapabilityClaims),
    ).rejects.toThrow(/shape validation/);
  });

  // ── C-1: typ pinning ───────────────────────────────────────────────────
  it("C-1: a JWT-shaped header (same alg, typ: JWT) carrying attacker-chosen claims is rejected", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const headerJson = JSON.stringify({ alg: "EdDSA", typ: "JWT" });
    const payloadJson = JSON.stringify({
      ...baseClaims({
        objectId: "obj-jwt-shaped",
        bucket: "attacker-bucket",
        key: "attacker/key",
      }),
      iat: now,
    });
    const token = await signRawToken(privateKeyPem, headerJson, payloadJson);

    const result = await verifyCapability(publicKeyPem, token);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("unsupported_typ");
  });

  // ── C-4: exp must be a real, bounded, finite instant ─────────────────────
  it("C-4: exp:1e999 (parses to Infinity in this runtime) is rejected, not treated as never-expiring", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const now = Math.floor(Date.now() / 1000);
    // JSON.stringify(Infinity) would render "null" (invisible in logs) — the
    // real vector is the raw literal `1e999` in the wire payload, which
    // JSON.parse legitimately overflows to Infinity.
    const payloadJson =
      '{"objectId":"obj-inf","version":1,"bucket":"b","key":"k","presetAllowList":[],' +
      `"exp":1e999,"aud":"media-svc","iat":${now}}`;
    expect(JSON.parse(payloadJson).exp).toBe(Infinity); // sanity: the runtime really does this

    const token = await signRawToken(
      privateKeyPem,
      MCAP_HEADER_JSON,
      payloadJson,
    );
    const result = await verifyCapability(publicKeyPem, token);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("malformed_payload");
  });

  it("C-4: mintCapability refuses an exp beyond the maximum capability TTL", async () => {
    const { privateKeyPem } = await generateCapabilityKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const claims = baseClaims({
      objectId: "obj-over-ttl",
      exp: now + MAX_CAPABILITY_TTL_SECONDS + 3600,
    });
    await expect(mintCapability(privateKeyPem, claims)).rejects.toThrow(
      /maximum capability TTL/,
    );
  });

  it("C-4: mintCapability refuses an exp that is already in the past", async () => {
    const { privateKeyPem } = await generateCapabilityKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const claims = baseClaims({ objectId: "obj-past-exp", exp: now - 10 });
    await expect(mintCapability(privateKeyPem, claims)).rejects.toThrow(
      /exp must be in the future/,
    );
  });

  it("C-4: mintCapability refuses a caller-supplied iat in the future", async () => {
    const { privateKeyPem } = await generateCapabilityKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const claims = baseClaims({
      objectId: "obj-future-iat",
      iat: now + 600,
      exp: now + 900,
    });
    await expect(mintCapability(privateKeyPem, claims)).rejects.toThrow(
      /iat must not be in the future/,
    );
  });

  // ── C-3: claims shape is validated, not blindly cast ─────────────────────
  it("C-3: mintCapability refuses a non-array presetAllowList", async () => {
    const { privateKeyPem } = await generateCapabilityKeyPair();
    const claims = {
      ...baseClaims({ objectId: "obj-string-presets-mint" }),
      presetAllowList: "thumb",
    } as unknown as MediaCapabilityClaims;

    await expect(mintCapability(privateKeyPem, claims)).rejects.toThrow(
      /shape validation/,
    );
  });

  it("C-3: verifyCapability refuses a non-array presetAllowList at the wire level (a gateway .includes() would substring-match)", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const now = Math.floor(Date.now() / 1000);
    const payloadJson = JSON.stringify({
      objectId: "obj-string-presets-verify",
      version: 1,
      bucket: "b",
      key: "k",
      presetAllowList: "thumb", // STRING, not an array — .includes('t') would match
      exp: now + 300,
      aud: "media-svc",
      iat: now,
    });
    const token = await signRawToken(
      privateKeyPem,
      MCAP_HEADER_JSON,
      payloadJson,
    );

    const result = await verifyCapability(publicKeyPem, token);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("malformed_payload");
  });

  // ── C-2: canonical base64url only ─────────────────────────────────────────
  it("C-2: a non-canonical base64url variant of a valid signature (same bytes, different trailing bits) is rejected", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const token = await mintCapability(
      privateKeyPem,
      baseClaims({ objectId: "obj-canonical" }),
    );
    const [header, payload, sig] = token.split(".");

    const trueBytes = fromBase64Url(sig);
    const alphabet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    let variant: string | null = null;
    for (const ch of alphabet) {
      if (ch === sig[sig.length - 1]) continue;
      const candidate = sig.slice(0, -1) + ch;
      let candidateBytes: Uint8Array;
      try {
        candidateBytes = fromBase64Url(candidate);
      } catch {
        continue;
      }
      if (
        candidateBytes.length === trueBytes.length &&
        candidateBytes.every((b, i) => b === trueBytes[i])
      ) {
        variant = candidate;
        break;
      }
    }

    // Self-check: Ed25519 signatures are a fixed 64 bytes (= 21*3 + 1), which
    // always leaves a 1-byte remainder — a wasted-bit variant always exists.
    // If this ever failed, the test below would be proving nothing.
    expect(variant).not.toBeNull();
    expect(variant).not.toBe(sig);

    const tamperedToken = `${header}.${payload}.${variant}`;
    const result = await verifyCapability(publicKeyPem, tamperedToken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("non_canonical_encoding");
  });

  it("C-2: a padded segment is rejected (canonical tokens are never padded)", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const token = await mintCapability(
      privateKeyPem,
      baseClaims({ objectId: "obj-padded" }),
    );
    const [header, payload, sig] = token.split(".");

    const paddedPayload = `${payload}==`;
    const paddedToken = `${header}.${paddedPayload}.${sig}`;

    const result = await verifyCapability(publicKeyPem, paddedToken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("non_canonical_encoding");
  });

  // ── C-6: length cap before any parsing ────────────────────────────────────
  it("C-6: an oversized token is rejected before any base64/JSON/crypto work", async () => {
    const { publicKeyPem } = await generateCapabilityKeyPair();
    const huge = `${"a".repeat(5000)}.${"b".repeat(5000)}.${"c".repeat(5000)}`;

    const start = Date.now();
    const result = await verifyCapability(publicKeyPem, huge);
    const elapsedMs = Date.now() - start;

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("token_too_large");
    expect(elapsedMs).toBeLessThan(50);
  });

  // ── C-5: a valid signature over non-object JSON must not throw ───────────
  it("C-5: a validly-signed JSON null payload is refused, not thrown", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const token = await signRawToken(privateKeyPem, MCAP_HEADER_JSON, "null");

    await expect(verifyCapability(publicKeyPem, token)).resolves.toEqual({
      ok: false,
      reason: "malformed_payload",
    });
  });

  it("C-5: a validly-signed JSON scalar payload is refused, not thrown", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const token = await signRawToken(privateKeyPem, MCAP_HEADER_JSON, "42");

    await expect(verifyCapability(publicKeyPem, token)).resolves.toEqual({
      ok: false,
      reason: "malformed_payload",
    });
  });
});
