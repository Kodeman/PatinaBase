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
  useAddHouseholdMember,
  useCreateClientHousehold,
  useOrganizations,
  useProjectHousehold,
  useSetHouseholdThreshold,
  useStudioContacts,
  type HouseholdMemberRole,
} from "@patina/supabase";
import { formatMoneyFromCents } from "../people/people-format";
import { peopleEvents } from "@/lib/analytics/people-events";
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

/** What the act will cost, said before it is pressed. */
export function householdMemberConsequence(
  name: string,
  role: HouseholdMemberRole,
  projectName: string | null | undefined,
  thresholdCents: number | null | undefined,
): string {
  const job = (projectName ?? "").trim();
  const where = job ? ` on the ${job}` : "";
  const money = formatMoneyFromCents(thresholdCents);
  const grant =
    role === "client_rep" && money
      ? ` They may sign change orders over ${money}.`
      : "";
  return `${name} joins the household and takes a seat${where}.${grant} Nothing is sent to them.`;
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
  const [figure, setFigure] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addMember = useAddHouseholdMember();
  const setThreshold = useSetHouseholdThreshold();
  const createHousehold = useCreateClientHousehold();

  const chosenName =
    candidates.find((c) => c.id === personId)?.name ?? "This person";

  const openHousehold = async () => {
    // The client RECORD is optional — a no-login household has none (00632's
    // whole reason for existing). The job's designer and studio are not.
    if (!resolved?.designerId || !organizationId) return;
    const orgId = organizationId;
    setError(null);
    try {
      await createHousehold.mutateAsync({
        organizationId: orgId,
        designerId: resolved.designerId,
        displayName: projectName ? `${projectName} household` : "The household",
        designerClientId: resolved.designerClientId ?? null,
      });
      onAnnounce?.("The household is open.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not open the household.",
      );
    }
  };

  const saveFigure = async () => {
    if (!household) return;
    setError(null);
    const digits = figure.replace(/[^0-9.]/g, "");
    const dollars = digits ? Number(digits) : NaN;
    try {
      await setThreshold.mutateAsync({
        id: household.id,
        coThresholdCents: Number.isFinite(dollars)
          ? Math.round(dollars * 100)
          : null,
      });
      setEditingFigure(false);
      onAnnounce?.("The change-order figure is on the record.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not write the figure.");
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
      setError(
        e instanceof Error ? e.message : "Could not add the household member.",
      );
    }
  };

  if (!household) {
    return (
      <div data-household-band className="mt-2 pl-[46px]">
        <p className="text-[0.74rem] text-[var(--color-aged-oak)]">
          No household is on file for this client, so there is nowhere to record
          who else may sign.
        </p>
        {resolved?.designerId && organizationId && (
          <button
            type="button"
            data-open-household
            onClick={() => void openHousehold()}
            className="da-score-hover mt-1 inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
          >
            Open a household
          </button>
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
            )}
          </p>

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
              disabled={!personId || addMember.isPending}
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
