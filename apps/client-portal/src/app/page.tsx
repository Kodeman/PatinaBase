import { ProjectSurfaceSwitch } from '@/components/making/project-surface-switch';
import { ProjectsEmptyState } from '@/components/projects/ProjectsEmptyState';
import { resolveActiveHouse } from '@/lib/data/active-project';
import { fetchClientProjectView, fetchClientProjects } from '@/lib/data/projects';
import { toOtherHouses } from '@/lib/threshold/other-houses';

/**
 * The front door. Every client lands here, and lands inside a house: the one
 * that moved last. `/projects/[id]` still opens a named house directly, and
 * both routes render the same surface with the same fetch.
 *
 * `/` is a protected route — middleware owns the signed-out redirect and the
 * portal-role check, exactly as it did for `/projects`, which this route
 * replaced — so anything that reaches this function is a signed-in client of
 * this portal.
 */
export default async function HomePage() {
  const projects = await fetchClientProjects();
  const activeProjectId = await resolveActiveHouse(projects.map((project) => project.id));

  const projectView = activeProjectId ? await fetchClientProjectView(activeProjectId) : null;

  // No house, or a house the list named and the detail read cannot open (a
  // deletion mid-request, an RLS skew between the two selects): the front
  // door is not the place for a 404. `/projects/<id>` still answers one.
  if (!projectView) {
    return (
      <div className="min-h-screen bg-[var(--bg-primary)]">
        <main className="mx-auto flex w-full max-w-6xl flex-col px-6 py-12">
          <ProjectsEmptyState />
        </main>
      </div>
    );
  }

  const { project, milestones } = projectView;

  return (
    <div className="min-h-screen bg-[var(--bg-primary)]">
      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        <ProjectSurfaceSwitch
          projectId={project.id}
          project={project}
          milestones={milestones}
          otherHouses={toOtherHouses(projects, project.id)}
          viewSource="front-door"
        />
      </main>
    </div>
  );
}
