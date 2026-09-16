"use client";

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

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createBrowserClient } from "../client";
import { peopleKeys, peopleSeatKeys } from "./use-people";
import { partyAuthorityKeys } from "./use-coordination";

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
export type HouseholdMemberRole = "client" | "client_rep";

export const HOUSEHOLD_MEMBER_ROLE_LABELS: Record<HouseholdMemberRole, string> =
  {
    // The studio's words, never the schema's (SPEC §8 #3).
    client: "decides the work",
    client_rep: "signs for the household",
  };

export interface CreateClientHouseholdInput {
  organizationId: string;
  designerId: string;
  displayName: string;
  /** PR-n: a figure at creation is an owner's or an admin's write. */
  coThresholdCents?: number | null;
  /**
   * The PERSON cards the household is born holding — in practice the job's
   * own client-side identities.
   *
   * 00632 defaults `member_person_ids` to `'{}'`, and an empty array overlaps
   * nothing, so a household born with no members was invisible to
   * `useProjectHousehold`'s own resolver: the band printed "No household is on
   * file" over the household it had just made, offered the door again, and
   * minted another orphan row on every press (code review r1 BLOCKING-1,
   * QA r1 QA-4). Seeding the membership at creation is the half of the fix
   * that makes the row findable by the job; the `designer_clients.household_id`
   * pointer below is the other half.
   */
  memberPersonIds?: string[];
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
  all: ["client-households"] as const,
  list: (organizationId: string | null | undefined) =>
    ["client-households", organizationId ?? null] as const,
  detail: (id: string | null | undefined) =>
    ["client-households", "detail", id ?? null] as const,
};

/** PR-n and 00632's own refusals, as sentences the studio can act on. */
const HOUSEHOLD_REFUSAL_SENTENCES: Record<string, string> = {
  household_role_invalid:
    "Say whether they decide the work or sign for the household.",
  household_not_found: "That household is not in this studio’s book.",
  household_member_not_a_live_person_card:
    "A household member is a person already in the studio’s book.",
  household_primary_not_a_member:
    "The person you write to first has to be one of the household.",
  household_grant_forbidden:
    "A change-order figure is the principal’s to set. Ask an owner or an admin of the studio to add this member.",
  household_grant_project_has_no_studio:
    "This job is not attached to a studio yet, so there is nothing to record the authority against.",
  household_member_null: "A household member needs a card behind the name.",
  household_threshold_forbidden:
    "A change-order figure is the principal’s to set, and the principal’s to take away. Ask an owner or an admin of the studio.",
};

export function asHouseholdError(error: unknown): string {
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : String(error ?? "");
  for (const [code, sentence] of Object.entries(HOUSEHOLD_REFUSAL_SENTENCES)) {
    if (message.includes(code)) return sentence;
  }
  return message || "The household did not take that.";
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
        .from("client_households")
        .select("*")
        .eq("organization_id", organizationId)
        .order("display_name", { ascending: true });
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
        .from("client_households")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      return (data as ClientHousehold | null) ?? null;
    },
  });
}

/**
 * The clause `add_household_member()` and `set_household_threshold()` stamp on
 * a money grant they opened, and the one they will both leave alone when they
 * find it on somebody else's (00632 §4, r9 M-1).
 */
export const HOUSEHOLD_GRANT_SOURCE_CLAUSE =
  "client_households.co_threshold_cents";

/**
 * A client-side seat's OPEN money grant, as the band needs to read it before
 * it promises anything (r10 BLOCKING-1).
 */
export interface ClientSideMoneyGrant {
  /** The seat the grant hangs off. */
  engagementId: string;
  /** The card seated there — how the band finds the person it is about. */
  personId: string | null;
  /** The seat's kind, because a seat is reused per (card, kind). */
  partyKind: string;
  thresholdCents: number | null;
  sourceClause: string | null;
  /**
   * WHICH household wrote it (00632 §2b, r16 MAJOR-1). The clause names the
   * table, so every household in the studio matched every other household's
   * grant on the string; the RPCs ask this column beside it, and so does the
   * face.
   */
  sourceHouseholdId: string | null;
}

/**
 * The rule both RPCs make, as one function (00632 §3/§4, r9 M-1 + r16
 * MAJOR-1): a household moves a standing money grant only where IT wrote the
 * row AND the row still names the household as its source. Anything else — the
 * agreement's own clause, or another household's figure — stands exactly as it
 * is, and the face says so before the press.
 */
export function householdOwnsGrant(
  grant: Pick<
    ClientSideMoneyGrant,
    "sourceClause" | "sourceHouseholdId"
  > | null,
  householdId: string | null | undefined,
): boolean {
  if (!grant) return false;
  if (grant.sourceClause !== HOUSEHOLD_GRANT_SOURCE_CLAUSE) return false;
  // Where the caller names no household the clause is all there is to go on —
  // the pre-00632-§2b reading, kept so a band with no household resolved yet
  // does not call a household grant foreign.
  if (!householdId) return true;
  return grant.sourceHouseholdId === householdId;
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
 *
 * TWO WAYS IN, POINTER FIRST (r1 BLOCKING-1). The overlap alone cannot find a
 * household with no members yet, and that is the state every household is born
 * in; `useCreateClientHousehold` already writes `designer_clients.household_id`
 * and this resolver already reads `designerClientId`, so the pointer answers
 * first and the overlap stays as the way a no-login household — which has no
 * client record at all — is still found by its seats.
 */
export function useProjectHousehold(projectId: string | null | undefined) {
  return useQuery({
    queryKey: ["client-households", "project", projectId ?? null] as const,
    enabled: !!projectId,
    queryFn: async (): Promise<{
      household: ClientHousehold | null;
      designerClientId: string | null;
      designerId: string | null;
      /** The client-side cards this job seats — the household's candidates. */
      memberCardIds: string[];
      /**
       * Whether this job's client side ALREADY carries a recorded authority
       * (QA r1 QA-1). The Call Sheet's client rows print "Signs money to
       * $2,500. Approves change orders to $2,500." off `project_party_authority`
       * — a record that predates `client_households` — so the band's bare "No
       * household is on file … there is nowhere to record who else may sign"
       * stood on the same screen, unqualified, directly contradicting it. The
       * band says something else when this is true.
       *
       * Read over OPEN seats only (r16 MAJOR-1): authority belonging to
       * somebody the studio took off the job is not a record this job still
       * carries.
       */
      clientSideHasAuthority: boolean;
      /**
       * Every OPEN money grant on this job's client side, keyed by the card
       * and the seat kind the RPC reuses (r10 BLOCKING-1). The band's add
       * sentence promised "They may sign money to $X." off the household's
       * figure alone, while `add_household_member()` deliberately leaves a
       * grant it did not source exactly as the studio wrote it — so the band
       * promised $5,000 over a Call Sheet row two elements above still
       * printing "Signs money to $2,500." The face reads what the write will
       * really do.
       *
       * OPEN SEATS ONLY, and one grant per (card, kind) — the seat the RPC
       * would actually reuse (r16 MAJOR-1). A grant hanging off a seat the
       * studio CLOSED is a fact about a seat this act never touches.
       */
      clientSideMoneyGrants: ClientSideMoneyGrant[];
      /**
       * The cards holding the OPEN `client_rep` seat this job's client side
       * would hand a household grant to — the seat `add_household_member()`
       * reuses, one per card (r17 BLOCKING-1, R-BQ).
       *
       * R-BQ took the grant-opening loop out of `set_household_threshold()`:
       * a household figure never opens a money grant by itself, because the
       * act that opens one has to name a job. So the member seated before the
       * figure existed is given authority by a NAMED per-member act on the
       * band, and the band needs to know which members are standing there
       * signing nothing. `memberCardIds` cannot answer it: it holds every
       * client-side card whatever its seat kind, and the plain `client` seat
       * never carries the figure (PR-c).
       */
      clientRepSeatCardIds: string[];
    }> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data: project, error: projectError } = await supabase
        .from("projects")
        .select("designer_id, client_profile_id")
        .eq("id", projectId)
        .maybeSingle();
      if (projectError) throw projectError;
      const designerId = (project?.designer_id as string | null) ?? null;
      const clientProfileId =
        (project?.client_profile_id as string | null) ?? null;

      let designerClientId: string | null = null;
      if (designerId && clientProfileId) {
        const { data: clientRow, error: clientError } = await supabase
          .from("designer_clients")
          .select("id")
          .eq("designer_id", designerId)
          .eq("client_id", clientProfileId)
          .maybeSingle();
        if (clientError) throw clientError;
        designerClientId = (clientRow?.id as string | null) ?? null;
      }

      const { data: seats, error: seatsError } = await supabase
        .from("project_parties")
        .select("id, studio_contact_id, party_kind, created_at, off_job_at")
        .eq("project_id", projectId)
        .in("party_kind", ["client", "client_rep"]);
      if (seatsError) throw seatsError;
      const seatRows = (
        (seats ?? []) as Array<{
          id: string;
          studio_contact_id: string | null;
          party_kind: string;
          created_at: string | null;
          off_job_at: string | null;
        }>
      )
        // `add_household_member()` reuses the earliest OPEN seat for a
        // (project, card, kind) — `AND pp.off_job_at IS NULL … ORDER BY
        // pp.created_at LIMIT 1` (00632 §3, r15 MAJOR-1) — so the grant the
        // band must read is that seat's, and a seat the studio CLOSED is a
        // seat this act will never touch.
        .slice()
        .sort((a, b) => (a.created_at ?? "").localeCompare(b.created_at ?? ""));
      const memberCardIds = [
        ...new Set(
          seatRows
            .map((seat) => seat.studio_contact_id)
            .filter((id): id is string => !!id),
        ),
      ];

      let clientSideHasAuthority = false;
      const clientSideMoneyGrants: ClientSideMoneyGrant[] = [];
      /**
       * r16 MAJOR-1 — ONLY OPEN SEATS SPEAK ABOUT LIVE AUTHORITY.
       *
       * This read had no `off_job_at` filter, so the band's money sentence
       * could stand on a grant hanging off a seat the studio had CLOSED — a
       * row `add_household_member()` will not reuse and will not touch. It
       * printed "X already signs money to $2,500 … recorded outside the
       * household, and that figure stands." while the write opened a NEW seat
       * and minted the household's own figure on it. `clientSideHasAuthority`
       * counted those rows too, so "this job already records who may sign"
       * could stand on authority belonging to somebody who left the job.
       */
      const openSeatRows = seatRows.filter((seat) => !seat.off_job_at);
      /**
       * The FIRST OPEN seat per (card, kind) — the row the RPC reuses. The
       * dedupe used to keep whichever grant the grant query returned first,
       * an arbitrary order, so between two open seats the figure the face
       * printed could change between refetches.
       */
      const chosenSeatIds = new Set<string>();
      const takenPairs = new Set<string>();
      for (const seat of openSeatRows) {
        const pair = `${seat.studio_contact_id ?? ""}::${seat.party_kind}`;
        if (takenPairs.has(pair)) continue;
        takenPairs.add(pair);
        chosenSeatIds.add(seat.id);
      }
      // The open `client_rep` seats the RPC would reuse, by card (R-BQ): who
      // the band may offer "Record the authority" for.
      const clientRepSeatCardIds = [
        ...new Set(
          openSeatRows
            .filter(
              (seat) =>
                chosenSeatIds.has(seat.id) &&
                seat.party_kind === "client_rep" &&
                !!seat.studio_contact_id,
            )
            .map((seat) => seat.studio_contact_id as string),
        ),
      ];
      const seatIds = openSeatRows.map((seat) => seat.id).filter(Boolean);
      if (seatIds.length > 0) {
        // One read, two answers (r10 BLOCKING-1): whether the client side
        // carries ANY recorded authority — QA-1's sentence — and what each
        // client-side seat's open MONEY grant says, which is what decides
        // whether the add act may promise the household's figure. Same
        // request, two more columns.
        const { data: grants, error: grantError } = await supabase
          .from("project_party_authority")
          .select(
            "id, engagement_id, scope, threshold_cents, source_clause, source_household_id",
          )
          .in("engagement_id", seatIds)
          .is("effective_to", null);
        if (grantError) throw grantError;
        const grantRows = (grants ?? []) as Array<{
          engagement_id: string;
          scope: string;
          threshold_cents: number | null;
          source_clause: string | null;
          source_household_id: string | null;
        }>;
        clientSideHasAuthority = grantRows.length > 0;
        const seatById = new Map(openSeatRows.map((seat) => [seat.id, seat]));
        const moneyBySeat = new Map(
          grantRows
            .filter((grant) => grant.scope === "money")
            .map((grant) => [grant.engagement_id, grant] as const),
        );
        // The seat the RPC would reuse is asked for its grant, rather than a
        // grant being asked which seat it happens to sit on.
        for (const seatId of chosenSeatIds) {
          const seat = seatById.get(seatId);
          const grant = moneyBySeat.get(seatId);
          if (!seat || !grant) continue;
          clientSideMoneyGrants.push({
            engagementId: grant.engagement_id,
            personId: seat.studio_contact_id,
            partyKind: seat.party_kind,
            thresholdCents: grant.threshold_cents,
            sourceClause: grant.source_clause,
            sourceHouseholdId: grant.source_household_id,
          });
        }
      }

      // The pointer the client record already carries, read before the seats
      // are asked — a household with no members yet is still this job's.
      if (designerClientId) {
        const { data: pointer, error: pointerError } = await supabase
          .from("designer_clients")
          .select("household_id")
          .eq("id", designerClientId)
          .maybeSingle();
        if (pointerError) throw pointerError;
        const householdId = (pointer?.household_id as string | null) ?? null;
        if (householdId) {
          const { data: byPointer, error: byPointerError } = await supabase
            .from("client_households")
            .select("*")
            .eq("id", householdId)
            .maybeSingle();
          if (byPointerError) throw byPointerError;
          if (byPointer) {
            return {
              household: byPointer as ClientHousehold,
              designerClientId,
              designerId,
              memberCardIds,
              clientSideHasAuthority,
              clientSideMoneyGrants,
              clientRepSeatCardIds,
            };
          }
        }
      }

      if (memberCardIds.length === 0) {
        return {
          household: null,
          designerClientId,
          designerId,
          memberCardIds,
          clientSideHasAuthority,
          clientSideMoneyGrants,
          clientRepSeatCardIds,
        };
      }

      // One card may stand in two households — nothing refuses it and the
      // duplicate fold creates the state (00629 §7) — so this last resort
      // says WHICH one it is showing rather than taking whatever Postgres
      // returned first (r16 MAJOR-1). The oldest household wins, every time.
      const { data: households, error: householdError } = await supabase
        .from("client_households")
        .select("*")
        .overlaps("member_person_ids", memberCardIds)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .limit(1);
      if (householdError) throw householdError;
      return {
        household: ((households ?? [])[0] as ClientHousehold | null) ?? null,
        designerClientId,
        designerId,
        memberCardIds,
        clientSideHasAuthority,
        clientSideMoneyGrants,
        clientRepSeatCardIds,
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
        .from("client_households")
        .insert({
          organization_id: input.organizationId,
          designer_id: input.designerId,
          display_name: input.displayName.trim(),
          co_threshold_cents: input.coThresholdCents ?? null,
          // Born holding the job's own client side, so the resolver's overlap
          // can find it (r1 BLOCKING-1). 00632 holds every id to a live PERSON
          // card in this studio, which is exactly what a client-side seat's
          // `studio_contact_id` is.
          member_person_ids: [...new Set(input.memberPersonIds ?? [])],
        })
        .select("*")
        .single();
      if (error) throw new Error(asHouseholdError(error));
      const household = data as ClientHousehold;
      if (input.designerClientId) {
        const { error: pointerError } = await supabase
          .from("designer_clients")
          .update({ household_id: household.id })
          .eq("id", input.designerClientId);
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
 * r5 M-1 — AND THE SEATS THE FIGURE ALREADY AUTHORISED. This was a bare
 * `.update({ co_threshold_cents })` on `client_households`, and
 * `add_household_member()` writes a `client_rep` seat's open `money` grant
 * from that same figure with `source_clause =
 * 'client_households.co_threshold_cents'`. Nothing re-wrote the grant, and the
 * band's member flow is an ADD, so a household whose member was already seated
 * had no repair act at all: raise the household to $5,000 and one Call Sheet
 * screen printed "Change orders over $5,000 need a signature from the
 * household." beside that seat's "Signs money to $2,500.", with the seat's own
 * source_clause naming the household as the source of a figure it no longer
 * held.
 *
 * So the write goes through `set_household_threshold()`, which moves the
 * figure and the grants it sourced in one transaction, refuses by name where
 * PR-n's standing is missing on either, and closes those grants where the
 * figure is taken away.
 *
 * IT OPENS NOTHING (R-BQ, r17 BLOCKING-1). For one round the same RPC also
 * opened the grant a member seated before the figure never got — and the loop
 * that did it could name no project, so one household's figure wrote money
 * authority onto every open `client_rep` seat its members held anywhere in
 * the studio's book, on jobs under another principal, where neither household
 * could take it back. `add_household_member()` (project-scoped, PR-n gated)
 * is the only door that opens authority; the band offers it per member as
 * "Record the authority".
 */
export function useSetHouseholdThreshold() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (
      input: SetHouseholdThresholdInput,
    ): Promise<ClientHousehold> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const supabase = getSupabase() as any;
      const { data, error } = await supabase.rpc("set_household_threshold", {
        p_household_id: input.id,
        p_threshold_cents: input.coThresholdCents,
      });
      if (error) throw new Error(asHouseholdError(error));
      if (!data) {
        throw new Error(
          HOUSEHOLD_REFUSAL_SENTENCES.household_threshold_forbidden,
        );
      }
      return data as ClientHousehold;
    },
    onSuccess: (household) => {
      void queryClient.invalidateQueries({ queryKey: clientHouseholdKeys.all });
      void queryClient.invalidateQueries({
        queryKey: clientHouseholdKeys.detail(household.id),
      });
      void queryClient.invalidateQueries({
        queryKey: ["client-households", "project"],
      });
      // The grants moved with the figure, so every reader of a seat's
      // authority is stale — the roster row's "Signs money to …" phrase, the
      // Call Sheet's seat lines, and the band's own clientSideHasAuthority.
      void queryClient.invalidateQueries({ queryKey: partyAuthorityKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
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
      const { data, error } = await supabase.rpc("add_household_member", {
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
      void queryClient.invalidateQueries({
        queryKey: ["client-households", "project"],
      });
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: peopleSeatKeys.all });
      void queryClient.invalidateQueries({ queryKey: partyAuthorityKeys.all });
      if (input.projectId) {
        void queryClient.invalidateQueries({
          queryKey: ["project-parties", input.projectId],
        });
        void queryClient.invalidateQueries({
          queryKey: ["project-roster", input.projectId],
        });
      }
    },
  });
}
