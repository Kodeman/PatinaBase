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

/**
 * Every leg of this function is called server-to-server by a Next.js route
 * holding the service-role key. The gateway's verify_jwt only proves the bearer
 * is SOME valid token; this proves it is the one principal allowed to name an
 * arbitrary writer and signer.
 */
export function isServiceRoleCaller(
  authorizationHeader: string | null,
  serviceRoleKey: string,
): boolean {
  if (!serviceRoleKey) return false;
  const token = (authorizationHeader ?? "").replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === serviceRoleKey;
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
