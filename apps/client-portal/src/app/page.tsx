import { Threshold } from '@/components/threshold/threshold';
import { ProjectsEmptyState } from '@/components/projects/ProjectsEmptyState';
import {
  resolveActiveHouse,
  resolveHouseForInstrument,
} from '@/lib/data/active-project';
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
export default async function HomePage(props?: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const projects = await fetchClientProjects();
  const projectIds = projects.map((project) => project.id);
  const query = (await props?.searchParams) ?? {};
  const one = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

  // A fold from `/invoices/<id>` or `/proposals/<id>` names the instrument it
  // was sent about. Those are the money and signature paths, and the active
  // house is the wrong answer for a client with more than one: the letterbox
  // would show a different invoice and the door whatever that house happens to
  // have pending. Resolve the instrument's own house first; the active-house
  // clocks decide only when nothing names one.
  const namedProjectId = await resolveHouseForInstrument(projectIds, {
    invoiceId: one(query.invoice),
    proposalId: one(query.proposal),
  });
  const activeProjectId =
    namedProjectId ?? (await resolveActiveHouse(projectIds));

  // The house that moved last, then the rest in the list's own order. A client
  // who HAS houses must land in one of them: the chrome drops the header on
  // `/`, so an empty state here would strand her with no navigation and tell
  // her she has no projects.
  const candidates = activeProjectId
    ? [activeProjectId, ...projectIds.filter((id) => id !== activeProjectId)]
    : projectIds;

  let projectView: Awaited<ReturnType<typeof fetchClientProjectView>> = null;
  for (const candidateId of candidates) {
    projectView = await fetchClientProjectView(candidateId);
    if (projectView) break;
  }

  // No house at all, or not one of them opens (a deletion mid-request, an RLS
  // skew between the two selects): the front door is not the place for a 404.
  // `/projects/<id>` still answers one.
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
        <Threshold
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
