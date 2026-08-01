import { useQuery } from '@tanstack/react-query';

import { createBrowserClient } from '../client';

const getSupabase = () => createBrowserClient();

export type ProjectDocumentKind = 'proposal' | 'scope_change' | 'contract' | 'other';

export interface ProjectDocument {
  id: string;
  kind: ProjectDocumentKind;
  title: string;
  signed_at: string | null;
  status: string | null;
  total_amount_cents: number | null;
  url: string;
}

/**
 * Returns all documents associated with a project that the client can view —
 * proposals (sent through accepted) and scope-change requests in any state.
 *
 * Wave 1: only Supabase-backed sources. Future waves can add contracts /
 * uploads from a project-documents bucket once that exists.
 */
export function useProjectDocuments(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-documents', projectId],
    enabled: !!projectId,
    queryFn: async (): Promise<ProjectDocument[]> => {
      if (!projectId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;

      const [{ data: proposals }, { data: scopes }] = await Promise.all([
        supabase.rpc('list_client_proposals'),
        supabase
          .from('scope_change_requests')
          .select('id, title, status, sent_at, approved_at, created_at')
          .eq('project_id', projectId)
          .order('created_at', { ascending: false }),
      ]);

      const proposalDocs: ProjectDocument[] = (proposals ?? [])
        .filter(
          // The RPC already authenticates exact client ownership and issued
          // statuses. Keep the project predicate here because this hook
          // composes one project's document cabinet.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (p: any) => p.project_id === projectId,
        )
        .map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (p: any) => ({
          id: p.id,
          kind: 'proposal' as const,
          title: p.title,
          signed_at: p.signed_at ?? null,
          status: p.status ?? null,
          total_amount_cents: typeof p.total_amount === 'number' ? p.total_amount : null,
          url: `/proposals/${p.id}`,
        }),
      );

      const scopeDocs: ProjectDocument[] = (scopes ?? []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (s: any) => ({
          id: s.id,
          kind: 'scope_change' as const,
          title: s.title,
          signed_at: s.approved_at ?? null,
          status: s.status ?? null,
          total_amount_cents: null,
          url: `/projects/${projectId}/scope-change/${s.id}`,
        })
      );

      return [...proposalDocs, ...scopeDocs].sort((a, b) => {
        const aTime = a.signed_at ?? '0';
        const bTime = b.signed_at ?? '0';
        return bTime.localeCompare(aTime);
      });
    },
  });
}
