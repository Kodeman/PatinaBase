'use client';

/**
 * The Colophon (R29) — the paper's last line states its own facts: a quiet
 * DM-mono row at the document's foot — studio · hands on the work · Brief a
 * vendor · Hold · Archive · Team… Click → a small paper popover. Hold → the
 * Desk's paused in-motion chip. Archive → the cabinet (⌘K-findable, R1).
 * Team… carries the §14.6 RLS widening (00205): adding a studio member
 * makes their margin notes visible per D6. Brief a vendor deep-links the
 * Orders book (the R28 vendor pane arrives with Track 2).
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { openLedger } from './command-bar';

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
      const studio = (data ?? []).find((m: any) => m.organization?.type === 'design_studio');
      return studio?.organization?.name ?? null;
    },
  });
}

function useSetProjectStatus(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status: 'active' | 'on_hold' | 'archived') => {
      const { error } = await getSupabase().from('projects').update({ status }).eq('id', projectId);
      if (error) throw error;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['document-state'] });
      void qc.invalidateQueries({ queryKey: ['projects'] });
    },
  });
}

function useAddTeamMemberByEmail(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, role }: { email: string; role: string }) => {
      const supabase = getSupabase();
      const { data: profile, error: pErr } = await supabase
        .from('profiles')
        .select('id, full_name')
        .ilike('email', email.trim())
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) throw new Error('No member found with that email');
      const { error } = await supabase.from('project_team_members').insert({
        project_id: projectId,
        user_id: profile.id,
        role,
      });
      if (error) throw error;
      return profile;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['project-team'] });
      // D6/00205: their notes become visible — the margin re-reads.
      void qc.invalidateQueries({ queryKey: ['margin-items'] });
    },
  });
}

const ROW_BTN =
  'font-mono text-[8.5px] uppercase tracking-[0.08em] text-[var(--text-muted)] hover:text-[var(--color-clay)]';

export function DocColophon({
  projectId,
  designerId,
  isPaused,
  handsOnTheWork,
}: {
  projectId: string;
  designerId: string | null;
  isPaused: boolean;
  /** Presence names (D6) — "you" plus whoever else is in the document. */
  handsOnTheWork: string[];
}) {
  const router = useRouter();
  const { data: studioName } = useStudioName(designerId);
  const setStatus = useSetProjectStatus(projectId);
  const addMember = useAddTeamMemberByEmail(projectId);

  const [pane, setPane] = useState<null | 'archive' | 'team'>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('support_designer');
  const [teamNote, setTeamNote] = useState<string | null>(null);

  const hands = handsOnTheWork.length > 0 ? `you · ${handsOnTheWork.join(' · ')}` : 'you';

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
        <button
          type="button"
          className={ROW_BTN}
          onClick={() => openLedger('orders', { page: 'vendors', projectId })}
        >
          Brief a vendor
        </button>
        <button
          type="button"
          className={ROW_BTN}
          disabled={setStatus.isPending}
          onClick={() => setStatus.mutate(isPaused ? 'active' : 'on_hold')}
        >
          {isPaused ? 'Resume' : 'Hold'}
        </button>
        <button
          type="button"
          className={ROW_BTN}
          onClick={() => setPane(pane === 'archive' ? null : 'archive')}
        >
          Archive
        </button>
        <button
          type="button"
          className={ROW_BTN}
          onClick={() => setPane(pane === 'team' ? null : 'team')}
        >
          Team…
        </button>
      </div>

      {pane === 'archive' && (
        <div className="mt-2 max-w-[420px] rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-3">
          <p className="text-[11px] italic text-[var(--color-charcoal)]">
            The document goes to the cabinet — find it any time in ⌘K.
          </p>
          <div className="mt-2 flex items-baseline gap-3">
            <button
              type="button"
              disabled={setStatus.isPending}
              onClick={() => {
                setStatus.mutate('archived', { onSuccess: () => router.push('/desk') });
              }}
              className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)] disabled:opacity-40"
            >
              Archive it
            </button>
            <button type="button" onClick={() => setPane(null)} className={ROW_BTN}>
              Keep it out
            </button>
          </div>
        </div>
      )}

      {pane === 'team' && (
        <div className="mt-2 max-w-[460px] rounded-[4px] border border-[var(--doc-ink-border)] bg-[var(--doc-paper)] p-3">
          <p className="mb-1.5 text-[11px] italic text-[var(--text-muted)]">
            Add a hand to this work — their margin notes join yours (D6).
          </p>
          <div className="flex items-baseline gap-2">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email"
              aria-label="Member email"
              className="min-w-0 flex-1 border-b border-dashed border-[var(--color-pearl)] bg-transparent text-[11.5px] text-[var(--color-charcoal)] outline-none placeholder:italic"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              aria-label="Role"
              className="bg-transparent font-mono text-[9px] uppercase tracking-[0.04em] text-[var(--text-muted)] outline-none"
            >
              <option value="support_designer">designer</option>
              <option value="bookkeeper">bookkeeper</option>
              <option value="lead_designer">lead</option>
            </select>
            <button
              type="button"
              disabled={!email.trim() || addMember.isPending}
              onClick={() =>
                addMember.mutate(
                  { email, role },
                  {
                    onSuccess: (p) => {
                      setTeamNote(`${p.full_name ?? email} added`);
                      setEmail('');
                    },
                    onError: (e) => setTeamNote(e instanceof Error ? e.message : 'Could not add'),
                  },
                )
              }
              className="font-mono text-[9px] uppercase tracking-[0.05em] text-[var(--color-clay)] disabled:opacity-40"
            >
              Add
            </button>
          </div>
          {teamNote && (
            <p className="mt-1.5 font-mono text-[8.5px] text-[var(--text-muted)]">{teamNote}</p>
          )}
        </div>
      )}
    </footer>
  );
}
