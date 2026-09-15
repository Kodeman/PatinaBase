"use client";

/**
 * THE HOUSEHOLD, UNDER CLIENT SIDE (PR-c, CRM-19, 00632).
 *
 * "A household holds the members and the change-order threshold; every member
 *  who acts on a job gets a seat carrying the authority grant."
 *
 * So the Client side band gains two things and nothing else: the figure over
 * which a change order needs a signature, written as a sentence, and one act
 * that puts another member of the household on this job.
 *
 * PR-n — THE FIGURE IS THE PRINCIPAL'S. `client_households`' own WITH CHECK
 * refuses a row leaving with a `co_threshold_cents` unless the caller is an
 * owner or an admin of the studio, and `add_household_member()` refuses the
 * whole act rather than quietly seating somebody with no authority. The face
 * says so before the press and repeats the refusal in words after it.
 *
 * PR-t — the figure prints here, on the desk. A phone shows the yes or no; the
 * roster row's own authority phrase already branches that way.
 */

import { useMemo, useState } from "react";
import {
  HOUSEHOLD_MEMBER_ROLE_LABELS,
  householdOwnsGrant,
  useAddHouseholdMember,
  useCreateClientHousehold,
  useOrganizations,
  useProjectHousehold,
  useSetHouseholdThreshold,
  useStudioContacts,
  type ClientSideMoneyGrant,
  type HouseholdMemberRole,
} from "@patina/supabase";
import { formatMoneyFromCents } from "../people/people-format";
import { peopleEvents } from "@/lib/analytics/people-events";
import { writeErrorMessage } from "@/lib/document/write-error";
import { DocumentAction, DocumentActionRow } from "../document-action";

const META =
  "font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]";
const FIELD =
  "min-h-11 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]";

/**
 * The one sentence the band prints about the figure. No figure on file is its
 * own fact, said in words rather than left blank (R-V).
 */
export function householdThresholdSentence(
  cents: number | null | undefined,
): string {
  const money = formatMoneyFromCents(cents);
  return money
    ? `Change orders over ${money} need a signature from the household.`
    : "No change-order figure is on file for this household.";
}

/**
 * QA-1 — THE BAND MAY NOT CONTRADICT THE ROWS ABOVE IT.
 *
 * On the seeded Okonkwo residence the client rows print "Okonkwo household"
 * and "Signs money to $2,500. Approves change orders to $2,500." off
 * `project_party_authority`, a record that predates `client_households`
 * entirely. The band, a few lines below, asserted "No household is on file for
 * this client" — two simultaneously-rendered, directly contradictory facts
 * about the same household on one screen, with no act between them.
 *
 * Both sentences say the same true thing: the authority is on the SEATS, and
 * there is no household object holding it. The second wording says so out
 * loud instead of denying what the reader can see.
 */
export function householdEmptySentence(
  clientSideHasAuthority: boolean,
): string {
  return clientSideHasAuthority
    ? "No household is on file for this client yet, so what each of them may sign is recorded seat by seat rather than in one place."
    : "No household is on file for this client, so there is nowhere to record who else may sign.";
}

/**
 * The figure, read off the field, in cents — or null when what is typed is
 * not a figure at all (r6, R-BO).
 *
 * The editor used to read `figure.replace(/[^0-9.]/g, "")` and hand
 * `Number.isFinite(dollars) ? … : null` straight to the RPC. Since the round-5
 * fix NULL is not a no-op: `set_household_threshold()` (00632 §4) CLOSES every
 * open money grant the household sourced, so an empty field, an `abc` or a
 * slipped `2.5.0` ended Chidi Okonkwo's signing authority on the job with no
 * refusal and no confirm. A money field may not revoke authority by accident,
 * so an entry that is not a figure is refused and the previous value stands;
 * taking the figure away is its own named act below.
 */
export function parseThresholdEntry(entry: string): number | null {
  const cleaned = entry.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const dollars = Number(cleaned);
  if (!Number.isFinite(dollars)) return null;
  return Math.round(dollars * 100);
}

/**
 * PR-n's standing reason on the one act that mints a money grant (r7 MAJOR-3).
 * The same voice as `household-figure-held` beside the two figure acts.
 */
export const HOUSEHOLD_ADD_HELD_REASON =
  "Adding someone who signs for the household is the principal’s to do while a change-order figure stands. An owner or an admin of the studio can write it — or add them as “decides the work” instead.";

/**
 * PR-n on R-BQ's named act: the same standing the database asks for, said
 * beside the press rather than after the refusal (`household_grant_forbidden`
 * rolls the whole act back).
 */
export const HOUSEHOLD_AUTHORITY_HELD_REASON =
  "Recording who signs for the household is the principal’s to do. An owner or an admin of the studio can write it.";

/**
 * Direction §5.5 (CR-26, roster-row.tsx:1220-1241): a gated act is
 * `aria-disabled` with a VISIBLE reason beside it, never `disabled`. The
 * region's opening state carries no person, and the act was natively
 * `disabled` there — off the tab order, no `aria-disabled`, and nothing on the
 * face saying what was missing, so a keyboard or screen-reader user reached
 * the select, the two role buttons and "Not now" and never the act at all
 * (r18 MAJOR-1). The consequence sentence beside it says what the press does,
 * which is not the same as what is missing.
 */
export const HOUSEHOLD_PICK_HELD_REASON = "Choose someone from the book first.";

/** The refusal, in the room's words rather than a validation token. */
export const HOUSEHOLD_FIGURE_REFUSAL =
  "Write the change-order figure in dollars — 2500, or 2,500. To take the figure away, use “Take the figure away”.";

/**
 * What writing this figure will do, said before it is pressed.
 *
 * The figure editor was the one act in this wave with no consequence sentence
 * at all, and it is the act that moves other people's signing authority.
 *
 * r17 MAJOR-2 — AND IT SAYS ONLY WHAT THE WRITE DOES. For one round
 * `set_household_threshold()` also OPENED a grant for any member who carried
 * none, on every open `client_rep` seat they held anywhere in the studio's
 * book, while this sentence went on describing moves alone. R-BQ settled it
 * on the write side — "a household figure never opens a money grant by
 * itself … The figure's consequence sentence names only the moves it makes"
 * — so the sentence below is once again the whole truth about the press, and
 * the grant a member does not yet have is opened by the band's own named act
 * (`householdAuthorityConsequence`).
 */
export function householdThresholdConsequence(cents: number | null): string {
  const money = formatMoneyFromCents(cents);
  if (!money) {
    return "Nothing is written until this reads as a figure in dollars. The figure on file stands until then.";
  }
  return `Change orders over ${money} will need a signature from the household. Every household member who already signs money from this figure moves to ${money}, on every job. Nothing is sent to them.`;
}

/**
 * WHAT "Record the authority" SAYS BEFORE IT IS PRESSED (R-BQ, R-J's shape).
 *
 * r16 F1 answered "the `client_rep` added before the figure existed never got
 * a grant" inside `set_household_threshold()`, with a loop that OPENED one —
 * and that loop could name no project, so naming one household's figure wrote
 * money authority onto every open `client_rep` seat its members held anywhere
 * in the studio's book, on another household's job, under another principal,
 * where nothing could take it back (r17 BLOCKING-1). R-BQ: "A household
 * figure never opens a money grant by itself … Members added before a figure
 * existed get authority through a named per-member act on the Client side
 * band ('Record the authority', R-J shape, project-scoped)."
 *
 * So the figure moves what the household already wrote — which is exactly
 * what `householdThresholdConsequence` above has always said — and this is
 * the act that opens the missing one, on the job the band is standing on and
 * no other.
 */
export function householdAuthorityGapSentence(
  name: string,
  projectName: string | null | undefined,
): string {
  const job = (projectName ?? "").trim();
  const where = job ? ` on the ${job}` : " on this job";
  return `${name} signs for the household but has no figure of their own${where}. Nothing defaulted from the agreement.`;
}

/** What the press writes — the grant, its cap, and the one job it lands on. */
export function householdAuthorityConsequence(
  name: string,
  cents: number | null | undefined,
  projectName: string | null | undefined,
): string {
  const money = formatMoneyFromCents(cents);
  const job = (projectName ?? "").trim();
  const where = job ? ` on the ${job}` : " on this job";
  return money
    ? `${name} may sign money to ${money}${where}. No other job changes. Nothing is sent to them.`
    : `${name} may sign money${where}. No other job changes. Nothing is sent to them.`;
}

/** And what taking it away will do — the two-step act's own sentence. */
export function householdThresholdClearConsequence(
  cents: number | null | undefined,
): string {
  const money = formatMoneyFromCents(cents);
  const from = money ? ` of ${money}` : "";
  return `Taking the figure away ends the signing authority it gave: every household member's money grant${from} closes today, on every job. The record of it stays. Nothing is sent to them.`;
}

/**
 * What the act will cost, said before it is pressed.
 *
 * B2R-1 — THE SENTENCE NAMES THE GRANT THE ACT ACTUALLY WRITES.
 *
 * `add_household_member()` writes exactly ONE authority row, and its scope is
 * `money` (00632 §4 — `VALUES (v_seat_id, 'money', v_h.co_threshold_cents, …)`;
 * no `change_order` grant is minted anywhere in that file). And
 * `threshold_cents` is a CAP: every reader in the portal prints it that way —
 * `AUTHORITY_SCOPE_LABELS.money` is "Signs money" and `authorityPhrase` renders
 * "Signs money to $2,500". This sentence used to read "They may sign change
 * orders over $2,500." — the wrong scope AND the limit inverted from a cap
 * into a floor, on a money fact, contradicting the band's own
 * `data-household-threshold` line two elements above ("Change orders over
 * $2,500 need a signature from the household."). Leah read the second sentence
 * and pressed; the record then said he signs money UP TO $2,500 and approves
 * nothing.
 */
export function householdMemberConsequence(
  name: string,
  role: HouseholdMemberRole,
  projectName: string | null | undefined,
  thresholdCents: number | null | undefined,
  /**
   * r7 MAJOR-3 (PR-n) — is this caller the principal?
   *
   * `add_household_member()` raises `household_grant_forbidden` for the WHOLE
   * act — the membership and the seat roll back with the grant — whenever the
   * household carries a figure and the role is `client_rep`, and `client_rep`
   * is this band's default role. So for a plain studio member every press
   * failed, beside a sentence promising the very grant the database was about
   * to refuse. The act is held with the standing reason in that state, and the
   * money clause comes off the sentence: a promise no press can keep.
   */
  canGrant = true,
  /**
   * r10 BLOCKING-1 — THE SEAT'S OWN OPEN MONEY GRANT, WHERE IT HAS ONE.
   *
   * r9 M-1 taught `add_household_member()` to leave an open money grant alone
   * when its `source_clause` is not the household's (00632:425-444), which is
   * the ordinary path R-J draws: seat the rep from the agreement ("Confirm
   * from the agreement"), then add them to the household. The face was not
   * taught the same rule, so it promised "They may sign money to $5,000."
   * while the write left $2,500 standing and the Call Sheet row two elements
   * above went on printing "Signs money to $2,500." — a wrong fact about
   * money authority, in one press. `householdThresholdConsequence` above
   * already makes exactly this distinction ("every household member who
   * ALREADY SIGNS MONEY FROM THIS FIGURE"); this is the half that was left
   * behind.
   */
  standingGrant: Pick<
    ClientSideMoneyGrant,
    "thresholdCents" | "sourceClause" | "sourceHouseholdId"
  > | null = null,
  /**
   * r16 MAJOR-1 — WHICH household this band is speaking for.
   *
   * "The household's own grant" used to be a string match on `source_clause`,
   * which names the TABLE: a card standing in two households (nothing refuses
   * it, and the duplicate fold makes one) had this band read the OTHER
   * household's figure as its own and promise to move it. 00632 stamps
   * `source_household_id` on the row and both RPCs ask it; so does the
   * sentence.
   */
  householdId: string | null = null,
): string {
  const job = (projectName ?? "").trim();
  const where = job ? ` on the ${job}` : "";
  const money = formatMoneyFromCents(thresholdCents);
  const householdWouldGrant = role === "client_rep" && !!money && canGrant;
  let grant = "";
  if (householdWouldGrant) {
    const foreign =
      !!standingGrant && !householdOwnsGrant(standingGrant, householdId);
    if (foreign) {
      const standing = formatMoneyFromCents(standingGrant.thresholdCents);
      grant = standing
        ? ` ${name} already signs money to ${standing}${where}, recorded outside the household, and that figure stands.`
        : ` ${name} already signs money${where}, recorded outside the household with no figure on it, and that stands.`;
    } else {
      grant = ` They may sign money to ${money}.`;
    }
  }
  return `${name} joins the household and takes a seat${where}.${grant} Nothing is sent to them.`;
}

/**
 * THE ONE STATE IN WHICH "Add to the household" CANNOT BE PRESSED (PR-n).
 *
 * Mirrors `add_household_member()`'s own grant leg (00632:395-400): a figure on
 * the household, the `client_rep` role, and a caller who is not an owner or an
 * admin of the studio.
 */
export function householdAddIsHeld(
  isPrincipal: boolean,
  thresholdCents: number | null | undefined,
  role: HouseholdMemberRole,
): boolean {
  return !isPrincipal && thresholdCents != null && role === "client_rep";
}

export function HouseholdBand({
  projectId,
  projectName,
  organizationId,
  onAnnounce,
}: {
  projectId: string;
  projectName?: string | null;
  /** The studio holding the rolodex the members are picked from. */
  organizationId: string | null;
  onAnnounce?: (message: string) => void;
}) {
  const { data: resolved } = useProjectHousehold(projectId);
  const household = resolved?.household ?? null;

  const { data: orgs } = useOrganizations();
  const isPrincipal = useMemo(() => {
    const orgId = household?.organization_id ?? organizationId;
    if (!orgId) return false;
    const role = (orgs ?? []).find((o) => o.id === orgId)?.membership?.role;
    return role === "owner" || role === "admin";
  }, [orgs, household?.organization_id, organizationId]);

  const { data: contacts } = useStudioContacts(
    household?.organization_id ?? organizationId,
    { includeArchived: false },
  );
  /**
   * The book, with the people this job already seats on its client side first
   * — the household's likeliest next member is the one already standing on the
   * job, and `useProjectHousehold` has already resolved them.
   */
  const seated = useMemo(
    () => new Set(resolved?.memberCardIds ?? []),
    [resolved?.memberCardIds],
  );
  const candidates = useMemo(
    () =>
      (contacts ?? [])
        .filter((c) => c.entity_kind === "person" && !!c.full_name)
        .map((c) => ({ id: c.id, name: c.full_name as string }))
        .sort((a, b) => {
          const ra = seated.has(a.id) ? 0 : 1;
          const rb = seated.has(b.id) ? 0 : 1;
          if (ra !== rb) return ra - rb;
          return a.name.localeCompare(b.name);
        }),
    [contacts, seated],
  );

  const [adding, setAdding] = useState(false);
  const [personId, setPersonId] = useState("");
  const [role, setRole] = useState<HouseholdMemberRole>("client_rep");
  const [editingFigure, setEditingFigure] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [figure, setFigure] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addMember = useAddHouseholdMember();
  const setThreshold = useSetHouseholdThreshold();
  const createHousehold = useCreateClientHousehold();

  const chosenName =
    candidates.find((c) => c.id === personId)?.name ?? "This person";

  /**
   * The open money grant the chosen person's seat already carries, if any
   * (r10 BLOCKING-1). Keyed on the pair `add_household_member()` reuses a seat
   * by — the card and the role — because adding somebody as `client_rep` when
   * their only seat is a plain `client` one opens a NEW seat, which carries no
   * grant at all.
   */
  const standingGrantForChoice = useMemo(
    () =>
      (resolved?.clientSideMoneyGrants ?? []).find(
        (grant) => grant.personId === personId && grant.partyKind === role,
      ) ?? null,
    [resolved?.clientSideMoneyGrants, personId, role],
  );

  /**
   * WHO IS STANDING ON THIS JOB SIGNING NOTHING (R-BQ).
   *
   * A household member holding the OPEN `client_rep` seat this job's client
   * side would hand the figure to, with no open money grant on it. That is
   * r16 F1's population, and since R-BQ took the grant-opening loop out of
   * `set_household_threshold()` it is repaired by a named act per member
   * rather than by a loop that could reach another household's job.
   *
   * Empty while the household names no figure: `add_household_member()`
   * writes no grant there either, because a money grant with no cap reads
   * "Signs money." with none (00624).
   */
  const membersOwedAuthority = useMemo(() => {
    if (!household || household.co_threshold_cents == null) return [];
    const withGrant = new Set(
      (resolved?.clientSideMoneyGrants ?? [])
        .filter((grant) => grant.partyKind === "client_rep" && grant.personId)
        .map((grant) => grant.personId as string),
    );
    const seatedAsRep = new Set(resolved?.clientRepSeatCardIds ?? []);
    return (household.member_person_ids ?? [])
      .filter((id) => seatedAsRep.has(id) && !withGrant.has(id))
      .map((id) => ({
        id,
        name:
          (contacts ?? []).find((c) => c.id === id)?.full_name ?? "This person",
      }));
  }, [
    household,
    resolved?.clientSideMoneyGrants,
    resolved?.clientRepSeatCardIds,
    contacts,
  ]);

  /**
   * r7 MAJOR-3 — PR-n, stated before the press rather than after the refusal.
   */
  const addHeld = householdAddIsHeld(
    isPrincipal,
    household?.co_threshold_cents ?? null,
    role,
  );

  /**
   * MAJOR-2 (code review r3) — the act may not mint a household the band
   * cannot find again.
   *
   * `useProjectHousehold` has exactly two ways in: the
   * `designer_clients.household_id` pointer, written only when a
   * `designerClientId` resolves, and the `member_person_ids` overlap, which
   * needs at least one client-side seat carrying a `studio_contact_id`. With
   * neither — an ordinary job before the client is seated, `client_profile_id`
   * NULL, which is the seeded Okonkwo state — the INSERT wrote a row with an
   * empty member array and no pointer, the resolver returned null, the band
   * printed the same sentence and the same door, and every further press left
   * another orphan: 00632 has no uniqueness constraint and the room offers no
   * delete. r1 BLOCKING-1's shape, narrowed rather than closed.
   */
  const householdWouldBeFindable =
    (resolved?.memberCardIds?.length ?? 0) > 0 || !!resolved?.designerClientId;

  const openHousehold = async () => {
    // The client RECORD is optional — a no-login household has none (00632's
    // whole reason for existing). The job's designer and studio are not.
    if (!resolved?.designerId || !organizationId) return;
    if (!householdWouldBeFindable) {
      setError("Seat the client on this job first, then open the household.");
      return;
    }
    const orgId = organizationId;
    setError(null);
    try {
      await createHousehold.mutateAsync({
        organizationId: orgId,
        designerId: resolved.designerId,
        displayName: projectName ? `${projectName} household` : "The household",
        designerClientId: resolved.designerClientId ?? null,
        // The job's own client side, so the household the studio just opened
        // is the household the band then finds (r1 BLOCKING-1).
        memberPersonIds: resolved.memberCardIds ?? [],
      });
      onAnnounce?.("The household is open.");
    } catch (e) {
      // MAJOR-3: `asHouseholdError` knows 00632's own vocabulary and nothing
      // of 00624's seat-card guard, which `add_household_member()` fires —
      // and an RLS rejection arrived as a relation name on a face, which SPEC
      // §8 #3 forbids by name.
      setError(writeErrorMessage(e, "Could not open the household."));
    }
  };

  const saveFigure = async () => {
    if (!household) return;
    setError(null);
    const cents = parseThresholdEntry(figure);
    if (cents === null) {
      // Refused, not written. The previous figure — and the grants it
      // authorises — stand.
      setError(HOUSEHOLD_FIGURE_REFUSAL);
      return;
    }
    try {
      await setThreshold.mutateAsync({
        id: household.id,
        coThresholdCents: cents,
      });
      setEditingFigure(false);
      // The announcement is the sentence the band itself now prints, so the
      // role="status" line and `data-household-threshold` cannot say two
      // different things about one household on one screen.
      onAnnounce?.(householdThresholdSentence(cents));
    } catch (e) {
      setError(writeErrorMessage(e, "Could not write the figure."));
    }
  };

  /**
   * Taking the figure away is its own two-step act (R-BO). It is not a blank
   * field: it CLOSES every open money grant the household sourced, so it is
   * named, its consequence is printed, and it is pressed twice.
   */
  const clearFigure = async () => {
    if (!household) return;
    setError(null);
    try {
      await setThreshold.mutateAsync({
        id: household.id,
        coThresholdCents: null,
      });
      setClearing(false);
      setEditingFigure(false);
      onAnnounce?.(householdThresholdSentence(null));
    } catch (e) {
      setError(writeErrorMessage(e, "Could not take the figure away."));
    }
  };

  /**
   * R-BQ's named per-member act. It calls the one door that opens a money
   * authority — `add_household_member()` with the job named — so the grant
   * lands on this seat and no other, and PR-n is asked by the database the
   * same way it is for every other grant in the file.
   */
  const recordAuthority = async (member: { id: string; name: string }) => {
    if (!household) return;
    setError(null);
    try {
      await addMember.mutateAsync({
        householdId: household.id,
        personId: member.id,
        role: "client_rep",
        projectId,
      });
      peopleEvents.householdMemberAdded({
        role: "client_rep",
        with_threshold: household.co_threshold_cents != null,
        seated: true,
      });
      onAnnounce?.(
        householdAuthorityConsequence(
          member.name,
          household.co_threshold_cents,
          projectName,
        ),
      );
    } catch (e) {
      setError(writeErrorMessage(e, "Could not record the authority."));
    }
  };

  const save = async () => {
    if (!household || !personId) return;
    setError(null);
    try {
      const seatId = await addMember.mutateAsync({
        householdId: household.id,
        personId,
        role,
        projectId,
      });
      peopleEvents.householdMemberAdded({
        role,
        with_threshold: household.co_threshold_cents != null,
        seated: !!seatId,
      });
      setAdding(false);
      setPersonId("");
      onAnnounce?.(`${chosenName} is on the client side.`);
    } catch (e) {
      setError(writeErrorMessage(e, "Could not add the household member."));
    }
  };

  if (!household) {
    return (
      <div data-household-band className="mt-2 pl-[46px]">
        <p className="text-[0.74rem] text-[var(--color-aged-oak)]">
          {householdEmptySentence(!!resolved?.clientSideHasAuthority)}
        </p>
        {resolved?.designerId && organizationId && (
          <button
            type="button"
            data-open-household
            aria-disabled={!householdWouldBeFindable}
            aria-describedby={
              !householdWouldBeFindable ? "household-needs-a-seat" : undefined
            }
            onClick={() => void openHousehold()}
            className={`da-score-hover mt-1 inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] ${
              householdWouldBeFindable
                ? "text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
                : "text-[var(--color-aged-oak)]"
            }`}
          >
            Open a household
          </button>
        )}
        {resolved?.designerId &&
          organizationId &&
          !householdWouldBeFindable && (
            <p
              id="household-needs-a-seat"
              className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
            >
              Seat the client on this job first, then open the household.
            </p>
          )}
        {error && (
          <p
            role="alert"
            className="mt-1 text-[0.72rem] text-[var(--color-terracotta-ink)]"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div data-household-band className="mt-2 pl-[46px]">
      <p
        data-household-threshold
        className="text-[0.74rem] text-[var(--color-charcoal)]"
      >
        {householdThresholdSentence(household.co_threshold_cents)}
      </p>

      {editingFigure ? (
        <div className="mt-1.5 max-w-[16rem]">
          <label className={`mb-1 block ${META}`} htmlFor="household-figure">
            Over what figure
          </label>
          <input
            id="household-figure"
            value={figure}
            onChange={(e) => setFigure(e.target.value)}
            inputMode="decimal"
            className={FIELD}
          />
          <p
            data-household-threshold-consequence
            className="mt-2 text-[0.72rem] leading-relaxed text-[var(--color-aged-oak)]"
          >
            {householdThresholdConsequence(parseThresholdEntry(figure))}
          </p>
          <DocumentActionRow
            surfaceKey="call-sheet"
            regionKey="household-threshold"
            className="mt-2"
            aria-label="Write the change-order figure"
          >
            <DocumentAction
              actionKey="save-household-threshold"
              variant="primary"
              onClick={() => void saveFigure()}
              loading={setThreshold.isPending}
              loadingLabel="Writing…"
            >
              Write the figure
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-household-threshold"
              variant="tertiary"
              onClick={() => setEditingFigure(false)}
            >
              Leave it
            </DocumentAction>
          </DocumentActionRow>
        </div>
      ) : clearing ? (
        <div data-household-clearing className="mt-1.5">
          <p
            data-household-threshold-consequence
            className="text-[0.72rem] leading-relaxed text-[var(--color-aged-oak)]"
          >
            {householdThresholdClearConsequence(household.co_threshold_cents)}
          </p>
          <DocumentActionRow
            surfaceKey="call-sheet"
            regionKey="household-threshold-clear"
            className="mt-2"
            aria-label="Take the change-order figure away"
          >
            <DocumentAction
              actionKey="clear-household-threshold"
              variant="primary"
              onClick={() => void clearFigure()}
              loading={setThreshold.isPending}
              loadingLabel="Taking it away…"
            >
              Take it away
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-household-threshold-clear"
              variant="tertiary"
              onClick={() => setClearing(false)}
            >
              Leave it
            </DocumentAction>
          </DocumentActionRow>
        </div>
      ) : (
        <div className="flex flex-wrap items-baseline gap-x-4">
          <button
            type="button"
            data-edit-household-threshold
            aria-disabled={!isPrincipal}
            aria-describedby={
              !isPrincipal ? "household-figure-held" : undefined
            }
            onClick={() => {
              if (!isPrincipal) {
                setError(
                  "A change-order figure is the principal’s to set. Ask an owner or an admin of the studio.",
                );
                return;
              }
              setFigure(
                household.co_threshold_cents != null
                  ? String(household.co_threshold_cents / 100)
                  : "",
              );
              setEditingFigure(true);
            }}
            className={`da-score-hover inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] ${
              isPrincipal
                ? "text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
                : "text-[var(--color-aged-oak)]"
            }`}
          >
            Set the figure
          </button>
          {household.co_threshold_cents != null && (
            <button
              type="button"
              data-clear-household-threshold
              aria-disabled={!isPrincipal}
              aria-describedby={
                !isPrincipal ? "household-figure-held" : undefined
              }
              onClick={() => {
                if (!isPrincipal) {
                  setError(
                    "A change-order figure is the principal’s to take away. Ask an owner or an admin of the studio.",
                  );
                  return;
                }
                setError(null);
                setClearing(true);
              }}
              className={`da-score-hover inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] ${
                isPrincipal
                  ? "text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
                  : "text-[var(--color-aged-oak)]"
              }`}
            >
              Take the figure away
            </button>
          )}
          <button
            type="button"
            data-add-household-member
            onClick={() => setAdding((a) => !a)}
            className="da-score-hover inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
          >
            Add a household member
          </button>
        </div>
      )}

      {!isPrincipal && (
        <p
          id="household-figure-held"
          className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
        >
          The change-order figure is the principal’s to set. An owner or an
          admin of the studio can write it.
        </p>
      )}

      {/*
        R-BQ — THE ONE ACT THAT OPENS AUTHORITY, NAMED, PER MEMBER, ON THIS JOB.
        The figure moves what the household already wrote and opens nothing; a
        member standing on this job signing nothing is repaired here, by a
        press that names them and the job, not by a loop that could reach
        another household's Call Sheet (r17 BLOCKING-1).
      */}
      {!editingFigure &&
        !clearing &&
        membersOwedAuthority.map((member) => (
          <div
            key={member.id}
            data-household-authority-gap
            data-person-id={member.id}
            className="mt-2 border-l-2 border-[var(--color-pearl)] bg-white/40 px-3 py-2.5"
          >
            <p className="text-[0.74rem] text-[var(--color-charcoal)]">
              {householdAuthorityGapSentence(member.name, projectName)}
            </p>
            <p
              data-household-authority-consequence
              className="mt-1 text-[0.72rem] leading-relaxed text-[var(--color-aged-oak)]"
            >
              {householdAuthorityConsequence(
                member.name,
                household.co_threshold_cents,
                projectName,
              )}
            </p>
            {!isPrincipal && (
              <p
                id={`household-authority-held-${member.id}`}
                className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
              >
                {HOUSEHOLD_AUTHORITY_HELD_REASON}
              </p>
            )}
            <DocumentActionRow
              surfaceKey="call-sheet"
              regionKey="household-authority"
              className="mt-2"
              aria-label="Record who signs for the household"
            >
              <DocumentAction
                actionKey="record-household-authority"
                variant="primary"
                onClick={() => void recordAuthority(member)}
                disabled={!isPrincipal || addMember.isPending}
                held={!isPrincipal}
                aria-describedby={
                  !isPrincipal
                    ? `household-authority-held-${member.id}`
                    : undefined
                }
                onHeldActivate={() => setError(HOUSEHOLD_AUTHORITY_HELD_REASON)}
                loading={addMember.isPending}
                loadingLabel="Recording…"
              >
                Record the authority
              </DocumentAction>
            </DocumentActionRow>
          </div>
        ))}

      {adding && (
        <div className="mt-2 border-l-2 border-[var(--color-pearl)] bg-white/40 px-3 py-2.5">
          <label className={`mb-1 block ${META}`} htmlFor="household-person">
            Who else is in this household
          </label>
          <select
            id="household-person"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className={FIELD}
          >
            <option value="">Choose someone from the book</option>
            {candidates.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}
              </option>
            ))}
          </select>

          <span className={`mt-3 mb-1 block ${META}`}>What they do here</span>
          <div
            role="group"
            aria-label="What they do here"
            className="flex flex-wrap gap-x-4"
          >
            {(["client", "client_rep"] as HouseholdMemberRole[]).map(
              (value) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={role === value}
                  onClick={() => setRole(value)}
                  className={`da-score-hover inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] ${
                    role === value
                      ? "da-score-on text-[var(--color-charcoal)]"
                      : "text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
                  }`}
                >
                  {HOUSEHOLD_MEMBER_ROLE_LABELS[value]}
                </button>
              ),
            )}
          </div>

          <p
            data-household-consequence
            className="mt-2 text-[0.72rem] leading-relaxed text-[var(--color-aged-oak)]"
          >
            {householdMemberConsequence(
              chosenName,
              role,
              projectName,
              household.co_threshold_cents,
              !addHeld,
              standingGrantForChoice,
              household.id,
            )}
          </p>

          {/* The reason stands beside the act whether or not it is pressed. */}
          {addHeld && (
            <p
              id="household-grant-held"
              className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
            >
              {HOUSEHOLD_ADD_HELD_REASON}
            </p>
          )}
          {!addHeld && !personId && (
            <p
              id="household-person-held"
              className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
            >
              {HOUSEHOLD_PICK_HELD_REASON}
            </p>
          )}

          <DocumentActionRow
            surfaceKey="call-sheet"
            regionKey="household-member"
            className="mt-2"
            aria-label="Add a household member"
          >
            <DocumentAction
              actionKey="add-household-member"
              variant="primary"
              onClick={() => void save()}
              disabled={addHeld || !personId || addMember.isPending}
              held={addHeld || !personId}
              aria-describedby={
                addHeld
                  ? "household-grant-held"
                  : !personId
                    ? "household-person-held"
                    : undefined
              }
              onHeldActivate={() =>
                setError(
                  addHeld
                    ? HOUSEHOLD_ADD_HELD_REASON
                    : HOUSEHOLD_PICK_HELD_REASON,
                )
              }
              loading={addMember.isPending}
              loadingLabel="Adding…"
            >
              Add to the household
            </DocumentAction>
            <DocumentAction
              actionKey="cancel-household-member"
              variant="tertiary"
              onClick={() => setAdding(false)}
            >
              Not now
            </DocumentAction>
          </DocumentActionRow>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-1.5 text-[0.72rem] text-[var(--color-terracotta-ink)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
