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

// The People Room roster discriminator. The field kinds (gc / sub / installer /
// receiver) arrive from the people_directory party branch (00281) with `role`
// set to the concrete party_kind; their canonical vocab/labels live in
// @patina/types field-config. `gc` predates Field Coordination (00221).
// `architect` / `photographer` / `stager` are the 00419/00420 roster-widening
// kinds (project_parties, non-field — no SMS). `contact` is the 00420 studio
// rolodex branch (studio_contacts rows with no matching project party) — note
// there is deliberately NO `'client'` party kind here: a client-role row is
// always the designer_clients branch, never a project party.
export type PartyRole =
  | 'client'
  | 'maker'
  | 'gc'
  | 'team'
  | 'lead'
  | 'sub'
  | 'installer'
  | 'receiver'
  | 'architect'
  | 'photographer'
  | 'stager'
  | 'contact';

/** The field-coordination roster kinds (gc + the sites trades). A row of these
 *  roles is a `project_parties` row (person_id = the party id) and opens the
 *  field party profile sheet rather than the generic relationship profile. */
export const FIELD_ROSTER_ROLES: readonly PartyRole[] = [
  'gc',
  'sub',
  'installer',
  'receiver',
] as const;

/** True when a roster role is a field party (per-project, SMS-reachable). */
export function isFieldRosterRole(role: string | null | undefined): role is PartyRole {
  return !!role && (FIELD_ROSTER_ROLES as readonly string[]).includes(role);
}

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
  /**
   * Role-specific extras (vendor lead time, client revenue, GC company, …).
   * 00420 widened the shape per branch — still an untyped bag (the view
   * unions several source tables), but the keys worth knowing about:
   *  - party rows (gc/sub/installer/receiver/architect/photographer/stager):
   *    `show_to_client` (boolean) and `studio_contact_id` (uuid | null) —
   *    the 00418/00419 rolodex-lineage stamp.
   *  - team rows: `job_title` / `staff_role` (00416 organization_members
   *    columns).
   *  - contact rows (`role: 'contact'`, the studio_contacts branch):
   *    `contact_kind`, `entity_kind`, `specialties`, `organization_id`.
   */
  meta: Record<string, unknown>;
  /**
   * 'mine' when the querying designer owns/leads the underlying project (or
   * IS the row, for team/contact rows tied to them); 'studio' when it's a
   * studio co-member's. Appended last by 00420's `CREATE OR REPLACE VIEW`
   * (column order is append-only — never reorder ahead of it).
   */
  scope: 'mine' | 'studio';
}

export interface PeopleFilters {
  /** 'all' (or undefined) returns every role. */
  role?: PartyRole | 'all';
  /** Case-insensitive match over display_name + email. */
  search?: string;
  /** 'mine' filters to the querying designer's own rows server-side
   *  (`.eq('scope','mine')`). Omitted (or 'studio') returns everything the
   *  view's RLS admits — comembers included — unfiltered; the caller (the
   *  People Room's MINE·STUDIO lens) owns which is the default. */
  scope?: 'mine' | 'studio';
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
      // Studio is the unfiltered read (RLS already admits comembers); only
      // 'mine' narrows server-side. Never .eq('scope','studio') — that would
      // wrongly exclude the designer's own rows, which are scope:'mine'.
      if (filters?.scope === 'mine') {
        query = query.eq('scope', 'mine');
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
