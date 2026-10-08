/**
 * US-19 FR3 F3-2 (P-2, `one-voice`) — the band's `Ask the maker for a date`
 * takes the Install row's own act: the ask-maker sheet opens with focus on its
 * first field. A line with no maker lands on `Add the maker`. With the flag
 * off the band's press is never taken here.
 */
import type { ReactElement } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACT_LANDING_EVENTS } from '@/lib/document/act-names';

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));
jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

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
        queryFn: async () => [],
      }),
    useUpdateProcurementDraft: () => pending,
    useSendProcurementDraft: () => pending,
    useDiscardProcurementDraft: () => pending,
    useResendStalledProcurementDraft: () => pending,
  };
});

let mockOneVoice = true;
jest.mock('@/hooks/use-feature-flag', () => ({
  useFeatureFlag: (name: string) =>
    name === 'ask-the-paper'
      ? { value: true, isLoading: false }
      : { value: name === 'one-voice' && mockOneVoice, isLoading: false },
}));

import { AskMakerSheet, InstallReadingLine, type AskMakerPiece } from '../overlays/ask-maker-sheet';

const PROJECT = '33333333-3333-4333-8333-333333333333';
const CHAIR: AskMakerPiece = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Reading chair, oiled oak and shearling',
  status: 'production',
  vendor_name: 'Nordic Atelier',
  purchase_order: null,
};
const CHAIR_NO_MAKER: AskMakerPiece = { ...CHAIR, vendor_name: null, product: null };
const SHELVING: AskMakerPiece = {
  id: '22222222-2222-4222-8222-222222222222',
  name: 'Walnut shelving',
  status: 'delivered',
  purchase_order: null,
};

function renderWithQuery(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

/** What page.tsx's band press does under one-voice; true when taken. */
function pressFromBand(): boolean {
  let taken = false;
  act(() => {
    taken = !window.dispatchEvent(
      new CustomEvent(ACT_LANDING_EVENTS.askTheMaker, { cancelable: true }),
    );
  });
  return taken;
}

beforeEach(() => {
  mockOneVoice = true;
});

describe('Ask the maker for a date lands on the sheet’s first field (F3-2)', () => {
  it('opens the sheet with focus on Subject', async () => {
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR, SHELVING]} />);
    await screen.findByRole('button', { name: 'Ask the maker for a date' });

    expect(pressFromBand()).toBe(true);
    expect(await screen.findByRole('button', { name: 'Hold for review' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveFocus());
  });

  it('a line with no maker lands on Add the maker, and opens no sheet', async () => {
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR_NO_MAKER, SHELVING]} />);
    const held = await screen.findByRole('button', { name: 'Ask the maker for a date' });
    await waitFor(() => expect(held).toHaveAttribute('aria-disabled', 'true'));

    expect(pressFromBand()).toBe(true);
    expect(screen.getByRole('button', { name: 'Add the maker' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
  });

  it('the sheet itself opens on Subject under one-voice, on the note with it off', async () => {
    const { unmount } = renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    await waitFor(() => expect(screen.getByLabelText('Subject')).toHaveFocus());
    unmount();

    mockOneVoice = false;
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    await waitFor(() => expect(screen.getByLabelText('Note')).toHaveFocus());
  });

  it('leaves the band’s press untaken with one-voice off', async () => {
    mockOneVoice = false;
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR, SHELVING]} />);
    await screen.findByRole('button', { name: 'Ask the maker for a date' });

    expect(pressFromBand()).toBe(false);
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
  });
});
