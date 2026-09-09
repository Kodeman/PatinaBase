'use client';

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export type ClientInvitationState = 'sent' | 'opened' | 'accepted' | 'lapsed';

export interface ClientInvitationStatus {
  state: ClientInvitationState;
  /** When the state happened. Never a duration — the row prints a date. */
  at: string | null;
  invitationId: string;
}

/** The raw row shape returned by the SQL function (00581) — snake_case. */
interface ClientInvitationStatusRow {
  state: ClientInvitationState;
  at: string | null;
  invitation_id: string;
}

export const clientInvitationStatusKeys = {
  all: ['client-invitation-status'] as const,
  one: (id: string) => ['client-invitation-status', id] as const,
};

/**
 * The one read a designer needs to see her own letter's state (00581).
 *
 * It goes through a SECURITY DEFINER RPC rather than a client-side join
 * because notification_log's policies are ADDRESSEE-scoped — 00562 grants the
 * opened-mark to the person the mail was addressed TO, not to the studio that
 * sent it — so a join under the designer's own JWT would silently answer
 * nothing. The function is scoped to the caller's own invitations.
 *
 * Returns null when no letter has ever been written for this household. That is
 * a real state with its own copy, not an error.
 */
export function useClientInvitationStatus(designerClientId: string | undefined) {
  return useQuery({
    queryKey: clientInvitationStatusKeys.one(designerClientId ?? ''),
    queryFn: async (): Promise<ClientInvitationStatus | null> => {
      const supabase = getSupabase();
      const { data, error } = await supabase.rpc('client_invitation_status', {
        p_designer_client_id: designerClientId as string,
      });
      if (error) throw error;
      const row = (data as ClientInvitationStatusRow[] | null)?.[0];
      if (!row) return null;
      return { state: row.state, at: row.at, invitationId: row.invitation_id };
    },
    enabled: !!designerClientId,
  });
}
