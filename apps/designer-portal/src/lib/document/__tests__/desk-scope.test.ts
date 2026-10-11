import {
  custodyFor,
  deriveHandoffNeeds,
  handoffReadFor,
  scopeDeskNeeds,
  type DeskLeads,
} from '../desk-scope';
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

  describe('a job no one leads yet (no lead_designer row)', () => {
    const inquiry = deskNeed('eng-inquiry', 'designer', { kind: 'new_lead' });
    const hers = deskNeed('eng-hers', 'designer');
    const nobodys = deskNeed('eng-nobody', 'designer');
    const designers = new Map<string, string | null>([
      ['eng-inquiry', 'u-me'],
      ['eng-hers', 'u-other'],
      ['eng-nobody', null],
    ]);

    it('a leadless inquiry whose designer is me is Mine', () => {
      expect(scopeDeskNeeds([inquiry], leads, 'u-me', 'mine', designers)).toEqual([inquiry]);
    });

    it('a leadless job whose designer is someone else is not', () => {
      expect(scopeDeskNeeds([hers], leads, 'u-me', 'mine', designers)).toEqual([]);
    });

    it('a leadless job with no designer at all stays on Mine', () => {
      expect(scopeDeskNeeds([nobodys], leads, 'u-me', 'mine', designers)).toEqual([nobodys]);
    });

    it('a lead row still decides over the designer', () => {
      const led = new Map<string, string | null>([['theirs', 'u-me']]);
      expect(scopeDeskNeeds([deskNeed('theirs', 'designer')], leads, 'u-me', 'mine', led)).toEqual([]);
    });
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
    // Walk W-D7 — the previous lead by first name.
    expect(unread[0].need.text).toMatch(/^Nina handed you Oak House on .* · Read Nina's note$/);
    expect(unread[0].need.actionLabel).toBe('Read the note');
    const noNote = deriveHandoffNeeds(live, handoffLeads, 'u-me', new Map(), false);
    expect(noNote[0].need.text).not.toMatch(/note/);
    expect(noNote[0].need.actionLabel).toBe('Open project file');
    expect(deriveHandoffNeeds(
      live,
      handoffLeads,
      'u-me',
      new Map([['handoff:project-1', { actedAt: '2026-10-10T12:00:00.000Z' } as NeedState]]),
    )).toEqual([]);
  });

  it('never lets a read of an earlier hand-off silence a later one of the same job (SQ-751 F9)', () => {
    const leads: DeskLeads = new Map([
      ['project-1', {
        leadUserId: 'u-me',
        leadName: 'Maya Lee',
        previousLeadUserId: 'u-old',
        previousLeadName: 'Nina Park',
        assignedAt: '2026-10-10T12:00:00.000Z',
      }],
    ]);
    const live = [{ project_id: 'project-1', title: 'Oak House' } as DocumentStateRow];
    const readOct1 = new Map([
      ['handoff:project-1', { actedAt: '2026-10-01T12:00:00.000Z' } as NeedState],
    ]);
    expect(deriveHandoffNeeds(live, leads, 'u-me', readOct1)).toHaveLength(1);
    expect(handoffReadFor({ actedAt: '2026-10-01T12:00:00.000Z' }, '2026-10-10T12:00:00.000Z')).toBe(false);
    expect(handoffReadFor({ actedAt: '2026-10-10T12:00:00.000Z' }, '2026-10-10T12:00:00.000Z')).toBe(true);
    expect(handoffReadFor(undefined, '2026-10-10T12:00:00.000Z')).toBe(false);
  });

  it('names a previous lead with no first name in full (walk W-D7)', () => {
    const leads: DeskLeads = new Map([
      ['project-1', {
        leadUserId: 'u-me',
        leadName: 'Maya Lee',
        previousLeadUserId: 'u-old',
        previousLeadName: 'Nina',
        assignedAt: '2026-10-10T12:00:00.000Z',
      }],
    ]);
    const live = [{ project_id: 'project-1', title: 'Oak House' } as DocumentStateRow];
    expect(deriveHandoffNeeds(live, leads, 'u-me', new Map(), false)[0].need.text)
      .toMatch(/^Nina handed you Oak House on /);
  });
});
