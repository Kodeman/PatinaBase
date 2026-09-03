// workspace-member-invite — the pure response-contract helpers, extracted so
// they can be tested without booting index.ts's `Deno.serve`.

/** Fate of the invite email, once the membership row is already committed. */
export type InviteEmailStatus = "sent" | "suppressed" | "failed";

export interface InviteEmailOutcome {
  email_status: InviteEmailStatus;
  /** Present only when email_status === 'failed'. */
  email_error?: string;
}

/** The branded template row is missing — nothing was handed to the provider. */
export const TEMPLATE_MISSING_OUTCOME: InviteEmailOutcome = {
  email_status: "failed",
  email_error: "template_missing",
};

/**
 * Map a sendCompliantEmail result onto the invite response contract.
 *
 * Suppression is not a failure: the recipient is on the durable
 * bounce/complaint list, the membership stands, and there is nothing for the
 * caller to retry.
 */
export function inviteEmailOutcome(
  result: { success: boolean; suppressed?: boolean; error?: string },
): InviteEmailOutcome {
  if (result.suppressed) return { email_status: "suppressed" };
  if (!result.success) {
    return { email_status: "failed", email_error: "send_failed" };
  }
  return { email_status: "sent" };
}

// ── Actor resolution (00556: platform-admin bypass) ─────────────────────────
// The invite path used to be studio-only: an active owner/admin membership in
// the target organization or nothing. The admin portal's studio roster invites
// through this same function, so a platform admin (roles.domain = 'admin') is
// now a second, equally authoritative actor.

/** Who is doing the inviting, or null when nobody is authorized. */
export type InviteActorKind = "org_admin" | "platform_admin";

export interface InviteActorInput {
  /** The caller's ACTIVE owner/admin membership row in the target org, if any. */
  membership: unknown;
  /** True when the caller holds any admin-domain role. */
  isPlatformAdmin: boolean;
}

/**
 * An org owner/admin outranks the platform label: when a caller is both, the
 * invite is attributed to the studio, so the email keeps naming a real person.
 * index.ts only computes isPlatformAdmin when the caller has NO membership, so
 * the "both" case is defensive — it exists for direct callers of this helper.
 */
export function resolveInviteActor(
  { membership, isPlatformAdmin }: InviteActorInput,
): InviteActorKind | null {
  if (membership) return "org_admin";
  if (isPlatformAdmin) return "platform_admin";
  return null;
}

/** Only an active organization can take new invites. */
export function isInvitableOrgStatus(status: string | null | undefined): boolean {
  return status === "active";
}

// ── Handoff note (L8: owner's line for the new hire's first day) ───────────

/** Matches the 00560 CHECK on organization_members.handoff_note. */
export const HANDOFF_NOTE_MAX_LENGTH = 280;

/**
 * Trim a raw handoff-note input and validate its length. Returns `undefined`
 * for empty/whitespace-only input (nothing to write — an unconditional write
 * would NULL out an existing note on the re-invite refresh path), or `null`
 * when the trimmed note exceeds the 280-char cap (caller responds 400).
 */
export function normalizeHandoffNote(
  raw: string | undefined,
): string | undefined | null {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > HANDOFF_NOTE_MAX_LENGTH) return null;
  return trimmed;
}
