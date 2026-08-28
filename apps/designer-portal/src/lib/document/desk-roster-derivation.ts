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
  folderTab,
  type DeskFolder,
  type DocumentStateRow,
  type MotionChip,
  type NeedKind,
  type SectionKey,
} from './desk-derivation';
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
}

export interface RosterGroup {
  key: SectionKey;
  label: string;
  count: number;
  lines: RosterLine[];
}

export interface DeskRoster {
  groups: RosterGroup[];
  attentionEngagementId: string | null;
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

  const attentionEngagementId =
    entries
      .filter(
        (entry) =>
          ROSTER_STAGE_ORDER.includes(entry.stage) &&
          entry.line.mark === 'urgent',
      )
      .sort(
        (a, b) =>
          a.tier - b.tier ||
          a.at - b.at ||
          a.tab.localeCompare(b.tab) ||
          a.line.engagementId.localeCompare(b.line.engagementId),
      )[0]?.line.engagementId ?? null;

  // Counted off the GROUPS, never off `entries`: a row whose `active_section`
  // fell outside `ROSTER_STAGE_ORDER` would otherwise be counted in the header
  // and printed under no heading — the header claiming more jobs than the
  // roster shows is the exact drift this module's independence risks.
  const liveCount = groups.reduce((total, group) => total + group.count, 0);
  return {
    groups,
    attentionEngagementId,
    liveCount,
    overdueCount: overdueNames.length,
    heading: `Every job · ${liveCount} live · ${overdueNames.length} overdue`,
    overdueLine: overdueSentence(overdueNames),
  };
}
