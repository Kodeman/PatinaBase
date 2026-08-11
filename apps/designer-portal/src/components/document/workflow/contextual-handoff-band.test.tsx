import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';

import { ContextualHandoffBand } from './contextual-handoff-band';
import { FOCUS_PROJECT_APPROVAL_EVENT } from '../approvals/project-approval-navigation';
import type { ProjectContextualHandoff } from '@patina/supabase';

expect.extend(toHaveNoViolations);

const nudge = jest.fn();
const approve = jest.fn();
const redo = jest.fn();
const close = jest.fn();

let handoffs: ProjectContextualHandoff[] = [];
let detail: {
  projectId: string;
  requestId: string;
  coherent: boolean;
  items: Array<{
    itemId: string;
    title: string;
    kitCode: string;
    version: number;
    roomId: string | null;
    status: string;
    deliverableId: string | null;
  }>;
} | null = null;

jest.mock('@patina/supabase', () => ({
  useProjectContextualHandoffs: () => ({
    data: handoffs,
    isLoading: false,
    isError: false,
  }),
  useSiteRequestActionDetail: () => ({
    data: detail,
    isLoading: false,
    isError: false,
  }),
  useNudgeSiteRequest: () => ({ mutateAsync: nudge, isPending: false }),
  useApproveSiteRequestItem: () => ({
    mutateAsync: approve,
    isPending: false,
  }),
  useRequestSiteRequestRedo: () => ({
    mutateAsync: redo,
    isPending: false,
  }),
  useCloseSiteRequest: () => ({ mutateAsync: close, isPending: false }),
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const approvalHandoff: ProjectContextualHandoff = {
  sourceKind: 'project_approval',
  sourceId: 'decision-1',
  projectId: 'project-1',
  phaseId: 'phase-1',
  canonicalStageKey: 'contract_administration',
  workflowTrack: 'construction',
  stageAttribution: 'exact_project_phase',
  sourceState: 'response_required',
  responsibility: {
    sender: { kind: 'studio', label: null },
    recipient: { kind: 'client', label: null },
    currentOwner: { kind: 'client', label: null },
  },
  expectedResponse: 'select_approval_outcome',
  dueAt: '2099-08-20T12:00:00.000Z',
  isOverdue: false,
  escalation: null,
  artifact: {
    kind: 'plan_issue',
    version: 2,
    checksum: 'a'.repeat(64),
    title: 'Issued drawing set 02',
  },
  actionKind: 'open_approval_response',
  updatedAt: '2026-08-11T12:00:00.000Z',
};

function siteHandoff(
  sourceState:
    | 'awaiting_consent'
    | 'sent'
    | 'in_progress'
    | 'delivered'
    | 'completed',
): ProjectContextualHandoff {
  const studioOwns = sourceState === 'delivered' || sourceState === 'completed';
  return {
    sourceKind: 'site_request',
    sourceId: `request-${sourceState}`,
    projectId: 'project-1',
    phaseId: null,
    canonicalStageKey: 'contract_administration',
    workflowTrack: null,
    stageAttribution: 'source_domain',
    sourceState,
    responsibility: {
      sender: studioOwns
        ? { kind: 'site_party', label: 'Frozen Field Party' }
        : { kind: 'studio', label: null },
      recipient: studioOwns
        ? { kind: 'studio', label: null }
        : { kind: 'site_party', label: 'Frozen Field Party' },
      currentOwner: studioOwns
        ? { kind: 'studio', label: null }
        : { kind: 'site_party', label: 'Frozen Field Party' },
    },
    expectedResponse:
      sourceState === 'awaiting_consent'
        ? 'await_site_party_consent'
        : sourceState === 'delivered'
          ? 'review_delivered_items'
          : sourceState === 'completed'
            ? 'close_completed_request'
            : 'deliver_current_item_versions',
    dueAt: '2026-08-10T12:00:00.000Z',
    isOverdue: true,
    escalation: { nudgeSent: false, dueReminderSent: true },
    artifact: {
      kind: 'site_request_item_set',
      dueContext: 'Before inspection',
      itemCount: 1,
      items: [
        {
          title: 'Window measure',
          kitCode: 'K-01',
          version: 2,
          status: sourceState === 'completed' ? 'approved' : 'delivered',
          hasDeliveredEvidence: true,
          hasApprovedEvidence: sourceState === 'completed',
        },
      ],
    },
    actionKind:
      sourceState === 'completed'
        ? 'close_site_request'
        : sourceState === 'delivered'
          ? 'review_site_request'
          : sourceState === 'in_progress'
            ? 'continue_site_request'
            : 'open_site_request',
    updatedAt: '2026-08-11T12:00:00.000Z',
  };
}

beforeEach(() => {
  handoffs = [];
  detail = null;
  nudge.mockReset().mockResolvedValue({});
  approve.mockReset().mockResolvedValue({});
  redo.mockReset().mockResolvedValue({});
  close.mockReset().mockResolvedValue({});
});

describe('ContextualHandoffBand', () => {
  it('renders semantic responsibility, stage, artifact, escalation, and neutral due context', async () => {
    handoffs = [approvalHandoff, siteHandoff('delivered')];
    const focused = jest.fn();
    window.addEventListener(FOCUS_PROJECT_APPROVAL_EVENT, focused);

    const { container } = render(
      <ContextualHandoffBand projectId="project-1" />,
    );

    expect(
      screen.getByRole('region', { name: 'Project handoffs' }),
    ).toBeVisible();
    expect(screen.getByText('Studio → Client')).toBeVisible();
    expect(screen.getAllByText('Current owner · Client')[0]).toBeVisible();
    expect(
      screen.getAllByText(/09 · Contract administration/)[0],
    ).toBeVisible();
    expect(screen.getAllByText(/Exact phase|Source domain/)).toHaveLength(2);
    expect(
      screen.getByText(/Issued drawing set 02 · v2.*proof aaaaaaaa/),
    ).toBeVisible();
    expect(screen.getByText(/Window measure · v2 · Delivered/)).toBeVisible();
    expect(screen.getByText(/Due reminder sent/)).toBeVisible();
    expect(screen.getByText(/Request due date passed/)).toBeVisible();
    expect(screen.queryByText(/Studio overdue/i)).toBeNull();
    expect(container.innerHTML).not.toMatch(/shadow/i);

    fireEvent.click(screen.getByRole('button', { name: 'Open approval' }));
    expect(focused).toHaveBeenCalledTimes(1);
    expect((focused.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      decisionId: 'decision-1',
    });

    expect(await axe(container)).toHaveNoViolations();
    window.removeEventListener(FOCUS_PROJECT_APPROVAL_EVENT, focused);
  });

  it('keeps awaiting-consent and continue actions navigation-only', () => {
    handoffs = [siteHandoff('awaiting_consent'), siteHandoff('in_progress')];
    render(<ContextualHandoffBand projectId="project-1" />);

    for (const action of screen.getAllByRole('button', {
      name: 'View Site Request',
    })) {
      fireEvent.click(action);
    }

    expect(
      screen.getByText(/Waiting for the site party’s consent/),
    ).toBeVisible();
    expect(nudge).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it('resolves coherent current-version detail before approve or redo', async () => {
    handoffs = [siteHandoff('delivered')];
    detail = {
      projectId: 'project-1',
      requestId: 'request-delivered',
      coherent: true,
      items: [
        {
          itemId: 'item-1',
          title: 'Window measure',
          kitCode: 'K-01',
          version: 2,
          roomId: null,
          status: 'delivered',
          deliverableId: 'delivery-1',
        },
      ],
    };
    render(<ContextualHandoffBand projectId="project-1" />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Review Site Request' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Approve Window measure' }),
    );
    await waitFor(() =>
      expect(approve).toHaveBeenCalledWith({
        projectId: 'project-1',
        requestId: 'request-delivered',
        itemId: 'item-1',
        deliverableId: 'delivery-1',
        roomId: null,
      }),
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Request redo for Window measure' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A redo note is required',
    );
    expect(redo).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Redo note for Window measure'), {
      target: { value: 'Please recapture the tape edge.' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Request redo for Window measure' }),
    );
    await waitFor(() =>
      expect(redo).toHaveBeenCalledWith({
        projectId: 'project-1',
        requestId: 'request-delivered',
        itemId: 'item-1',
        note: 'Please recapture the tape edge.',
      }),
    );
  });

  it('requires a written note before nudging through the checked RPC', async () => {
    handoffs = [siteHandoff('sent')];
    detail = {
      projectId: 'project-1',
      requestId: 'request-sent',
      coherent: true,
      items: [],
    };
    render(<ContextualHandoffBand projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'View Site Request' }));
    fireEvent.click(screen.getByRole('button', { name: 'Nudge site party' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'A nudge note is required',
    );
    expect(nudge).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Nudge note'), {
      target: { value: 'Please confirm when field capture can begin.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Nudge site party' }));
    await waitFor(() =>
      expect(nudge).toHaveBeenCalledWith({
        projectId: 'project-1',
        requestId: 'request-sent',
        note: 'Please confirm when field capture can begin.',
      }),
    );
  });

  it('fails closed with an assertive error when exact item evidence is incoherent', () => {
    handoffs = [siteHandoff('delivered')];
    detail = {
      projectId: 'project-1',
      requestId: 'request-delivered',
      coherent: false,
      items: [],
    };
    render(<ContextualHandoffBand projectId="project-1" />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Review Site Request' }),
    );

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Exact current-version delivery evidence is unavailable',
    );
    expect(screen.queryByRole('button', { name: /^Approve/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Request redo/ })).toBeNull();
  });

  it('keeps close as the only row-id-only Site Request mutation', async () => {
    handoffs = [siteHandoff('completed')];
    render(<ContextualHandoffBand projectId="project-1" />);

    fireEvent.click(screen.getByRole('button', { name: 'Close Site Request' }));
    await waitFor(() =>
      expect(close).toHaveBeenCalledWith({
        projectId: 'project-1',
        requestId: 'request-completed',
      }),
    );
    expect(nudge).not.toHaveBeenCalled();
    expect(approve).not.toHaveBeenCalled();
    expect(redo).not.toHaveBeenCalled();
  });

  it('uses one-column, bounded, 44px action geometry at the 320px contract seam', () => {
    handoffs = [siteHandoff('delivered')];
    const { container } = render(
      <div style={{ width: 320 }}>
        <ContextualHandoffBand projectId="project-1" />
      </div>,
    );

    const band = screen.getByRole('region', { name: 'Project handoffs' });
    expect(band).toHaveClass('min-w-0', 'max-w-full');
    expect(container.querySelector('.grid-cols-1')).not.toBeNull();
    expect(
      screen.getByRole('button', { name: 'Review Site Request' }),
    ).toHaveClass('min-h-[44px]', 'min-w-[44px]');
    expect(container.innerHTML).not.toMatch(/overflow-x-auto|shadow/);
  });
});
