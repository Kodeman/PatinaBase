import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MarginRail, ResponsiveMarginRail } from '../margin-rail';
import type { MarginItemRow } from '@/lib/document/margin-derivation';

let mockCoordinationQuery: {
  data: Array<Record<string, unknown>> | undefined;
  isLoading?: boolean;
  isPending?: boolean;
  isError?: boolean;
};

const item = (overrides: Partial<MarginItemRow>): MarginItemRow =>
  ({
    kind: 'message',
    item_id: 'message-1',
    project_id: 'project-1',
    proposal_id: null,
    anchor_kind: 'letterhead',
    anchor_id: null,
    state: 'open',
    title: 'Client message',
    detail: '',
    ts: '2026-08-11T12:00:00.000Z',
    payload: {},
    ...overrides,
  }) as MarginItemRow;

const STAGE_2_ROWS: MarginItemRow[] = [
  item({
    kind: 'decision',
    item_id: 'stage-2',
    state: 'pending',
    title: 'Stage-2 approval',
  }),
  item({}),
];

let mockMarginRows: MarginItemRow[];

jest.mock('@/hooks/use-margin-items', () => ({
  useMarginItems: () => ({ data: mockMarginRows, isLoading: false }),
}));

jest.mock('@patina/supabase', () => ({
  useCoordinationItems: () => mockCoordinationQuery,
  useProjectContextualHandoffs: () => ({ data: [], isError: false }),
  useProjectFFEItems: () => ({ data: [] }),
  useProjectParties: () => ({ data: [] }),
  useProjectPhases: () => ({ data: [] }),
  useDesignerClientForClientUser: () => ({ data: null }),
  isProjectArtifactApproval: (item: { approval_contract?: string | null }) =>
    item.approval_contract === 'project_artifact_v1',
}));

jest.mock('@/hooks/use-section-work', () => ({
  useSectionTasks: () => ({ data: [] }),
}));

jest.mock('@/hooks/use-margin-notes', () => ({
  useCreateMarginNote: () => ({ mutate: jest.fn(), isPending: false }),
}));

jest.mock('@/hooks/use-project-file-change-notifications', () => ({
  useProjectFileChangeNotifications: () => ({ data: [] }),
  useMarkProjectFileChangeRead: () => jest.fn(),
}));

jest.mock('../margin-item', () => {
  const actual = jest.requireActual('../margin-item');
  return {
    ...actual,
    MarginItem: ({ row, children }: { row: { title: string }; children: ReactNode }) => (
      <div>
        <span>{row.title}</span>
        {children}
      </div>
    ),
  };
});

jest.mock('../margin-bodies', () => ({
  MarginItemBody: ({ row }: { row: { title: string } }) => (
    <span>Body: {row.title}</span>
  ),
}));

jest.mock('../margin-note', () => ({
  MarginNote: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  mockMarginRows = STAGE_2_ROWS;
  mockCoordinationQuery = { data: [] };
});

describe('desktop Stage-2 margin classification', () => {
  it.each([
    ['loading', { isLoading: true }, 'status'],
    ['error', { isError: true }, 'alert'],
  ] as const)(
    'withholds decision bodies, preserves messages, and announces %s',
    (_state, queryState, role) => {
      mockCoordinationQuery = { data: undefined, ...queryState };

      render(
        <MarginRail
          projectId="project-1"
          proposalId={null}
          clientName="Client"
          onHoverLine={jest.fn()}
        />,
      );

      expect(screen.getByRole(role)).toBeVisible();
      expect(screen.queryByText('Stage-2 approval')).not.toBeInTheDocument();
      expect(screen.queryByText('Body: Stage-2 approval')).not.toBeInTheDocument();
      expect(screen.getByText('Client message')).toBeVisible();
      expect(screen.getByText('Body: Client message')).toBeVisible();
    },
  );
});

describe('the margin, grouped by anchor (RF-03)', () => {
  const GROUPED: MarginItemRow[] = [
    item({ item_id: 'l1', anchor_kind: 'line', anchor_id: 'ffe-1', title: 'Console note' }),
    item({ item_id: 'l2', anchor_kind: 'line', anchor_id: 'ffe-2', title: 'COM note' }),
    item({ item_id: 'l3', anchor_kind: 'line', anchor_id: 'ffe-3', title: 'PO note' }),
    item({ item_id: 'w1', title: 'Invoice 2026-114' }),
    item({ item_id: 'w2', title: 'Deposit not drawn' }),
    item({ item_id: 'w3', anchor_kind: 'section', title: 'Scope change' }),
    item({
      kind: 'decision',
      item_id: 'w4',
      state: 'overdue',
      title: 'Primary bedroom approval',
    }),
  ];

  const renderRail = (currentStop: 'ffe' | 'money' | null = null) =>
    render(
      <MarginRail
        projectId="project-1"
        proposalId={null}
        clientName="Client"
        currentStop={currentStop}
        onHoverLine={jest.fn()}
      />,
    );

  it('prints one counted heading per anchor that has members, and no empty line', () => {
    mockMarginRows = GROUPED;
    renderRail();

    const pieces = document.querySelector('[data-margin-group="ffe"]')!;
    const wholeJob = document.querySelector('[data-margin-group="whole-job"]')!;
    expect(pieces).toHaveTextContent('BESIDE PIECES · 3');
    expect(wholeJob).toHaveTextContent('THE WHOLE JOB · 4');

    // No group is printed for a region with nothing in it.
    expect(document.querySelectorAll('[data-margin-group]')).toHaveLength(2);
    expect(document.querySelector('[data-margin-group="schedule"]')).toBeNull();
    expect(document.querySelector('[data-margin-group="approvals"]')).toBeNull();

    // Every raised card sits in exactly one group.
    expect(within(pieces as HTMLElement).getByText('Console note')).toBeVisible();
    expect(within(wholeJob as HTMLElement).getByText('Scope change')).toBeVisible();
  });

  it('lifts the count to charcoal for the stop she is standing in — and moves no card', () => {
    mockMarginRows = GROUPED;
    const { rerender } = renderRail(null);

    const order = () =>
      [...document.querySelectorAll('[data-margin-group]')].map((el) =>
        el.getAttribute('data-margin-group'),
      );
    const titles = () =>
      [...document.querySelectorAll('[data-margin-group] span')]
        .map((el) => el.textContent)
        .filter((text) => text && !text.startsWith('Body: '));

    const restingOrder = order();
    const restingTitles = titles();
    const pieces = () => document.querySelector('[data-margin-group="ffe"] p')!;
    expect(pieces()).not.toHaveAttribute('data-beside-current');
    expect(within(pieces() as HTMLElement).getByText('· 3')).toHaveClass(
      'text-[var(--text-muted)]',
    );

    rerender(
      <MarginRail
        projectId="project-1"
        proposalId={null}
        clientName="Client"
        currentStop="ffe"
        onHoverLine={jest.fn()}
      />,
    );

    expect(pieces()).toHaveAttribute('data-beside-current', '');
    expect(within(pieces() as HTMLElement).getByText('· 3')).toHaveClass(
      'text-[var(--text-primary)]',
    );
    // Grouping is by anchor, so the reading stop changes ink and nothing else.
    expect(order()).toEqual(restingOrder);
    expect(titles()).toEqual(restingTitles);
  });

  it('prints `In the margin` once per tier', () => {
    mockMarginRows = GROUPED;
    render(
      <ResponsiveMarginRail>
        <MarginRail
          projectId="project-1"
          proposalId={null}
          clientName="Client"
          onHoverLine={jest.fn()}
        />
      </ResponsiveMarginRail>,
    );

    const headings = screen.getAllByText('In the margin');
    expect(headings).toHaveLength(2);
    // The sheet header prints it from 1180 to 1439; the column heading from
    // 1440 up. The two classes are complementary, so the word never doubles.
    const [sheetHeading, columnHeading] = headings;
    expect(sheetHeading!.parentElement).toHaveClass('min-[1440px]:hidden');
    expect(columnHeading).toHaveClass('hidden', 'min-[1440px]:block');
  });

  it('prints the count and the worst standing kind on the closed tab', () => {
    mockMarginRows = GROUPED;
    render(
      <ResponsiveMarginRail>
        <MarginRail
          projectId="project-1"
          proposalId={null}
          clientName="Client"
          onHoverLine={jest.fn()}
        />
      </ResponsiveMarginRail>,
    );

    const tab = document.querySelector('[data-margin-trigger]')!;
    expect(tab).toHaveTextContent('Margin · 7 · 1 OVERDUE');
    expect(tab).toHaveClass('uppercase');
  });

  it('announces no zero — an empty margin keeps the bare word', () => {
    mockMarginRows = [];
    render(
      <ResponsiveMarginRail>
        <MarginRail
          projectId="project-1"
          proposalId={null}
          clientName="Client"
          onHoverLine={jest.fn()}
        />
      </ResponsiveMarginRail>,
    );

    expect(
      screen.getByRole('button', { name: 'Margin' }),
    ).toHaveAttribute('data-margin-trigger');
    expect(document.querySelectorAll('[data-margin-group]')).toHaveLength(0);
  });
});
