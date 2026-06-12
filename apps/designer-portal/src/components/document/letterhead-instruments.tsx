'use client';

/**
 * The letterhead instruments (R27) — one quiet DM-mono row under the
 * letterhead subtitle:
 *   · View as the [clients] — the client mirror full-screen under a thin
 *     charcoal banner; read-only preview session.
 *   · Send a note — the Pulse's ad-hoc sibling: compose → comms post →
 *     letterhead-anchored message item. No new schema (00193 anchors:
 *     NULL = letterhead).
 *   · The scan — Discovery artifact (iOS RoomPlan hero image), opening in
 *     the folio's paper viewer. The first physical iOS↔portal handshake.
 */

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { invalidateMarginSurfaces } from '@/hooks/use-margin-items';
import { DocFileViewer } from './overlays/doc-file-viewer';
import { ClientMirror } from './client-mirror';

const getSupabase = () => createBrowserClient() as any;

interface ScanArtifact {
  id: string;
  name: string | null;
  created_at: string;
  image_url: string | null;
}

function useClientScans(clientProfileId: string | null) {
  return useQuery<ScanArtifact[]>({
    queryKey: ['document-client-scans', clientProfileId],
    enabled: Boolean(clientProfileId),
    queryFn: async () => {
      const { data, error } = await getSupabase()
        .from('room_scans')
        .select('id, name, created_at, images:room_scan_images(image_url, is_primary, quality_score)')
        .eq('user_id', clientProfileId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []).map((s: any) => {
        const hero = (s.images ?? []).find((i: any) => i.is_primary) ?? (s.images ?? [])[0];
        return {
          id: s.id,
          name: s.name,
          created_at: s.created_at,
          image_url: hero?.image_url ?? null,
        };
      });
    },
  });
}

function useSendDocumentNote(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const supabase = getSupabase();
      const { data: threadId, error: tErr } = await supabase.rpc('rpc_start_project_thread', {
        p_project_id: projectId,
      });
      if (tErr) throw tErr;
      const { data: auth } = await supabase.auth.getUser();
      const { error: mErr } = await supabase.from('comms_messages').insert({
        thread_id: threadId,
        sender_id: auth?.user?.id ?? null,
        body,
      });
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      invalidateMarginSurfaces(qc, projectId);
      void qc.invalidateQueries({ queryKey: ['comms'] });
    },
  });
}

export function LetterheadInstruments({
  projectId,
  clientProfileId,
  clientName,
}: {
  projectId: string;
  clientProfileId: string | null;
  clientName: string;
}) {
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [viewingScan, setViewingScan] = useState<ScanArtifact | null>(null);
  const sendNote = useSendDocumentNote(projectId);
  const { data: scans } = useClientScans(clientProfileId);

  const scan = useMemo(() => (scans ?? []).find((s) => s.image_url) ?? null, [scans]);
  const familyLabel = useMemo(() => {
    const parts = clientName.trim().split(/\s+/);
    const surname = parts[parts.length - 1];
    return surname && surname.toLowerCase() !== 'client' ? `the ${surname}s` : clientName;
  }, [clientName]);

  return (
    <>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={() => setMirrorOpen(true)}
          className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
        >
          View as {familyLabel}
        </button>
        <button
          type="button"
          onClick={() => setComposing((v) => !v)}
          className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
        >
          Send a note
        </button>
        {scan && (
          <button
            type="button"
            onClick={() => setViewingScan(scan)}
            className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
          >
            The scan
          </button>
        )}
      </div>

      {composing && (
        <div
          className="mt-2 rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-2.5"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              setComposing(false);
            }
          }}
        >
          <p className="mb-1.5 text-[10px] italic text-[var(--text-muted)]">
            The Pulse handles Fridays; this is for now. It lands in {clientName}&rsquo;s portal
            messages.
          </p>
          <textarea
            autoFocus
            value={noteBody}
            onChange={(e) => setNoteBody(e.target.value)}
            rows={3}
            placeholder={`A quick note to ${clientName}…`}
            className="w-full resize-y bg-transparent text-[12px] text-[var(--color-charcoal)] outline-none placeholder:italic placeholder:text-[var(--text-muted)]"
          />
          <div className="mt-1 flex items-baseline gap-3">
            <button
              type="button"
              disabled={!noteBody.trim() || sendNote.isPending}
              onClick={() => {
                sendNote.mutate(noteBody.trim());
                setNoteBody('');
                setComposing(false);
              }}
              className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)] disabled:opacity-40"
            >
              {sendNote.isPending ? 'Sending…' : 'Send'}
            </button>
            <button
              type="button"
              onClick={() => setComposing(false)}
              className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--text-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mirrorOpen && (
        <ClientMirror projectId={projectId} clientName={clientName} onClose={() => setMirrorOpen(false)} />
      )}

      {viewingScan && (
        <DocFileViewer
          file={{
            title: viewingScan.name ?? 'Room scan',
            doc_type: 'img',
            created_at: viewingScan.created_at,
          }}
          url={viewingScan.image_url}
          onClose={() => setViewingScan(null)}
        />
      )}
    </>
  );
}
