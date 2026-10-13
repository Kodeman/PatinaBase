/**
 * The Desk roster — every live job, grouped by stage (direction-b §2.1, M1).
 *
 * Pure and dependency-light for the same reason desk-derivation.ts is: the
 * Desk suites must not drag @patina/help-system through an import chain.
 *
 * The population is `live`, not `folders` + `chips`. Those are the two DERIVED
 * populations — a job with neither a need nor a motion is in neither, and
 * `chips` is truncated at MAX_MOTION_CHIPS — so a roster built from them would
 * print fewer jobs than its own "n live" header claims.
 */

import {
  deriveNeeds,
  deskActionLabel,
  deskMotion,
  deskNeedText,
  firstName,
  folderTab,
  type DeskFolder,
  type DocumentStateRow,
  type MotionChip,
  type MotionKind,
  type NeedKind,
  type NeedLine,
  type SectionKey,
} from './desk-derivation';
import { STAGE_WORD, ownAct, type OwnActFacts } from './act-names';
import type {
  DaySheet,
  DaySheetSetAside,
  DaySheetWaiting,
  DeskStanding,
  SheetCard,
  SheetEntry,
  SheetSettled,
} from './day-sheet';
import { clientOf, deskJobName } from './desk-job-name';
import { dayMonth, legalDate, parseSourceDate } from './dates';
import { voiceFirstName } from './document-guide';
import { classOfNeed, deskLeadNeed } from './need-class';
import { rankByNext } from './desk-need-list';
import {
  custodyFor,
  deskDesignersOf,
  isMyJob,
  type DeskHolder,
  type DeskLeads,
  type DeskScope,
} from './desk-scope';
import {
  deriveOverdue,
  overdueElapsedPhrase,
  NOT_OVERDUE,
  type OverdueCondition,
} from './overdue-condition';

/** The paper's own section order (section-derivation.ts's ORDER). */
export const ROSTER_STAGE_ORDER: readonly SectionKey[] = [
  'brief',
  'discovery',
  'direction',
  'proposal',
  'project',
  'install',
  'care',
];

/** Stored sentence-case; the roster's CSS uppercases. */
const STAGE_LABEL: Record<SectionKey, string> = {
  brief: 'Inquiry brief',
  discovery: 'Client discovery',
  direction: 'Concept development',
  proposal: 'Design proposal',
  project: 'Project delivery',
  install: 'Installation',
  care: 'Project aftercare',
};

/**
 * The needs that stand in the red letter's own ink — the ones whose stamp is
 * terracotta at derivation (`red-letter-zone.tsx`'s NEED_KIND_STAMP_COLOR).
 * Every OTHER need is the quiet tier the setup chore already sits in and takes
 * dusty blue, which is SP-20's whole device: those two must never look alike.
 *
 * Two tones and no third (C4/D8): the mark tells one register from the other,
 * and never grows a count, a label, or a further urgency tier.
 */
const URGENT_NEED_KINDS: ReadonlySet<NeedKind> = new Set([
  'overdue_decision',
  'overdue_invoice',
  'claim_window',
  'damage_claim',
  'proposal_declined',
  'proposal_expired',
  'schedule_conflict',
]);

const QUIET_STATE = 'No current alert';

/** `deriveDocumentGuide`'s rung 2 says "This project is paused" on the paper;
 *  the roster line says the same thing in its own register. */
const PAUSED_STATE = 'On hold';

export const OPEN_THE_JOB = 'Open project file';

/** `urgent` is terracotta, `quiet` is dusty blue; a job carrying no need at
 *  all wears no mark. §2.1: "Needs are a red-letter mark on the job's line". */
export type RosterMark = 'urgent' | 'quiet' | null;

export interface RosterAct {
  label: string;
  href: string;
  /** Structural, like NeedLine.ledger — the roster maps it onto openLedger(). */
  ledger?: {
    name: string;
    context?: { page?: string; invoiceId?: string; projectId?: string };
  };
}

export interface RosterLine {
  engagementId: string;
  /** Playfair. */
  name: string;
  /** The job's own stage. Carried on the line, not only on its group, because
   *  the By person facet regroups the same lines away from their stage and the
   *  row's wash still belongs to the stage the job is in. */
  stage: SectionKey;
  /** `document_state.designer_id` — a `profiles.id`, which is the same id
   *  `organization_members.user_id` holds. Null = nobody is assigned. */
  designerId: string | null;
  /** Inter — the client and the state, in one run (M1 draws a place; the row
   *  carries no location column, so the name stands in its position). */
  state: string;
  /** The line under the name: the client and the phase, and nothing else.
   *  `state` carries the body text too, which the ledger's sentence cell and
   *  the card's register 5 already print — printing it twice is what put
   *  "nothing needs your hand" directly above "Nothing needs your hand.".
   *  The client is dropped where it IS the job's name (a lead titled after the
   *  person). Empty where the job has neither a nameable client nor a phase,
   *  and the line is then not written at all. */
  personLine: string;
  /** Inter, red — the dated overdue phrase and what is overdue. */
  overdueText: string | null;
  mark: RosterMark;
  needKind: NeedKind | null;
  /** The head need's key — the same key the Day Sheet and the band read. */
  needKey?: string | null;
  overdue: OverdueCondition;
  /** Opening the job is act one — the line's own name carries this. */
  jobHref: string;
  act: RosterAct;
  /** The project this job stands on, where it has one. The day's line joins
   *  `project_notes` on it; a lead has none. */
  projectId?: string | null;
  /** The client's own name, unconcatenated — `state` joins it with the phase
   *  and the need, and the day's line needs it standing alone. Null wherever
   *  `clientOf` refuses a placeholder. */
  client?: string | null;
  /** The need's own date, where the rule stated one (NeedLine.dueOn). */
  dueOn?: string | null;
  /** The need's own sentence, unconcatenated (NeedLine.text). */
  needText?: string | null;
  /** D6 — the custody word. Always written. */
  custody: string;
  /** The need's own owner (D6 custody). Null where there is no need. */
  needOwner: 'designer' | 'client' | 'maker' | null;
  /** N1 — when the event behind the need happened (NeedLine.at), so the
   *  claim cards rank an undated need by age, as the band does. */
  needAt?: string | null;
  /** D8 — the ledger's value column, in the house's year-aware idiom
   *  (`12 August`, or `12 August 2025` once the year is not this one —
   *  dates.ts's rule): the need's own date where the line has a need, else
   *  the in-motion state's anchor date. Null where neither states one, and
   *  the cell renders empty. */
  valueText?: string | null;
  /** The in-motion chip's own sentence, unconcatenated (MotionChip.text). */
  motionText?: string | null;
  /** Fix-now 6 — on a job with no need while some feed went unread, the
   *  honest sentence in place of the at-rest one: `Not checked: invoices.` */
  notChecked?: string | null;
}

export interface RosterGroup {
  key: SectionKey;
  label: string;
  count: number;
  lines: RosterLine[];
}

export interface DeskRoster {
  groups: RosterGroup[];
  liveCount: number;
  overdueCount: number;
  /** `Studio workload · 6 live · 2 overdue` */
  heading: string;
  /** The one Inter line naming what is overdue. */
  overdueLine: string;
  /** Fix-now 6 — the feeds this read could not answer (DeskData.unreadFeeds). */
  unreadFeeds: string[];
  /** `Not checked: invoices, deliveries.` while any feed went unread; null when
   *  every feed answered — the only state that may print the at-rest line. */
  notChecked: string | null;
}

export interface DeskRosterInput {
  folders: readonly DeskFolder[];
  chips: readonly MotionChip[];
  live: readonly DocumentStateRow[];
  /** US-19 FR2 F2-2 — `one-voice`, read by the 'use client' caller. On, the
   *  roster prints each act by its one name (`deskActionLabel`), a held date
   *  request's own sentence (`deskNeedText`) and no `Band` chip
   *  (`deskMotion`). Off or absent, today's strings. */
  oneVoice?: boolean;
  /** Fix-now 6 — the modelled feeds the read could not answer. Absent = every
   *  feed answered. */
  unreadFeeds?: readonly string[];
  /** N4 — defaults to the whole studio until the Day Sheet chooses a scope. */
  scope?: DeskScope;
  leads?: DeskLeads;
  meUserId?: string | null;
}

/** Fix-now 6 — the custody word on a quiet job while a feed went unread. */
const CUSTODY_NOT_CHECKED = 'Not checked';

function prettyPhase(phase: string | null): string | null {
  if (!phase) return null;
  return phase
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}


const CUSTODY_YOUR_PEN = 'Action with you';
const CUSTODY_AT_REST = 'No current alert';

/** D6 — whose hand the job is in, named from the current lead; once the
 *  studio acted, who it waits on (US-28 change 5: the need's owner is the
 *  sentence's subject only). */
export function custodyWord(
  need: NeedLine | null,
  row: DocumentStateRow,
  leads: DeskLeads = new Map(),
  meUserId?: string | null,
  awaiting?: string | null,
): string {
  return custodyFor(need, leads, meUserId, row.project_id ?? row.engagement_id, awaiting);
}

/**
 * The jobs holding her pen, as project ids: the teaching note's ranking input
 * (return-teaching §2, finding 19). Roster order, each id once; a line with no
 * project (a lead) has nothing to pin.
 */
export function pinnedProjectIdsFromRoster(lines: readonly RosterLine[]): string[] {
  const ids: string[] = [];
  for (const line of lines) {
    if (line.custody === CUSTODY_YOUR_PEN && line.projectId && !ids.includes(line.projectId)) {
      ids.push(line.projectId);
    }
  }
  return ids;
}

/**
 * D8 — the date an in-motion state is anchored to, for the ledger's value
 * column.
 *
 * Only three of the kinds `deriveMotion` returns have a date on
 * `document_state`; the other nine state a position, not a moment, and their
 * cell stays empty rather than borrowing `updated_at`, which is a feed stamp
 * and not a fact about the job.
 *
 * `with_client` reads `proposal_sent_at` ONLY (never
 * `proposal_last_opened_at`) — the chip's own prose already reads "With
 * client since <sent date>", and this column must print the same date the
 * sentence names.
 */
export function motionAnchorDate(chip: MotionChip | null): string | null {
  if (!chip) return null;
  const row = chip.row;
  switch (chip.kind) {
    case 'with_client':
      return row.proposal_sent_at ?? null;
    case 'sent_unopened':
      return row.proposal_sent_at ?? null;
    case 'drafting':
      return row.proposal_updated_at ?? row.updated_at ?? null;
    default:
      return null;
  }
}

/**
 * D8 / dates.ts's house rule — the ledger's value column spells the year out
 * only when it is not this year: `today.getFullYear() !== date.getFullYear()
 * ? legalDate(date) : dayMonth(date)`. Composed here rather than in
 * `motionAnchorDate`, which stays a plain date-string lookup with an honest
 * signature; this is the one place that also holds `now`.
 */
function ledgerValueDate(value: string | null, now: Date): string | null {
  const date = parseSourceDate(value);
  if (!date) return null;
  return now.getFullYear() !== date.getFullYear() ? legalDate(date) : dayMonth(date);
}

const NUMBER_WORDS = [
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

function numberWord(count: number): string {
  return count < NUMBER_WORDS.length ? NUMBER_WORDS[count] : String(count);
}

function capitalize(text: string): string {
  return text.length ? text[0].toUpperCase() + text.slice(1) : text;
}

function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function overdueSentence(names: readonly string[]): string {
  if (names.length === 0) return 'Nothing is overdue.';
  const subject =
    names.length === 1
      ? 'One thing is overdue'
      : `${capitalize(numberWord(names.length))} things are overdue`;
  const named =
    names.length <= 3
      ? joinNames(names)
      : `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
  return `${subject} — ${named}.`;
}

/** Oldest-first ordering key. An unparseable or absent date sorts last rather
 *  than claiming the front of its group. */
function anchorTime(value: string | null | undefined): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(
    /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value,
  );
  return Number.isNaN(parsed) ? Number.POSITIVE_INFINITY : parsed;
}

interface RosterEntry {
  line: RosterLine;
  stage: SectionKey;
  tab: string;
  /** 0 = red-letter, 1 = everything else. */
  tier: number;
  at: number;
}

/** What `ownAct` reads where the Desk names a stage's own act: the Desk holds
 *  no stage facts beyond the row, so only the one fact each case sets. */
const NO_OWN_ACT_FACTS: OwnActFacts = {
  inquiryOpen: false,
  firstMissingEssential: null,
  proposalState: null,
  clientFirstName: null,
  unspecifiedCount: 0,
  releaseEligible: false,
  install: null,
};

/**
 * US-19 FR4 Fix 5 (`one-voice`) — the card's act is the paper's own act where
 * the need and the paper name the same moment: a Brief card with an open
 * inquiry prints `Respond to the inquiry`, a hesitating proposal — sent and
 * not yet opened, or opened and unsigned (FR5 531-1: the paper maps `viewed`
 * to `sent`) — prints `Nudge {first}` / `Nudge the client`. Every other need
 * keeps `deskActionLabel`. The Desk reads only the row it already has (ruling
 * 521 (b)); feeding the band's facts to the card is the deferred end state.
 * FR7 F7-3 — the row does carry whether Message can reach her: with no client
 * login the card prints `Send a reminder`, as the band does. The reminder's
 * cooldown it cannot see (521 (b)), so the card keeps that act through it.
 */
function voicedActLabel(need: NeedLine, row: DocumentStateRow): string | null {
  const clientFirstName = voiceFirstName(row.client_name);
  if (need.kind === 'new_lead') {
    return ownAct('brief', { ...NO_OWN_ACT_FACTS, inquiryOpen: true })?.label ?? null;
  }
  if (
    need.kind === 'hesitating_proposal' &&
    (row.proposal_status === 'sent' || row.proposal_status === 'viewed')
  ) {
    return (
      ownAct('proposal', {
        ...NO_OWN_ACT_FACTS,
        proposalState: 'sent',
        clientFirstName,
        clientMessageable: Boolean(row.client_profile_id),
      })?.label ?? null
    );
  }
  return deskActionLabel(need, true, clientFirstName);
}

/**
 * US-19 FR6 F6-1 (D1-d) — the Desk card's reason line for a sent proposal,
 * verbatim (531-1's `Opened {day} — no signature yet` family), so the band
 * that prints it beside `Nudge {first}` and the card say one thing. Null where
 * the card prints none: not sent, or still inside the hesitation threshold.
 */
export function sentProposalReasonLine(
  row: DocumentStateRow,
  now: Date,
): string | null {
  if (row.proposal_status !== 'sent' && row.proposal_status !== 'viewed') return null;
  const need = deriveNeeds(row, now).find((n) => n.kind === 'hesitating_proposal');
  return need ? deskNeedText(need, true) : null;
}

/**
 * US-19 FR7 F7-2 — a sent proposal's standing fact, printed on line 2 with no
 * act inside the hesitation threshold: the reason line's first clause with
 * its judgment left off (`Sent 3 October.`, `Opened 7 October.`), in V9's one
 * date style, never a day counter. `Opened` reads the last open, as the
 * reason line does. Null where the paper is not out with her, or the day
 * cannot be read.
 */
export function sentProposalStandingLine(row: DocumentStateRow): string | null {
  if (row.proposal_status === 'sent') {
    const day = dayMonth(row.proposal_sent_at);
    return day ? `Sent ${day}.` : null;
  }
  if (row.proposal_status === 'viewed') {
    const day = dayMonth(row.proposal_last_opened_at ?? row.proposal_viewed_at);
    return day ? `Opened ${day}.` : null;
  }
  return null;
}

/**
 * US-19 FR8 F8-4 — line 2 beside `Countersign agreement` while the client has
 * signed: `Signed by Mei.`, or `Signed by the client.` with no usable name.
 */
export function sentProposalSignedLine(clientFirstName: string | null): string {
  return `Signed by ${clientFirstName?.trim() || 'the client'}.`;
}

export function deriveDeskRoster(
  input: DeskRosterInput,
  now: Date,
  scope: DeskScope = input.scope ?? 'studio',
  leads: DeskLeads = input.leads ?? new Map(),
  meUserId: string | null | undefined = input.meUserId,
): DeskRoster {
  const designers = deskDesignersOf(input.live);
  const rosterLive = scope === 'mine'
    ? input.live.filter((row) =>
        isMyJob(row.project_id ?? row.engagement_id, leads, meUserId, designers),
      )
    : input.live;
  const folderByEngagement = new Map(
    input.folders.map((folder) => [folder.row.engagement_id, folder]),
  );
  const chipByEngagement = new Map(
    input.chips.map((chip) => [chip.row.engagement_id, chip]),
  );

  const voice = input.oneVoice === true;
  const unreadFeeds = [...(input.unreadFeeds ?? [])];
  const notChecked = notCheckedOf(unreadFeeds);
  const ctx: LineContext = { voice, now, notChecked, leads, meUserId };
  const entries: RosterEntry[] = rosterLive.map((row) => {
    const folder = folderByEngagement.get(row.engagement_id) ?? null;
    const chip = deskMotion(chipByEngagement.get(row.engagement_id) ?? null, voice);
    return rosterEntryOn(row, folderHeadNeed(folder, voice, now), chip, ctx);
  });

  const groups: RosterGroup[] = [];

  for (const stage of ROSTER_STAGE_ORDER) {
    const inStage = entries
      .filter((entry) => entry.stage === stage)
      .sort(
        (a, b) =>
          a.tier - b.tier ||
          a.at - b.at ||
          a.line.engagementId.localeCompare(b.line.engagementId),
      );
    if (inStage.length === 0) continue;
    groups.push({
      key: stage,
      label: STAGE_LABEL[stage],
      count: inStage.length,
      lines: inStage.map((entry) => entry.line),
    });
  }

  // The sentence names what is overdue in PRESSURE order — oldest promise
  // first, across the whole roster — not in the order the stage groups happen
  // to be walked, which put a proposal ahead of a project purely because the
  // paper prints proposals first.
  const overdueNames = entries
    .filter((entry) => entry.tier === 0)
    .sort((a, b) => a.at - b.at || a.tab.localeCompare(b.tab))
    .map((entry) => entry.tab);

  // Counted off the GROUPS, never off `entries`: a row whose `active_section`
  // fell outside `ROSTER_STAGE_ORDER` would otherwise be counted in the header
  // and printed under no heading — the header claiming more jobs than the
  // roster shows is the exact drift this module's independence risks.
  const liveCount = groups.reduce((total, group) => total + group.count, 0);
  return {
    groups,
    liveCount,
    overdueCount: overdueNames.length,
    heading: `Studio workload · ${liveCount} live · ${overdueNames.length} overdue`,
    overdueLine: overdueSentence(overdueNames),
    unreadFeeds,
    notChecked,
  };
}

/** Fix-now 6: "at rest" is a claim about every feed, so it is sayable only
 *  when every feed answered; otherwise the quiet line names what went unread. */
function notCheckedOf(unreadFeeds: readonly string[]): string | null {
  return unreadFeeds.length > 0 ? `Not checked: ${unreadFeeds.join(', ')}.` : null;
}

/** What a roster line reads besides its row, its need and its motion. */
interface LineContext {
  voice: boolean;
  now: Date;
  notChecked: string | null;
  leads: DeskLeads;
  meUserId: string | null | undefined;
}

/**
 * The need a folder's line leads with. FR3 F3-4 (`one-voice`) — the band's
 * Next, so a setup row never outranks a need that blocks money or needs her.
 * FR4 ruling 521 (b) — setup never leads a card at all: a folder whose only
 * needs are setup (D2/D10 class 3) prints at rest with `Open the job`.
 */
function folderHeadNeed(folder: DeskFolder | null, voice: boolean, now: Date): NeedLine | null {
  if (!folder) return null;
  if (!voice) return folder.need;
  return (
    deskLeadNeed(
      (folder.needs ?? [folder.need]).filter((n) => classOfNeed(n.kind) !== 3),
      now,
    ) ?? null
  );
}

/** One job's line, read on the need it leads with. `awaiting` names who the
 *  studio waits on once it acted (US-28 change 5). */
function rosterEntryOn(
  row: DocumentStateRow,
  need: NeedLine | null,
  chip: MotionChip | null,
  ctx: LineContext,
  awaiting?: string | null,
): RosterEntry {
  const { voice, now, notChecked, leads, meUserId } = ctx;
  const needText = need ? deskNeedText(need, voice) : null;
  const actionLabel = need
    ? voice
      ? voicedActLabel(need, row)
      : deskActionLabel(need, false)
    : null;
  const overdue = need ? deriveOverdue(need.dueOn, now) : NOT_OVERDUE;
  // EVERY need is a mark (§2.1). A need with no due date is still a need —
  // a damage claim, a flagged line, a PO nobody answered — and leaving those
  // unmarked printed a roster where a studio's whole open workload was
  // invisible at the margin.
  const mark: RosterMark = !need
    ? null
    : overdue.isOverdue || URGENT_NEED_KINDS.has(need.kind)
      ? 'urgent'
      : 'quiet';

  // A paused job says so. `deriveNeeds` returns nothing for one, so without
  // this it read `quiet · nothing needs your hand` — the same sentence a job
  // in motion prints, while the document's own guide says it is paused.
  const body = row.is_paused
    ? PAUSED_STATE
    : overdue.isOverdue
      ? null
      : (needText ?? chip?.text ?? (notChecked ? notChecked.toLowerCase().replace(/\.$/, '') : QUIET_STATE));
  const lineNotChecked = !need && !row.is_paused ? notChecked : null;
  // FR3 F3-12 (`one-voice`) — a workflow word never prints as the card's
  // stage word: where the phase printed (`Installation`), the stage's own
  // word does (`Install`). Label only; a phase-less card stays phase-less.
  const phaseWord =
    voice && row.current_phase
      ? STAGE_WORD[row.active_section]
      : prettyPhase(row.current_phase);
  const client = clientOf(row, voice);
  const state = [client, phaseWord, body]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  // F7 — a lead's name IS its person, so the person line never repeats it.
  const name = deskJobName(row);
  const sameAsName =
    !!client && client.trim().toLowerCase() === name.trim().toLowerCase();
  const personLine = [sameAsName ? null : client, phaseWord]
    .filter((part): part is string => Boolean(part))
    .join(' · ');

  const jobHref = `/doc/${row.engagement_id}`;
  const act: RosterAct =
    need && actionLabel != null
      ? {
          label: actionLabel,
          href: need.deepLink ?? jobHref,
          ...(need.ledger ? { ledger: need.ledger } : {}),
        }
      : { label: OPEN_THE_JOB, href: chip?.href ?? jobHref };

  return {
    line: {
      engagementId: row.engagement_id,
      name,
      stage: row.active_section,
      designerId: row.designer_id,
      state,
      personLine,
      overdueText:
        overdue.isOverdue && need
          ? `Overdue ${overdueElapsedPhrase(overdue)} — ${needText}`
          : null,
      mark,
      needKind: need?.kind ?? null,
      needKey: need?.key ?? null,
      overdue,
      jobHref,
      act,
      projectId: row.project_id ?? null,
      client,
      dueOn: need?.dueOn ?? null,
      needText,
      custody: lineNotChecked
        ? CUSTODY_NOT_CHECKED
        : custodyWord(need, row, leads, meUserId, awaiting),
      needOwner: need?.owner ?? null,
      needAt: need?.at ?? null,
      // The need's own date first — a deadline outranks a provenance stamp.
      valueText:
        ledgerValueDate(need?.dueOn ?? null, now) ??
        ledgerValueDate(motionAnchorDate(chip), now),
      motionText: chip?.text ?? null,
      notChecked: lineNotChecked,
    },
    stage: row.active_section,
    tab: folderTab(row),
    tier: overdue.isOverdue ? 0 : 1,
    // ONE clock per tier. An overdue job is ordered by the promise it broke;
    // every other job by when it was last touched. Mixing the two compared a
    // future due date against a past timestamp, so a job with a real need due
    // in December sorted behind a quiet one last touched in August.
    at: overdue.isOverdue
      ? anchorTime(need?.dueOn)
      : anchorTime(row.updated_at),
  };
}


/** A note this studio's client answered — `project_notes.answered_at`
 *  (00565). Read only by `use-answered-notes.ts`, whose Desk consumer (the
 *  day's line) the Day Sheet retired; continuation decides its fate. */
export interface AnsweredClientNote {
  projectId: string;
  answeredAt: string;
}

/** "Replied last night" is only true inside a day. */
export const ANSWERED_NOTE_WINDOW_MS = 86_400_000;

/* ── The claims split (D5, D3, D8) ──────────────────────────────────────────
 *
 * R143: one line per job in the at-rest ledger; a job with a claim on the
 * studio's hand takes a Claim card. The predicate is the mark the roster
 * already draws — `mark !== null`, every job carrying a need — so the split
 * reads the same fact the margin does rather than deriving a second one.
 * ─────────────────────────────────────────────────────────────────────────── */

export interface ClaimCard {
  line: RosterLine;
  stage: SectionKey;
  stageLabel: string;
  custody: string;
}

export interface DeskClaimsInput {
  roster: DeskRoster;
  now: Date;
}

/** US-25 slice 4 — the line roster's three groups, in this order. */
export type CustodyGroupKey = 'owed' | 'waiting' | 'rest';

export interface CustodyGroup {
  key: CustodyGroupKey;
  label: string;
  lines: RosterLine[];
}

export interface DeskClaims {
  cards: ClaimCard[];
  ledger: RosterGroup[];
  heading: string;
  restHeading: string;
  /** Owed by you · Waiting on others · at rest — empty groups dropped. */
  groups: CustodyGroup[];
}

function restHeadingFor(count: number, notChecked: boolean): string {
  if (count === 0) return '';
  return `${notChecked ? CUSTODY_NOT_CHECKED : CUSTODY_AT_REST} · ${count} ${count === 1 ? 'job' : 'jobs'}`;
}

/** The ranked claims split by whose hand the head need is in; the at-rest
 *  half keeps its stage order and takes the honest word (fix-now 6).
 *  @deprecated US-28 — `deriveDeskLedger` replaces it; it leaves with
 *  `deriveDeskClaims` once `DeskRoster` takes `{ ledger }` (S3). */
function custodyGroups(
  cards: readonly ClaimCard[],
  ledger: readonly RosterGroup[],
  notChecked: boolean,
): CustodyGroup[] {
  const groups: CustodyGroup[] = [
    {
      key: 'owed',
      label: 'Owed by you',
      lines: cards.filter((c) => c.line.needOwner === 'designer').map((c) => c.line),
    },
    {
      key: 'waiting',
      label: 'Waiting on others',
      lines: cards.filter((c) => c.line.needOwner !== 'designer').map((c) => c.line),
    },
    {
      key: 'rest',
      label: notChecked ? CUSTODY_NOT_CHECKED : CUSTODY_AT_REST,
      lines: ledger.flatMap((group) => group.lines),
    },
  ];
  return groups.filter((group) => group.lines.length > 0);
}

/** N6 — leads stand in the order they wrote in: the lead cards trade places
 *  among their own slots by arrival, so every other card keeps its place. */
function leadsByArrival(cards: ClaimCard[]): ClaimCard[] {
  const slots = cards.flatMap((card, i) => (card.line.needKind === 'new_lead' ? [i] : []));
  const arrival = (card: ClaimCard) =>
    card.line.needAt ? new Date(card.line.needAt).getTime() : Number.POSITIVE_INFINITY;
  const leads = slots.map((i) => cards[i]).sort((a, b) => arrival(a) - arrival(b));
  const out = [...cards];
  slots.forEach((slot, n) => {
    out[slot] = leads[n];
  });
  return out;
}

/**
 * D5 · D3 · D8 — the Desk in two halves.
 *
 * Takes the roster `deriveDeskRoster` already built rather than rebuilding it,
 * so the head's counts, the stage grouping and every line's own derivation are
 * one computation with one source of truth. The card half is RE-ORDERED (D3:
 * rank, with the reason printed on the card); the ledger half keeps the
 * stage-first order it shipped with, because a ledger has headings to skip and
 * a grid does not.
 *
 * @deprecated US-28 — retired for `deriveDeskLedger`. Its one caller
 * (`components/document/desk-roster.tsx`) moves to `{ ledger }` in S3, which
 * deletes this and `custodyGroups`.
 */
export function deriveDeskClaims(input: DeskClaimsInput): DeskClaims {
  const { roster, now } = input;

  const cards: ClaimCard[] = [];
  const ledger: RosterGroup[] = [];

  for (const group of roster.groups) {
    const rest: RosterLine[] = [];
    for (const line of group.lines) {
      if (rosterLineNeedsAHand(line)) {
        cards.push({
          line,
          stage: line.stage,
          stageLabel: STAGE_LABEL[line.stage],
          custody: line.custody,
        });
      } else {
        rest.push(line);
      }
    }
    if (rest.length > 0) {
      ledger.push({ ...group, count: rest.length, lines: rest });
    }
  }

  // N2 — the cards stand in the band's Next order of the need each leads
  // with (class, deadline, age — `rankByNext`), never a second ranking by
  // owner. Ties keep the name order they are handed in.
  const byName = leadsByArrival(
    [...cards].sort((a, b) => a.line.name.localeCompare(b.line.name)),
  );
  const ordered = [
    ...rankByNext(
      byName.filter((card) => card.line.needKind !== null),
      ({ line }) => ({
        kind: line.needKind!,
        text: line.needText ?? '',
        dueOn: line.dueOn ?? null,
        at: line.needAt ?? null,
      }),
      now,
    ),
    ...byName.filter((card) => card.line.needKind === null),
  ];

  const restCount = ledger.reduce((total, group) => total + group.count, 0);

  return {
    cards: ordered,
    ledger,
    heading: roster.heading,
    restHeading: restHeadingFor(restCount, roster.notChecked != null),
    groups: custodyGroups(ordered, ledger, roster.notChecked != null),
  };
}


/* ── The ledger (US-28 changes 2 and 5) ─────────────────────────────────────
 *
 * Below Today, every job of the scope Today does not hold, grouped by where it
 * stands on the one ranked list: Also yours · With others · Coming back · No
 * current alert. Each row prints the job's line from that same list, so Today
 * and the ledger never name two different needs for one job.
 * ─────────────────────────────────────────────────────────────────────────── */

export type DeskLedgerGroupKey = 'yours' | 'others' | 'back' | 'rest';

export interface DeskLedgerLine {
  /** The job's line, read on the need the one ranked list gives it. */
  line: RosterLine;
  standing: DeskStanding;
  /** How that need settled today: the row prints muted, in place. */
  settled: SheetSettled | null;
  /** `others`, acted on before today: who the studio waits on, since when. */
  waiting: { who: string; since: string; by?: string } | null;
  /** `back`: the day it comes back. */
  back: { until: string; reason: string | null } | null;
}

export interface DeskLedgerGroup {
  key: DeskLedgerGroupKey;
  /** "Also yours" ("With Jordan" in a teammate's section), "With others",
   *  "Coming back", "No current alert" (or "Not checked"). Never a count. */
  label: string;
  lines: DeskLedgerLine[];
}

export interface DeskLedgerSection {
  /** `mine` or `studio`; `person-{id}` where the studio's scope groups by person. */
  key: string;
  /** "Leah's" where the studio's scope groups by person; null otherwise. */
  label: string | null;
  groups: DeskLedgerGroup[];
}

export interface DeskLedger {
  sections: DeskLedgerSection[];
  notChecked: string | null;
}

export interface DeskLedgerInput {
  /** The roster's own input (its scope, leads and seat included): each row is
   *  read again on the need the one ranked list gives its job. */
  roster: DeskRosterInput;
  sheet: Pick<DaySheet, 'lines' | 'alsoYours' | 'waitingOn' | 'setAside' | 'standing'>;
  /** Today's cards (`groupSheetByJob`). */
  cards: readonly Pick<SheetCard, 'jobId'>[];
  /** The studio's members (`deriveRosterPeople`): the studio's scope groups
   *  by person. */
  people?: readonly RosterPerson[];
  /** Who carries each job (`deskHolderOf`); absent, its designer. */
  holderOf?: (jobId: string) => DeskHolder;
  now: Date;
}

const LEDGER_GROUP_ORDER: readonly DeskLedgerGroupKey[] = ['yours', 'others', 'back', 'rest'];

interface LedgerRow {
  personId: string | null;
  group: DeskLedgerGroupKey;
  /** Rank on the one list (yours), the waiting order (others), the day it
   *  comes back (back); then the roster's own order. */
  order: [number, number];
  ledgerLine: DeskLedgerLine;
}

/**
 * US-28 change 2 — the ledger replaces the claims split (`custodyGroups`).
 * R1: a job in Today never appears here, in any scope, and the drop runs
 * before the studio's scope regroups by person. Change 5: a job is with
 * others only once the studio owes no act — acted on before today, or no need
 * on the list but a motion under way. A silent overdue invoice or PO with an
 * act owed stays yours.
 */
export function deriveDeskLedger(input: DeskLedgerInput): DeskLedger {
  const { roster: rosterInput, sheet, now } = input;
  const roster = deriveDeskRoster(rosterInput, now);
  const voice = rosterInput.oneVoice === true;
  const ctx: LineContext = {
    voice,
    now,
    notChecked: roster.notChecked,
    leads: rosterInput.leads ?? new Map(),
    meUserId: rosterInput.meUserId,
  };
  const rowByEngagement = new Map(rosterInput.live.map((row) => [row.engagement_id, row]));
  const chipByEngagement = new Map(
    rosterInput.chips.map((chip) => [chip.row.engagement_id, chip]),
  );
  const inToday = new Set(input.cards.map((card) => card.jobId));

  // Each job's line on the one list: its first open need, else its first
  // settled one, at the place its first line holds.
  const listed = new Map<string, { entry: SheetEntry; rank: number }>();
  [...sheet.lines, ...sheet.alsoYours].forEach((entry, rank) => {
    const held = listed.get(entry.projectId);
    if (!held) listed.set(entry.projectId, { entry, rank });
    else if (held.entry.settled && !entry.settled) listed.set(entry.projectId, { entry, rank: held.rank });
  });
  const waiting = new Map<string, { at: number; item: DaySheetWaiting }>();
  sheet.waitingOn.forEach((item, at) => {
    if (!waiting.has(item.need.projectId)) waiting.set(item.need.projectId, { at, item });
  });
  const back = new Map<string, DaySheetSetAside>();
  for (const item of sheet.setAside) {
    const held = back.get(item.need.projectId);
    if (!held || item.until < held.until) back.set(item.need.projectId, item);
  }

  const rows: LedgerRow[] = [];
  let position = 0;
  for (const line of roster.groups.flatMap((group) => group.lines)) {
    position += 1;
    const jobId = line.projectId ?? line.engagementId;
    if (inToday.has(jobId)) continue;
    const row = rowByEngagement.get(line.engagementId);
    const chip = deskMotion(chipByEngagement.get(line.engagementId) ?? null, voice);
    const reline = (need: NeedLine, awaiting?: string) =>
      row ? rosterEntryOn(row, need, chip, ctx, awaiting).line : line;
    const standing: DeskStanding =
      sheet.standing.get(jobId) ?? (line.motionText ? 'others' : 'rest');
    const personId = input.holderOf?.(jobId).userId ?? line.designerId;
    const base: DeskLedgerLine = { line, standing, settled: null, waiting: null, back: null };

    const onList = listed.get(jobId);
    const held = waiting.get(jobId);
    const comes = back.get(jobId);
    if ((standing === 'yours' || standing === 'settled') && onList) {
      rows.push({
        personId,
        group: 'yours',
        order: [onList.rank, position],
        ledgerLine: {
          ...base,
          line: reline(onList.entry.need),
          settled: onList.entry.settled ?? null,
        },
      });
    } else if (standing === 'back' && comes) {
      rows.push({
        personId,
        group: 'back',
        order: [Date.parse(`${comes.until.slice(0, 10)}T00:00:00`), position],
        ledgerLine: {
          ...base,
          line: reline(comes.need.need),
          back: { until: comes.until, reason: comes.reason },
        },
      });
    } else if (standing === 'others') {
      // Acted on before today, or (no need on the list) a motion under way.
      const ledgerLine: DeskLedgerLine = held
        ? {
            ...base,
            line: reline(held.item.need.need, held.item.who),
            waiting: {
              who: held.item.who,
              since: held.item.since,
              ...(held.item.by ? { by: held.item.by } : {}),
            },
          }
        : base;
      rows.push({
        personId,
        group: 'others',
        order: [held?.at ?? Number.POSITIVE_INFINITY, position],
        ledgerLine,
      });
    } else {
      rows.push({ personId, group: 'rest', order: [0, position], ledgerLine: base });
    }
  }

  const groupsOf = (sectionRows: readonly LedgerRow[], yoursLabel: string): DeskLedgerGroup[] =>
    LEDGER_GROUP_ORDER.flatMap((key) => {
      const lines = sectionRows
        .filter((row) => row.group === key)
        .sort((a, b) => a.order[0] - b.order[0] || a.order[1] - b.order[1])
        .map((row) => row.ledgerLine);
      if (lines.length === 0) return [];
      const label =
        key === 'yours'
          ? yoursLabel
          : key === 'others'
            ? 'With others'
            : key === 'back'
              ? 'Coming back'
              : roster.notChecked
                ? CUSTODY_NOT_CHECKED
                : CUSTODY_AT_REST;
      return [{ key, label, lines }];
    });

  const scope = rosterInput.scope ?? 'studio';
  const people = input.people ?? [];
  if (scope === 'mine' || people.length === 0) {
    const groups = groupsOf(rows, 'Also yours');
    return {
      sections: groups.length > 0 ? [{ key: scope, label: null, groups }] : [],
      notChecked: roster.notChecked,
    };
  }

  // The studio's scope regroups by person — after Today's jobs were dropped.
  // A row whose holder is nobody on the list groups under the principal.
  const principal = people.find((person) => person.isPrincipal) ?? people[0];
  const known = new Set(people.map((person) => person.id));
  const sections = people.flatMap((person): DeskLedgerSection[] => {
    const own = rows.filter(
      (row) => (row.personId && known.has(row.personId) ? row.personId : principal.id) === person.id,
    );
    const first = firstName(person.name, person.name);
    const groups = groupsOf(
      own,
      person.id === rosterInput.meUserId ? 'Also yours' : `With ${first}`,
    );
    return groups.length > 0 ? [{ key: `person-${person.id}`, label: `${first}'s`, groups }] : [];
  });
  return { sections, notChecked: roster.notChecked };
}

/* ── The two facets (IA-11 / IA-12) ─────────────────────────────────────────
   Facets, not a density toggle: neither one changes what a row looks like or
   how much padding it carries. "Only what needs me" narrows the population;
   "By person" regroups it. They compose, and with both off the roster is
   exactly the stage-grouped roster `deriveDeskRoster` returned. ───────────── */

/** The empty result of "Only what needs me" — never an empty list. */
export const NOTHING_NEEDS_YOU = 'No current action alerts.';

/** A row needs a hand when it carries a mark. `deriveDeskRoster` already
 *  writes that mark from the need model (URGENT_NEED_KINDS above is its
 *  red-letter half; a quiet need is still a need), so the facet reads the
 *  same fact the margin does rather than deriving a second one. */
export function rosterLineNeedsAHand(line: RosterLine): boolean {
  return line.mark !== null;
}


/** A member of the studio, as the roster needs them: an id to match
 *  `designer_id` against and a name to print. */
export interface RosterPerson {
  id: string;
  name: string;
  isPrincipal: boolean;
}

/** The structural shape of an `organization_members` row with its profile —
 *  the roster reads these four fields off the list `desk/page.tsx` already
 *  fetched, and the derivation stays free of the data layer. */
export interface RosterMember {
  user_id: string;
  role: string;
  status: string;
  profiles: {
    full_name: string | null;
    display_name: string | null;
  } | null;
}

/** A person group. Keyed by person, never by stage: people are not stages and
 *  take no stage pigment. */
export interface RosterPersonGroup {
  key: string;
  label: string;
  count: number;
  lines: RosterLine[];
}

function memberName(member: RosterMember): string | null {
  const name = (
    member.profiles?.full_name ||
    member.profiles?.display_name ||
    ''
  ).trim();
  return name || null;
}

/**
 * The people the roster can group by: every member of the studio we can name,
 * the principal first and the rest alphabetically. A member with no name on
 * their profile is left out — an unnamed plate says nothing.
 */
export function deriveRosterPeople(
  members: readonly RosterMember[],
): RosterPerson[] {
  const people: RosterPerson[] = [];
  const seen = new Set<string>();

  for (const member of members) {
    if (member.status !== 'active' && member.status !== 'invited') continue;
    if (seen.has(member.user_id)) continue;
    const name = memberName(member);
    if (!name) continue;
    seen.add(member.user_id);
    people.push({
      id: member.user_id,
      name,
      isPrincipal: member.role === 'owner',
    });
  }

  const principalIndex = people.findIndex((person) => person.isPrincipal);
  const rest = people
    .filter((_, index) => index !== principalIndex)
    .sort((a, b) => a.name.localeCompare(b.name));
  return principalIndex === -1
    ? rest
    : [people[principalIndex], ...rest];
}

/**
 * Regroups the roster's lines by the person who carries the job.
 *
 * A row with no `designerId` — and a row whose `designerId` names nobody on
 * this list — groups under the principal rather than vanishing: the head's
 * live count is the roster's own contract, and a row the facet cannot place is
 * still a row the studio owns.
 */
export function groupRosterByPerson(
  groups: readonly RosterGroup[],
  people: readonly RosterPerson[],
): RosterPersonGroup[] {
  if (people.length === 0) return [];

  const principal = people.find((person) => person.isPrincipal) ?? people[0];
  const known = new Set(people.map((person) => person.id));
  const linesByPerson = new Map<string, RosterLine[]>(
    people.map((person) => [person.id, []]),
  );

  for (const group of groups) {
    for (const line of group.lines) {
      const id =
        line.designerId && known.has(line.designerId)
          ? line.designerId
          : principal.id;
      linesByPerson.get(id)!.push(line);
    }
  }

  return people
    .map((person) => ({
      key: `person-${person.id}`,
      label: person.name,
      count: linesByPerson.get(person.id)!.length,
      lines: linesByPerson.get(person.id)!,
    }))
    .filter((group) => group.count > 0);
}
