import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// LINK A CLIENT — US-36 K5 (migration 00796)
//
//   can_link_document_client  whether the signed-in user may link a client to
//                             this project through set_document_client: its
//                             lead, or an owner/admin of its studio. The same
//                             predicate as the act, so gating asks the server.
// ═══════════════════════════════════════════════════════════════════════════

export const documentClientAuthorityKeys = {
  all: ['document-client-authority'] as const,
  canLink: (projectId: string) =>
    [...documentClientAuthorityKeys.all, 'can-link', projectId] as const,
};

/** Whether the signed-in user may link a client to this project (K5). */
export function useCanLinkDocumentClient(projectId: string | null | undefined) {
  return useQuery({
    queryKey: documentClientAuthorityKeys.canLink(projectId ?? ''),
    queryFn: async (): Promise<boolean> => {
      const { data, error } = await getSupabase().rpc('can_link_document_client', {
        p_project_id: projectId as string,
      });
      if (error) throw error;
      return data === true;
    },
    enabled: !!projectId,
  });
}
