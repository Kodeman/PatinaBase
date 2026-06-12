'use client';

/**
 * The client mirror (R27) — "View as the [clients]": a read-only preview
 * session rendering what the CLIENT's copy carries, full-screen under a thin
 * charcoal banner. This component is the enforceable projection: it queries
 * only client-visible material — pending decisions and gates, the project
 * thread, folio files flagged client_visible, payment milestones. It must
 * NEVER render the Account Page, section tasks, margin notes, or unflagged
 * files — a CI test (client-mirror.test.tsx) holds that line (R26).
 *
 * Read-only by construction: the close banner is the only interactive act.
 */

import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '@patina/supabase';
import { fmtDay, fmtUsd } from '@/lib/document/format';

const getSupabase = () => createBrowserClient() as any;

type AnyRow = any;

export function useClientMirrorData(projectId: string) {
  return useQuery({
    queryKey: ['client-mirror', projectId],
    queryFn: async () => {
      const supabase = getSupabase();
      const [{ data: project }, { data: decisions }, { data: files }, { data: milestones }, { data: thread }] =
        await Promise.all([
          supabase.from('projects').select('name, status').eq('id', projectId).single(),
          supabase
            .from('client_decisions')
            .select('id, title, context, due_date, status, decision_kind, responded_at, options:client_decision_options!client_decision_options_decision_id_fkey(id, name, selected)')
            .eq('project_id', projectId)
            .in('status', ['pending', 'responded'])
            .order('created_at', { ascending: false }),
          supabase
            .from('project_documents')
            // The folio's private layer: the mirror reads ONLY flagged files.
            .select('id, title, doc_type, created_at, client_visible')
            .eq('project_id', projectId)
            .eq('client_visible', true)
            .order('created_at', { ascending: false }),
          supabase
            .from('project_payment_milestones')
            .select('id, label, amount_cents, status, due_date, paid_at, sort_order')
            .eq('project_id', projectId)
            .order('sort_order', { ascending: true }),
          supabase
            .from('comms_threads')
            .select('id, messages:comms_messages(id, body, created_at, sender_id)')
            .eq('project_id', projectId)
            .eq('kind', 'project')
            .limit(1)
            .maybeSingle(),
        ]);
      const messages = ((thread?.messages ?? []) as AnyRow[])
        .filter((m) => !m.deleted_at)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, 8);
      return { project, decisions: decisions ?? [], files: files ?? [], milestones: milestones ?? [], messages };
    },
  });
}

export function ClientMirror({
  projectId,
  clientName,
  onClose,
}: {
  projectId: string;
  clientName: string;
  onClose: () => void;
}) {
  const { data } = useClientMirrorData(projectId);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    restoreRef.current = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      restoreRef.current?.focus?.();
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`What ${clientName} sees`}
      className="fixed inset-0 z-[60] flex flex-col bg-[var(--doc-paper)]"
      data-testid="client-mirror"
    >
      {/* The thin charcoal banner — the preview session's frame. */}
      <div className="flex items-baseline justify-between bg-[var(--color-charcoal)] px-7 py-2">
        <p className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[rgba(250,247,242,0.75)]">
          You&rsquo;re seeing what they see
        </p>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-[var(--color-clay)] hover:opacity-80"
        >
          ← Back to your copy
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-7 py-8 min-[980px]:px-16">
        {!data ? (
          <p className="text-[12px] italic text-[var(--text-muted)]">Opening their copy…</p>
        ) : (
          <div className="mx-auto max-w-[720px]">
            <h1 className="font-heading text-[1.4rem] font-medium text-[var(--color-charcoal)]">
              {data.project?.name ?? 'Your project'}
            </h1>
            <p className="mb-6 mt-1 text-[11px] text-[var(--text-muted)]">
              {data.project?.status === 'completed' ? 'Complete' : 'In progress'}
            </p>

            {data.decisions.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Waiting on you
                </h2>
                {(data.decisions as AnyRow[]).map((d) => (
                  <div key={d.id} className="border-b border-[var(--color-pearl)] py-2">
                    <p className="text-[12.5px] font-medium text-[var(--color-charcoal)]">
                      {d.title}
                      {d.status === 'responded' && (
                        <span className="ml-2 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[#85947C]">
                          answered{d.responded_at ? ` · ${fmtDay(d.responded_at)}` : ''}
                        </span>
                      )}
                    </p>
                    {d.context && (
                      <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">{d.context}</p>
                    )}
                    {d.status === 'pending' && d.due_date && (
                      <p className="mt-0.5 font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                        by {fmtDay(d.due_date)}
                      </p>
                    )}
                  </div>
                ))}
              </section>
            )}

            {data.files.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Shared with you
                </h2>
                {(data.files as AnyRow[]).map((f) => (
                  <p key={f.id} className="border-b border-dashed border-[var(--color-pearl)] py-1.5 text-[11.5px] text-[var(--color-charcoal)]">
                    {f.title}
                    <span className="ml-2 font-mono text-[8.5px] uppercase text-[var(--text-muted)]">
                      {fmtDay(f.created_at)}
                    </span>
                  </p>
                ))}
              </section>
            )}

            {data.messages.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  From the studio
                </h2>
                {(data.messages as AnyRow[]).map((m) => (
                  <div key={m.id} className="border-b border-dashed border-[var(--color-pearl)] py-2">
                    <p className="whitespace-pre-wrap text-[11.5px] leading-relaxed text-[var(--color-charcoal)]">
                      {m.body}
                    </p>
                    <p className="mt-0.5 font-mono text-[8px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {fmtDay(m.created_at)}
                    </p>
                  </div>
                ))}
              </section>
            )}

            {data.milestones.length > 0 && (
              <section className="mb-6">
                <h2 className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-[var(--text-muted)]">
                  Payment schedule
                </h2>
                {(data.milestones as AnyRow[]).map((m) => (
                  <div key={m.id} className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-dashed border-[var(--color-pearl)] py-1.5">
                    <span className="text-[11.5px] text-[var(--color-charcoal)]">{m.label}</span>
                    <span className="font-mono text-[10px] text-[var(--color-charcoal)]">
                      {fmtUsd(m.amount_cents)}
                    </span>
                    <span className="font-mono text-[8.5px] uppercase tracking-[0.05em] text-[var(--text-muted)]">
                      {m.paid_at ? `paid ${fmtDay(m.paid_at)}` : m.status}
                    </span>
                  </div>
                ))}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
