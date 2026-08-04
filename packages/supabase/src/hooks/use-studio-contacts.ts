'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { ProjectParty } from './use-coordination';

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
  created_at: string;
  updated_at: string;
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
}

export interface StudioContactFilters {
  /** 'all' (or undefined) returns every contact_kind. */
  kind?: string | 'all';
  /** Case-insensitive match over full_name / company_name / email (the
   *  use-people idiom — filtered in memory, the rolodex is per-studio-sized). */
  search?: string;
  /** false (default) excludes archived_at IS NOT NULL rows. */
  includeArchived?: boolean;
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
 * null)` unless `includeArchived`, `.eq('contact_kind', …)` when `kind` is set
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
      void queryClient.invalidateQueries({ queryKey: ['people-directory'] });
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
      if (input.phone !== undefined) updates.phone = input.phone;
      if (input.specialties !== undefined) updates.specialties = input.specialties;
      if (input.vendorId !== undefined) updates.vendor_id = input.vendorId;
      if (input.profileId !== undefined) updates.profile_id = input.profileId;
      if (input.notes !== undefined) updates.notes = input.notes;

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
      void queryClient.invalidateQueries({ queryKey: ['people-directory'] });
    },
  });
}

/**
 * Archive a card (owner/admin only — 00417's admin UPDATE leg; there is no
 * member path to set archived_at). A plain member's call surfaces the
 * Postgres RLS rejection (0 rows updated / PGRST116 on .single()) as a thrown
 * error — callers should catch it and show "ask an owner to archive this".
 */
export function useArchiveStudioContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: string }): Promise<StudioContact> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('studio_contacts')
        .update({ archived_at: new Date().toISOString() })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioContact;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioContactKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['people-directory'] });
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
    mutationFn: async ({ id }: { id: string }): Promise<StudioContact> => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('studio_contacts')
        .update({ archived_at: null })
        .eq('id', id)
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioContact;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: studioContactKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['people-directory'] });
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
      void queryClient.invalidateQueries({ queryKey: ['people-directory'] });
    },
  });
}
