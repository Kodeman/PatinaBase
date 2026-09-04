import { notFound, redirect } from 'next/navigation';

import { ProjectSurfaceSwitch } from '@/components/making/project-surface-switch';
import { ProjectsEmptyState } from '@/components/projects/ProjectsEmptyState';
import { resolveActiveHouse } from '@/lib/data/active-project';
import { fetchClientProjectView, fetchClientProjects } from '@/lib/data/projects';

/**
 * The front door. Every client lands here, and lands inside a house: the one
 * that moved last. `/projects/[id]` still opens a named house directly, and
 * both routes render the same surface with the same fetch.
 *
 * `/` is a public path in middleware (it always was — it used to redirect),
 * so the signed-out visitor is sent to sign-in here rather than shown an
 * empty house.
 */
export default async function HomePage() {
  const projects = await fetchClientProjects();
  const active = await resolveActiveHouse(projects.map((project) => project.id));

  if (active.status === 'signed-out') {
    redirect('/auth/signin?callbackUrl=%2F');
  }

  if (!active.activeProjectId) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)]">
        <main className="mx-auto flex w-full max-w-6xl flex-col px-6 py-12">
          <ProjectsEmptyState />
        </main>
      </div>
    );
  }

  const projectView = await fetchClientProjectView(active.activeProjectId);
  if (!projectView) {
    notFound();
  }

  const { project, milestones } = projectView;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <ProjectSurfaceSwitch
          projectId={project.id}
          project={project}
          milestones={milestones}
          otherHouses={projects
            .filter((house) => house.id !== project.id)
            .map((house) => ({ id: house.id, name: house.name, location: house.location }))}
        />
      </main>
    </div>
  );
}
