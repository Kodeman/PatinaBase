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
import { dayMonth } from './dates';
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
  brief: 'Brief',
  discovery: 'Discovery',
  direction: 'Direction',
  proposal: 'Proposal',
  project: 'Project',
  install: 'Install',
  care: 'Care',
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
  'damage_claim',
  'proposal_declined',
  'proposal_expired',
  'schedule_conflict',
]);

/** The view's own "we don't know the client" fallbacks (desk-derivation's
 *  ROLE_NOUNS, which it keeps module-private). Read off the LAST word, exactly
 *  as `folderTab` reads it: the seed's placeholder is `Client User`, and a
 *  whole-string test lets it through as if it were a family name. */
const PLACEHOLDER_CLIENT_NAMES: ReadonlySet<string> = new Set(['client', 'user']);

const QUIET_STATE = 'quiet · nothing needs your hand';

/** `deriveDocumentGuide`'s rung 2 says "This project is paused" on the paper;
 *  the roster line says the same thing in its own register. */
const PAUSED_STATE = 'paused';

export const OPEN_THE_JOB = 'Open the job';

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
  /** Inter, red — the dated overdue phrase and what is overdue. */
  overdueText: string | null;
  mark: RosterMark;
  needKind: NeedKind | null;
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
  /** The need's own owner, for D3's ranking. Null where there is no need. */
  needOwner: 'designer' | 'client' | 'maker' | null;
  /** D8 — the ledger's value column, as `dayMonth` prints it (`12 August`):
   *  the need's own date where the line has a need, else the in-motion
   *  state's anchor date. Null where neither states one, and the cell
   *  renders empty. */
  valueText?: string | null;
  /** The in-motion chip's own sentence, unconcatenated (MotionChip.text). */
  motionText?: string | null;
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
  /** `Every job · 6 live · 2 overdue` */
  heading: string;
  /** The one Inter line naming what is overdue. */
  overdueLine: string;
}

export interface DeskRosterInput {
  folders: readonly DeskFolder[];
  chips: readonly MotionChip[];
  live: readonly DocumentStateRow[];
}

function prettyPhase(phase: string | null): string | null {
  if (!phase) return null;
  return phase
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Who the job is for. M1 draws a PLACE here; `document_state` carries no
 *  location column, so the client's name stands in its position — the nearest
 *  true thing, and never a role noun standing in for a name we do not have. */
function clientOf(row: DocumentStateRow): string | null {
  const name = (row.client_name ?? '').trim();
  if (!name) return null;
  const last = name.split(/\s+/).filter(Boolean).pop() ?? '';
  return PLACEHOLDER_CLIENT_NAMES.has(last.toLowerCase()) ? null : name;
}

/** D6's four words. 'At rest' is the fifth, and belongs to a job with no need
 *  at all rather than to an owner. */
const CUSTODY_YOUR_PEN = 'Your pen';
const CUSTODY_THE_CLIENT = 'With the client';
const CUSTODY_THE_MAKER = 'With the maker';
const CUSTODY_AT_REST = 'At rest';

/**
 * D6 — whose hand the job is in, said in one of four ways.
 *
 * The owner is READ off the need, never inferred at render: the rule that
 * derived the need already knew the answer, and a card that guesses is the
 * thing the ruling forbids. A need whose rule states no owner defaults to the
 * studio's own pen — the recommendation Kody took — rather than falling silent
 * or claiming a client we cannot name.
 *
 * The client's first name is printed only where `clientOf` will vouch for it:
 * the seed's placeholder `Client User` is refused here exactly as it is
 * refused on the line, because a role noun never stands in for a real name.
 */
export function custodyWord(
  need: NeedLine | null,
  row: DocumentStateRow,
): string {
  if (!need) return CUSTODY_AT_REST;
  if (need.owner === 'maker') return CUSTODY_THE_MAKER;
  if (need.owner === 'client') {
    const client = clientOf(row);
    return client ? `With ${firstName(client)}` : CUSTODY_THE_CLIENT;
  }
  return CUSTODY_YOUR_PEN;
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

export function deriveDeskRoster(
  input: DeskRosterInput,
  now: Date,
): DeskRoster {
  const folderByEngagement = new Map(
    input.folders.map((folder) => [folder.row.engagement_id, folder]),
  );
  const chipByEngagement = new Map(
    input.chips.map((chip) => [chip.row.engagement_id, chip]),
  );

  const entries: RosterEntry[] = input.live.map((row) => {
    const folder = folderByEngagement.get(row.engagement_id) ?? null;
    const chip = chipByEngagement.get(row.engagement_id) ?? null;
    const need = folder?.need ?? null;
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
        : (need?.text ?? chip?.text ?? QUIET_STATE);
    const state = [clientOf(row), prettyPhase(row.current_phase), body]
      .filter((part): part is string => Boolean(part))
      .join(' · ');

    const jobHref = `/doc/${row.engagement_id}`;
    const act: RosterAct =
      need?.actionLabel != null
        ? {
            label: need.actionLabel,
            href: need.deepLink ?? jobHref,
            ...(need.ledger ? { ledger: need.ledger } : {}),
          }
        : { label: OPEN_THE_JOB, href: chip?.href ?? jobHref };

    return {
      line: {
        engagementId: row.engagement_id,
        name: row.title,
        stage: row.active_section,
        designerId: row.designer_id,
        state,
        overdueText:
          overdue.isOverdue && need
            ? `Overdue ${overdueElapsedPhrase(overdue)} — ${need.text}`
            : null,
        mark,
        needKind: need?.kind ?? null,
        overdue,
        jobHref,
        act,
        projectId: row.project_id ?? null,
        client: clientOf(row),
        dueOn: need?.dueOn ?? null,
        needText: need?.text ?? null,
        custody: custodyWord(need, row),
        needOwner: need?.owner ?? null,
        // The need's own date first — a deadline outranks a provenance stamp.
        valueText: dayMonth(need?.dueOn ?? null) ?? dayMonth(motionAnchorDate(chip)),
        motionText: chip?.text ?? null,
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
    heading: `Every job · ${liveCount} live · ${overdueNames.length} overdue`,
    overdueLine: overdueSentence(overdueNames),
  };
}

/* ── The day's line (IA-05) ─────────────────────────────────────────────────
 *
 * At most three lines under the roster head, and nothing at all when nothing
 * needs her. Every line is a VIEW of a roster row already on the page — it
 * links into the roster and never introduces a job the roster does not list.
 * That is what keeps it from becoming a second queue.
 */

/** A note this studio's client answered — `project_notes.answered_at` (00565),
 *  keyed by project. RLS scopes the read; this module only shapes what it is
 *  handed. */
export interface AnsweredClientNote {
  projectId: string;
  answeredAt: string;
}

/** `overdue` is the clause after the dash, which the roster prints in
 *  terracotta ink; `job` is the inline act into the row. */
export type DayLinePart =
  | { kind: 'text'; text: string }
  | { kind: 'job'; text: string; engagementId: string }
  | { kind: 'overdue'; text: string };

/** The id the `more` link lands on — the claims grid's own element. The grid
 *  has no stage, so the old `#roster-stage-{key}` target is gone with the
 *  stage-first grid it pointed into. */
export const CLAIMS_ANCHOR_ID = 'desk-claims';

export interface DayLine {
  /** `card-${engagementId}` for a quoted card, `answered` for the note. */
  key: string;
  /** The row this line is a view of. */
  engagementId: string;
  parts: DayLinePart[];
}

export interface DeskDayLine {
  lines: DayLine[];
  /** `and N more below`, pointing at the claims grid. */
  more: { count: number; anchorId: string } | null;
}

/** D7 — the line quotes the top THREE cards. The answered note is a fourth
 *  line on top of that, not one of the three. */
export const MAX_DAY_LINES = 3;

/** "Replied last night" is only true inside a day. */
export const ANSWERED_NOTE_WINDOW_MS = 86_400_000;

interface FlatLine {
  line: RosterLine;
  stageLabel: string;
}

function flatten(roster: DeskRoster): FlatLine[] {
  const flat: FlatLine[] = [];
  for (const group of roster.groups) {
    for (const line of group.lines) {
      flat.push({ line, stageLabel: group.label });
    }
  }
  return flat;
}

/**
 * D7 — the day's line, now a view of the grid it sits above.
 *
 * Before this it selected by its own rule (oldest overdue → newest lead →
 * client-answered) while the roster ordered by another. That was tolerable
 * under stage plates, where the line was a shortcut into a list; in a grid,
 * where POSITION is the message, a line contradicting the first card means
 * neither is trusted.
 *
 * The card lines quote the grid. The answered note does NOT: it searches the
 * whole roster, because a client answering is news whether or not the job
 * claims her hand, and a quiet job is exactly the one she would otherwise not
 * look at today. The `taken` set spans both, so no job is ever named twice.
 */
export function deriveDeskDayLine(
  cards: readonly ClaimCard[],
  roster: DeskRoster,
  answeredNotes: readonly AnsweredClientNote[],
  now: Date,
): DeskDayLine | null {
  const lines: DayLine[] = [];
  const taken = new Set<string>();

  for (const card of cards.slice(0, MAX_DAY_LINES)) {
    const { line } = card;
    taken.add(line.engagementId);
    const elapsed = overdueElapsedPhrase(line.overdue);
    lines.push({
      key: `card-${line.engagementId}`,
      engagementId: line.engagementId,
      parts: [
        { kind: 'job', text: line.name, engagementId: line.engagementId },
        elapsed
          ? { kind: 'overdue', text: ` — overdue ${elapsed}` }
          : {
              // The card's own reason, not a second sentence about it: a line
              // that paraphrases the card is a second queue in miniature.
              kind: 'text',
              text: ` — ${line.needText ?? line.act.label.toLowerCase()}`,
            },
      ],
    });
  }

  const floor = now.getTime() - ANSWERED_NOTE_WINDOW_MS;
  const answered = answeredNotes
    .map((note) => ({ note, at: Date.parse(note.answeredAt) }))
    .filter(
      (entry) =>
        Number.isFinite(entry.at) &&
        entry.at >= floor &&
        entry.at <= now.getTime(),
    )
    .sort((a, b) => b.at - a.at);
  const flat = flatten(roster);
  for (const { note } of answered) {
    const match = flat.find(
      (entry) =>
        entry.line.projectId === note.projectId &&
        !!entry.line.client &&
        !taken.has(entry.line.engagementId),
    );
    if (!match) continue;
    taken.add(match.line.engagementId);
    lines.push({
      key: 'answered',
      engagementId: match.line.engagementId,
      parts: [
        { kind: 'text', text: `${match.line.client} replied last night — ` },
        {
          kind: 'job',
          text: match.line.name,
          engagementId: match.line.engagementId,
        },
      ],
    });
    break;
  }

  // Nothing claims her hand: the band does not render. A "nothing needs you"
  // banner over sixteen live jobs is itself a second queue.
  if (lines.length === 0) return null;

  // Every card the line already spoke, by either route: the answered note can
  // name a card below the top three, and "and 1 more below" must not then
  // point at the job just named.
  const remaining = cards.filter(
    (card) => !taken.has(card.line.engagementId),
  ).length;
  return {
    lines,
    more: remaining > 0 ? { count: remaining, anchorId: CLAIMS_ANCHOR_ID } : null,
  };
}

/* ── The claims split (D5, D3, D8) ──────────────────────────────────────────
 *
 * R143: one line per job in the at-rest ledger; a job with a claim on the
 * studio's hand takes a Claim card. The predicate is the mark the roster
 * already draws — `mark !== null`, every job carrying a need — so the split
 * reads the same fact the margin does rather than deriving a second one.
 * ─────────────────────────────────────────────────────────────────────────── */

export type ClaimBand = 0 | 1 | 2 | 3;

export interface ClaimCard {
  line: RosterLine;
  stage: SectionKey;
  stageLabel: string;
  custody: string;
  band: ClaimBand;
}

export interface ClaimPersonGroup {
  key: string;
  label: string;
  count: number;
  cards: ClaimCard[];
}

export interface DeskClaimsInput {
  roster: DeskRoster;
  answeredNotes: readonly AnsweredClientNote[];
  now: Date;
}

export interface DeskClaims {
  cards: ClaimCard[];
  ledger: RosterGroup[];
  heading: string;
  restHeading: string;
  dayLine: DeskDayLine | null;
}

function claimBand(line: RosterLine): ClaimBand {
  if (line.needOwner === 'maker') return 3;
  if (line.needOwner === 'client') return 2;
  // 'designer', and the D6 default for a need whose rule stated no owner.
  return line.overdue.isOverdue ? 0 : 1;
}

function restHeadingFor(count: number): string {
  if (count === 0) return '';
  return `At rest · ${count} ${count === 1 ? 'job' : 'jobs'}`;
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
 */
export function deriveDeskClaims(input: DeskClaimsInput): DeskClaims {
  const { roster, answeredNotes, now } = input;

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
          band: claimBand(line),
        });
      } else {
        rest.push(line);
      }
    }
    if (rest.length > 0) {
      ledger.push({ ...group, count: rest.length, lines: rest });
    }
  }

  // Band, then oldest need date, then name. Two undated cards give
  // +Infinity − +Infinity = NaN, which is falsy, so `||` falls through to the
  // name — deliberate, and pinned by test. An undated card sorts BEHIND a
  // dated one, because +Infinity − finite is +Infinity.
  cards.sort(
    (a, b) =>
      a.band - b.band ||
      anchorTime(a.line.dueOn) - anchorTime(b.line.dueOn) ||
      a.line.name.localeCompare(b.line.name),
  );

  const restCount = ledger.reduce((total, group) => total + group.count, 0);

  return {
    cards,
    ledger,
    heading: roster.heading,
    restHeading: restHeadingFor(restCount),
    dayLine: deriveDeskDayLine(cards, roster, answeredNotes, now),
  };
}

/**
 * Regroups the CARD half by the person who carries the job, on exactly the
 * rule `groupRosterByPerson` uses for the ledger half: a card with no
 * `designerId`, or one naming nobody on the list, groups under the principal
 * rather than vanishing.
 */
export function groupClaimsByPerson(
  cards: readonly ClaimCard[],
  people: readonly RosterPerson[],
): ClaimPersonGroup[] {
  if (people.length === 0) return [];

  const principal = people.find((person) => person.isPrincipal) ?? people[0];
  const known = new Set(people.map((person) => person.id));
  const cardsByPerson = new Map<string, ClaimCard[]>(
    people.map((person) => [person.id, []]),
  );

  for (const card of cards) {
    const id =
      card.line.designerId && known.has(card.line.designerId)
        ? card.line.designerId
        : principal.id;
    cardsByPerson.get(id)!.push(card);
  }

  return people
    .map((person) => ({
      key: `person-${person.id}`,
      label: person.name,
      count: cardsByPerson.get(person.id)!.length,
      cards: cardsByPerson.get(person.id)!,
    }))
    .filter((group) => group.count > 0);
}

/* ── The two facets (IA-11 / IA-12) ─────────────────────────────────────────
   Facets, not a density toggle: neither one changes what a row looks like or
   how much padding it carries. "Only what needs me" narrows the population;
   "By person" regroups it. They compose, and with both off the roster is
   exactly the stage-grouped roster `deriveDeskRoster` returned. ───────────── */

/** The empty result of "Only what needs me" — never an empty list. */
export const NOTHING_NEEDS_YOU = 'Nothing needs your hand today.';

/** A row needs a hand when it carries a mark. `deriveDeskRoster` already
 *  writes that mark from the need model (URGENT_NEED_KINDS above is its
 *  red-letter half; a quiet need is still a need), so the facet reads the
 *  same fact the margin does rather than deriving a second one. */
export function rosterLineNeedsAHand(line: RosterLine): boolean {
  return line.mark !== null;
}

/** Narrows every group to its marked rows and drops the groups left empty. */
export function filterRosterToNeeds(
  groups: readonly RosterGroup[],
): RosterGroup[] {
  return groups
    .map((group) => {
      const lines = group.lines.filter(rosterLineNeedsAHand);
      return { ...group, count: lines.length, lines };
    })
    .filter((group) => group.count > 0);
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

/** The head sentence says which facets are on, in words. The count clauses in
 *  front of it are the whole roster's, not the filtered view's. */
export function facetHeading(
  heading: string,
  facets: { needsMe: boolean; byPerson: boolean },
): string {
  let sentence = heading;
  if (facets.needsMe) sentence += ' · showing what needs you';
  if (facets.byPerson) sentence += ' · by person';
  return sentence;
}
