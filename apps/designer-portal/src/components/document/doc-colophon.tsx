'use client';

/**
 * The Colophon (R29) — the paper's last line states its own facts: a quiet
 * DM-mono row at the document's foot — studio · hands on the work · Brief a
 * vendor · Hold · Archive · Team… Hold → the
 * Desk's paused in-motion chip. Archive → the cabinet (⌘K-findable, R1).
 * Team… opens the canonical Call Sheet picker, so studio hands, GCs, subs,
 * vendors, and field parties all enter through one roster. Brief a vendor
 * deep-links the Orders book (the R28 vendor pane arrives with Track 2).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { openLedger } from './command-bar';
import {
  DocumentAction,
  DocumentActionGroup,
  DocumentActionRow,
} from './document-action';

const getSupabase = () => createBrowserClient() as any;

function useStudioName(designerId: string | null) {
  return useQuery<string | null>({
    queryKey: ['document-studio-name', designerId],
    enabled: Boolean(designerId),
    queryFn: async () => {
      const { data } = await getSupabase()
        .from('organization_members')
        .select('organization:organizations(name, type)')
        .eq('user_id', designerId)
        .eq('status', 'active')
        .limit(3);
      const studio = (data ?? []).find(
        (m: any) => m.organization?.type === 'design_studio',
      );
      return studio?.organization?.name ?? null;
    },
  });
}

function useSetProjectStatus(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      status,
      expectedStatus,
    }: {
      status: 'active' | 'on_hold' | 'archived';
      expectedStatus: 'active' | 'on_hold' | 'completed';
    }) => {
      if (!projectId) throw new Error('Project is required');
      const supabase = getSupabase();
      const { error } = status === 'archived'
        ? await supabase.rpc('archive_project', {
            p_project_id: projectId,
            p_expected_status: expectedStatus,
          })
        : await supabase.rpc('set_project_operational_status', {
            p_project_id: projectId,
            p_expected_status: expectedStatus,
            p_status: status,
          });
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

export function DocColophon({
  projectId,
  designerId,
  projectStatus,
  isPaused,
  handsOnTheWork,
}: {
  projectId: string;
  designerId: string | null;
  projectStatus: string | null;
  isPaused: boolean;
  /** Presence names (D6) — "you" plus whoever else is in the document. */
  handsOnTheWork: string[];
}) {
  const router = useRouter();
  const { data: studioName } = useStudioName(designerId);
  const setStatus = useSetProjectStatus(projectId);

  const [pane, setPane] = useState<null | 'archive'>(null);

  const hands =
    handsOnTheWork.length > 0 ? `you · ${handsOnTheWork.join(' · ')}` : 'you';
  const isCompleted = projectStatus === 'completed';
  const isArchived = projectStatus === 'archived';

  return (
    <footer className="mt-14 border-t border-[var(--color-pearl)] pb-6 pt-3">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5">
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          {studioName ?? 'The studio'}
        </span>
        <span className="font-mono text-[8.5px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
          hands on the work: {hands}
        </span>
        <span className="flex-1" />
        {/* R29: deep-links the R28 vendor pane, pre-addressed with this
            project's context. */}
        <DocumentActionGroup
          surfaceKey="open-document"
          regionKey="colophon"
          aria-label="Document colophon actions"
        >
          <DocumentAction
            actionKey="brief-vendor"
            variant="secondary"
            onClick={() => openLedger('orders', { page: 'vendors', projectId })}
          >
            Brief a vendor
          </DocumentAction>
          {!isCompleted && !isArchived && (
            <DocumentAction
              actionKey={isPaused ? 'resume-project' : 'hold-project'}
              variant="secondary"
              disabled={setStatus.isPending}
              loading={
                setStatus.isPending &&
                setStatus.variables?.status === (isPaused ? 'active' : 'on_hold')
              }
              loadingLabel={isPaused ? 'Resuming…' : 'Holding…'}
              onClick={() => setStatus.mutate({
                status: isPaused ? 'active' : 'on_hold',
                expectedStatus: isPaused ? 'on_hold' : 'active',
              })}
            >
              {isPaused ? 'Resume' : 'Hold'}
            </DocumentAction>
          )}
          {!isArchived && (
            <DocumentAction
              actionKey="open-archive-confirmation"
              variant="tertiary"
              onClick={() => setPane(pane === 'archive' ? null : 'archive')}
              className="text-[var(--color-terracotta)] decoration-[var(--color-terracotta)]"
            >
              Archive
            </DocumentAction>
          )}
          <DocumentAction
            actionKey="open-project-team"
            variant="secondary"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('document:open-call-sheet', {
                  detail: { mode: 'picker' },
                }),
              );
            }}
          >
            Team…
          </DocumentAction>
        </DocumentActionGroup>
      </div>

      {pane === 'archive' && !isArchived && (
        <div className="mt-2 max-w-[420px] rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-3">
          <p className="text-[11px] italic text-[var(--color-charcoal)]">
            The document goes to the cabinet — find it any time in ⌘K.
          </p>
          <DocumentActionRow
            surfaceKey="open-document"
            regionKey="archive-confirmation"
            className="mt-2"
            aria-label="Archive confirmation"
          >
            <DocumentAction
              actionKey="archive-project"
              variant="danger"
              loading={
                setStatus.isPending && setStatus.variables?.status === 'archived'
              }
              loadingLabel="Archiving…"
              onClick={() => {
                setStatus.mutate({
                  status: 'archived',
                  expectedStatus: isCompleted
                    ? 'completed'
                    : isPaused ? 'on_hold' : 'active',
                }, {
                  onSuccess: () => router.push('/desk'),
                });
              }}
            >
              Archive it
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-archive"
              variant="tertiary"
              onClick={() => setPane(null)}
            >
              Keep it out
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

    </footer>
  );
}
