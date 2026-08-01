import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type {
  CoordinationItem,
  Database,
  ProjectPhaseTransitionReceipt,
} from '@patina/supabase';
import {
  deriveActivePhaseActions,
  PhaseAdvanceControl,
  phaseTransitionErrorMessage,
} from '../phase-advance-control';

const mockMutate = jest.fn();
const mockChainMutate = jest.fn();
const mockCoordinationRefetch = jest.fn();
let mockPending = false;
let mockChainPending = false;
let mockCoordinationItems: CoordinationItem[] | undefined = [];
let mockCoordinationLoading = false;
let mockCoordinationError = false;
let mockCoordinationFetching = false;

jest.mock('@patina/supabase', () => ({
  useCoordinationItems: () => ({
    data: mockCoordinationItems,
    isLoading: mockCoordinationLoading,
    isPending: mockCoordinationLoading,
    isError: mockCoordinationError,
    isFetching: mockCoordinationFetching,
    refetch: mockCoordinationRefetch,
  }),
  useUpdateProjectPhaseChain: () => ({
    mutate: mockChainMutate,
    isPending: mockChainPending,
  }),
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

type ChainMutationOptions = {
  onSuccess: () => void;
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
  next_phase_id: null,
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

describe('phaseTransitionErrorMessage', () => {
  it.each([
    [
      'advance_project_phase: canonical successor is missing',
      'This schedule is not connected after this phase.',
    ],
    [
      'advance_project_phase: cross-lane handoff is unsupported',
      'A phase is connected across the main and thread lanes.',
    ],
    [
      'advance_project_phase: predecessor phases must be completed',
      'An earlier phase in this schedule is still open.',
    ],
    [
      'advance_project_phase: successor phases must be pending',
      'A later phase in this schedule has already started or closed.',
    ],
    [
      'advance_project_phase: phase status changed (expected in_progress, found completed)',
      'The schedule changed while this handoff was running.',
    ],
  ])('maps raw RPC error %s to calm copy', (raw, expected) => {
    const message = phaseTransitionErrorMessage({ message: raw });
    expect(message).toContain(expected);
    expect(message).not.toContain('advance_project_phase');
  });
});

describe('PhaseAdvanceControl', () => {
  beforeEach(() => {
    mockPending = false;
    mockChainPending = false;
    mockCoordinationItems = [];
    mockCoordinationLoading = false;
    mockCoordinationError = false;
    mockCoordinationFetching = false;
    mockMutate.mockReset();
    mockChainMutate.mockReset();
    mockCoordinationRefetch.mockReset();
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
    expect(
      within(threadRow).getByText(/Thread lane · Delayed/),
    ).toHaveTextContent('Follows Window Survey');
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
      status: 'completed',
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
          next_phase_id: 'canonical',
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
      'Design Development is complete. Installation is now in progress in this lane.',
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
          next_phase_id: 'delayed',
          terminal: false,
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
    ).toBeDisabled();
  });

  it('fails completion closed while blocker data loads, without blocking a delayed resume', () => {
    mockCoordinationItems = undefined;
    mockCoordinationLoading = true;

    render(
      <PhaseAdvanceControl projectId="project-1" phases={parallelPhases} />,
    );

    expect(completeDevelopmentButton()).toBeDisabled();
    expect(
      screen.getByText('Checking open phase blockers before completion…'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Resume Custom Drapery (thread lane)',
      }),
    ).toBeEnabled();
  });

  it('fails completion closed when blocker data errors and exposes a retry act', () => {
    mockCoordinationItems = undefined;
    mockCoordinationError = true;

    render(<PhaseAdvanceControl projectId="project-1" phases={[mainActive]} />);

    expect(completeDevelopmentButton()).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check blockers again' }),
    );
    expect(mockCoordinationRefetch).toHaveBeenCalledTimes(1);
  });

  it('requires an explicit legacy-main root choice and connects only the selected exact phase', () => {
    const procurement = phase({
      id: 'procurement-root',
      name: 'Procurement',
      status: 'pending',
      sortOrder: -100,
    });
    const installation = phase({
      id: 'installation-root',
      name: 'Installation',
      status: 'pending',
      sortOrder: 999,
    });
    mockChainMutate.mockImplementation(
      (_variables: unknown, options: ChainMutationOptions) =>
        options.onSuccess(),
    );

    render(
      <PhaseAdvanceControl
        projectId="project-1"
        phases={[mainActive, procurement, installation]}
      />,
    );

    expect(completeDevelopmentButton()).toBeDisabled();
    const chooser = screen.getByRole('combobox', {
      name: 'Next phase after Design Development',
    });
    expect(chooser).toHaveValue('');
    expect(
      screen.getByRole('button', { name: 'Connect selected next phase' }),
    ).toBeDisabled();

    fireEvent.change(chooser, { target: { value: installation.id } });
    expect(
      screen.getByText(
        'Confirming changes the schedule dependency: Installation will follow Design Development.',
      ),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Connect Installation after Design Development',
      }),
    );

    expect(mockChainMutate).toHaveBeenCalledWith(
      {
        phaseId: installation.id,
        projectId: 'project-1',
        followsPhaseId: mainActive.id,
      },
      expect.objectContaining({
        onSuccess: expect.any(Function),
        onError: expect.any(Function),
      }),
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Installation now follows Design Development.',
    );
  });

  it('does not offer inline relinking when a pending child still belongs to completed history', () => {
    const historicalRoot = phase({
      id: 'historical-root',
      name: 'Historic Procurement',
      status: 'completed',
    });
    const pendingChild = phase({
      id: 'pending-child',
      name: 'Installation',
      status: 'pending',
      followsPhaseId: historicalRoot.id,
    });

    render(
      <PhaseAdvanceControl
        projectId="project-1"
        phases={[mainActive, historicalRoot, pendingChild]}
      />,
    );

    expect(completeDevelopmentButton()).toBeDisabled();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText(/none is a safe pending root/i)).toBeVisible();
    expect(mockChainMutate).not.toHaveBeenCalled();
  });

  it('preserves valid independent thread-root components', () => {
    const drapery = phase({
      id: 'drapery-thread',
      name: 'Drapery',
      status: 'in_progress',
      lane: 'thread',
    });
    const art = phase({
      id: 'art-thread',
      name: 'Art Placement',
      status: 'delayed',
      lane: 'thread',
    });

    render(
      <PhaseAdvanceControl projectId="project-1" phases={[drapery, art]} />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Complete Drapery (thread lane)',
      }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', {
        name: 'Resume Art Placement (thread lane)',
      }),
    ).toBeEnabled();
  });

  it.each([
    {
      label: 'main to thread',
      parent: phase({
        id: 'main-parent',
        name: 'Main Design',
        status: 'in_progress',
      }),
      child: phase({
        id: 'thread-child',
        name: 'Thread Procurement',
        status: 'pending',
        lane: 'thread',
        followsPhaseId: 'main-parent',
      }),
      actionName: 'Complete Main Design (main lane)',
      disconnectName: 'Disconnect Thread Procurement from Main Design',
    },
    {
      label: 'thread to main',
      parent: phase({
        id: 'thread-parent',
        name: 'Thread Survey',
        status: 'completed',
        lane: 'thread',
      }),
      child: phase({
        id: 'main-child',
        name: 'Main Install',
        status: 'delayed',
        followsPhaseId: 'thread-parent',
      }),
      actionName: 'Resume Main Install (main lane)',
      disconnectName: 'Disconnect Main Install from Thread Survey',
    },
  ])(
    'blocks a $label edge and requires explicit disconnection',
    ({ parent, child, actionName, disconnectName }) => {
      mockChainMutate.mockImplementation(
        (_variables: unknown, options: ChainMutationOptions) =>
          options.onSuccess(),
      );
      render(
        <PhaseAdvanceControl projectId="project-1" phases={[parent, child]} />,
      );

      expect(screen.getByRole('button', { name: actionName })).toBeDisabled();
      fireEvent.click(screen.getByRole('button', { name: disconnectName }));
      expect(mockChainMutate).toHaveBeenCalledWith(
        {
          phaseId: child.id,
          projectId: 'project-1',
          followsPhaseId: null,
        },
        expect.any(Object),
      );
    },
  );

  it('renders one project-global repair act while disabling every active phase', () => {
    const main = phase({
      id: 'main-parent',
      name: 'Main Design',
      status: 'in_progress',
    });
    const thread = phase({
      id: 'thread-child',
      name: 'Thread Procurement',
      status: 'delayed',
      lane: 'thread',
      followsPhaseId: main.id,
    });

    render(
      <PhaseAdvanceControl projectId="project-1" phases={[main, thread]} />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Complete Main Design (main lane)',
      }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', {
        name: 'Resume Thread Procurement (thread lane)',
      }),
    ).toBeDisabled();
    expect(
      screen.getAllByRole('note', {
        name: 'Project schedule connection issue',
      }),
    ).toHaveLength(1);
    expect(
      screen.getAllByRole('button', {
        name: 'Disconnect Thread Procurement from Main Design',
      }),
    ).toHaveLength(1);
  });

  it('blocks and can explicitly clear a dependency outside the loaded project graph', () => {
    const dangling = phase({
      id: 'dangling-active',
      name: 'Installation',
      status: 'delayed',
      followsPhaseId: 'phase-from-another-project',
    });
    mockChainMutate.mockImplementation(
      (_variables: unknown, options: ChainMutationOptions) =>
        options.onSuccess(),
    );

    render(<PhaseAdvanceControl projectId="project-1" phases={[dangling]} />);

    expect(
      screen.getByRole('button', {
        name: 'Resume Installation (main lane)',
      }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Clear invalid connection for Installation',
      }),
    );
    expect(mockChainMutate).toHaveBeenCalledWith(
      {
        phaseId: dangling.id,
        projectId: 'project-1',
        followsPhaseId: null,
      },
      expect.any(Object),
    );
  });

  it('blocks a delayed resume when its same-component topology is malformed', () => {
    const delayed = phase({
      id: 'delayed',
      name: 'Custom Drapery',
      status: 'delayed',
      lane: 'thread',
    });
    const startedSuccessor = phase({
      id: 'started-successor',
      name: 'Drapery Install',
      status: 'in_progress',
      lane: 'thread',
      followsPhaseId: delayed.id,
    });

    render(
      <PhaseAdvanceControl
        projectId="project-1"
        phases={[delayed, startedSuccessor]}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: 'Resume Custom Drapery (thread lane)',
      }),
    ).toBeDisabled();
    expect(screen.getByText(/is not pending/i)).toBeVisible();
    expect(mockMutate).not.toHaveBeenCalled();
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

  it('shows the authoritative RPC rejection inline and never announces success', () => {
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
    expect(screen.queryByText(/is complete/)).not.toBeInTheDocument();

    fireEvent.click(action);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Design Development is complete. Its lane is now complete.',
    );
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
      'Design Development is complete. Its lane is now complete.',
    );

    rerender(
      <PhaseAdvanceControl
        projectId="project-1"
        phases={[{ ...mainActive, status: 'completed' }]}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(
      'Design Development is complete. Its lane is now complete.',
    );
    expect(
      screen.getByText('No active phase handoffs need attention.'),
    ).toBeVisible();

    rerender(
      <PhaseAdvanceControl
        projectId="project-2"
        phases={[{ ...mainActive, project_id: 'project-2' }]}
      />,
    );
    expect(
      screen.queryByText(/Its lane is now complete/),
    ).not.toBeInTheDocument();

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

    expect(
      screen.queryByText(/Its lane is now complete/),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
