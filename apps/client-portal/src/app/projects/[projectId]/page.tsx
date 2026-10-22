import { notFound } from 'next/navigation';

import { HeroPreloadLinks } from '@/components/threshold/editorial/house-issue';
import { Threshold } from '@/components/threshold/threshold';
import { fetchEnabledClientEditorial, heroPreloads } from '@/lib/data/client-editorial';
import { fetchClientProjectView, fetchClientProjects, fetchClientUser } from '@/lib/data/projects';
import { clientEditionEnabled } from '@/lib/server-feature-flag';
import { toOtherHouses } from '@/lib/threshold/other-houses';

interface ProjectPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: ProjectPageProps) {
  const editionDecision = fetchClientUser()
    .then((user) => clientEditionEnabled(user?.id))
    .catch(() => false);
  const { projectId } = await params;
  const [projects, projectView, editorial] = await Promise.all([
    fetchClientProjects(),
    fetchClientProjectView(projectId),
    // The House Issue's plates; null never blocks the house.
    editionDecision.then((enabled) => fetchEnabledClientEditorial(projectId, enabled)),
  ]);

  const headerProject = projects.find((project) => project.id === projectId);

  if (!projectView || !headerProject) {
    notFound();
  }

  const editionEnabled = await editionDecision;
  const { project, milestones } = projectView;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <HeroPreloadLinks preloads={heroPreloads(editorial)} />
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {/* The page stays server-side: same fetch, same notFound(). Only the
            surface itself is a client component, because the house reads its
            own data. */}
        <Threshold
          projectId={project.id}
          project={project}
          milestones={milestones}
          otherHouses={toOtherHouses(projects, project.id)}
          editorial={editorial}
          editionEnabled={editionEnabled}
        />
      </main>
    </div>
  );
}
