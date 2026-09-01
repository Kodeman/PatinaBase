/**
 * Shared invite-flow helpers for the Studio account page and its
 * StudioInviteModal — an invited-member row's "is this stale" derivation and
 * the workspace-member-invite edge function's error-code → friendly-copy map,
 * used by both the initial send and the roster's "Resend invite" action so
 * they read one error the same way.
 */

import type { MemberRole } from '@patina/supabase';

/** Roles the workspace-member-invite edge function accepts on an invite/resend. */
export type InvitableRole = Extract<MemberRole, 'admin' | 'member' | 'guest'>;

/**
 * Clamp a membership row's role to a role the invite edge function actually
 * accepts. A roster resend reads `role` off the existing membership row
 * (`OrganizationMemberWithProfile.role: MemberRole`, which includes
 * `'owner'`) — the edge function rejects `member_role: 'owner'` outright, so
 * this guards a resend from ever attempting to send one. In practice an
 * `invited` row is never `owner` (ownership only ever exists on an `active`
 * row), but the type doesn't guarantee it, so this clamps defensively rather
 * than trusting that invariant.
 */
export function clampInvitableRole(role: MemberRole): InvitableRole {
  return role === 'admin' || role === 'guest' ? role : 'member';
}

/**
 * Friendly copy for the invite edge function's error codes. Accepts either a
 * thrown Error or a raw `email_error` code string (workspace-member-invite's
 * `lib.ts` sets `email_error: "send_failed"` / `"template_missing"` verbatim
 * on the 200 response — those are internal codes, never meant to reach a
 * designer as prose).
 */
export function friendlyInviteError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  if (msg.includes('already_member'))
    return 'That person is already part of this studio.';
  if (msg.startsWith('send_failed'))
    return 'The invite email failed to send. Try sending it again.';
  if (msg.startsWith('template_missing'))
    return 'The invite email template is temporarily unavailable. Try again in a moment.';
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
