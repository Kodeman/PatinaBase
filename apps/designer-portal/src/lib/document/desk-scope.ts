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

/** Keep all studio needs, or only needs on jobs whose current lead is this seat. */
export function scopeDeskNeeds(
  needs: DeskNeed[],
  leads: DeskLeads,
  meUserId: string | null | undefined,
  scope: DeskScope,
): DeskNeed[] {
  if (scope === 'studio') return needs;
  if (!meUserId) return [];
  return needs.filter((entry) => leads.get(entry.projectId)?.leadUserId === meUserId);
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
      actionLabel: hasNote ? 'Read the note' : 'Open the job',
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
