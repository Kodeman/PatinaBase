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

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useOrganizations } from '@patina/supabase';

/**
 * S-1 / n7-05 — WHICH studio, when she answers for two.
 *
 * `useViewerStudio` used to sort the candidates and return `candidates[0]` with
 * nothing able to change it. Measured on the repo's own default seed, where
 * designer@patina.dev owns BOTH 'Leah Hartwell' and 'Local Dev Studio': 120
 * minutes logged on a document priced by Local Dev Studio read 2H 00M under
 * `mine`, and one click to `the studio` read
 * 'THE STUDIO · LEAH HARTWELL · THIS WEEK / 0 min / Nothing logged in this
 * window.' — a studio told it logged nothing while its hours sat one click
 * above, with no door to the second studio anywhere. Not exotic: 00295
 * provisions a one-person workspace at every designer grant, so a hire seated
 * admin in her employer's studio has exactly two candidates.
 *
 * So the pick is a CHOICE now, held in one module-level store rather than in any
 * one component, because three surfaces ask the same question and must get the
 * same answer: the Hours lens/rollup/stamp door (`useViewerStudio`), an internal
 * hour's permanent `studio_id` (`useInternalTimeStudio`) and HT-3's per-member
 * rate card (`useAccountStudio`). It is per-viewer convenience, not state
 * anything server-side reads, so `localStorage` is the right home — and every
 * access is wrapped, because a private window or blocked site data makes the
 * accessor throw.
 */
const CHOSEN_STUDIO_KEY = 'patina.hours.viewer-studio-id';

function readChosenStudioId(): string | null {
  try {
    return window.localStorage.getItem(CHOSEN_STUDIO_KEY);
  } catch {
    return null;
  }
}

let chosenStudioId: string | null =
  typeof window === 'undefined' ? null : readChosenStudioId();
const chosenStudioListeners = new Set<() => void>();

function subscribeChosenStudio(listener: () => void): () => void {
  chosenStudioListeners.add(listener);
  return () => {
    chosenStudioListeners.delete(listener);
  };
}

function getChosenStudioSnapshot(): string | null {
  return chosenStudioId;
}

/** The server render has no viewer, so it has no choice either. */
function getChosenStudioServerSnapshot(): string | null {
  return null;
}

/**
 * Name the studio this viewer answers for. Every surface reading
 * `useViewerStudio` / `useInternalTimeStudio` / `useAccountStudio` re-renders on
 * the same answer.
 */
export function selectViewerStudioId(studioId: string | null): void {
  if (chosenStudioId === studioId) return;
  chosenStudioId = studioId;
  try {
    if (studioId === null) window.localStorage.removeItem(CHOSEN_STUDIO_KEY);
    else window.localStorage.setItem(CHOSEN_STUDIO_KEY, studioId);
  } catch {
    // A viewer with blocked site data still gets the switch for this session.
  }
  chosenStudioListeners.forEach((listener) => listener());
}

function byNameThenId(
  a: { name?: string | null; id: string },
  b: { name?: string | null; id: string },
): number {
  return (a.name ?? '').localeCompare(b.name ?? '') || a.id.localeCompare(b.id);
}

type ViewerOrganization = NonNullable<
  ReturnType<typeof useOrganizations>['data']
>[number];

export interface ViewerStudio {
  /** Every org the viewer belongs to — the caller still names studios by id. */
  organizations: ViewerOrganization[] | undefined;
  /** The design studio she owns or administers and is currently answering for. */
  studio: ViewerOrganization | null;
  /**
   * S-1 — EVERY design studio she owns or administers, ordered by name then id.
   * More than one means the sheet must SAY so and offer the door; picking in
   * silence is what told a studio holding 2h that it had logged nothing.
   */
  candidates: ViewerOrganization[];
  /** Name the studio she answers for. All three surfaces follow. */
  selectStudio: (studioId: string) => void;
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
  const chosenId = useSyncExternalStore(
    subscribeChosenStudio,
    getChosenStudioSnapshot,
    getChosenStudioServerSnapshot,
  );

  const candidates = useMemo(() => {
    const owned = (organizations ?? []).filter(
      (org) =>
        org.type === 'design_studio' &&
        (org.membership?.role === 'owner' || org.membership?.role === 'admin'),
    );
    // Stable across loads, which an unordered PostgREST read is not.
    owned.sort(byNameThenId);
    return owned;
  }, [organizations]);

  // The chosen studio while she still holds it; otherwise the first, which is
  // the pre-S-1 answer and the only sane one for a stale or absent choice.
  const studio = useMemo(
    () => candidates.find((org) => org.id === chosenId) ?? candidates[0] ?? null,
    [candidates, chosenId],
  );

  const selectStudio = useCallback((studioId: string) => {
    selectViewerStudioId(studioId);
  }, []);

  return {
    organizations,
    studio,
    candidates,
    selectStudio,
    isOwnerOrAdmin: studio !== null,
    isSettled: organizations !== undefined || isError === true,
  };
}

/**
 * W4 (HT-15) — the studio an INTERNAL hour belongs to.
 *
 * Not `useViewerStudio().studio`: that one is deliberately owner/admin-only,
 * because standing over a studio's hours is an admin act. Logging your OWN
 * admin time is not — `internal_time_own_insert` (00612) admits any ACTIVE,
 * non-guest member of the studio, and `useOrganizations` already reads only
 * active memberships. A member with no design studio has no internal door and
 * the surfaces say so by not offering one.
 *
 * Ordered by name then id for the same reason `useViewerStudio` orders: an
 * unordered PostgREST read would key a member's admin hours on a different
 * studio between two page loads.
 */
export function useInternalTimeStudio(): {
  studio: ViewerOrganization | null;
  isSettled: boolean;
} {
  const { data: organizations, isError } = useOrganizations();
  const chosenId = useSyncExternalStore(
    subscribeChosenStudio,
    getChosenStudioSnapshot,
    getChosenStudioServerSnapshot,
  );
  const studio = useMemo(() => {
    const candidates = (organizations ?? []).filter(
      (org) => org.type === 'design_studio' && org.membership?.role !== 'guest',
    );
    candidates.sort(byNameThenId);
    // S-2 — the same choice the lens above it follows, when that choice names a
    // studio she may log internal time in. An internal hour writes its studio_id
    // onto the row PERMANENTLY, so a surface that disagreed with the lens filed
    // the hour against a studio the lens never showed.
    return candidates.find((org) => org.id === chosenId) ?? candidates[0] ?? null;
  }, [organizations, chosenId]);
  return {
    studio,
    isSettled: organizations !== undefined || isError === true,
  };
}

/**
 * S-2 — the studio the ACCOUNT page manages, for a viewer who answers for more
 * than one.
 *
 * `AccountStudioPage` resolved its own studio as
 * `orgs?.find(o => o.type === 'design_studio') ?? orgs?.[0]` — an unordered
 * PostgREST read with no ordering at all, on the page that carries HT-3's
 * "Studio rates" card, the only per-member rate door in the product. Measured on
 * the default seed: the section listed only 'Leah Hartwell · owner' while the
 * member logging the priced hours belongs to 'Local Dev Studio', so the owner
 * had NO door to price the person doing the priced work, and the rate she could
 * type was written against a studio that prices nothing. Both `Studio rates →`
 * (pending-time-authorization-band.tsx) and `Set the studio rate →`
 * (hours-ledger.tsx) point here.
 *
 * The owner/admin answer wins, so this page names the studio the Hours surfaces
 * name. A plain member holds no studio under `useViewerStudio` and keeps the
 * page's original resolution — she is not choosing anything, she is looking at
 * the studio she belongs to. The fallback is ORDERED, which the original was
 * not.
 */
export function useAccountStudio(): {
  studio: ViewerOrganization | null;
  candidates: ViewerOrganization[];
  selectStudio: (studioId: string) => void;
  isSettled: boolean;
} {
  const { organizations, studio, candidates, selectStudio, isSettled } =
    useViewerStudio();
  const fallback = useMemo(() => {
    const orgs = [...(organizations ?? [])].sort(byNameThenId);
    return orgs.find((org) => org.type === 'design_studio') ?? orgs[0] ?? null;
  }, [organizations]);
  return {
    studio: studio ?? fallback,
    candidates,
    selectStudio,
    isSettled,
  };
}
