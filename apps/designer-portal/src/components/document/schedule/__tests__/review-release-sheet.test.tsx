import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReleaseLine } from '@/lib/document/authorization-derivation';

const calls: string[] = [];
const releaseMutate = jest.fn(async (input: unknown) => {
  calls.push('release');
  return { proposalId: 'proposal-9', documentId: 'document-9', input };
});
const sendMutate = jest.fn(async () => {
  calls.push('send');
  return { sentAt: '2026-08-04T12:00:00Z' };
});
const publishMutate = jest.fn(async () => {
  calls.push('publish');
  return { checkpointId: 'checkpoint-2' };
});
const overrideMutate = jest.fn(async () => {
  calls.push('override');
  return { checkpointId: 'checkpoint-1' };
});

let mockAuthority: { data: unknown } = {
  data: { agreementId: 'agreement-1', furnishingsDepositPercent: 50 },
};
// 'acknowledged' by default so the pre-existing send/deposit/drift tests below
// exercise a genuinely unblocked checkpoint — the 'open' (unacknowledged) case
// has its own dedicated test further down.
let mockBudget: { isLoading: boolean; data: unknown } = {
  isLoading: false,
  data: {
    version: {
      id: 'version-1',
      lines: [
        { roomId: 'r1', scheduledCents: 2830000 },
        { roomId: 'r2', scheduledCents: 3830000 },
      ],
    },
    checkpoint: {
      id: 'checkpoint-1',
      checkpointCode: 'B-004',
      publishedAt: '2026-07-12',
      state: 'acknowledged',
    },
  },
};

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => mockAuthority,
  useWorkingBudget: () => mockBudget,
  useReleaseForAuthorization: () => ({
    mutateAsync: releaseMutate,
    isPending: false,
  }),
  useSendFurnishingsAuthorization: () => ({
    mutateAsync: sendMutate,
    isPending: false,
  }),
  usePublishBudgetCheckpoint: () => ({
    mutateAsync: publishMutate,
    isPending: false,
  }),
  useOverrideBudgetCheckpoint: () => ({
    mutateAsync: overrideMutate,
    isPending: false,
  }),
}));

import { ReviewReleaseSheet } from '../review-release-sheet';

const lines: ReleaseLine[] = [
  {
    id: 'a',
    name: 'Walnut bed, king',
    roomId: 'r1',
    roomName: 'Primary bedroom',
    quantity: 1,
    clientLineTotalCents: 1230000,
  },
  {
    id: 'b',
    name: 'Cane lounge chair',
    roomId: 'r1',
    roomName: 'Primary bedroom',
    quantity: 2,
    clientLineTotalCents: 420000,
  },
  {
    id: 'c',
    name: 'Wool rug, 10 × 14',
    roomId: 'r2',
    roomName: 'Living',
    quantity: 1,
    clientLineTotalCents: 680000,
  },
];

const renderSheet = (
  over: Partial<Parameters<typeof ReviewReleaseSheet>[0]> = {},
) =>
  render(
    <ReviewReleaseSheet
      open
      projectId="project-1"
      projectName="Ellsworth Residence"
      instrumentNumber={3}
      lines={lines}
      currentScheduledCents={6660000}
      onClose={jest.fn()}
      onReleased={jest.fn()}
      {...over}
    />,
  );

describe('ReviewReleaseSheet', () => {
  beforeEach(() => {
    calls.length = 0;
    releaseMutate.mockClear();
    sendMutate.mockClear();
    publishMutate.mockClear();
    overrideMutate.mockClear();
    mockAuthority = {
      data: { agreementId: 'agreement-1', furnishingsDepositPercent: 50 },
    };
    mockBudget = {
      isLoading: false,
      data: {
        version: {
          id: 'version-1',
          lines: [
            { roomId: 'r1', scheduledCents: 2830000 },
            { roomId: 'r2', scheduledCents: 3830000 },
          ],
        },
        checkpoint: {
          id: 'checkpoint-1',
          checkpointCode: 'B-004',
          publishedAt: '2026-07-12',
          state: 'acknowledged',
        },
      },
    };
  });

  it('names the instrument, its lines and its rooms', () => {
    renderSheet();
    expect(
      screen.getByText('Authorization № 3 — 3 lines, 2 rooms.'),
    ).toBeInTheDocument();
  });

  it('groups by room and shows four columns, no fifth', () => {
    renderSheet();
    expect(screen.getAllByRole('columnheader').map((c) => c.textContent)).toEqual([
      'Item',
      'Room',
      'Signed qty',
      'Client price',
      'Item',
      'Room',
      'Signed qty',
      'Client price',
    ]);
    expect(screen.getByText('Walnut bed, king')).toBeInTheDocument();
    expect(screen.queryByText(/trade cost/i)).not.toBeInTheDocument();
  });

  it('figures the total, the deposit and the balance', () => {
    renderSheet();
    expect(screen.getByText('authorization total')).toBeInTheDocument();
    expect(screen.getByText('$23,300')).toBeInTheDocument();
    expect(screen.getByText('deposit at 50%')).toBeInTheDocument();
    expect(screen.getAllByText('$11,650')).toHaveLength(2);
  });

  it('prefills the deposit chip from the agreement, and says whose default it is', () => {
    renderSheet();
    expect(screen.getByRole('button', { name: '50%' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      screen.getByText(/Your agreement’s default is 50%/),
    ).toBeInTheDocument();
  });

  it('changes the deposit for this authorization only', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: '25%' }));
    expect(screen.getByText('deposit at 25%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '50%' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('takes an other percent by hand', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    fireEvent.change(screen.getByLabelText('Deposit percent'), {
      target: { value: '35' },
    });
    expect(screen.getByText('deposit at 35%')).toBeInTheDocument();
  });

  it('says nothing about a deposit until the term resolves', () => {
    mockAuthority = { data: { agreementId: 'agreement-1' } };
    renderSheet();
    expect(screen.queryByText(/deposit at/)).not.toBeInTheDocument();
    expect(screen.queryByText(/default is/)).not.toBeInTheDocument();
  });

  it('releases with the ticked lines and the chosen deposit', async () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() => expect(releaseMutate).toHaveBeenCalled());
    expect(releaseMutate).toHaveBeenCalledWith({
      name: 'Furnishings authorization № 3',
      ffeItemIds: ['a', 'b', 'c'],
      depositPercent: 50,
    });
    expect(sendMutate).not.toHaveBeenCalled();
  });

  it('releases first, then sends — in that order', async () => {
    const onReleased = jest.fn();
    renderSheet({ onReleased });
    fireEvent.click(screen.getByRole('button', { name: /send for signature/i }));
    await waitFor(() => expect(onReleased).toHaveBeenCalled());
    expect(calls).toEqual(['release', 'send']);
    expect(sendMutate).toHaveBeenCalledWith('proposal-9');
  });

  it('retries only the send when release succeeds but send fails — never mints a second instrument', async () => {
    sendMutate.mockRejectedValueOnce(new Error('The network dropped.'));
    const onReleased = jest.fn();
    renderSheet({ onReleased });

    fireEvent.click(screen.getByRole('button', { name: /send for signature/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('The network dropped.'),
    );
    expect(
      screen.getByText('The authorization exists — retrying the send.'),
    ).toBeInTheDocument();
    expect(releaseMutate).toHaveBeenCalledTimes(1);
    expect(sendMutate).toHaveBeenCalledTimes(1);
    expect(onReleased).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: /send for signature/i }));
    await waitFor(() => expect(onReleased).toHaveBeenCalled());

    // The retry called release exactly once total (the first attempt) and
    // sent the SAME proposalId both times — no second release. (The first
    // send call rejects before it would record itself in `calls`; the
    // second succeeds, so `calls` shows exactly one completed send.)
    expect(releaseMutate).toHaveBeenCalledTimes(1);
    expect(sendMutate).toHaveBeenCalledTimes(2);
    expect(sendMutate).toHaveBeenNthCalledWith(1, 'proposal-9');
    expect(sendMutate).toHaveBeenNthCalledWith(2, 'proposal-9');
    expect(calls).toEqual(['release', 'send']);
  });

  it('blocks send while the checkpoint is open (unacknowledged), and an audited override unblocks it', async () => {
    mockBudget = {
      isLoading: false,
      data: {
        version: {
          id: 'version-1',
          lines: [
            { roomId: 'r1', scheduledCents: 2830000 },
            { roomId: 'r2', scheduledCents: 3830000 },
          ],
        },
        checkpoint: {
          id: 'checkpoint-1',
          checkpointCode: 'B-004',
          publishedAt: '2026-07-12',
          state: 'open',
        },
      },
    };
    const { rerender } = renderSheet({ clientName: 'Ellsworth' });

    expect(screen.getByTestId('checkpoint-gate').dataset.gateState).toBe('blocked');
    expect(
      screen.getByText('Waiting on Ellsworth to acknowledge checkpoint B-004.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send for signature/i }),
    ).toBeDisabled();
    // The coverage remedy cannot help an already-covering, merely-open
    // checkpoint — publishing another one just creates another 'open' one.
    expect(
      screen.queryByRole('button', { name: /publish fresh checkpoint/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /record audited override/i }),
    );
    fireEvent.change(screen.getByLabelText(/reason for the override/i), {
      target: { value: 'Client confirmed verbally on the walkthrough call.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^record override$/i }));

    await waitFor(() =>
      expect(overrideMutate).toHaveBeenCalledWith({
        checkpointId: 'checkpoint-1',
        reason: 'Client confirmed verbally on the walkthrough call.',
      }),
    );

    // The mutation's own onSuccess would invalidate + refetch in the real
    // app; here the checkpoint's own status flips and the sheet re-renders
    // to prove the gate reacts to it.
    mockBudget = {
      ...mockBudget,
      data: {
        ...(mockBudget.data as Record<string, unknown>),
        checkpoint: {
          id: 'checkpoint-1',
          checkpointCode: 'B-004',
          publishedAt: '2026-07-12',
          state: 'overridden',
        },
      },
    };
    rerender(
      <ReviewReleaseSheet
        open
        projectId="project-1"
        projectName="Ellsworth Residence"
        clientName="Ellsworth"
        instrumentNumber={3}
        lines={lines}
        currentScheduledCents={6660000}
        onClose={jest.fn()}
        onReleased={jest.fn()}
      />,
    );
    expect(screen.getByTestId('checkpoint-gate').dataset.gateState).toBe('current');
    expect(
      screen.getByRole('button', { name: /send for signature/i }),
    ).toBeEnabled();
  });

  it('holds the send when the checkpoint does not cover a released room', () => {
    mockBudget = {
      isLoading: false,
      data: {
        version: { id: 'version-1', lines: [{ roomId: 'r1', scheduledCents: 2830000 }] },
        checkpoint: { id: 'checkpoint-1', publishedAt: '2026-07-12' },
      },
    };
    renderSheet();
    expect(screen.getByTestId('checkpoint-gate').dataset.gateState).toBe(
      'blocked',
    );
    expect(
      screen.getByRole('button', { name: /send for signature/i }),
    ).toBeDisabled();
    expect(screen.getByTestId('checkpoint-gate')).toHaveTextContent(
      'has not seen a checkpoint covering Living',
    );
  });

  it('publishes a fresh checkpoint without leaving the sheet', async () => {
    mockBudget = {
      isLoading: false,
      data: {
        version: { id: 'version-1', lines: [{ roomId: 'r1', scheduledCents: 2830000 }] },
        checkpoint: { id: 'checkpoint-1', publishedAt: '2026-07-12' },
      },
    };
    renderSheet();
    fireEvent.click(
      screen.getByRole('button', { name: /publish fresh checkpoint/i }),
    );
    await waitFor(() => expect(publishMutate).toHaveBeenCalled());
    expect(publishMutate).toHaveBeenCalledWith({
      versionId: 'version-1',
      agreementId: 'agreement-1',
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('holds the send when no checkpoint has ever been published', () => {
    mockBudget = { isLoading: false, data: { version: null, checkpoint: null } };
    renderSheet();
    expect(screen.getByTestId('checkpoint-gate').dataset.gateState).toBe(
      'blocked',
    );
    expect(
      screen.getByText(/No budget checkpoint has been published yet/),
    ).toBeInTheDocument();
  });

  it('advises on drift past five percent without holding the send', () => {
    renderSheet({ currentScheduledCents: 7200000 });
    expect(screen.getByTestId('checkpoint-gate').dataset.gateState).toBe(
      'drifted',
    );
    expect(screen.getByText(/The schedule has moved \$5,400/)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /send for signature/i }),
    ).toBeEnabled();
  });

  it('stays quiet when the checkpoint still describes the schedule', () => {
    renderSheet();
    const gate = screen.getByTestId('checkpoint-gate');
    expect(gate.dataset.gateState).toBe('current');
    expect(gate).toHaveTextContent('B-004');
  });

  it('tells the truth about what happens next', () => {
    renderSheet();
    expect(
      screen.getByText(/Prices lock on release\./),
    ).toBeInTheDocument();
  });

  it('surfaces a failed release inline and keeps the sheet open', async () => {
    releaseMutate.mockRejectedValueOnce(new Error('The RPC said no.'));
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /save as draft/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('The RPC said no.'),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
