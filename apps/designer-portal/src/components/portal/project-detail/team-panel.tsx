'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useProjectTeamMembers, type ProjectRole } from '@patina/supabase';
import { Button } from '@/components/ui/controls';
import { InviteDesignerModal } from './invite-designer-modal';
import { AddBookkeeperModal } from './add-bookkeeper-modal';
import { ReassignLeadModal } from './reassign-lead-modal';
import { BriefVendorModal } from './brief-vendor-modal';

const ROLE_LABEL: Record<ProjectRole, string> = {
  lead_designer: 'Lead designer',
  support_designer: 'Support designer',
  vendor: 'Vendor',
  client: 'Client',
  bookkeeper: 'Bookkeeper',
  previous_lead: 'Former lead',
};

export function TeamPanel({ projectId, leadDesignerName, currentDesignerId }: {
  projectId: string;
  leadDesignerName?: string;
  currentDesignerId?: string;
}) {
  const { data: members, isLoading } = useProjectTeamMembers(projectId);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [bookkeeperOpen, setBookkeeperOpen] = useState(false);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [briefVendorOpen, setBriefVendorOpen] = useState(false);

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
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setInviteOpen(true)}
          >
            + Invite designer
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setBookkeeperOpen(true)}
          >
            + Add bookkeeper
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setReassignOpen(true)}
          >
            Reassign lead
          </Button>
          <Button variant="secondary" size="sm" asChild>
            <Link
              href={`/portal/projects/${projectId}/scope-change`}
              className="no-underline"
            >
              + Initiate scope change
            </Link>
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setBriefVendorOpen(true)}
          >
            + Brief vendor
          </Button>
        </div>
      </div>
      <InviteDesignerModal
        projectId={projectId}
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
      />
      <AddBookkeeperModal
        projectId={projectId}
        open={bookkeeperOpen}
        onClose={() => setBookkeeperOpen(false)}
      />
      {currentDesignerId && (
        <ReassignLeadModal
          projectId={projectId}
          currentDesignerId={currentDesignerId}
          open={reassignOpen}
          onClose={() => setReassignOpen(false)}
        />
      )}
      <BriefVendorModal
        projectId={projectId}
        open={briefVendorOpen}
        onClose={() => setBriefVendorOpen(false)}
      />
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
