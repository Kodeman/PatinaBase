/**
 * Shared invite-flow helpers for the Studio account page and its
 * StudioInviteModal — an invited-member row's "is this stale" derivation and
 * the workspace-member-invite edge function's error-code → friendly-copy map,
 * used by both the initial send and the roster's "Resend invite" action so
 * they read one error the same way.
 */

/** Friendly copy for the invite edge function's error codes. */
export function friendlyInviteError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (msg.includes('already_member'))
    return 'That person is already part of this studio.';
  return msg || 'Failed to send the invite.';
}

/**
 * An `invited` member row whose `invitation_expires_at` has already passed —
 * distinct from a fresh, still-live invite. Only meaningful for `status ===
 * 'invited'`; an active member is never "expired".
 */
export function isInviteExpired(
  member: { status: string; invitation_expires_at?: string | null },
  now: Date = new Date(),
): boolean {
  if (member.status !== 'invited' || !member.invitation_expires_at) return false;
  return new Date(member.invitation_expires_at).getTime() < now.getTime();
}
