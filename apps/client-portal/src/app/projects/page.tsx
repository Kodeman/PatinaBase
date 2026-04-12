import Link from 'next/link';

import { ClientHeader } from '@/components/layout/client-header';
import { StrataMark } from '@/components/strata-mark';
import { fetchClientProjects } from '@/lib/data/projects';
import { formatPercentage } from '@/lib/utils/format';

export default async function ProjectsPage() {
  const projects = await fetchClientProjects();
  const approvalsPending = projects.reduce((total, project) => total + project.approvalsPending, 0);
  const unreadMessages = projects.reduce((total, project) => total + project.unreadMessages, 0);

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ClientHeader
        projects={projects}
        approvalsPending={approvalsPending}
        unreadMessages={unreadMessages}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col px-6 py-12">
        {/* Hero */}
        <section>
          <p className="type-meta">Your projects</p>
          <h1 className="type-page-title mt-4">
            Dive into each project timeline to see progress, review decisions, and stay in sync with your Patina team.
          </h1>
          <p className="type-body mt-4">
            Choose a project below to open its immersive timeline. You can approve deliverables, review documents, and keep the
            conversation going directly in context.
          </p>
        </section>

        <StrataMark variant="mini" />

        {/* Project list */}
        <section>
          {projects.map((project, index) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group block border-b border-[var(--border-default)] py-6 transition hover:bg-[rgba(196,165,123,0.04)]"
            >
              <div className="flex items-start justify-between gap-6">
                <div className="min-w-0 flex-1">
                  <h2 className="type-item-name group-hover:text-[var(--accent-primary)] transition-colors">
                    {project.name}
                  </h2>
                  {project.location ? (
                    <p className="type-meta mt-1">{project.location}</p>
                  ) : null}

                  {/* Thin progress bar */}
                  <div className="mt-3 h-[2px] w-full overflow-hidden bg-[var(--border-default)]">
                    <div
                      className="h-full bg-[var(--accent-primary)] transition-[width] duration-300"
                      style={{ width: `${Math.max(2, Math.round(project.progressPercentage))}%` }}
                    />
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-4">
                    {project.nextMilestoneTitle ? (
                      <p className="type-body-small">
                        Next: <span className="font-heading font-medium text-[var(--text-primary)]">{project.nextMilestoneTitle}</span>
                      </p>
                    ) : null}
                    <span className="type-meta">{project.approvalsPending} {project.approvalsPending === 1 ? 'approval' : 'approvals'}</span>
                    <span className="type-meta">{project.unreadMessages} {project.unreadMessages === 1 ? 'message' : 'messages'}</span>
                  </div>
                </div>

                {/* Large progress numeral */}
                <div className="flex flex-col items-end">
                  <span className="type-data-large">{Math.round(project.progressPercentage)}</span>
                  <span className="type-meta-small">% complete</span>
                </div>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
