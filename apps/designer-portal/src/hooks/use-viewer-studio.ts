'use client';

/**
 * The studio this viewer answers for on the Hours surfaces (HT-3 · HT-8).
 *
 * `useOrganizations` selects `organization_members` with no `.order()`, so
 * PostgREST row order is unspecified: a viewer who owns or administers TWO
 * design studios was previously keyed on whichever membership happened to come
 * back first — the lens gate, the studio scope's rollup, the member scope's
 * rollup and the studio a repair offers to name, all able to change between page
 * loads under a caption that named no studio at all. So the candidates are
 * ordered here, by name then id, and the caller prints the name it got.
 *
 * Two deliberate absences:
 *  · No `orgs[0]` fallback. Owning a manufacturer or a contractor org is not
 *    standing over a studio's hours, and the old fallback made such a viewer an
 *    Hours admin keyed on a studio that prices nothing.
 *  · No studio for a plain member. HT-8 gives her no lens, and what she keeps —
 *    her own rows and `project_hours_total` — needs no studio key.
 */

import { useMemo } from 'react';
import { useOrganizations } from '@patina/supabase';

type ViewerOrganization = NonNullable<
  ReturnType<typeof useOrganizations>['data']
>[number];

export interface ViewerStudio {
  /** Every org the viewer belongs to — the caller still names studios by id. */
  organizations: ViewerOrganization[] | undefined;
  /** The one design studio she owns or administers, or null. */
  studio: ViewerOrganization | null;
  /** HT-8's gate: there IS such a studio, so the lens and the repairs stand. */
  isOwnerOrAdmin: boolean;
  /**
   * The membership read has ANSWERED — well or badly. A caller that lands the
   * viewer in a scope must wait for this: `data` alone never arrives on a
   * failed read, so "still loading" and "could not be read" are the same
   * absence, and a sheet that waits on `data` waits forever.
   */
  isSettled: boolean;
}

export function useViewerStudio(): ViewerStudio {
  const { data: organizations, isError } = useOrganizations();

  const studio = useMemo(() => {
    const candidates = (organizations ?? []).filter(
      (org) =>
        org.type === 'design_studio' &&
        (org.membership?.role === 'owner' || org.membership?.role === 'admin'),
    );
    // Stable across loads, which an unordered PostgREST read is not.
    candidates.sort(
      (a, b) =>
        (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id),
    );
    return candidates[0] ?? null;
  }, [organizations]);

  return {
    organizations,
    studio,
    isOwnerOrAdmin: studio !== null,
    isSettled: organizations !== undefined || isError === true,
  };
}
