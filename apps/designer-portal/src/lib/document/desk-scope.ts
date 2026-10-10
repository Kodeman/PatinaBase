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

/** Derive unread hand-offs for projects now led by this viewer. */
export function deriveHandoffNeeds(
  live: readonly DocumentStateRow[],
  leads: DeskLeads,
  meUserId: string | null | undefined,
  states: ReadonlyMap<string, NeedState> = new Map(),
  hasNote = true,
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
    if (states.get(key)?.actedAt) continue;
    const assigned = new Date(lead.assignedAt);
    if (!Number.isFinite(assigned.getTime())) continue;
    const previous = lead.previousLeadName.trim();
    const date = new Intl.DateTimeFormat('en-US', {
      weekday: 'long', month: 'long', day: 'numeric',
    }).format(assigned);
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
      deepLink: `/doc/${projectId}`,
    };
    needs.push({ key, projectId, projectName: row.title, need });
  }
  return needs;
}
