import {
  custodyFor,
  deriveHandoffNeeds,
  deskHolderOf,
  handoffNoteFor,
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

  it('keeps studio-level needs visible in Mine without assigning them to a project', () => {
    const studioNeed = { ...deskNeed('studio-1', 'designer'), studioLevel: true, studioId: 'studio-1' };
    expect(scopeDeskNeeds([studioNeed], leads, 'u-me', 'mine')).toEqual([studioNeed]);
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
    // US-28 change 5 — an act still owed is hers, whoever owns the need.
    [deskNeed('mine', 'maker'), 'mine', 'Action with you'],
    [deskNeed('mine', 'client'), 'mine', 'Action with you'],
  ] as const)('names the custody holder as %s', (entry, projectId, expected) => {
    expect(custodyFor(entry.need, leads, 'u-me', projectId)).toBe(expected);
  });

  it('says Awaiting {who} once the studio has acted, and No current alert with no need', () => {
    expect(custodyFor(deskNeed('mine', 'client').need, leads, 'u-me', 'mine', 'Ari')).toBe('Awaiting Ari');
    expect(custodyFor(deskNeed('mine', 'client').need, leads, 'u-me', 'mine', '  ')).toBe('Action with you');
    expect(custodyFor(null, leads, 'u-me', 'mine', 'Ari')).toBe('No current alert');
  });

  it('deskHolderOf names the lead, else the designer, and marks the seat’s own', () => {
    const designers = new Map<string, string | null>([['eng-hers', 'u-other'], ['eng-mine', 'u-me']]);
    const names = new Map([['u-other', 'Nina Park'], ['u-me', 'Maya Lee']]);
    const holderOf = deskHolderOf(leads, 'u-me', designers, names);

    expect(holderOf('mine')).toEqual({ userId: 'u-me', name: 'Maya', mine: true });
    expect(holderOf('theirs')).toEqual({ userId: 'u-other', name: 'Nina', mine: false });
    expect(holderOf('eng-hers')).toEqual({ userId: 'u-other', name: 'Nina', mine: false });
    expect(holderOf('eng-mine')).toEqual({ userId: 'u-me', name: 'Maya', mine: true });
    expect(holderOf('unknown')).toEqual({ userId: null, name: null, mine: false });
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
    // Her seat's invite note, written by the previous lead (SQ-778 N3).
    const seat = { handoff_note: 'Oak House is yours from today', invited_by: 'u-old' };
    const unread = deriveHandoffNeeds(live, handoffLeads, 'u-me', new Map(), seat);

    expect(unread).toHaveLength(1);
    // Walk W-D7 — the previous lead by first name.
    expect(unread[0].need.text).toMatch(/^Nina handed you Oak House on .* · Read Nina's note$/);
    expect(unread[0].need.actionLabel).toBe('Read the note');
    // SQ-778 N2 — the press lands on the note itself, not the top of the file.
    expect(unread[0].need.deepLink).toBe('/doc/project-1#hand-off');
    const noNote = deriveHandoffNeeds(live, handoffLeads, 'u-me', new Map(), null);
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

  it('keeps a hand-off read today, for the Day Sheet to settle in place (US-28 U-Q2)', () => {
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
    const read = new Map([
      ['handoff:project-1', { actedAt: new Date(2026, 9, 12, 9, 0).toISOString() } as NeedState],
    ]);

    expect(deriveHandoffNeeds(live, leads, 'u-me', read, null, new Date(2026, 9, 12, 17, 50))).toHaveLength(1);
    expect(deriveHandoffNeeds(live, leads, 'u-me', read, null, new Date(2026, 9, 13, 8, 0))).toEqual([]);
    expect(deriveHandoffNeeds(live, leads, 'u-me', read)).toEqual([]);
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
    expect(deriveHandoffNeeds(live, leads, 'u-me', new Map(), null)[0].need.text)
      .toMatch(/^Nina handed you Oak House on /);
  });
});

describe('handoffNoteFor (SQ-778 N2/N3 — the one rule for where the invite note prints)', () => {
  const seat = { handoff_note: 'Marsh Street is yours from today', invited_by: 'u-leah' };
  const handedByLeah = { leadUserId: 'u-me', previousLeadUserId: 'u-leah' };

  it('prints the note on a job its writer handed her', () => {
    expect(handoffNoteFor(handedByLeah, 'u-me', seat)).toBe('Marsh Street is yours from today');
  });

  it('prints no note on a job she leads with no hand-off', () => {
    expect(handoffNoteFor({ leadUserId: 'u-me' }, 'u-me', seat)).toBeNull();
  });

  it('prints no note on a job handed over by someone other than the writer', () => {
    expect(handoffNoteFor({ leadUserId: 'u-me', previousLeadUserId: 'u-sam' }, 'u-me', seat)).toBeNull();
  });

  it('prints no note on a job someone else leads, nor with no note or no viewer', () => {
    expect(handoffNoteFor({ leadUserId: 'u-other', previousLeadUserId: 'u-leah' }, 'u-me', seat)).toBeNull();
    expect(handoffNoteFor(handedByLeah, 'u-me', { handoff_note: '  ', invited_by: 'u-leah' })).toBeNull();
    expect(handoffNoteFor(handedByLeah, null, seat)).toBeNull();
    expect(handoffNoteFor(null, 'u-me', seat)).toBeNull();
  });

  it('the Day Sheet line offers "Read the note" only on the gated job', () => {
    const leads: DeskLeads = new Map([
      ['marsh', { leadUserId: 'u-me', leadName: 'Jordan Pike', previousLeadUserId: 'u-leah', previousLeadName: 'Leah Moreau', assignedAt: '2026-10-10T12:00:00.000Z' }],
      ['holloway', { leadUserId: 'u-me', leadName: 'Jordan Pike', previousLeadUserId: 'u-sam', previousLeadName: 'Sam Ortiz', assignedAt: '2026-10-10T12:00:00.000Z' }],
    ]);
    const live = [
      { project_id: 'marsh', title: 'Marsh Street' } as DocumentStateRow,
      { project_id: 'holloway', title: 'Holloway' } as DocumentStateRow,
    ];
    const byProject = new Map(deriveHandoffNeeds(live, leads, 'u-me', new Map(), seat).map((n) => [n.projectId, n.need]));
    expect(byProject.get('marsh')?.actionLabel).toBe('Read the note');
    expect(byProject.get('holloway')?.actionLabel).toBe('Open project file');
    expect(byProject.get('holloway')?.text).not.toMatch(/note/);
  });
});
