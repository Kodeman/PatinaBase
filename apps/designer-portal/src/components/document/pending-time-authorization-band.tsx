'use client';

interface PendingTimeRow {
  project_id: string;
  duration_minutes: number | null;
}

interface ProjectLabel {
  id: string;
  name: string | null;
}

function minutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours === 0) return `${remainder}m`;
  if (remainder === 0) return `${hours}h`;
  return `${hours}h ${remainder}m`;
}

export function PendingTimeAuthorizationBand({
  rows,
  projects,
  onSelectProject,
}: {
  rows: PendingTimeRow[];
  projects: ProjectLabel[];
  onSelectProject: (projectId: string) => void;
}) {
  if (rows.length === 0) return null;

  const projectNames = new Map(projects.map((project) => [project.id, project.name]));
  const minutesByProject = new Map<string, number>();
  for (const row of rows) {
    minutesByProject.set(
      row.project_id,
      (minutesByProject.get(row.project_id) ?? 0) + (row.duration_minutes ?? 0),
    );
  }
  const totalMinutes = [...minutesByProject.values()].reduce((sum, minutes) => sum + minutes, 0);

  return (
    <section
      role="status"
      className="mb-4 border-l-2 border-[var(--color-clay)] bg-[rgba(196,165,123,0.08)] px-3 py-2.5"
    >
      <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.07em] text-[var(--color-charcoal)]">
        {minutesLabel(totalMinutes)} pending billing authority
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]">
        These hours are visible, but cannot be billed until a services agreement authorizes a rate.
      </p>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {[...minutesByProject.entries()].map(([projectId, minutes]) => {
          const name = projectNames.get(projectId) || 'Untitled project';
          return (
            <button
              key={projectId}
              type="button"
              aria-label={`Review ${name} billing setup`}
              onClick={() => onSelectProject(projectId)}
              className="font-mono text-[9px] uppercase tracking-[0.06em] text-[var(--color-clay)] underline decoration-dotted underline-offset-4 hover:text-[var(--color-charcoal)]"
            >
              {name} · {minutesLabel(minutes)} →
            </button>
          );
        })}
      </div>
    </section>
  );
}
