'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getPartyKindLabel } from '@patina/types';
import { createBrowserClient } from '../client';
import { partyBidKeys, type ProjectParty } from './use-coordination';
import { clientHouseholdKeys } from './use-households';
import { peopleKeys, peopleSeatKeys } from './use-people';

// ═══════════════════════════════════════════════════════════════════════════
// THE ROLODEX — the shared studio contact book (Call Sheet Wave 2, R1)
//
// One row per person or company the studio knows (`public.studio_contacts`,
// 00417). Fully shared at the studio: every active non-guest member reads and
// writes the same book — RLS is `is_active_studio_member(organization_id)`,
// not per-user. Archive/unarchive is owner/admin only (00417's admin UPDATE
// leg) — `useRestoreStudioContact` / the archive path of `useArchiveStudioContact`
// will surface a Postgres RLS rejection as a thrown error for a plain member;
// callers should catch that and show a friendly "ask an owner" message rather
// than a raw Postgres error.
//
// Mirrors use-organizations.ts / use-coordination.ts conventions: lazy
// `createBrowserClient()` getter, file-local query-key objects, mutations
// invalidate the domain list key plus every cross-domain key the write
// touches (peopleKeys.all / project-parties, per the Wave 2 invalidation map).
// ═══════════════════════════════════════════════════════════════════════════

const getSupabase = () => createBrowserClient();

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

/** A `public.studio_contacts` row (00417). Free-TEXT `contact_kind` — vocab is
 *  code-resident in @patina/types studio-config.ts (ContactKind, once minted)
 *  and field-config.ts (PartyKind), so this hook types it loosely as string,
 *  matching the DB's no-CHECK posture. */
export interface StudioContact {
  id: string;
  organization_id: string;
  entity_kind: 'person' | 'company';
  company_id: string | null;
  /** What this card IS to the studio — vendor / gc / sub / installer /
   *  receiver / client / lead / architect / photographer / stager / team / … */
  contact_kind: string;
  full_name: string | null;
  company_name: string | null;
  email: string | null;
  phone: string | null;
  /** E.164 normalization of `phone`, derived by the shared 00281 trigger. */
  phone_e164: string | null;
  /** Trades / categories this contact covers — VendorSpecialty / FieldTrade vocab. */
  specialties: string[];
  vendor_id: string | null;
  profile_id: string | null;
  created_by: string | null;
  notes: string | null;
  archived_at: string | null;
  /**
   * M2R-5 — the MERGE tombstone (00629). Non-null on a card that was folded
   * into another one: `people_directory` emits no identity row for it, every
   * seat guard refuses it, and `resolve_merged_contact()` maps its id forward.
   * Every list read below filters it out; a reader that genuinely wants the
   * tombstone asks for it with `includeMerged`.
   */
  merged_into: string | null;
  created_at: string;
  updated_at: string;

  // ── 00592's card extensions (People room CRM, direction §7) ──────────────
  /** A person who IS their own firm: their own documents are the firm's. */
  is_sole_proprietor: boolean | null;
  /** The studio's own verdict on this card (E14). Free TEXT, no CHECK. */
  studio_verdict: string | null;
  studio_verdict_at: string | null;

  // ── Company-card fields. NULL on a person card. ──────────────────────────
  legal_name: string | null;
  dba_name: string | null;
  /** The FIRM's own kind vocabulary — distinct from a person's PartyKind. */
  company_kind: string | null;
  /** Trades this firm covers (FieldTrade vocab). */
  trades: string[] | null;
  w9_on_file_at: string | null;
  tax_id_last4: string | null;
  remit_to: string | null;
  /** Retainage in basis points — 10% is 1000. */
  retainage_bps: number | null;
  warranty_until: string | null;
  /** The three designations. Each names a PERSON card in the same studio;
   *  a BEFORE trigger refuses anything else, and refuses the row itself
   *  (R-AP). */
  paperwork_contact_person_id: string | null;
  signer_person_id: string | null;
  site_contact_person_id: string | null;
}

/** The company-card fields a firm's card may be written with. Person cards
 *  leave every one of them null. */
export interface StudioCompanyCardFields {
  legalName?: string | null;
  dbaName?: string | null;
  companyKind?: string | null;
  trades?: string[];
  w9OnFileAt?: string | null;
  taxIdLast4?: string | null;
  remitTo?: string | null;
  retainageBps?: number | null;
  warrantyUntil?: string | null;
  paperworkContactPersonId?: string | null;
  signerPersonId?: string | null;
  siteContactPersonId?: string | null;
}

/** The person-card fields 00592 added. */
export interface StudioPersonCardFields {
  isSoleProprietor?: boolean;
  studioVerdict?: string | null;
}

export interface AddStudioContactInput {
  organizationId: string;
  entityKind: 'person' | 'company';
  contactKind: string;
  companyId?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  specialties?: string[];
  vendorId?: string | null;
  profileId?: string | null;
  notes?: string | null;
}

/** The company/person card fields an UPDATE may patch, beside the 00417 base
 *  columns. Keys omitted are left alone; an explicit `null` clears. */
export type UpdateStudioContactCardPatch = StudioCompanyCardFields &
  StudioPersonCardFields;

export interface UpdateStudioContactInput {
  id: string;
  organizationId: string;
  entityKind?: 'person' | 'company';
  contactKind?: string;
  companyId?: string | null;
  fullName?: string | null;
  companyName?: string | null;
  email?: string | null;
  phone?: string | null;
  specialties?: string[];
  vendorId?: string | null;
  profileId?: string | null;
  notes?: string | null;
  /** The People-room card fields (company card + sole-proprietor/verdict).
   *  Omitted keys are left alone. */
  card?: UpdateStudioContactCardPatch;
}

export interface StudioContactFilters {
  /** 'all' (or undefined) returns every contact_kind. */
  kind?: string | 'all';
  /** Case-insensitive match over full_name / company_name / email (the
   *  use-people idiom — filtered in memory, the rolodex is per-studio-sized). */
  search?: string;
  /** false (default) excludes archived_at IS NOT NULL rows. */
  includeArchived?: boolean;
  /**
   * false (default) excludes cards 00629 folded into another one. M2R-5: W3
   * minted `merged_into` as a tombstone and taught `people_directory` to skip
   * it, and taught the data layer nothing — so the bring-forward picker, the
   * "who priced it" selector and the household-member selector all went on
   * offering a card the Directory had already folded away, each ending in a
   * database refusal rather than a fact. The Directory says one card; nothing
   * else may say two.
   */
  includeMerged?: boolean;
}

export const studioContactKeys = {
  all: ['studio-contacts'] as const,
  list: (organizationId: string | null | undefined, filters?: StudioContactFilters) =>
    ['studio-contacts', organizationId ?? null, filters ?? {}] as const,
  detail: (id: string | null | undefined) => ['studio-contacts', 'detail', id ?? null] as const,
};

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Queries
// ═══════════════════════════════════════════════════════════════════════════

/**
 * The studio rolodex list. `.eq('organization_id', …)`, `.is('archived_at',
 * null)` unless `includeArchived`, `.is('merged_into', null)` unless
 * `includeMerged` (M2R-5), `.eq('contact_kind', …)` when `kind` is set
 * and not `'all'`, then an in-memory search over full_name / company_name /
 * email (the use-people idiom). Ordered company-first, then name — the People
 * Room's company rows lead their unfolded people.
 */
export function useStudioContacts(
  organizationId: string | null | undefined,
  filters?: StudioContactFilters,
) {
  return useQuery({
    queryKey: studioContactKeys.list(organizationId, filters),
    enabled: !!organizationId,
    queryFn: async (): Promise<StudioContact[]> => {
      const supabase = getSupabase();
      let query = supabase
        .from('studio_contacts')
        .select('*')
        .eq('organization_id', organizationId as string);

      if (!filters?.includeArchived) {
        query = query.is('archived_at', null);
      }
      if (!filters?.includeMerged) {
        query = query.is('merged_into', null);
      }
      if (filters?.kind && filters.kind !== 'all') {
        query = query.eq('contact_kind', filters.kind);
      }

      const { data, error } = await query;
      if (error) throw error;

      let rows = (data ?? []) as StudioContact[];

      const search = filters?.search?.trim().toLowerCase();
      if (search) {
        rows = rows.filter(
          (r) =>
            (r.full_name ?? '').toLowerCase().includes(search) ||
            (r.company_name ?? '').toLowerCase().includes(search) ||
            (r.email ?? '').toLowerCase().includes(search),
        );
      }

      rows.sort((a, b) => {
        if (a.entity_kind !== b.entity_kind) return a.entity_kind === 'company' ? -1 : 1;
        const aName = a.company_name ?? a.full_name ?? '';
        const bName = b.company_name ?? b.full_name ?? '';
        return aName.localeCompare(bName);
      });

      return rows;
    },
  });
}

/** A single rolodex card by id. */
export function useStudioContact(id: string | null | undefined) {
  return useQuery({
    queryKey: studioContactKeys.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<StudioContact | null> => {
      if (!id) return null;
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('studio_contacts')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as StudioContact | null) ?? null;
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// HOOKS — Mutations
// ═══════════════════════════════════════════════════════════════════════════

/** Add a card to the rolodex (member-writable, live rows only — 00417). */
export function useAddStudioContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: AddStudioContactInput): Promise<StudioContact> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('studio_contacts')
        .insert({
          organization_id: input.organizationId,
          entity_kind: input.entityKind,
          contact_kind: input.contactKind,
          company_id: input.companyId ?? null,
          full_name: input.fullName ?? null,
          company_name: input.companyName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          specialties: input.specialties ?? [],
          vendor_id: input.vendorId ?? null,
          profile_id: input.profileId ?? null,
          notes: input.notes ?? null,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioContact;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioContactKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      // CR11-7: `people_directory_seats` carries the card's own name, firm,
      // phone, consent, reach, paper and rule summary, so a card edit that
      // leaves it alone leaves every seat line printing the old fact.
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
    },
  });
}

/** Edit a live card (member-writable — 00417's member UPDATE leg blocks
 *  touching or leaving an archived row, so this can never archive/unarchive). */
export function useUpdateStudioContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateStudioContactInput): Promise<StudioContact> => {
      const supabase = getSupabase();
      const updates: Record<string, unknown> = {};
      if (input.entityKind !== undefined) updates.entity_kind = input.entityKind;
      if (input.contactKind !== undefined) updates.contact_kind = input.contactKind;
      if (input.companyId !== undefined) updates.company_id = input.companyId;
      if (input.fullName !== undefined) updates.full_name = input.fullName;
      if (input.companyName !== undefined) updates.company_name = input.companyName;
      if (input.email !== undefined) updates.email = input.email;
      if (input.phone !== undefined) {
        // Trimmed to null, the way useUpdateProjectParty writes the same
        // normalizer's other table: a space-only phone stored as '   ' reads
        // as "has a phone" to everything testing `phone != null` while
        // carrying no number at all.
        const nextPhone = input.phone?.trim() || null;
        updates.phone = nextPhone;
        // 00417's normalizer is 00281's: phone_e164 :=
        // normalize_phone_e164(COALESCE(NEW.phone, NEW.phone_e164)). Clearing
        // the raw phone alone therefore leaves the old derivation standing —
        // and that column is the rolodex's dedupe key. Send both.
        if (nextPhone === null) updates.phone_e164 = null;
      }
      if (input.specialties !== undefined) updates.specialties = input.specialties;
      if (input.vendorId !== undefined) updates.vendor_id = input.vendorId;
      if (input.profileId !== undefined) updates.profile_id = input.profileId;
      if (input.notes !== undefined) updates.notes = input.notes;

      const card = input.card;
      if (card) {
        if (card.isSoleProprietor !== undefined)
          updates.is_sole_proprietor = card.isSoleProprietor;
        if (card.studioVerdict !== undefined) {
          updates.studio_verdict = card.studioVerdict;
          // A verdict without its moment is a verdict nobody can date. Cleared
          // together, stamped together.
          updates.studio_verdict_at = card.studioVerdict ? new Date().toISOString() : null;
        }
        if (card.legalName !== undefined) updates.legal_name = card.legalName;
        if (card.dbaName !== undefined) updates.dba_name = card.dbaName;
        if (card.companyKind !== undefined) updates.company_kind = card.companyKind;
        if (card.trades !== undefined) updates.trades = card.trades;
        if (card.w9OnFileAt !== undefined) updates.w9_on_file_at = card.w9OnFileAt;
        if (card.taxIdLast4 !== undefined) updates.tax_id_last4 = card.taxIdLast4;
        if (card.remitTo !== undefined) updates.remit_to = card.remitTo;
        if (card.retainageBps !== undefined) updates.retainage_bps = card.retainageBps;
        if (card.warrantyUntil !== undefined) updates.warranty_until = card.warrantyUntil;
        if (card.paperworkContactPersonId !== undefined)
          updates.paperwork_contact_person_id = card.paperworkContactPersonId;
        if (card.signerPersonId !== undefined)
          updates.signer_person_id = card.signerPersonId;
        if (card.siteContactPersonId !== undefined)
          updates.site_contact_person_id = card.siteContactPersonId;
      }

      const { data, error } = await supabase
        .from('studio_contacts')
        .update(updates)
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioContact;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioContactKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      // CR11-7: `people_directory_seats` carries the card's own name, firm,
      // phone, consent, reach, paper and rule summary, so a card edit that
      // leaves it alone leaves every seat line printing the old fact.
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
    },
  });
}

/**
 * Archive a card (owner/admin only — 00417's admin UPDATE leg; there is no
 * member path to set archived_at). A plain member's call surfaces the
 * Postgres RLS rejection (0 rows updated / PGRST116 on .single()) as a thrown
 * error — callers should catch it and show "ask an owner to archive this".
 */
export const STUDIO_CONTACT_ARCHIVE_STANDING_SENTENCE =
  'Only an owner or an admin of the studio may put a card away, or bring one back.';

/** `archive_studio_contact()` / `restore_studio_contact()`'s two refusals. */
export function asArchiveError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  if (message.includes('studio_contact_archive_forbidden')) {
    return STUDIO_CONTACT_ARCHIVE_STANDING_SENTENCE;
  }
  if (message.includes('studio_contact_not_found')) {
    return 'That card is not in this studio\u2019s book.';
  }
  return message || 'The card did not move.';
}

export function useArchiveStudioContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<string | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      // 00629's RPC, not the table: it restates 00417's owner/admin rule in a
      // body SECURITY DEFINER cannot bypass, is idempotent on a card already
      // put away, and answers a non-member `studio_contact_not_found` rather
      // than leaking which ids exist.
      const { data, error } = await supabase.rpc('archive_studio_contact', {
        p_contact_id: id,
      });
      if (error) throw new Error(asArchiveError(error));
      return (data as string | null) ?? null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioContactKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      // CR11-7: `people_directory_seats` carries the card's own name, firm,
      // phone, consent, reach, paper and rule summary, so a card edit that
      // leaves it alone leaves every seat line printing the old fact.
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
    },
  });
}

/**
 * Restore an archived card (owner/admin only — same 00417 admin UPDATE leg as
 * archive). A plain member's call surfaces the RLS rejection as a thrown
 * error — see the module comment.
 */
export function useRestoreStudioContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase.rpc('restore_studio_contact', {
        p_contact_id: id,
      });
      if (error) throw new Error(asArchiveError(error));
      return null;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioContactKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      // CR11-7: `people_directory_seats` carries the card's own name, firm,
      // phone, consent, reach, paper and rule summary, so a card edit that
      // leaves it alone leaves every seat line printing the old fact.
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
    },
  });
}

/** What the rolodex picker's quiet history line says about one card. */
export interface StudioContactHistory {
  /** Distinct projects this contact has been a party on. */
  projectCount: number;
  /** The most recent of those projects, by the party row's created_at. */
  lastProjectName: string | null;
  /**
   * EVERY prior job this card has a seat on, newest first — not only the most
   * recent one.
   *
   * SPEC §5.7 #3 searches a PRIOR JOB ("Lindqvist"), and the population bring
   * forward exists for is the repeat sub, who by definition has been seated
   * since. Matching `lastProjectName` alone meant a card could only ever be
   * found by its single latest job: on a fresh project, searching "Lindqvist"
   * returned Ben Ostrom and hid Dana Kowalski, Pete Rusk, Ingrid Halvorsen and
   * Claire Bissett, all four of whom worked it (QA r1 QA-3, code review r1
   * MAJOR-6). The rows are already in hand — this is the same query, grouped
   * differently, at no extra request.
   */
  projectNames: string[];
  lastAt: string | null;
  /**
   * SPEC §5.7 #4 — the YEAR THAT JOB CLOSED, which is not the year the studio
   * seated them (w2c-report §6 item 5). `projects.completed_at` is the only
   * column that knows it; a job still open has none, and the picker's line
   * then says the year of the seat rather than claiming a close that has not
   * happened.
   */
  lastClosedYear: string | null;
}

/**
 * Per-contact project history for the rolodex picker's history line —
 * "3 projects · last: Ellsworth" (slide 13's mnote: "the history line is the
 * whole value").
 *
 * ONE query for the whole visible page: `project_parties` filtered by
 * `.in('studio_contact_id', ids)`, grouped client-side. Callers pass only the
 * ids currently on screen (the picker caps its page) — this is deliberately
 * not a per-card query and deliberately not a server-side rollup; a view for
 * it would be a later wave's work.
 *
 * HONEST LIMITS:
 *  · RLS scopes `project_parties` to projects the caller can see, so a card
 *    used on a studio-mate's project can read LOWER than the truth. The line
 *    is a memory aid, not an audit.
 *  · A contact with no linked party rows simply gets no entry — the picker
 *    renders "Never on a job yet" for that, which is the deck's copy.
 *  · `studio_contact_id` being set does NOT mean "came from the rolodex" (the
 *    00418 fold stamps client_rep/other rows too, and an evidence-free fold
 *    card reuses its source party's uuid as its own id). That is fine here:
 *    this groups by the COLUMN, never by comparing id spaces.
 */
export function useStudioContactHistory(
  contactIds: string[],
  options?: {
    /**
     * The job the reader is standing on, left OUT of the rollup.
     *
     * `lastProjectName` is the card's most recent seat, and the picker lists
     * cards already seated on the open job — so opening it on the Okonkwo
     * residence could print "Worked 1 prior project, Okonkwo residence" on a
     * row, and "from the Okonkwo residence" in the count line, while adding to
     * Okonkwo (code review r1 MAJOR-5). A PRIOR job is one that is not this
     * one.
     */
    excludeProjectId?: string | null;
  },
) {
  const ids = [...new Set(contactIds.filter(Boolean))].sort();
  const excludeProjectId = options?.excludeProjectId ?? null;
  return useQuery({
    queryKey: ['studio-contact-history', ids, excludeProjectId],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, StudioContactHistory>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_parties')
        .select(
          'studio_contact_id, project_id, created_at, projects(name, completed_at)',
        )
        .in('studio_contact_id', ids);
      if (error) throw error;

      const acc: Record<
        string,
        {
          projects: Set<string>;
          /** project_id -> [name, newest created_at on it] */
          named: Map<string, { name: string; at: string }>;
          lastAt: string | null;
          lastName: string | null;
          lastClosedAt: string | null;
        }
      > = {};
      for (const raw of (data ?? []) as Array<{
        studio_contact_id: string | null;
        project_id: string | null;
        created_at: string | null;
        projects?:
          | { name?: string | null; completed_at?: string | null }
          | Array<{ name?: string | null; completed_at?: string | null }>
          | null;
      }>) {
        const key = raw.studio_contact_id;
        if (!key) continue;
        if (excludeProjectId && raw.project_id === excludeProjectId) continue;
        const bucket = (acc[key] ??= {
          projects: new Set(),
          named: new Map(),
          lastAt: null,
          lastName: null,
          lastClosedAt: null,
        });
        if (raw.project_id) bucket.projects.add(raw.project_id);
        const embed = Array.isArray(raw.projects) ? raw.projects[0] : raw.projects;
        const name = embed?.name ?? null;
        if (raw.project_id && name) {
          const at = raw.created_at ?? '';
          const seen = bucket.named.get(raw.project_id);
          if (!seen || at > seen.at) bucket.named.set(raw.project_id, { name, at });
        }
        if (!bucket.lastAt || (raw.created_at && raw.created_at > bucket.lastAt)) {
          bucket.lastAt = raw.created_at ?? bucket.lastAt;
          bucket.lastName = name ?? bucket.lastName;
          bucket.lastClosedAt = embed?.completed_at ?? null;
        }
      }

      const out: Record<string, StudioContactHistory> = {};
      for (const [id, b] of Object.entries(acc)) {
        out[id] = {
          projectCount: b.projects.size,
          lastProjectName: b.lastName,
          projectNames: [
            ...new Set(
              [...b.named.values()]
                .sort((a, z) => (a.at < z.at ? 1 : a.at > z.at ? -1 : 0))
                .map((entry) => entry.name),
            ),
          ],
          lastAt: b.lastAt,
          lastClosedYear: b.lastClosedAt ? b.lastClosedAt.slice(0, 4) : null,
        };
      }
      return out;
    },
  });
}

export interface PromoteToStudioContactInput {
  organizationId: string;
  party: ProjectParty;
}

/**
 * Promote a project party (person card only — a keep-it-simple v1; vendor-
 * linked company handling is NOT done here) into the shared rolodex: inserts a
 * `studio_contacts` row derived from the party's snapshot fields, then stamps
 * `project_parties.studio_contact_id` on that party so the lineage matches the
 * 00418 fold's D1/D2 link-back. Invalidates the rolodex, this project's party
 * roster, and the People Room per the Wave 2 invalidation map.
 */
export function usePromoteToStudioContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      organizationId,
      party,
    }: PromoteToStudioContactInput): Promise<StudioContact> => {
      const supabase = getSupabase();
      const { data: contact, error: insertError } = await supabase
        .from('studio_contacts')
        .insert({
          organization_id: organizationId,
          entity_kind: 'person',
          contact_kind: party.party_kind,
          full_name: party.display_name,
          company_name: party.company_name,
          email: party.email,
          phone: party.phone,
          specialties: party.trade ? [party.trade] : [],
        })
        .select('*')
        .single();
      if (insertError) throw insertError;

      const { error: linkError } = await supabase
        .from('project_parties')
        .update({ studio_contact_id: (contact as StudioContact).id })
        .eq('id', party.id);
      if (linkError) throw linkError;

      return contact as StudioContact;
    },
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: studioContactKeys.all });
      void queryClient.invalidateQueries({
        queryKey: ['project-parties', variables.party.project_id],
      });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      // CR11-7: linking a seat to a card changes the seat line's own identity.
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// E6 · TYPED CHANNELS — `studio_contact_channels` (00592)
//
// Every way to reach a card, typed. A person carries personal lines (mobile,
// email); a firm carries firm lines (office, dispatch, AP email, after hours,
// a 311 portal). PR-b's hybrid: the seat snapshots the name and the trade, and
// reads the channels LIVE off the card.
//
// RLS is `is_active_studio_member(studio_contact_org(owner_id))` on all four
// verbs, so the owning card decides who may read and write.
// ═══════════════════════════════════════════════════════════════════════════

/** `studio_contact_channels.channel_kind` (00592's CHECK). */
export type ContactChannelKind =
  | 'mobile'
  | 'office'
  | 'dispatch'
  | 'after_hours'
  | 'email'
  | 'ap_email'
  | 'portal_311';

export const ALL_CONTACT_CHANNEL_KINDS: readonly ContactChannelKind[] = [
  'mobile',
  'office',
  'dispatch',
  'after_hours',
  'email',
  'ap_email',
  'portal_311',
] as const;

export const CONTACT_CHANNEL_KIND_LABELS: Record<ContactChannelKind, string> = {
  mobile: 'Mobile',
  office: 'Office',
  dispatch: 'Dispatch',
  after_hours: 'After hours',
  email: 'Email',
  ap_email: 'AP email',
  portal_311: '311 portal',
};

/** The channel kinds a PERSON card carries; the rest are firm lines. */
export const PERSON_CHANNEL_KINDS: readonly ContactChannelKind[] = [
  'mobile',
  'email',
] as const;

export const COMPANY_CHANNEL_KINDS: readonly ContactChannelKind[] = [
  'office',
  'dispatch',
  'ap_email',
  'after_hours',
  'portal_311',
] as const;

/** `studio_contact_channels.status` — "held" is every value but `active`. */
export type ContactChannelStatus = 'active' | 'bounced' | 'unsubscribed' | 'dead';

export const ALL_CONTACT_CHANNEL_STATUSES: readonly ContactChannelStatus[] = [
  'active',
  'bounced',
  'unsubscribed',
  'dead',
] as const;

/** True when the channel prints in the held treatment (--rail ground, a 2px
 *  terracotta leading rule, the reason in words — direction §5.4). */
export function isContactChannelHeld(status: string | null | undefined): boolean {
  return !!status && status !== 'active';
}

export interface StudioContactChannel {
  id: string;
  owner_type: 'person' | 'company';
  owner_id: string;
  channel_kind: ContactChannelKind | string;
  value: string;
  label: string | null;
  sms_capable: boolean;
  verified: boolean;
  verified_at: string | null;
  preferred: boolean;
  status: ContactChannelStatus | string;
  status_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AddStudioContactChannelInput {
  ownerType: 'person' | 'company';
  ownerId: string;
  channelKind: ContactChannelKind;
  value: string;
  label?: string | null;
  smsCapable?: boolean;
  preferred?: boolean;
}

export interface UpdateStudioContactChannelInput {
  id: string;
  ownerId: string;
  value?: string;
  label?: string | null;
  smsCapable?: boolean;
  preferred?: boolean;
  verified?: boolean;
}

export interface SetStudioContactChannelStatusInput {
  id: string;
  ownerId: string;
  status: ContactChannelStatus;
}

export const studioChannelKeys = {
  all: ['studio-contact-channels'] as const,
  list: (ownerId: string | null | undefined) =>
    ['studio-contact-channels', ownerId ?? null] as const,
  /** Several cards at once — the routed-contact line reads this (R-L). */
  owners: (ownerIds: readonly string[]) =>
    ['studio-contact-channels', 'owners', [...ownerIds].sort().join(',')] as const,
};

/** Every channel on one card, preferred first, then by kind. */
export function useStudioContactChannels(ownerId: string | null | undefined) {
  return useQuery({
    queryKey: studioChannelKeys.list(ownerId),
    enabled: !!ownerId,
    queryFn: async (): Promise<StudioContactChannel[]> => {
      if (!ownerId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_contact_channels')
        .select('*')
        .eq('owner_id', ownerId);
      if (error) throw error;
      const rows = (data ?? []) as StudioContactChannel[];
      return rows.sort((a, b) => {
        if (a.preferred !== b.preferred) return a.preferred ? -1 : 1;
        return String(a.channel_kind).localeCompare(String(b.channel_kind));
      });
    },
  });
}

/**
 * The channels on SEVERAL cards at once, keyed by owner. The Directory needs
 * this for one thing only: a rule that routes to somebody must print a WAY TO
 * REACH them (R-L / C22), and R-L names the typed `office` channel — not
 * `studio_contacts.phone`, which is whatever was typed into the card first.
 */
export function useStudioContactChannelsFor(ownerIds: readonly string[]) {
  const ids = [...new Set(ownerIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: studioChannelKeys.owners(ids),
    enabled: ids.length > 0,
    queryFn: async (): Promise<StudioContactChannel[]> => {
      if (ids.length === 0) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_contact_channels')
        .select('*')
        .in('owner_id', ids);
      if (error) throw error;
      return (data ?? []) as StudioContactChannel[];
    },
  });
}

function invalidateChannelFanout(
  queryClient: ReturnType<typeof useQueryClient>,
  ownerId: string,
) {
  void queryClient.invalidateQueries({ queryKey: studioChannelKeys.list(ownerId) });
  // `studioChannelKeys.owners(...)` is a sibling, not a descendant, of
  // `.list(ownerId)` — the root reaches both.
  void queryClient.invalidateQueries({ queryKey: studioChannelKeys.all });
  void queryClient.invalidateQueries({ queryKey: studioContactKeys.detail(ownerId) });
  // A channel is what the Directory row's reach word and `tel:` link read.
  void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
  void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
}

/**
 * CR3-3 — ALREADY ON FILE IS NOT A FAILURE.
 *
 * `idx_studio_contact_channels_owner_kind_value` is UNIQUE on
 * `(owner_id, channel_kind, value)`, and this was a bare `.insert()`. 00626's
 * `apply_party_rolodex_link_trg` auto-links a new seat to an EXISTING card by
 * phone, so adding somebody the rolodex already holds raised `23505` and the
 * Add sheet printed the raw Postgres string — naming the index, on a face,
 * which SPEC §8 #3 forbids outright. Worse, the sheet's resume chain only
 * marks a step written AFTER it succeeds, so every retry re-failed on the same
 * insert and the rule, the email and the authority grant behind it never ran.
 *
 * A duplicate is re-read and returned rather than replaced: a HELD channel is
 * not a deleted one (direction §5.1), so re-adding a bounced address must not
 * quietly mark it active again, and re-adding a number must not demote the
 * `preferred` flag somebody set on it.
 *
 * QA-1 — AND THE RE-READ KEYS ON THE STORED VALUE, NOT THE TYPED ONE.
 * `normalize_studio_contact_channel_trg` rewrites every `value` BEFORE INSERT
 * through `normalize_channel_value()` — `(612) 555-0111` is stored
 * `+16125550111`, `Frank@Example.COM` is stored lower-cased — so the unique
 * index only ever sees the normalised shape. Re-reading with the raw string
 * the studio typed matched nothing, fell through to `throw error`, and the Add
 * sheet showed "Could not add them just now. Try again." for exactly the
 * returning-sub case the recovery exists to serve — with the seat already
 * written and the channel, the rule and the authority grant behind it lost on
 * every retry. The DB's own function is asked for the key rather than a second
 * copy of the rule living here.
 */
export function useAddStudioContactChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AddStudioContactChannelInput,
    ): Promise<StudioContactChannel> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const value = input.value.trim();
      const { data, error } = await supabase
        .from('studio_contact_channels')
        .insert({
          owner_type: input.ownerType,
          owner_id: input.ownerId,
          channel_kind: input.channelKind,
          value,
          label: input.label?.trim() || null,
          sms_capable: input.smsCapable ?? false,
          preferred: input.preferred ?? false,
        })
        .select('*')
        .single();
      if (error) {
        const code = (error as { code?: string } | null)?.code;
        if (code !== '23505') throw error;
        const { data: normalized, error: normalizeError } = await supabase.rpc(
          'normalize_channel_value',
          { p_channel_kind: input.channelKind, p_value: value },
        );
        const storedValue =
          !normalizeError && typeof normalized === 'string' && normalized
            ? normalized
            : value;
        const { data: existing, error: readError } = await supabase
          .from('studio_contact_channels')
          .select('*')
          .eq('owner_id', input.ownerId)
          .eq('channel_kind', input.channelKind)
          .eq('value', storedValue)
          .maybeSingle();
        if (readError) throw readError;
        if (!existing) throw error;
        return existing as StudioContactChannel;
      }
      return data as StudioContactChannel;
    },
    onSuccess: (_data, input) => invalidateChannelFanout(queryClient, input.ownerId),
  });
}

export function useUpdateStudioContactChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: UpdateStudioContactChannelInput,
    ): Promise<StudioContactChannel> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const updates: Record<string, unknown> = {};
      if (input.value !== undefined) updates.value = input.value.trim();
      if (input.label !== undefined) updates.label = input.label?.trim() || null;
      if (input.smsCapable !== undefined) updates.sms_capable = input.smsCapable;
      if (input.preferred !== undefined) updates.preferred = input.preferred;
      if (input.verified !== undefined) {
        updates.verified = input.verified;
        // The flag and its date move together; an unverified channel keeps no
        // verification moment.
        updates.verified_at = input.verified ? new Date().toISOString() : null;
      }
      const { data, error } = await supabase
        .from('studio_contact_channels')
        .update(updates)
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioContactChannel;
    },
    onSuccess: (_data, input) => invalidateChannelFanout(queryClient, input.ownerId),
  });
}

/**
 * Hold or release a channel. A bounced, unsubscribed or dead line is never
 * deleted — direction §5.4: "Channels are hidden, never deleted" — so this
 * moves `status` and stamps `status_at`, and nothing removes the row.
 */
export function useSetStudioContactChannelStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: SetStudioContactChannelStatusInput,
    ): Promise<StudioContactChannel> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_contact_channels')
        .update({ status: input.status, status_at: new Date().toISOString() })
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioContactChannel;
    },
    onSuccess: (_data, input) => invalidateChannelFanout(queryClient, input.ownerId),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// E7 · THE CONTACT RULE — `studio_contact_rules` (00592)
//
// How NOT to reach someone, and who to write instead. One rule per subject; a
// per-job override is the same table with `subject_type = 'engagement'`.
// `contact_rule_summary(subject_type, subject_id)` is the SQL side's one-line
// rendering, already carried on both directory views.
// ═══════════════════════════════════════════════════════════════════════════

export type ContactRuleSubjectType = 'person' | 'company' | 'engagement';

/** The channel tokens a rule's arrays admit — the seven channel kinds plus
 *  `sms`, which is a consent channel rather than a stored line. */
export type ContactRuleChannel = ContactChannelKind | 'sms';

export const ALL_CONTACT_RULE_CHANNELS: readonly ContactRuleChannel[] = [
  ...ALL_CONTACT_CHANNEL_KINDS,
  'sms',
] as const;

export interface StudioContactRule {
  id: string;
  subject_type: ContactRuleSubjectType | string;
  subject_id: string;
  channels_allowed: string[];
  channels_forbidden: string[];
  /** "Write Rosa Delgado instead." — the routed person's card. */
  route_to_person_id: string | null;
  contact_hours: string | null;
  escalation_by_class: Record<string, unknown>;
  reason: string | null;
  set_by: string | null;
  set_at: string;
  created_at: string;
  updated_at: string;
}

export interface SetStudioContactRuleInput {
  subjectType: ContactRuleSubjectType;
  subjectId: string;
  channelsAllowed?: ContactRuleChannel[];
  channelsForbidden?: ContactRuleChannel[];
  routeToPersonId?: string | null;
  contactHours?: string | null;
  escalationByClass?: Record<string, unknown>;
  reason?: string | null;
  /**
   * CR3-2 — MERGE, DO NOT REPLACE.
   *
   * The default write is a FULL-ROW upsert: every column the caller omits is
   * sent as its empty default. That is right for the person card's rule editor,
   * which loads the standing row and round-trips every column it does not own.
   * It is wrong for any caller that knows only part of the rule — the Add
   * sheet types a `reason` and nothing else, and 00626's
   * `apply_party_rolodex_link_trg` auto-links a new seat to an EXISTING card by
   * phone, so adding a repeat sub to a second job erased that person's standing
   * do-not-contact rule and the route behind it.
   *
   * With `merge: true` the standing row is read first and every field the
   * caller leaves `undefined` is carried across unchanged. An explicitly passed
   * value still wins, including an explicitly empty array.
   */
  merge?: boolean;
}

export const contactRuleKeys = {
  all: ['studio-contact-rules'] as const,
  detail: (
    subjectType: ContactRuleSubjectType | null | undefined,
    subjectId: string | null | undefined,
  ) => ['studio-contact-rules', subjectType ?? null, subjectId ?? null] as const,
};

/**
 * The rule on one subject, or `null`. NULL is a FACT — "No contact rule on
 * file." (R-V) — and never an empty rule object; a caller that renders an
 * empty rule as "every channel is fair game" would be printing a rule the
 * studio never set.
 */
export function useContactRule(
  subjectType: ContactRuleSubjectType | null | undefined,
  subjectId: string | null | undefined,
) {
  return useQuery({
    queryKey: contactRuleKeys.detail(subjectType, subjectId),
    enabled: Boolean(subjectType && subjectId),
    queryFn: async (): Promise<StudioContactRule | null> => {
      if (!subjectType || !subjectId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_contact_rules')
        .select('*')
        .eq('subject_type', subjectType)
        .eq('subject_id', subjectId)
        .maybeSingle();
      if (error) throw error;
      return (data as StudioContactRule | null) ?? null;
    },
  });
}

/**
 * EVERY rule the studio can read, in one query.
 *
 * CR-5 / CR-6 / CR-22: the faces used to print `contact_rule_summary()` — a
 * mechanical clause list in raw `channel_kind` tokens, with the studio's own
 * typed sentence nowhere in it — and decided the hard block by running a regex
 * over that prose. `channels_forbidden`, `channels_allowed`, `reason` and
 * `route_to_person_id` are the ground truth, and a list read is what lets a
 * ledger of forty rows use them without forty queries.
 */
export function useContactRules() {
  return useQuery({
    queryKey: [...contactRuleKeys.all, 'list'] as const,
    queryFn: async (): Promise<StudioContactRule[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.from('studio_contact_rules').select('*');
      if (error) throw error;
      return (data ?? []) as StudioContactRule[];
    },
  });
}

function invalidateRuleFanout(
  queryClient: ReturnType<typeof useQueryClient>,
  subjectId: string,
) {
  // The root, not the detail: `useContactRules`' list key is a sibling of the
  // detail key, and every face now reads the list.
  void queryClient.invalidateQueries({ queryKey: contactRuleKeys.all });
  // The rule prints as a clause on the Directory row, the roster row, the
  // person card and the company card's crew line (R-S), all of which read
  // `contact_rule_summary` off the two directory views.
  void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
  void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
  void queryClient.invalidateQueries({ queryKey: studioContactKeys.detail(subjectId) });
}

/**
 * Write the rule, creating it or replacing it in place. One rule per subject.
 *
 * CR-8 — `set_by` IS SENT, NOT LEFT TO THE DEFAULT. `studio_contact_rules
 * .set_by` carries `DEFAULT auth.uid()` (00592), and a DEFAULT fires on the
 * INSERT leg alone. On `ON CONFLICT DO UPDATE` the row kept the ORIGINAL
 * setter while `set_at` moved to today, so the person card's Contact rule
 * region would read "Set by Priya Natarajan, 13 September 2026" for a rule
 * somebody else had just changed. The two columns move together or the
 * provenance is a lie.
 */
export function useSetContactRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetStudioContactRuleInput): Promise<StudioContactRule> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      // CR3-2: in merge mode the standing row is the baseline, so a caller that
      // knows only the reason cannot blank the forbidden list, the route or the
      // hours somebody else wrote.
      let standing: StudioContactRule | null = null;
      if (input.merge) {
        const { data: existing, error: readError } = await supabase
          .from('studio_contact_rules')
          .select('*')
          .eq('subject_type', input.subjectType)
          .eq('subject_id', input.subjectId)
          .maybeSingle();
        if (readError) throw readError;
        standing = (existing as StudioContactRule | null) ?? null;
      }
      const { data, error } = await supabase
        .from('studio_contact_rules')
        .upsert(
          {
            subject_type: input.subjectType,
            subject_id: input.subjectId,
            channels_allowed:
              input.channelsAllowed ?? standing?.channels_allowed ?? [],
            channels_forbidden:
              input.channelsForbidden ?? standing?.channels_forbidden ?? [],
            route_to_person_id:
              input.routeToPersonId !== undefined
                ? input.routeToPersonId
                : (standing?.route_to_person_id ?? null),
            contact_hours:
              input.contactHours !== undefined
                ? input.contactHours?.trim() || null
                : (standing?.contact_hours ?? null),
            escalation_by_class:
              input.escalationByClass ?? standing?.escalation_by_class ?? {},
            reason:
              input.reason !== undefined
                ? input.reason?.trim() || null
                : (standing?.reason ?? null),
            set_at: new Date().toISOString(),
            set_by: userData?.user?.id ?? null,
          },
          { onConflict: 'subject_type,subject_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioContactRule;
    },
    onSuccess: (_data, input) =>
      invalidateRuleFanout(queryClient, input.subjectId),
  });
}

/** Lift the rule entirely. The channels it hid come back; nothing about them
 *  was ever deleted. */
export function useClearContactRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      subjectType: ContactRuleSubjectType;
      subjectId: string;
    }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { error } = await supabase
        .from('studio_contact_rules')
        .delete()
        .eq('subject_type', input.subjectType)
        .eq('subject_id', input.subjectId);
      if (error) throw error;
      return input;
    },
    onSuccess: (_data, input) =>
      invalidateRuleFanout(queryClient, input.subjectId),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// E4 · AFFILIATIONS — `studio_person_affiliations` (00592)
//
// N persons × N firms. R-AI: `studio_contacts.company_id` is a DERIVED legacy
// pointer kept in step by a trigger; the room reads affiliations. R-AO: the
// pointer trigger opens or closes only the affiliation it names and leaves
// siblings standing.
// ═══════════════════════════════════════════════════════════════════════════

export interface StudioPersonAffiliation {
  id: string;
  person_id: string;
  company_id: string;
  role_at_firm: string | null;
  is_paperwork_contact: boolean;
  is_signer: boolean;
  holds_trade_license: boolean;
  from_date: string | null;
  /** NULL while the person is still with the firm. */
  to_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AffiliationFilters {
  personId?: string | null;
  companyId?: string | null;
  /** false (default) leaves closed affiliations out. */
  includeClosed?: boolean;
}

export interface SetAffiliationInput {
  personId: string;
  companyId: string;
  roleAtFirm?: string | null;
  isPaperworkContact?: boolean;
  isSigner?: boolean;
  holdsTradeLicense?: boolean;
  fromDate?: string | null;
}

export const affiliationKeys = {
  all: ['studio-person-affiliations'] as const,
  list: (filters?: AffiliationFilters) =>
    ['studio-person-affiliations', filters ?? {}] as const,
};

/**
 * A person's firms, or a firm's crew.
 *
 * CR13-8 — ORDERED, because R-AO makes this N persons × N firms: a person may
 * hold two OPEN affiliations at once (the Add sheet writes the second when an
 * existing person is seated under a different firm) and the pointer trigger
 * leaves siblings standing. An unordered read hands the caller whichever row
 * PostgREST returned first, so the person card printed one firm's name beside
 * another firm's role and start year — and could flip between renders. Newest
 * first, ties broken by id, so the list a face reads is stable.
 */
export function useAffiliations(filters?: AffiliationFilters) {
  const enabled = Boolean(filters?.personId || filters?.companyId);
  return useQuery({
    queryKey: affiliationKeys.list(filters),
    enabled,
    queryFn: async (): Promise<StudioPersonAffiliation[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      let query = supabase.from('studio_person_affiliations').select('*');
      if (filters?.personId) query = query.eq('person_id', filters.personId);
      if (filters?.companyId) query = query.eq('company_id', filters.companyId);
      if (!filters?.includeClosed) query = query.is('to_date', null);
      query = query
        .order('from_date', { ascending: false, nullsFirst: false })
        .order('id', { ascending: true });
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as StudioPersonAffiliation[];
    },
  });
}

function invalidateAffiliationFanout(
  queryClient: ReturnType<typeof useQueryClient>,
  personId: string,
  companyId: string,
) {
  void queryClient.invalidateQueries({ queryKey: affiliationKeys.all });
  void queryClient.invalidateQueries({ queryKey: studioContactKeys.all });
  // The firm line on the person card and the crew line on the company card
  // both read the affiliation, and the paper word follows the firm (R-BA).
  void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
  void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
  void queryClient.invalidateQueries({ queryKey: studioContactKeys.detail(personId) });
  void queryClient.invalidateQueries({ queryKey: studioContactKeys.detail(companyId) });
}

/** Open an affiliation, or restate the designations on a standing one. */
export function useSetAffiliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetAffiliationInput): Promise<StudioPersonAffiliation> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      // CR-2: `studio_person_affiliations`' only unique index is PARTIAL
      // (`00592:316-318`, `WHERE to_date IS NULL`), and PostgREST cannot emit
      // the index predicate an ON CONFLICT arbiter needs — an `.upsert()` here
      // raises 42P10 every time. Check then write.
      const row = {
        person_id: input.personId,
        company_id: input.companyId,
        role_at_firm: input.roleAtFirm?.trim() || null,
        is_paperwork_contact: input.isPaperworkContact ?? false,
        is_signer: input.isSigner ?? false,
        holds_trade_license: input.holdsTradeLicense ?? false,
        from_date: input.fromDate ?? null,
      };

      const { data: standing, error: readError } = await supabase
        .from('studio_person_affiliations')
        .select('id')
        .eq('person_id', input.personId)
        .eq('company_id', input.companyId)
        .is('to_date', null)
        .maybeSingle();
      if (readError) throw readError;

      const written = standing?.id
        ? await supabase
            .from('studio_person_affiliations')
            .update(row)
            .eq('id', standing.id)
            .select('*')
            .single()
        : await supabase
            .from('studio_person_affiliations')
            .insert(row)
            .select('*')
            .single();

      if (written.error) throw written.error;
      return written.data as StudioPersonAffiliation;
    },
    onSuccess: (_data, input) =>
      invalidateAffiliationFanout(queryClient, input.personId, input.companyId),
  });
}

/** Close an affiliation with a date. Never a delete — where someone worked is
 *  a fact the studio keeps (CRM-13's rule, applied to the firm tie). */
export function useCloseAffiliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      personId: string;
      companyId: string;
      toDate?: string | null;
    }): Promise<StudioPersonAffiliation> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_person_affiliations')
        .update({ to_date: input.toDate ?? new Date().toISOString().slice(0, 10) })
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioPersonAffiliation;
    },
    onSuccess: (_data, input) =>
      invalidateAffiliationFanout(queryClient, input.personId, input.companyId),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// E10 · COMPLIANCE DOCUMENTS — `studio_compliance_documents` (00623)
//
// The paper the studio HOLDS, against a rolodex card — `holder_type
// person|company`, because a COI is the firm's and a master licence is the
// person's. `compliance_state(holder)` is the paper word; `identity_paper_state`
// reduces a person's own paper and their firm's worst-first (R-BA).
// ═══════════════════════════════════════════════════════════════════════════

/** `studio_compliance_documents.doc_type` (00623's CHECK). */
export type ComplianceDocType =
  | 'coi_gl'
  | 'coi_wc'
  | 'coi_auto'
  | 'w9'
  | 'license'
  | 'bond'
  | 'lien_waiver_conditional'
  | 'lien_waiver_unconditional'
  | 'other_named';

export const ALL_COMPLIANCE_DOC_TYPES: readonly ComplianceDocType[] = [
  'coi_gl',
  'coi_wc',
  'coi_auto',
  'w9',
  'license',
  'bond',
  'lien_waiver_conditional',
  'lien_waiver_unconditional',
  'other_named',
] as const;

export const COMPLIANCE_DOC_TYPE_LABELS: Record<ComplianceDocType, string> = {
  coi_gl: 'COI, general liability',
  coi_wc: 'COI, workers compensation',
  coi_auto: 'COI, auto',
  w9: 'W-9',
  license: 'Licence',
  bond: 'Bond',
  lien_waiver_conditional: 'Lien waiver, conditional',
  lien_waiver_unconditional: 'Lien waiver, unconditional',
  other_named: 'Other',
};

/** The doc types 00623 requires an expiry on — a dated paper can lapse. */
export const DATED_COMPLIANCE_DOC_TYPES: readonly ComplianceDocType[] = [
  'coi_gl',
  'coi_wc',
  'coi_auto',
  'license',
  'bond',
] as const;

export function complianceDocRequiresExpiry(
  docType: string | null | undefined,
): boolean {
  return (
    !!docType && (DATED_COMPLIANCE_DOC_TYPES as readonly string[]).includes(docType)
  );
}

/** The three gates a document may hold. `blocks` is a closed vocabulary on
 *  purpose: a token no gate honours is a promise on a face (00623). */
export type ComplianceBlock = 'site_access' | 'payment' | 'draw';

export const ALL_COMPLIANCE_BLOCKS: readonly ComplianceBlock[] = [
  'site_access',
  'payment',
  'draw',
] as const;

export const COMPLIANCE_BLOCK_LABELS: Record<ComplianceBlock, string> = {
  site_access: 'site access',
  payment: 'payment',
  draw: 'the draw',
};

export interface StudioComplianceDocument {
  id: string;
  organization_id: string;
  holder_type: 'person' | 'company';
  holder_id: string;
  doc_type: ComplianceDocType | string;
  /** Required when `doc_type` is `other_named` — an unnamed other is the row
   *  that goes dark (00623's named CHECK). */
  doc_label: string | null;
  number: string | null;
  issuer: string | null;
  issued_on: string | null;
  expires_on: string | null;
  file_path: string | null;
  verified_by: string | null;
  /** NULL = arrived but not yet confirmed by the studio. The trade-side upload
   *  door (PR-a, P3) lands documents here with `inbound = true`. */
  verified_at: string | null;
  held_by: 'studio' | 'gc' | string;
  blocks: string[];
  superseded_by: string | null;
  source: 'studio' | 'field_link' | string;
  inbound: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceDocumentFilters {
  holderId?: string | null;
  /** false (default) leaves superseded paper out of the list. */
  includeSuperseded?: boolean;
  /** true returns only documents still awaiting the studio's confirmation. */
  unverifiedOnly?: boolean;
}

export interface RecordComplianceDocumentInput {
  organizationId: string;
  holderType: 'person' | 'company';
  holderId: string;
  docType: ComplianceDocType;
  /** Required when `docType` is `other_named`. */
  docLabel?: string | null;
  number?: string | null;
  issuer?: string | null;
  issuedOn?: string | null;
  expiresOn?: string | null;
  filePath?: string | null;
  heldBy?: 'studio' | 'gc';
  blocks?: ComplianceBlock[];
  /** The paper this one replaces. R-AZ: only a DATED paper may be superseded,
   *  and only by a dated, in-force successor. */
  supersedes?: string | null;
}

export const complianceKeys = {
  all: ['studio-compliance-documents'] as const,
  list: (filters?: ComplianceDocumentFilters) =>
    ['studio-compliance-documents', filters ?? {}] as const,
  holders: (holderIds: readonly string[]) =>
    ['studio-compliance-documents', 'holders', [...holderIds].sort()] as const,
  state: (holderId: string | null | undefined) =>
    ['studio-compliance-documents', 'state', holderId ?? null] as const,
};

/**
 * CR13-4 — THE RETIREMENT RULE `compliance_state()` USES, IN THE ONE PLACE THE
 * BROWSER FILTERS.
 *
 * R-BF makes supersession TRANSITIVE with a depth cap, and a row leaves the
 * reckoning only while a reachable successor is still IN FORCE and still
 * carries at least the retired row's gates AND is still the same doc_type
 * (00623: an honest supersede followed by two edits to the successor left a
 * lapsed gating certificate on file while a one-hop reading said current). A flat
 * `.is('superseded_by', null)` disagrees with that in both directions: it
 * drops a row whose successor has since lapsed or lost its gates, and it keeps
 * one retired two links down. The company card's table, its held clause and
 * the chase target all read this list, and the firm row beside them reads the
 * SQL — so the same paper printed two words.
 *
 * Exported so the rule can be read (and tested) on its own.
 */
export function retainedComplianceDocuments(
  rows: readonly StudioComplianceDocument[],
  today: string,
): StudioComplianceDocument[] {
  const byId = new Map(rows.map((doc) => [doc.id, doc]));
  const inForce = (doc: StudioComplianceDocument) =>
    !doc.expires_on || doc.expires_on >= today;
  const carriesGates = (
    root: StudioComplianceDocument,
    successor: StudioComplianceDocument,
  ) => (root.blocks ?? []).every((gate) => (successor.blocks ?? []).includes(gate));
  // W3 r8 B-1's third leg, which the SQL has and this reducer did not
  // (r12 MAJOR-1). `compliance_state()`'s retired CTE reads
  // `s.doc_type = c.root_doc_type` (00623): the supersede trigger judges a row
  // against its OWN successor and never against the rows pointing at it, so
  // retyping the successor is judged by nothing and any active studio member
  // may do it in one PATCH. Without this test the browser retires a lapsed
  // gating certificate the database still counts — the card prints `Lapsed`
  // over a Paper table the certificate is missing from, `paperHeldClause`
  // composes nothing and "Chase the renewal" has no document to chase.
  // `doc_type` is NOT NULL in 00623, so `===` is the SQL's `=`.
  const samePaper = (
    root: StudioComplianceDocument,
    successor: StudioComplianceDocument,
  ) => successor.doc_type === root.doc_type;

  const retired = (root: StudioComplianceDocument): boolean => {
    const seen = new Set<string>([root.id]);
    let next = root.superseded_by;
    // The head-of-chain guard makes `superseded_by` acyclic; the cap matches
    // the SQL's own (00623) and stops a chain written before that guard.
    for (let depth = 0; next && depth < 64; depth += 1) {
      if (seen.has(next)) break;
      seen.add(next);
      const successor = byId.get(next);
      // A successor the caller cannot see is not a successor that retires
      // anything: the row stays in the reckoning.
      if (!successor) return false;
      if (inForce(successor) && carriesGates(root, successor) && samePaper(root, successor)) {
        return true;
      }
      next = successor.superseded_by;
    }
    return false;
  };

  return rows.filter((doc) => !doc.superseded_by || !retired(doc));
}

/**
 * The paper held against SEVERAL cards at once (W3/P2).
 *
 * The picker's mini rows and the bring-forward consequence sentence both need
 * the DOCUMENT behind a paper word — which certificate, and the day it lapses
 * — for as many firms as the studio picked. One read for the page, never one
 * per row.
 */
export function useComplianceDocumentsFor(holderIds: readonly string[]) {
  const ids = [...new Set(holderIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: complianceKeys.holders(ids),
    enabled: ids.length > 0,
    queryFn: async (): Promise<StudioComplianceDocument[]> => {
      if (ids.length === 0) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_compliance_documents')
        .select('*')
        .in('holder_id', ids);
      if (error) throw error;
      // M2R-7 — THE SAME RETIREMENT RULE ITS SIBLING APPLIES. This hook
      // returned raw rows while `useComplianceDocuments` ten lines below runs
      // the identical rows through `retainedComplianceDocuments`, for the
      // reason the comment above it gives: the same paper otherwise prints two
      // words. `noticedPaperClause` then matched an append-only
      // `studio_compliance_notices` row against a document the reducers have
      // retired, so the picker's mini row printed paper `Current` beside
      // "…'s insurance lapsed 31 March 2026." and `bringForwardConsequence`
      // carried the same clause into the confirm sentence. The whole chain is
      // read (a superseded row is what decides whether its predecessor is
      // retired), and the rule is applied here rather than in the WHERE.
      const all = (data ?? []) as StudioComplianceDocument[];
      return retainedComplianceDocuments(
        all,
        new Date().toISOString().slice(0, 10),
      );
    },
  });
}

/** The paper held against one card. */
export function useComplianceDocuments(filters?: ComplianceDocumentFilters) {
  return useQuery({
    queryKey: complianceKeys.list(filters),
    enabled: Boolean(filters?.holderId),
    queryFn: async (): Promise<StudioComplianceDocument[]> => {
      if (!filters?.holderId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const query = supabase
        .from('studio_compliance_documents')
        .select('*')
        .eq('holder_id', filters.holderId);
      // The whole chain is read — a superseded row is what decides whether its
      // predecessor is retired (see `retainedComplianceDocuments`) — and the
      // retirement rule is applied here rather than in the WHERE clause.
      const { data, error } = await (filters.unverifiedOnly
        ? query.is('verified_at', null)
        : query);
      if (error) throw error;
      const all = (data ?? []) as StudioComplianceDocument[];
      const rows = filters.includeSuperseded
        ? all
        : retainedComplianceDocuments(all, new Date().toISOString().slice(0, 10));
      // Soonest expiry first, undated paper last: the studio reads what lapses
      // next, and an undated paper is HELD and cannot lapse (C21/R-K).
      return rows.sort((a, b) => {
        if (!a.expires_on) return 1;
        if (!b.expires_on) return -1;
        return a.expires_on.localeCompare(b.expires_on);
      });
    },
  });
}

/**
 * The one paper WORD for a holder, from `compliance_state()` — `current |
 * lapses_soon | lapsed | not_on_file`, worst-first over the holder's
 * non-superseded documents, with the 30-day window written in one place.
 *
 * A lender or an inspector prints NO paper word at all: the function reports
 * the fact (`not_on_file`) and the room decides whether the fact is owed
 * (R-A / `partyKindOwesPaper`).
 */
export function useComplianceState(holderId: string | null | undefined) {
  return useQuery({
    queryKey: complianceKeys.state(holderId),
    enabled: !!holderId,
    queryFn: async (): Promise<string | null> => {
      if (!holderId) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('compliance_state', {
        p_holder_id: holderId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

function invalidateComplianceFanout(
  queryClient: ReturnType<typeof useQueryClient>,
  holderId: string,
) {
  void queryClient.invalidateQueries({ queryKey: complianceKeys.all });
  void queryClient.invalidateQueries({ queryKey: studioContactKeys.detail(holderId) });
  // The paper word prints on the Directory row, the seat line and the roster's
  // held clause, all read off the two directory views.
  void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
  void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
}

/**
 * Record a document against a card. The company card is the ONLY place a
 * compliance document is written (direction §1 line 5); every other surface
 * reads it.
 *
 * A `supersedes` id is set on the OLD row, not on this one: the successor
 * points backward in 00623's shape (`superseded_by` on the paper that is being
 * replaced), and `compliance_state` walks that chain transitively (R-BF).
 */
export function useRecordComplianceDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: RecordComplianceDocumentInput,
    ): Promise<StudioComplianceDocument> => {
      if (input.docType === 'other_named' && !input.docLabel?.trim()) {
        throw new Error('Name this document — an unnamed one is the one that goes dark.');
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_compliance_documents')
        .insert({
          organization_id: input.organizationId,
          holder_type: input.holderType,
          holder_id: input.holderId,
          doc_type: input.docType,
          doc_label: input.docLabel?.trim() || null,
          number: input.number?.trim() || null,
          issuer: input.issuer?.trim() || null,
          issued_on: input.issuedOn ?? null,
          expires_on: input.expiresOn ?? null,
          file_path: input.filePath ?? null,
          held_by: input.heldBy ?? 'studio',
          blocks: input.blocks ?? [],
          source: 'studio',
          inbound: false,
        })
        .select('*')
        .single();
      if (error) throw error;
      const created = data as StudioComplianceDocument;

      if (input.supersedes) {
        const { error: supersedeError } = await supabase
          .from('studio_compliance_documents')
          .update({ superseded_by: created.id })
          .eq('id', input.supersedes);
        if (supersedeError) throw supersedeError;
      }
      return created;
    },
    onSuccess: (_data, input) => invalidateComplianceFanout(queryClient, input.holderId),
  });
}

/**
 * Confirm a document the studio did not file itself — the trade-side upload
 * door's other half (PR-a). Until `verified_at` is set the paper has arrived
 * but nobody has read it, which is a different fact from "on file".
 */
export function useConfirmComplianceDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      holderId: string;
    }): Promise<StudioComplianceDocument> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      const { data, error } = await supabase
        .from('studio_compliance_documents')
        .update({
          verified_at: new Date().toISOString(),
          verified_by: userData?.user?.id ?? null,
        })
        .eq('id', input.id)
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioComplianceDocument;
    },
    onSuccess: (_data, input) => invalidateComplianceFanout(queryClient, input.holderId),
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THE MERGE RECORD (00629, PR-o, crm-model §4) — People room CRM · W3/P2
//
// Two cards for one human converge into one. The merged card is NOT deleted
// and NOT archived: `merged_into` is its tombstone, `resolve_merged_contact()`
// maps the old id forward, and `studio_contact_merges` holds the act with the
// evidence word that justified it. PR-o: the studio always chooses which card
// survives, the OLDER one is pre-picked, and both ids stay resolvable.
//
// Consent is untouched by construction — `studio_channel_consent` is keyed on
// (organization_id, channel_kind, channel_value) and never on a card id, so a
// number's verdict follows the number with no write at all (R-AY).
// ═══════════════════════════════════════════════════════════════════════════

/** The evidence that justified a merge (crm-model §4 rules 1–4, plus manual). */
export type MergeMatchedOn =
  | 'profile'
  | 'phone'
  | 'email'
  | 'company_name'
  | 'manual';

export const ALL_MERGE_MATCHED_ON: readonly MergeMatchedOn[] = [
  'profile',
  'phone',
  'email',
  'company_name',
  'manual',
];

/** What the studio reads beside the act — never the column token. */
export const MERGE_MATCHED_ON_LABELS: Record<MergeMatchedOn, string> = {
  profile: 'They sign in with the same account',
  phone: 'They share a phone number',
  email: 'They share an email address',
  company_name: 'Same firm, same name',
  manual: 'The studio says so',
};

/** A `public.studio_contact_merges` row (00629) — append-only. */
export interface StudioContactMerge {
  id: string;
  organization_id: string;
  survivor_id: string;
  merged_id: string;
  matched_on: MergeMatchedOn | string;
  merged_by: string | null;
  merged_at: string;
}

export interface MergeStudioContactsInput {
  /** The card that stays. PR-o: the studio's call, older pre-picked. */
  survivorId: string;
  /** The card that folds into it. Both ids stay resolvable afterwards. */
  mergedId: string;
  matchedOn: MergeMatchedOn;
}

export const studioContactMergeKeys = {
  all: ['studio-contact-merges'] as const,
  list: (organizationId: string | null | undefined) =>
    ['studio-contact-merges', organizationId ?? null] as const,
};

export const resolvedContactKeys = {
  all: ['resolved-studio-contact'] as const,
  one: (contactId: string | null | undefined) =>
    ['resolved-studio-contact', contactId ?? null] as const,
};

/**
 * AN OLD ID, MAPPED FORWARD (`resolve_merged_contact`, 00629, PR-o).
 *
 * PR-o's "both ids stay resolvable" needs a reader, and until the r4 review
 * the repo had none: the merge sheet promised "an old link still opens this
 * person" while `people_directory` folds a merged card away and every list
 * read here filters `merged_into`, so a bookmarked or emailed
 * `/people?person=<old id>` opened nothing at all — no card, no error, no
 * redirect (r4 B-3, reproduced live against a fresh reset).
 *
 * Returns the id the card resolves to TODAY: itself while it is live, the
 * survivor once it has been folded, and `null` when the id names no card this
 * caller may read (the RPC is SECURITY INVOKER, so studio_contacts' own
 * member-only SELECT policy is the whole access rule).
 */
export function useResolvedContactId(contactId: string | null | undefined) {
  return useQuery({
    queryKey: resolvedContactKeys.one(contactId),
    enabled: !!contactId,
    queryFn: async (): Promise<string | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('resolve_merged_contact', {
        p_contact_id: contactId,
      });
      if (error) throw error;
      return (data as string | null) ?? null;
    },
  });
}

/** `merge_studio_contacts()`'s fourteen named refusals, as sentences. */
const MERGE_REFUSAL_SENTENCES: Record<string, string> = {
  merge_contact_not_found: 'One of these cards is no longer in the book.',
  merge_same_card: 'That is one card, not two.',
  merge_matched_on_invalid: 'Say what makes these the same person first.',
  merge_other_studio: 'These two cards belong to different studios.',
  merge_not_a_member: 'Only a member of this studio may merge its cards.',
  merge_already_merged: 'That card has already been folded into another one.',
  merge_survivor_already_merged:
    'The card you chose to keep has itself been folded into another one. Open that one instead.',
  merge_kind_mismatch:
    'A firm and a person are different kinds of card. A firm folds into a person only where the person is recorded as a sole proprietor.',
  // r4 B-1 / B-2 — the two refusals a merge makes about facts it may not drop.
  merge_two_logins:
    'These two cards name two different Patina accounts, so they are two people. Take the account off one of them first, or leave them as two.',
  merge_contact_rule_conflict:
    'The card being folded in says contact is blocked or routed elsewhere, and the card you are keeping says something else. Settle one rule on the card you are keeping, then merge.',
  // r5 M-4 — the survivor is a card the studio put away, so the merge would
  // take the whole identity out of the rolodex read.
  merge_survivor_archived:
    'The card you chose to keep has been put away. Put it back on the shelf first, or keep the other card instead.',
  // r11 MAJOR-2 — a seat on a job that records no studio. 00624's guard used
  // to abort the merge mid-transaction with its own raw token, which is a
  // schema word on a face naming no act (SPEC §7); 00629 refuses by name and
  // before the first write, with the job in `details`.
  merge_seat_on_studioless_project:
    'One of these cards holds a seat on a job that records no studio, so the seat cannot be moved. Record that job’s studio first, then merge.',
  // r13 MAJOR-1 — the SAME guard's third door. Both resolvers answer, and
  // simply name a studio the card is not in: the legacy seat stamped with
  // another studio's card that 00624's guard refuses on every write but
  // cannot undo. 00629 refuses it by name, before the first write, with the
  // job in `details`.
  merge_seat_card_other_studio:
    'One of these cards holds a seat on a job in another studio’s book, so the seat cannot be moved. Ask that studio to take the card off the seat, then merge.',
  // r18 MAJOR-1 — both cards hold an OPEN seat of the same kind on one job.
  // The fold would stamp one card on both rows, and each row can carry its
  // own open money grant, so the Call Sheet would print the same person twice
  // with two different signing figures. Which grant survives is the
  // principal's ruling (PR-n), not a repoint's, so the merge refuses and
  // names the repair the room already offers.
  merge_seat_collision:
    'Both cards hold an open seat of the same kind on the same job, and one person cannot hold the job twice. Close one of these two seats first, then merge.',
  // r22 MAJOR-1 — the same refusal asked of the GRANT. R-BS clamps 00634's
  // end-authority trigger off the withdrawal path, so "They withdrew" dates a
  // seat and leaves its money grant OPEN; the open-seats-only gate above
  // cannot see that seat, and the fold left one human holding two live
  // figures on one job. The repair is still the room's own "Close this seat",
  // which ends what the seat carried.
  merge_seat_authority_collision:
    'One of these two seats has left the job but still signs for something, so folding the cards would leave one person holding two standing grants on the same job. Close the seat that is still open — closing a seat ends what it signed for — then merge.',
};

/**
 * Render a merge refusal as a sentence; anything else comes back as itself.
 *
 * `details` is read for the four refusals that can NAME the thing standing in
 * the way — the job with no studio, the job in another studio's book, the job
 * where both cards hold an open seat of the same kind, and the job where one
 * of the two has left but still carries a standing grant — because "record
 * that job's studio first" / "close one of these two seats first" is an act
 * the studio cannot take without knowing which job (r11 MAJOR-2, r18 MAJOR-1,
 * r22 MAJOR-1).
 */
export function asMergeError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  const detail =
    typeof error === 'object' && error !== null && 'details' in error
      ? String((error as { details?: unknown }).details ?? '').trim()
      : '';
  if (message.includes('merge_seat_on_studioless_project') && detail) {
    return (
      `One of these cards holds a seat on ${detail}, which records no studio, ` +
      `so the seat cannot be moved. Record that job’s studio first, then merge.`
    );
  }
  // DETAIL is '<job> · <party_kind>', because "close one of these two seats"
  // is an act the studio cannot take without knowing which job and which kind.
  if (message.includes('merge_seat_collision') && detail) {
    const [job, kind] = detail.split(' · ');
    const seat = kind ? `${getPartyKindLabel(kind)} seat` : 'seat';
    return (
      `Both cards hold an open ${seat} on ${job}, and one person cannot hold ` +
      `the job twice. Close one of these two seats first, then merge.`
    );
  }
  // DETAIL is the same '<job> · <party_kind>' shape, and for the same reason:
  // "close the seat that is still open" is an act the studio cannot take
  // without knowing which job and which kind (r22 MAJOR-1).
  if (message.includes('merge_seat_authority_collision') && detail) {
    const [job, kind] = detail.split(' · ');
    const seat = kind ? `${getPartyKindLabel(kind)} seat` : 'seat';
    return (
      `One of these two ${seat}s on ${job} has left the job but still signs ` +
      `for something, so folding the cards would leave one person holding two ` +
      `standing grants on the same job. Close the seat that is still open — ` +
      `closing a seat ends what it signed for — then merge.`
    );
  }
  if (message.includes('merge_seat_card_other_studio') && detail) {
    return (
      `One of these cards holds a seat on ${detail}, a job in another ` +
      `studio’s book, so the seat cannot be moved. Ask that studio to take ` +
      `the card off the seat, then merge.`
    );
  }
  for (const [code, sentence] of Object.entries(MERGE_REFUSAL_SENTENCES)) {
    if (message.includes(code)) return sentence;
  }
  // r13 MAJOR-1 — AND NO SCHEMA WORD REACHES THE SHEET, whatever raises it.
  // `merge_studio_contacts()` runs eleven other guards' triggers inside its
  // one transaction, and each of those raises its own bare token
  // (`party_studio_contact_other_studio`, `designated_person_is_self`,
  // `household_member_not_a_live_person_card`, …). Every one of them used to
  // fall through to `return message` and print itself in the sheet's
  // `role="alert"` paragraph — a schema word on a face, naming no act
  // (SPEC §7). A bare snake_case token is never a sentence, so it is
  // answered with one; anything with whitespace is already prose (a Postgres
  // message, a network error) and is returned as it came.
  if (/^[a-z][a-z0-9_]*$/.test(message.trim())) {
    return 'The merge did not go through, and nothing was changed.';
  }
  return message || 'The merge did not go through.';
}

/** Every merge this studio has recorded, newest first. */
export function useStudioContactMerges(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: studioContactMergeKeys.list(organizationId),
    enabled: !!organizationId,
    queryFn: async (): Promise<StudioContactMerge[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_contact_merges')
        .select('*')
        .eq('organization_id', organizationId)
        .order('merged_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as StudioContactMerge[];
    },
  });
}

/**
 * Fold one card into another (`merge_studio_contacts`, 00629).
 *
 * One transaction repoints channels, affiliations, the contact rule, every
 * compliance document, the three firm designations, every SEAT
 * (`project_parties.studio_contact_id`), then sets `merged_into` and writes
 * the record. The Directory folds the merged card away because the room's unit
 * is the identity, not the card.
 *
 * Invalidation reaches every key that carries a card's facts: the rolodex, the
 * directory identities, the seats view (whose rows carry the card's name, firm
 * and words), the roster read models, channels, rules, affiliations and paper.
 */
export function useMergeStudioContacts() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MergeStudioContactsInput): Promise<string> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('merge_studio_contacts', {
        p_survivor: input.survivorId,
        p_merged: input.mergedId,
        p_matched_on: input.matchedOn,
      });
      if (error) throw new Error(asMergeError(error));
      return data as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioContactKeys.all });
      void queryClient.invalidateQueries({ queryKey: studioContactMergeKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      void queryClient.invalidateQueries({ queryKey: studioChannelKeys.all });
      void queryClient.invalidateQueries({ queryKey: contactRuleKeys.all });
      void queryClient.invalidateQueries({ queryKey: affiliationKeys.all });
      void queryClient.invalidateQueries({ queryKey: complianceKeys.all });
      // The seat's own read models: a repointed `studio_contact_id` moves
      // which identity every roster row belongs to.
      void queryClient.invalidateQueries({ queryKey: ['project-parties'] });
      void queryClient.invalidateQueries({ queryKey: ['project-roster'] });
      // r13 MAJOR-3 — THE TWO ROOTS THIS WAVE ITSELF MINTED. 00629 repoints
      // `project_parties.bid_quoted_by_person_id` and rewrites
      // `client_households.member_person_ids` / `primary_member_person_id`,
      // and neither read hangs off `['project-parties']`. The portal's
      // QueryClient runs `staleTime` five minutes with
      // `refetchOnWindowFocus: false`, so a Call Sheet opened shortly before a
      // merge kept the FOLDED estimator's id while the rolodex it resolves
      // names against refetched without it — the blank "Priced by" face, out
      // of a cache rather than an archive. The household band kept stale
      // membership over the same window.
      void queryClient.invalidateQueries({ queryKey: partyBidKeys.all });
      void queryClient.invalidateQueries({ queryKey: clientHouseholdKeys.all });
      // And the forward map itself: `resolve_merged_contact()` answers
      // differently for both ids the moment the fold lands (PR-o).
      void queryClient.invalidateQueries({ queryKey: resolvedContactKeys.all });
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// THE EXPIRY NOTICE (00630) — what the nightly sweep already told the studio
//
// `sweep_compliance_expiries()` writes one `studio_compliance_notices` row per
// (document, state), so a paper that crosses "lapses in 30 days" and later
// "lapsed" earns exactly two notices and the studio hears each sentence once.
// The room READS them: a paper word says where the paper stands, a notice says
// the studio has already been told, and with what date.
// ═══════════════════════════════════════════════════════════════════════════

/** A `public.studio_compliance_notices` row (00630). Read-only to the room. */
export interface ComplianceNotice {
  id: string;
  organization_id: string;
  document_id: string;
  state: 'lapses_soon' | 'lapsed' | string;
  noticed_at: string;
}

export const complianceNoticeKeys = {
  all: ['studio-compliance-notices'] as const,
  list: (organizationId: string | null | undefined) =>
    ['studio-compliance-notices', organizationId ?? null] as const,
};

/** Every expiry notice this studio has been given, newest first. */
export function useComplianceNotices(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: complianceNoticeKeys.list(organizationId),
    enabled: !!organizationId,
    queryFn: async (): Promise<ComplianceNotice[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_compliance_notices')
        .select('*')
        .eq('organization_id', organizationId)
        .order('noticed_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComplianceNotice[];
    },
  });
}

/** The newest notice per document, by state — the shape every surface reads. */
export function indexComplianceNotices(
  notices: readonly ComplianceNotice[] | undefined,
): Map<string, ComplianceNotice> {
  const index = new Map<string, ComplianceNotice>();
  for (const notice of notices ?? []) {
    // The list arrives newest first, and `lapsed` outranks `lapses_soon`:
    // a paper that has already gone is not still "about to".
    const standing = index.get(notice.document_id);
    if (!standing) {
      index.set(notice.document_id, notice);
      continue;
    }
    if (standing.state !== 'lapsed' && notice.state === 'lapsed') {
      index.set(notice.document_id, notice);
    }
  }
  return index;
}
