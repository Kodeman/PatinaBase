import {
  generateCapabilityKeyPair,
  mintCapability,
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
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const claims = baseClaims({
      objectId: "obj-expired",
      exp: Math.floor(Date.now() / 1000) - 10,
    });

    const token = await mintCapability(privateKeyPem, claims);
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

    // Flip one base64url character in the payload segment. Still valid
    // alphabet, so it decodes to bytes — but the signature was computed
    // over the ORIGINAL payload and can no longer match.
    const flipIndex = 0;
    const original = payload[flipIndex];
    const replacement = original === "A" ? "B" : "A";
    const tamperedPayload = replacement + payload.slice(flipIndex + 1);
    const tamperedToken = `${header}.${tamperedPayload}.${signature}`;

    expect(tamperedToken).not.toBe(token);

    const result = await verifyCapability(publicKeyPem, tamperedToken);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    // Depending on the flipped byte, tampering either breaks JSON parsing
    // outright or produces a still-parseable payload with a now-invalid
    // signature — both are refusals, neither is acceptance.
    expect(["invalid_signature", "malformed_payload"]).toContain(result.reason);
  });

  it("wrong-audience: verifyCapability does not enforce aud — the caller must check it", async () => {
    const { privateKeyPem, publicKeyPem } = await generateCapabilityKeyPair();
    const claims = baseClaims({ objectId: "obj-aud", aud: "orders-svc" });

    const token = await mintCapability(privateKeyPem, claims);
    const result = await verifyCapability(publicKeyPem, token);

    // Signature and expiry are both fine — verifyCapability accepts it.
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("unreachable");

    // The token was minted for 'orders-svc'. A caller expecting a different
    // audience ('projects-svc') must reject it itself; verifyCapability's
    // contract has no expected-audience parameter to do that for them.
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
    ).rejects.toThrow(/claims\.bucket/);
  });
});
