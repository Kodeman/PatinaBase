import type { NeedState, ProjectLead } from '@patina/supabase';
import type { DeskNeed } from './desk-need-list';
import type { DocumentStateRow, NeedLine } from './desk-derivation';
import { deskJobName } from './desk-job-name';

export type DeskScope = 'mine' | 'studio';

export type DeskLeads = ReadonlyMap<
  string,
  Pick<ProjectLead, 'leadUserId' | 'leadName' | 'previousLeadUserId' | 'previousLeadName' | 'assignedAt'>
>;

/** The engagement's `designer_id`, by the project id the leads map is keyed
 *  on (`project_id ?? engagement_id`) — who carries a job no one leads yet. */
export type DeskDesigners = ReadonlyMap<string, string | null>;

export function deskDesignersOf(live: readonly DocumentStateRow[]): DeskDesigners {
  return new Map(
    live.map((row) => [row.project_id ?? row.engagement_id, row.designer_id ?? null] as const),
  );
}

/**
 * Mine: a job this seat leads. A job with no lead row — every inquiry before
 * it is a project, and any project never handed a lead — is Mine when its
 * designer is this seat, or when it has no designer at all: a false "Nothing
 * needs you" is worse than a spare line. A job the read knows nothing of is
 * not Mine.
 */
export function isMyJob(
  projectId: string,
  leads: DeskLeads,
  meUserId: string | null | undefined,
  designers: DeskDesigners = new Map(),
): boolean {
  if (!meUserId) return false;
  const lead = leads.get(projectId);
  if (lead) return lead.leadUserId === meUserId;
  if (!designers.has(projectId)) return false;
  const designer = designers.get(projectId);
  return !designer || designer === meUserId;
}

/** Keep all studio needs, or only needs on jobs that are Mine (`isMyJob`). */
export function scopeDeskNeeds(
  needs: DeskNeed[],
  leads: DeskLeads,
  meUserId: string | null | undefined,
  scope: DeskScope,
  designers?: DeskDesigners,
): DeskNeed[] {
  if (scope === 'studio') return needs;
  return needs.filter(
    (entry) => entry.need.assignedToUserId
      ? entry.need.assignedToUserId === meUserId
      : entry.studioLevel || isMyJob(entry.projectId, leads, meUserId, designers),
  );
}

export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

/**
 * Name the person holding the next move, using the active project lead.
 *
 * US-28 change 5 — one meaning of "with others": the studio waits on someone
 * only once it owes no act. A need the studio has not acted on is in the
 * studio's hand whoever its `owner` is (a silent overdue invoice or PO still
 * needs her); `owner` is the sentence's subject only. `awaiting` is who the
 * studio waits on after it acted (the Day Sheet's `waitingOn`).
 */
export function custodyFor(
  need: NeedLine | null,
  leads: DeskLeads,
  meUserId: string | null | undefined,
  projectId?: string | null,
  awaiting?: string | null,
): string {
  if (!need) return 'No current alert';
  if (awaiting?.trim()) return `Awaiting ${awaiting.trim()}`;
  const lead = projectId ? leads.get(projectId) : undefined;
  if (!lead || lead.leadUserId === meUserId) return 'Action with you';
  return `With ${firstName(lead.leadName) ?? 'the project lead'}`;
}

/** Who carries a job: its lead, else (no lead row) its designer — the seat
 *  `isMyJob` reads. */
export interface DeskHolder {
  userId: string | null;
  /** The holder's first name, where the read has one. */
  name: string | null;
  /** This seat carries it (`isMyJob`). */
  mine: boolean;
}

/** The holder of each job, by the id the leads map is keyed on. `names` maps a
 *  studio member's user id to her name, for a job no one leads yet. */
export function deskHolderOf(
  leads: DeskLeads,
  meUserId: string | null | undefined,
  designers: DeskDesigners = new Map(),
  names: ReadonlyMap<string, string> = new Map(),
): (jobId: string) => DeskHolder {
  return (jobId) => {
    const lead = leads.get(jobId);
    const userId = lead ? lead.leadUserId : (designers.get(jobId) ?? null);
    const named = lead?.leadName?.trim() ? lead.leadName : userId ? names.get(userId) : null;
    return {
      userId,
      name: firstName(named),
      mine: isMyJob(jobId, leads, meUserId, designers),
    };
  };
}

/**
 * SQ-751 F9 — a hand-off is read only when she read it at or after the
 * assignment that stands now. The key stays `handoff:<projectId>`, so a read
 * from an earlier hand-off of the same job never silences a later one.
 */
export function handoffReadFor(
  state: Pick<NeedState, 'actedAt'> | undefined,
  assignedAt: string | null | undefined,
): boolean {
  if (!state?.actedAt) return false;
  const read = Date.parse(state.actedAt);
  const assigned = assignedAt ? Date.parse(assignedAt) : Number.NaN;
  if (!Number.isFinite(assigned)) return true;
  return Number.isFinite(read) && read >= assigned;
}

/** The project file's hand-off note anchor; the Day Sheet press opens to it. */
export const HANDOFF_NOTE_ANCHOR = 'hand-off';

/** Her seat in the job's studio, as it bears on a hand-off: her invite's line
 *  (L8, `organization_members.handoff_note`) and who wrote it. */
export interface HandoffSeat {
  handoff_note?: string | null;
  invited_by?: string | null;
}

/**
 * SQ-778 N2/N3 — the one rule for where the invite's note prints: the project
 * file, the act sheet and the Day Sheet's "Read the note". The note is stored
 * on her seat, not on a job, so it belongs only to a hand-off its writer made:
 * she leads the job now, someone led it before her, and that previous lead
 * wrote the note. Any other job carries no note.
 */
export function handoffNoteFor(
  lead: Pick<ProjectLead, 'leadUserId' | 'previousLeadUserId'> | null | undefined,
  meUserId: string | null | undefined,
  seat: HandoffSeat | null | undefined,
): string | null {
  const note = seat?.handoff_note?.trim();
  if (!note || !meUserId || !lead?.previousLeadUserId) return null;
  if (lead.leadUserId !== meUserId) return null;
  return seat?.invited_by === lead.previousLeadUserId ? note : null;
}

/**
 * Derive unread hand-offs for projects now led by this viewer. With `now`, a
 * hand-off read on that local day stays too: the Day Sheet settles it in
 * place as "Note read", so its slot never refills (US-28 U-Q2).
 */
export function deriveHandoffNeeds(
  live: readonly DocumentStateRow[],
  leads: DeskLeads,
  meUserId: string | null | undefined,
  states: ReadonlyMap<string, NeedState> = new Map(),
  seat: HandoffSeat | null = null,
  now?: Date,
): DeskNeed[] {
  if (!meUserId) return [];
  const rowsByProject = new Map(
    live.flatMap((row) => row.project_id ? [[row.project_id, row] as const] : []),
  );
  const needs: DeskNeed[] = [];
  for (const [projectId, lead] of leads) {
    // SQ-777 F5 — the hand-off is who led it, never whether a name is on record.
    if (lead.leadUserId !== meUserId || !lead.previousLeadUserId) continue;
    const row = rowsByProject.get(projectId);
    if (!row) continue;
    const key = `handoff:${projectId}`;
    const state = states.get(key);
    const readToday =
      Boolean(now && state?.actedAt) &&
      new Date(state!.actedAt!).toDateString() === now!.toDateString();
    if (handoffReadFor(state, lead.assignedAt) && !readToday) continue;
    const assigned = new Date(lead.assignedAt);
    if (!Number.isFinite(assigned.getTime())) continue;
    // Walk W-D7 — "Leah handed you …", the full name only when it has no first;
    // no name on record reads "The previous lead".
    const previous = firstName(lead.previousLeadName) ?? (lead.previousLeadName?.trim() || null);
    const date = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }).format(assigned);
    const hasNote = handoffNoteFor(lead, meUserId, seat) !== null;
    const handed = `${previous ?? 'The previous lead'} handed you ${deskJobName(row)} on ${date}`;
    const need: NeedLine = {
      key,
      kind: 'handoff',
      text: hasNote ? `${handed} · Read ${previous ?? 'the previous lead'}'s note` : handed,
      actionLabel: hasNote ? 'Read the note' : 'Open project file',
      stamp: { label: 'HAND-OFF', color: 'var(--color-dusty-blue)' },
      urgent: false,
      owner: 'designer',
      at: lead.assignedAt,
      // SQ-778 N2 — the press lands on the note itself (HandoffNote's anchor).
      deepLink: `/doc/${projectId}#${HANDOFF_NOTE_ANCHOR}`,
    };
    needs.push({ key, projectId, projectName: deskJobName(row), need });
  }
  return needs;
}
