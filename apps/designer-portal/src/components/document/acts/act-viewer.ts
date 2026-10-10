'use client';

/**
 * US-25 Q11 — who is acting, read against the job's active lead.
 *
 * The lead and the studio's owner send from an act sheet. Any other member
 * sends nothing outward: a PO chase is saved as a held draft for the lead, and
 * an invoice reminder or a proposal follow-up is shown read-only (SQ-746
 * ruling (b): the draft store holds no invoice or proposal kind). A job with
 * no active lead has no one to hand to, so its viewer acts as the lead.
 *
 * `ready` stays false until the viewer, the studio's members and the job's
 * lead are all read, so no send control prints on a guess.
 */

import {
  useOrganizationMembers,
  useOrganizations,
  useProjectLeads,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { firstNameOf } from '@/lib/document/account-identity';

export interface ActViewer {
  ready: boolean;
  /** The lead and the owner send; everyone else does not. */
  canSend: boolean;
  /** The job's active lead's first name, when another member leads it. */
  leadFirstName: string | null;
  /** The owner's line to this member on her invite (L8), with its writer. */
  handoff: { from: string | null; note: string } | null;
}

export function useActViewer(projectId: string | null): ActViewer {
  const { user } = useAuth();
  const { data: orgs } = useOrganizations();
  const studio = orgs?.find((o) => o.type === 'design_studio') ?? orgs?.[0] ?? null;
  const members = useOrganizationMembers(studio?.id ?? '');
  const leads = useProjectLeads(studio?.id ?? '');

  const ready = Boolean(user?.id) && members.isSuccess && leads.isSuccess;
  const me = members.data?.find((m) => m.user_id === user?.id) ?? null;
  const lead = projectId ? leads.data?.get(projectId) : undefined;
  const isLead = !lead || lead.leadUserId === user?.id;
  const canSend = ready && (isLead || me?.role === 'owner');
  const note = me?.handoff_note?.trim();
  const writer = me?.invited_by
    ? members.data?.find((m) => m.user_id === me.invited_by)
    : undefined;

  return {
    ready,
    canSend,
    leadFirstName: lead && !isLead ? (nameOf(lead.leadName) ?? 'the lead') : null,
    handoff: note
      ? { from: nameOf(writer?.profiles?.full_name || writer?.profiles?.display_name), note }
      : null,
  };
}

const nameOf = (name: string | null | undefined): string | null =>
  name?.trim() ? firstNameOf(name) : null;
