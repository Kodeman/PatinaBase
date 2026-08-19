import type { MediaCapabilityClaims } from "./types";

/**
 * Runtime shape guard for MediaCapabilityClaims, used by BOTH mint and
 * verify:
 *
 *   - mint: a caller cannot mint a token whose claims won't survive the
 *     round trip verifyCapability expects (e.g. presetAllowList passed as a
 *     string instead of an array).
 *   - verify: a validly-signed but wrongly-typed payload is refused before
 *     any field is handed to a caller. Without this, presetAllowList as a
 *     string round-trips through JSON fine, and a gateway doing
 *     `claims.presetAllowList.includes(preset)` on a STRING performs a
 *     substring match instead of an exact element match — e.g.
 *     `'thumbnail'.includes('thumb')` is true, silently widening what a
 *     capability grants.
 *
 * Deliberately does NOT accept `exp: Infinity` — `typeof Infinity ===
 * 'number'` is true, so a plain typeof check alone lets a non-expiring
 * token through; Number.isFinite closes that.
 */
export function isValidClaimsShape(
  value: unknown,
): value is MediaCapabilityClaims {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const v = value as Record<string, unknown>;

  if (typeof v.objectId !== "string" || v.objectId.length === 0) return false;
  if (typeof v.bucket !== "string" || v.bucket.length === 0) return false;
  if (typeof v.key !== "string" || v.key.length === 0) return false;
  if (typeof v.aud !== "string" || v.aud.length === 0) return false;

  if (typeof v.version !== "number" || !Number.isFinite(v.version))
    return false;

  if (!Array.isArray(v.presetAllowList)) return false;
  if (!v.presetAllowList.every((preset) => typeof preset === "string"))
    return false;

  if (typeof v.exp !== "number" || !Number.isFinite(v.exp)) return false;

  if (
    v.iat !== undefined &&
    (typeof v.iat !== "number" || !Number.isFinite(v.iat))
  ) {
    return false;
  }

  return true;
}
