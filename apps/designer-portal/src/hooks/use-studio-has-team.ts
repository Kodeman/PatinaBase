'use client';

/**
 * "Does my active studio have more than one active member?" — the single
 * cheap signal that gates owner-attribution bylines on shared-workspace list
 * rows (Studio Wave 5). Wave 0's RLS widening means studio co-members now see
 * each other's projects/clients everywhere; this hook is how a list decides
 * whether to spend the pixels naming the owner.
 *
 * Resolves the active studio the SAME way the nameplate/Account sheet do
 * (`activeStudio()` in `@/lib/document/account-identity`: prefer a
 * `design_studio` membership, else the first org) off the already-cached
 * `useOrganizations()` query, then counts that org's ACTIVE roster via the
 * existing `useOrganizationMembers` cache. One extra query per page (not per
 * row) — no N+1. Every solo designer sits alone in their auto-provisioned
 * personal studio (00295), so this resolves to `false` for them with zero
 * visible change — the safe-rollout property the plan calls for.
 */

import { useMemo } from 'react';
import { useOrganizations, useOrganizationMembers } from '@patina/supabase';

export function useStudioHasTeam(): boolean {
  const { data: orgs } = useOrganizations();

  // Same selection rule as activeStudio() in account-identity.ts, kept here
  // (rather than importing it) because that helper returns {name, role} —
  // this needs the org id to look up the roster.
  const studioId = useMemo(() => {
    if (!orgs || orgs.length === 0) return null;
    const studio = orgs.find((o) => o.type === 'design_studio') ?? orgs[0];
    return studio.id;
  }, [orgs]);

  const { data: members } = useOrganizationMembers(studioId ?? '');

  return useMemo(
    () => (members ?? []).filter((m) => m.status === 'active').length > 1,
    [members]
  );
}
