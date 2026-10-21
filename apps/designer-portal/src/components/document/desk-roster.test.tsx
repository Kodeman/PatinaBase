/**
 * The ledger under Today (US-25 slice 4; US-28 S3 change 2): every live job
 * Today does not hold, one ledger row each, in four groups — Also yours ·
 * With others · Coming back · No current alert — and in the studio's scope,
 * one section per person. Retired: "Studio workload", "By team member" and
 * "The work is in motion". Never a count.
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type {
  DeskLedger,
  DeskLedgerGroup,
  DeskLedgerLine,
  RosterLine,
} from '@/lib/document/desk-roster-derivation';
import { openLedger } from '@/components/document/command-bar';
import { DeskRoster } from './desk-roster';

jest.mock('@patina/supabase', () => ({
  useSetNeedState: () => ({ mutate: jest.fn(), isPending: false }),
}));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
jest.mock('@/components/document/command-bar', () => ({
  openLedger: jest.fn(),
}));

function rosterLine(id: string, over: Partial<RosterLine> = {}): RosterLine {
  return {
    engagementId: id,
    name: `Job ${id}`,
    stage: 'project',
    designerId: null,
    state: `Job ${id} · quiet`,
    personLine: `Job ${id}`,
    overdueText: null,
    mark: null,
    needKind: null,
    overdue: { isOverdue: false, days: 0 },
    jobHref: `/doc/${id}`,
    act: { label: 'Open the job', href: `/doc/${id}` },
    client: `Client ${id}`,
    custody: 'No current alert',
    needOwner: null,
    dueOn: null,
    valueText: null,
    needText: null,
    motionText: null,
    projectId: id,
    ...over,
  };
}

function ledgerLine(id: string, over: Partial<DeskLedgerLine> = {}, line: Partial<RosterLine> = {}): DeskLedgerLine {
  return { line: rosterLine(id, line), standing: 'yours', settled: null, waiting: null, back: null, ...over };
}

function group(key: DeskLedgerGroup['key'], label: string, lines: DeskLedgerLine[]): DeskLedgerGroup {
  return { key, label, lines };
}

const MINE: DeskLedger = {
  notChecked: null,
  sections: [
    {
      key: 'mine',
      label: null,
      groups: [
        group('yours', 'Also yours', [
          ledgerLine(
            'thornfield',
            {},
            {
              needKind: 'overdue_invoice',
              needText: 'Invoice 1042 is overdue',
              act: { label: 'Send reminder', href: '/doc/thornfield', ledger: { name: 'accounts', context: {} } },
            },
          ),
        ]),
        group('others', 'With others', [
          ledgerLine(
            'halloran',
            { standing: 'others', waiting: { who: 'Mae Halloran', since: '2026-10-06' } },
            { needKind: 'po_unacknowledged', needText: 'Fabric samples, not yet opened' },
          ),
        ]),
        group('back', 'Coming back', []),
        group('rest', 'No current alert', [
          ledgerLine('kuehn', { standing: 'rest' }),
          ledgerLine('reinhardt', { standing: 'rest' }, { projectId: null }),
        ]),
      ],
    },
  ],
};

const rows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-ledger-row]')).map((row) =>
    row.getAttribute('data-ledger-row'),
  );

beforeEach(() => jest.mocked(openLedger).mockReset());

describe('DeskRoster — the ledger (US-28 S3)', () => {
  it('stands Also yours, then With others, then the quiet fold, and drops an empty group', () => {
    const { container } = render(<DeskRoster ledger={MINE} />);
    const labels = Array.from(container.querySelectorAll('[data-roster-group] > .sub > span:first-child')).map(
      (el) => el.textContent,
    );
    expect(labels).toEqual(['Also yours', 'With others', 'No current alert']);
    expect(container.querySelector('[data-roster-group="back"]')).toBeNull();
    expect(rows(container)).toEqual(['thornfield', 'halloran', 'kuehn']);
  });

  it('retires the workload head, the person facet and the motion sentence, and counts nothing', () => {
    const { container } = render(<DeskRoster ledger={MINE} />);
    expect(container.textContent).not.toMatch(/Studio workload|By team member|The work is in motion|\d+ live|\(\d+\)/);
    expect(screen.queryByRole('button', { name: /By person|By team member/ })).toBeNull();
  });

  it('a quiet job on a project always prints; only leads and drafts fold behind one Show (Kody 2026-10-13)', async () => {
    const { container } = render(<DeskRoster ledger={MINE} />);
    const show = screen.getByRole('button', { name: 'Show jobs with no current alert' });
    expect(show).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector('[data-ledger-row="kuehn"]')).not.toBeNull();
    expect(container.querySelector('[data-ledger-row="reinhardt"]')).toBeNull();
    await act(async () => {
      await userEvent.setup().click(show);
    });
    expect(show).toHaveAttribute('aria-expanded', 'true');
    // The label never changes with state (IX18).
    expect(show).toHaveTextContent(/^Show$/);
    expect(container.querySelector('[data-ledger-row="reinhardt"]')).not.toBeNull();
  });

  it('prints no Show where every quiet job stands on a project', () => {
    const projectsOnly: DeskLedger = {
      notChecked: null,
      sections: [{ key: 'mine', label: null, groups: [group('rest', 'No current alert', [ledgerLine('kuehn', { standing: 'rest' })])] }],
    };
    const { container } = render(<DeskRoster ledger={projectsOnly} />);
    expect(screen.queryByRole('button', { name: /Show/ })).toBeNull();
    expect(rows(container)).toEqual(['kuehn']);
  });

  it('a row with others and a row coming back print no act; a row of hers keeps its one', () => {
    const { container } = render(<DeskRoster ledger={MINE} />);
    const act = (id: string) => container.querySelector(`[data-ledger-row="${id}"] [data-ledger-cell="act"]`)!;
    expect(act('halloran').childElementCount).toBe(0);
    expect(within(act('thornfield') as HTMLElement).getByRole('button', { name: 'Send reminder — Job thornfield' }))
      .toBeInTheDocument();
  });

  it('opens the ledger for a ledger act', async () => {
    render(<DeskRoster ledger={MINE} />);
    await act(async () => {
      await userEvent.setup().click(screen.getByRole('button', { name: 'Send reminder — Job thornfield' }));
    });
    expect(openLedger).toHaveBeenCalledWith('accounts', {});
  });

  it('keeps its acts in one region that elects no leader, and the walkthrough anchors', () => {
    const { container } = render(<DeskRoster ledger={MINE} />);
    const region = screen.getByRole('group', { name: 'The rest of the jobs, actions' });
    expect(region).toHaveAttribute('data-action-region', 'every-job');
    expect(region.querySelector('[data-action-variant="primary"], [data-action-variant="plate"]')).toBeNull();
    expect(screen.getByTestId('desk-roster')).toHaveAttribute('data-tour-anchor', 'desk-needs-your-hand');
    expect(container.querySelector('[data-roster-group="yours"]')).toHaveAttribute('data-tour-anchor', 'desk-folio');
  });

  it('in the studio’s scope, sets one section per person, each under its own eyebrow', () => {
    const studio: DeskLedger = {
      notChecked: null,
      sections: [
        { key: 'person-leah', label: 'Leah’s', groups: [group('yours', 'Also yours', [ledgerLine('thornfield')])] },
        {
          key: 'person-jordan',
          label: 'Jordan’s',
          groups: [group('yours', 'With Jordan', [ledgerLine('wren')]), group('back', 'Coming back', [])],
        },
        { key: 'person-sam', label: 'Sam’s', groups: [group('yours', 'With Sam', [])] },
      ],
    };
    const { container } = render(
      <DeskRoster
        ledger={studio}
        holderOf={(id) => (id === 'wren' ? { userId: 'u-jordan', name: 'Jordan', mine: false } : { userId: 'me', name: 'Leah', mine: true })}
      />,
    );
    const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-ledger-section]'));
    expect(sections.map((s) => s.getAttribute('data-ledger-section'))).toEqual(['person-leah', 'person-jordan']);
    expect(sections[0].querySelector('.sec-head')).toHaveTextContent(/^Leah’s$/);
    expect(sections[1].querySelector('.sec-head')).toHaveTextContent(/^Jordan’s$/);
    expect(within(sections[1]).getByText('With Jordan')).toBeInTheDocument();
    // Jordan's row is his to move.
    expect(sections[1].querySelector('[data-ledger-cell="sentence"]')).toHaveTextContent(/The move is Jordan’s\.$/);
    expect(sections[1].querySelector('[data-ledger-cell="act"]')!.childElementCount).toBe(0);
  });

  it('says whose the rest of the studio’s jobs are, in Mine', () => {
    render(<DeskRoster ledger={MINE} othersHold="The rest of the studio’s jobs are Leah’s." />);
    expect(screen.getByText('The rest of the studio’s jobs are Leah’s.')).toBeInTheDocument();
  });

  it('says what went unchecked when there is no row to print', () => {
    render(<DeskRoster ledger={{ sections: [], notChecked: 'Not checked: project leads.' }} />);
    expect(screen.getByText('Not checked: project leads.')).toHaveAttribute('data-tour-anchor', 'desk-folio');
  });

  it('labels a quiet group Not checked while a feed is unread, and still folds it', () => {
    const ledger: DeskLedger = {
      notChecked: 'Not checked: purchase orders.',
      sections: [
        {
          key: 'mine',
          label: null,
          groups: [group('rest', 'Not checked', [ledgerLine('reinhardt', { standing: 'rest' }, { projectId: null })])],
        },
      ],
    };
    const { container } = render(<DeskRoster ledger={ledger} />);
    expect(container.querySelector('[data-roster-group="rest"]')).toHaveTextContent(/^Not checkedShow$/);
    expect(container.textContent).not.toMatch(/No current alert/);
  });
});
