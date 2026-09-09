// Pure decisions for the client-invite legs, split out so they can be tested
// without a Supabase client, a network, or a clock.

import { givenName } from "../_shared/branded-email.ts";
import type { ClientLetterSnapshot } from "../_shared/client-letter.ts";

/** R10: one letter per hour, per invitation. */
export const RESEND_COOLDOWN_MS = 60 * 60 * 1000;

/** R4: optional, trimmed, 280. Trimming precedes the cap. */
export function validateNote(
  raw: string | null | undefined,
): { ok: true; value: string | null } | { ok: false; error: "note_too_long" } {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: true, value: null };
  if (trimmed.length > 280) return { ok: false, error: "note_too_long" };
  return { ok: true, value: trimmed };
}

/** Timing-safe string compare. Length is allowed to leak; the bytes are not. */
function secretEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * `SUPABASE_SECRET_KEYS` is injected by the platform as a JSON dictionary of
 * name -> secret key (verified on Strata: {"default":"sb_secret_…"}). Parsed
 * defensively so a future array, or a comma-separated list, still works.
 */
export function parseSecretKeys(raw: string | null | undefined): string[] {
  const text = (raw ?? "").trim();
  if (!text) return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (v && typeof v === "object") {
      const k = (v as { api_key?: unknown }).api_key;
      if (typeof k === "string" && k.trim()) out.push(k.trim());
    }
  };
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) parsed.forEach(push);
    else if (parsed && typeof parsed === "object") Object.values(parsed).forEach(push);
    else push(parsed);
  } catch {
    text.split(",").forEach((part) => push(part));
  }
  return out;
}

/**
 * The legacy service-role credential is a project-signed HS256 JWT. It is NOT
 * present anywhere in the function's environment once the project has been
 * moved to the new key format, so it cannot be string-compared — but the
 * gateway (verify_jwt = true, config.toml) has already verified its signature
 * against the project before the handler runs; a forged one is turned away
 * upstream with UNAUTHORIZED_LEGACY_JWT and never reaches this code. So the
 * claims can be read at face value, and only the service_role of THIS project,
 * unexpired, is admitted.
 *
 * If verify_jwt is ever set false for this function, this arm must go with it.
 *
 * Requires a known project ref, so a function with no environment at all still
 * fails closed rather than trusting the gateway alone.
 */
function isVerifiedLegacyServiceRoleJwt(token: string, projectRef?: string | null): boolean {
  if (!projectRef) return false;
  const parts = token.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return false;
  let claims: Record<string, unknown>;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, "=")));
  } catch {
    return false;
  }
  if (claims.role !== "service_role") return false;
  if (claims.iss !== "supabase") return false;
  if (claims.ref !== projectRef) return false;
  const exp = claims.exp;
  if (typeof exp !== "number" || exp * 1000 <= Date.now()) return false;
  return true;
}

/**
 * Every leg of this function is called server-to-server by a Next.js route
 * holding the service-role key. The gateway's verify_jwt only proves the bearer
 * is SOME valid token; this proves it is the one principal allowed to name an
 * arbitrary writer and signer.
 *
 * A project carries TWO shapes of that one principal at once during Supabase's
 * key-format migration: the new `sb_secret_…` key (what the platform now
 * injects as SUPABASE_SERVICE_ROLE_KEY, and what SUPABASE_SECRET_KEYS lists)
 * and the legacy service-role JWT (what long-lived callers still hold). Both
 * are the service role; only one of them can be string-equal to the env value,
 * which is why an exact compare alone started returning 401 the moment Strata's
 * injected key changed shape.
 */
export function isServiceRoleCaller(
  authorizationHeader: string | null,
  serviceRoleKey: string,
  secretKeys?: string | null,
  projectRef?: string | null,
): boolean {
  const token = (authorizationHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  if (serviceRoleKey && secretEquals(token, serviceRoleKey)) return true;
  for (const key of parseSecretKeys(secretKeys)) {
    if (secretEquals(token, key)) return true;
  }
  return isVerifiedLegacyServiceRoleJwt(token, projectRef);
}

export interface TokenRow {
  accepted_at: string | null;
  revoked_at: string | null;
  expires_at: string;
}

export type TokenVerdict =
  | { ok: true }
  | { ok: false; error: string; status: number };

/**
 * Order matters and is deliberate: revoked, then accepted, then expired. A
 * letter she already used is not a letter that lapsed, and the lapsed page
 * offers a resend she does not need.
 */
export function validateToken(row: TokenRow | null, now = Date.now()): TokenVerdict {
  if (!row) return { ok: false, error: "not_found", status: 404 };
  if (row.revoked_at) return { ok: false, error: "revoked", status: 403 };
  if (row.accepted_at) return { ok: false, error: "already_accepted", status: 409 };
  if (new Date(row.expires_at).getTime() < now) {
    return { ok: false, error: "expired", status: 410 };
  }
  return { ok: true };
}

/**
 * R13 — a notice has no expiry line and nothing to accept; there is nothing
 * for "Write again" to refresh. Checked before the cooldown so a stale
 * notice reads as "nothing to resend", not as a wait timer that never ends.
 */
export function resendEligibility(
  kind: "invite" | "notice",
): { ok: true } | { ok: false; error: "nothing_to_resend"; status: number } {
  if (kind === "notice") return { ok: false, error: "nothing_to_resend", status: 409 };
  return { ok: true };
}

export function resendCooldownRemainingMs(
  lastSentAt: string | null,
  now = Date.now(),
): number {
  if (!lastSentAt) return 0;
  const elapsed = now - new Date(lastSentAt).getTime();
  return elapsed >= RESEND_COOLDOWN_MS ? 0 : RESEND_COOLDOWN_MS - elapsed;
}

export interface SnapshotInput {
  kind: "invite" | "notice";
  email: string;
  clientName: string | null;
  /** R11: the STUDIO OWNER's full name. The writer's words, the owner's name. */
  signerFullName: string;
  studioName: string | null;
  studioLogoUrl: string | null;
  signatureCity: string | null;
  projectName: string | null;
  note: string | null;
  sentAt: string;
  expiresAt: string;
  ctaUrl: string;
}

/** The one place the letter's facts are assembled. Everything downstream reads
 *  this object and never a live table. */
export function buildSnapshot(input: SnapshotInput): ClientLetterSnapshot {
  return {
    kind: input.kind,
    recipientEmail: input.email,
    recipientName: input.clientName?.trim() || null,
    designerFullName: input.signerFullName,
    designerGivenName: givenName(input.signerFullName),
    studioName: input.studioName?.trim() || null,
    studioLogoUrl: input.studioLogoUrl?.trim() || null,
    signatureCity: input.signatureCity?.trim() || null,
    projectName: input.projectName?.trim() || null,
    personalMessage: input.note?.trim() || null,
    sentAt: input.sentAt,
    expiresAt: input.expiresAt,
    ctaUrl: input.ctaUrl,
  };
}

export function generateToken(): string {
  return `${crypto.randomUUID()}${crypto.randomUUID()}`.replace(/-/g, "");
}
