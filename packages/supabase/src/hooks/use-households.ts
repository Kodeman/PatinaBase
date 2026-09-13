'use client';

// ═══════════════════════════════════════════════════════════════════════════
// THE HOUSEHOLD (E3, 00632) — People room CRM · W3/P2, PR-c
//
// "Both, split by job. A household holds the members and the change-order
//  threshold; every member who acts on a job gets a seat carrying the
//  authority grant."
//
// One `client_households` row holds the humans who are ONE client of the
// studio, plus the figure over which a change order needs a signature.
// `designer_clients.household_id` points the client record at it.
// `add_household_member()` is the single act: the membership, the seat on a
// named job, and — only where the household carries a figure and the caller is
// an owner or an admin (PR-n) — the money grant on that seat.
//
// PR-n is enforced in the database, loudly: a caller without owner/admin
// standing is REFUSED (`household_grant_forbidden`) rather than quietly handed
// a seat with no authority. The room prints that refusal as a sentence.
// ═══════════════════════════════════════════════════════════════════════════

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createBrowserClient } from '../client';
import { peopleKeys, peopleSeatKeys } from './use-people';
import { partyAuthorityKeys } from './use-coordination';

const getSupabase = () => createBrowserClient();

/** A `public.client_households` row (00632). */
export interface ClientHousehold {
  id: string;
  organization_id: string;
  designer_id: string;
  display_name: string;
  /** `studio_contacts` ids — PERSON cards in the household's own studio. */
  member_person_ids: string[];
  primary_member_person_id: string | null;
  /** Integer cents. $2,500 is 250000. NULL = no figure recorded. */
  co_threshold_cents: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** The two roles `add_household_member()` admits — both already party kinds. */
export type HouseholdMemberRole = 'client' | 'client_rep';

export const HOUSEHOLD_MEMBER_ROLE_LABELS: Record<HouseholdMemberRole, string> = {
  // The studio's words, never the schema's (SPEC §8 #3).
  client: 'decides the work',
  client_rep: 'signs for the household',
};

export interface CreateClientHouseholdInput {
  organizationId: string;
  designerId: string;
  displayName: string;
  /** PR-n: a figure at creation is an owner's or an admin's write. */
  coThresholdCents?: number | null;
  /** The client record this household answers for, pointed at it in the same act. */
  designerClientId?: string | null;
}

export interface SetHouseholdThresholdInput {
  id: string;
  /** Integer cents, or null to take the figure off the record. */
  coThresholdCents: number | null;
}

export interface AddHouseholdMemberInput {
  householdId: string;
  /** A live, unmerged PERSON card in the household's own studio rolodex. */
  personId: string;
  role: HouseholdMemberRole;
  /** Omit to record the membership alone; name a job to seat them on it. */
  projectId?: string | null;
}

export const clientHouseholdKeys = {
  all: ['client-households'] as const,
  list: (organizationId: string | null | undefined) =>
    ['client-households', organizationId ?? null] as const,
  detail: (id: string | null | undefined) =>
    ['client-households', 'detail', id ?? null] as const,
};

/** PR-n and 00632's own refusals, as sentences the studio can act on. */
const HOUSEHOLD_REFUSAL_SENTENCES: Record<string, string> = {
  household_role_invalid:
    'Say whether they decide the work or sign for the household.',
  household_not_found: 'That household is not in this studio’s book.',
  household_member_not_a_live_person_card:
    'A household member is a person already in the studio’s book.',
  household_primary_not_a_member:
    'The person you write to first has to be one of the household.',
  household_grant_forbidden:
    'A change-order figure is the principal’s to set. Ask an owner or an admin of the studio to add this member.',
  household_grant_project_has_no_studio:
    'This job is not attached to a studio yet, so there is nothing to record the authority against.',
  household_member_null: 'A household member needs a card behind the name.',
};

export function asHouseholdError(error: unknown): string {
  const message =
    typeof error === 'object' && error !== null && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  for (const [code, sentence] of Object.entries(HOUSEHOLD_REFUSAL_SENTENCES)) {
    if (message.includes(code)) return sentence;
  }
  return message || 'The household did not take that.';
}

/** Every household this studio holds. */
export function useClientHouseholds(organizationId: string | null | undefined) {
  return useQuery({
    queryKey: clientHouseholdKeys.list(organizationId),
    enabled: !!organizationId,
    queryFn: async (): Promise<ClientHousehold[]> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_households')
        .select('*')
        .eq('organization_id', organizationId)
        .order('display_name', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ClientHousehold[];
    },
  });
}

/** One household, by id. */
export function useClientHousehold(id: string | null | undefined) {
  return useQuery({
    queryKey: clientHouseholdKeys.detail(id),
    enabled: !!id,
    queryFn: async (): Promise<ClientHousehold | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_households')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      if (error) throw error;
      return (data as ClientHousehold | null) ?? null;
    },
  });
}

/**
 * The household this job's client side belongs to (PR-c).
 *
 * THE SEAT IS THE LINK, not a column on the project. `projects` carries no
 * pointer at `designer_clients` — a no-login household is a client record with
 * no `client_id` at all — so a bridge through that table answers NULL for
 * exactly the population PR-c exists for. What the job DOES carry is its
 * client side: the `client` and `client_rep` seats, each stamped with a
 * rolodex card. A household is the row whose `member_person_ids` overlap them,
 * which is PR-c's own sentence read backwards: "every member who acts on a job
 * gets a seat".
 *
 * `designerClientId` comes back beside it, resolved the shipped way (the
 * client's auth uid on `projects.client_profile_id`), so opening a household
 * can point that record at it where one exists. NULL there is a fact, not a
 * failure: the household stands on its own.
 */
export function useProjectHousehold(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ['client-households', 'project', projectId ?? null] as const,
    enabled: !!projectId,
    queryFn: async (): Promise<{
      household: ClientHousehold | null;
      designerClientId: string | null;
      designerId: string | null;
      /** The client-side cards this job seats — the household's candidates. */
      memberCardIds: string[];
    }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('designer_id, client_profile_id')
        .eq('id', projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      const designerId = (project?.designer_id as string | null) ?? null;
      const clientProfileId = (project?.client_profile_id as string | null) ?? null;

      let designerClientId: string | null = null;
      if (designerId && clientProfileId) {
        const { data: clientRow, error: clientError } = await supabase
          .from('designer_clients')
          .select('id')
          .eq('designer_id', designerId)
          .eq('client_id', clientProfileId)
          .maybeSingle();
        if (clientError) throw clientError;
        designerClientId = (clientRow?.id as string | null) ?? null;
      }

      const { data: seats, error: seatsError } = await supabase
        .from('project_parties')
        .select('studio_contact_id, party_kind')
        .eq('project_id', projectId)
        .in('party_kind', ['client', 'client_rep']);
      if (seatsError) throw seatsError;
      const memberCardIds = [
        ...new Set(
          ((seats ?? []) as Array<{ studio_contact_id: string | null }>)
            .map((seat) => seat.studio_contact_id)
            .filter((id): id is string => !!id),
        ),
      ];
      if (memberCardIds.length === 0) {
        return { household: null, designerClientId, designerId, memberCardIds };
      }

      const { data: households, error: householdError } = await supabase
        .from('client_households')
        .select('*')
        .overlaps('member_person_ids', memberCardIds)
        .limit(1);
      if (householdError) throw householdError;
      return {
        household: ((households ?? [])[0] as ClientHousehold | null) ?? null,
        designerClientId,
        designerId,
        memberCardIds,
      };
    },
  });
}

/**
 * Open a household for a client record that has none yet.
 *
 * The INSERT's own WITH CHECK carries PR-n: a row born with
 * `co_threshold_cents` set is refused for anyone but an owner or an admin, so
 * the figure is left off here and set through `useSetHouseholdThreshold`,
 * where the refusal has a sentence beside it.
 */
export function useCreateClientHousehold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: CreateClientHouseholdInput,
    ): Promise<ClientHousehold> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_households')
        .insert({
          organization_id: input.organizationId,
          designer_id: input.designerId,
          display_name: input.displayName.trim(),
          co_threshold_cents: input.coThresholdCents ?? null,
        })
        .select('*')
        .single();
      if (error) throw new Error(asHouseholdError(error));
      const household = data as ClientHousehold;
      if (input.designerClientId) {
        const { error: pointerError } = await supabase
          .from('designer_clients')
          .update({ household_id: household.id })
          .eq('id', input.designerClientId);
        if (pointerError) throw new Error(asHouseholdError(pointerError));
      }
      return household;
    },
    onSuccess: (household) => {
      void queryClient.invalidateQueries({ queryKey: clientHouseholdKeys.all });
      void queryClient.invalidateQueries({
        queryKey: clientHouseholdKeys.detail(household.id),
      });
    },
  });
}

/**
 * PR-n — the change-order figure, and who may write it.
 *
 * The UPDATE's WITH CHECK refuses any row leaving with a non-null
 * `co_threshold_cents` unless the caller is an owner or an admin of the
 * studio. The refusal arrives as an RLS rejection; it is rendered as the
 * principal sentence rather than a Postgres string.
 */
export function useSetHouseholdThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: SetHouseholdThresholdInput,
    ): Promise<ClientHousehold> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase
        .from('client_households')
        .update({ co_threshold_cents: input.coThresholdCents })
        .eq('id', input.id)
        .select('*')
        .maybeSingle();
      if (error) throw new Error(asHouseholdError(error));
      if (!data) {
        // Zero rows back from an UPDATE the caller can SELECT is the WITH
        // CHECK refusing the figure, not a missing row.
        throw new Error(HOUSEHOLD_REFUSAL_SENTENCES.household_grant_forbidden);
      }
      return data as ClientHousehold;
    },
    onSuccess: (household) => {
      void queryClient.invalidateQueries({ queryKey: clientHouseholdKeys.all });
      void queryClient.invalidateQueries({
        queryKey: clientHouseholdKeys.detail(household.id),
      });
      void queryClient.invalidateQueries({ queryKey: ['client-households', 'project'] });
    },
  });
}

/**
 * PR-c's one act: the membership, the seat, and the grant (`add_household_member`).
 *
 * Returns the seat's id, or null where no project was named — the membership
 * alone was the act. Idempotent on a seat that already stands.
 */
export function useAddHouseholdMember() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: AddHouseholdMemberInput,
    ): Promise<string | null> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc('add_household_member', {
        p_household_id: input.householdId,
        p_person_id: input.personId,
        p_role: input.role,
        ...(input.projectId ? { p_project_id: input.projectId } : {}),
      });
      if (error) throw new Error(asHouseholdError(error));
      return (data as string | null) ?? null;
    },
    onSuccess: (_seatId, input) => {
      void queryClient.invalidateQueries({ queryKey: clientHouseholdKeys.all });
      void queryClient.invalidateQueries({ queryKey: ['client-households', 'project'] });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      void queryClient.invalidateQueries({ queryKey: partyAuthorityKeys.all });
      if (input.projectId) {
        void queryClient.invalidateQueries({
          queryKey: ['project-parties', input.projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ['project-roster', input.projectId],
        });
      }
    },
  });
}
