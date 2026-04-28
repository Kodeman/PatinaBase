'use client';

import { useProjectTeamMembers, type ProjectRole } from '@patina/supabase';

const ROLE_LABEL: Record<ProjectRole, string> = {
  lead_designer: 'Lead designer',
  support_designer: 'Support designer',
  vendor: 'Vendor',
  client: 'Client',
  bookkeeper: 'Bookkeeper',
};

export function TeamPanel({ projectId, leadDesignerName }: {
  projectId: string;
  leadDesignerName?: string;
}) {
  const { data: members, isLoading } = useProjectTeamMembers(projectId);

  return (
    <div className="my-6 grid gap-6 md:grid-cols-2">
      <div>
        <div className="mb-2 type-meta-small uppercase tracking-wider">Project team</div>
        {isLoading ? (
          <p className="type-body italic text-[var(--text-muted)]">Loading…</p>
        ) : (
          <div className="flex flex-col gap-1">
            {leadDesignerName && (
              <TeamRow name={leadDesignerName} role="lead_designer" />
            )}
            {(members ?? []).map((m) => (
              <TeamRow key={m.id} name={m.user?.full_name ?? 'Unnamed'} role={m.role} />
            ))}
            {(members ?? []).length === 0 && !leadDesignerName && (
              <p className="type-body italic text-[var(--text-muted)] text-[0.82rem]">
                No team members assigned yet.
              </p>
            )}
          </div>
        )}
      </div>

      <div>
        <div className="mb-2 type-meta-small uppercase tracking-wider">Quick actions</div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => alert('Invite designer — coming soon')}
            className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
            style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)' }}
          >
            + Invite designer
          </button>
          <button
            type="button"
            onClick={() => alert('Add bookkeeper — coming soon')}
            className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
            style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)' }}
          >
            + Add bookkeeper
          </button>
          <button
            type="button"
            onClick={() => alert('Reassign lead — coming soon')}
            className="rounded-[3px] border bg-transparent px-3 py-1.5 text-[0.8rem]"
            style={{ borderColor: 'var(--border-default)', fontFamily: 'var(--font-body)' }}
          >
            Reassign lead
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamRow({ name, role }: { name: string; role: ProjectRole }) {
  return (
    <div
      className="flex items-baseline justify-between border-b py-1.5 last:border-b-0"
      style={{ borderColor: 'var(--border-subtle)' }}
    >
      <span className="type-body text-[0.85rem] text-[var(--text-primary)]">{name}</span>
      <span className="type-meta-small uppercase tracking-wider text-[var(--text-muted)]">
        {ROLE_LABEL[role]}
      </span>
    </div>
  );
}
