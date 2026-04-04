import { notFound } from 'next/navigation';

import { ClientHeader } from '@/components/layout/client-header';
import { ProjectViewWrapper } from '@/components/project-view-wrapper';
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

  const { project, milestones, lastUpdated } = projectView;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <ClientHeader
        projects={projects}
        activeProjectId={project.id}
        approvalsPending={project.approvalsPending}
        unreadMessages={project.unreadMessages}
        lastUpdated={lastUpdated}
      />
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <ProjectViewWrapper
          projectId={project.id}
          project={project}
          milestones={milestones}
          showOverview={true}
        />
      </main>
    </div>
  );
}
