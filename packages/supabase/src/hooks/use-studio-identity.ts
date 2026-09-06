import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// ═══════════════════════════════════════════════════════════════════════════
// STUDIO IDENTITY (branding resolver)
// ═══════════════════════════════════════════════════════════════════════════
//
// One canonical brand resolver (plan D2), shared by every branded surface, so
// the portal, Deno edge functions, and Swift all read the same precedence and
// can't drift:
// `resolve_studio_identity(p_project_id, p_designer_id, p_studio_id)` (00320,
// widened by 00571) —
//   named studio → org  →  project → studio_id → org
//   →  designer → primary studio → org
//   → profiles.business_name → profiles.full_name.
//
// The RPC is a SET-RETURNING function: PostgREST returns it as an array with
// exactly one row (the SQL guarantees one row, even the all-NULL degenerate
// case). We normalize to a single object here.
//
// IMPORTANT CONTRACT: `name` can be NULL (a non-designer UUID, or nothing
// resolvable). Consumers apply their own fallback — it is typed nullable.

// Lazy client getter to avoid module-level initialization during SSR.
const getSupabase = () => createBrowserClient();

export type StudioIdentitySource = 'studio' | 'business_name' | 'full_name';

export interface StudioIdentity {
  studioId: string | null;
  /** May be NULL in degenerate cases — consumers apply their own fallback. */
  name: string | null;
  logoUrl: string | null;
  website: string | null;
  source: StudioIdentitySource | null;
}

export interface UseStudioIdentityParams {
  /**
   * The studio the surface is branded for, when the row names one itself. A
   * studio invoice carries its own `studio_id` and has no project to resolve
   * through; without this the resolver falls to `_primary_studio_for(designer)`
   * and a designer who belongs to two studios gets the wrong letterhead.
   * 00571 gives it precedence, and falls through to the derivations below when
   * it names no active design studio — so it may be passed alongside them.
   */
  studioId?: string | null;
  /** Pass exactly one of projectId / designerId. */
  projectId?: string | null;
  designerId?: string | null;
}

const EMPTY_IDENTITY: StudioIdentity = {
  studioId: null,
  name: null,
  logoUrl: null,
  website: null,
  source: null,
};

/**
 * Resolve the studio brand identity for a named studio (preferred), a project,
 * or a designer. Query key `['studio-identity', { studioId, projectId,
 * designerId }]` — every id the answer depends on, so a caller that names a
 * studio AND its fallback designer cannot read another caller's answer. Only
 * enabled when one id is present. `useUpdateOrganization` invalidates
 * `['studio-identity']` so a logo/name edit refreshes every branded surface.
 */
export function useStudioIdentity(params: UseStudioIdentityParams) {
  const studioId = params.studioId ?? null;
  const projectId = params.projectId ?? null;
  const designerId = params.designerId ?? null;

  return useQuery({
    queryKey: ['studio-identity', { studioId, projectId, designerId }],
    enabled: !!(studioId || projectId || designerId),
    queryFn: async (): Promise<StudioIdentity> => {
      const supabase = getSupabase();

      const args: {
        p_project_id?: string;
        p_designer_id?: string;
        p_studio_id?: string;
      } = {};
      if (projectId) args.p_project_id = projectId;
      if (designerId) args.p_designer_id = designerId;
      if (studioId) args.p_studio_id = studioId;

      const { data, error } = await supabase.rpc('resolve_studio_identity', args);
      if (error) throw error;

      // Set-returning fn → PostgREST array; normalize to the single row.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) return EMPTY_IDENTITY;

      return {
        studioId: row.studio_id ?? null,
        name: row.name ?? null,
        logoUrl: row.logo_url ?? null,
        website: row.website ?? null,
        source: (row.source ?? null) as StudioIdentity['source'],
      };
    },
  });
}
