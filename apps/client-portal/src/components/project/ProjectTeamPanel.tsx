'use client';

import { useProjectParties, useProjectTeamMembers, useStudioIdentity } from '@patina/supabase';
import { getFieldTradeLabel, type PartyKind } from '@patina/types';

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

/**
 * "On the job" plain-English label — client house style, not the internal
 * kind vocab (Call Sheet Wave 4, R4/U2). A sub reads by its trade ("Tile"),
 * everyone else by a short role word. Deliberately local: @patina/types'
 * PARTY_KIND_LABELS is written for designer-portal chrome ("General
 * Contractor", "Receiver") and doesn't match the wording this panel wants.
 */
function onJobLabel(kind: PartyKind | string | null | undefined, trade?: string | null): string {
  switch (kind) {
    case 'gc':
      return 'General contractor';
    case 'sub':
      return trade ? getFieldTradeLabel(trade) : 'Subcontractor';
    case 'installer':
      return 'Installer';
    case 'receiver':
      return 'Receiving';
    case 'architect':
      return 'Architect';
    case 'photographer':
      return 'Photographer';
    case 'stager':
      return 'Stager';
    case 'vendor':
      return 'Vendor';
    default:
      return kind ?? '';
  }
}

/** A row's avatar is a square when the company IS the identity on the job —
 *  no named contact, just the firm (slide 9's "circles + squares" idiom,
 *  matched here rather than importing designer-portal's Avatar). */
function isCompanyIdentity(displayName?: string | null, companyName?: string | null) {
  if (!companyName) return false;
  return !displayName?.trim() || displayName.trim() === companyName.trim();
}

export function ProjectTeamPanel({ projectId }: { projectId: string }) {
  const { data: members = [], isLoading } = useProjectTeamMembers(projectId);
  const { data: identity } = useStudioIdentity({ projectId });
  const { data: parties = [] } = useProjectParties(projectId);
  const studioName = identity?.name ?? 'Your design team';

  // RLS on project_parties already returns only show_to_client=true rows for
  // a client session (00420's project_parties_client_select) — the explicit
  // filter is belt-and-suspenders so a designer previewing the client portal
  // in dev never sees an unflagged row (Call Sheet Wave 4, R4/U2).
  const onTheJob = parties.filter((party) => party.show_to_client === true);

  return (
    <section
      className="rounded-lg border border-[var(--border-default)] bg-white p-5"
      data-testid="project-team-panel"
    >
      <div
        className="mb-4 flex items-center gap-3 border-b border-[var(--border-default)] pb-4"
        data-testid="project-team-studio-header"
      >
        {identity?.logoUrl ? (
          <img
            src={identity.logoUrl}
            alt=""
            className="h-10 w-10 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-medium text-[var(--text-muted)]"
            style={{ background: 'rgba(196,165,123,0.12)' }}
          >
            {initials(studioName)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-[var(--text-primary)]">{studioName}</p>
          {identity?.source === 'studio' && identity.website && (
            <a
              href={identity.website}
              target="_blank"
              rel="noreferrer noopener"
              className="type-meta-small truncate text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:underline"
            >
              {identity.website}
            </a>
          )}
        </div>
      </div>

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

      {onTheJob.length > 0 && (
        <div
          className="mt-5 border-t border-[var(--border-default)] pt-4"
          data-testid="project-on-the-job"
        >
          <h3 className="font-heading text-base text-[var(--text-primary)] mb-3">
            On the job
          </h3>
          <ul className="space-y-3">
            {onTheJob.map((party) => {
              const name = party.display_name ?? party.company_name ?? 'On the job';
              const square = isCompanyIdentity(party.display_name, party.company_name);
              return (
                <li key={party.id} className="flex items-center gap-3">
                  <div
                    className={`flex h-9 w-9 shrink-0 items-center justify-center text-sm font-medium text-[var(--text-muted)] ${
                      square ? 'rounded-[8px]' : 'rounded-full'
                    }`}
                    style={{ background: 'rgba(196,165,123,0.12)' }}
                  >
                    {initials(name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                      {name}
                    </p>
                    <p className="type-meta-small text-[var(--text-muted)]">
                      {onJobLabel(party.party_kind, party.trade)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
