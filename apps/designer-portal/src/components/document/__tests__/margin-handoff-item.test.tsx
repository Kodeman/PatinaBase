/**
 * Ruling III — a handoff is a margin item: lane attribution, one need line,
 * stage provenance as microtext, and exactly one act.
 *
 * Ruling IV's first rendering rides along: the terracotta stamp is a read of
 * the same overdue condition the guide sentence and the Desk order read.
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ProjectContextualHandoff } from '@patina/supabase';

const mockHandoffsQuery = jest.fn();
const mockRemind = jest.fn();
const mockNudge = jest.fn();
const mockApprove = jest.fn();
const mockRedo = jest.fn();
const mockClose = jest.fn();
const mockDetailQuery = jest.fn();

jest.mock('@patina/supabase', () => ({
  useProjectContextualHandoffs: (projectId: string | null) =>
    mockHandoffsQuery(projectId),
  useSiteRequestActionDetail: (projectId: string, requestId?: string) =>
    mockDetailQuery(projectId, requestId),
  useSendDecisionReminder: () => ({ mutate: mockRemind, isPending: false }),
  useNudgeSiteRequest: () => ({ mutateAsync: mockNudge, isPending: false }),
  useApproveSiteRequestItem: () => ({
    mutateAsync: mockApprove,
    isPending: false,
  }),
  useRequestSiteRequestRedo: () => ({
    mutateAsync: mockRedo,
    isPending: false,
  }),
  useCloseSiteRequest: () => ({ mutateAsync: mockClose, isPending: false }),
}));

const mockFocusApproval = jest.fn();
jest.mock('../approvals/project-approval-navigation', () => ({
  focusProjectApproval: (id: string) => mockFocusApproval(id),
}));

import { MarginHandoffs, useHandoffGates } from '../margin-handoff-item';

const NOW = new Date('2026-05-12T09:00:00.000Z');

const approval = {
  sourceKind: 'project_approval',
  sourceId: 'decision-1',
  projectId: 'project-1',
  phaseId: 'phase-1',
  canonicalStageKey: 'design_development',
  workflowTrack: 'ffe',
  stageAttribution: 'exact_project_phase',
  sourceState: 'response_required',
  responsibility: {
    sender: { kind: 'studio', label: null },
    recipient: { kind: 'client', label: null },
    currentOwner: { kind: 'client', label: null },
  },
  expectedResponse: 'select_approval_outcome',
  dueAt: '2026-05-06T09:00:00.000Z',
  isOverdue: true,
  escalation: null,
  artifact: {
    kind: 'proposal_edition',
    version: 3,
    checksum: 'deadbeef'.repeat(8),
    title: 'Direction',
  },
  actionKind: 'open_approval_response',
  updatedAt: '2026-05-06T09:00:00.000Z',
} as unknown as ProjectContextualHandoff;

const siteRequest = {
  sourceKind: 'site_request',
  sourceId: 'request-1',
  projectId: 'project-1',
  phaseId: null,
  canonicalStageKey: 'contract_administration',
  workflowTrack: null,
  stageAttribution: 'source_domain',
  sourceState: 'delivered',
  responsibility: {
    sender: { kind: 'studio', label: null },
    recipient: { kind: 'site_party', label: 'Hale Joinery' },
    currentOwner: { kind: 'studio', label: null },
  },
  expectedResponse: 'acknowledgment',
  dueAt: '2026-05-14T09:00:00.000Z',
  isOverdue: false,
  escalation: { nudgeSent: true, dueReminderSent: false },
  artifact: {
    kind: 'site_request_item_set',
    dueContext: 'Shop drawings due',
    itemCount: 2,
    items: [],
  },
  actionKind: 'review_site_request',
  updatedAt: '2026-05-06T09:00:00.000Z',
} as unknown as ProjectContextualHandoff;

beforeEach(() => {
  jest.useFakeTimers({ now: NOW, advanceTimers: true });
  mockDetailQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

/** The rail's own wiring: one hook, one clock, then the presentational list. */
function Harness({
  approvalSurfaceMounted = true,
}: {
  approvalSurfaceMounted?: boolean;
}) {
  const { gates, handoffsById, isError } = useHandoffGates({
    projectId: 'project-1',
    clientName: 'Marta Chen',
    now: NOW,
  });
  return (
    <MarginHandoffs
      gates={gates}
      handoffsById={handoffsById}
      isError={isError}
      approvalSurfaceMounted={approvalSurfaceMounted}
    />
  );
}

function renderHandoffs(
  handoffs: ProjectContextualHandoff[],
  options: { approvalSurfaceMounted?: boolean } = {},
) {
  mockHandoffsQuery.mockReturnValue({ data: handoffs, isError: false });
  return render(<Harness {...options} />);
}

describe('the handoff as a margin item', () => {
  it('states the lane, one need line, and provenance as microtext', () => {
    renderHandoffs([approval]);

    expect(
      screen.getByText('With Marta Chen · Direction approval'),
    ).toBeVisible();
    expect(
      screen.getByText('Stage 06 · Design Development · FF&E · edition 3'),
    ).toBeVisible();
  });

  it('shows no checksum, phase attribution, or escalation boolean', () => {
    renderHandoffs([approval, siteRequest]);

    expect(screen.queryByText(/deadbeef/)).toBeNull();
    expect(screen.queryByText(/Exact phase|Source domain/)).toBeNull();
    expect(screen.queryByText(/Nudge sent|No nudge sent/)).toBeNull();
    expect(screen.queryByText(/reminder sent/i)).toBeNull();
  });

  it('renders no titled band region and no count', () => {
    renderHandoffs([approval, siteRequest]);

    expect(screen.queryByRole('region', { name: /handoff/i })).toBeNull();
    expect(screen.queryByText('Project handoffs')).toBeNull();
    expect(screen.queryByText('Responsibility in context')).toBeNull();
  });

  it('renders nothing at all when the project has no handoffs', () => {
    const { container } = renderHandoffs([]);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports a failed read without claiming a workflow change', () => {
    mockHandoffsQuery.mockReturnValue({ data: undefined, isError: true });
    render(<Harness />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Project handoffs could not be read. No workflow state was changed.',
    );
  });
});

describe('overdue takes the stamp, and only the stamp', () => {
  it('stamps an overdue gate with the elapsed count', () => {
    renderHandoffs([approval]);
    expect(screen.getByText('Overdue · 6 days')).toBeVisible();
  });

  it('leaves a gate still in time unstamped', () => {
    renderHandoffs([siteRequest]);
    expect(screen.queryByText(/Overdue/)).toBeNull();
  });

  it('rises the overdue gate to the top of the rail', () => {
    renderHandoffs([siteRequest, approval]);
    const items = screen.getAllByText(/^With /);
    expect(items[0]).toHaveTextContent('With Marta Chen · Direction approval');
  });
});

describe('exactly one act, mapped 1:1 onto its mutation', () => {
  it('offers a single act on the face of each item', () => {
    renderHandoffs([approval]);
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });

  it('nudges an awaited approval through the decision-reminder RPC', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderHandoffs([approval]);

    await user.click(screen.getByRole('button', { name: 'Nudge' }));

    expect(mockRemind).toHaveBeenCalledWith(
      { decisionId: 'decision-1' },
      expect.anything(),
    );
    expect(mockFocusApproval).not.toHaveBeenCalled();
  });

  it('hands publishing to the approval ceremony rather than authoring it here', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderHandoffs([
      {
        ...approval,
        sourceState: 'ready_to_publish',
        isOverdue: false,
      } as ProjectContextualHandoff,
    ]);

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(mockFocusApproval).toHaveBeenCalledWith('decision-1');
    expect(mockRemind).not.toHaveBeenCalled();
  });

  it('closes a completed Site Request straight from its act', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockClose.mockResolvedValue({});
    renderHandoffs([
      { ...siteRequest, sourceState: 'completed' } as ProjectContextualHandoff,
    ]);

    await user.click(screen.getByRole('button', { name: 'Close' }));

    await waitFor(() =>
      expect(mockClose).toHaveBeenCalledWith({
        projectId: 'project-1',
        requestId: 'request-1',
      }),
    );
  });

  it('offers no act while a site party has not consented', () => {
    renderHandoffs([
      {
        ...siteRequest,
        sourceState: 'awaiting_consent',
      } as ProjectContextualHandoff,
    ]);

    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/Waiting for the site party/)).toBeVisible();
  });
});

describe('fold and unfold', () => {
  it('publishes aria-expanded so an activation can never toggle it shut', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderHandoffs([siteRequest]);

    const act = screen.getByRole('button', { name: 'Review' });
    expect(act).toHaveAttribute('aria-expanded', 'false');

    await user.click(act);
    expect(act).toHaveAttribute('aria-expanded', 'true');

    await user.click(act);
    expect(act).toHaveAttribute('aria-expanded', 'false');
  });

  it('reads the request detail only once unfolded', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    renderHandoffs([siteRequest]);

    expect(mockDetailQuery).toHaveBeenLastCalledWith('project-1', undefined);

    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(mockDetailQuery).toHaveBeenLastCalledWith('project-1', 'request-1');
  });

  it('collects the acts that need their own terms inside the fold', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockDetailQuery.mockReturnValue({
      data: {
        projectId: 'project-1',
        requestId: 'request-1',
        coherent: true,
        rooms: [{ id: 'room-1', name: 'Study' }],
        items: [
          {
            itemId: 'item-1',
            title: 'Credenza shop drawing',
            kitCode: 'SD-01',
            version: 2,
            roomId: 'room-1',
            status: 'delivered',
            deliverableId: 'deliverable-1',
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    renderHandoffs([siteRequest]);

    await user.click(screen.getByRole('button', { name: 'Review' }));

    expect(
      screen.getByRole('button', { name: 'Approve Credenza shop drawing' }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', {
        name: 'Request redo for Credenza shop drawing',
      }),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Nudge site party' }),
    ).toBeVisible();
  });

  it('refuses a redo with no note and never calls the mutation', async () => {
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    mockDetailQuery.mockReturnValue({
      data: {
        projectId: 'project-1',
        requestId: 'request-1',
        coherent: true,
        rooms: [],
        items: [
          {
            itemId: 'item-1',
            title: 'Credenza shop drawing',
            kitCode: 'SD-01',
            version: 2,
            roomId: 'room-1',
            status: 'delivered',
            deliverableId: 'deliverable-1',
          },
        ],
      },
      isLoading: false,
      isError: false,
    });
    renderHandoffs([siteRequest]);

    await user.click(screen.getByRole('button', { name: 'Review' }));
    await user.click(
      screen.getByRole('button', {
        name: 'Request redo for Credenza shop drawing',
      }),
    );

    expect(mockRedo).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A redo note is required.',
    );
  });
});

describe('acts that nothing is listening for are not offered', () => {
  it('withholds the open act where the approval ceremony is not mounted', () => {
    renderHandoffs(
      [
        {
          ...approval,
          sourceState: 'ready_to_publish',
          isOverdue: false,
          expectedResponse: 'publish_confirmed_approval',
          responsibility: {
            sender: { kind: 'client', label: null },
            recipient: { kind: 'studio', label: null },
            currentOwner: { kind: 'studio', label: null },
          },
        } as unknown as ProjectContextualHandoff,
      ],
      { approvalSurfaceMounted: false },
    );

    // The item still states the gate; it just offers no button into nothing.
    expect(screen.getByText(/Direction approval/)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
  });

  it('keeps the nudge, which needs no ceremony', () => {
    renderHandoffs([approval], { approvalSurfaceMounted: false });
    expect(screen.getByRole('button', { name: 'Nudge' })).toBeVisible();
  });
});
