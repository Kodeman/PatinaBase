'use client';

/**
 * useIsStudioOwner — portal-local helper that returns whether the authenticated
 * user holds the `studio_owner` role.
 *
 * Per the Wave 3.1 architect dossier (§4 "Studio-Owner Permission Gating"), the
 * canonical convenience hook is planned to live at
 * `packages/supabase/src/hooks/use-permissions.ts`. That file is owned by the
 * parallel Migration Engineer B lane in Wave 3.2 (see hand-off contract). To
 * avoid a merge collision while parallel work is in flight, this Wave 3.2
 * Component Builder lane ships a portal-local helper backed by the existing
 * `useUserRoles()` hook from `@patina/supabase`.
 *
 * TODO(post-merge): once `useIsStudioOwner` is exported from `@patina/supabase`
 * by Migration Engineer B's branch, delete this file and replace the import in
 * `qbo-export-modal.tsx` and `by-vendor/page.tsx` with the shared hook. The
 * shape is identical, so the swap is a one-line import change.
 */

import { useUserRoles } from '@patina/supabase';

export function useIsStudioOwner(): { isStudioOwner: boolean; isLoading: boolean } {
  const { data: roles, isLoading } = useUserRoles();

  if (isLoading || !roles) {
    return { isStudioOwner: false, isLoading: true };
  }

  const isStudioOwner = roles.some((r) => r.role?.name === 'studio_owner');
  return { isStudioOwner, isLoading: false };
}
