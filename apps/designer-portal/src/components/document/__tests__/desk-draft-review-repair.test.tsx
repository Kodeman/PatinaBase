/**
 * US-19 FR3 F3-22 (517-5; `one-voice`): the Desk's DraftReview takes 506-2's
 * form too — a held date request's Send reads `No address on file for
 * {maker}.` (aria-describedby), with the repair `Add an address` landing as
 * 517-1 does: the maker's vendor terms, or the line's maker selector on its
 * document when the maker has no vendor record.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { DeskFolder } from '@/lib/document/desk-derivation';
import { focusFfeLinePending } from '@/lib/document/registry';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));
const mockOpenLedger = jest.fn();
jest.mock('../command-bar', () => ({
  openLedger: (...args: unknown[]) => mockOpenLedger(...args),
}));
jest.mock('../triage-bar', () => ({ TriageBar: () => null }));
jest.mock('@patina/supabase', () => {
  const pending = { mutateAsync: jest.fn(), isPending: false };
  return {
    OPEN_PROCUREMENT_DRAFT_STATUSES: ['awaiting_review', 'sending'],
    useProcurementDrafts: () => ({ data: [] }),
    useUpdateProcurementDraft: () => pending,
    useSendProcurementDraft: () => pending,
    useDiscardProcurementDraft: () => pending,
    useResendStalledProcurementDraft: () => pending,
  };
});
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), prefetch: jest.fn(), back: jest.fn() }),
  usePathname: () => '/desk',
}));
let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) => ({
    value: name === 'one-voice' && mockOneVoice,
    isLoading: false,
  }),
}));

import { FolderCard } from '../folder-card';

const LINE = {
  id: 'line-1',
  vendor_id: 'vendor-hewn',
  vendor_name: 'Hewn',
  product: null,
  purchase_order: null,
};

function draftFolio(over: Record<string, unknown> = {}): DeskFolder {
  return {
    row: {
      engagement_id: 'proj-1',
      title: 'Cedar Lane',
      client_name: 'Elena Marlowe',
      active_section: 'project',
      current_phase: 'in_progress',
    },
    need: {
      kind: 'po_unacknowledged',
      text: 'Arrival date request to the maker drafted',
      actionLabel: 'Open the document',
      stamp: { label: 'Drafted', color: 'var(--color-clay)' },
      urgent: false,
      draft: {
        id: 'draft-1',
        kind: 'maker_eta_request',
        status: 'awaiting_review',
        to_email: null,
        subject: 'Arrival date: Walnut console',
        body: 'Hewn,\n\nCould you give us an arrival date?',
        created_at: '2026-10-07T15:00:00Z',
        maker: 'Hewn',
        makerLine: LINE,
        ...over,
      },
    },
  } as unknown as DeskFolder;
}

beforeEach(() => {
  mockOneVoice = true;
  mockOpenLedger.mockReset();
  mockPush.mockReset();
  focusFfeLinePending.request = null;
});

describe('Desk DraftReview held Send repair (517-5)', () => {
  it('names the maker in the held reason, wired by aria-describedby, and offers Add an address', () => {
    render(<FolderCard folder={draftFolio()} />);
    const send = screen.getByRole('button', { name: 'Send' });
    expect(send).toHaveAttribute('aria-disabled', 'true');
    expect(send).toHaveAccessibleDescription('No address on file for Hewn.');
    expect(screen.getByRole('button', { name: 'Add an address' })).toBeInTheDocument();
  });

  it('a maker with a vendor record: Add an address opens its terms with focus on Orders email', async () => {
    render(<FolderCard folder={draftFolio()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    await waitFor(() =>
      expect(mockOpenLedger).toHaveBeenCalledWith('orders', {
        page: 'vendors',
        vendorId: 'vendor-hewn',
        vendorPage: 'terms',
        focus: 'orders-email',
      }),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("a maker with no record: Add an address walks to the line's maker selector on its document", () => {
    render(
      <FolderCard
        folder={draftFolio({
          maker: 'Fixture Metalworks',
          makerLine: { id: 'line-1', vendor_id: null, vendor_name: null, product: { brand: 'Fixture Metalworks' }, purchase_order: null },
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAccessibleDescription(
      'No address on file for Fixture Metalworks.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Add an address' }));
    expect(focusFfeLinePending.request).toEqual({ itemId: 'line-1', cell: 'maker' });
    expect(mockPush).toHaveBeenCalledWith('/doc/proj-1');
    expect(mockOpenLedger).not.toHaveBeenCalled();
  });

  it("flag off: today's Desk review — no maker in the reason, no repair", () => {
    mockOneVoice = false;
    render(<FolderCard folder={draftFolio()} />);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAccessibleDescription('No address on file.');
    expect(screen.queryByRole('button', { name: 'Add an address' })).toBeNull();
  });
});
