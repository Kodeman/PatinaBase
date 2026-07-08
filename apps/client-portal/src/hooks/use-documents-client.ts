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
  project_id: string;
  title: string;
  doc_type: string;
  category: string | null;
  storage_path: string | null;
  size_bytes: number | null;
  client_visible: boolean;
  created_at: string;
}

/**
 * All client_visible project_documents rows across the given projects
 * (pass every id from useProjects()). Flat list — group with
 * groupDocumentsByProject (../app/documents/group.ts).
 */
export function useClientDocuments(projectIds: string[]) {
  const key = [...projectIds].sort();
  return useQuery<ClientDocument[]>({
    queryKey: ['client-documents', key],
    enabled: projectIds.length > 0,
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('project_documents')
        .select(
          'id, project_id, title, doc_type, category, storage_path, size_bytes, client_visible, created_at',
        )
        .in('project_id', projectIds)
        .eq('client_visible', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClientDocument[];
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
