/**
 * US-19 FR4 Fix 12 (523-4 / 524-g, `one-voice`) — the issue ceremony's two
 * ratio lines (`{n} of {m} changed since …` and `{sent} of {total} sent`)
 * convert under the flag; off, the old strings stand.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import type { PlanRoomBundle } from '@patina/supabase';
import { PlanIssueCeremony } from '../plan-issue-ceremony';

let mockOneVoice = false;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (key: string) => ({ value: key === 'one-voice' ? mockOneVoice : false }),
}));

const createIssue = jest.fn();
const createTransmittal = jest.fn();

jest.mock('@patina/supabase', () => ({
  useCreatePlanIssue: () => ({ mutateAsync: createIssue, isPending: false }),
  useCreatePlanTransmittal: () => ({ mutateAsync: createTransmittal, isPending: false }),
  useProjectRoster: () => ({ data: [] }),
  usePlanIssuePreview: () => ({
    data: {
      sheets: [],
      checksumPreview: 'abcdef1234',
      priorIssue: { id: 'issue-0', name: 'Production Set — 1 Jan 2026', issueNumber: 1, issuedAt: '2026-01-01T00:00:00Z' },
      drift: { added: [], changed: ['sheet-1'], removed: [], unchanged: ['sheet-2'] },
    },
  }),
}));

jest.mock('@/lib/plans/model', () => ({
  deriveCurrentSet: () => [
    { sheetId: 'sheet-1', sheetNumber: 'A-101', title: 'Floor plan', discipline: null, state: 'current', revLetter: 'B', currentPrintId: 'print-1', filedAt: null },
    { sheetId: 'sheet-2', sheetNumber: 'A-102', title: 'Elevations', discipline: null, state: 'current', revLetter: 'A', currentPrintId: 'print-2', filedAt: null },
  ],
  deriveHolders: () => [],
  holderSentence: () => '',
}));

jest.mock('@/lib/analytics/plan-room-events', () => ({
  planRoomEvents: {
    issueStarted: jest.fn(),
    transmittalCreated: jest.fn(),
    issueFinalized: jest.fn(),
  },
}));

jest.mock('@/lib/client-portal-url', () => ({
  resolveClientPortalOrigin: () => 'https://client.example.com',
}));

jest.mock('../plan-link-once', () => ({
  PlanLinkOnce: () => null,
}));

const EMPTY_BUNDLE: PlanRoomBundle = {
  sheets: [], prints: [], batches: [], issues: [], issuePrints: [], transmittals: [], tokens: [],
};

function renderCeremony() {
  return render(
    <PlanIssueCeremony projectId="project-1" bundle={EMPTY_BUNDLE} onBack={jest.fn()} />,
  );
}

async function addAndSendOneRecipient() {
  fireEvent.change(screen.getByLabelText('Recipient name'), {
    target: { value: 'Jamie Client' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add' }));
  fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));
  await screen.findByText('sent');
}

describe('PlanIssueCeremony ratios (FR4 Fix 12)', () => {
  beforeEach(() => {
    mockOneVoice = false;
    createIssue.mockReset().mockResolvedValue({ issue: { id: 'issue-1' } });
    createTransmittal.mockReset().mockResolvedValue({
      transmittal: { id: 'transmittal-1' },
      token: 'tok_abc',
    });
  });

  it('flag off: keeps "{n} of {m} changed since …"', () => {
    renderCeremony();
    expect(
      screen.getByText(/1 of 2 changed since Production Set — 1 Jan 2026\./),
    ).toBeInTheDocument();
  });

  it('one-voice: converts to "{n} changed since …. The rest go along unchanged."', () => {
    mockOneVoice = true;
    renderCeremony();
    expect(
      screen.getByText(/^1 changed since Production Set — 1 Jan 2026\. The rest/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/1 of 2 changed/)).not.toBeInTheDocument();
  });

  it('flag off: keeps "{sent} of {total} sent"', async () => {
    renderCeremony();
    await addAndSendOneRecipient();
    expect(screen.getByText(/1 of 1 sent/)).toBeInTheDocument();
  });

  it('one-voice: converts to "All {total} sent"', async () => {
    mockOneVoice = true;
    renderCeremony();
    await addAndSendOneRecipient();
    expect(screen.getByText(/All 1 sent/)).toBeInTheDocument();
    expect(screen.queryByText(/1 of 1 sent/)).not.toBeInTheDocument();
  });

  it('one-voice: converts a partial send to "{n} sent · {m−n} to go"', async () => {
    mockOneVoice = true;
    createTransmittal
      .mockReset()
      .mockResolvedValueOnce({ transmittal: { id: 'transmittal-1' }, token: 'tok_abc' })
      .mockRejectedValueOnce(new Error('network down'));
    renderCeremony();

    fireEvent.change(screen.getByLabelText('Recipient name'), {
      target: { value: 'Jamie Client' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.change(screen.getByLabelText('Recipient name'), {
      target: { value: 'Morgan Trade' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(screen.getByRole('button', { name: 'Issue & send' }));

    expect(await screen.findByText(/1 sent · 1 to go/)).toBeInTheDocument();
    expect(screen.queryByText(/1 of 2 sent/)).not.toBeInTheDocument();
  });
});
