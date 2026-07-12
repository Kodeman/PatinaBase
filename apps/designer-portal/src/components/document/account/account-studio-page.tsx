'use client';

/**
 * Account · Studio (Studio Workspace Provisioning, Workstream 4) — the
 * designer portal's self-serve home for the studio a designer works in.
 * No-studio state: a name + "Create studio" (`useCreateOrganization` →
 * `create_studio_workspace` RPC, 00295 — the client can never SELECT its own
 * insert before the owner membership exists, hence the SECURITY DEFINER
 * RPC). Studio state: inline rename, the member roster (role changes +
 * removal, owner/admin only — never against yourself or the last owner),
 * "Invite teammate" (opens StudioInviteModal), and "Leave studio" for
 * non-owners. Document-shell styling mirrors account-profile-page.tsx;
 * sibling account pages don't use help-system copy wrappers, so this one
 * doesn't either.
 */

import { useMemo, useState } from 'react';
import {
  useOrganizations,
  useOrganizationMembers,
  useCreateOrganization,
  useUpdateOrganization,
  useUpdateMemberRole,
  useRemoveMember,
  useLeaveOrganization,
  type MemberRole,
} from '@patina/supabase';
import { useAuth } from '@/hooks/use-auth';
import { Select, StatusBadge, type StatusTone } from '@/components/ui/controls';
import { monogramOf } from '@/lib/document/account-identity';
import { StudioInviteModal } from './studio-invite-modal';
import { studioEvents } from '@/lib/analytics/studio-events';

const FIELD =
  'w-full max-w-md border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[14px] text-[var(--color-charcoal)] outline-none transition-colors placeholder:text-[var(--text-faint)] focus:border-[var(--color-clay)]';
const LABEL =
  'mb-1 block font-mono text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';
const HELP = 'mt-1 text-[11px] leading-relaxed text-[var(--color-aged-oak)]';
const PRIMARY =
  'rounded-[5px] border border-[var(--color-clay)] bg-[var(--color-clay)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-charcoal)] transition-colors hover:bg-[var(--color-aged-oak)] hover:border-[var(--color-aged-oak)] disabled:opacity-50';
const GHOST =
  'rounded-[5px] border border-[var(--color-pearl)] px-3.5 py-1.5 text-[12px] font-medium text-[var(--color-mocha)] transition-colors hover:border-[var(--color-clay)] disabled:opacity-50';
const LINK =
  'font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)] disabled:opacity-50';
const LINK_DANGER =
  'font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-terracotta)] transition-colors hover:text-[var(--color-charcoal)] disabled:opacity-60';

const STATUS_TONE: Record<string, StatusTone> = { active: 'success', invited: 'warning' };

export function AccountStudioPage() {
  const { user } = useAuth();
  const { data: orgs, isLoading: orgsLoading } = useOrganizations();

  // Prefer a design_studio membership; fall back to the first org of any
  // type (mirrors account-identity.ts's activeStudio resolution, but keeps
  // the full org row this page needs for management).
  const studio = useMemo(
    () => orgs?.find((o) => o.type === 'design_studio') ?? orgs?.[0] ?? null,
    [orgs],
  );

  const { data: members } = useOrganizationMembers(studio?.id ?? '');

  const createOrg = useCreateOrganization();
  const updateOrg = useUpdateOrganization();
  const updateRole = useUpdateMemberRole();
  const removeMember = useRemoveMember();
  const leaveOrg = useLeaveOrganization();

  const [newStudioName, setNewStudioName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [inviteOpen, setInviteOpen] = useState(false);

  const myRole = studio?.membership.role ?? null;
  const canManage = myRole === 'owner' || myRole === 'admin';
  const ownerCount = useMemo(
    () => (members ?? []).filter((m) => m.role === 'owner' && m.status === 'active').length,
    [members],
  );

  const handleCreateStudio = () => {
    const name = newStudioName.trim();
    if (!name || createOrg.isPending) return;
    createOrg.mutate(
      { name },
      {
        onSuccess: () => {
          studioEvents.created();
          setNewStudioName('');
        },
      },
    );
  };

  const startRename = () => {
    if (!studio) return;
    setRenameValue(studio.name);
    setIsRenaming(true);
  };

  const handleSaveRename = () => {
    if (!studio) return;
    const name = renameValue.trim();
    if (!name || name === studio.name) {
      setIsRenaming(false);
      return;
    }
    updateOrg.mutate({ id: studio.id, name }, { onSuccess: () => setIsRenaming(false) });
  };

  const handleRoleChange = (memberId: string, role: MemberRole) => {
    updateRole.mutate({ memberId, role });
  };

  const handleRemove = (memberId: string, label: string) => {
    if (!confirm(`Remove ${label} from the studio?`)) return;
    removeMember.mutate(memberId);
  };

  const handleLeave = () => {
    if (!studio) return;
    if (!confirm(`Leave ${studio.name}? You'll lose access to its projects and clients.`)) return;
    leaveOrg.mutate(studio.id);
  };

  // ── No-studio state ───────────────────────────────────────────────────
  if (!orgsLoading && !studio) {
    return (
      <div className="pt-1">
        <p className={HELP}>
          Create a studio to invite designers and collaborators, assign roles, and share
          projects across your team.
        </p>
        <div className="mt-4">
          <label htmlFor="studio-new-name" className={LABEL}>
            Studio name
          </label>
          <input
            id="studio-new-name"
            type="text"
            value={newStudioName}
            onChange={(e) => setNewStudioName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateStudio();
            }}
            placeholder="Your studio's name"
            className={FIELD}
          />
        </div>
        <button
          type="button"
          onClick={handleCreateStudio}
          disabled={!newStudioName.trim() || createOrg.isPending}
          className={`${PRIMARY} mt-3`}
        >
          {createOrg.isPending ? 'Creating…' : 'Create studio'}
        </button>
        {createOrg.isError && (
          <p
            role="alert"
            className="mt-3 border-l-2 border-[var(--color-terracotta)] pl-3 text-[12px] text-[var(--color-terracotta)]"
          >
            {createOrg.error instanceof Error
              ? createOrg.error.message
              : 'Failed to create your studio.'}
          </p>
        )}
      </div>
    );
  }

  if (orgsLoading || !studio) {
    return (
      <p className="py-3 text-[12px] italic text-[var(--color-aged-oak)]">
        Reading your studio…
      </p>
    );
  }

  // ── Studio state ──────────────────────────────────────────────────────
  return (
    <div className="pt-1">
      {/* Identity */}
      <div className="mb-6">
        {isRenaming ? (
          <div className="max-w-md">
            <label htmlFor="studio-rename" className={LABEL}>
              Studio name
            </label>
            <input
              id="studio-rename"
              type="text"
              value={renameValue}
              autoFocus
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSaveRename();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              className={FIELD}
            />
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={handleSaveRename}
                disabled={updateOrg.isPending}
                className={PRIMARY}
              >
                {updateOrg.isPending ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => setIsRenaming(false)} className={GHOST}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="truncate font-heading text-xl text-[var(--color-charcoal)]">
                {studio.name}
              </h2>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]">
                {studio.slug}
              </p>
            </div>
            {canManage && (
              <button type="button" onClick={startRename} className={`${LINK} shrink-0`}>
                Rename
              </button>
            )}
          </div>
        )}
        {updateOrg.isError && (
          <p role="alert" className="mt-2 text-[12px] text-[var(--color-terracotta)]">
            {updateOrg.error instanceof Error ? updateOrg.error.message : 'Failed to save.'}
          </p>
        )}
      </div>

      {/* Members */}
      <div className="mb-2 flex items-center justify-between">
        <h3 className={LABEL}>Members</h3>
        {canManage && (
          <button type="button" onClick={() => setInviteOpen(true)} className={LINK}>
            + Invite teammate
          </button>
        )}
      </div>

      {members === undefined ? (
        <p className="py-3 text-[12px] italic text-[var(--color-aged-oak)]">
          Reading members…
        </p>
      ) : (
        <ul>
          {members.map((m) => {
            const label = m.profiles?.display_name || m.profiles?.email || 'Invited teammate';
            const isSelf = m.user_id === user?.id;
            const isLastOwner = m.role === 'owner' && ownerCount <= 1;
            const showControls = canManage && !isSelf && !isLastOwner;

            return (
              <li
                key={m.id}
                className="flex items-center justify-between gap-3 border-b border-[var(--color-pearl)] py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--color-pearl)] font-mono text-[11px] uppercase tracking-wider text-[var(--color-mocha)]">
                    {monogramOf(m.profiles?.display_name, m.profiles?.email ?? '')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] text-[var(--color-charcoal)]">
                      {label}
                      {isSelf && <span className="text-[var(--color-aged-oak)]"> (you)</span>}
                    </p>
                    {m.profiles?.display_name && m.profiles?.email && (
                      <p className="truncate text-[11px] text-[var(--color-aged-oak)]">
                        {m.profiles.email}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <StatusBadge tone={STATUS_TONE[m.status] ?? 'neutral'} dot>
                    {m.status}
                  </StatusBadge>
                  {showControls ? (
                    <>
                      <Select
                        aria-label={`Role for ${label}`}
                        value={m.role}
                        onChange={(e) => handleRoleChange(m.id, e.target.value as MemberRole)}
                        disabled={updateRole.isPending}
                        wrapperClassName="w-28"
                      >
                        <option value="owner">Owner</option>
                        <option value="admin">Admin</option>
                        <option value="member">Member</option>
                      </Select>
                      <button
                        type="button"
                        onClick={() => handleRemove(m.id, label)}
                        disabled={removeMember.isPending}
                        className={LINK}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="font-mono text-[9.5px] uppercase tracking-[0.06em] text-[var(--color-aged-oak)]">
                      {m.role}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Leave studio — owners must transfer ownership first (no self-serve
          path for the last owner; UI-level guard, see isLastOwner above). */}
      {myRole !== 'owner' && (
        <div className="mt-6 border-t border-[var(--color-pearl)] pt-4">
          <button
            type="button"
            onClick={handleLeave}
            disabled={leaveOrg.isPending}
            className={LINK_DANGER}
          >
            {leaveOrg.isPending ? 'Leaving…' : 'Leave studio'}
          </button>
        </div>
      )}

      <StudioInviteModal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        organizationId={studio.id}
      />
    </div>
  );
}
