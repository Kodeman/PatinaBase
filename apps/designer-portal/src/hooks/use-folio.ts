/**
 * The Folio (R24) — files clipped to the paper, riding the shipped
 * project_documents table (00169) + project-documents bucket (00170);
 * additive anchors/versioning/visibility in 00203. Files are material, not
 * conversation: NOT a margin kind. A re-upload auto-chains behind its
 * predecessor (same title, same anchor) — the strip renders the chain with
 * the Desk's stacked-edge recipe. client_visible defaults FALSE (the Notes'
 * private layer); the client mirror renders only flagged files.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import type { SectionKey } from '@/lib/document/desk-derivation';

const getSupabase = () => createBrowserClient() as any;

export type FolioAnchor =
  | { kind: 'section'; sectionKey: SectionKey }
  | { kind: 'line'; anchorId: string }
  | { kind: 'letterhead' };

export interface FolioFile {
  id: string;
  project_id: string;
  title: string;
  doc_type: string;
  storage_path: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  anchor_kind: 'line' | 'section' | 'letterhead' | null;
  anchor_id: string | null;
  section_key: SectionKey | null;
  version_of: string | null;
  client_visible: boolean;
  created_at: string;
}

/** A chain head plus the versions stacked behind it (newest first). */
export interface FolioChain {
  head: FolioFile;
  versions: FolioFile[];
}

const docTypeFor = (file: File): string => {
  if (file.type.startsWith('image/')) return 'img';
  if (file.type === 'application/pdf') return 'pdf';
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext && ext.length <= 4 ? ext : 'doc';
};

export function useFolioFiles(projectId: string | null) {
  return useQuery<FolioFile[]>({
    queryKey: ['folio-files', projectId],
    enabled: Boolean(projectId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('project_documents')
        .select(
          'id, project_id, title, doc_type, storage_path, size_bytes, uploaded_by, anchor_kind, anchor_id, section_key, version_of, client_visible, created_at',
        )
        .eq('project_id', projectId)
        .not('anchor_kind', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as FolioFile[];
    },
  });
}

/** Stack re-uploads literally (R24): heads are files nothing supersedes;
 *  versions walk the version_of chain, newest in front. */
export function buildChains(files: FolioFile[]): FolioChain[] {
  const byId = new Map(files.map((f) => [f.id, f]));
  const superseded = new Set(files.map((f) => f.version_of).filter(Boolean) as string[]);
  return files
    .filter((f) => !superseded.has(f.id))
    .map((head) => {
      const versions: FolioFile[] = [];
      let cur = head;
      while (cur.version_of && byId.has(cur.version_of)) {
        cur = byId.get(cur.version_of)!;
        versions.push(cur);
      }
      return { head, versions };
    });
}

export function matchesAnchor(f: FolioFile, anchor: FolioAnchor): boolean {
  if (anchor.kind === 'section') return f.anchor_kind === 'section' && f.section_key === anchor.sectionKey;
  if (anchor.kind === 'line') return f.anchor_kind === 'line' && f.anchor_id === anchor.anchorId;
  return f.anchor_kind === 'letterhead';
}

export function useUploadFolioFile(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, anchor }: { file: File; anchor: FolioAnchor }) => {
      if (!projectId) throw new Error('folio upload: no project');
      const supabase = getSupabase();
      const { data: auth } = await supabase.auth.getUser();

      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const storagePath = `${projectId}/${Date.now()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from('project-documents')
        .upload(storagePath, file, { contentType: file.type || undefined });
      if (upErr) throw upErr;

      // Same title on the same anchor = a new version stacking behind the
      // current chain head (R24's literal versioning).
      const { data: prior } = await supabase
        .from('project_documents')
        .select('id, version_of, title, anchor_kind, anchor_id, section_key')
        .eq('project_id', projectId)
        .eq('title', file.name)
        .order('created_at', { ascending: false });
      const sameAnchor = (prior ?? []).filter((p: any) => matchesAnchor(p as FolioFile, anchor));
      const supersededIds = new Set(sameAnchor.map((p: any) => p.version_of).filter(Boolean));
      const chainHead = sameAnchor.find((p: any) => !supersededIds.has(p.id));

      const { data, error } = await supabase
        .from('project_documents')
        .insert({
          project_id: projectId,
          title: file.name,
          doc_type: docTypeFor(file),
          storage_path: storagePath,
          size_bytes: file.size,
          uploaded_by: auth?.user?.id ?? null,
          anchor_kind: anchor.kind,
          anchor_id: anchor.kind === 'line' ? anchor.anchorId : null,
          section_key: anchor.kind === 'section' ? anchor.sectionKey : null,
          version_of: chainHead?.id ?? null,
          client_visible: false,
        })
        .select()
        .single();
      if (error) throw error;
      return data as FolioFile;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['folio-files', projectId] });
    },
  });
}

export function useSetFolioVisibility(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ fileId, clientVisible }: { fileId: string; clientVisible: boolean }) => {
      const { error } = await getSupabase()
        .from('project_documents')
        .update({ client_visible: clientVisible })
        .eq('id', fileId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['folio-files', projectId] });
    },
  });
}

/** Signed read URL for the paper viewer (the bucket is private). */
export async function folioSignedUrl(storagePath: string): Promise<string | null> {
  const { data, error } = await getSupabase()
    .storage.from('project-documents')
    .createSignedUrl(storagePath, 3600);
  if (error) return null;
  return data?.signedUrl ?? null;
}
