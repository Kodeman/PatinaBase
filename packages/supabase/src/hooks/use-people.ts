import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// THE PEOPLE ROOM — the unified party directory (R57 / Track A)
//
// One read model over `public.people_directory` (migration 00221): every party
// Patina works with — clients, makers/vendors, GCs, studio team, open leads —
// in one roster with a `role` discriminator. The view is security_invoker, so
// RLS scopes it to the querying designer; this hook is a thin typed read + an
// in-memory search filter. The relationship journey is DERIVED in the app
// (lib/document/people-derivation.ts), never stored.
// ═══════════════════════════════════════════════════════════════════════════

export type PartyRole = 'client' | 'maker' | 'gc' | 'team' | 'lead';

/** A row of `public.people_directory`. The canonical party shape. */
export interface PeopleDirectoryRow {
  person_id: string;
  role: PartyRole;
  display_name: string;
  email: string | null;
  phone: string | null;
  /** Linked auth profile, when the party has (or could have) a login. */
  profile_id: string | null;
  /** Set for project-scoped parties (GC/team); null for clients/makers/leads. */
  project_id: string | null;
  designer_id: string | null;
  /** Role-appropriate raw status token (e.g. client lifecycle, lead status). */
  status_raw: string | null;
  /** Most recent touch — drives dormancy ranking + ordering. */
  last_touch_at: string | null;
  /** Role-specific extras (vendor lead time, client revenue, GC company, …). */
  meta: Record<string, unknown>;
}

export interface PeopleFilters {
  /** 'all' (or undefined) returns every role. */
  role?: PartyRole | 'all';
  /** Case-insensitive match over display_name + email. */
  search?: string;
}

export const peopleKeys = {
  all: ['people-directory'] as const,
  list: (filters?: PeopleFilters) => ['people-directory', filters ?? {}] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The unified directory. Filters by role server-side (`.eq('role', …)`) and by
 * free-text search in memory (the roster is small, per-designer). Ordering is
 * left to the caller / derivation so the view stays a pure read model.
 */
export function usePeopleDirectory(filters?: PeopleFilters) {
  return useQuery({
    queryKey: peopleKeys.list(filters),
    queryFn: async (): Promise<PeopleDirectoryRow[]> => {
      const supabase = getSupabase();
      let query = supabase.from('people_directory').select('*');
      if (filters?.role && filters.role !== 'all') {
        query = query.eq('role', filters.role);
      }
      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as PeopleDirectoryRow[];
      const search = filters?.search?.trim().toLowerCase();
      if (search) {
        rows = rows.filter(
          (r) =>
            r.display_name.toLowerCase().includes(search) ||
            (r.email ?? '').toLowerCase().includes(search),
        );
      }
      return rows;
    },
  });
}

/** A single party by its directory id (and role, since person_id is unique
 *  only within a role's source table). Reads from the same view. */
export function usePerson(personId: string | null | undefined, role?: PartyRole) {
  return useQuery({
    queryKey: ['people-directory', 'person', personId, role ?? null],
    enabled: Boolean(personId),
    queryFn: async (): Promise<PeopleDirectoryRow | null> => {
      if (!personId) return null;
      const supabase = getSupabase();
      let query = supabase.from('people_directory').select('*').eq('person_id', personId);
      if (role) query = query.eq('role', role);
      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;
      return (data as PeopleDirectoryRow | null) ?? null;
    },
  });
}
