import type { NeedState, ProjectLead } from '@patina/supabase';
import type { DeskNeed } from './desk-need-list';
import type { DocumentStateRow, NeedLine } from './desk-derivation';

export type DeskScope = 'mine' | 'studio';

export type DeskLeads = ReadonlyMap<
  string,
  Pick<ProjectLead, 'leadUserId' | 'leadName' | 'previousLeadUserId' | 'previousLeadName' | 'assignedAt'>
>;

type CustodyNeed = NeedLine & {
  makerName?: string | null;
  clientName?: string | null;
};

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
  return needs.filter((entry) => isMyJob(entry.projectId, leads, meUserId, designers));
}

function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

/** Name the person holding the next move, using the active project lead. */
export function custodyFor(
  need: CustodyNeed | null,
  leads: DeskLeads,
  meUserId: string | null | undefined,
  projectId?: string | null,
): string {
  if (!need) return 'No current alert';
  if (need.owner === 'maker') {
    return `Awaiting ${need.makerName?.trim() || need.draft?.maker?.trim() || 'supplier'}`;
  }
  if (need.owner === 'client') {
    return `Awaiting ${need.clientName?.trim() || 'client'}`;
  }
  const lead = projectId ? leads.get(projectId) : undefined;
  if (!lead || lead.leadUserId === meUserId) return 'Action with you';
  return `With ${firstName(lead.leadName) ?? 'the project lead'}`;
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

/** Derive unread hand-offs for projects now led by this viewer. */
export function deriveHandoffNeeds(
  live: readonly DocumentStateRow[],
  leads: DeskLeads,
  meUserId: string | null | undefined,
  states: ReadonlyMap<string, NeedState> = new Map(),
  seat: HandoffSeat | null = null,
): DeskNeed[] {
  if (!meUserId) return [];
  const rowsByProject = new Map(
    live.flatMap((row) => row.project_id ? [[row.project_id, row] as const] : []),
  );
  const needs: DeskNeed[] = [];
  for (const [projectId, lead] of leads) {
    if (
      lead.leadUserId !== meUserId ||
      !lead.previousLeadName?.trim() ||
      !lead.previousLeadUserId
    ) continue;
    const row = rowsByProject.get(projectId);
    if (!row) continue;
    const key = `handoff:${projectId}`;
    if (handoffReadFor(states.get(key), lead.assignedAt)) continue;
    const assigned = new Date(lead.assignedAt);
    if (!Number.isFinite(assigned.getTime())) continue;
    // Walk W-D7 — "Leah handed you …", the full name only when it has no first.
    const previous = firstName(lead.previousLeadName) ?? lead.previousLeadName.trim();
    const date = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }).format(assigned);
    const hasNote = handoffNoteFor(lead, meUserId, seat) !== null;
    const need: NeedLine = {
      key,
      kind: 'handoff',
      text: hasNote
        ? `${previous} handed you ${row.title} on ${date} · Read ${previous}'s note`
        : `${previous} handed you ${row.title} on ${date}`,
      actionLabel: hasNote ? 'Read the note' : 'Open project file',
      stamp: { label: 'HAND-OFF', color: 'var(--color-dusty-blue)' },
      urgent: false,
      owner: 'designer',
      at: lead.assignedAt,
      // SQ-778 N2 — the press lands on the note itself (HandoffNote's anchor).
      deepLink: `/doc/${projectId}#${HANDOFF_NOTE_ANCHOR}`,
    };
    needs.push({ key, projectId, projectName: row.title, need });
  }
  return needs;
}
