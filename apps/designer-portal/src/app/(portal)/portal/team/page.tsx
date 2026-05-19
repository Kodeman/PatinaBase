'use client';

import Link from 'next/link';
import { useOrganizations, useSession } from '@patina/supabase';
import { useProjects } from '@/hooks/use-projects';
import { Breadcrumb } from '@/components/portal/breadcrumb';
import { LoadingStrata } from '@/components/portal/loading-strata';
// F1.7 — Team migrated to ambient + reactive help-system layers per spec
// §12.4. Studio is Patina vocabulary (multi-user org); StrataInfoIcon
// explains the concept inline. Aliased the local EmptyState helper to
// `LocalEmptyState` to avoid collision with the canonical
// `<EmptyState surfaceKey>` wrapper from @patina/help-system.
import { EmptyState as LocalEmptyState } from '@/components/portal/empty-state';
import {
  EmptyState,
  SectionIntro,
  StrataInfoIcon,
  SurfaceKeys,
  useHelpContent,
} from '@patina/help-system';

// CMS-probe + local fallback for the "no studio yet" zero-state. Matches the
// F1.6 Clients pattern so the first-time designer sees onboarding copy
// before Sanity is populated.
function NoStudioEmpty() {
  const surfaceKey = SurfaceKeys.DesignerPortal.Team.Empty.NoStudio;
  const { data, isLoading } = useHelpContent(surfaceKey, 'emptyState');
  if (isLoading) return null;
  if (data) return <EmptyState surfaceKey={surfaceKey} />;
  return (
    <LocalEmptyState
      title="No studio yet"
      description="Create a studio to add support designers, bookkeepers, and assign roles per project."
    />
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyData = any;

export default function TeamPage() {
  const { session } = useSession();
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();
  const { data: projects, isLoading: projectsLoading } = useProjects();

  const orgList = (Array.isArray(orgs) ? orgs : []) as AnyData[];
  const projectList = (Array.isArray(projects) ? projects : []) as AnyData[];

  if (orgsLoading || projectsLoading) return <LoadingStrata />;

  const studio = orgList[0];

  return (
    <div className="pt-8">
      <Breadcrumb items={[{ label: 'Team' }]} />

      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h1 className="type-section-head" style={{ fontSize: '1.5rem' }}>
            Team
          </h1>
          <SectionIntro
            surfaceKey={SurfaceKeys.DesignerPortal.Team.ListIntro}
            fallback="Members of your studio and their assignments across active projects."
          />
        </div>
        <button
          type="button"
          onClick={() => alert('Invite — coming soon')}
          className="rounded-[3px] bg-[var(--text-primary)] px-3 py-1.5 text-[0.8rem] text-[var(--bg-primary)]"
        >
          + Invite member
        </button>
      </div>

      {!studio ? (
        <NoStudioEmpty />
      ) : (
        <>
          <div className="mb-6 rounded-md border p-4" style={{ borderColor: 'var(--border-default)' }}>
            <div className="type-meta-small uppercase tracking-wider mb-1 inline-flex items-center gap-1">
              Studio
              {/* Studio is a Patina-defined entity — the multi-user org that
                  holds designers, bookkeepers, etc. */}
              <StrataInfoIcon
                surfaceKey={SurfaceKeys.DesignerPortal.Team.Concept.Studio}
                size={11}
                ariaLabel="What is a Studio?"
                fallback="A Studio is your multi-user organization on Patina — it holds designers, bookkeepers, and external collaborators and lets you assign roles per project."
              />
            </div>
            <div className="type-section-head" style={{ fontSize: '1.15rem' }}>
              {studio.name}
            </div>
            {session?.user?.email && (
              <p className="mt-1 type-body text-[0.8rem] text-[var(--text-muted)]">
                Signed in as {session.user.email}
              </p>
            )}
          </div>

          <h2 className="type-section-head mb-3" style={{ fontSize: '1.15rem' }}>
            Project assignments
          </h2>
          {projectList.length === 0 ? (
            <p className="type-body italic text-[var(--text-muted)]">No active projects.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {projectList.map((p) => (
                <Link
                  key={p.id}
                  href={`/portal/projects/${p.id}`}
                  className="grid items-center gap-3 border-b py-3 no-underline transition-colors hover:bg-[var(--bg-hover)]"
                  style={{
                    gridTemplateColumns: '2fr 1.5fr 1fr',
                    borderColor: 'rgba(229, 226, 221, 0.6)',
                  }}
                >
                  <span className="type-label">{p.name}</span>
                  <span className="type-body text-[0.82rem] text-[var(--text-muted)]">
                    {p.client?.full_name ?? p.client_name ?? '—'}
                  </span>
                  <span className="type-meta-small uppercase tracking-wider text-right">
                    {p.status}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <p className="mt-6 type-body italic text-[var(--text-muted)] text-[0.82rem]">
            Studio-level invites and role-by-project assignment matrix are coming in Sprint 3.
            For now, add support designers from each project&apos;s detail page.
          </p>
        </>
      )}
    </div>
  );
}
