'use client';

/**
 * useAttachDocumentClient — point the open document at a client (or unlink it)
 * via the set_document_client RPC (00225 → 00385). One act, many surfaces (§5):
 * the RPC flips the proposal's profile + relationship identity (or the
 * project's sole client leg) AND advances the selected relationship status in
 * one transaction; here we invalidate every read model that carries the client
 * identity so the letterhead, Desk folder line, and client mirror move together.
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

export type AttachEngagementKind = 'project' | 'proposal';

export interface AttachClientInput {
  engagementKind: AttachEngagementKind;
  targetId: string; // the project id or proposal id
  clientId: string | null; // profiles.id to link, or null to unlink
}

export function useAttachDocumentClient() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ engagementKind, targetId, clientId }: AttachClientInput) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { error } = await supabase.rpc('set_document_client', {
        p_engagement_kind: engagementKind,
        p_target_id: targetId,
        p_client_id: clientId,
      });
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      // The open document's vitals + client chip, the Desk folder lines, and the
      // client mirror all carry the client identity — refresh them in one act.
      qc.invalidateQueries({ queryKey: ['document-state'] });
      qc.invalidateQueries({ queryKey: ['desk-engagements'] });
      qc.invalidateQueries({ queryKey: ['designer-clients'] });
      qc.invalidateQueries({ queryKey: ['designer-client-for-user'] });
      qc.invalidateQueries({ queryKey: ['designer-client'] });
      if (vars.engagementKind === 'proposal') {
        qc.invalidateQueries({ queryKey: ['proposal'] });
        qc.invalidateQueries({ queryKey: ['proposals'] });
        qc.invalidateQueries({ queryKey: ['proposal-mirror', vars.targetId] });
      } else {
        qc.invalidateQueries({ queryKey: ['project-v2', vars.targetId] });
        qc.invalidateQueries({ queryKey: ['project'] });
        qc.invalidateQueries({ queryKey: ['projects'] });
      }
    },
  });
}
