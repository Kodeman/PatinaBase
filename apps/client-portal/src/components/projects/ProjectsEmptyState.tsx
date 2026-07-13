'use client';

/**
 * ProjectsEmptyState — client-portal /projects list zero-state (F3).
 *
 * Probes the CMS via useHelpContent first, then defers to the canonical
 * <EmptyState /> wrapper on a hit. On a clean miss (Sanity not yet authored
 * for this surface key), renders a hospitality-voiced fallback so a freshly
 * invited homeowner never sees a silent blank screen.
 *
 * Mirrors the F1.6 Pipeline / Clients pattern (see designer-portal
 * pipeline/page.tsx → PipelineEmptyState). The voice here differs:
 * consumer-facing, warm, second-person, no designer jargon. Spec §8.1.
 *
 * Persona: 'consumer' — the underlying useHelpContent fallback chain will
 * try the consumer-tailored variant first before falling back to 'all'.
 */

import Link from 'next/link';
import { EmptyState, SurfaceKeys, useHelpContent } from '@patina/help-system';
import { Folder } from 'lucide-react';

export function ProjectsEmptyState() {
  // Cheap CMS probe; react-query dedupes with the fetch inside <EmptyState>,
  // so this is not an extra network call.
  const { data, isLoading } = useHelpContent(
    SurfaceKeys.ClientPortal.Projects.Empty.NoProjects,
    'emptyState',
    'consumer',
  );

  if (isLoading) {
    return (
      <div className="py-16 text-center">
        <p className="type-body italic text-[var(--text-muted)]">…</p>
      </div>
    );
  }

  if (data) {
    return (
      <div className="py-12">
        <EmptyState
          surfaceKey={SurfaceKeys.ClientPortal.Projects.Empty.NoProjects}
          persona="consumer"
          icon={<Folder className="h-12 w-12" />}
        />
      </div>
    );
  }

  // CMS miss — render the hospitality-voiced fallback. Consumer voice:
  // explain who initiates the project (the designer) so the homeowner
  // doesn't feel like they're missing a button to press.
  return (
    <div className="py-16 text-center">
      <Folder className="mx-auto h-10 w-10 text-[var(--text-muted)]" aria-hidden />
      <h2 className="mt-4 font-heading text-lg text-[var(--text-primary)]">
        No active projects yet
      </h2>
      <p className="type-body-small mt-2 mx-auto max-w-md text-[var(--text-muted)]">
        Your designer kicks off a project when you’re ready to begin. Once they
        do, you’ll see its timeline, approvals, and updates here.
      </p>
      <div className="mt-6">
        <Link
          href="/messages"
          className="inline-flex items-center rounded-[3px] border border-[var(--border-default)] px-4 py-2 type-meta text-[var(--text-primary)] transition hover:border-[var(--accent-primary)]"
        >
          Message your designer
        </Link>
      </div>
    </div>
  );
}
