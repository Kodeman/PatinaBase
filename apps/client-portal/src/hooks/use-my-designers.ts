'use client';

import { useQuery } from '@tanstack/react-query';

import { createBrowserClient } from '@patina/supabase';

/**
 * The designers this client actually works with — `designer_clients` for the
 * signed-in user, copied verbatim from `useMyDesigners` inside
 * `src/components/scans/ShareScanDialog.tsx`, the act the Threshold's capture
 * plate absorbs.
 *
 * It is deliberately NOT `project_team_members`: that seat list carries
 * vendors, bookkeepers and rotated-off previous leads, and `share_room_scan`
 * (00020) does not check that the target is a designer — so reading the team
 * would widen who a homeowner can hand a 3D capture of their house to. It is
 * also gated on `is_project_team_member`, which a portal client (the project's
 * `client_id`) is not necessarily in. `designer_clients` is client-scoped by
 * construction.
 */
export interface MyDesigner {
  id: string;
  fullName: string | null;
  businessName: string | null;
  avatarUrl: string | null;
}

export function useMyDesigners() {
  return useQuery({
    queryKey: ['my-designers'],
    queryFn: async (): Promise<MyDesigner[]> => {
      // The generated client has no row types for the profiles join here.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = createBrowserClient() as any;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('designer_clients')
        .select(
          'designer_id, designer:profiles!designer_id(id, full_name, business_name, avatar_url)',
        )
        .eq('client_id', user.id);

      if (error) throw error;

      const seen = new Set<string>();
      const designers: MyDesigner[] = [];
      for (const row of data ?? []) {
        const d = row.designer as
          | {
              id: string;
              full_name: string | null;
              business_name: string | null;
              avatar_url: string | null;
            }
          | null;
        if (!d || seen.has(d.id)) continue;
        seen.add(d.id);
        designers.push({
          id: d.id,
          fullName: d.full_name,
          businessName: d.business_name,
          avatarUrl: d.avatar_url,
        });
      }
      return designers;
    },
  });
}
