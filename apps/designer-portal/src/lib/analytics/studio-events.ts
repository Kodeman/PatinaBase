/**
 * Studio workspace event taxonomy (Studio Workspace Provisioning, Workstream
 * 4). Three events cover the self-serve studio lifecycle behind the
 * `studio-workspaces` flag:
 *   - studio_created       — a designer creates their studio from the
 *                            no-studio empty state (`create_studio_workspace`
 *                            RPC succeeds, AccountStudioPage).
 *   - teammate_invited     — an owner/admin sends a teammate invite via the
 *                            `workspace-member-invite` edge function
 *                            (StudioInviteModal). `teammate_type` is
 *                            'designer' | 'member'; `role` is the membership
 *                            role granted ('member' | 'admin').
 *   - invitation_accepted  — an invited teammate accepts via the emailed link
 *                            (`accept_workspace_invitation` RPC succeeds,
 *                            /auth/accept-invite) just before the redirect to
 *                            /desk.
 *
 * No-ops when PostHog is not initialized (the track() guard) — mirrors
 * procurement-events.ts / document-events.ts.
 */

import posthog from 'posthog-js';
import { isAnalyticsEnabled } from './posthog';

function track(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  posthog.capture(event, properties);
}

export const studioEvents = {
  /** Fired when useCreateOrganization's mutation succeeds. */
  created: () => track('studio_created'),

  /** Fired when useInviteMember's mutation succeeds. */
  teammateInvited: (properties: { teammate_type: string; role: string }) =>
    track('teammate_invited', properties),

  /** Fired when useAcceptInvitation's mutation succeeds, before the redirect
   *  to /desk. */
  invitationAccepted: () => track('invitation_accepted'),
};
