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

import { useState } from 'react';
import { EmptyState, SurfaceKeys, useHelpContent } from '@patina/help-system';
import { Folder } from 'lucide-react';

import { ScoredAction } from '@/components/making/scored-action';
import { DetailsSheet } from '@/components/threshold/details-sheet';
import { useAuth } from '@/hooks/use-auth';

/**
 * The two acts the mat carries, for the one page that has no mat under it.
 *
 * The header is gone from `/` for every client, house or no house, so a
 * homeowner who has been invited but not yet given a project would otherwise
 * stand on a page with no way to her own details and no way out. Every
 * destination the old header offered is now a retired route that 308s
 * straight back here, so restoring the header would be a ring of dead links
 * rather than navigation.
 */
function EmptyStateActs() {
  const { signOut } = useAuth();
  const [detailsOpen, setDetailsOpen] = useState(false);

  return (
    <div data-testid="empty-state-acts" className="mt-8">
      <div className="flex flex-wrap items-baseline justify-center gap-x-5">
        <ScoredAction
          actionKey="mat_account"
          regionKey="mat"
          surfaceKey="the_threshold"
          variant="tertiary"
          onClick={() => setDetailsOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={detailsOpen}
        >
          Your details
        </ScoredAction>
        <ScoredAction
          actionKey="mat_sign_out"
          regionKey="mat"
          surfaceKey="the_threshold"
          variant="secondary"
          onClick={() => void signOut()}
        >
          Leave the house
        </ScoredAction>
      </div>
      <DetailsSheet open={detailsOpen} onClose={() => setDetailsOpen(false)} />
    </div>
  );
}

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
        <EmptyStateActs />
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
      {/* No "Message your designer" here any more: /messages is retired and
          folds to the note of the client's active house, which a client with
          no house does not have — the link came straight back to this page. */}
      <EmptyStateActs />
    </div>
  );
}
