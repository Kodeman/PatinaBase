import { notFound } from 'next/navigation';

import { HeroPreloadLinks } from '@/components/threshold/editorial/house-issue';
import { ServiceAcceptanceDoor } from '@/components/service-acceptance/service-acceptance-door';
import { Threshold } from '@/components/threshold/threshold';
import { fetchClientEditorial, heroPreloads } from '@/lib/data/client-editorial';
import { fetchClientProjectView, fetchClientProjects } from '@/lib/data/projects';
import { toOtherHouses } from '@/lib/threshold/other-houses';

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const { projectId } = await params;
  const [projects, projectView, editorial] = await Promise.all([
    fetchClientProjects(),
    fetchClientProjectView(projectId),
    // The House Issue's plates; null never blocks the house.
    fetchClientEditorial(projectId),
  ]);

  const headerProject = projects.find((project) => project.id === projectId);

  if (!projectView || !headerProject) {
    notFound();
  }

  const { project, milestones } = projectView;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <HeroPreloadLinks preloads={heroPreloads(editorial)} />
      <main className="w-full min-w-0">
        <ServiceAcceptanceDoor projectId={project.id} />
        {/* The page stays server-side: same fetch, same notFound(). Only the
            surface itself is a client component, because the house reads its
            own data. */}
        <Threshold
          projectId={project.id}
          project={project}
          milestones={milestones}
          otherHouses={toOtherHouses(projects, project.id)}
          editorial={editorial}
        />
      </main>
    </div>
  );
}
