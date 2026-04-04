'use client';

import { useProjects } from '@/hooks/use-projects';
import { StrataMark } from '@/components/portal/strata-mark';
import { LoadingStrata } from '@/components/portal/loading-strata';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyProject = any;

export default function PortfolioPage() {
  const { data: rawProjects, isLoading } = useProjects({ status: 'completed' });
  const projects = (Array.isArray(rawProjects) ? rawProjects : []) as AnyProject[];

  if (isLoading) return <LoadingStrata />;

  return (
    <div className="pt-8">
      <h1 className="type-section-head mb-6">Portfolio</h1>

      {projects.length > 0 ? (
        <div>
          {projects.map((project: AnyProject, i: number) => (
            <div key={project.id}>
              <div className="py-6">
                <span className="type-item-name">{project.name}</span>
                {project.client_name && (
                  <span className="type-label-secondary ml-2">{project.client_name}</span>
                )}
                {project.completed_at || project.updated_at ? (
                  <span className="type-meta ml-3">
                    {new Date(project.completed_at || project.updated_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })}
                  </span>
                ) : null}
                {project.notes && (
                  <p className="type-body mt-3 max-w-[640px]">{project.notes}</p>
                )}
              </div>
              {i < projects.length - 1 && <StrataMark variant="micro" />}
            </div>
          ))}
        </div>
      ) : (
        <p className="type-body py-16 text-center italic text-[var(--text-muted)]">
          Completed projects will showcase here as your portfolio.
        </p>
      )}
    </div>
  );
}
