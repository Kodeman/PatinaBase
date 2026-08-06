import { notFound } from 'next/navigation';

import { ProjectSurfaceSwitch } from '@/components/making/project-surface-switch';
import { fetchClientProjectView, fetchClientProjects } from '@/lib/data/projects';

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const [projects, projectView] = await Promise.all([
    fetchClientProjects(),
    fetchClientProjectView(projectId),
  ]);

  const headerProject = projects.find((project) => project.id === projectId);

  if (!projectView || !headerProject) {
    notFound();
  }

  const { project, milestones } = projectView;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* The page stays server-side: same fetch, same notFound(). Only the
            choice of surface moves to the client, where the `single-pane` flag
            can be read. Flag off or still loading = today's tree, exactly. */}
        <ProjectSurfaceSwitch
          projectId={project.id}
          project={project}
          milestones={milestones}
        />
      </main>
    </div>
  );
}
