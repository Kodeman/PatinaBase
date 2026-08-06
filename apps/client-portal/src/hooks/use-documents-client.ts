'use client';

/**
 * The client Documents hub (P2b) — reads the Folio's client-visible leg of
 * `project_documents` (supabase/migrations/00169, 00203, 00252) across the
 * client's own projects.
 *
 * Retrieval mechanics are deliberately identical to the designer portal's:
 *   - table + columns mirror the client-mirror preview's own query
 *     (apps/designer-portal/src/components/document/client-mirror.tsx),
 *     which is the enforced definition of "what the client sees" for these
 *     files (a CI test holds that line designer-side).
 *   - the signed-URL helper mirrors `folioSignedUrl`
 *     (apps/designer-portal/src/hooks/use-folio.ts) — the `project-documents`
 *     bucket is private, so a client_visible row's file is only reachable via
 *     a time-boxed signed URL, never a public URL. Do not widen the bucket.
 *
 * RLS (00203/00252) already scopes SELECT to client_visible = true rows on
 * the client's own projects; the `.eq('client_visible', true)` below is
 * defensive/explicit, matching the client-mirror's own query and the
 * codebase's established pattern of also filtering client-side (see
 * ../app/budget/rollup.ts `visibleInvoices`).
 */

import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getSupabase = () => createBrowserClient() as any;

export interface ClientDocument {
  id: string;
  project_id: string | null;
  proposal_id: string | null;
  title: string;
  doc_type: string;
  category: string | null;
  section_key: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  client_visible: boolean;
  created_at: string;
}

export interface ClientDocumentsData {
  documents: ClientDocument[];
  /** proposal id → its activated project id (null while unactivated). */
  proposalProjectIds: Record<string, string | null>;
}

/**
 * All client_visible project_documents rows across the given projects PLUS
 * rows anchored to the client's proposals (project_id null — e.g. a signed
 * design agreement filed before activation). Proposal ids come from an
 * RLS-scoped `proposals` read: the client only ever sees their own rows, so
 * the id list is already the full visible universe. Flat list — group with
 * groupDocumentsByProject (../app/documents/group.ts), which uses
 * proposalProjectIds to fold proposal-anchored rows into their project.
 */
export function useClientDocuments(projectIds: string[]) {
  const key = [...projectIds].sort();
  return useQuery<ClientDocumentsData>({
    queryKey: ['client-documents', key],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const supabase = getSupabase();
      const { data: proposals, error: proposalsError } = await supabase
        .from('proposals')
        .select('id, project_id');
      if (proposalsError) throw proposalsError;
      const proposalRows = (proposals ?? []) as Array<{
        id: string;
        project_id: string | null;
      }>;
      const proposalIds = proposalRows.map((proposal) => proposal.id);

      let query = supabase
        .from('project_documents')
        .select(
          'id, project_id, proposal_id, title, doc_type, category, section_key, storage_path, size_bytes, client_visible, created_at',
        )
        .eq('client_visible', true)
        .order('created_at', { ascending: false });
      query =
        proposalIds.length > 0
          ? query.or(
              `project_id.in.(${projectIds.join(',')}),proposal_id.in.(${proposalIds.join(',')})`,
            )
          : query.in('project_id', projectIds);
      const { data, error } = await query;
      if (error) throw error;

      return {
        documents: (data ?? []) as ClientDocument[],
        proposalProjectIds: Object.fromEntries(
          proposalRows.map((proposal) => [proposal.id, proposal.project_id ?? null]),
        ),
      };
    },
  });
}

/** Signed read URL for a document's file (mirrors folioSignedUrl). */
export async function documentSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .storage.from('project-documents')
    .createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}
