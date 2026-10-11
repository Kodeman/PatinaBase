'use client';

/**
 * US-25 Q11 — who is acting, read against the job's active lead.
 *
 * The lead and the studio's owner or admin send from an act sheet. Any other
 * member sends nothing outward: a PO chase is saved as a held draft for the
 * lead, and an invoice reminder or a proposal follow-up is shown read-only
 * (SQ-746 ruling (b): the draft store holds no invoice or proposal kind). A job
 * with no active lead is sent from only by the job's designer, the same
 * fallback the Desk's Mine reads (desk-scope.ts), or by the owner or admin
 * (SQ-751 F1).
 *
 * `ready` stays false until the viewer, the studio's members and the job's
 * lead (or, with no lead, its designer) are all read, so no send control prints
 * on a guess. `recheck` reads the job's lead again at the send boundary, so a
 * reassignment since the sheet opened stops the send (SQ-751 F2).
 */

import {
  useOrganizationMembers,
  useOrganizations,
  useProjectLeads,
  type ProjectLead,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { useDocumentEngagement } from '@/hooks/use-document-state';
import { firstNameOf } from '@/lib/document/account-identity';

export interface ActViewer {
  ready: boolean;
  /** The lead and the owner or admin send; everyone else does not. */
  canSend: boolean;
  /** The job's active lead's first name, when another member leads it. */
  leadFirstName: string | null;
  /** The owner's line to this member on her invite (L8), with its writer. */
  handoff: { from: string | null; note: string } | null;
  /** Reads the job's lead again and answers whether she may still send. */
  recheck?: () => Promise<boolean>;
}

/** Q11 with the F1 fallback: the active lead sends; with no lead, the job's
 *  designer; the owner or admin always. */
export function mayActSend({
  lead,
  meUserId,
  role,
  designerId,
}: {
  lead: Pick<ProjectLead, 'leadUserId'> | undefined;
  meUserId: string | null | undefined;
  role: string | null | undefined;
  designerId: string | null | undefined;
}): boolean {
  if (!meUserId) return false;
  if (role === 'owner' || role === 'admin') return true;
  if (lead) return lead.leadUserId === meUserId;
  return Boolean(designerId) && designerId === meUserId;
}

export function useActViewer(projectId: string | null): ActViewer {
  const { user } = useAuth();
  const { data: orgs } = useOrganizations();
  const studio = orgs?.find((o) => o.type === 'design_studio') ?? orgs?.[0] ?? null;
  const members = useOrganizationMembers(studio?.id ?? '');
  const leads = useProjectLeads(studio?.id ?? '');
  // The job's designer, for a job no one leads yet: the document_state row the
  // Desk's Mine reads it from (deskDesignersOf).
  const engagement = useDocumentEngagement(projectId ?? '');

  const me = members.data?.find((m) => m.user_id === user?.id) ?? null;
  const lead = projectId ? leads.data?.get(projectId) : undefined;
  const designerId =
    engagement.data?.kind === 'engagement' ? engagement.data.row.designer_id : null;
  const authority = me?.role === 'owner' || me?.role === 'admin';
  const ready =
    Boolean(user?.id) &&
    members.isSuccess &&
    leads.isSuccess &&
    (Boolean(lead) || authority || engagement.isSuccess);
  const isLead = lead ? lead.leadUserId === user?.id : Boolean(designerId) && designerId === user?.id;
  const canSend =
    ready && mayActSend({ lead, meUserId: user?.id, role: me?.role, designerId });
  const note = me?.handoff_note?.trim();
  const writer = me?.invited_by
    ? members.data?.find((m) => m.user_id === me.invited_by)
    : undefined;

  const recheck = async (): Promise<boolean> => {
    const fresh = await leads.refetch();
    if (fresh.isError || !fresh.data) {
      throw new Error('Who leads this project could not be confirmed, so nothing was sent. Try again.');
    }
    return mayActSend({
      lead: projectId ? fresh.data.get(projectId) : undefined,
      meUserId: user?.id,
      role: me?.role,
      designerId,
    });
  };

  return {
    ready,
    canSend,
    leadFirstName: lead && !isLead ? (nameOf(lead.leadName) ?? 'the lead') : null,
    handoff: note
      ? { from: nameOf(writer?.profiles?.full_name || writer?.profiles?.display_name), note }
      : null,
    recheck,
  };
}

const nameOf = (name: string | null | undefined): string | null =>
  name?.trim() ? firstNameOf(name) : null;
