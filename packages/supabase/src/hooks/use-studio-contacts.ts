'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import type { ProjectParty } from './use-coordination';
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

/** What the rolodex picker's quiet history line says about one card. */
export interface StudioContactHistory {
  /** Distinct projects this contact has been a party on. */
  projectCount: number;
  /** The most recent of those projects, by the party row's created_at. */
  lastProjectName: string | null;
  lastAt: string | null;
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
export function useStudioContactHistory(contactIds: string[]) {
  const ids = [...new Set(contactIds.filter(Boolean))].sort();
  return useQuery({
    queryKey: ['studio-contact-history', ids],
    enabled: ids.length > 0,
    queryFn: async (): Promise<Record<string, StudioContactHistory>> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('project_parties')
        .select('studio_contact_id, project_id, created_at, projects(name)')
        .in('studio_contact_id', ids);
      if (error) throw error;

      const acc: Record<string, { projects: Set<string>; lastAt: string | null; lastName: string | null }> = {};
      for (const raw of (data ?? []) as Array<{
        studio_contact_id: string | null;
        project_id: string | null;
        created_at: string | null;
        projects?: { name?: string | null } | Array<{ name?: string | null }> | null;
      }>) {
        const key = raw.studio_contact_id;
        if (!key) continue;
        const bucket = (acc[key] ??= { projects: new Set(), lastAt: null, lastName: null });
        if (raw.project_id) bucket.projects.add(raw.project_id);
        const embed = Array.isArray(raw.projects) ? raw.projects[0] : raw.projects;
        const name = embed?.name ?? null;
        if (!bucket.lastAt || (raw.created_at && raw.created_at > bucket.lastAt)) {
          bucket.lastAt = raw.created_at ?? bucket.lastAt;
          bucket.lastName = name ?? bucket.lastName;
        }
      }

      const out: Record<string, StudioContactHistory> = {};
      for (const [id, b] of Object.entries(acc)) {
        out[id] = {
          projectCount: b.projects.size,
          lastProjectName: b.lastName,
          lastAt: b.lastAt,
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
      void queryClient.invalidateQueries({ queryKey: ['people-directory'] });
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

function invalidateChannelFanout(
  queryClient: ReturnType<typeof useQueryClient>,
  ownerId: string,
) {
  void queryClient.invalidateQueries({ queryKey: studioChannelKeys.list(ownerId) });
  void queryClient.invalidateQueries({ queryKey: studioContactKeys.detail(ownerId) });
  // A channel is what the Directory row's reach word and `tel:` link read.
  void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
  void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
}

export function useAddStudioContactChannel() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AddStudioContactChannelInput,
    ): Promise<StudioContactChannel> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_contact_channels')
        .insert({
          owner_type: input.ownerType,
          owner_id: input.ownerId,
          channel_kind: input.channelKind,
          value: input.value.trim(),
          label: input.label?.trim() || null,
          sms_capable: input.smsCapable ?? false,
          preferred: input.preferred ?? false,
        })
        .select('*')
        .single();
      if (error) throw error;
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

function invalidateRuleFanout(
  queryClient: ReturnType<typeof useQueryClient>,
  subjectType: ContactRuleSubjectType,
  subjectId: string,
) {
  void queryClient.invalidateQueries({
    queryKey: contactRuleKeys.detail(subjectType, subjectId),
  });
  // The rule prints as a clause on the Directory row, the roster row, the
  // person card and the company card's crew line (R-S), all of which read
  // `contact_rule_summary` off the two directory views.
  void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
  void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
  void queryClient.invalidateQueries({ queryKey: studioContactKeys.detail(subjectId) });
}

/** Write the rule, creating it or replacing it in place. One rule per subject. */
export function useSetContactRule() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SetStudioContactRuleInput): Promise<StudioContactRule> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('studio_contact_rules')
        .upsert(
          {
            subject_type: input.subjectType,
            subject_id: input.subjectId,
            channels_allowed: input.channelsAllowed ?? [],
            channels_forbidden: input.channelsForbidden ?? [],
            route_to_person_id: input.routeToPersonId ?? null,
            contact_hours: input.contactHours?.trim() || null,
            escalation_by_class: input.escalationByClass ?? {},
            reason: input.reason?.trim() || null,
            set_at: new Date().toISOString(),
          },
          { onConflict: 'subject_type,subject_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioContactRule;
    },
    onSuccess: (_data, input) =>
      invalidateRuleFanout(queryClient, input.subjectType, input.subjectId),
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
      invalidateRuleFanout(queryClient, input.subjectType, input.subjectId),
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

/** A person's firms, or a firm's crew. */
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
      const { data, error } = await supabase
        .from('studio_person_affiliations')
        .upsert(
          {
            person_id: input.personId,
            company_id: input.companyId,
            role_at_firm: input.roleAtFirm?.trim() || null,
            is_paperwork_contact: input.isPaperworkContact ?? false,
            is_signer: input.isSigner ?? false,
            holds_trade_license: input.holdsTradeLicense ?? false,
            from_date: input.fromDate ?? null,
          },
          { onConflict: 'person_id,company_id' },
        )
        .select('*')
        .single();
      if (error) throw error;
      return data as StudioPersonAffiliation;
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
  state: (holderId: string | null | undefined) =>
    ['studio-compliance-documents', 'state', holderId ?? null] as const,
};

/** The paper held against one card. */
export function useComplianceDocuments(filters?: ComplianceDocumentFilters) {
  return useQuery({
    queryKey: complianceKeys.list(filters),
    enabled: Boolean(filters?.holderId),
    queryFn: async (): Promise<StudioComplianceDocument[]> => {
      if (!filters?.holderId) return [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      let query = supabase
        .from('studio_compliance_documents')
        .select('*')
        .eq('holder_id', filters.holderId);
      if (!filters.includeSuperseded) query = query.is('superseded_by', null);
      if (filters.unverifiedOnly) query = query.is('verified_at', null);
      const { data, error } = await query;
      if (error) throw error;
      const rows = (data ?? []) as StudioComplianceDocument[];
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
