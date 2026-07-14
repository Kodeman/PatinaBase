'use client';

/**
 * Portfolio (R52 / Track C) — the finished-rooms gallery over completed projects
 * (`useProjects()`, filtered to `status:'completed'`). The prototype's
 * `.portfolio-grid` of `.port-cell` cards: a paper-toned hero, the project name,
 * and a "client · year" sub. Client names are resolved from the unified
 * directory (a client row's `profile_id` = the project's `client_id`) — no new
 * hook. A cell opens the finished project's document (`/doc/[id]`), the same way
 * the profile opens a project.
 */

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useProjects, usePeopleDirectory } from '@patina/supabase';
import { ViewHeader } from '../view-shell';
import type { PeopleViewProps } from '../types';
import { useStudioHasTeam } from '@/hooks/use-studio-has-team';
import { OwnerByline } from '@/components/ui/owner-byline';

function yearOf(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : String(d.getFullYear());
}

/** A surname-ish short label for the "client · year" sub (the prototype shows
 *  "Whitfield · 2026"). Falls back to the full name when it's a single token. */
function shortClient(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return name.trim();
  return parts[parts.length - 1]!;
}

export function PortfolioView(_props: PeopleViewProps) {
  const router = useRouter();
  const { data: projects, isLoading } = useProjects();
  const { data: directory } = usePeopleDirectory({ role: 'client' });
  // Studio Wave 5 — owner-attribution byline shown only once the signed-in
  // designer's studio has >1 active member; solo designers see no change.
  const showOwner = useStudioHasTeam();

  // client_id (auth profile) → display name, via the directory's client rows.
  const clientByProfile = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of directory ?? []) {
      if (row.profile_id) map.set(row.profile_id, row.display_name);
    }
    return map;
  }, [directory]);

  const completed = useMemo(
    () =>
      (projects ?? [])
        .filter((p) => p.status === 'completed')
        .sort(
          (a, b) =>
            new Date(b.completed_at ?? b.updated_at ?? 0).getTime() -
            new Date(a.completed_at ?? a.updated_at ?? 0).getTime(),
        ),
    [projects],
  );

  return (
    <>
      <ViewHeader
        title="Portfolio"
        sub="The finished rooms — your completed work, ready to show the next client and feed reviews."
      />

      {isLoading ? (
        <p className="px-1 py-6 text-[0.76rem] text-[var(--color-aged-oak)]">
          Gathering the finished rooms…
        </p>
      ) : completed.length === 0 ? (
        <div className="rounded-[10px] border border-dashed border-[var(--doc-ink-border)] bg-white/40 px-5 py-8 text-center">
          <p className="text-[0.76rem] leading-relaxed text-[var(--color-aged-oak)]">
            No finished rooms yet. Completed projects land here — your portfolio builds itself as you
            deliver.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          {completed.map((p) => {
            const clientName = p.client_id ? clientByProfile.get(p.client_id) : undefined;
            const year = yearOf(p.completed_at ?? p.updated_at);
            const sub = [clientName ? shortClient(clientName) : null, year]
              .filter(Boolean)
              .join(' · ');
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => router.push(`/doc/${p.id}`)}
                className="overflow-hidden rounded-[8px] border border-[var(--doc-ink-border)] bg-white text-left transition-transform duration-200 hover:-translate-y-[2px]"
              >
                <div
                  aria-hidden
                  className="h-24 w-full"
                  style={{ background: 'linear-gradient(140deg, #EFE9DD, #E2DACA)' }}
                />
                <div className="px-2.5 py-2">
                  <div className="truncate text-[0.72rem] font-medium text-[var(--color-charcoal)]">
                    {p.name}
                  </div>
                  {sub && (
                    <div className="truncate text-[0.58rem] text-[var(--color-aged-oak)]">{sub}</div>
                  )}
                  {showOwner && (
                    <div className="mt-1 truncate text-[0.54rem]">
                      <OwnerByline
                        name={p.designer?.full_name ?? p.designer?.display_name ?? null}
                        avatarUrl={p.designer?.avatar_url ?? null}
                      />
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
