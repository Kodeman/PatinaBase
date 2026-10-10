/**
 * The line roster (US-25 slice 4): one dense line per job under the Day
 * Sheet, in three groups — Owed by you · Waiting on others · at rest — the
 * stage plates gone to an ink word (Q7), and "Only what needs me" retired
 * for the sheet's scope (fix-now 1).
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  DeskFolder,
  DocumentStateRow,
  NeedLine,
} from '@/lib/document/desk-derivation';
import {
  deriveDeskRoster,
  type DeskRoster as DeskRosterModel,
  type RosterMember,
} from '@/lib/document/desk-roster-derivation';
import { openLedger } from '@/components/document/command-bar';
import { DeskRoster } from './desk-roster';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

const LEAH = 'user-leah';
const ANNEKE = 'user-anneke';

function member(over: Partial<RosterMember> = {}): RosterMember {
  return {
    user_id: LEAH,
    role: 'owner',
    status: 'active',
    profiles: { full_name: 'Leah Hartwell', display_name: null },
    ...over,
  };
}

const STUDIO: RosterMember[] = [
  member(),
  member({
    user_id: ANNEKE,
    role: 'member',
    profiles: { full_name: 'Anneke Sund', display_name: null },
  }),
];

function roster(over: Partial<DeskRosterModel> = {}): DeskRosterModel {
  return {
    heading: 'Every job · 3 live · 1 overdue',
    overdueLine: 'One thing is overdue — Vandersteen.',
    liveCount: 3,
    overdueCount: 1,
    unreadFeeds: [],
    notChecked: null,
    groups: [
      {
        key: 'proposal',
        label: 'Proposal',
        count: 1,
        lines: [
          {
            engagementId: 'byrne',
            name: 'Byrne remodel',
            stage: 'proposal',
            designerId: ANNEKE,
            state: 'Erin Byrne · design agreement sent August 19',
            overdueText: null,
            mark: 'quiet',
            custody: 'Awaiting Erin',
            needOwner: 'client',
            needKind: 'hesitating_proposal',
            needText: 'Sent 19 August — not yet opened',
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/byrne',
            act: { label: 'Follow up', href: '/doc/byrne' },
          },
        ],
      },
      {
        key: 'project',
        label: 'Project',
        count: 2,
        lines: [
          {
            engagementId: 'vandersteen',
            name: 'Vandersteen residence',
            stage: 'project',
            designerId: null,
            state: 'Anne Vandersteen · Procurement And Orders',
            overdueText:
              'Overdue 6 days — Invoice 1042 · $17,500 overdue — oldest due Aug 2 — send a reminder',
            mark: 'urgent',
            custody: 'Action with you',
            needOwner: 'designer',
            needKind: 'overdue_invoice',
            overdue: { isOverdue: true, days: 6 },
            jobHref: '/doc/vandersteen',
            act: {
              label: 'Send reminder',
              href: '/doc/vandersteen',
              ledger: {
                name: 'accounts',
                context: { page: 'receivables', invoiceId: 'inv-1' },
              },
            },
          },
          {
            engagementId: 'reinhardt',
            name: 'Reinhardt lake house',
            stage: 'project',
            designerId: LEAH,
            state: 'Reinhardt · Site Visit · quiet · no current alert',
            overdueText: null,
            mark: null,
            needKind: null,
            overdue: { isOverdue: false, days: 0 },
            jobHref: '/doc/reinhardt',
            act: { label: 'Open the job', href: '/doc/reinhardt' },
            custody: 'No current alert',
            needOwner: null,
            motionText: 'With client since 4 Aug',
            valueText: '4 Aug',
          },
        ],
      },
    ],
    ...over,
  };
}

const groupKeys = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-roster-group]')).map((g) =>
    g.getAttribute('data-roster-group'),
  );
const linesIn = (container: HTMLElement, group: string) =>
  Array.from(
    container.querySelectorAll(`[data-roster-group="${group}"] [data-ledger-row]`),
  ).map((row) => row.getAttribute('data-ledger-row'));

describe('DeskRoster — the head', () => {
  it('names the roster and prints no count, no overdue sentence', () => {
    render(<DeskRoster roster={roster()} />);
    expect(screen.getByText('Every job')).toBeInTheDocument();
    expect(screen.queryByText(/\d+ live/)).not.toBeInTheDocument();
    expect(screen.queryByText(/overdue — Vandersteen/)).not.toBeInTheDocument();
  });

  it('retires “Only what needs me” — the Day Sheet’s scope replaced it (fix-now 1)', () => {
    render(<DeskRoster roster={roster()} studioMembers={STUDIO} />);
    expect(screen.queryByRole('button', { name: 'Only what needs me' })).toBeNull();
  });
});

describe('DeskRoster — three groups by custody', () => {
  it('stands Owed by you, then Waiting on others, then at rest', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    expect(groupKeys(container)).toEqual(['owed', 'waiting', 'rest']);
    expect(
      Array.from(container.querySelectorAll('[data-roster-group] h3')).map((h) => h.textContent),
    ).toEqual(['Owed by you', 'Waiting on others', 'No current alert']);
    expect(linesIn(container, 'owed')).toEqual(['vandersteen']);
    expect(linesIn(container, 'waiting')).toEqual(['byrne']);
    expect(linesIn(container, 'rest')).toEqual(['reinhardt']);
  });

  it('never calls the quiet jobs at rest while a feed went unread (fix-now 6)', () => {
    const { container } = render(
      <DeskRoster
        roster={roster({ unreadFeeds: ['invoices'], notChecked: 'Not checked: invoices.' })}
      />,
    );
    const rest = container.querySelector('[data-roster-group="rest"] h3');
    expect(rest).toHaveTextContent('Not checked');
    expect(rest).not.toHaveTextContent('No current alert');
  });

  it('drops a group with no job in it', () => {
    const model = roster();
    model.groups = [model.groups[1]];
    const { container } = render(<DeskRoster roster={model} />);
    expect(groupKeys(container)).toEqual(['owed', 'rest']);
  });

  it('moves a job whose need is gone into the at-rest group', () => {
    const model = roster();
    model.groups[0].lines[0].mark = null;
    model.groups[0].lines[0].needKind = null;
    const { container } = render(<DeskRoster roster={model} />);
    expect(linesIn(container, 'waiting')).toEqual([]);
    expect(linesIn(container, 'rest')).toEqual(['byrne', 'reinhardt']);
  });
});

describe('DeskRoster — one dense line per job', () => {
  it('prints one line and one act per job, and no card', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const rows = container.querySelectorAll('[data-ledger-row]');
    expect(rows).toHaveLength(3);
    for (const row of rows) expect(row.querySelectorAll('.da-act')).toHaveLength(1);
    expect(container.querySelector('[data-claim-card]')).toBeNull();
  });

  it('prints the phase as an ink word — the stage plates are gone (Q7)', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    expect(container.querySelector('[data-stage-tab]')).toBeNull();
    expect(
      Array.from(container.querySelectorAll('[data-ledger-cell="phase"]')).map((c) => c.textContent),
    ).toEqual(['Project', 'Proposal', 'Project']);
  });

  it('wears no mark, badge or count beside a job (Q1)', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    expect(container.querySelector('[data-roster-mark]')).toBeNull();
    expect(container.querySelector('[data-mark-tone]')).toBeNull();
    for (const el of container.querySelectorAll('*')) {
      expect(el.className.toString()).not.toMatch(/\bshadow-|\bdrop-shadow\b|\brounded-full\b/);
    }
  });

  it('prints the head need’s sentence, the overdue form first', () => {
    render(<DeskRoster roster={roster()} />);
    const overdue = screen.getByText(/Overdue 6 days/);
    expect(overdue).toHaveTextContent('$17,500');
    expect(screen.getByText('Sent 19 August — not yet opened')).toBeInTheDocument();
    expect(screen.getByText('With client since 4 Aug')).toBeInTheDocument();
  });

  it('carries the custody word under the name', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    const names = Array.from(container.querySelectorAll('[data-ledger-cell="name"]')).map(
      (cell) => cell.textContent,
    );
    expect(names).toEqual([
      'Vandersteen residenceAction with you',
      'Byrne remodelAwaiting Erin',
      'Reinhardt lake houseNo current alert',
    ]);
  });

  it('lets a long name and its sentence wrap instead of widening the page (390)', () => {
    const { container } = render(<DeskRoster roster={roster()} />);
    for (const el of container.querySelectorAll(
      '[data-roster-name], [data-ledger-cell="sentence"]',
    )) {
      expect(el.className.toString()).toContain('[overflow-wrap:anywhere]');
      expect(el.className.toString()).not.toContain('truncate');
      expect(el.className.toString()).not.toContain('whitespace-nowrap');
    }
  });
});

describe('DeskRoster — the acts', () => {
  it('names the job on every act', () => {
    render(<DeskRoster roster={roster()} />);
    expect(
      screen.getByRole('button', { name: 'Send reminder — Vandersteen residence' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Follow up — Byrne remodel' })).toHaveAttribute(
      'href',
      '/doc/byrne',
    );
    expect(
      screen.getByRole('link', { name: 'Open the job — Reinhardt lake house' }),
    ).toBeInTheDocument();
  });

  it('opens the ledger for a ledger act', async () => {
    render(<DeskRoster roster={roster()} />);
    await act(async () => {
      await userEvent
        .setup()
        .click(screen.getByRole('button', { name: 'Send reminder — Vandersteen residence' }));
    });
    expect(openLedger).toHaveBeenCalledWith('accounts', {
      page: 'receivables',
      invoiceId: 'inv-1',
    });
  });

  it('opens the job from its own name', () => {
    render(<DeskRoster roster={roster()} />);
    expect(screen.getByRole('link', { name: 'Vandersteen residence' })).toHaveAttribute(
      'href',
      '/doc/vandersteen',
    );
  });
});

describe('DeskRoster — By person', () => {
  async function toggle() {
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'By person' }));
    });
  }

  it('offers no By person act when no member of the studio can be named', () => {
    render(<DeskRoster roster={roster()} />);
    expect(screen.queryByRole('button', { name: 'By person' })).toBeNull();
  });

  it('regroups the same lines by person, unassigned under the principal', async () => {
    const { container } = render(<DeskRoster roster={roster()} studioMembers={STUDIO} />);
    const byPerson = screen.getByRole('button', { name: 'By person' });
    expect(byPerson).toHaveAttribute('aria-pressed', 'false');
    await toggle();
    expect(screen.getByRole('button', { name: 'By person' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(groupKeys(container)).toEqual([`person-${LEAH}`, `person-${ANNEKE}`]);
    expect(linesIn(container, `person-${LEAH}`)).toEqual(['vandersteen', 'reinhardt']);
    expect(linesIn(container, `person-${ANNEKE}`)).toEqual(['byrne']);
  });
});

describe('DeskRoster — an empty desk', () => {
  it('says the work is in motion and keeps the walkthrough anchor', () => {
    const { container } = render(<DeskRoster roster={roster({ groups: [], liveCount: 0 })} />);
    expect(
      screen.getByText('No current action alerts. The work is in motion.'),
    ).toBeInTheDocument();
    expect(container.querySelector('[data-tour-anchor="desk-folio"]')).not.toBeNull();
  });

  it('says what went unchecked instead, never the at-rest line', () => {
    render(
      <DeskRoster
        roster={roster({
          groups: [],
          liveCount: 0,
          unreadFeeds: ['invoices'],
          notChecked: 'Not checked: invoices.',
        })}
      />,
    );
    expect(screen.getByText('Not checked: invoices.')).toBeInTheDocument();
    expect(screen.queryByText(/No current action alerts/)).toBeNull();
  });

  it('keeps the desk-folio anchor on the first group when every job is at rest', () => {
    const quiet = roster();
    quiet.groups = quiet.groups.map((group) => ({
      ...group,
      lines: group.lines.map((line) => ({
        ...line,
        mark: null,
        needKind: null,
        needOwner: null,
        custody: 'No current alert',
        overdueText: null,
        overdue: { isOverdue: false, days: 0 },
      })),
    }));
    const { container } = render(<DeskRoster roster={quiet} />);
    expect(groupKeys(container)).toEqual(['rest']);
    const anchor = container.querySelector('[data-tour-anchor="desk-folio"]');
    expect(anchor?.closest('[data-roster-group]')).toHaveAttribute('data-roster-group', 'rest');
  });
});

// US-19 FR4 Fix 5 — the line's act agrees with the paper. Built through the
// real derivation so the printed act is what `one-voice` derives.
describe('DeskRoster — the line act agrees with the paper (FR4 Fix 5)', () => {
  const NOW = new Date('2026-08-25T12:00:00Z');
  const docRow = (id: string, title: string, over: Partial<DocumentStateRow>) =>
    ({
      engagement_id: id,
      title,
      client_name: `Family ${id}`,
      active_section: 'project',
      current_phase: null,
      updated_at: '2026-08-01T00:00:00Z',
      ...over,
    }) as unknown as DocumentStateRow;
  const needLine = (over: Partial<NeedLine>) =>
    ({
      stamp: { label: 'DUE', color: 'var(--color-clay)' },
      urgent: false,
      ...over,
    }) as NeedLine;

  const cedar = docRow('cedar', 'Cedar house', { active_section: 'install' });
  const wright = docRow('wright', 'Wright apartment', {
    active_section: 'brief',
    engagement_kind: 'lead',
    lead_status: 'new',
  });
  const aspen = docRow('aspen', 'Aspen residence', {
    active_section: 'proposal',
    client_name: 'Client User',
    client_profile_id: 'client-aspen',
    proposal_status: 'sent',
    proposal_sent_at: '2026-08-20T00:00:00Z',
    proposal_viewed_at: null,
  });
  const folders = [
    {
      row: cedar,
      need: needLine({
        kind: 'schedule_unconfigured',
        text: 'Name the phases for this project',
        actionLabel: 'Open the schedule',
      }),
    },
    {
      row: wright,
      need: needLine({
        kind: 'new_lead',
        text: 'New lead — respond by Aug 27',
        actionLabel: null,
        owner: 'designer',
      }),
    },
    {
      row: aspen,
      need: needLine({
        kind: 'hesitating_proposal',
        text: 'Sent 20 August — not yet opened',
        actionLabel: 'Follow up',
        owner: 'client',
      }),
    },
  ] as DeskFolder[];
  const derived = (oneVoice: boolean) =>
    deriveDeskRoster({ folders, chips: [], live: [cedar, wright, aspen], oneVoice }, NOW);

  it('one-voice on: setup at rest, Respond to the inquiry, Nudge the client', () => {
    const { container } = render(<DeskRoster roster={derived(true)} />);

    const cedarAct = screen.getByRole('link', { name: 'Open the job — Cedar house' });
    expect(cedarAct.closest('[data-roster-group]')).toHaveAttribute('data-roster-group', 'rest');
    expect(screen.queryByText(/Name the phases for this project/)).toBeNull();

    const wrightAct = screen.getByRole('link', {
      name: 'Respond to the inquiry — Wright apartment',
    });
    expect(wrightAct).toHaveAttribute('href', '/doc/wright');
    const wrightLine = wrightAct.closest<HTMLElement>('[data-ledger-row]')!;
    expect(within(wrightLine).getByText('New lead — respond by Aug 27')).toBeInTheDocument();
    expect(wrightLine.closest('[data-roster-group]')).toHaveAttribute('data-roster-group', 'owed');

    const aspenAct = screen.getByRole('link', { name: 'Nudge the client — Aspen residence' });
    expect(aspenAct).toHaveAttribute('href', '/doc/aspen');
    expect(aspenAct.closest('[data-roster-group]')).toHaveAttribute('data-roster-group', 'waiting');
    expect(linesIn(container, 'rest')).toEqual(['cedar']);
  });

  it('one-voice off: each line keeps its own act', () => {
    render(<DeskRoster roster={derived(false)} />);
    expect(screen.getByRole('link', { name: 'Open the schedule — Cedar house' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open the job — Wright apartment' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Follow up — Aspen residence' })).toBeInTheDocument();
  });
});
