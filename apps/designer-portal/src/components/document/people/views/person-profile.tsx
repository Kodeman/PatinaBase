"use client";

/**
 * THE PERSON CARD — the room's unit (direction §1 line 1).
 *
 * Four role-branched documents collapse into ONE card with silent regions:
 * Identity, Reach & access, Seats on projects, Past seats, Paper, History. A
 * region never vanishes because its record is empty — it prints its own
 * sentence instead ("No contact rule on file.", "No grant on file.", "No open
 * seat on this project.") so the studio can tell a missing record from a
 * missing region (R-V / C32).
 *
 * Every project seat is a LINE BENEATH THE HUMAN, carrying its own stage word,
 * its window and its authority. Authority is never a state word: it prints as
 * plain uncoloured text — "Signs money to $2,500", "Selections", "Prepares
 * only" — because it is a fact, not a state (direction §3.8).
 *
 * The one branch that survives: a MAKER opens the vendor's own book
 * (`MakerProfile`, R78/PRC-02), which is the maker's record rather than the
 * studio's card, and must open pre-admission from the marketplace lens where
 * no directory row exists at all.
 *
 * The one affordance carried across from the four documents: HT-8's HOURS
 * DOOR. There is no staff picker inside a money ledger, so a teammate's hours
 * are reached from their card and from nowhere else; collapsing the four
 * renderers would otherwise have closed the only entry point into a shipped
 * surface. It rides in the card's head — the old `ProfileHead` actions slot —
 * under the same gate it always carried: a linked auth profile, and a viewer
 * who owns or administers the studio, because the Hours sheet renders no lens
 * for a plain member and she could only leave that scope by closing the sheet.
 */

import { useMemo, useState } from "react";
import {
  AUTHORITY_SCOPE_LABELS,
  isFieldRosterRole,
  useAffiliations,
  useComplianceDocuments,
  useComplianceState,
  useContactRules,
  usePartyAuthority,
  usePeopleSeats,
  usePerson,
  useStudioContact,
  useStudioContacts,
  useStudioContactChannelsFor,
  type AuthorityScope,
  type PeopleDirectorySeat,
} from "@patina/supabase";
import { partyKindOwesPaper } from "@patina/types";
import {
  directoryContactKind,
  isClientSideKind,
} from "@/lib/document/people-derivation";
import {
  contactRouteTarget,
  contactRuleForbidsSms,
  contactRuleIsHardBlock,
  contactRuleTextHeldClause,
  indexChannelsByOwner,
  indexContactRules,
} from "@/lib/document/contact-rule";
import { DocumentAction } from "../../document-action";
import { MakerProfile } from "../profile/maker-profile";
import { Avatar } from "../person-bits";
import { StateWord, PlainFact } from "../state-word";
import {
  SeatLine,
  formatSeatDate,
  seatLineParts,
  seatWindowText,
} from "../seat-line";
import {
  ReachAccess,
  NO_SEAT_SENTENCE,
  MINT_CLIENT_SIDE_SENTENCE,
  MINT_WITHOUT_SEAT_SENTENCE,
} from "../reach-access";
import {
  ComplianceTable,
  NO_PAPER_OWED_SENTENCE,
  paperHeldClause,
} from "../compliance-table";
import { RecordDocumentSheet } from "../record-document-sheet";
import { formatMoneyFromCents } from "../people-format";
import { useViewerStudio } from "@/hooks/use-viewer-studio";
import { openHoursForMember } from "@/lib/document/open-hours-scope";
import type { PersonProfileProps } from "../types";

const REGION = "border-t border-[var(--hairline-strong)] py-6";
const REGION_HEAD = "t-head mb-3 text-[var(--ink-subtle)]";

export const NO_AUTHORITY_SENTENCE = "No authority on this job";
export const NO_PAST_SEATS_SENTENCE = "No closed seat on file.";
export const SEND_TEXT_CONSEQUENCE =
  "This sends one text to the number on file. They can stop it at any time by replying STOP.";
export const CANNOT_TEXT_SENTENCE =
  "The studio holds no standing consent for this number, so no text may go out.";
/**
 * CR10-1 — THE COMPOSER LIVES ON A FIELD SEAT, AND NOWHERE ELSE.
 *
 * The act opened the person's FIRST live seat whatever its kind, and only a
 * field seat (gc, sub, installer, receiver) opens a sheet with a thread and a
 * composer in it. On a client, a client_rep, an inspector, a vendor or an
 * architect seat the press moved nothing — and it was held only by the seed's
 * missing consent, so recording consent turned it into an enabled act, under
 * "This sends one text to the number on file", that sent nothing. Held with
 * its own sentence now, the way MINT_WITHOUT_SEAT_SENTENCE holds the field
 * link for a person with no seat at all.
 */
export const NO_TEXT_SEAT_SENTENCE =
  "A text goes out from a seat on a job’s field crew, and this person holds none.";
/**
 * CR3-9 — a rule that bars the text rail outranks a recorded grant (C7).
 *
 * QA-R9-1: the clause in the middle is the RULE'S own (`contactRuleTextHeldClause`),
 * so a do-not-contact block reads as one and carries its route, and only a
 * genuine single-channel rule reads "never text".
 */
export function ruleHeldTextSentence(clause: string): string {
  return `The studio’s rule for this person ${clause}. Change the rule above before any text goes out.`;
}
export const RULE_FORBIDS_TEXT_SENTENCE =
  ruleHeldTextSentence("says never text");

/** A seat is done when its stage says so — nothing about the window decides it. */
const DONE_STAGES = new Set([
  "off_job",
  "retired",
  "declined",
  "no_response",
  "warranty",
]);

/** "Signs money to $2,500" / "Selections" / "Prepares only" — plain text. */
export function authorityPhrase(grant: {
  scope: string;
  threshold_cents: number | null;
  prepares_only: boolean;
}): string {
  if (grant.prepares_only) return "Prepares only";
  const label =
    AUTHORITY_SCOPE_LABELS[grant.scope as AuthorityScope] ?? grant.scope;
  const money = formatMoneyFromCents(grant.threshold_cents);
  return money ? `${label} to ${money}` : label;
}

/** The seat's own facts beneath its line, in the order SPEC §5.2 #7 prints. */
function SeatFacts({ seat }: { seat: PeopleDirectorySeat }) {
  const { data: authority } = usePartyAuthority(seat.seat_id);
  const phrases = (authority ?? []).map(authorityPhrase);
  const extras: string[] = [];
  if (seat.site_access_mode === "escorted") extras.push("Escorted on site");
  if (seat.contracted_through)
    extras.push(`Contracted through ${seat.contracted_through}`);
  if (seat.show_to_client === false) extras.push("Hidden from the client");
  return (
    <div className="pl-2">
      <p className="t-body-sm">
        <PlainFact>
          {phrases.length > 0 ? phrases.join(" · ") : NO_AUTHORITY_SENTENCE}
        </PlainFact>
      </p>
      {extras.length > 0 && (
        <p className="t-body-sm text-[var(--ink-subtle)]">
          {extras.join(" · ")}
        </p>
      )}
    </div>
  );
}

export function PersonProfile({
  personId,
  role,
  onBack,
  notify,
  organizationId,
  onOpenSeat,
}: PersonProfileProps & {
  organizationId: string | null;
  /** Opens the seat's own sheet, where the SMS thread and composer live. */
  onOpenSeat?: (seat: PeopleDirectorySeat) => void;
}) {
  const { data: person, isLoading } = usePerson(personId, role);
  const { data: card } = useStudioContact(personId);
  const { data: affiliations } = useAffiliations({ personId });
  const { data: seats } = usePeopleSeats({ personId });
  const { data: documents } = useComplianceDocuments({ holderId: personId });
  const { data: ownPaperState } = useComplianceState(personId);
  // HT-8 — the Hours door carries the scope lens's own owner/admin gate.
  // One ordered answer, shared with the sheet itself: a viewer who answers
  // for two studios must not be keyed on whichever membership row came back
  // first.
  const { isOwnerOrAdmin: viewerIsOwnerOrAdmin } = useViewerStudio();
  const [recordOpen, setRecordOpen] = useState(false);
  const now = useMemo(() => new Date(), []);

  // ── The rule, the route and who it may route to (QA-R2-3 / CR-10) ────────
  // The same pair of reads `directory-view.tsx` and `roster-groups.tsx` build.
  // Without them the person card — the surface direction §3.2 R3 calls the
  // rule's home — printed "Do not contact directly." with no way to reach
  // Rosa Delgado, and its "Write someone else instead" select offered nobody,
  // so Leah task 4 could not be performed anywhere in the room.
  const cardOrgId =
    card?.organization_id ??
    organizationId ??
    (typeof person?.meta?.["organization_id"] === "string"
      ? (person.meta["organization_id"] as string)
      : null);
  const { data: rolodex } = useStudioContacts(cardOrgId, {
    includeArchived: false,
  });
  const { data: rules } = useContactRules();
  const ruleIndex = useMemo(() => indexContactRules(rules), [rules]);
  const rule = ruleIndex.get(personId) ?? null;
  const routedPersonIds = useMemo(
    () => (rule?.route_to_person_id ? [rule.route_to_person_id] : []),
    [rule],
  );
  const { data: routedChannels } = useStudioContactChannelsFor(routedPersonIds);
  const channelsByOwner = useMemo(
    () => indexChannelsByOwner(routedChannels),
    [routedChannels],
  );
  const peopleById = useMemo(() => {
    const index = new Map<
      string,
      { id: string; name: string; email: string | null; phone: string | null }
    >();
    for (const c of rolodex ?? []) {
      if (c.entity_kind !== "person" || !c.full_name) continue;
      index.set(c.id, {
        id: c.id,
        name: c.full_name,
        email: c.email,
        phone: c.phone,
      });
    }
    return index;
  }, [rolodex]);
  const routeTo = useMemo(
    () => contactRouteTarget(rule, peopleById, channelsByOwner),
    [rule, peopleById, channelsByOwner],
  );
  /** Every other person card in the studio — the rule's possible routes. */
  const routeCandidates = useMemo(
    () =>
      [...peopleById.values()]
        .filter((p) => p.id !== personId)
        .map((p) => ({ id: p.id, name: p.name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [peopleById, personId],
  );

  const liveSeats = useMemo(
    () => (seats ?? []).filter((s) => !DONE_STAGES.has(String(s.stage))),
    [seats],
  );
  const pastSeats = useMemo(
    () => (seats ?? []).filter((s) => DONE_STAGES.has(String(s.stage))),
    [seats],
  );

  /**
   * CR11-3: SPEC §5.2 #10's History sentence counts PROJECTS. `seat_count` is
   * `identity_seat_count()` — the seats `people_directory_seats` nests (R-BG)
   * — so a person holding two seats on one job read "Worked 2 of the studio's
   * projects." The seats are already in hand; count the jobs they name.
   */
  const projectCount = useMemo(
    () =>
      new Set(
        (seats ?? [])
          .map((s) => s.project_id)
          .filter((id): id is string => !!id),
      ).size,
    [seats],
  );

  /**
   * CR-2: the subjects `v_access_grants` keys on — this identity's SEATS
   * (a field link's subject is the engagement) and their LOGIN (an account's
   * subject is the profile). Never the rolodex card id.
   */
  const grantSubjectIds = useMemo(() => {
    const ids = (seats ?? []).map((s) => s.seat_id).filter(Boolean);
    if (person?.profile_id) ids.push(person.profile_id);
    return ids;
  }, [seats, person?.profile_id]);

  // QA-R2-7: a sole proprietor IS their own firm, so the Paper region reads the
  // firm's documents as well as their own, and the WORD is the identity fold
  // `identity_paper_state(card, company)` the Directory row and the seat line
  // already print. Reading `compliance_state(card)` alone said "Not on file"
  // for Dana Kowalski while Northgate Electric's own card said "Lapsed".
  const firmId =
    typeof person?.meta?.["company_id"] === "string"
      ? (person.meta["company_id"] as string)
      : null;
  const { data: firmDocuments } = useComplianceDocuments({ holderId: firmId });

  // Makers read from the vendor book itself (R78/PRC-02) — the maker's own
  // record, not the studio's card, and it must open pre-admission.
  if (role === "maker") {
    return <MakerProfile vendorId={personId} onBack={onBack} notify={notify} />;
  }

  if (isLoading || !person) {
    return (
      <>
        <DocumentAction
          actionKey="back-to-directory"
          surfaceKey="people"
          regionKey="person-card"
          variant="tertiary"
          onClick={onBack}
        >
          Back
        </DocumentAction>
        <p className="t-body-sm py-6 text-[var(--ink-subtle)]">
          {isLoading
            ? "Reading the card…"
            : "This card is not on the studio book."}
        </p>
      </>
    );
  }

  /**
   * CR13-8 — ONE FIRM'S NAME BESIDE ITS OWN ROLE AND YEAR.
   *
   * The name comes off `people_directory`'s company pointer; the role and the
   * start year used to come off `affiliations[0]` — an arbitrary open
   * affiliation, from a query with no ORDER BY. R-AO makes two open
   * affiliations a supported state (the Add sheet writes the second when an
   * existing person is seated under a different firm), so SPEC §5.2 #1's
   * "Northgate Electric · owner-operator, since 2025" could print one firm's
   * name beside another firm's role. The card names ONE firm: it reads that
   * firm's affiliation or none.
   */
  const affiliation = firmId
    ? (affiliations ?? []).find((a) => a.company_id === firmId) ?? null
    : (affiliations?.[0] ?? null);
  const firmName =
    (typeof person.meta?.["company_name"] === "string"
      ? (person.meta["company_name"] as string)
      : null) ?? null;
  const sinceYear = formatSeatDate(affiliation?.from_date)?.slice(-4) ?? null;
  const identityBits = [
    firmName,
    affiliation?.role_at_firm
      ? sinceYear
        ? `${affiliation.role_at_firm}, since ${sinceYear}`
        : affiliation.role_at_firm
      : null,
  ].filter(Boolean) as string[];

  const firstSeat = liveSeats[0] ?? null;
  // CR10-1: the seat the SMS thread hangs off — a field seat or nothing.
  const textableSeat =
    liveSeats.find((seat) => isFieldRosterRole(seat.party_kind)) ?? null;
  /**
   * QA-R11-1 — A FIELD LINK IS MINTED ON A FIELD SEAT OR NOT AT ALL.
   *
   * The card handed `ReachAccess` its first live seat of ANY kind, so "Mint
   * access" on Adaeze Okonkwo — `party_kind` client — minted a field-crew
   * grant whose declared scope (`ACCESS_GRANT_TIER_OPENS.field_link`) is "the
   * Call Sheet and the site access card", the card PR-w rules studio-only and
   * never client-facing. The same field-seat test the SMS thread already uses
   * governs the door.
   */
  const mintSeat = textableSeat;
  const clientSide = isClientSideKind(directoryContactKind(person));
  // CR3-9: consent is necessary, not sufficient — the rule outranks it (C7).
  // QA-R9-1: a HARD BLOCK holds the rail too — R-BL's routed rule sends the
  // studio to another person, which a live composer on this one contradicts.
  const ruleHoldsText =
    contactRuleForbidsSms(rule) || contactRuleIsHardBlock(rule);
  const ruleHeldClause = contactRuleTextHeldClause(rule, routeTo?.name ?? null);
  const canText = person.consent_status === "granted" && !ruleHoldsText;
  const soleProprietor = card?.is_sole_proprietor === true;
  const owesPaper = partyKindOwesPaper(directoryContactKind(person));
  // R-BA: one formula, worst-first over the person's OWN documents and their
  // firm's. A sole proprietor's firm paper is their paper (direction §3.2 R5).
  const docs = soleProprietor
    ? [...(documents ?? []), ...(firmDocuments ?? [])]
    : (documents ?? []);
  const heldClause = paperHeldClause(docs, now);

  /**
   * CR3-11 — ONE LIVE REGION, and it is the Room's.
   *
   * This card kept its own `role="status"` beside the Room's (people-room.tsx),
   * so every consent, grant, document and designation change was announced
   * TWICE from two live regions on one screen. Direction §5.5 names one
   * destination — "the room's existing role='status' line" — and SPEC §7 #3
   * asks for exactly one.
   */
  const announce = notify;

  return (
    <div data-person-card={person.person_id} className="mx-auto max-w-[720px]">
      <DocumentAction
        actionKey="back-to-directory"
        surfaceKey="people"
        regionKey="person-card"
        variant="tertiary"
        onClick={onBack}
      >
        Back
      </DocumentAction>

      {/* R1 — Identity */}
      <header className="flex items-center gap-4 pb-6">
        <Avatar name={person.display_name} role={person.role} />
        <div className="min-w-0">
          <h2 className="t-d3 font-heading">{person.display_name}</h2>
          {identityBits.length > 0 && (
            <p className="t-meta mt-1 text-[var(--ink-subtle)]">
              {identityBits.join(" · ")}
            </p>
          )}
          {soleProprietor && (
            <p className="t-meta mt-1 text-[var(--ink-subtle)]">
              Sole proprietor
            </p>
          )}
        </div>
        {/* HT-8 — the one door into the Hours sheet's member scope, which is
            studio-wide and so belongs to a studio member, never to a client
            who merely holds a portal account. */}
        {person.role === "team" &&
          person.profile_id &&
          viewerIsOwnerOrAdmin && (
            <div className="ml-auto shrink-0">
              <DocumentAction
                actionKey="open-person-hours"
                surfaceKey="people"
                regionKey="person-card"
                variant="secondary"
                onClick={() =>
                  openHoursForMember(
                    person.profile_id as string,
                    person.display_name,
                  )
                }
              >
                Hours
              </DocumentAction>
            </div>
          )}
      </header>

      {/* R2 — Reach & access: Channels, Contact rule, Access grants */}
      <section className={REGION}>
        <h3 className="t-head mb-4 text-[var(--ink-subtle)]">
          Reach &amp; access
        </h3>
        <ReachAccess
          cardId={person.person_id}
          cardKind="person"
          organizationId={cardOrgId}
          personName={person.display_name}
          routeTo={routeTo}
          routeCandidates={routeCandidates}
          grantSubjectIds={grantSubjectIds}
          seatId={firstSeat?.seat_id ?? null}
          seatProjectId={firstSeat?.project_id ?? null}
          seatProjectName={firstSeat?.project_name ?? null}
          seatWindowEnd={firstSeat?.on_site_to ?? null}
          seatWindowStart={firstSeat?.on_site_from ?? null}
          mintSeatId={mintSeat?.seat_id ?? null}
          mintProjectId={mintSeat?.project_id ?? null}
          mintProjectName={mintSeat?.project_name ?? null}
          mintWindowEnd={mintSeat?.on_site_to ?? null}
          mintHeldSentence={
            clientSide ? MINT_CLIENT_SIDE_SENTENCE : MINT_WITHOUT_SEAT_SENTENCE
          }
          warrantyEnd={
            mintSeat?.warranty_until ?? card?.warranty_until ?? null
          }
          onAnnounce={announce}
          now={now}
        />
        <p
          id={`person-text-consequence-${person.person_id}`}
          className="t-body-sm mt-2 max-w-[56ch] text-[var(--ink-subtle)]"
        >
          {canText
            ? textableSeat
              ? SEND_TEXT_CONSEQUENCE
              : NO_TEXT_SEAT_SENTENCE
            : ruleHoldsText && ruleHeldClause
              ? ruleHeldTextSentence(ruleHeldClause)
              : CANNOT_TEXT_SENTENCE}
        </p>
        <DocumentAction
          actionKey="send-a-text"
          surfaceKey="people"
          regionKey="reach-access"
          variant="secondary"
          held={!canText || !textableSeat}
          disabled={!canText || !textableSeat}
          aria-describedby={`person-text-consequence-${person.person_id}`}
          onClick={() => {
            if (textableSeat && onOpenSeat) onOpenSeat(textableSeat);
          }}
        >
          Send a text
        </DocumentAction>
      </section>

      {/* R4 — Seats on projects */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>Seats on projects</h3>
        {liveSeats.length === 0 ? (
          <p className="t-body-sm text-[var(--ink-subtle)]">
            {NO_SEAT_SENTENCE}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {liveSeats.map((seat) => (
              <li
                key={seat.seat_id}
                className="border-t border-[var(--hairline-strong)] py-2"
              >
                <SeatLine seat={seat} onOpen={(s) => onOpenSeat?.(s)} />
                <SeatFacts seat={seat} />
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* R4b — Past seats, folded */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>Past seats</h3>
        {pastSeats.length === 0 ? (
          <p className="t-body-sm text-[var(--ink-subtle)]">
            {NO_PAST_SEATS_SENTENCE}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {pastSeats.map((seat) => (
              <li
                key={seat.seat_id}
                className="border-t border-[var(--hairline-strong)] py-2"
              >
                <p className="t-body-sm flex flex-wrap items-center gap-x-2 text-[var(--ink-subtle)]">
                  {/* CR-11: the studio's words, never the schema's. The live
                      SeatLine beside this one already labels both axes; this
                      one printed `client_rep` raw — the one string C5 and SPEC
                      §8 #3 forbid by name. */}
                  <span>{seatLineParts(seat).join(" · ")}</span>
                  <StateWord family="stage" value={seat.stage} />
                  {formatSeatDate(seat.off_job_at) && (
                    <span>Closed {formatSeatDate(seat.off_job_at)}</span>
                  )}
                  {formatSeatDate(seat.warranty_until) && (
                    <span>
                      Warranty through {formatSeatDate(seat.warranty_until)}
                    </span>
                  )}
                  {!seat.off_job_at &&
                    seatWindowText(seat.on_site_from, seat.on_site_to) && (
                      <span>
                        {seatWindowText(seat.on_site_from, seat.on_site_to)}
                      </span>
                    )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* R5 — Paper. A sole proprietor IS their own firm, so their own
          documents are the firm's (direction §3.2 R5). */}
      {soleProprietor && (
        <section className={REGION} data-person-paper>
          <h3 className={REGION_HEAD}>Paper</h3>
          {!owesPaper ? (
            <p className="t-body-sm text-[var(--ink-subtle)]">
              {NO_PAPER_OWED_SENTENCE}
            </p>
          ) : (
            <>
              {docs.length > 0 ? (
                <ComplianceTable documents={docs} today={now} />
              ) : (
                <p>
                  <StateWord
                    family="paper"
                    value={
                      person.paper_state ?? ownPaperState ?? "not_on_file"
                    }
                  />
                </p>
              )}
              {heldClause && (
                <p className="t-body-sm mt-3 border-l-2 border-[var(--terracotta-ink)] bg-[var(--rail)] py-[6px] pl-[11px] text-[var(--ink)]">
                  {heldClause}
                </p>
              )}
              <DocumentAction
                actionKey="record-compliance-document"
                surfaceKey="people"
                regionKey="person-paper"
                variant="secondary"
                onClick={() => setRecordOpen(true)}
              >
                Record a document
              </DocumentAction>
            </>
          )}
        </section>
      )}

      {/* R6 — History */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>History</h3>
        <p className="t-body-sm text-[var(--ink)]">
          {`Worked ${projectCount} of the studio's ${
            projectCount === 1 ? "project" : "projects"
          }.`}
          {formatSeatDate(person.last_touch_at?.slice(0, 10))
            ? ` Last touch ${formatSeatDate(person.last_touch_at?.slice(0, 10))}.`
            : ""}
        </p>
      </section>

      {cardOrgId && (
        <RecordDocumentSheet
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
          organizationId={cardOrgId}
          holderId={person.person_id}
          holderName={person.display_name}
          holderType="person"
          onRecorded={announce}
        />
      )}
    </div>
  );
}
