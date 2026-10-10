import { custodyFor, deriveHandoffNeeds, scopeDeskNeeds, type DeskLeads } from '../desk-scope';
import type { NeedState } from '@patina/supabase';
import type { DeskNeed } from '../desk-need-list';
import type { DocumentStateRow, NeedLine } from '../desk-derivation';

const leads: DeskLeads = new Map([
  ['mine', { leadUserId: 'u-me', leadName: 'Maya Lee', previousLeadUserId: null, previousLeadName: null, assignedAt: null }],
  ['theirs', { leadUserId: 'u-other', leadName: 'Nina Park', previousLeadUserId: null, previousLeadName: null, assignedAt: null }],
]);

function deskNeed(projectId: string, owner: NeedLine['owner'], over: Partial<NeedLine> = {}): DeskNeed {
  const need = {
    key: `${owner}:${projectId}`,
    kind: 'task_due',
    text: 'Open the task',
    actionLabel: 'Open the task',
    stamp: { label: 'Due', color: 'red' },
    urgent: false,
    owner,
    ...over,
  } as NeedLine;
  return { key: need.key, projectId, projectName: projectId, need };
}

describe('Desk scope and custody', () => {
  it('scopes Mine to projects whose active lead is the viewer and keeps The studio’s complete', () => {
    const mine = deskNeed('mine', 'designer');
    const theirs = deskNeed('theirs', 'designer');
    const unknown = deskNeed('unassigned', 'designer');

    expect(scopeDeskNeeds([mine, theirs, unknown], leads, 'u-me', 'mine')).toEqual([mine]);
    expect(scopeDeskNeeds([mine, theirs, unknown], leads, 'u-me', 'studio')).toEqual([mine, theirs, unknown]);
    expect(scopeDeskNeeds([mine], leads, null, 'mine')).toEqual([]);
  });

  it.each([
    [deskNeed('mine', 'designer'), 'mine', 'Action with you'],
    [deskNeed('theirs', 'designer'), 'theirs', 'With Nina'],
    [deskNeed('mine', 'maker', { makerName: 'Ari Maker' } as Partial<NeedLine>), 'mine', 'Awaiting Ari Maker'],
    [deskNeed('mine', 'client', { clientName: 'Leah Client' } as Partial<NeedLine>), 'mine', 'Awaiting Leah Client'],
  ] as const)('names the custody holder as %s', (entry, projectId, expected) => {
    expect(custodyFor(entry.need, leads, 'u-me', projectId)).toBe(expected);
  });

  it('shows an unread project hand-off only to its new lead, then suppresses it after acting', () => {
    const handoffLeads: DeskLeads = new Map([
      ['project-1', {
        leadUserId: 'u-me',
        leadName: 'Maya Lee',
        previousLeadUserId: 'u-old',
        previousLeadName: 'Nina Park',
        assignedAt: '2026-10-09T12:00:00.000Z',
      }],
      ['project-2', {
        leadUserId: 'u-other',
        leadName: 'Nina Park',
        previousLeadUserId: 'u-old',
        previousLeadName: 'Sam Lee',
        assignedAt: '2026-10-09T12:00:00.000Z',
      }],
    ]);
    const live = [
      { project_id: 'project-1', title: 'Oak House' } as DocumentStateRow,
      { project_id: 'project-2', title: 'Lake House' } as DocumentStateRow,
    ];
    const unread = deriveHandoffNeeds(live, handoffLeads, 'u-me');

    expect(unread).toHaveLength(1);
    expect(unread[0].need.text).toMatch(/Nina Park handed you Oak House/);
    expect(unread[0].need.actionLabel).toBe('Read the note');
    const noNote = deriveHandoffNeeds(live, handoffLeads, 'u-me', new Map(), false);
    expect(noNote[0].need.text).not.toMatch(/note/);
    expect(noNote[0].need.actionLabel).toBe('Open the job');
    expect(deriveHandoffNeeds(
      live,
      handoffLeads,
      'u-me',
      new Map([['handoff:project-1', { actedAt: '2026-10-10T12:00:00.000Z' } as NeedState]]),
    )).toEqual([]);
  });
});
