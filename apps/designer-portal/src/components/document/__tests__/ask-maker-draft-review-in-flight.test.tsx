/**
 * US-19 FR3 F3-22 (517-3, 517-1; `one-voice`): a date request in flight is not
 * held — the install row's act reads `Open the draft` while it sends, and
 * `Open the held draft` returns only for a held or awaiting note. The sheet's
 * `Add an address` lands on the vendor's terms with focus on the Orders email.
 */
import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

let mockDraftsRead: () => Promise<Record<string, unknown>[]> = async () => [];
jest.mock('@patina/supabase', () => {
  const { useQuery } = jest.requireActual('@tanstack/react-query');
  const pending = { mutateAsync: jest.fn(), isPending: false };
  return {
    OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
    buyingPhase2Keys: { all: ['buying-phase2'] },
    useInstallWindow: () => ({ isSuccess: true, data: null }),
    useProcurementDrafts: (projectId: string, statuses: readonly string[]) =>
      useQuery({
        queryKey: ['buying-phase2', 'drafts', projectId, statuses.join(',')],
        queryFn: () => mockDraftsRead(),
      }),
    useUpdateProcurementDraft: () => pending,
    useSendProcurementDraft: () => pending,
    useDiscardProcurementDraft: () => pending,
    useResendStalledProcurementDraft: () => pending,
  };
});

let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'ask-the-paper' || (name === 'one-voice' && mockOneVoice),
    isLoading: false,
  }),
}));

const mockOpenLedger = jest.fn();
jest.mock('../command-bar', () => ({
  openLedger: (...args: unknown[]) => mockOpenLedger(...args),
}));

import { AskMakerSheet, InstallReadingLine, type AskMakerPiece } from '../overlays/ask-maker-sheet';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const CHAIR: AskMakerPiece = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Reading chair, oiled oak and shearling',
  status: 'production',
  vendor_name: 'Nordic Atelier',
  vendor_id: 'vendor-nordic',
  purchase_order: null,
};
const SHELVING: AskMakerPiece = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Walnut shelving',
  status: 'delivered',
  purchase_order: null,
};
const HELD = {
  id: 'draft-1',
  kind: 'maker_eta_request',
  status: 'awaiting_review',
  ffe_item_id: CHAIR.id,
  purchase_order_id: null,
  project_id: PROJECT,
  to_email: 'orders@nordic.test',
  subject: 'Arrival date: Reading chair',
  body: 'Nordic Atelier,\n\nCould you give us an arrival date for this piece?',
  created_at: '2026-10-07T15:00:00Z',
};

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  mockOneVoice = true;
  mockDraftsRead = async () => [];
  mockOpenLedger.mockReset();
});

describe('Install row act for a date request in flight (517-3)', () => {
  it('while sending, the act reads Open the draft — not the held form', async () => {
    mockDraftsRead = async () => [{ ...HELD, status: 'sending', updated_at: new Date().toISOString() }];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR, SHELVING]} />);
    const act = await screen.findByRole('button', { name: 'Open the draft' });
    expect(act).not.toHaveAttribute('aria-disabled');
    expect(screen.getByText('Sending…')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open the held draft' })).toBeNull();
    fireEvent.click(act);
    expect(await screen.findByTestId('draft-review')).toBeInTheDocument();
  });

  it('a held (awaiting review) note keeps Open the held draft', async () => {
    mockDraftsRead = async () => [HELD];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR, SHELVING]} />);
    expect(await screen.findByRole('button', { name: 'Open the held draft' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Open the draft' })).toBeNull();
  });

  it('flag off: a sending note keeps today\'s Open the held draft', async () => {
    mockOneVoice = false;
    mockDraftsRead = async () => [{ ...HELD, status: 'sending' }];
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR, SHELVING]} />);
    expect(await screen.findByRole('button', { name: 'Open the held draft' })).toBeInTheDocument();
  });
});

describe('AskMakerSheet Add an address landing (517-1)', () => {
  it('a maker with a vendor record lands on its terms with focus on Orders email', async () => {
    const onClose = jest.fn();
    renderWithQuery(
      <AskMakerSheet
        open
        onClose={onClose}
        projectId={PROJECT}
        piece={CHAIR}
        held={{ ...HELD, to_email: null } as never}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    expect(onClose).toHaveBeenCalled();
    await waitFor(() =>
      expect(mockOpenLedger).toHaveBeenCalledWith('orders', {
        page: 'vendors',
        vendorId: 'vendor-nordic',
        vendorPage: 'terms',
        focus: 'orders-email',
      }),
    );
  });

  it('flag off: today\'s landing on the default sub-page', async () => {
    mockOneVoice = false;
    renderWithQuery(
      <AskMakerSheet
        open
        onClose={jest.fn()}
        projectId={PROJECT}
        piece={CHAIR}
        held={{ ...HELD, to_email: null } as never}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    await waitFor(() =>
      expect(mockOpenLedger).toHaveBeenCalledWith('orders', {
        page: 'vendors',
        vendorId: 'vendor-nordic',
      }),
    );
  });
});
