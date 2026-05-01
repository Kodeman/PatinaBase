'use client';

import { useProjectTeamMembers } from '@patina/supabase';

const ROLE_LABEL: Record<string, string> = {
  lead_designer: 'Lead Designer',
  support_designer: 'Support Designer',
  vendor: 'Vendor',
  client: 'Client',
  bookkeeper: 'Bookkeeper',
  previous_lead: 'Previous Lead',
};

function initials(name?: string | null) {
  if (!name) return '??';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function ProjectTeamPanel({ projectId }: { projectId: string }) {
  const { data: members = [], isLoading } = useProjectTeamMembers(projectId);

  return (
    <section
      className="rounded-lg border border-[var(--border-default)] bg-white p-5"
      data-testid="project-team-panel"
    >
      <h3 className="font-heading text-base text-[var(--text-primary)] mb-3">Your team</h3>
      {isLoading ? (
        <p className="type-body-small text-[var(--text-muted)]">Loading…</p>
      ) : members.length === 0 ? (
        <p className="type-body-small text-[var(--text-muted)]">
          No team members assigned yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {members
            .filter((m) => m.role !== 'client')
            .map((member) => {
              const name = member.user?.full_name ?? 'Team member';
              return (
                <li key={member.id} className="flex items-center gap-3">
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-medium text-[var(--text-muted)]"
                    style={{ background: 'rgba(196,165,123,0.12)' }}
                  >
                    {initials(name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {name}
                    </p>
                    <p className="type-meta-small text-[var(--text-muted)]">
                      {ROLE_LABEL[member.role] ?? member.role}
                    </p>
                  </div>
                </li>
              );
            })}
        </ul>
      )}
    </section>
  );
}
