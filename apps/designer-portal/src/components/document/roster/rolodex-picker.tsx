'use client';

/**
 * From the rolodex (slides 13–14) — "search by what you need rather than by
 * what you remember", and, underneath the hits from the first frame, the way
 * out: ADD SOMEONE NEW unfolds an inline add form IN THE SAME SHEET.
 *
 * The stamp is the whole flywheel: "Save to the studio rolodex", ON BY
 * DEFAULT, a square sage tick — never a switch, never a toggle, never a pill.
 * Adding to the job feeds the book; the book feeds the next job.
 *
 * The fallback band is ALWAYS visible, not only after a search misses (mnote
 * 3). Kind chips arrive pre-scoped from wherever the sheet was opened
 * (`scopeKinds`) — "you asked for a sub on the tile line, so the sheet arrives
 * already narrowed".
 *
 * NO FLAG. `call-sheet` is retired (rulings §6): the picker is live for every
 * studio.
 *
 * At the pick, every mini row carries what travels (SPEC §5.7 #4): the reach,
 * consent and paper words, the contact rule as a sentence, and ONE history
 * line — repeat count and dates only, never a verdict (PR-i).
 *
 * W3/P2 — BRING FORWARD (SPEC §5.7, CRM-24). The rows are MULTI-SELECT and one
 * confirm seats all of them; a pane names what travels and what stays behind,
 * so the studio is told that consent, the contact rule and document expiries
 * follow the person while prior pricing, prior project notes and show-to-client
 * do not. Leah's fifth task — four people onto Okonkwo — is search, tick four,
 * one act.
 *
 * A single row still adds on its own: tapping a row's name adds that one person
 * the way it always did, and the tick box beside it is the door to the batch.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { UserPlus } from 'lucide-react';
import {
  COMPLIANCE_DOC_TYPE_LABELS,
  indexComplianceNotices,
  useAddProjectParty,
  useAddStudioContact,
  useBringForward,
  useChannelConsentRecords,
  useComplianceDocumentsFor,
  useComplianceNotices,
  useContactRules,
  useOrganizations,
  useProjectRecordedStudio,
  useProjectRoster,
  useProjects,
  usePeopleDirectory,
  useStudioContactHistory,
  useStudioContacts,
  type BringForwardPick,
  type PeopleDirectoryRow,
  type StudioComplianceDocument,
  type StudioContact,
} from '@patina/supabase';
import { getPartyKindLabel, type PartyKind } from '@patina/types';
import { rosterHasIdentity } from '@/lib/document/roster-derivation';
import {
  bringForwardActLabel,
  bringForwardConsequence,
  bringForwardSelectionLine,
  pickerHistoryLine,
  type BringForwardRowFacts,
} from '@/lib/document/bring-forward';
import { noticedPaperClause } from '@/lib/document/compliance-notice';
import { peopleEvents } from '@/lib/analytics/people-events';
import {
  directoryFirmOf,
  directoryRolodexOrgId,
} from '@/lib/document/people-derivation';
import { writeErrorMessage } from '@/lib/document/write-error';
import {
  contactRuleClause,
  contactRuleIsHardBlock,
  indexContactRules,
} from '@/lib/document/contact-rule';
import { consentSentence } from '../people/consent-sentence';
import { DocSheet } from '../overlays/doc-sheet';
import { DocumentAction, DocumentActionGroup } from '../document-action';
import { TradeChipRow } from '../people/directory/trade-chip-row';
import { PartyMiniRow } from './party-mini-row';
import { TravelListPane } from './travel-list-pane';

/** How many hits the list prints. */
const HISTORY_PAGE = 40;

/**
 * How many cards' histories one grouped query covers. Wider than the printed
 * page because the SEARCH reads the history line too (SPEC §5.7 #3 searches a
 * prior job), and a card whose history has not been read cannot be found by
 * the job it worked.
 */
const HISTORY_SCAN = 200;

/**
 * EVERY TRADE A CARD ANSWERS TO, in one place, so the trade chip and the mini
 * row can never disagree (r7 MAJOR-2).
 *
 * Own card first, then the FIRM's own card, then the legacy vendor column — a
 * `sub` / `gc` / `installer` card's trade is PR-f's widened `trades[]` and on
 * the local book it lives on the firm, while a `vendor` card really does keep
 * its trade in `specialties`, which is what the last leg preserves. The list
 * is the SET a chip may match; `tradeFor` prints its first member.
 */
function tradesOfCard(
  contact: StudioContact,
  firmCardById: ReadonlyMap<string, StudioContact>,
): string[] {
  const own = (contact.trades ?? []).filter((t): t is string => !!t?.trim());
  if (own.length > 0) return own;
  const firmId = contact.company_id ?? null;
  const firm = firmId ? firmCardById.get(firmId) : undefined;
  const firmTrades = (firm?.trades ?? []).filter(
    (t): t is string => !!t?.trim(),
  );
  if (firmTrades.length > 0) return firmTrades;
  return (contact.specialties ?? []).filter((t): t is string => !!t?.trim());
}

/**
 * The picker's default kind vocabulary. Every PartyKind the party CHECK admits
 * EXCEPT 'client': a project's client is set when the project is opened, not
 * picked out of a trade rolodex.
 */
const DEFAULT_SCOPE_KINDS: PartyKind[] = [
  'gc',
  'sub',
  'vendor',
  'installer',
  'receiver',
  'architect',
  'photographer',
  'stager',
  'client_rep',
  'other',
];

const WORD =
  'da-score-hover min-h-11 inline-flex items-center font-mono text-[11px] uppercase tracking-[0.1em] transition-colors';
const WORD_ON = 'da-score-on text-[var(--color-charcoal)]';
const WORD_OFF = 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]';
const UNDERLINE_INPUT =
  'min-h-11 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.85rem] text-[var(--color-charcoal)] outline-none transition-colors placeholder:italic placeholder:text-[var(--color-aged-oak)] focus:border-[var(--color-clay)]';
const FIELD_LABEL =
  'mb-1 block font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]';

/** A rolodex kind is free TEXT; anything the party CHECK doesn't admit lands
 *  on 'other' rather than failing the insert. */
function toPartyKind(kind: string | null | undefined): PartyKind {
  const allowed: readonly string[] = [...DEFAULT_SCOPE_KINDS, 'client'];
  return allowed.includes(kind ?? '') ? (kind as PartyKind) : 'other';
}

function contactName(c: StudioContact): string {
  return (
    (c.entity_kind === 'company' ? c.company_name : c.full_name) ??
    c.company_name ??
    c.full_name ??
    'Unnamed'
  );
}

/**
 * ONE HISTORY LINE (PR-i) — repeat count, the job, the year it CLOSED. Never a
 * verdict: "worked out well" is the studio's judgement and belongs on the card,
 * not at the moment of the pick.
 *
 * The composer moved to `lib/document/bring-forward.ts` with the picker's other
 * sentences; re-exported here because the surface's own tests name it.
 */
export { pickerHistoryLine };

export function RolodexPicker({
  open,
  onClose,
  projectId,
  projectName,
  scopeKinds,
  startInAdd = false,
  onAdded,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  /** The job the seats land on, for SPEC §5.7 #7's consequence sentence. */
  projectName?: string | null;
  /** Pre-scoped kind chips — the sheet arrives already narrowed. */
  scopeKinds?: PartyKind[];
  /** Open straight into the inline-add form (the call sheet's NEW PERSON). */
  startInAdd?: boolean;
  onAdded?: (name: string) => void;
}) {
  const kinds = scopeKinds && scopeKinds.length > 0 ? scopeKinds : DEFAULT_SCOPE_KINDS;

  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<string>('all');
  const [trade, setTrade] = useState('all');
  const [adding, setAdding] = useState(startInAdd);
  const [error, setError] = useState<string | null>(null);
  /** SPEC §5.7 — the rows ticked for one confirm, by rolodex card id. */
  const [picked, setPicked] = useState<string[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  // Form state (inline add)
  const [form, setForm] = useState({
    name: '',
    company: '',
    kind: kinds[0] as string,
    trade: 'all',
    phone: '',
    email: '',
  });
  const [stamp, setStamp] = useState(true);

  useEffect(() => {
    if (!open) return;
    setAdding(startInAdd);
    setError(null);
    setPicked([]);
    const id = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open, startInAdd]);

  const { data: orgs } = useOrganizations({ enabled: open });

  // The three words and the rule come from the directory, which already
  // reduces them per identity — a carded human is keyed on their rolodex card,
  // so `person_id` IS `studio_contacts.id` here (v4). One read for the page of
  // hits, never one per row.
  const { data: directory } = usePeopleDirectory();

  // QA-R3-1: WHICH STUDIO HOLDS THE BOOK. `orgs.find(o => o.type ===
  // 'design_studio')` is a first match over an UNORDERED membership read, and
  // `designer@patina.dev` belongs to two design studios while all 49 cards
  // belong to one — so the picker's hits came back empty about half the time.
  // The directory rows carry each card's own `organization_id`, so the org that
  // actually holds the book answers first (`directoryRolodexOrgId`, the same
  // fold people-room/directory-view/company-card/person-profile use); the
  // membership list is the fallback, sorted so it never moves between renders.
  const organizationId = useMemo(() => {
    const sorted = [...(orgs ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    const memberOrgId =
      sorted.find((o) => o.type === 'design_studio')?.id ?? sorted[0]?.id ?? null;
    return directoryRolodexOrgId(directory ?? []) ?? memberOrgId;
  }, [orgs, directory]);

  /**
   * CR5-1 — WHICH BOOK MAY HOLD THIS SEAT'S CARD, which is a different question
   * from which book this sheet SEARCHES. `organizationId` above answers the
   * search; `assert_project_party_cards()` (00624) checks a seat's
   * `studio_contact_id` against `project_recorded_studio(project_id)`, so the
   * stamp below mints into the studio the JOB records. NULL means the job
   * records none: there is no rolodex the card may live in, the stamp is not
   * offered, and the person still goes on the call sheet.
   */
  const { data: recordedStudioId } = useProjectRecordedStudio(
    open ? projectId : null,
  );
  const canStamp = !!recordedStudioId;

  /**
   * THE BOOK, UNFILTERED BY NAME — because SPEC §5.7 #3 searches a prior JOB
   * ("Lindqvist"), not a person, and a job name lives on nobody's card. The
   * kind chip still narrows server-side; the search runs in memory over the
   * name, the firm, the email AND the prior job the history line already
   * names. No new cost: the picker's own opening state is this same read.
   */
  const { data: contacts } = useStudioContacts(open ? organizationId : null, {
    kind,
  });
  /**
   * The whole book, for ONE lookup: the firm card a person's `company_id`
   * names, which is where a construction trade actually lives (see
   * `tradeFor`). It cannot read `contacts`, because a kind chip narrows that
   * list by the PERSON's kind and a firm card carries its own — Ingrid
   * Halvorsen is a `sub` while Halvorsen Cabinet Works is a `workroom`, so the
   * firm drops out of the very list the chip was set to find her in. With no
   * chip set this is the same query key as the read above, so React Query
   * serves both from one fetch.
   */
  const { data: allCards } = useStudioContacts(open ? organizationId : null, {
    kind: 'all',
  });
  const firmCardById = useMemo(() => {
    const map = new Map<string, StudioContact>();
    for (const c of allCards ?? []) if (c.entity_kind === 'company') map.set(c.id, c);
    return map;
  }, [allCards]);
  const wordsByCard = useMemo(() => {
    const map = new Map<string, PeopleDirectoryRow>();
    for (const row of directory ?? []) if (row.person_id) map.set(row.person_id, row);
    return map;
  }, [directory]);

  // CR-5: the RULE ROW, never `contact_rule_summary`. That column is the
  // mechanical clause list in raw `channel_kind` tokens — "Do not use:
  // after_hours, ap_email, dispatch…" — and SPEC §8 #3 forbids a schema word on
  // any face. `contactRuleClause` is the one composer, and CR-4's
  // `contactRuleIsHardBlock` is the one block answer.
  const { data: contactRules } = useContactRules();
  const ruleIndex = useMemo(() => indexContactRules(contactRules), [contactRules]);

  /**
   * The cards whose history the search may read. Capped, like the page.
   *
   * r7 MAJOR-2 — THE CHIP FILTERS THROUGH THE SAME RESOLVER THE ROW PRINTS.
   *
   * This narrowed on `specialties`, which is 00417's VENDOR-specialty column,
   * while the mini row below prints `tradeFor` — own `trades[]`, then the FIRM
   * card's `trades[]`, then the legacy `specialties[]`. Measured: Dana
   * Kowalski carries `trades {}` / `specialties {}` with `company_id` naming
   * Northgate Electric, whose card carries `trades {electrical}`. So the row
   * printed "SUBCONTRACTOR · NORTHGATE ELECTRIC · ELECTRICAL" and pressing
   * Subcontractor + Electrical returned zero hits — "– No one by that name in
   * the rolodex." over a book holding nine subs. Before this wave the row
   * printed `specialties[0]`, which was empty and therefore AGREED with the
   * filter; the wave taught the row to read the firm's trade and left the
   * filter behind, so the picker denied a fact it printed.
   */
  const scanned = useMemo(() => {
    let rows = contacts ?? [];
    if (trade !== 'all') {
      rows = rows.filter((c) => tradesOfCard(c, firmCardById).includes(trade));
    }
    return rows.slice(0, HISTORY_SCAN);
  }, [contacts, trade, firmCardById]);

  // MAJOR-5: a PRIOR job is one that is not this one. The picker lists cards
  // already seated here (it refuses them at the press, not in the list), so an
  // unexcluded rollup let the sheet name the job it was adding to.
  const { data: history } = useStudioContactHistory(
    scanned.map((c) => c.id),
    { excludeProjectId: projectId },
  );

  const hits = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return scanned.slice(0, HISTORY_PAGE);
    return scanned
      .filter((c) =>
        [
          c.full_name,
          c.company_name,
          c.email,
          // EVERY prior job, not just the latest one (QA-3 / MAJOR-6). A
          // repeat sub who has been seated since is the population this sheet
          // exists for, and matching one name hid exactly them.
          ...(history?.[c.id]?.projectNames ?? []),
        ]
          .filter((field): field is string => !!field)
          .some((field) => field.toLowerCase().includes(needle)),
      )
      .slice(0, HISTORY_PAGE);
  }, [scanned, search, history]);
  const { data: rosterRows, refetch: refetchRoster } = useProjectRoster(
    open ? projectId : null,
  );

  const companyNames = useMemo(
    () =>
      [
        ...new Set(
          (contacts ?? [])
            .map((c) => c.company_name?.trim())
            .filter((n): n is string => !!n),
        ),
      ].sort(),
    [contacts],
  );

  // ── WHAT TRAVELS, read once for the page (SPEC §5.7 #5, PR-b) ───────────
  // Consent by channel value and document expiries are read LIVE off the card,
  // never copied onto the seat: that is the whole hybrid PR-b rules for.
  const { data: consentRecords } = useChannelConsentRecords(
    open ? organizationId : null,
    'sms',
  );
  const consentByValue = useMemo(
    () => new Map((consentRecords ?? []).map((r) => [r.channel_value, r])),
    [consentRecords],
  );
  /**
   * R-Q's job clause, at the pick (r4 code MAJOR-1 / QA finding 1). The record
   * carries `origin_project_id` — the job the refusal was recorded on — and
   * the mini row hardcoded `null` in its place, so ", on the Lindqvist
   * kitchen" could never print here while the Directory row, the roster row
   * and the person card all printed it off the same record. Same read the
   * roster row already makes (`useProjects`, roster-row.tsx).
   */
  const { data: projectsForOrigin } = useProjects();
  const projectNameById = useMemo(
    () =>
      new Map(
        (
          (projectsForOrigin ?? []) as Array<{
            id: string;
            name?: string | null;
          }>
        ).map((p) => [p.id, p.name ?? null] as const),
      ),
    [projectsForOrigin],
  );
  /**
   * BOTH HOLDER CLASSES, because a paper word reduces over both (r10 MAJOR-2).
   *
   * This read was `hits.map(c => c.company_id)` alone, so the document list
   * handed to `noticedPaperClause` could only ever hold FIRM-held rows —
   * `noticedPaperClause` filters by `holders.has(doc.holder_id)`, so a 00623
   * `holder_type = 'person'` document was never even a candidate, however many
   * holder ids the call site named. Two consequences: a mini row's paper WORD
   * comes from `people_directory`, which per R-BA reduces worst-first over the
   * person's OWN documents and their firm's, so a row could read `Lapsed` with
   * no sentence beside it; and SPEC §5.7 #7's consequence sentence omitted a
   * sole proprietor's own lapsed licence, over a travel list that promises
   * "document expiries" travel.
   */
  const paperHolderIds = useMemo(
    () =>
      [
        ...new Set(
          hits
            .flatMap((c) => [c.company_id, c.id])
            .filter((id): id is string => !!id),
        ),
      ],
    [hits],
  );
  const { data: firmPaper } = useComplianceDocumentsFor(
    open ? paperHolderIds : [],
  );
  const { data: notices } = useComplianceNotices(open ? organizationId : null);
  const noticeIndex = useMemo(() => indexComplianceNotices(notices), [notices]);

  /**
   * The prior job every hit shares, or null where the page is mixed.
   *
   * MAJOR-5: rows with NO history used to be filtered out before the
   * uniqueness test, so one carded person with a prior job named the whole
   * page — "4 of 5 from the Lindqvist kitchen selected" over four rows that
   * were never on it. A row with no prior job is its own answer, so it goes
   * into the set as `null` and a mixed page correctly names nothing.
   *
   * A hit matched by its SEARCH is matched against every prior job it has, so
   * the shared name is the searched one where the whole page carries it.
   */
  const sharedJobName = useMemo(() => {
    if (hits.length === 0) return null;
    const needle = search.trim().toLowerCase();
    const names = new Set<string | null>(
      hits.map((c) => {
        const jobs = history?.[c.id]?.projectNames ?? [];
        if (jobs.length === 0) return null;
        const matched = needle
          ? jobs.find((name) => name.toLowerCase().includes(needle))
          : undefined;
        return matched ?? history?.[c.id]?.lastProjectName ?? null;
      }),
    );
    if (names.size !== 1) return null;
    return [...names][0] ?? null;
  }, [hits, history, search]);

  const cardById = useMemo(
    () => new Map(hits.map((c) => [c.id, c] as const)),
    [hits],
  );

  /**
   * MAJOR-2 — the count, the label, the sentence and the insert name the SAME
   * people.
   *
   * `picked` held ids and every consumer resolved them through `cardById`,
   * which is built from `hits` alone. Ticking four under "Lindqvist" and then
   * narrowing the search — or pressing a kind chip, which re-filters too —
   * left the sheet reading "4 of 1 … selected" over a primary act saying "Add
   * four to the roster", a consequence sentence naming one person, and an
   * insert that wrote one seat. Pruning on every change is the reconciliation:
   * a card the studio can no longer see is a card it can no longer be told it
   * is adding.
   */
  useEffect(() => {
    setPicked((current) => {
      const next = current.filter((id) => cardById.has(id));
      return next.length === current.length ? current : next;
    });
  }, [cardById]);

  /**
   * F1 — THE FIRM'S OWN NAME, resolved the way the Directory resolves it.
   *
   * `studio_contacts.company_name` on a PERSON row is 00417's typed-by-hand
   * snapshot, and NOTHING since the affiliation model (00592) populates it: on
   * the local book all 22 carded humans with a `company_id` carry NULL there
   * while their firm's card holds the name. So every caller reading the raw
   * column fell through its `?? contactName(contact)` fallback and printed the
   * PERSON where the firm was meant — the picker's mini row lost its firm
   * segment entirely (SPEC §5.7 #4 asks for "Dana Kowalski · Northgate
   * Electric · electrical"), and the bring-forward consequence sentence read
   * "Dana Kowalski's insurance lapsed 31 March 2026." where SPEC §5.7 #7 fixes
   * the wording as "Northgate Electric's insurance lapsed 31 Mar 2026." The
   * insurance is the firm's; naming her is a wrong fact on a face.
   *
   * W2 round 7 fixed exactly this for the Directory row and the person-card
   * header, by joining `company_id` to the firm's own card inside
   * `people_directory` (`meta.company_name`, 00629 §6) — and `directoryFirmOf`
   * is the one reader of that join. This page already holds the directory row
   * for every hit (`wordsByCard`, keyed on the card id), so the same answer is
   * one lookup away and no new query is issued. The legacy column stays the
   * fallback for a book that really did type a firm name by hand.
   */
  const firmNameFor = (contact: StudioContact): string | null => {
    const row = wordsByCard.get(contact.id);
    const resolved = row ? directoryFirmOf(row).name : null;
    return resolved ?? (contact.company_name?.trim() || null);
  };

  /**
   * QA r3 finding 1 — THE TRADE, resolved the way F1 resolved the firm.
   *
   * Every call site read `specialties[0]`, which is 00417's VENDOR-specialty
   * column. A `sub` / `gc` / `installer` card's trade lives in `trades[]` —
   * PR-f's widened FieldTrade vocabulary — and on the local book it lives on
   * the FIRM's card: Dana Kowalski, Pete Rusk and Ingrid Halvorsen all carry
   * `specialties {}` and `trades {}` while Northgate Electric carries
   * `trades {electrical}`, Rusk Mechanical `{plumbing}` and Halvorsen Cabinet
   * Works `{cabinetry}`. So the mini row printed "SUBCONTRACTOR · NORTHGATE
   * ELECTRIC" where SPEC §5.7 #4 and the shipped 1440/390 specimens both print
   * "… · electrical", and — because the same expression feeds both inserts —
   * every brought-forward seat was BORN with `project_parties.trade = ''`,
   * which PR-b makes a permanent snapshot nothing later recovers. Claire
   * Bissett landed correctly only because a `vendor` card really does keep its
   * trade in `specialties`, which is what hid this in a walk.
   *
   * Own card first, then the firm's own card, then the legacy vendor column,
   * so the vendor case keeps the answer it already had.
   */
  const tradeFor = (contact: StudioContact): string | null =>
    tradesOfCard(contact, firmCardById)[0] ?? null;

  /**
   * THE NAME COMES OFF THE DOCUMENT, not off the row (r10 MAJOR-2).
   *
   * `firmNameFor(contact) ?? contactName(contact)` is right for a firm-held
   * certificate and wrong for a licence the PERSON holds — it would announce
   * the person's own paper under their firm's name, which is r9 B-1 in
   * reverse. This is the branch 00630:368-375 already makes for the
   * notification.
   */
  const paperHolderNameFor =
    (contact: StudioContact) => (doc: StudioComplianceDocument) =>
      doc.holder_id === contact.id
        ? contactName(contact)
        : (firmNameFor(contact) ?? contactName(contact));

  const paperClauseFor = (contact: StudioContact) =>
    noticedPaperClause(
      [contact.company_id, contact.id],
      paperHolderNameFor(contact),
      firmPaper,
      noticeIndex,
      COMPLIANCE_DOC_TYPE_LABELS,
    );

  const pickedFacts: BringForwardRowFacts[] = useMemo(
    () =>
      picked
        .map((id) => cardById.get(id))
        .filter((c): c is StudioContact => !!c)
        .map((c) => {
          const firm =
            (wordsByCard.get(c.id)
              ? directoryFirmOf(wordsByCard.get(c.id) as PeopleDirectoryRow).name
              : null) ??
            (c.company_name?.trim() || null);
          return {
            name: contactName(c),
            consent: wordsByCard.get(c.id)?.consent_status ?? null,
            firmName: firm,
            paperClause: noticedPaperClause(
              [c.company_id, c.id],
              // The person for their own paper, the firm for the firm's
              // (r10 MAJOR-2).
              (doc: StudioComplianceDocument) =>
                doc.holder_id === c.id ? contactName(c) : (firm ?? contactName(c)),
              firmPaper,
              noticeIndex,
              COMPLIANCE_DOC_TYPE_LABELS,
            ),
          };
        }),
    [picked, cardById, wordsByCard, firmPaper, noticeIndex],
  );

  const addParty = useAddProjectParty();
  const addContact = useAddStudioContact();
  const bringForward = useBringForward();

  const finish = (name: string) => {
    onAdded?.(name);
    setSearch('');
    setPicked([]);
    setAdding(false);
    setForm({ name: '', company: '', kind: kinds[0] as string, trade: 'all', phone: '', email: '' });
    setStamp(true);
    onClose();
  };

  const addFromRolodex = async (contact: StudioContact) => {
    setError(null);
    const name = contactName(contact);
    if (
      rosterHasIdentity(rosterRows ?? [], {
        display_name: name,
        email: contact.email,
        phone: contact.phone,
        profile_id: contact.profile_id,
        studio_contact_id: contact.id,
      })
    ) {
      setError(`${name} is already on the call sheet.`);
      return;
    }
    try {
      await addParty.mutateAsync({
        projectId,
        partyKind: toPartyKind(contact.contact_kind),
        displayName: name,
        // MAJOR-1 / finding 1: the firm and the trade the ROW printed, not the
        // two legacy columns the seat used to be born with — `company_name` is
        // NULL on every carded human with a firm (F1's own measurement) and
        // `specialties` is empty on every construction trade.
        companyName: firmNameFor(contact),
        trade: tradeFor(contact),
        phone: contact.phone,
        email: contact.email,
        studioContactId: contact.id,
      });
      void refetchRoster();
      finish(name);
    } catch (e) {
      // CR5-1: a PostgREST rejection is a plain object, so `e instanceof Error`
      // turned every 00624 card-guard refusal into a shrug.
      setError(writeErrorMessage(e, 'Could not add them to the call sheet.'));
    }
  };

  /**
   * SPEC §5.7 #6's terminal act. One confirm, N seats.
   *
   * Nothing about consent is written: `studio_channel_consent` is keyed on the
   * number, so Pete Rusk's seat is born reading his refusal (direction §5.2's
   * Birth rule). Nothing about prior pricing or prior notes is written either —
   * `useBringForward`'s insert names none of those columns.
   */
  const addPicked = async () => {
    if (picked.length === 0) return;
    setError(null);
    const rows = picked
      .map((id) => cardById.get(id))
      .filter((c): c is StudioContact => !!c);
    /**
     * r11 QA MAJOR-1 — ONE SEATED PICK COST THE WHOLE BATCH.
     *
     * This pre-check refused every ticked card the moment ANY one of them was
     * already on this sheet, before `bringForward.mutateAsync` was called at
     * all. Leah's own task 5 names four people who are all already seated on
     * the Okonkwo residence in the shipped fixture, so performing it exactly
     * as SPEC §5.7 and direction §6 describe it wrote ZERO seats — measured
     * twice on fresh resets. The RPC path's own refusals are per pick
     * (`useBringForward` inserts one at a time and returns `refused`), and the
     * room report states that rule out loud: "One pick refused does not cost
     * the others." The client-side check now reads the same way — the seated
     * rows drop out of the batch, the rest go on, and the sentence says which
     * did not.
     */
    const seated = rows.filter((c) =>
      rosterHasIdentity(rosterRows ?? [], {
        display_name: contactName(c),
        email: c.email,
        phone: c.phone,
        profile_id: c.profile_id,
        studio_contact_id: c.id,
      }),
    );
    const seatedSentence =
      seated.length > 0
        ? `${seated.map((c) => contactName(c)).join(', ')} ${
            seated.length === 1 ? 'is' : 'are'
          } already on the call sheet.`
        : '';
    const fresh = rows.filter((c) => !seated.includes(c));
    if (fresh.length === 0) {
      setError(seatedSentence);
      return;
    }
    const picks: BringForwardPick[] = fresh.map((c) => ({
      studioContactId: c.id,
      partyKind: toPartyKind(c.contact_kind),
      displayName: contactName(c),
      // MAJOR-1 / finding 1. `companyName: c.company_name` made bring-forward
      // the first writer to break the invariant F1's fix relies on (0 seats
      // with a company_id and no name): the new Call Sheet row printed no firm
      // at all and the held clause lost its possessive — "Site access held.
      // insurance lapsed 31 March 2026." `trade: c.specialties?.[0]` wrote an
      // empty trade onto the seat's own permanent snapshot.
      trade: tradeFor(c),
      companyId: c.company_id,
      companyName: firmNameFor(c),
      phone: c.phone,
      email: c.email,
    }));
    try {
      const result = await bringForward.mutateAsync({ projectId, picks });
      peopleEvents.bringForwardPicked({
        picked_count: result.added.length,
        offered_count: hits.length,
        carried_opt_out: pickedFacts.some((row) => row.consent === 'opted_out'),
      });
      void refetchRoster();
      if (result.refused.length > 0 || seated.length > 0) {
        // M2R-3: `reason` is the untranslated PostgREST message `useBringForward`
        // copied off the error, so a constraint name, a relation name or an RLS
        // string landed on the face under SPEC §8 #3's own prohibition. Every
        // other write path in this component already routes through
        // `writeErrorMessage`; the wave's terminal act is the one that skipped
        // it. The refusal object is shaped like the rejection the translator
        // reads, so the 00624/00629 bare tokens answer in words.
        const refusedSentence =
          result.refused.length > 0
            ? `${result.refused
                .map((row) => row.name)
                .join(', ')} did not go on the call sheet. ${writeErrorMessage(
                { message: result.refused[0].reason },
                'The studio’s book refused the seat.',
              )}`
            : '';
        const addedSentence =
          result.added.length > 0
            ? `${result.added.length === 1 ? result.added[0].name : `${result.added.length} people`} went on the call sheet. `
            : '';
        setError(
          `${addedSentence}${[seatedSentence, refusedSentence]
            .filter(Boolean)
            .join(' ')}`,
        );
        // The rows that did not go on stay ticked, and only those: a seat that
        // landed must not be offered again.
        setPicked([
          ...seated.map((c) => c.id),
          ...result.refused.map((row) => row.studioContactId),
        ]);
        return;
      }
      finish(
        result.added.length === 1
          ? result.added[0].name
          : `${result.added.length} people`,
      );
    } catch (e) {
      setError(writeErrorMessage(e, 'Could not add them to the call sheet.'));
    }
  };

  const addSomeoneNew = async () => {
    const name = form.name.trim();
    if (!name) {
      setError('A name, at least.');
      return;
    }
    setError(null);
    const tradeValue = form.trade === 'all' ? null : form.trade;
    if (
      rosterHasIdentity(rosterRows ?? [], {
        display_name: name,
        email: form.email,
        phone: form.phone,
      })
    ) {
      setError(`${name} is already on the call sheet.`);
      return;
    }

    // The stamp writes the rolodex card FIRST, so the party can carry its id.
    // A rolodex hiccup must never cost the designer the add they came for —
    // the party still goes on the job, unlinked, and the error is stated.
    let studioContactId: string | null = null;
    if (stamp && recordedStudioId) {
      try {
        const contact = await addContact.mutateAsync({
          organizationId: recordedStudioId,
          entityKind: 'person',
          contactKind: form.kind,
          fullName: name,
          companyName: form.company.trim() || null,
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
          specialties: tradeValue ? [tradeValue] : [],
        });
        studioContactId = contact.id;
      } catch {
        setError('Added to the job, but the studio rolodex did not take the card.');
      }
    }

    try {
      await addParty.mutateAsync({
        projectId,
        partyKind: toPartyKind(form.kind),
        displayName: name,
        companyName: form.company.trim() || null,
        trade: tradeValue,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        studioContactId,
      });
      void refetchRoster();
      finish(name);
    } catch (e) {
      setError(writeErrorMessage(e, 'Could not add them to the call sheet.'));
    }
  };

  return (
    <DocSheet open={open} onClose={onClose} title="From the rolodex" icon={UserPlus}>
      <input
        ref={searchRef}
        type="search"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        aria-label="Search the rolodex"
        placeholder="a name, a company, a trade…"
        className={UNDERLINE_INPUT}
      />

      <div role="group" aria-label="Filter by kind" className="mt-3 flex flex-wrap gap-x-3.5 gap-y-1">
        <button
          type="button"
          onClick={() => {
            setKind('all');
            setTrade('all');
          }}
          aria-pressed={kind === 'all'}
          className={`${WORD} ${kind === 'all' ? WORD_ON : WORD_OFF}`}
        >
          All
        </button>
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => {
              setKind(k);
              setTrade('all');
            }}
            aria-pressed={kind === k}
            className={`${WORD} ${kind === k ? WORD_ON : WORD_OFF}`}
          >
            {getPartyKindLabel(k)}
          </button>
        ))}
      </div>

      {kind !== 'all' && (
        <div className="mt-2">
          <TradeChipRow
            domain={kind === 'vendor' ? 'specialty' : 'trade'}
            value={trade}
            onChange={setTrade}
          />
        </div>
      )}

      {hits.length > 0 && (
        <>
          <p
            data-pick-count
            className="mt-3 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
          >
            {bringForwardSelectionLine(picked.length, hits.length, sharedJobName)}
          </p>

          {/* 1440: the pane beside the list. 390: the pane after it
              (SPEC §5.7 #9). One order in the DOM, `flex-wrap` deciding. */}
          <div className="mt-2 flex flex-wrap items-start gap-4">
            <ul className="m-0 min-w-[18rem] flex-1 list-none p-0">
              {hits.map((c) => {
                const words = wordsByCard.get(c.id);
                const rule = ruleIndex.get(c.id) ?? null;
                const chosen = picked.includes(c.id);
                const record = c.phone_e164
                  ? consentByValue.get(c.phone_e164)
                  : undefined;
                // The refusal the pick CARRIES (direction §5.2's Birth rule):
                // a seat on this number is born reading it, so the studio
                // reads it before the seat exists.
                const carried =
                  words?.consent_status === 'opted_out'
                    ? consentSentence({
                        status: 'opted_out',
                        optOutSource: record?.opt_out_source,
                        optOutAt: record?.opt_out_at,
                        projectName: record?.origin_project_id
                          ? (projectNameById.get(record.origin_project_id) ??
                            null)
                          : null,
                      })
                    : null;
                const paperClause = paperClauseFor(c);
                return (
                  <li key={c.id} className="flex items-center gap-1">
                    <PartyMiniRow
                      name={contactName(c)}
                      kind={c.contact_kind}
                      entity={c.entity_kind}
                      company={firmNameFor(c)}
                      trade={tradeFor(c)}
                      reach={
                        (words?.reach_state as
                          | 'account'
                          | 'field_link'
                          | 'on_paper'
                          | null) ??
                        (c.profile_id ? 'account' : 'on_paper')
                      }
                      consent={words?.consent_status ?? null}
                      paper={words?.paper_state ?? null}
                      rule={contactRuleClause(rule)}
                      ruleBlocked={contactRuleIsHardBlock(rule)}
                      subline={
                        <>
                          <span className="block">
                            {pickerHistoryLine(history?.[c.id])}
                          </span>
                          {carried && (
                            <span data-carried-consent className="block">
                              {carried}
                            </span>
                          )}
                          {paperClause && (
                            <span data-expiry-notice className="block">
                              {paperClause}
                            </span>
                          )}
                        </>
                      }
                      selectable
                      multi
                      selected={chosen}
                      onSelect={() =>
                        setPicked((current) =>
                          current.includes(c.id)
                            ? current.filter((id) => id !== c.id)
                            : [...current, c.id],
                        )
                      }
                      disabled={addParty.isPending || bringForward.isPending}
                    />
                    {/* The single add stays one press, and stays a SIBLING of
                        the row: an interactive control inside a <button> is
                        unreachable by keyboard and unannounced by a reader
                        (C11's own rule, applied to the picker). */}
                    <button
                      type="button"
                      data-add-one={c.id}
                      aria-label={`Add ${contactName(c)} on their own`}
                      onClick={() => void addFromRolodex(c)}
                      disabled={addParty.isPending || bringForward.isPending}
                      className="da-score-hover inline-flex min-h-11 shrink-0 items-center px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)] disabled:opacity-50"
                    >
                      Add
                    </button>
                  </li>
                );
              })}
            </ul>

            <TravelListPane className="min-w-[13rem] flex-1 basis-[13rem]" />
          </div>

          {/* R-I / C19 — the ACT ROW first, the consequence sentence directly
              beneath it, at both widths. Both acts are live; nothing here is
              gated. */}
          <DocumentActionGroup
            surfaceKey="call-sheet"
            regionKey="rolodex-bring-forward"
            className="mt-4"
            aria-label="Bring forward"
          >
            <DocumentAction
              actionKey="bring-forward-add"
              variant="primary"
              onClick={() => void addPicked()}
              loading={bringForward.isPending}
              loadingLabel="Adding…"
            >
              {bringForwardActLabel(picked.length)}
            </DocumentAction>
            <DocumentAction
              actionKey="bring-forward-put-back"
              variant="tertiary"
              onClick={() => setPicked([])}
            >
              Put back
            </DocumentAction>
          </DocumentActionGroup>

          <p
            data-bring-forward-consequence
            className="mt-1.5 text-[0.74rem] leading-relaxed text-[var(--color-aged-oak)]"
          >
            {bringForwardConsequence(projectName, pickedFacts)}
          </p>
        </>
      )}

      {/* The way out sits under the hits from the first frame (mnote 3) — but
          the SENTENCE is the empty search's, not the band's (CR9-2). Ungated it
          printed "No one by that name in the rolodex." directly beneath the
          people it had just found, on every normal search. */}
      <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-l-2 border-[var(--color-pearl)] bg-white/40 px-3 py-2.5">
        {hits.length === 0 && (
          <p className="text-[0.74rem] text-[var(--color-aged-oak)]">
            – No one by that name in the rolodex.
          </p>
        )}
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className={`${WORD} ${WORD_OFF}`}
          >
            Add someone new
          </button>
        )}
      </div>

      {/* CR11-10 / CR11-61: a refusal is an alert, not a polite live region —
          the idiom `add-person-sheet.tsx` already uses in the same flow. */}
      {error && (
        <p role="alert" className="mt-2 text-[0.72rem] text-[var(--color-terracotta-ink)]">
          {error}
        </p>
      )}

      {adding && (
        <div className="mt-4 border-t border-[var(--color-pearl)] pt-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--color-clay-ink)]">
            Someone new
          </p>

          <div className="mt-3">
            <label className={FIELD_LABEL} htmlFor="rolodex-add-name">
              Name
            </label>
            <input
              id="rolodex-add-name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className={UNDERLINE_INPUT}
            />
          </div>

          <div className="mt-3">
            <label className={FIELD_LABEL} htmlFor="rolodex-add-company">
              Company
            </label>
            <input
              id="rolodex-add-company"
              list="rolodex-companies"
              value={form.company}
              onChange={(e) => setForm((f) => ({ ...f, company: e.target.value }))}
              className={UNDERLINE_INPUT}
            />
            <datalist id="rolodex-companies">
              {companyNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
          </div>

          <div className="mt-4">
            <span className={FIELD_LABEL}>Kind</span>
            <div role="group" aria-label="Kind" className="flex flex-wrap gap-x-3.5 gap-y-1">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind: k, trade: 'all' }))}
                  aria-pressed={form.kind === k}
                  className={`${WORD} ${form.kind === k ? WORD_ON : WORD_OFF}`}
                >
                  {getPartyKindLabel(k)}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            <span className={FIELD_LABEL}>
              {form.kind === 'vendor' ? 'Specialty' : 'Trade'}
            </span>
            <TradeChipRow
              domain={form.kind === 'vendor' ? 'specialty' : 'trade'}
              value={form.trade}
              onChange={(v) => setForm((f) => ({ ...f, trade: v }))}
            />
          </div>

          <div className="mt-1">
            <label className={FIELD_LABEL} htmlFor="rolodex-add-phone">
              Phone
            </label>
            <input
              id="rolodex-add-phone"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              className={UNDERLINE_INPUT}
            />
          </div>

          <div className="mt-3">
            <label className={FIELD_LABEL} htmlFor="rolodex-add-email">
              Email
            </label>
            <input
              id="rolodex-add-email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="optional"
              className={UNDERLINE_INPUT}
            />
          </div>

          {/* CR5-1 — a job that records no studio has no book for the card to
              land in, and the guard refuses the stamp. Say so instead of
              offering an act that mints a card nothing can point at. */}
          {!canStamp && (
            <p className="mt-5 text-[0.72rem] text-[var(--color-aged-oak)]">
              This job isn’t attached to a studio yet, so nobody can be saved to
              the book from here. They still go on the call sheet.
            </p>
          )}

          {/* The stamp — square, 2px radius, sage fill, a check. Never a switch. */}
          {canStamp && (
          <button
            type="button"
            role="checkbox"
            aria-checked={stamp}
            onClick={() => setStamp((s) => !s)}
            className="mt-5 flex w-full items-start gap-2.5 text-left"
          >
            <span
              aria-hidden
              className="relative top-[3px] inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-[2px] border-[1.5px] text-[8px] font-bold leading-none"
              style={{
                borderColor: stamp ? 'var(--color-sage)' : 'var(--doc-ink-border)',
                background: stamp ? 'rgba(168,181,160,0.15)' : 'transparent',
                color: 'var(--color-sage)',
              }}
            >
              {stamp ? '✓' : ''}
            </span>
            <span className="min-w-0">
              <span className="block font-heading text-[0.86rem] text-[var(--color-charcoal)]">
                Save to the studio rolodex
              </span>
              <span className="mt-0.5 block text-[0.7rem] text-[var(--color-aged-oak)]">
                so the next project starts with them
              </span>
            </span>
          </button>
          )}

          <DocumentActionGroup
            surfaceKey="call-sheet"
            regionKey="rolodex-inline-add"
            className="mt-4 justify-end"
            aria-label="Add someone new"
          >
            <DocumentAction
              actionKey="add-new-person-to-call-sheet"
              variant="primary"
              onClick={() => void addSomeoneNew()}
              disabled={addParty.isPending || addContact.isPending}
              loading={addParty.isPending || addContact.isPending}
              loadingLabel="Adding…"
            >
              Add to the call sheet
            </DocumentAction>
          </DocumentActionGroup>
        </div>
      )}
    </DocSheet>
  );
}
