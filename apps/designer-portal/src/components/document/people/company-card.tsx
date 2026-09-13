"use client";

/**
 * THE COMPANY CARD — a firm as an object the studio can act on.
 *
 * Six regions, in this order: Identity, Crew & designations, Paper, Payee,
 * Jobs, History (direction §3.3). It is the ONLY place a compliance document,
 * a payee identity, a signer or a paperwork contact is written; every other
 * surface in Patina reads what is written here.
 *
 * Three rules the face keeps:
 *
 *  · A FIRM HAS NEITHER CONSENT NOR REACH (SPEC §5.3 #9). A company cannot
 *    agree to a text message, and no door is minted onto a firm — both words
 *    belong to the humans on its crew.
 *  · THE PAPER REGION ALWAYS PRINTS (C21/R-K/R-P), in one fixed order: the
 *    table, the leading-rule clause, the consequence sentence, the act row. A
 *    firm with no paper prints the word "Not on file" and the act; a lender or
 *    an inspector, who never owed the studio paper, prints one line and no act
 *    at all — "no documents" and "never owed paper" are different facts.
 *  · ON THE CREW LINE ONLY THE NAME IS A CONTROL (R-W). A designation is a
 *    fact about a seat, not a door to a card, and a run-on accessible name
 *    cannot be scanned by ear.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { partyKindOwesPaper, getFieldTradeLabel } from "@patina/types";
import {
  useAffiliations,
  useComplianceDocuments,
  useComplianceState,
  useContactRules,
  usePeopleSeats,
  useStudioContact,
  useStudioContacts,
  useStudioContactChannelsFor,
  useUpdateStudioContact,
  type PeopleDirectorySeat,
  type StudioContact,
} from "@patina/supabase";
import {
  companyKindShortLabel,
  seatIsClosed,
} from "@/lib/document/people-derivation";
import {
  contactRouteTarget,
  contactRuleClause,
  contactRuleIsHardBlock,
  indexChannelsByOwner,
  indexContactRules,
} from "@/lib/document/contact-rule";
import { DocumentAction, DocumentActionRow } from "../document-action";
import { Avatar } from "./person-bits";
import { StateWord, PlainFact } from "./state-word";
import { SeatLine } from "./seat-line";
import { ContactRuleLine } from "./contact-rule-line";
import { ReachAccess } from "./reach-access";
import {
  ComplianceTable,
  NO_PAPER_OWED_SENTENCE,
  paperHeldClause,
} from "./compliance-table";
import { RecordDocumentSheet } from "./record-document-sheet";
import {
  useChaseTheRenewal,
  chaseConsequenceSentence,
} from "./compliance-chase";
import { formatLongDate } from "./people-format";

const REGION = "border-t border-[var(--hairline-strong)] py-6";
const REGION_HEAD = "t-head mb-3 text-[var(--ink-subtle)]";

export const NO_CREW_SENTENCE = "Nobody on file at this firm yet.";
export const NO_JOBS_SENTENCE = "Not on a job yet.";
export const NO_VERDICT_SENTENCE = "No verdict recorded.";

/**
 * CR-10 — SPEC §5.3 #8's History region is THREE FACTS, not one: "First job
 * 2025, the Lindqvist kitchen. Two projects. No verdict recorded." Direction
 * §3.3 R6 names the same three. The region printed only the verdict; the first
 * job, its year, its name and the count were all absent, though the Jobs region
 * directly above already holds the seats that answer them.
 *
 * Counted in words the way SPEC writes them — a figure belongs to money and to
 * dates, not to two jobs.
 */
const COUNT_WORDS = [
  "No",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
];

export function firmHistorySentence(facts: {
  firstJobYear: number | null;
  firstJobName: string | null;
  projectCount: number;
}): string | null {
  const parts: string[] = [];
  if (facts.firstJobYear && facts.firstJobName) {
    parts.push(`First job ${facts.firstJobYear}, the ${facts.firstJobName}.`);
  }
  if (facts.projectCount > 0) {
    const word = COUNT_WORDS[facts.projectCount] ?? String(facts.projectCount);
    parts.push(`${word} ${facts.projectCount === 1 ? "project" : "projects"}.`);
  }
  return parts.length ? parts.join(" ") : null;
}
export const MONEY_BOOK_LINE =
  "Waiver ledger and draw state, in the money book.";

/** "Electrical sub · 1 person · 2 projects · warranty through 21 Nov 2026" */
export function companyIdentityLine(
  card: StudioContact,
  counts: { crew: number; jobs: number | null },
): string {
  const parts: string[] = [];
  const kind = card.company_kind ?? card.contact_kind;
  const trade = card.trades?.[0] ?? card.specialties?.[0] ?? null;
  // The trade branch keeps the kind in the studio's running-prose case:
  // SPEC §5.3 #1 fixes this card's literal as "Electrical sub · 1 person · 2
  // projects · warranty through 21 Nov 2026", and `companyKindShortLabel`
  // would print "Electrical Subcontractor" there.
  if (trade && kind) parts.push(`${getFieldTradeLabel(trade)} ${kind}`);
  // CR6-2: the STUDIO's word, never the column's. Eleven of the twenty-one
  // seeded firms carry no trade and fell here, so the card printed `gc`,
  // `authority`, `lender`, `photography`, `stager`, `maker`, `supplier`,
  // `architect`, `sub` — while the Directory firm row that opens the card
  // already read `companyKindShortLabel` and printed "GC". One firm, two
  // words, two clicks apart.
  else if (kind) parts.push(companyKindShortLabel(kind));
  parts.push(`${counts.crew} ${counts.crew === 1 ? "person" : "people"}`);
  if (counts.jobs != null) {
    parts.push(`${counts.jobs} ${counts.jobs === 1 ? "project" : "projects"}`);
  }
  const warranty = formatLongDate(card.warranty_until);
  if (warranty) parts.push(`warranty through ${warranty}`);
  return parts.join(" · ");
}

/** The designations on one crew line, as plain text after the name (R-W). */
export function crewDesignations(
  card: StudioContact,
  affiliation: {
    role_at_firm: string | null;
    is_paperwork_contact: boolean;
    is_signer: boolean;
    holds_trade_license: boolean;
    person_id: string;
  },
): string[] {
  const words: string[] = [];
  if (affiliation.role_at_firm) words.push(affiliation.role_at_firm);
  if (
    affiliation.is_paperwork_contact ||
    card.paperwork_contact_person_id === affiliation.person_id
  ) {
    words.push("paperwork contact");
  }
  if (
    affiliation.is_signer ||
    card.signer_person_id === affiliation.person_id
  ) {
    words.push("signer");
  }
  if (card.site_contact_person_id === affiliation.person_id)
    words.push("site contact");
  if (affiliation.holds_trade_license) words.push("holds the trade licence");
  return words;
}

/** One crew member's seats, handed down from the card's single seats read. */
function CrewJobs({
  seats,
  personId,
  personName,
  onOpenPerson,
}: {
  seats: readonly PeopleDirectorySeat[];
  personId: string;
  personName: string;
  onOpenPerson: (personId: string) => void;
}) {
  if (seats.length === 0) return null;
  return (
    <>
      {seats.map((seat: PeopleDirectorySeat) => (
        <li
          key={seat.seat_id}
          className="border-t border-[var(--hairline-strong)] py-2"
        >
          <p className="t-body-sm text-[var(--ink-subtle)]">{personName}</p>
          <SeatLine seat={seat} onOpen={() => onOpenPerson(personId)} />
        </li>
      ))}
    </>
  );
}

/** The three designations a firm's card names, and the label each wears. */
const DESIGNATIONS = [
  ["paperworkContactPersonId", "paperwork_contact_person_id", "Paperwork contact"],
  ["signerPersonId", "signer_person_id", "Signer"],
  ["siteContactPersonId", "site_contact_person_id", "Site contact"],
] as const;

type DesignationKey = (typeof DESIGNATIONS)[number][0];

const FIELD_LABEL = "t-head mb-1 block text-[var(--ink-subtle)]";
const FIELD_INPUT =
  "w-full rounded-[2px] border border-[var(--hairline-strong)] border-b-[var(--ink-faint)] bg-[var(--paper-doc)] p-3 text-[16px] leading-[1.55] text-[var(--ink)]";

export function CompanyCard({
  firmId,
  organizationId,
  jobsCount = null,
  onOpenPerson,
  onAnnounce,
  onBack,
  today = new Date(),
}: {
  firmId: string;
  organizationId: string | null;
  /** Distinct live jobs across the firm's crew, counted by the Directory. */
  jobsCount?: number | null;
  onOpenPerson: (personId: string) => void;
  onAnnounce: (message: string) => void;
  onBack: () => void;
  today?: Date;
}) {
  const { data: card } = useStudioContact(firmId);
  // QA-R2-1: the FIRM'S OWN organization scopes its crew's names. The room's
  // ambient `organizationId` was a first match over an unordered membership
  // read, and a designer in two design studios got the wrong one about half the
  // time — so this card printed "Unnamed" for every crew member, "Signs: on
  // file" for its payee and "Unnamed" over both job rows. A firm's people are
  // by definition cards in the firm's own studio.
  const cardOrgId = card?.organization_id ?? organizationId;
  const { data: contacts } = useStudioContacts(cardOrgId, {
    includeArchived: false,
  });
  const { data: affiliations } = useAffiliations({ companyId: firmId });
  const { data: documents } = useComplianceDocuments({ holderId: firmId });
  const { data: paperState } = useComplianceState(firmId);
  // CR-14: the head's project count, off the same seats view and the same
  // "open job" test the Directory's firm row uses, so the two agree.
  const { data: allSeats } = usePeopleSeats({ all: true });
  // CR-9: the crew line carries the rule wherever a rule is shown (R-S / C29),
  // and C7's own example is this card — "Frank Bauer is named as signer with no
  // channel printed; the routed channel shown is Rosa Delgado's."
  const { data: rules } = useContactRules();
  const ruleIndex = useMemo(() => indexContactRules(rules), [rules]);
  const updateCard = useUpdateStudioContact();
  const chase = useChaseTheRenewal();

  const [recordOpen, setRecordOpen] = useState(false);
  const [verdictOpen, setVerdictOpen] = useState(false);
  const [verdict, setVerdict] = useState("");
  const [chased, setChased] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // CR-8 — the two write bands direction §3.3 names and the card did not have.
  const [designationsOpen, setDesignationsOpen] = useState(false);
  const [payeeOpen, setPayeeOpen] = useState(false);
  const [designations, setDesignations] = useState<
    Record<DesignationKey, string>
  >({
    paperworkContactPersonId: "",
    signerPersonId: "",
    siteContactPersonId: "",
  });
  const [payee, setPayee] = useState({
    remitTo: "",
    taxIdLast4: "",
    retainagePercent: "",
  });

  const namesById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of contacts ?? []) {
      if (c.entity_kind !== "person") continue;
      map.set(c.id, c.full_name ?? "Unnamed");
    }
    return map;
  }, [contacts]);

  const peopleById = useMemo(() => {
    const index = new Map<
      string,
      { id: string; name: string; email: string | null; phone: string | null }
    >();
    for (const c of contacts ?? []) {
      if (c.entity_kind !== "person" || !c.full_name) continue;
      index.set(c.id, {
        id: c.id,
        name: c.full_name,
        email: c.email,
        phone: c.phone,
      });
    }
    return index;
  }, [contacts]);

  const routedPersonIds = useMemo(() => {
    const ids = new Set<string>();
    for (const rule of rules ?? []) {
      if (rule.route_to_person_id) ids.add(rule.route_to_person_id);
    }
    return [...ids];
  }, [rules]);
  const { data: routedChannels } = useStudioContactChannelsFor(routedPersonIds);
  const channelsByOwner = useMemo(
    () => indexChannelsByOwner(routedChannels),
    [routedChannels],
  );

  /** The firm's seats that are still the studio's, grouped by who holds them.
   *  A warranty seat counts: SPEC §5.3 #1 reads Northgate Electric's card as
   *  "1 person · 2 projects · warranty through 21 Nov 2026", and the second of
   *  those two projects IS the one under warranty. */
  const seatsByPerson = useMemo(() => {
    const map = new Map<string, PeopleDirectorySeat[]>();
    for (const seat of allSeats ?? []) {
      if (seat.company_id !== firmId) continue;
      if (seatIsClosed(seat.stage)) continue;
      const key = seat.person_id ?? seat.studio_contact_id;
      if (!key) continue;
      const bucket = map.get(key);
      if (bucket) bucket.push(seat);
      else map.set(key, [seat]);
    }
    return map;
  }, [allSeats, firmId]);

  /**
   * CR7-2 — THE FIRM'S OWN TOKENS, NEVER ITS CREW'S.
   *
   * This handed `ReachAccess` every seat id of every crew member, and
   * `v_access_grants.subject_id` on a `field_link` IS the engagement — so the
   * firm's card listed its people's PERSONAL doors: the reach word "Field
   * link" on a card SPEC §5.3 #9 says carries no reach word at all, and a live
   * Revoke that closed a person's own door from their firm's page. Direction
   * §5.1's company variant reads firm-scoped tokens only, and the one tier
   * keyed on a firm is `agreement_link` (`subject_type = 'contact'`,
   * `subject_id = studio_trade_agreements.contact_id`, 00627:199) — which is
   * this card's own id.
   */
  const firmGrantSubjectIds = useMemo(
    () => (card?.id ? [card.id] : []),
    [card?.id],
  );

  /** SPEC §5.3 #8 / CR-10 — the first job and its year, off the same seats. */
  const historySentence = useMemo(() => {
    const projects = new Map<string, { name: string | null; from: string | null }>();
    for (const seats of seatsByPerson.values()) {
      for (const seat of seats) {
        if (!seat.project_id) continue;
        const standing = projects.get(seat.project_id);
        // The firm's first day on a job is the EARLIEST of its crew's starts.
        if (
          !standing ||
          (seat.on_site_from &&
            (!standing.from || seat.on_site_from < standing.from))
        ) {
          projects.set(seat.project_id, {
            name: seat.project_name ?? standing?.name ?? null,
            from: seat.on_site_from ?? standing?.from ?? null,
          });
        }
      }
    }
    const dated = [...projects.values()]
      .filter((p) => p.from)
      .sort((a, b) => (a.from ?? "").localeCompare(b.from ?? ""));
    const first = dated[0] ?? null;
    const year = first?.from ? Number(first.from.slice(0, 4)) : null;
    return firmHistorySentence({
      firstJobYear: Number.isFinite(year) ? year : null,
      firstJobName: first?.name ?? null,
      projectCount: projects.size,
    });
  }, [seatsByPerson]);

  /** SPEC §5.3 #1 — "Electrical sub · 1 person · 2 projects · warranty …". */
  const openJobs = useMemo(() => {
    const projects = new Set<string>();
    for (const seats of seatsByPerson.values()) {
      for (const seat of seats) {
        if (seat.project_id) projects.add(seat.project_id);
      }
    }
    return projects.size;
  }, [seatsByPerson]);

  // CR-33's sibling: a band that opens empty and saves over the record is the
  // same defect CR-3 fixed on the contact rule. Both bands seed from the card.
  const seededDesignationsRef = useRef<string | null>(null);
  useEffect(() => {
    if (!designationsOpen || !card) {
      if (!designationsOpen) seededDesignationsRef.current = null;
      return;
    }
    if (seededDesignationsRef.current === card.id) return;
    seededDesignationsRef.current = card.id;
    setDesignations({
      paperworkContactPersonId: card.paperwork_contact_person_id ?? "",
      signerPersonId: card.signer_person_id ?? "",
      siteContactPersonId: card.site_contact_person_id ?? "",
    });
  }, [designationsOpen, card]);

  /**
   * CR3-8 — SEED THE VERDICT FROM THE VERDICT IT EDITS.
   *
   * `verdict` was `useState("")` and nothing ever seeded it, while
   * `recordVerdict` writes `verdict.trim() || null`. Opening a firm that holds
   * a verdict and pressing "Record a verdict" then "Save the verdict" without
   * typing wrote NULL over it — two clicks, no confirm, no undo, with the text
   * it destroyed printed one line above. The same class as CR-3, in the same
   * file; the designations and payee bands added in the same round both carry a
   * seeding ref and this one was left out.
   */
  const seededVerdictRef = useRef<string | null>(null);
  useEffect(() => {
    if (!verdictOpen || !card) {
      if (!verdictOpen) seededVerdictRef.current = null;
      return;
    }
    if (seededVerdictRef.current === card.id) return;
    seededVerdictRef.current = card.id;
    setVerdict(card.studio_verdict ?? "");
  }, [verdictOpen, card]);

  const seededPayeeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!payeeOpen || !card) {
      if (!payeeOpen) seededPayeeRef.current = null;
      return;
    }
    if (seededPayeeRef.current === card.id) return;
    seededPayeeRef.current = card.id;
    setPayee({
      remitTo: card.remit_to ?? "",
      taxIdLast4: card.tax_id_last4 ?? "",
      retainagePercent:
        card.retainage_bps == null ? "" : String(card.retainage_bps / 100),
    });
  }, [payeeOpen, card]);

  if (!card) {
    return (
      <>
        <DocumentAction
          actionKey="back-to-directory"
          surfaceKey="people"
          regionKey="company-card"
          variant="tertiary"
          onClick={onBack}
        >
          Back
        </DocumentAction>
        <p className="t-body-sm py-6 text-[var(--ink-subtle)]">
          Reading the firm…
        </p>
      </>
    );
  }

  const name = card.company_name ?? card.full_name ?? "This firm";
  const crew = affiliations ?? [];
  // R-A / C13: a lender or an inspector never owed the studio paper.
  const owesPaper = partyKindOwesPaper(card.company_kind ?? card.contact_kind);
  const docs = documents ?? [];
  const heldClause = paperHeldClause(docs, today);
  const chaseSentence = chaseConsequenceSentence(name);

  /**
   * CR3-11 — ONE LIVE REGION, and it is the Room's.
   *
   * This card kept its own `role="status"` beside the Room's
   * (people-room.tsx), so every designation, payee, document and verdict change
   * was announced TWICE from two live regions on one screen. Direction §5.5
   * names one destination; SPEC §7 #3 asks for exactly one.
   */
  const announce = onAnnounce;

  const recordVerdict = async () => {
    setError(null);
    try {
      await updateCard.mutateAsync({
        id: card.id,
        organizationId: card.organization_id,
        card: { studioVerdict: verdict.trim() || null },
      });
      setVerdictOpen(false);
      announce(`The studio's verdict on ${name} is recorded.`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not record that just now.",
      );
    }
  };

  /**
   * CR-8 — direction §1 line 5: "the company card becomes the ONLY place a
   * compliance document, a payee identity, a signer or a paperwork contact is
   * written". §3.3 R2 and R4 name both acts. `useUpdateStudioContact` already
   * took every one of these fields; nothing called them.
   */
  const saveDesignations = async () => {
    setError(null);
    try {
      await updateCard.mutateAsync({
        id: card.id,
        organizationId: card.organization_id,
        card: {
          paperworkContactPersonId:
            designations.paperworkContactPersonId || null,
          signerPersonId: designations.signerPersonId || null,
          siteContactPersonId: designations.siteContactPersonId || null,
        },
      });
      setDesignationsOpen(false);
      announce(`The designations on ${name} are recorded.`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not record that just now.",
      );
    }
  };

  const savePayee = async () => {
    setError(null);
    const typed = payee.retainagePercent.trim();
    const percent = typed === "" ? null : Number(typed);
    if (percent != null && (!Number.isFinite(percent) || percent < 0)) {
      setError("Retainage is a percentage — 10 for ten percent.");
      return;
    }
    try {
      await updateCard.mutateAsync({
        id: card.id,
        organizationId: card.organization_id,
        card: {
          remitTo: payee.remitTo.trim() || null,
          taxIdLast4: payee.taxIdLast4.trim() || null,
          retainageBps: percent == null ? null : Math.round(percent * 100),
        },
      });
      setPayeeOpen(false);
      announce(`The payee on ${name} is recorded.`);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not record that just now.",
      );
    }
  };

  return (
    <div data-company-card={card.id} className="mx-auto max-w-[720px]">
      <DocumentAction
        actionKey="back-to-directory"
        surfaceKey="people"
        regionKey="company-card"
        variant="tertiary"
        onClick={onBack}
      >
        Back
      </DocumentAction>

      {/* R1 — Identity */}
      <header className="flex items-center gap-4 pb-6">
        <Avatar
          name={name}
          role={card.company_kind ?? card.contact_kind}
          shape="square"
        />
        <div className="min-w-0">
          <h2 className="t-d3 font-heading">{name}</h2>
          <p className="t-meta mt-1 text-[var(--ink-subtle)]">
            {companyIdentityLine(card, {
              crew: crew.length,
              jobs: jobsCount ?? openJobs,
            })}
          </p>
        </div>
      </header>

      {/* R2 — Crew & designations */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>Crew &amp; designations</h3>
        {crew.length === 0 ? (
          <p className="t-body-sm text-[var(--ink-subtle)]">
            {NO_CREW_SENTENCE}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {crew.map((a) => {
              const personName = namesById.get(a.person_id) ?? "Unnamed";
              const words = crewDesignations(card, a);
              // CR-9 / C7: the rule outranks the designation. Frank Bauer is
              // named as signer here with no channel of his own printed, and
              // the channel the line DOES carry is Rosa Delgado's.
              const rule = ruleIndex.get(a.person_id) ?? null;
              return (
                <li
                  key={a.id}
                  className="border-t border-[var(--hairline-strong)] py-3"
                >
                  <p className="t-body-sm text-[var(--ink)]">
                    {/* R-W: the NAME is the control; the designations are plain
                        text beside it, never inside the accessible name. */}
                    <button
                      type="button"
                      data-open-person={a.person_id}
                      onClick={() => onOpenPerson(a.person_id)}
                      className="min-h-11 font-medium underline decoration-[var(--color-clay)] underline-offset-[3px]"
                    >
                      {personName}
                    </button>
                    {words.length > 0 ? (
                      <span> · {words.join(" · ")}</span>
                    ) : null}
                  </p>
                  <ContactRuleLine
                    summary={contactRuleClause(rule)}
                    blocked={contactRuleIsHardBlock(rule)}
                    routeTo={contactRouteTarget(
                      rule,
                      peopleById,
                      channelsByOwner,
                    )}
                  />
                </li>
              );
            })}
          </ul>
        )}

        {/* R2 act (direction §3.3) — the card is the ONLY writer of these
            three designations, and until now it wrote none of them. */}
        <DocumentAction
          actionKey="set-firm-designations"
          surfaceKey="people"
          regionKey="company-crew"
          variant="tertiary"
          aria-expanded={designationsOpen}
          aria-controls={`company-designations-${card.id}`}
          onClick={() => setDesignationsOpen((open) => !open)}
        >
          {/* QA-R8-2 — the act's own label was the company card's whole 390
              overflow: `.da-act` carries `whitespace-nowrap`, and this
              39-character sentence measured 398px against a 390px viewport,
              pushing `documentElement.scrollWidth` to 416 and clipping its own
              tail past the edge. The full sentence is the act at the desk; at
              phone width the act keeps the shorter name for the same three
              designations, and the three fields it opens name themselves
              ("Paperwork contact", "Signer", "Site contact"). */}
          <span className="sm:hidden">Set designations</span>
          <span className="hidden sm:inline">
            Set paperwork contact, signer and site contact
          </span>
        </DocumentAction>
        <div
          id={`company-designations-${card.id}`}
          hidden={!designationsOpen}
          className="mt-2"
        >
          {crew.length === 0 ? (
            <p className="t-body-sm text-[var(--ink-subtle)]">
              {NO_CREW_SENTENCE}
            </p>
          ) : (
            <>
              {DESIGNATIONS.map(([key, , label]) => (
                <div key={key} className="mb-3">
                  <label
                    className={FIELD_LABEL}
                    htmlFor={`company-${key}-${card.id}`}
                  >
                    {label}
                  </label>
                  <select
                    id={`company-${key}-${card.id}`}
                    value={designations[key]}
                    onChange={(e) =>
                      setDesignations((current) => ({
                        ...current,
                        [key]: e.target.value,
                      }))
                    }
                    className={FIELD_INPUT}
                  >
                    <option value="">Nobody named</option>
                    {crew.map((a) => (
                      <option key={a.person_id} value={a.person_id}>
                        {namesById.get(a.person_id) ?? "Unnamed"}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
              <DocumentAction
                actionKey="save-firm-designations"
                surfaceKey="people"
                regionKey="company-crew"
                variant="secondary"
                loading={updateCard.isPending}
                loadingLabel="Recording…"
                onClick={() => void saveDesignations()}
              >
                Save the designations
              </DocumentAction>
            </>
          )}
        </div>
      </section>

      {/* R2b — Reach & access, the COMPANY variant (direction §5.1). The firm's
          own office / dispatch / AP lines, its contact rule, and the doors its
          people hold. No consent word and no minted door: a company cannot
          agree to a text message and no door is opened onto a firm
          (SPEC §5.3 #9). */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>Reach &amp; access</h3>
        <ReachAccess
          cardId={card.id}
          cardKind="company"
          organizationId={cardOrgId}
          personName={name}
          routeCandidates={[...peopleById.values()].map((p) => ({
            id: p.id,
            name: p.name,
          }))}
          routeTo={contactRouteTarget(
            ruleIndex.get(card.id),
            peopleById,
            channelsByOwner,
          )}
          grantSubjectIds={firmGrantSubjectIds}
          onAnnounce={announce}
          now={today}
        />
      </section>

      {/* R3 — Paper. Always printed; R-P fixes the order inside it. */}
      <section className={REGION} data-company-paper>
        <h3 className={REGION_HEAD}>Paper</h3>
        {!owesPaper ? (
          <p className="t-body-sm text-[var(--ink-subtle)]">
            {NO_PAPER_OWED_SENTENCE}
          </p>
        ) : (
          <>
            {docs.length > 0 ? (
              <ComplianceTable documents={docs} today={today} />
            ) : (
              <p>
                <StateWord family="paper" value={paperState ?? "not_on_file"} />
              </p>
            )}
            {heldClause && (
              <p className="t-body-sm mt-3 border-l-2 border-[var(--terracotta-ink)] bg-[var(--rail)] py-[6px] pl-[11px] text-[var(--ink)]">
                {heldClause}
              </p>
            )}
            <p
              id={`company-chase-${card.id}`}
              className="t-body-sm mt-3 max-w-[56ch] text-[var(--ink-subtle)]"
            >
              {chaseSentence}
            </p>
            <DocumentActionRow
              surfaceKey="people"
              regionKey="company-paper"
              aria-label="Paper actions"
            >
              <DocumentAction
                actionKey="record-compliance-document"
                variant="secondary"
                onClick={() => setRecordOpen(true)}
              >
                Record a document
              </DocumentAction>
              <DocumentAction
                actionKey="chase-the-renewal"
                variant="tertiary"
                aria-describedby={`company-chase-${card.id}`}
                loading={chase.isPending}
                loadingLabel="Drafting…"
                onClick={() => {
                  setError(null);
                  chase.mutate(
                    {
                      organizationId: card.organization_id,
                      companyId: card.id,
                      companyName: name,
                      documentId: docs[0]?.id ?? null,
                      documentLabel: docs[0] ? null : "a current certificate",
                      paperworkContactPersonId:
                        card.paperwork_contact_person_id,
                    },
                    {
                      onSuccess: () => {
                        setChased(true);
                        announce(
                          `A note to ${name} is waiting for your review.`,
                        );
                      },
                      onError: (e) =>
                        setError(
                          e instanceof Error
                            ? e.message
                            : "Could not draft that note just now.",
                        ),
                    },
                  );
                }}
              >
                Chase the renewal
              </DocumentAction>
            </DocumentActionRow>
            {chased && (
              <p className="t-body-sm mt-1 text-[var(--ink-subtle)]">
                Filed for your review. Nothing is sent until you send it.
              </p>
            )}
          </>
        )}
      </section>

      {/* R4 — Payee */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>Payee</h3>
        <p className="t-body-sm text-[var(--ink)]">
          Remit to {card.remit_to ?? name}
        </p>
        {card.tax_id_last4 && (
          <p className="t-body-sm text-[var(--ink)]">
            Tax id ending {card.tax_id_last4}
          </p>
        )}
        {card.retainage_bps != null && (
          <p className="t-body-sm text-[var(--ink)]">
            Retainage {card.retainage_bps / 100}%
          </p>
        )}
        {card.signer_person_id && (
          <p className="t-body-sm mt-1">
            <PlainFact>
              Signs: {namesById.get(card.signer_person_id) ?? "on file"}
            </PlainFact>
          </p>
        )}

        {/* R4 act (direction §3.3) — the payee identity is written HERE and
            nowhere else (CR-8). */}
        <DocumentAction
          actionKey="edit-firm-payee"
          surfaceKey="people"
          regionKey="company-payee"
          variant="tertiary"
          aria-expanded={payeeOpen}
          aria-controls={`company-payee-${card.id}`}
          onClick={() => setPayeeOpen((open) => !open)}
        >
          Edit payee
        </DocumentAction>
        <div
          id={`company-payee-${card.id}`}
          hidden={!payeeOpen}
          className="mt-2"
        >
          <label className={FIELD_LABEL} htmlFor={`company-remit-${card.id}`}>
            Remit to
          </label>
          <input
            id={`company-remit-${card.id}`}
            type="text"
            value={payee.remitTo}
            onChange={(e) =>
              setPayee((current) => ({ ...current, remitTo: e.target.value }))
            }
            className={`${FIELD_INPUT} mb-3`}
          />
          <label className={FIELD_LABEL} htmlFor={`company-taxid-${card.id}`}>
            Last four of the tax id
          </label>
          <input
            id={`company-taxid-${card.id}`}
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={payee.taxIdLast4}
            onChange={(e) =>
              setPayee((current) => ({
                ...current,
                taxIdLast4: e.target.value,
              }))
            }
            className={`${FIELD_INPUT} mb-3`}
          />
          <label
            className={FIELD_LABEL}
            htmlFor={`company-retainage-${card.id}`}
          >
            Retainage, in percent
          </label>
          <input
            id={`company-retainage-${card.id}`}
            type="text"
            inputMode="decimal"
            value={payee.retainagePercent}
            onChange={(e) =>
              setPayee((current) => ({
                ...current,
                retainagePercent: e.target.value,
              }))
            }
            className={`${FIELD_INPUT} mb-2`}
          />
          <DocumentAction
            actionKey="save-firm-payee"
            surfaceKey="people"
            regionKey="company-payee"
            variant="secondary"
            loading={updateCard.isPending}
            loadingLabel="Recording…"
            onClick={() => void savePayee()}
          >
            Save the payee
          </DocumentAction>
        </div>
      </section>

      {/* R5 — Jobs, with the money book read-only beside them */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>Jobs</h3>
        {crew.length === 0 ? (
          <p className="t-body-sm text-[var(--ink-subtle)]">
            {NO_JOBS_SENTENCE}
          </p>
        ) : (
          <ul className="m-0 list-none p-0">
            {crew.map((a) => (
              <CrewJobs
                key={a.id}
                seats={seatsByPerson.get(a.person_id) ?? []}
                personId={a.person_id}
                personName={namesById.get(a.person_id) ?? "Unnamed"}
                onOpenPerson={onOpenPerson}
              />
            ))}
          </ul>
        )}
        <p className="t-body-sm mt-3 text-[var(--ink-subtle)]">
          {MONEY_BOOK_LINE}
        </p>
      </section>

      {/* R6 — History */}
      <section className={REGION}>
        <h3 className={REGION_HEAD}>History</h3>
        {historySentence && (
          <p data-firm-history className="t-body-sm text-[var(--ink)]">
            {historySentence}
          </p>
        )}
        <p className="t-body-sm text-[var(--ink)]">
          {card.studio_verdict ?? NO_VERDICT_SENTENCE}
        </p>
        <DocumentAction
          actionKey="record-studio-verdict"
          surfaceKey="people"
          regionKey="company-history"
          variant="tertiary"
          aria-expanded={verdictOpen}
          aria-controls={`company-verdict-${card.id}`}
          onClick={() => setVerdictOpen((open) => !open)}
        >
          Record a verdict
        </DocumentAction>
        <div
          id={`company-verdict-${card.id}`}
          hidden={!verdictOpen}
          className="mt-2"
        >
          <label
            className="t-head mb-1 block text-[var(--ink-subtle)]"
            htmlFor={`company-verdict-field-${card.id}`}
          >
            What the studio thinks
          </label>
          <input
            id={`company-verdict-field-${card.id}`}
            type="text"
            value={verdict}
            onChange={(e) => setVerdict(e.target.value)}
            className="w-full rounded-[2px] border border-[var(--hairline-strong)] border-b-[var(--ink-faint)] bg-[var(--paper-doc)] p-3 text-[16px] leading-[1.55]"
          />
          <DocumentAction
            actionKey="save-studio-verdict"
            surfaceKey="people"
            regionKey="company-history"
            variant="secondary"
            loading={updateCard.isPending}
            loadingLabel="Recording…"
            onClick={() => void recordVerdict()}
          >
            Save the verdict
          </DocumentAction>
        </div>
      </section>

      {error && (
        <p role="alert" className="t-body-sm mt-2 text-[var(--terracotta-ink)]">
          {error}
        </p>
      )}

      {cardOrgId && (
        <RecordDocumentSheet
          open={recordOpen}
          onClose={() => setRecordOpen(false)}
          organizationId={cardOrgId}
          holderId={card.id}
          holderName={name}
          onRecorded={(message) => announce(message)}
        />
      )}
    </div>
  );
}
