import Link from 'next/link';

import { ClientHeader } from '@/components/layout/client-header';
import { fetchClientProjects } from '@/lib/data/projects';
import { formatPercentage } from '@/lib/utils/format';

export default async function ProjectsPage() {
  const projects = await fetchClientProjects();
  const approvalsPending = projects.reduce((total, project) => total + project.approvalsPending, 0);
  const unreadMessages = projects.reduce((total, project) => total + project.unreadMessages, 0);

  return (
    <div className="min-h-screen bg-[var(--color-canvas)]">
      <ClientHeader
        projects={projects}
        approvalsPending={approvalsPending}
        unreadMessages={unreadMessages}
      />
      <main className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 py-12">
        <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-card)] px-8 py-10 shadow-xl">
          <p className="text-sm uppercase tracking-[0.4em] text-[var(--color-muted)]">Your projects</p>
          <h1 className="mt-4 font-[var(--font-playfair)] text-4xl text-[var(--color-text)]">
            Dive into each project timeline to see progress, review decisions, and stay in sync with your Patina team.
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-[var(--color-muted)]">
            Choose a project below to open its immersive timeline. You can approve deliverables, review documents, and keep the
            conversation going directly in context.
          </p>
        </section>

        <section className="grid gap-6 md:grid-cols-2">
          {projects.map((project) => (
            <Link
              key={project.id}
              href={`/projects/${project.id}`}
              className="group flex h-full flex-col gap-4 rounded-3xl border border-[var(--color-border)] bg-white/80 p-6 shadow-lg transition hover:border-[var(--color-accent)] focus-visible:focus-ring"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="font-[var(--font-playfair)] text-2xl text-[var(--color-text)]">{project.name}</h2>
                  {project.location ? (
                    <p className="text-sm text-[var(--color-muted)]">{project.location}</p>
                  ) : null}
                </div>
                <span className="text-sm font-medium text-[var(--color-muted)]">{project.status}</span>
              </div>
              <div className="flex items-center gap-3 text-sm text-[var(--color-muted)]">
                <span className="text-lg font-semibold text-[var(--color-text)]">
                  {formatPercentage(project.progressPercentage)} complete
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--color-canvas)]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-text)] transition-[width] duration-300"
                    style={{ width: `${Math.max(6, Math.round(project.progressPercentage))}%` }}
                  />
                </div>
              </div>
              {project.nextMilestoneTitle ? (
                <p className="text-sm text-[var(--color-muted)]">
                  Next milestone: <span className="font-medium text-[var(--color-text)]">{project.nextMilestoneTitle}</span>
                </p>
              ) : null}
              <div className="mt-auto flex items-center justify-between text-xs text-[var(--color-muted)]">
                <span>{project.approvalsPending} approvals awaiting</span>
                <span>{project.unreadMessages} new messages</span>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
