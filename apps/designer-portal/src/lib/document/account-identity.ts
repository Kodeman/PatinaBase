/**
 * Account identity helpers for the document model — the monogram fallback and
 * the "which studio am I in" resolution shared by the nameplate and the Account
 * sheet. The studio answers the client's literal question ("what account is
 * this logged into") so it must resolve consistently in both places.
 */

import type { OrganizationWithMembership } from '@patina/supabase';

/** First+last initials of a name, or the first two chars of the email. */
export function monogramOf(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export interface ActiveStudio {
  name: string;
  role: string;
}

/**
 * The studio shown in the nameplate: prefer a design_studio membership, fall
 * back to the first org of any type. Returns null when the user belongs to no
 * organization — callers then render person-only (no studio line).
 */
export function activeStudio(
  orgs: OrganizationWithMembership[] | undefined | null,
): ActiveStudio | null {
  if (!orgs || orgs.length === 0) return null;
  const studio = orgs.find((o) => o.type === 'design_studio') ?? orgs[0];
  return {
    name: studio.name,
    role: studio.membership?.role ?? 'member',
  };
}
