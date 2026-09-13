import { useQuery } from '@tanstack/react-query';
import { createBrowserClient } from '../client';

// Lazy client getter to avoid module-level initialization during SSR
const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// THE PEOPLE ROOM — the unified party directory (R57 / Track A)
//
// One read model over `public.people_directory`, rebuilt to **v4** by 00626:
// ONE ROW PER IDENTITY, not per party row. A seat carrying a
// `studio_contact_id` is no longer its own Directory row — its identity is the
// person card — and uncarded seats collapse on `party_identity_key()` (the
// lineage stamp, else the login, else the exact E.164 number, else the
// lowercased email, else the row itself). `seat_count` says how many seats sit
// beneath the row; `people_directory_seats` is where they are read.
//
// The view is security_invoker, so RLS scopes it to the querying designer;
// these hooks are a thin typed read + an in-memory search filter. The
// relationship journey is DERIVED in the app (lib/document/people-derivation.ts),
// never stored.
// ═══════════════════════════════════════════════════════════════════════════

// The People Room roster discriminator. The field kinds (gc / sub / installer /
// receiver) arrive from the people_directory party branch (00281) with `role`
// set to the concrete party_kind; their canonical vocab/labels live in
// @patina/types field-config. `gc` predates Field Coordination (00221).
// `architect` / `photographer` / `stager` are the 00419/00420 roster-widening
// kinds (project_parties, non-field — no SMS). `contact` is the 00420 studio
// rolodex branch (studio_contacts rows) — note there is deliberately NO
// `'client'` party kind here: a client-role row is always the designer_clients
// branch, never a project party.
//
// ⚠ v4 CHANGED WHAT THIS DISCRIMINATOR COUNTS. Every CARDED human now arrives
// as `role: 'contact'` with `meta.entity_kind` telling a person from a firm
// (PR-g's mixed list); only an UNCARDED seat still arrives under its own party
// kind. A chip that maps `role` straight to a band will under-count every band
// but Contacts — the six chips read `meta.entity_kind` + the seats view.
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

/** A row of `public.people_directory` (v4, 00626). The canonical party shape. */
export interface PeopleDirectoryRow {
  person_id: string;
  role: PartyRole;
  display_name: string;
  email: string | null;
  phone: string | null;
  /** Linked auth profile, when the party has (or could have) a login. */
  profile_id: string | null;
  /** The winning (most recently updated) seat's project for a carded identity;
   *  null for clients/makers/leads. Never "the" project — `seat_count` and the
   *  seats view are what answer "how many, and which". */
  project_id: string | null;
  designer_id: string | null;
  /**
   * Role-appropriate raw status token (client lifecycle, lead status, and on a
   * CARD row the rolodex ARCHIVE state).
   *
   * ⚠ NEVER READ CONSENT FROM THIS COLUMN (R-BE). Pre-v4 the party branch put
   * the SMS consent status here; v4 puts the archive state there for a carded
   * human, so `status_raw` reads `active` for someone the studio's record says
   * `opted_out`. `consent_status` below is the only consent word.
   */
  status_raw: string | null;
  /** Most recent touch — drives dormancy ranking + ordering. */
  last_touch_at: string | null;
  /**
   * Role-specific extras (vendor lead time, client revenue, GC company, …).
   * 00420 widened the shape per branch — still an untyped bag (the view
   * unions several source tables), but the keys worth knowing about:
   *  - party rows: `show_to_client` (boolean) and `studio_contact_id`
   *    (uuid | null) — the 00418/00419 rolodex-lineage stamp.
   *  - team rows: `job_title` / `staff_role` (00416 organization_members).
   *  - contact rows (`role: 'contact'`, the studio_contacts branch):
   *    `contact_kind`, `entity_kind` ('person' | 'company'), `specialties`,
   *    `organization_id`, and the two consent DATES
   *    (`sms_consented_at` / `sms_opt_out_at`), which 00626 reads off
   *    `studio_channel_consent` rather than off a frozen seat.
   */
  meta: Record<string, unknown>;
  /**
   * 'mine' when the querying designer owns/leads the underlying project (or
   * IS the row, for team/contact rows tied to them); 'studio' when it's a
   * studio co-member's.
   */
  scope: 'mine' | 'studio';

  // ── The five columns 00626 APPENDED (v4). Append-only: never reorder. ─────

  /** E9's strongest live door: an account, else a live unexpired field link on
   *  one of this identity's seats, else on paper (PD-12's order). Never null. */
  reach_state: 'account' | 'field_link' | 'on_paper' | null;
  /**
   * The studio's own consent RECORD for this identity's number, through
   * `channel_consent_status()` — which already folds `refusal_unanswered` into
   * `opted_out` (R-AY). NULL where the branch holds no number, or where the
   * caller is not a member of the owning studio: "no record" is its own fact
   * and must print as nothing, never as "Not asked" (R-BB).
   */
  consent_status: 'not_asked' | 'pending' | 'granted' | 'opted_out' | null;
  /** The firm's paper for a person, the card's own for a firm and a sole
   *  proprietor (R-BA / R-BJ). NULL on the client/lead/maker/team branches.
   *  A lender or inspector prints NO paper word at all — a DISPLAY rule the
   *  view deliberately does not apply (R-A; `partyKindOwesPaper`). */
  paper_state: 'current' | 'lapses_soon' | 'lapsed' | 'not_on_file' | null;
  /** E7 as one sentence, fixed clause order. NULL = no rule on file, which is
   *  a fact and not an empty string (R-V). */
  contact_rule_summary: string | null;
  /** How many seats `people_directory_seats` nests beneath this row (R-BG). */
  seat_count: number;
}

/** A row of `public.people_directory_seats` (00626) — ONE SEAT, keyed by the
 *  same identity as its Directory row. Admits EVERY party kind, unlike the
 *  Directory's seven: "where is this human seated" is a different question
 *  from "who is in the six chips" (PR-c's `client_rep` seat must appear under
 *  the household member's card). */
export interface PeopleDirectorySeat {
  identity_key: string;
  /** The identity's `people_directory.person_id` — the join back to the row. */
  person_id: string | null;
  /** The `project_parties.id`. THIS is what the Call Sheet chevron passes. */
  seat_id: string;
  project_id: string | null;
  project_name: string | null;
  project_status: string | null;
  designer_id: string | null;
  party_kind: string | null;
  display_name: string | null;
  trade: string | null;
  /** `project_parties.stage` — the twelve stored values (SeatStage). */
  stage: string | null;
  on_site_from: string | null;
  on_site_to: string | null;
  site_access_mode: string | null;
  contracted_through: string | null;
  company_id: string | null;
  company_name: string | null;
  warranty_until: string | null;
  warranty_contact_person_id: string | null;
  off_job_at: string | null;
  off_job_reason: string | null;
  show_to_client: boolean | null;
  studio_contact_id: string | null;
  phone_e164: string | null;
  consent_status: 'not_asked' | 'pending' | 'granted' | 'opted_out' | null;
  reach_state: 'account' | 'field_link' | 'on_paper' | null;
  paper_state: 'current' | 'lapses_soon' | 'lapsed' | 'not_on_file' | null;
  contact_rule_summary: string | null;
  updated_at: string | null;
  scope: 'mine' | 'studio' | string | null;
}

export interface PeopleFilters {
  /** 'all' (or undefined) returns every role. */
  role?: PartyRole | 'all';
  /** Case-insensitive match over display_name, email, and phone DIGITS
   *  (direction §3.1: "search matches phone digits"). */
  search?: string;
  /** 'mine' filters to the querying designer's own rows server-side
   *  (`.eq('scope','mine')`). Omitted (or 'studio') returns everything the
   *  view's RLS admits — comembers included — unfiltered; the caller (the
   *  People Room's MINE·STUDIO lens) owns which is the default. */
  scope?: 'mine' | 'studio';
}

export interface PeopleSeatFilters {
  /** One identity's seats — the seat lines beneath a Directory row. */
  personId?: string | null;
  /** One project's seats — the Call Sheet's roster. */
  projectId?: string | null;
  /**
   * Every seat the studio can read. The Directory's firm rows need "N open
   * jobs" per FIRM, and v4 moved every carded human onto the contacts branch
   * whose `project_id` is NULL — the seats view is the only place the fact
   * lives, and it carries `company_id` (QA-R2-2).
   */
  all?: boolean;
  scope?: 'mine' | 'studio';
}

export const peopleKeys = {
  all: ['people-directory'] as const,
  list: (filters?: PeopleFilters) => ['people-directory', filters ?? {}] as const,
  person: (personId: string | null | undefined, role?: PartyRole | null) =>
    ['people-directory', 'person', personId ?? null, role ?? null] as const,
};

/** The seats view's own canonical key. Separate from `peopleKeys` because it
 *  is a separate read model — but every mutation that moves a seat invalidates
 *  BOTH (a closed seat changes a row's `seat_count`). */
export const peopleSeatKeys = {
  all: ['people-directory-seats'] as const,
  list: (filters?: PeopleSeatFilters) =>
    ['people-directory-seats', filters ?? {}] as const,
  seat: (seatId: string | null | undefined) =>
    ['people-directory-seats', 'seat', seatId ?? null] as const,
};

/** Digits only, for the phone-suffix match. */
function digitsOf(value: string | null | undefined): string {
  return (value ?? '').replace(/\D/g, '');
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The unified directory, v4 — one row per identity. Filters by role
 * server-side (`.eq('role', …)`) and by free-text search in memory (the roster
 * is small, per-designer). Ordering is left to the caller / derivation so the
 * view stays a pure read model.
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
      const raw = filters?.search?.trim() ?? '';
      const search = raw.toLowerCase();
      if (search) {
        // A typed number matches the tail of a stored one: a studio searching
        // "0111" must find (612) 555-0111. Four digits is the floor — fewer
        // matches half the book.
        const typedDigits = digitsOf(raw);
        const phoneSearch = typedDigits.length >= 4 ? typedDigits : null;
        rows = rows.filter(
          (r) =>
            r.display_name.toLowerCase().includes(search) ||
            (r.email ?? '').toLowerCase().includes(search) ||
            (phoneSearch !== null && digitsOf(r.phone).endsWith(phoneSearch)),
        );
      }
      return rows;
    },
  });
}

/**
 * A single IDENTITY by its directory id (and role, since `person_id` is unique
 * only within a role's source table). Reads from the same view.
 *
 * ⚠ This is not the reader for a SEAT. The Call Sheet chevron and the roster
 * row pass a `project_parties.id`, and v4 keys a carded human on their ROLODEX
 * CARD — so `usePerson(<seat id>)` finds nothing for every carded seat. Use
 * `usePersonSeat` for those (R-BE).
 */
export function usePerson(personId: string | null | undefined, role?: PartyRole) {
  return useQuery({
    queryKey: peopleKeys.person(personId, role),
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

/** The seat lines beneath a Directory row, or a project's whole roster. */
export function usePeopleSeats(filters?: PeopleSeatFilters) {
  const enabled =
    Boolean(filters?.personId) ||
    Boolean(filters?.projectId) ||
    filters?.all === true;
  return useQuery({
    queryKey: peopleSeatKeys.list(filters),
    enabled,
    queryFn: async (): Promise<PeopleDirectorySeat[]> => {
      const supabase = getSupabase();
      let query = supabase.from('people_directory_seats').select('*');
      if (filters?.personId) query = query.eq('person_id', filters.personId);
      if (filters?.projectId) query = query.eq('project_id', filters.projectId);
      if (filters?.scope === 'mine') query = query.eq('scope', 'mine');
      // CR7-3: DETERMINISTIC ORDER. Without an ORDER BY, PostgREST hands back
      // whatever order the plan produced, and the person card's `liveSeats[0]`
      // — which chooses the seat a field link is minted on, the job a recorded
      // consent is stamped with, and the sheet "Send a text" opens — moved
      // between reads. Most recently started first, seats with no start date
      // last, ties broken by seat id, so one card reads the same way twice.
      const { data, error } = await query
        .order('on_site_from', { ascending: false, nullsFirst: false })
        .order('seat_id', { ascending: true });
      if (error) throw error;
      return (data ?? []) as PeopleDirectorySeat[];
    },
  });
}

/** What `usePersonSeat` hands back: the seat, and the identity it belongs to. */
export interface PersonSeatResolution {
  seat: PeopleDirectorySeat | null;
  /** NULL when the seat resolves to no identity the caller may read. The
   *  surface must then render NO consent chip at all (R-BE) — the fallback
   *  chain printed "Not asked" over a record the same screen's seat line reads
   *  `opted_out`. */
  identity: PeopleDirectoryRow | null;
}

/**
 * R-BE — THE SEAT READER. Takes a `project_parties.id` (what
 * `roster/call-sheet-mount.tsx` and the roster row pass), resolves it through
 * `people_directory_seats`, then joins the identity on `person_id`.
 *
 * Three rules the party-profile sheet depends on:
 *  1. the consent WORD comes from the identity's `consent_status` column —
 *     never `status_raw`, which on a card row carries the rolodex ARCHIVE
 *     state and reads `active` for someone the record says `opted_out`;
 *  2. `identity === null` means render no consent chip, not "Not asked";
 *  3. the seat's own words (`stage`, the window, `site_access_mode`) come off
 *     the seat, and the identity's words (reach, consent, paper, rule) off the
 *     identity — they are two different questions.
 */
export function usePersonSeat(seatId: string | null | undefined) {
  return useQuery({
    queryKey: peopleSeatKeys.seat(seatId),
    enabled: Boolean(seatId),
    queryFn: async (): Promise<PersonSeatResolution> => {
      if (!seatId) return { seat: null, identity: null };
      const supabase = getSupabase();
      const { data: seatRow, error: seatError } = await supabase
        .from('people_directory_seats')
        .select('*')
        .eq('seat_id', seatId)
        .limit(1)
        .maybeSingle();
      if (seatError) throw seatError;
      const seat = (seatRow as PeopleDirectorySeat | null) ?? null;
      if (!seat?.person_id) return { seat, identity: null };

      const { data: identityRow, error: identityError } = await supabase
        .from('people_directory')
        .select('*')
        .eq('person_id', seat.person_id)
        .limit(1)
        .maybeSingle();
      if (identityError) throw identityError;
      return {
        seat,
        identity: (identityRow as PeopleDirectoryRow | null) ?? null,
      };
    },
  });
}
