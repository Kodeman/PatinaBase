import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// LINK A CLIENT — US-36 K5 (migration 00796, repaired per SQ-1066)
//
//   document_client_link_hold  why the signed-in user may not link a client to
//                              this project through set_document_client, or
//                              NULL when she may. One read backs both hooks
//                              below, on one key.
//   can_link_document_client   the same answer as a boolean (hold IS NULL).
//
// Holds:
//   'not_permitted'       she is neither the project's lead nor an owner/admin
//                         of its studio (or the project is unknown).
//   'lead_not_in_studio'  she has that standing, but the lead holds no active
//                         non-guest seat in the project's studio (inactive,
//                         guest or removed). set_document_client refuses it
//                         up front: 'set_document_client: lead_not_in_studio'.
//                         reassign_project_lead refuses this project too (it
//                         needs the outgoing lead's active seat), so it is not
//                         the way out.
//
// Anything that changes the lead, the project's studio or the client
// invalidates documentClientAuthorityKeys.canLink(projectId).
// ═══════════════════════════════════════════════════════════════════════════

export type DocumentClientLinkHold = 'not_permitted' | 'lead_not_in_studio';

export const documentClientAuthorityKeys = {
  all: ['document-client-authority'] as const,
  canLink: (projectId: string) =>
    [...documentClientAuthorityKeys.all, 'can-link', projectId] as const,
};

function useDocumentClientLinkQuery<T>(
  projectId: string | null | undefined,
  select: (hold: DocumentClientLinkHold | null) => T,
) {
  return useQuery({
    queryKey: documentClientAuthorityKeys.canLink(projectId ?? ''),
    queryFn: async (): Promise<DocumentClientLinkHold | null> => {
      const { data, error } = await getSupabase().rpc('document_client_link_hold', {
        p_project_id: projectId as string,
      });
      if (error) throw error;
      return (data as DocumentClientLinkHold | null) ?? null;
    },
    select,
    enabled: !!projectId,
  });
}

/** Whether the signed-in user may link a client to this project (K5). */
export function useCanLinkDocumentClient(projectId: string | null | undefined) {
  return useDocumentClientLinkQuery(projectId, (hold) => hold === null);
}

/** Why the signed-in user may not link a client to this project, or null when she may (K5). */
export function useDocumentClientLinkHold(projectId: string | null | undefined) {
  return useDocumentClientLinkQuery(projectId, (hold) => hold);
}
