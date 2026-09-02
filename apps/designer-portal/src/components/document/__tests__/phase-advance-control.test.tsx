import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type {
  CoordinationItem,
  Database,
  ProjectPhaseTransitionReceipt,
} from '@patina/supabase';
import {
  deriveActivePhaseActions,
  PhaseAdvanceControl,
} from '../phase-advance-control';

const mockMutate = jest.fn();
let mockPending = false;
let mockCoordinationItems: CoordinationItem[] = [];

jest.mock('@patina/supabase', () => ({
  useCoordinationItems: () => ({ data: mockCoordinationItems }),
  useUpdateProjectPhaseStatus: () => ({
    mutate: mockMutate,
    isPending: mockPending,
  }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

type PhaseRow = Database['public']['Tables']['project_phases']['Row'];

function phase({
  id,
  name,
  status,
  lane = 'main',
  followsPhaseId = null,
  sortOrder = 0,
  gateCondition = null,
}: {
  id: string;
  name: string;
  status: string;
  lane?: 'main' | 'thread';
  followsPhaseId?: string | null;
  sortOrder?: number;
  gateCondition?: string | null;
}): PhaseRow {
  return {
    id,
    name,
    status,
    lane,
    follows_phase_id: followsPhaseId,
    sort_order: sortOrder,
    gate_condition: gateCondition,
    project_id: 'project-1',
  } as PhaseRow;
}

function coordinationItem(
  id: string,
  title: string,
  overrides: Partial<CoordinationItem> = {},
): CoordinationItem {
  return {
    id,
    title,
    phase_id: 'main-active',
    status: 'pending',
    blocks_kind: 'phase',
    blocking_status: null,
    ...overrides,
  } as CoordinationItem;
}

type MutationOptions = {
  onSuccess: (receipt: ProjectPhaseTransitionReceipt) => void;
  onError: (error: unknown) => void;
};

const parallelPhases = [
  phase({
    id: 'thread-active',
    name: 'Custom Drapery',
    status: 'delayed',
    lane: 'thread',
    followsPhaseId: 'thread-root',
    sortOrder: -100,
  }),
  phase({
    id: 'main-active',
    name: 'Design Development',
    status: 'in_progress',
    lane: 'main',
    followsPhaseId: 'main-root',
    sortOrder: 100,
  }),
  phase({
    id: 'main-root',
    name: 'Schematic Design',
    status: 'completed',
    sortOrder: 500,
  }),
  phase({
    id: 'thread-root',
    name: 'Window Survey',
    status: 'completed',
    lane: 'thread',
    sortOrder: -500,
  }),
];
const mainActive = phase({
  id: 'main-active',
  name: 'Design Development',
  status: 'in_progress',
});
const terminalMainReceipt: ProjectPhaseTransitionReceipt = {
  completed_phase_id: 'main-active',
  next_phase_ids: [],
  terminal: true,
};

function completeDevelopmentButton() {
  return screen.getByRole('button', {
    name: 'Complete Design Development (main lane)',
  });
}

describe('deriveActivePhaseActions', () => {
  it('represents every active lane in received order and uses only explicit chain links', () => {
    const actions = deriveActivePhaseActions(parallelPhases);

    expect(actions.map(({ phase: row }) => row.id)).toEqual([
      'thread-active',
      'main-active',
    ]);
    expect(actions[0]?.predecessor?.id).toBe('thread-root');
    expect(actions[1]?.predecessor?.id).toBe('main-root');
  });
});

describe('PhaseAdvanceControl', () => {
  beforeEach(() => {
    mockPending = false;
    mockCoordinationItems = [];
    mockMutate.mockReset();
  });

  it('renders independent, accessible controls for simultaneous main and thread phases', () => {
    render(
      <PhaseAdvanceControl projectId="project-1" phases={parallelPhases} />,
    );

    expect(
      screen.getByRole('heading', { name: 'Phase handoffs' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Resume Custom Drapery (thread lane)',
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'Complete Design Development (main lane)',
      }),
    ).toBeEnabled();

    const threadRow = screen.getByRole('listitem', {
      name: 'Custom Drapery',
    });
    expect(within(threadRow).getByText(/Thread lane · Delayed/)).toHaveTextContent(
      'Follows Window Survey',
    );
    const mainRow = screen.getByRole('listitem', {
      name: 'Design Development',
    });
    expect(
      within(mainRow).getByText(/Main lane · In progress/),
    ).toHaveTextContent('Follows Schematic Design');
  });

  it('does not predict from sort order and names a successor only from the server receipt', () => {
    const current = phase({
      id: 'current',
      name: 'Design Development',
      status: 'in_progress',
      sortOrder: 50,
    });
    const wrongBySort = phase({
      id: 'wrong-by-sort',
      name: 'Wrong by Sort',
      status: 'pending',
      sortOrder: 51,
    });
    const canonical = phase({
      id: 'canonical',
      name: 'Installation',
      status: 'pending',
      followsPhaseId: 'current',
      sortOrder: -500,
    });
    mockMutate.mockImplementation(
      (_variables: unknown, options: MutationOptions) =>
        options.onSuccess({
          completed_phase_id: 'current',
          next_phase_ids: ['canonical'],
          terminal: false,
        }),
    );

    render(
      <PhaseAdvanceControl
        projectId="project-1"
        phases={[current, wrongBySort, canonical]}
      />,
    );

    expect(screen.queryByText('Wrong by Sort')).not.toBeInTheDocument();
    expect(screen.queryByText('Installation')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Complete Design Development (main lane)',
      }),
    );

    expect(mockMutate).toHaveBeenCalledWith(
      {
        phaseId: 'current',
        projectId: 'project-1',
        status: 'completed',
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Design Development is complete. Installation is now in progress.',
    );
    expect(screen.queryByText('Wrong by Sort')).not.toBeInTheDocument();
  });

  it('resumes a delayed phase through the same server transition without completing it', () => {
    const delayed = phase({
      id: 'delayed',
      name: 'Custom Drapery',
      status: 'delayed',
      lane: 'thread',
    });
    mockMutate.mockImplementation(
      (_variables: unknown, options: MutationOptions) =>
        options.onSuccess({
          completed_phase_id: null,
          next_phase_ids: ['delayed'],
          terminal: true,
        }),
    );

    render(<PhaseAdvanceControl projectId="project-1" phases={[delayed]} />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Resume Custom Drapery (thread lane)',
      }),
    );

    expect(mockMutate).toHaveBeenCalledWith(
      {
        phaseId: 'delayed',
        projectId: 'project-1',
        status: 'in_progress',
      },
      expect.any(Object),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Custom Drapery is back in progress.',
    );
  });

  it('announces every direct follower when completion branches across lane labels', () => {
    const current = phase({
      id: 'current',
      name: 'Design Development',
      status: 'in_progress',
      lane: 'main',
    });
    const procurement = phase({
      id: 'procurement',
      name: 'Procurement',
      status: 'pending',
      lane: 'main',
      followsPhaseId: 'current',
    });
    const customDrapery = phase({
      id: 'custom-drapery',
      name: 'Custom Drapery',
      status: 'pending',
      lane: 'thread',
      followsPhaseId: 'current',
    });
    mockMutate.mockImplementation(
      (_variables: unknown, options: MutationOptions) =>
        options.onSuccess({
          completed_phase_id: 'current',
          next_phase_ids: ['custom-drapery', 'procurement'],
          terminal: false,
        }),
    );

    render(
      <PhaseAdvanceControl
        projectId="project-1"
        phases={[current, procurement, customDrapery]}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Complete Design Development (main lane)',
      }),
    );

    expect(screen.getByRole('status')).toHaveTextContent(
      'Design Development is complete. Custom Drapery and Procurement are now in progress.',
    );
  });

  it('rejects a completion receipt whose terminal flag contradicts its followers', () => {
    mockMutate.mockImplementation(
      (_variables: unknown, options: MutationOptions) =>
        options.onSuccess({
          completed_phase_id: 'main-active',
          next_phase_ids: [],
          terminal: false,
        }),
    );

    render(<PhaseAdvanceControl projectId="project-1" phases={[mainActive]} />);
    fireEvent.click(completeDevelopmentButton());

    expect(screen.getByRole('alert')).toHaveTextContent(
      /invalid completion receipt/i,
    );
    expect(screen.queryByText(/No direct phases follow it/)).not.toBeInTheDocument();
  });

  it('surfaces configured gates and both forms of pending runtime blocker context', () => {
    mockCoordinationItems = [
      coordinationItem('blocker-1', 'Client approves stone'),
      coordinationItem('blocker-2', 'Confirm field dimensions', {
        blocks_kind: 'none',
        blocking_status: 'blocks_phase',
      }),
      coordinationItem('resolved', 'Already resolved', {
        status: 'responded',
      }),
      coordinationItem('other-phase', 'Other phase blocker', {
        phase_id: 'another-phase',
      }),
    ];
    const active = phase({
      id: 'main-active',
      name: 'Design Development',
      status: 'in_progress',
      gateCondition: 'Signed client approval',
    });

    render(<PhaseAdvanceControl projectId="project-1" phases={[active]} />);

    expect(screen.getByText('Signed client approval')).toBeVisible();
    const blockers = screen.getByRole('note', {
      name: 'Open blockers for Design Development',
    });
    expect(blockers).toHaveTextContent('Client approves stone');
    expect(blockers).toHaveTextContent('Confirm field dimensions');
    expect(blockers).not.toHaveTextContent('Already resolved');
    expect(blockers).not.toHaveTextContent('Other phase blocker');
    expect(
      screen.getByRole('button', {
        name: 'Complete Design Development (main lane)',
      }),
    ).toBeEnabled();
  });

  it('disables duplicate actions and exposes an accessible live pending state', () => {
    render(<PhaseAdvanceControl projectId="project-1" phases={[mainActive]} />);
    const action = completeDevelopmentButton();

    fireEvent.click(action);
    fireEvent.click(action);

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute('aria-busy', 'true');
    expect(action).toHaveTextContent('Completing…');
    const liveStatus = screen.getByRole('status');
    expect(liveStatus).toHaveAttribute('aria-live', 'polite');
    expect(liveStatus).toHaveTextContent('Completing Design Development…');
    expect(action.querySelector('[data-action-hit]')).toBeInTheDocument();
  });

  it('maps the authoritative RPC rejection inline and never announces success', () => {
    mockMutate
      .mockImplementationOnce((_variables: unknown, options: MutationOptions) =>
        options.onError({
          message: 'advance_project_phase: 1 unresolved phase blocker(s)',
        }),
      )
      .mockImplementationOnce((_variables: unknown, options: MutationOptions) =>
        options.onSuccess(terminalMainReceipt),
      );

    render(<PhaseAdvanceControl projectId="project-1" phases={[mainActive]} />);
    const action = completeDevelopmentButton();
    fireEvent.click(action);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'This phase still has open blockers. Resolve them in Coordination, then try again.',
    );
    expect(screen.queryByRole('alert')).not.toHaveTextContent(
      'advance_project_phase',
    );
    expect(screen.queryByText(/is complete/)).not.toBeInTheDocument();

    fireEvent.click(action);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Design Development is complete. No direct phases follow it.',
    );
  });

  it('translates raw phase-handoff rejections into designer-facing copy', () => {
    const cases: Array<[string, string]> = [
      [
        'advance_project_phase: cross-project handoff is unsupported',
        'A phase here is connected to a phase in another project. Make it an independent root, then reconnect it inside this project if needed.',
      ],
      [
        'advance_project_phase: canonical main successor is ambiguous',
        'More than one phase is connected next. Repair the schedule so this phase has one exact successor.',
      ],
      [
        'advance_project_phase: phase status changed (expected in_progress, found completed)',
        'The schedule changed while this handoff was running. Refresh it before trying again.',
      ],
      [
        'advance_project_phase: multiple live main phases are unsupported',
        'More than one phase in this project is live at once. Resolve the duplicate before this handoff.',
      ],
      [
        'upstream returned 500',
        'The server rejected this phase handoff. Refresh the schedule and try again.',
      ],
    ];

    for (const [raw, copy] of cases) {
      mockMutate.mockImplementationOnce(
        (_variables: unknown, options: MutationOptions) =>
          options.onError({ message: raw }),
      );

      const { unmount } = render(
        <PhaseAdvanceControl projectId="project-1" phases={[mainActive]} />,
      );
      fireEvent.click(completeDevelopmentButton());

      expect(screen.getByRole('alert')).toHaveTextContent(copy);
      unmount();
    }
  });

  it('clears stale receipt feedback when authoritative phase rows or project change', () => {
    mockMutate.mockImplementation(
      (_variables: unknown, options: MutationOptions) =>
        options.onSuccess(terminalMainReceipt),
    );
    const { rerender } = render(
      <PhaseAdvanceControl projectId="project-1" phases={[mainActive]} />,
    );
    fireEvent.click(completeDevelopmentButton());
    expect(screen.getByRole('status')).toHaveTextContent(
      'Design Development is complete. No direct phases follow it.',
    );

    rerender(
      <PhaseAdvanceControl
        projectId="project-2"
        phases={[{ ...mainActive, project_id: 'project-2' }]}
      />,
    );
    expect(screen.queryByText(/No direct phases follow it/)).not.toBeInTheDocument();

    rerender(
      <PhaseAdvanceControl
        projectId="project-2"
        phases={[
          { ...mainActive, project_id: 'project-2', status: 'completed' },
        ]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'No active phase handoffs need attention.',
    );
  });

  it('ignores a late receipt from a project that is no longer authoritative', () => {
    let pendingOptions: MutationOptions | null = null;
    mockMutate.mockImplementation(
      (_variables: unknown, options: MutationOptions) => {
        pendingOptions = options;
      },
    );
    const { rerender } = render(
      <PhaseAdvanceControl projectId="project-1" phases={[mainActive]} />,
    );
    fireEvent.click(completeDevelopmentButton());

    rerender(
      <PhaseAdvanceControl
        projectId="project-2"
        phases={[{ ...mainActive, project_id: 'project-2' }]}
      />,
    );
    act(() => {
      pendingOptions?.onSuccess(terminalMainReceipt);
    });

    expect(screen.queryByText(/No direct phases follow it/)).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
