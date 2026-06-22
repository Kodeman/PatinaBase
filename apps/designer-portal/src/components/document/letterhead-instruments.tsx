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
import { familyLabel } from '@/lib/document/family-label';
import { DocFileViewer } from './overlays/doc-file-viewer';
import { ClientMirror } from './client-mirror';
import { ProposalPreview } from './proposal-instruments';

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

/**
 * Open (or reuse) the right thread for an ad-hoc note and post the message.
 * Stage-consistent (R63): a project keys the project group thread; a pre-project
 * document (proposal / relationship) has no project, so it routes to the
 * designer↔client 1:1 DIRECT thread keyed on the client's profile id
 * (rpc_start_direct_thread, 00103) — which needs no project_id.
 */
function useSendDocumentNote(projectId: string | null, counterpartProfileId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const supabase = getSupabase();
      let threadId: string | null = null;
      if (projectId) {
        const { data, error } = await supabase.rpc('rpc_start_project_thread', {
          p_project_id: projectId,
        });
        if (error) throw error;
        threadId = data;
      } else if (counterpartProfileId) {
        const { data, error } = await supabase.rpc('rpc_start_direct_thread', {
          counterpart: counterpartProfileId,
        });
        if (error) throw error;
        threadId = data;
      } else {
        // No in-app counterpart (a profile-less captured lead) — the button is
        // hidden in this case, so this is a defensive guard, not a UX path.
        throw new Error('No counterpart to send a note to.');
      }
      const { data: auth } = await supabase.auth.getUser();
      const { error: mErr } = await supabase.from('comms_messages').insert({
        thread_id: threadId,
        sender_id: auth?.user?.id ?? null,
        body,
      });
      if (mErr) throw mErr;
    },
    onSuccess: () => {
      // Project documents have a margin to refresh; pre-project ones don't.
      if (projectId) invalidateMarginSurfaces(qc, projectId);
      void qc.invalidateQueries({ queryKey: ['comms'] });
    },
  });
}

export function LetterheadInstruments({
  projectId = null,
  proposalId = null,
  clientProfileId,
  clientName,
}: {
  /** Set on a project document; null pre-project (proposal / relationship). */
  projectId?: string | null;
  /** Set when a live proposal exists — drives the pre-project client mirror. */
  proposalId?: string | null;
  clientProfileId: string | null;
  clientName: string;
}) {
  const [mirrorOpen, setMirrorOpen] = useState(false);
  const [composing, setComposing] = useState(false);
  const [noteBody, setNoteBody] = useState('');
  const [viewingScan, setViewingScan] = useState<ScanArtifact | null>(null);
  const sendNote = useSendDocumentNote(projectId, clientProfileId);
  const { data: scans } = useClientScans(clientProfileId);

  const scan = useMemo(() => (scans ?? []).find((s) => s.image_url) ?? null, [scans]);
  const family = familyLabel(clientName);

  // "View as the client" needs a mirror to open: the full project mirror when
  // there's a project, else the proposal-grain mirror when there's a live
  // proposal. A pure relationship with neither has nothing to mirror — hide it.
  const canMirror = Boolean(projectId || proposalId);
  // "Send a note" needs a thread route: a project group thread, or (pre-project)
  // a direct thread to the client's profile. A profile-less lead has neither.
  const canSendNote = Boolean(projectId || clientProfileId);

  return (
    <>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        {canMirror && (
          <button
            type="button"
            onClick={() => setMirrorOpen(true)}
            className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
          >
            Preview as {family}
          </button>
        )}
        {canSendNote && (
          <button
            type="button"
            onClick={() => setComposing((v) => !v)}
            className="font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]"
          >
            Message {family}
          </button>
        )}
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

      {mirrorOpen &&
        (projectId ? (
          <ClientMirror
            projectId={projectId}
            clientName={clientName}
            onClose={() => setMirrorOpen(false)}
          />
        ) : proposalId ? (
          // Pre-project: the proposal-grain mirror (R43/R63) — the same
          // full-screen layer the proposal instruments open from inside the
          // Proposal section, so the two "view as them" affordances read alike.
          <ProposalPreview
            proposalId={proposalId}
            clientName={clientName}
            onClose={() => setMirrorOpen(false)}
          />
        ) : null)}

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
