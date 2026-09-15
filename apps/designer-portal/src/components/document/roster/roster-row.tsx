'use client';

/**
 * ONE CALL SHEET ROW, AND WHAT IS UNDER IT (direction §3.4, SPEC §5.4).
 *
 * Folded: a 34px avatar, the name, the kind and trade, the firm, the authority
 * phrase where there is one, the held clause where a firm's paper blocks the
 * work, an opted-out note where the studio may not text (R-T), then two words —
 * reach and stage — a `tel:` link as the row's SIBLING, and the chevron that
 * opens the person.
 *
 * Unfolded: phone and email, the consent sentence with its source and date
 * (R-Q), and four acts — Text, Copy field link, Show to client, Close this
 * seat. The unfold trigger carries `aria-expanded` AND `aria-controls` pointing
 * at the panel's real id (SPEC §7 #5).
 *
 * THE WORD "REMOVE" APPEARS NOWHERE (SPEC §5.4 #14). Closing a seat is
 * `Close this seat`: a dated `off_job_at` with a reason, and the consent, the
 * bid history and the paper all stay on the book. The hard delete survives for
 * one case only — a seat added by mistake that carries nothing — and the
 * predicate that decides it is `seatDeleteRefusal`, read before the act is
 * offered, never after it is pressed.
 *
 * An `<a>` never nests inside a `<button>`: the row's open control and the
 * phone are two sibling targets, each at least 44px (SPEC §7 #6).
 */

import { useMemo, useState } from 'react';
import {
  ALL_SEAT_BID_OUTCOMES,
  SEAT_BID_OUTCOME_ACTS,
  SEAT_BID_OUTCOME_LABELS,
  bidStageOutcome,
  seatCarriesBid,
  fieldLinkUrl,
  indexComplianceNotices,
  seatDeleteRefusal,
  useChannelConsent,
  useCloseProjectPartySeat,
  useComplianceDocumentsFor,
  useCreateFieldLink,
  useComplianceNotices,
  useRemoveProjectParty,
  useSendPartySms,
  useSetPartyBid,
  useUpdateProjectParty,
  useOrganizations,
  seatCloseIsHeldForMoney,
  AUTHORITY_SCOPE_LABELS,
  COMPLIANCE_DOC_TYPE_LABELS,
  SEAT_CLOSE_MONEY_HELD_REASON,
  SEAT_DELETE_REFUSAL_SENTENCES,
  type ProjectPartyAuthority,
  type SeatBid,
  type SeatBidOutcome,
  type StudioComplianceDocument,
  type StudioContactRule,
} from '@patina/supabase';
import { getSeatStageLabel, isFieldPartyKind, partyKindOwesPaper } from '@patina/types';
import {
  MINT_FALLBACK_SENTENCE,
  authorityPhrase,
  bidNote,
  fieldLinkExpirySentence,
  grantWindowEnd,
  heldClause,
  heldClausePaperNoun,
  rosterShortDate,
  seatProfileRole,
  seatWindowText,
  type CallSheetBand,
  type CallSheetRow,
} from '@/lib/document/roster-derivation';
import {
  contactRuleClause,
  contactRuleForbidsSms,
  contactRuleIsDoNotContact,
  contactRuleIsHardBlock,
  contactRuleTextHeldClause,
} from '@/lib/document/contact-rule';
import { noticedPaperClause } from '@/lib/document/compliance-notice';
import { peopleEvents } from '@/lib/analytics/people-events';
import { writeErrorMessage } from '@/lib/document/write-error';
import { useProjects } from '@/hooks/use-projects';
import { Avatar } from '../people/person-bits';
import { consentSentence } from '../people/consent-sentence';
import {
  ContactRuleLine,
  type ContactRouteTarget,
} from '../people/contact-rule-line';
import { PlainFact, StateWord } from '../people/state-word';
import { TelLink } from '../people/tel-link';
import { DocumentAction, DocumentActionRow } from '../document-action';

const META =
  'font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--color-aged-oak)]';

/** The stages the studio asked a price on — a seat in one of them carries a bid
 *  whatever columns the row has (the bid columns are P2). */
const BID_STAGES: readonly string[] = [
  'prospect',
  'invited',
  'bidding',
  'declined',
  'no_response',
];

/** The window clause a row prints beside its stage: the day the crew arrives on
 *  a later seat, the day it closed on a closed one. */
export function rosterWindowClause(row: CallSheetRow, band: CallSheetBand): string {
  // r15 MAJOR-1 — THE OFF-JOB CLAUSE FOLLOWS THE RECORD, NOT THE BAND.
  // `callSheetProjection()` bands every `client` / `client_rep` seat into
  // `clientSide` BEFORE the window rule is consulted, so a closed client-side
  // seat never reached the `done` leg and printed no closing date at all —
  // while its authority line went on reading "Signs money to $2,500." A row
  // carrying `off_job_at` says so wherever it is banded; a `done` row with no
  // date behaves exactly as before.
  const closedWhen = rosterShortDate(row.offJobAt);
  const closedReason = (row.offJobReason ?? '').trim();
  if (closedWhen || closedReason) {
    return [closedWhen ? `Off the job ${closedWhen}.` : '', closedReason]
      .filter(Boolean)
      .join(' ');
  }
  if (band === 'done') return '';
  if (band === 'later') {
    const from = rosterShortDate(row.onSiteFrom);
    return from ? `From ${from}` : '';
  }
  return seatWindowText(row.onSiteFrom, row.onSiteTo);
}

export function RosterRow({
  row,
  band,
  expanded,
  onToggle,
  onOpenSeat,
  onAnnounce,
  authority = [],
  consentOrg,
  projectName,
  rule,
  routeTo,
  contactKind,
  bid,
  bidPeople,
}: {
  row: CallSheetRow;
  band: CallSheetBand;
  expanded: boolean;
  onToggle: () => void;
  onOpenSeat?: (row: CallSheetRow) => void;
  /** CR11-10: the surface's one announcer. This row's note is paper. */
  onAnnounce?: (message: string) => void;
  authority?: ProjectPartyAuthority[];
  /** The studio whose consent record this row's number is read against. */
  consentOrg?: string | null;
  /** The job this sheet is, for R-Q's "on the <project>" clause. */
  projectName?: string | null;
  /**
   * The rule ROW governing this seat — the engagement's own, else the
   * person's card rule. CR-5 / CR-6 / CR-22: the clause, the hard block and
   * the route all come off the columns, not off a regex over prose.
   */
  rule?: StudioContactRule | null;
  /** How to reach the person the rule routes to (R-L / CR-15). */
  routeTo?: ContactRouteTarget | null;
  /**
   * CR8-5 — the CARD's `contact_kind` for this row's identity, resolved once
   * for the whole sheet by `RosterGroups`. Direction §3.8 is categorical: an
   * inspector's or a lender's paper word prints "on any surface", and this row
   * was the one surface in the build with no gate on it at all. The seat's own
   * `party_kind` cannot answer — `project_parties_party_kind_check` has not
   * been widened, so Ray Thao and Carol Nyström are both stored `other` (a
   * declared W3 gap, w2a-report §6 item 2) — so the card's kind answers, and
   * `row.partyKind` is the fallback where no card is resolved.
   */
  contactKind?: string | null;
  /**
   * 00631's bid columns for this seat. `people_directory_seats` (00626)
   * predates them, so RosterGroups reads them once for the sheet and hands
   * each row its own — never one query per row.
   */
  bid?: SeatBid | null;
  /**
   * The studio's person cards, for "who priced it" (00631 requires a PERSON
   * card in the job's own studio). ARCHIVED cards are included and flagged
   * (r13 MAJOR-1): the recorded estimator's NAME resolves against the whole
   * book, so putting their card away never erases "Priced by …" off a face
   * the seat still names — only the offered picks are archived-excluded.
   */
  bidPeople?: ReadonlyArray<{ id: string; name: string; archived?: boolean }>;
}) {
  const isSeat = row.source === 'seat';
  // One predicate, one clause, wherever a rule is shown (R-S).
  // CR3-2: and NEVER `contact_rule_summary` (`row.ruleSummary`) behind it —
  // that column prints raw `channel_kind` tokens (`after_hours`, `ap_email`,
  // `portal_311`, `dispatch`), which SPEC §8 #3 bars from any face, and it
  // drops the studio's own typed reason. The rules are a separate query from
  // the roster, so the fallback painted on every cold load. A row whose rule
  // has not arrived prints no clause rather than a schema-worded one.
  const ruleClause = contactRuleClause(rule);
  // CR-4 / CR-16: the SAME pair of predicates the Directory row uses, over the
  // same column. The leading rule prints for ANY forbidden channel (SPEC §5.1
  // #11); only a rule that leaves no direct channel open takes the number off
  // the row (§5.4).
  const ruleBlocks = contactRuleIsHardBlock(rule);
  const ruleSilencesPhone = contactRuleIsDoNotContact(rule);
  const seatId = row.seatId ?? '';
  const projectId = row.projectId ?? '';

  /**
   * r20 major-1 / QA blocking-2 — CLOSE THIS SEAT IS FOR A SEAT STILL ON THE JOB.
   *
   * The act was gated on `isSeat` alone, so a row already in the Done band —
   * carrying a recorded `off_job_at` and the studio's own `off_job_reason` —
   * still offered it, and taking it overwrote the recorded day with today and
   * blanked the sentence (the row's `reason` state starts at '' and was never
   * seeded, so `useCloseProjectPartySeat` wrote NULL). No audit row and no
   * second copy held the originals. The confirm sentence — "The seat stays on
   * the job with the day it closed" — was a wrong fact in that state.
   *
   * The person card's `CloseSeatAct` was already right: `person-profile.tsx`
   * only renders it over `liveSeats`. This is the Call Sheet's half of the two
   * copies §6 of the room report calls hand-kept in step. Held rather than
   * hidden, so the reason stays readable where the act would be (direction
   * §5.5), and the reason field is seeded from the record so a correction can
   * never silently blank a recorded sentence.
   */
  const closedOnText = rosterShortDate(row.offJobAt);
  const closedReasonText = (row.offJobReason ?? '').trim();
  const seatAlreadyClosed = isSeat && (!!row.offJobAt || row.stage === 'off_job');
  const closedHeldSentence = [
    closedOnText
      ? `This seat left the job on ${closedOnText}.`
      : 'This seat has already left the job.',
    closedReasonText ? `The reason on file reads “${closedReasonText}”.` : '',
    'Closing it again would write over that day. Putting a seat back on the job is its own act.',
  ]
    .filter(Boolean)
    .join(' ');

  /**
   * r21 MAJOR-1 / major-2 (R-BS) — THE PR-n STANDING, READ BEFORE THE PRESS.
   *
   * 00634 made "Close this seat" a GATED act: a seat carrying an open money or
   * draw-certify grant may only be closed by an owner or an admin of the
   * studio, because closing it ends that grant and PR-n reserves the taking
   * away to the principal. The act was offered live and unqualified to the
   * caller the database would refuse, and the refusal arrived as a bare schema
   * token. `household-band.tsx` already states this same rule in words before
   * the press (`isPrincipal`, :328); this is that shape, on this surface.
   */
  const { data: orgsForStanding } = useOrganizations();
  const isPrincipal = useMemo(() => {
    if (!consentOrg) return false;
    const role = (orgsForStanding ?? []).find((o) => o.id === consentOrg)
      ?.membership?.role;
    return role === 'owner' || role === 'admin';
  }, [orgsForStanding, consentOrg]);
  const closeHeldForMoney =
    isSeat && !seatAlreadyClosed && seatCloseIsHeldForMoney(authority, isPrincipal);
  const closeHeld = seatAlreadyClosed || closeHeldForMoney;
  const closeHeldSentence = seatAlreadyClosed
    ? closedHeldSentence
    : SEAT_CLOSE_MONEY_HELD_REASON;

  const [composing, setComposing] = useState(false);
  const [body, setBody] = useState('');
  const [closing, setClosing] = useState(false);
  const [reason, setReason] = useState('');
  /**
   * r21 major-2 — A REFUSED CLOSE IS AN ALERT, NOT A STATUS.
   *
   * The catch printed `e.message` — the bare token — into `setNote`, the
   * row's polite `role="status"` announcer: a screen-reader user was told the
   * close FAILED in the voice that tells them it succeeded, and a later status
   * could swallow it. Same rule r7 MAJOR-4 settled for the bid editor
   * (:258-269), same translator every other door in the wave uses.
   */
  const [closeError, setCloseError] = useState<string | null>(null);
  const [noteText, setNoteText] = useState<string | null>(null);
  /**
   * CR11-10: the note prints as paper and speaks through the surface's one
   * announcer, so a sheet of thirty rows cannot hold thirty live regions.
   */
  const note = noteText;
  const setNote = (next: string | null) => {
    setNoteText(next);
    if (next) onAnnounce?.(next);
  };

  /** The Bidding band's own editing state (direction §3.4). */
  const [editingBid, setEditingBid] = useState(false);
  /**
   * r7 MAJOR-4 — A REFUSAL IS AN ALERT, NOT A STATUS.
   *
   * The bid refusal used to go through `setNote`, which is the row's polite
   * `role="status"` announcer — the same voice that says "The bid is written
   * on <name>'s seat." So a screen-reader user was told the write FAILED in
   * the voice that tells them it succeeded, and a later status change could
   * swallow it. Every other refusal in this wave is a `role="alert"`
   * (rolodex-picker, household-band, compare-merge-sheet, archive-card-door,
   * close-seat-act), which is the idiom CR11-10 settled.
   */
  const [bidError, setBidError] = useState<string | null>(null);
  const [bidDraft, setBidDraft] = useState<{
    askedAt: string;
    dueAt: string;
    quotedAt: string;
    selectedAt: string;
    outcome: SeatBidOutcome | '';
    validUntil: string;
    quotedBy: string;
  }>({
    askedAt: '',
    dueAt: '',
    quotedAt: '',
    selectedAt: '',
    outcome: '',
    validUntil: '',
    quotedBy: '',
  });

  const updateParty = useUpdateProjectParty();
  const setBid = useSetPartyBid();
  const closeSeat = useCloseProjectPartySeat();
  const removeParty = useRemoveProjectParty();
  const createLink = useCreateFieldLink();
  const sendSms = useSendPartySms();

  // The consent SENTENCE needs the record behind the word: its source and its
  // date. Read only where the sentence prints — the unfold, and a refusal,
  // which R-T puts on the collapsed row as well.
  const wantsRecord = isSeat && (expanded || row.consent === 'opted_out');
  const { data: consentRecord } = useChannelConsent(
    wantsRecord ? consentOrg : null,
    'sms',
    wantsRecord ? row.phoneE164 : null,
  );

  // The held clause needs the paper itself — which document lapsed, and when.
  // Only a LAPSED row is read; every other row costs no query.
  //
  // BOTH HOLDERS, because the WORD reduces over both (r11 MAJOR-1). The row's
  // paper word is identity_paper_state(studio_contact_id, COALESCE(seat's
  // firm, card's firm)) — R-BA / R-BJ, 00626:919-978, :2169 — so it already
  // speaks for the person's OWN certificates as well as their firm's. Reading
  // the firm's holder id alone left a sole proprietor seated with no firm card
  // printing `Lapsed` with the query disabled and no sentence at all beside
  // it, and a person-held lapse under a firm card naming the firm's paper
  // instead of theirs. PR-h names this row in particular. Same shape r10
  // MAJOR-2 fixed on the picker's mini row.
  const paperNeedsWords = row.paper === 'lapsed' || row.paper === 'lapses_soon';
  const paperHolderIds = useMemo(
    () =>
      paperNeedsWords
        ? [row.companyId, row.personId].filter((id): id is string => !!id)
        : [],
    [paperNeedsWords, row.companyId, row.personId],
  );
  const { data: heldPaper } = useComplianceDocumentsFor(paperHolderIds);
  /** The holder a clause names: the person for their own paper, the firm for
   *  the firm's (r10 MAJOR-2's own resolver, on this surface). */
  const paperHolderName = (doc: StudioComplianceDocument) =>
    doc.holder_id === row.personId ? row.name : (row.companyName ?? row.name);
  // 00630 — the nightly sweep's own record. A paper word says where the
  // certificate stands; a notice says the studio has already been told, and
  // that is the sentence the row prints for paper that has not lapsed yet.
  // One query per sheet: React Query keys it on the studio, not the row.
  const { data: expiryNotices } = useComplianceNotices(
    paperNeedsWords ? (consentOrg ?? null) : null,
  );
  const noticeIndex = useMemo(
    () => indexComplianceNotices(expiryNotices),
    [expiryNotices],
  );
  const blocking = (heldPaper ?? []).find(
    (doc) =>
      doc.blocks.length > 0 &&
      !!doc.expires_on &&
      doc.expires_on < new Date().toISOString().slice(0, 10),
  );
  /**
   * "Northgate Electric's insurance lapses in 30 days, on 6 October 2026."
   *
   * Printed only where the sweep actually wrote a notice, so the clause never
   * claims the studio was told about a date nobody has raised yet.
   */
  const lapsesSoonClause =
    row.paper === 'lapses_soon'
      ? noticedPaperClause(
          [row.companyId, row.personId],
          paperHolderName,
          heldPaper,
          noticeIndex,
          COMPLIANCE_DOC_TYPE_LABELS,
        )
      : null;

  const held = blocking
    ? heldClause(paperHolderName(blocking), {
        // CR8-1: the row's sentence takes the plain noun ("insurance"), never
        // the company card's Type column head ("COI, general liability").
        docLabel: heldClausePaperNoun(
          blocking.doc_type,
          COMPLIANCE_DOC_TYPE_LABELS[
            blocking.doc_type as keyof typeof COMPLIANCE_DOC_TYPE_LABELS
          ] ??
            blocking.doc_label ??
            blocking.doc_type,
        ),
        expiresOn: blocking.expires_on,
        blocks: blocking.blocks,
      })
    : '';

  // PR-t (STAND): the yes-or-no everywhere, the FIGURE only on the desk. "A
  // phone in a hallway is read over a shoulder", and "$2,500" read over a
  // shoulder is the client's money on a stranger's screen. The Call Sheet
  // renders one DocSheet at every width, so both phrases are rendered and CSS
  // chooses (CR-24) — a JS width branch would hydrate wrong on the first paint.
  const grantFacts = authority.map((grant) => ({
    scope: grant.scope,
    threshold_cents: grant.threshold_cents,
    prepares_only: grant.prepares_only,
  }));
  const phrase = authorityPhrase(grantFacts, AUTHORITY_SCOPE_LABELS);
  const phraseWithoutFigure = authorityPhrase(
    grantFacts.map((grant) => ({ ...grant, threshold_cents: null })),
    AUTHORITY_SCOPE_LABELS,
  );

  /**
   * QA-R13-1 — THE JOB THE RECORD NAMES, NOT THE JOB IN HAND (R-Q).
   *
   * One consent record read on two surfaces printed two different origin jobs:
   * the Directory resolved `origin_project_id` and said "Opted out by text,
   * 3 Dec 2025, on the Lindqvist kitchen."; this row substituted ITS OWN
   * project's name and said "…on the Okonkwo residence." for the same row, the
   * same date. A consent carried forward from an earlier job is exactly the
   * population where inventing the place is wrong, and the person card
   * (`reach-access.tsx`) already reads the record's own job. A record that
   * names an origin reads THAT job or none — never the sheet's.
   */
  const { data: projectsForOrigin } = useProjects();
  const originProjectName = useMemo(() => {
    const id = consentRecord?.record?.origin_project_id;
    if (!id) return null;
    const found = (
      (projectsForOrigin ?? []) as Array<{ id: string; name?: string | null }>
    ).find((p) => p.id === id);
    return found?.name ?? null;
  }, [consentRecord?.record?.origin_project_id, projectsForOrigin]);

  const consentLine = consentSentence({
    status: consentRecord?.verdict ?? row.consent,
    source: consentRecord?.record?.source,
    consentedAt: consentRecord?.record?.consented_at,
    optOutSource: consentRecord?.record?.opt_out_source,
    optOutAt: consentRecord?.record?.opt_out_at,
    projectName: consentRecord?.record?.origin_project_id
      ? originProjectName
      : projectName,
  });

  /**
   * CR3-9 — THE RULE OUTRANKS THE GRANT (C7). A recorded grant is not
   * permission when the studio has written down that this person is never
   * texted; the act was live for exactly that pair until now, and there is no
   * server backstop behind it on the rule.
   */
  // QA-R9-1 — and the sentence beside the held act names the rule the studio
  // actually wrote: a do-not-contact block reads as one and carries its route,
  // where one literal used to call every such rule "never text".
  const ruleHoldsText = contactRuleForbidsSms(rule) || ruleBlocks;
  const ruleHeldClause = contactRuleTextHeldClause(rule, routeTo?.name ?? null);
  const canText =
    isSeat && row.consent === 'granted' && !!row.phone && !ruleHoldsText;
  const textHeldSentence =
    ruleHoldsText && ruleHeldClause
      ? `The studio’s rule for ${row.name} ${ruleHeldClause}. Change the rule on their card first.`
      : 'Texting opens once they have said yes on the record and a number is on file.';
  const showFieldActs = isSeat && isFieldPartyKind(row.partyKind ?? '');
  const windowClause = rosterWindowClause(row, band);

  // R-R / C28 — the bid history prints at BOTH widths on a row that has one.
  //
  // r13 MAJOR-1 — resolved against the WHOLE book, archived cards included, so
  // a put-away estimator keeps their name on the face and earns a clause
  // saying where their card went, rather than the clause vanishing over a
  // record that still names them.
  const quotedBy =
    (bidPeople ?? []).find((p) => p.id === bid?.bidQuotedByPersonId) ?? null;
  const bidLine = bidNote({
    askedAt: bid?.bidAskedAt,
    dueAt: bid?.bidDueAt,
    quotedAt: bid?.bidQuotedAt,
    selectedAt: bid?.bidSelectedAt,
    validUntil: bid?.bidValidUntil,
    quotedByName: quotedBy?.name ?? null,
    quotedByArchived: !!quotedBy?.archived,
  });
  /**
   * The picks the editor offers: live cards only, plus the recorded estimator
   * where their card has been put away — a controlled <select> whose value
   * names no <option> renders at `selectedIndex = -1`, which is a blank face
   * over a record that names somebody.
   */
  const bidPeopleOptions = (bidPeople ?? []).filter(
    (p) =>
      !p.archived ||
      p.id === bid?.bidQuotedByPersonId ||
      p.id === bidDraft.quotedBy,
  );
  /**
   * MAJOR-7 — the editor follows the BID, not the band.
   *
   * `selected → awarded` bands by window and `withdrawn → off_job` bands to
   * Done, and no other surface offers these fields — so a mis-picked line in a
   * six-option select was a one-way door: the outcome, the stage, the dates and
   * the estimator could no longer be corrected from anywhere in the portal.
   */
  const hasBid = seatCarriesBid(bid);

  const openBidEditor = () => {
    setBidError(null);
    setBidDraft({
      askedAt: bid?.bidAskedAt ?? '',
      dueAt: bid?.bidDueAt ?? '',
      quotedAt: bid?.bidQuotedAt ?? '',
      selectedAt: bid?.bidSelectedAt ?? '',
      outcome: bid?.bidOutcome ?? '',
      validUntil: bid?.bidValidUntil ?? '',
      quotedBy: bid?.bidQuotedByPersonId ?? '',
    });
    setEditingBid(true);
  };

  /**
   * THE CONSEQUENCE SENTENCE, read off the same answer the write uses
   * (code review r8 BLOCKING-1).
   *
   * `useSetPartyBid` writes `stage` only when the outcome CHANGED and the seat
   * is not already past the bid — so on an ordinary correction (the editor
   * seeds the draft from the seat's existing outcome) and on a declined /
   * no-response answer recorded against a seat that is mobilized, on site,
   * closing out or under warranty, nothing moves. The old single sentence
   * claimed a move on both, and `bidNote` never prints the outcome word, so
   * the studio had no way to read what the press had actually done.
   */
  const bidWrite = bidStageOutcome(
    {
      bidOutcome: bid?.bidOutcome ?? null,
      stage: row.stage ?? null,
      // r21 major-3: the face reads the SAME predicate the write does, so a
      // seat the studio closed by hand is past the bid on both sides and the
      // consequence sentence never promises a band move the write will not
      // make.
      offJobAt: row.offJobAt ?? null,
      offJobReason: row.offJobReason ?? null,
    },
    bidDraft.outcome || null,
  );
  /**
   * THE FOURTH PRESS the select offers — CLEARING a recorded outcome (code
   * review r9 MAJOR-1).
   *
   * "Nothing recorded yet" is the select's first option and `openBidEditor`
   * seeds the draft from the seat's existing outcome, so on a seat that
   * carries one, clearing it is a single click. The write DROPS `bid_outcome`
   * (`useSetPartyBid`'s `!== undefined` guard is true for null) and writes NO
   * stage (`writesStage` needs an outcome), so the seat keeps the band the
   * erased outcome put it in — and r8's sentence beside the press still
   * described recording one. The room has no other writer of that fact, so
   * the sentence names what is being taken away, in the picker's own words,
   * and the band that will not move with it.
   */
  const clearedOutcome =
    !bidWrite.outcome && bidWrite.moved ? (bid?.bidOutcome ?? null) : null;
  const heldStageLabel = getSeatStageLabel(row.stage);
  const bidSentence = !bidWrite.outcome
    ? clearedOutcome
      ? `Clearing the outcome takes ${SEAT_BID_OUTCOME_ACTS[clearedOutcome]} off ${
          row.name
        }’s record. ${
          heldStageLabel
            ? `The seat stays at ${heldStageLabel}.`
            : 'The seat stays where it is.'
        }`
      : 'The outcome is what moves them out of the bidding band. Nothing else on this row does.'
    : bidWrite.stage
      ? `Recording this moves ${row.name} to ${
          SEAT_BID_OUTCOME_LABELS[bidWrite.outcome]
        }. A bidder who did not win never reads as crew.`
      : bidWrite.moved
        ? 'This seat is past the bidding, so its stage stays where it is. Recording this writes what came back, and nothing else.'
        : 'The outcome is unchanged, so nothing moves. This records the dates and who priced it.';

  const saveBid = async () => {
    setBidError(null);
    try {
      await setBid.mutateAsync({
        id: seatId,
        projectId,
        // r7 BLOCKING-1: the seat as it stands, so the hook can tell recording
        // an outcome from correcting a field on a seat whose outcome has not
        // moved. `openBidEditor` seeds the draft from this same outcome, so
        // every ordinary correction re-sends it unchanged.
        previous: {
          bidOutcome: bid?.bidOutcome ?? null,
          stage: row.stage ?? null,
          // r19 major-1: the day this seat already left the job, if one
          // stands. "They withdrew" dates a seat that has no date; it never
          // moves one the studio's own "Close this seat" already wrote.
          offJobAt: row.offJobAt ?? null,
          // r21 major-3 / major-4: and the sentence the studio typed when it
          // closed the seat by hand, which is the one signal that tells a
          // hand-close from a withdrawal. Without it the clearing branch NULLs
          // words nothing else in the room holds a copy of.
          offJobReason: row.offJobReason ?? null,
        },
        patch: {
          bidAskedAt: bidDraft.askedAt || null,
          bidDueAt: bidDraft.dueAt || null,
          bidQuotedAt: bidDraft.quotedAt || null,
          bidSelectedAt: bidDraft.selectedAt || null,
          bidOutcome: bidDraft.outcome || null,
          bidValidUntil: bidDraft.validUntil || null,
          bidQuotedByPersonId: bidDraft.quotedBy || null,
        },
      });
      peopleEvents.bidRecorded({
        outcome: bidDraft.outcome || null,
        fields: [
          bidDraft.askedAt ? 'asked' : null,
          bidDraft.dueAt ? 'due' : null,
          bidDraft.quotedAt ? 'quoted' : null,
          bidDraft.selectedAt ? 'selected' : null,
          bidDraft.outcome ? 'outcome' : null,
          bidDraft.validUntil ? 'valid_until' : null,
          bidDraft.quotedBy ? 'quoted_by' : null,
        ].filter((f): f is string => !!f),
      });
      setEditingBid(false);
      setNote(`The bid is written on ${row.name}\u2019s seat.`);
    } catch (e) {
      // MAJOR-3: the bid editor UPDATEs project_parties, so 00624's and
      // 00631's bare card tokens answer here too. r7 MAJOR-4: into the row's
      // own alert line, never the status announcer.
      setBidError(writeErrorMessage(e, 'Could not write the bid.'));
    }
  };

  // THE MISTAKEN-ADD PREDICATE, read BEFORE the act is offered. A seat that
  // carries a consent record, a bid or paper the studio holds can only be
  // closed; the sentence beside the held act says which fact is in the way.
  const refusal = seatDeleteRefusal({
    hasConsentRecord: !!row.consent && row.consent !== 'not_asked',
    // MAJOR-1: the STAGE list alone missed every seat the bid editor had
    // already moved out of the bidding stages — `selected → awarded`,
    // `withdrawn → off_job`.
    hasBid: BID_STAGES.includes(row.stage ?? '') || hasBid,
    hasComplianceDocument: !!row.paper && row.paper !== 'not_on_file',
  });

  const panelId = `roster-row-${row.key.replace(/[^A-Za-z0-9_-]/g, '')}`;
  const refusalId = `${panelId}-refusal`;

  /**
   * CR-2 — THE DATE THE TOKEN WILL ACTUALLY CARRY, on this door too.
   *
   * `create_field_link` (00627:565,577-584) ignores `p_expires_at` whenever the
   * seat has a live window and dates the token from
   * `max(on_site_to, warranty_until) + 1 day`, falling to ninety days when that
   * day is already past. Naming `row.onSiteTo` alone printed "Ends with the
   * job, 15 October 2025" under a token good to 22 November 2026 — thirteen
   * months in the past, under a live door — and recorded
   * `expiry_source: 'engagement_window'` for a closed window the RPC had
   * already replaced with its ninety-day term. CR3-6's fix reached only the
   * person card; `grantWindowEnd` is now the one derivation both doors read.
   */
  const grantEnd = grantWindowEnd(row.onSiteTo, row.warrantyUntil, new Date());

  const copyLink = async () => {
    setNote(null);
    try {
      const { token } = await createLink.mutateAsync({
        partyId: seatId,
        projectId,
        expiresAt: grantEnd ? `${grantEnd}T23:59:59Z` : undefined,
      });
      const url = fieldLinkUrl(token);
      await navigator.clipboard?.writeText(url);
      peopleEvents.grantMinted({
        tier: 'field_link',
        expiry_source: grantEnd ? 'engagement_window' : 'fallback_90_day',
      });
      setNote(
        `Field link copied — shown once. ${
          grantEnd ? fieldLinkExpirySentence(grantEnd) : MINT_FALLBACK_SENTENCE
        }`,
      );
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Could not open a field link just now.');
    }
  };

  return (
    <li className="border-b border-[var(--color-pearl)] last:border-b-0">
      <div className="flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={panelId}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-[8px] px-1 text-left transition-colors hover:bg-[rgba(196,165,123,0.05)]"
        >
          <Avatar name={row.name} role={row.partyKind ?? 'other'} size={34} />
          <span className="min-w-0 flex-1">
            <span className="block text-[0.88rem] text-[var(--color-charcoal)]">
              {row.name}
            </span>
            <span className={`mt-[0.1rem] flex flex-wrap items-baseline gap-x-1.5 ${META}`}>
              {row.meta && <span>{row.meta}</span>}
              {row.companyName && (
                <span className="normal-case tracking-normal text-[0.68rem] text-[var(--color-aged-oak)]">
                  <span aria-hidden>■</span> {row.companyName}
                </span>
              )}
              {windowClause && (
                <span className="normal-case tracking-normal text-[0.68rem] text-[var(--color-aged-oak)]">
                  {windowClause}
                </span>
              )}
            </span>
            {phrase && (
              <span className="mt-[0.15rem] block">
                <span className="hidden sm:inline">
                  <PlainFact>{phrase}</PlainFact>
                </span>
                <span data-authority-no-figure className="sm:hidden">
                  <PlainFact>{phraseWithoutFigure}</PlainFact>
                </span>
              </span>
            )}
          </span>
        </button>
        <StateWord family="reach" value={row.reach} />
        <StateWord family="stage" value={row.stage} />
        {/* CR-3 — NO INERT BUTTONS (R-AA). `row.personId` is set for every
            CARDED seat of every kind, but the sheet the chevron opens
            (`call-sheet-mount.tsx`) refuses silently for any kind
            `seatProfileRole` excludes — client, client_rep, other and vendor,
            six carded seats on the Okonkwo seed alone, two of them the rows
            SPEC §5.4 #5 names on the Client side band. Each rendered a
            focusable control announced "Open Adaeze Okonkwo" that did nothing,
            and fired `personCardOpened` before the refusal, so the taxonomy
            recorded card opens that never happened. The chevron is printed
            only where there is a door, which is also what moves the analytics
            inside the branch that opens one. */}
        {onOpenSeat && row.personId && row.seatId && seatProfileRole(row.partyKind) && (
          <button
            type="button"
            onClick={() => {
              peopleEvents.personCardOpened({ source: 'roster_row' });
              onOpenSeat(row);
            }}
            aria-label={`Open ${row.name}`}
            className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center text-[0.8rem] text-[var(--color-aged-oak)] transition-colors hover:text-[var(--color-charcoal)]"
          >
            ›
          </button>
        )}
      </div>

      {/* The phone is the row's SIBLING target, never inside its button.
          A do-not-contact rule takes the number off the row (SPEC §5.1 #10,
          §5.4) — the superintendent standing on site must not have the
          forbidden call one tap away. Channels are hidden, never deleted. */}
      {row.phone && !ruleSilencesPhone && (
        <div className="-mt-1 pb-1 pl-[46px]">
          <TelLink phone={row.phone} personName={row.name} />
        </div>
      )}

      {/* R-S — a rule clause prints wherever a rule is shown, folded or not,
          in the SAME wording, from the SAME predicate, with the SAME routed
          channels the Directory row carries (CR-15 / CR-22). */}
      {ruleClause && (
        <div className="pb-1.5 pl-[46px]">
          <ContactRuleLine
            summary={ruleClause}
            blocked={ruleBlocks}
            routeTo={routeTo ?? null}
          />
        </div>
      )}

      {/* PR-h — the held clause, in words, with a terracotta leading rule. */}
      {held && (
        <p
          data-held-clause
          className="mb-1.5 ml-[46px] border-l-2 border-[var(--color-terracotta-ink)] bg-[rgba(196,131,111,0.07)] px-3 py-2 text-[0.74rem] text-[var(--color-charcoal)]"
        >
          {held}
        </p>
      )}

      {/* 00630 — the expiry notice, in the sweep's own wording, before the
          paper actually lapses. No leading rule: nothing is held yet. */}
      {lapsesSoonClause && partyKindOwesPaper(contactKind ?? row.partyKind) && (
        <p
          data-expiry-notice
          className="mb-1.5 ml-[46px] text-[0.74rem] text-[var(--color-charcoal)]"
        >
          {lapsesSoonClause}
        </p>
      )}

      {/* R-R / C28 — the bid history, at both widths, folded or not. */}
      {bidLine && (
        <p
          data-bid-note
          className="mb-1.5 ml-[46px] text-[0.74rem] text-[var(--color-aged-oak)]"
        >
          {bidLine}
        </p>
      )}

      {/* R-T — an opted-out note prints on the COLLAPSED row, not only inside
          its unfold: a sub the studio may not text must be visible at a glance. */}
      {!expanded && row.consent === 'opted_out' && (
        <p
          data-opted-out-note
          className="mb-1.5 ml-[46px] text-[0.74rem] text-[var(--color-charcoal)]"
        >
          {consentLine || 'Opted out of texts.'}
        </p>
      )}

      <div id={panelId} hidden={!expanded}>
        {expanded && (
          <div className="border-t border-[var(--color-pearl)] px-1 pb-3 pt-2.5">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1.5">
              {row.phone && (
                <span className="text-[0.78rem] text-[var(--color-charcoal)]">
                  {row.phone}
                </span>
              )}
              {row.email && (
                <span className="text-[0.78rem] text-[var(--color-charcoal)]">
                  {row.email}
                </span>
              )}
              {!row.phone && !row.email && (
                <span className="text-[0.74rem] text-[var(--color-aged-oak)]">
                  – No phone or email on file.
                </span>
              )}
              <StateWord family="consent" value={row.consent} />
              {/* CR8-5 — a firm the studio never asked paper of owes no paper
                  word anywhere (direction §3.8, R-A, C13/C24). */}
              {partyKindOwesPaper(contactKind ?? row.partyKind) && (
                <StateWord family="paper" value={row.paper} />
              )}
            </div>

            {consentLine && (
              <p
                data-consent-sentence
                className="mt-1.5 text-[0.74rem] text-[var(--color-aged-oak)]"
              >
                {consentLine}
              </p>
            )}

            {/* THE BIDDING BAND'S OWN FACTS (direction §3.4). A price nobody
                has answered is not a body on the site, so the outcome is
                written as a STAGE WORD and a losing bidder leaves the crew
                bands the moment the studio records the answer. */}
            {isSeat && (band === 'bidding' || hasBid) && !closing && (
              <div data-bid-editor className="mt-3 border-t border-[var(--color-pearl)] pt-2.5">
                {!editingBid ? (
                  <button
                    type="button"
                    data-edit-bid={seatId}
                    onClick={openBidEditor}
                    className="da-score-hover inline-flex min-h-11 items-center font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]"
                  >
                    {/* A row that already carries a bid is not being written
                        for the first time — and MAJOR-7 now offers this door on
                        an awarded or off-the-job seat, where "Write the bid"
                        would be the wrong act word. */}
                    {hasBid ? 'Change what came back' : 'Write the bid'}
                  </button>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-x-6 gap-y-2">
                      {/* The three dated events SPEC §5.4 #9 and R-R print.
                          They are a record of what happened, so each is typed
                          on its own and none is derived from the outcome. */}
                      <div>
                        <label
                          className={`mb-1 block ${META}`}
                          htmlFor={`${panelId}-bid-asked`}
                        >
                          The studio asked
                        </label>
                        <input
                          id={`${panelId}-bid-asked`}
                          type="date"
                          value={bidDraft.askedAt}
                          onChange={(e) =>
                            setBidDraft((d) => ({ ...d, askedAt: e.target.value }))
                          }
                          className="min-h-11 border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                        />
                      </div>
                      <div>
                        <label
                          className={`mb-1 block ${META}`}
                          htmlFor={`${panelId}-bid-due`}
                        >
                          The answer was owed
                        </label>
                        <input
                          id={`${panelId}-bid-due`}
                          type="date"
                          value={bidDraft.dueAt}
                          onChange={(e) =>
                            setBidDraft((d) => ({ ...d, dueAt: e.target.value }))
                          }
                          className="min-h-11 border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                        />
                      </div>
                      <div>
                        <label
                          className={`mb-1 block ${META}`}
                          htmlFor={`${panelId}-bid-outcome`}
                        >
                          How it came back
                        </label>
                        <select
                          id={`${panelId}-bid-outcome`}
                          value={bidDraft.outcome}
                          onChange={(e) =>
                            setBidDraft((d) => ({
                              ...d,
                              outcome: e.target.value as SeatBidOutcome | '',
                            }))
                          }
                          className="min-h-11 border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                        >
                          <option value="">Nothing recorded yet</option>
                          {ALL_SEAT_BID_OUTCOMES.map((outcome) => (
                            <option key={outcome} value={outcome}>
                              {SEAT_BID_OUTCOME_ACTS[outcome]}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label
                          className={`mb-1 block ${META}`}
                          htmlFor={`${panelId}-bid-quoted`}
                        >
                          The number came back
                        </label>
                        <input
                          id={`${panelId}-bid-quoted`}
                          type="date"
                          value={bidDraft.quotedAt}
                          onChange={(e) =>
                            setBidDraft((d) => ({ ...d, quotedAt: e.target.value }))
                          }
                          className="min-h-11 border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                        />
                      </div>
                      <div>
                        <label
                          className={`mb-1 block ${META}`}
                          htmlFor={`${panelId}-bid-selected`}
                        >
                          The studio chose them
                        </label>
                        <input
                          id={`${panelId}-bid-selected`}
                          type="date"
                          value={bidDraft.selectedAt}
                          onChange={(e) =>
                            setBidDraft((d) => ({ ...d, selectedAt: e.target.value }))
                          }
                          className="min-h-11 border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                        />
                      </div>
                      <div>
                        <label
                          className={`mb-1 block ${META}`}
                          htmlFor={`${panelId}-bid-holds`}
                        >
                          The number holds until
                        </label>
                        <input
                          id={`${panelId}-bid-holds`}
                          type="date"
                          value={bidDraft.validUntil}
                          onChange={(e) =>
                            setBidDraft((d) => ({ ...d, validUntil: e.target.value }))
                          }
                          className="min-h-11 border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                        />
                      </div>
                      <div>
                        <label
                          className={`mb-1 block ${META}`}
                          htmlFor={`${panelId}-bid-by`}
                        >
                          Who priced it
                        </label>
                        <select
                          id={`${panelId}-bid-by`}
                          value={bidDraft.quotedBy}
                          onChange={(e) =>
                            setBidDraft((d) => ({ ...d, quotedBy: e.target.value }))
                          }
                          className="min-h-11 border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                        >
                          <option value="">Nobody named</option>
                          {bidPeopleOptions.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.archived
                                ? `${person.name} (card put away)`
                                : person.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <p className="mt-2 text-[0.7rem] text-[var(--color-aged-oak)]">
                      {/* MAJOR-3: the sentence names the DESTINATION, so the
                          state map answers it — SEAT_BID_OUTCOME_ACTS are acts
                          ("They declined") and read as "…moves Northgate
                          Electric to they declined." in this frame.

                          r8 BLOCKING-1: and it promises a move only where the
                          write makes one. `bidStageOutcome` is the SAME
                          reckoning `useSetPartyBid` writes from, so the three
                          branches below are the three things the press can
                          actually do: move the seat, record a correction that
                          moves nothing, or record what came back on a seat
                          that is already past the bid. */}
                      {bidSentence}
                    </p>
                    <DocumentActionRow
                      surfaceKey="call-sheet"
                      regionKey="roster-row-bid"
                      className="mt-2"
                      aria-label={`Write the bid for ${row.name}`}
                    >
                      <DocumentAction
                        actionKey="save-bid"
                        variant="primary"
                        onClick={() => void saveBid()}
                        loading={setBid.isPending}
                        loadingLabel="Writing…"
                      >
                        Write the bid
                      </DocumentAction>
                      <DocumentAction
                        actionKey="cancel-bid"
                        variant="tertiary"
                        onClick={() => setEditingBid(false)}
                      >
                        Leave it
                      </DocumentAction>
                    </DocumentActionRow>
                    {bidError && (
                      <p
                        role="alert"
                        data-bid-error
                        className="mt-1.5 text-[0.72rem] text-[var(--color-terracotta-ink)]"
                      >
                        {bidError}
                      </p>
                    )}
                  </>
                )}
              </div>
            )}

            {/* r15 MAJOR-2 — THE SECOND COPY, NAMED. `people/close-seat-act.tsx`
                holds the same act for the person card and is NOT imported here:
                this block keeps the confirm sentence, the reason field, the
                dated write and `peopleEvents.seatClosed` of its own, because
                the Call Sheet also carries the surviving hard delete in this
                act row and announces its refusal through the sheet's
                `role="status"` line. The two are hand-kept in step; a change to
                the wording, the write or the analytics belongs in both files
                until the repoint owed in w3-room-report §10 item 9 is made. */}
            {closing ? (
              <div className="mt-3 border-l-2 border-[var(--color-terracotta-ink)] bg-[rgba(196,131,111,0.07)] px-3 py-2.5">
                <p className="text-[0.74rem] text-[var(--color-charcoal)]">
                  – Close {row.name}&rsquo;s seat? The seat stays on the job with the
                  day it closed, and everything it carries stays with it.
                </p>
                <label
                  className="mt-2 block font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--color-aged-oak)]"
                  htmlFor={`${panelId}-reason`}
                >
                  Why it closed
                </label>
                <input
                  id={`${panelId}-reason`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="min-h-11 w-full border-0 border-b border-[var(--color-pearl)] bg-transparent py-2 text-[0.8rem] text-[var(--color-charcoal)] outline-none focus:border-[var(--color-clay)]"
                />
                <DocumentActionRow
                  surfaceKey="call-sheet"
                  regionKey="roster-row-close-confirm"
                  className="mt-2"
                  aria-label={`Close ${row.name}'s seat`}
                >
                  <DocumentAction
                    actionKey="confirm-close-seat"
                    variant="danger"
                    onClick={() => {
                      setCloseError(null);
                      void closeSeat
                        .mutateAsync({ id: seatId, projectId, reason })
                        .then(() => {
                          peopleEvents.seatClosed({
                            from_stage: row.stage,
                            with_reason: !!reason.trim(),
                          });
                          setClosing(false);
                          setNote(`${row.name}'s seat is closed.`);
                        })
                        .catch((e: unknown) =>
                          // r21 major-2: 00634's two refusals said in words,
                          // in the row's own alert line.
                          setCloseError(
                            writeErrorMessage(e, 'Could not close the seat.'),
                          ),
                        );
                    }}
                    loading={closeSeat.isPending}
                    loadingLabel="Closing…"
                  >
                    Close the seat
                  </DocumentAction>
                  <DocumentAction
                    actionKey="cancel-close-seat"
                    variant="tertiary"
                    onClick={() => setClosing(false)}
                  >
                    Keep it open
                  </DocumentAction>
                  {/* The surviving hard delete: a seat added by mistake that
                      carries nothing. Held, never hidden, so the reason is
                      readable where the act would be. */}
                  <DocumentAction
                    actionKey="remove-mistaken-seat"
                    variant="tertiary"
                    className="ml-auto"
                    disabled={!!refusal}
                    held={!!refusal}
                    aria-describedby={refusal ? refusalId : undefined}
                    onHeldActivate={() =>
                      setNote(refusal ? SEAT_DELETE_REFUSAL_SENTENCES[refusal] : null)
                    }
                    onClick={() =>
                      void removeParty
                        .mutateAsync({ id: seatId, projectId })
                        .then(() => {
                          peopleEvents.seatClosed({
                            from_stage: row.stage,
                            with_reason: false,
                            hard_deleted: true,
                          });
                        })
                        .catch((e: unknown) =>
                          setNote(
                            e instanceof Error ? e.message : 'Could not take it back.',
                          ),
                        )
                    }
                  >
                    Added by mistake
                  </DocumentAction>
                </DocumentActionRow>
                {refusal && (
                  <p id={refusalId} className="mt-1.5 text-[0.72rem] text-[var(--color-aged-oak)]">
                    {SEAT_DELETE_REFUSAL_SENTENCES[refusal]}
                  </p>
                )}
                {closeError && (
                  <p
                    role="alert"
                    data-close-seat-error
                    className="mt-1.5 text-[0.72rem] text-[var(--color-terracotta-ink)]"
                  >
                    {closeError}
                  </p>
                )}
              </div>
            ) : (
              <DocumentActionRow
                surfaceKey="call-sheet"
                regionKey="roster-row"
                className="mt-3"
                aria-label={`Actions for ${row.name}`}
              >
                {showFieldActs && (
                  <DocumentAction
                    actionKey="text-party"
                    variant="primary"
                    onClick={() => setComposing((c) => !c)}
                    disabled={!canText}
                    held={!canText}
                    aria-describedby={!canText ? `${panelId}-text-held` : undefined}
                    onHeldActivate={() => setNote(textHeldSentence)}
                  >
                    Text
                  </DocumentAction>
                )}
                {showFieldActs && (
                  <DocumentAction
                    actionKey="copy-field-link"
                    variant="secondary"
                    onClick={() => void copyLink()}
                    loading={createLink.isPending}
                    loadingLabel="Opening…"
                  >
                    Copy field link
                  </DocumentAction>
                )}
                {isSeat && (
                  <button
                    type="button"
                    onClick={() =>
                      void updateParty.mutateAsync({
                        id: seatId,
                        projectId,
                        patch: { showToClient: !row.showToClient },
                      })
                    }
                    aria-pressed={!!row.showToClient}
                    className={`da-score-hover inline-flex min-h-11 items-center font-mono text-[12px] uppercase tracking-[0.1em] transition-colors ${
                      row.showToClient
                        ? 'da-score-on text-[var(--color-charcoal)]'
                        : 'text-[var(--color-aged-oak)] hover:text-[var(--color-mocha)]'
                    }`}
                  >
                    Show to client
                  </button>
                )}
                {isSeat && (
                  <DocumentAction
                    actionKey="close-seat"
                    variant="danger"
                    onClick={() => {
                      // r20 major-1 — the field opens on the record, never
                      // empty, so a correction restates the sentence rather
                      // than blanking it.
                      setReason(row.offJobReason ?? '');
                      setClosing(true);
                    }}
                    disabled={closeHeld}
                    held={closeHeld}
                    aria-describedby={
                      closeHeld ? `${panelId}-close-held` : undefined
                    }
                    onHeldActivate={() => setNote(closeHeldSentence)}
                    className="ml-auto"
                  >
                    Close this seat
                  </DocumentAction>
                )}
              </DocumentActionRow>
            )}

            {/* r20 major-1 — a held act carries a VISIBLE reason (direction
                §5.5, SPEC §7 #4), the way the Text act two regions up does.
                r21 major-2 — and the second reason it is held is PR-n: a seat
                that signs for money is the principal's to close. */}
            {closeHeld && (
              <p
                id={`${panelId}-close-held`}
                className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
              >
                {closeHeldSentence}
              </p>
            )}

            {/* CR-7: direction §5.5 and SPEC §7 #4 ask a gated act for
                `aria-disabled` + `aria-describedby` + a VISIBLE consequence
                sentence. This one was `sr-only` — position:absolute,
                clip-path:inset(50%) — so a sighted designer saw a dead Text
                button with nothing beside it, while SPEC §5.4's own string
                list names the sentence as a FACE string. Printed the way the
                Send act three regions down prints its own. */}
            {!canText && showFieldActs && (
              <p
                id={`${panelId}-text-held`}
                className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
              >
                {textHeldSentence}
              </p>
            )}

            {composing && canText && (
              <div className="mt-2.5">
                <textarea
                  rows={2}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  aria-label={`Send a text to ${row.name}`}
                  className="w-full resize-none rounded-[7px] border border-[var(--color-pearl)] bg-white px-3 py-2 text-[0.8rem] text-[var(--color-charcoal)] focus:border-[var(--color-clay)] focus:outline-none"
                />
                <DocumentActionRow
                  surfaceKey="call-sheet"
                  regionKey="roster-row-composer"
                  className="mt-1.5"
                  aria-label="Send a text"
                >
                  <DocumentAction
                    actionKey="send-roster-text"
                    variant="primary"
                    onClick={() =>
                      void sendSms
                        .mutateAsync({ partyId: seatId, body })
                        .then(() => {
                          setBody('');
                          setComposing(false);
                          setNote('Sent.');
                        })
                        .catch((e: unknown) =>
                          setNote(e instanceof Error ? e.message : 'Send failed.'),
                        )
                    }
                    held={!body.trim()}
                    disabled={!body.trim() || sendSms.isPending}
                    aria-describedby={
                      !body.trim() ? `${panelId}-send-held` : undefined
                    }
                    loading={sendSms.isPending}
                    loadingLabel="Sending…"
                  >
                    Send
                  </DocumentAction>
                </DocumentActionRow>
                {/* Direction §5.5: a gated act is `aria-disabled` with a
                    VISIBLE consequence sentence beside it — never `disabled`.
                    The party sheet's identical Send act already reads this
                    way; this one was a regression against the sheet beside
                    it (CR-26). */}
                {!body.trim() && (
                  <p
                    id={`${panelId}-send-held`}
                    className="mt-1 text-[0.7rem] text-[var(--color-aged-oak)]"
                  >
                    Write the message first — a text with no words is not a text.
                  </p>
                )}
              </div>
            )}

            {note && (
              <p
                data-roster-row-note
                className="mt-2 break-all border-l-2 border-[var(--color-sage)] bg-[rgba(133,148,124,0.07)] px-3 py-2 text-[0.7rem] text-[var(--color-charcoal)]"
              >
                {note}
              </p>
            )}
          </div>
        )}
      </div>
    </li>
  );
}
