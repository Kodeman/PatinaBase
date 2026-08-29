'use client';

/**
 * Member title line (U4) — the DM-mono line under a member's name that
 * carries their studio title. Own-row: there is deliberately no own-row
 * UPDATE policy on `organization_members` (see 00415/00416's comment block),
 * so a member editing their own row always goes through the
 * `set_my_member_title` RPC. Other-row: an owner/admin viewer edits over the
 * existing 00068 admin policy, which also writes `staff_role` when the pick
 * was one of the nine curated titles (never for free text).
 */

import { useState } from 'react';
import { useSetMyMemberTitle, useUpdateMemberStaffRole } from '@patina/supabase';
import {
  TitlePicker,
  findStaffRoleByLabel,
  type PermissionTier,
} from './title-picker';

export interface MemberTitleLineProps {
  organizationId: string;
  memberId: string;
  jobTitle: string | null;
  isSelf: boolean;
  viewerIsOwnerOrAdmin: boolean;
  className?: string;
}

export function MemberTitleLine({
  organizationId,
  memberId,
  jobTitle,
  isSelf,
  viewerIsOwnerOrAdmin,
  className,
}: MemberTitleLineProps) {
  const [open, setOpen] = useState(false);
  const setMyTitle = useSetMyMemberTitle();
  const updateStaffRole = useUpdateMemberStaffRole();

  const canEdit = isSelf || viewerIsOwnerOrAdmin;
  const saving = setMyTitle.isPending || updateStaffRole.isPending;
  const failed = setMyTitle.isError || updateStaffRole.isError;

  const handlePick = (title: string, suggestedTier?: PermissionTier) => {
    if (isSelf) {
      setMyTitle.mutate({ organizationId, jobTitle: title });
    } else {
      const curatedRole = suggestedTier ? findStaffRoleByLabel(title) : undefined;
      updateStaffRole.mutate({
        memberId,
        organizationId,
        jobTitle: title,
        staffRole: curatedRole ?? null,
      });
    }
    setOpen(false);
  };

  if (!canEdit) {
    if (!jobTitle) return null;
    return (
      <span
        className={`block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] ${className ?? ''}`}
      >
        {jobTitle}
      </span>
    );
  }

  return (
    <span className={`relative inline-block ${className ?? ''}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={saving}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={
          jobTitle
            ? 'da-score-hover block min-h-11 min-w-11 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)] transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]'
            : 'da-score-hover inline-flex min-h-11 min-w-11 items-center font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-[var(--color-clay-ink)] transition-colors disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-clay)]'
        }
      >
        {jobTitle || 'Set title'}
      </button>

      {open && (
        <TitlePicker
          value={jobTitle}
          onPick={handlePick}
          onClose={() => setOpen(false)}
          showTierHints
          className="left-0 top-full mt-1"
        />
      )}

      {failed && (
        <p role="alert" className="mt-1 text-[11px] text-[var(--color-terracotta-ink)]">
          Failed to save the title.
        </p>
      )}
    </span>
  );
}
