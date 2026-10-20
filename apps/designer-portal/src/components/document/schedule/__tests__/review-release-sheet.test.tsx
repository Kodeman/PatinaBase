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
let mockBudget: { isLoading: boolean; data: unknown; error?: Error } = {
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

let mockPurchasing = { data: { state: 'patina_signed' }, isPending: false, isError: false };
jest.mock('@/hooks/use-project-purchasing-agreement', () => ({
  useProjectPurchasingAgreement: () => mockPurchasing,
}));
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

jest.mock('../../overlays/purchasing-authorization-preview-sheet', () => ({
  PurchasingAuthorizationPreviewSheet: ({ proposalId, projectId, onClose }: any) => <div role="dialog" aria-label="Saved preview"><p>{projectId}:{proposalId}</p><button onClick={onClose}>Back from preview</button></div>,
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
    mockPurchasing = { data: { state: 'patina_signed' }, isPending: false, isError: false };
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
      'Signed quantity',
      'Client price',
      'Item',
      'Room',
      'Signed quantity',
      'Client price',
    ]);
    expect(screen.getByText('Walnut bed, king')).toBeInTheDocument();
    expect(screen.queryByText(/trade cost/i)).not.toBeInTheDocument();
  });

  it('figures the total, the deposit and the balance', () => {
    renderSheet();
    expect(screen.getByText('Authorization total')).toBeInTheDocument();
    expect(screen.getByText('$23,300')).toBeInTheDocument();
    expect(screen.getByText('deposit at 50%')).toBeInTheDocument();
    expect(screen.getAllByText('$11,650')).toHaveLength(2);
  });

  it('prices each line in its own currency and refuses a mixed total', () => {
    renderSheet({
      lines: [lines[0], { ...lines[1], currency: 'EUR' }, lines[2]],
    });
    // The line carries its own currency; its room cannot be summed.
    expect(screen.getByText('€4,200')).toBeInTheDocument();
    expect(
      screen.getByText(/2 lines · Mixed currencies — total unavailable \(EUR, USD\)/),
    ).toBeInTheDocument();
    // The one-currency room still states its figure.
    expect(screen.getByText(/1 line · \$6,800/)).toBeInTheDocument();
    // The authorization total gives way to the note, and no deposit is figured.
    expect(screen.getByText('Authorization total')).toBeInTheDocument();
    expect(
      screen.getByText('Mixed currencies — total unavailable (EUR, USD)'),
    ).toBeInTheDocument();
    expect(screen.queryByText('deposit at 50%')).not.toBeInTheDocument();
    expect(screen.queryByText('$23,300')).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'Custom percentage' }));
    fireEvent.change(screen.getByLabelText('Deposit percentage'), {
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
    fireEvent.click(screen.getByRole('button', { name: /save authorization draft/i }));
    await waitFor(() => expect(releaseMutate).toHaveBeenCalled());
    expect(releaseMutate).toHaveBeenCalledWith({
      name: 'Furnishings authorization № 3',
      ffeItemIds: ['a', 'b', 'c'],
      depositPercent: 50,
    });
    expect(sendMutate).not.toHaveBeenCalled();
  });

  it('saves once and opens the saved preview without sending, then reopens read-only', async () => {
    const onReleased = jest.fn(); renderSheet({ onReleased });
    fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Saved preview' })).toHaveTextContent('project-1:proposal-9'));
    expect(calls).toEqual(['release']); expect(sendMutate).not.toHaveBeenCalled(); expect(onReleased).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back from preview' }));
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
    expect(screen.getByRole('dialog', { name: 'Saved preview' })).toBeVisible();
    expect(releaseMutate).toHaveBeenCalledTimes(1); expect(sendMutate).not.toHaveBeenCalled();
  });

  it('holds recreation when a successful save returns no identity', async () => {
    releaseMutate.mockResolvedValueOnce({} as any); renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Save draft & preview' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('identity is unavailable'));
    expect(screen.getByRole('button', { name: 'Save draft & preview' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Save authorization draft' }));
    expect(releaseMutate).toHaveBeenCalledTimes(1); expect(sendMutate).not.toHaveBeenCalled();
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
      screen.getByRole('button', { name: /save draft & preview/i }),
    ).toBeDisabled();
    // The coverage remedy cannot help an already-covering, merely-open
    // checkpoint — publishing another one just creates another 'open' one.
    expect(
      screen.queryByRole('button', { name: /issue updated budget checkpoint/i }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: /record audited override/i }),
    );
    fireEvent.change(screen.getByLabelText(/override reason/i), {
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
      screen.getByRole('button', { name: /save draft & preview/i }),
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
      screen.getByRole('button', { name: /save draft & preview/i }),
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
      screen.getByRole('button', { name: /issue updated budget checkpoint/i }),
    );
    await waitFor(() => expect(publishMutate).toHaveBeenCalled());
    expect(publishMutate).toHaveBeenCalledWith({
      versionId: 'version-1',
      agreementId: 'agreement-1',
    });
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('offers working budget setup instead of a disabled publication when no version exists', () => {
    mockBudget = { isLoading: false, data: { version: null, checkpoint: null } };
    const onClose = jest.fn();
    const unfold = jest.fn();
    window.addEventListener('document:unfold-region', unfold);
    renderSheet({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Set up a working budget' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(unfold.mock.calls[0][0].detail).toEqual({ region: 'money' });
    expect(publishMutate).not.toHaveBeenCalled();
    expect(releaseMutate).not.toHaveBeenCalled();
    window.removeEventListener('document:unfold-region', unfold);
  });

  it.each(['loading', 'error'])('holds unknown budget %s without claiming a missing checkpoint', (state) => {
    mockBudget = { isLoading: state === 'loading', error: state === 'error' ? new Error('offline') : undefined, data: undefined };
    renderSheet();
    expect(screen.getByText(state === 'loading' ? 'Loading budget checkpoint…' : 'The budget checkpoint could not be loaded. No publication was attempted.')).toBeVisible();
    expect(screen.queryByText(/No budget checkpoint has been published yet/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /publish|issue|set up/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save draft & preview' })).toBeDisabled();
  });

  it('names first publication separately from an updated checkpoint', async () => {
    mockBudget = { isLoading: false, data: { version: { id: 'version-first', lines: [] }, checkpoint: null } };
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Publish first budget checkpoint' }));
    await waitFor(() => expect(publishMutate).toHaveBeenCalledWith({ versionId: 'version-first', agreementId: 'agreement-1' }));
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
      screen.getByRole('button', { name: /save draft & preview/i }),
    ).toBeEnabled();
  });

  it('stays quiet when the checkpoint still describes the schedule', () => {
    renderSheet();
    const gate = screen.getByTestId('checkpoint-gate');
    expect(gate.dataset.gateState).toBe('current');
    expect(gate).toHaveTextContent('B-004');
  });

  // US-19 499-3 / F2-20 (one-voice) — the confirm is the act's one name,
  // filled, beneath the sentence the sheet already states.
  it('one-voice: confirms Release for authorization, filled, beneath its sentence', () => {
    const flags = process.env.NEXT_PUBLIC_FLAG_OVERRIDES;
    process.env.NEXT_PUBLIC_FLAG_OVERRIDES = 'one-voice:true';
    try {
      renderSheet();
      const confirm = screen.getByRole('button', { name: 'Save draft & preview' });
      expect(confirm).toHaveClass('da-terminal');
      const sentence = screen.getByText(/Saving creates a draft and reserves these items\./);
      expect(sentence.compareDocumentPosition(confirm) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    } finally {
      process.env.NEXT_PUBLIC_FLAG_OVERRIDES = flags;
    }
  });

  it('keeps Send for signature with the flag off', () => {
    renderSheet();
    expect(screen.getByRole('button', { name: 'Save draft & preview' })).not.toHaveClass('da-terminal');
  });

  it('tells the truth about what happens next', () => {
    renderSheet();
    expect(
      screen.getByText(/Saving creates a draft and reserves these items\./),
    ).toBeInTheDocument();
  });

  it('surfaces a failed release inline and keeps the sheet open', async () => {
    releaseMutate.mockRejectedValueOnce(new Error('The RPC said no.'));
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /save authorization draft/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('The RPC said no.'),
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});


describe('external checkpoint review gate', () => {
  beforeEach(() => {
    jest.clearAllMocks(); calls.length = 0;
    mockAuthority = { data: null };
    mockPurchasing = { data: { state: 'external_recorded' }, isPending: false, isError: false };
    mockBudget = { isLoading: false, data: { version: { id: 'version-1', lines: [{ roomId: 'r1' }, { roomId: 'r2' }] }, checkpoint: null } };
  });
  it('publishes external-only explicitly, reports no notification and keeps open checkpoint held until deliberate override', async () => {
    const view = renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Publish first budget checkpoint' }));
    await waitFor(() => expect(publishMutate).toHaveBeenCalledWith({ versionId: 'version-1', agreementId: null }));
    expect(await screen.findByText('Checkpoint published. No client notification sent.')).toBeInTheDocument();
    expect(overrideMutate).not.toHaveBeenCalled(); expect(sendMutate).not.toHaveBeenCalled(); expect(releaseMutate).not.toHaveBeenCalled();
    mockBudget = { isLoading: false, data: { version: { id: 'version-1', lines: [{ roomId: 'r1' }, { roomId: 'r2' }] }, checkpoint: { id: 'checkpoint-2', state: 'open' } } };
    view.rerender(<ReviewReleaseSheet open projectId="project-1" projectName="Ellsworth" instrumentNumber={3} lines={lines} onClose={jest.fn()} onReleased={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Save draft & preview' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save authorization draft' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Record audited override' }));
    fireEvent.change(screen.getByLabelText('Override reason'), { target: { value: '  no  ' } });
    expect(screen.getByRole('button', { name: 'Record override' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Override reason'), { target: { value: 'Reviewed budget with the client by phone.' } });
    expect(overrideMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Record override' }));
    await waitFor(() => expect(overrideMutate).toHaveBeenCalledWith({ checkpointId: 'checkpoint-2', reason: 'Reviewed budget with the client by phone.' }));
    expect(sendMutate).not.toHaveBeenCalled(); expect(releaseMutate).not.toHaveBeenCalled();
  });
  it.each(['loading', 'error'])('holds external publication and release while eligibility is %s', (state) => {
    mockPurchasing = { ...mockPurchasing, isPending: state === 'loading', isError: state === 'error' };
    renderSheet();
    expect(screen.getByRole('button', { name: 'Publish first budget checkpoint' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft & preview' })).toBeDisabled();
    expect(publishMutate).not.toHaveBeenCalled();
  });
});
