/**
 * US-19 FR3 F3-2 (P-2, `one-voice`) — the band's `Ask the maker for a date`
 * takes the Install row's own act. FR4 520-1 (Fix 16): the sheet opens with
 * focus on the body when the line has a maker, since the subject is already
 * written. A line with no maker lands on `Add the maker`. With the flag off
 * the band's press is never taken here.
 */
import type { ReactElement } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ACT_LANDING_EVENTS, ACT_TARGET_IDS, ownAct } from '@/lib/document/act-names';

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
import { installReading, pieceName } from '@/lib/document/install-reading';

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

describe('Ask the maker for a date lands on the sheet’s body (F3-2, 520-1)', () => {
  it('opens the sheet with focus on the body', async () => {
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR, SHELVING]} />);
    await screen.findByRole('button', { name: 'Ask the maker for a date' });

    expect(pressFromBand()).toBe(true);
    expect(await screen.findByRole('button', { name: 'Hold for review' })).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Note')));
  });

  it('a line with no maker lands on Add the maker, and opens no sheet', async () => {
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR_NO_MAKER, SHELVING]} />);
    const held = await screen.findByRole('button', { name: 'Ask the maker for a date' });
    await waitFor(() => expect(held).toHaveAttribute('aria-disabled', 'true'));

    expect(pressFromBand()).toBe(true);
    expect(screen.getByRole('button', { name: 'Add the maker' })).toHaveFocus();
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
  });

  // FR6 F6-10 (D20) — the band's Next is the repair, by its control's name;
  // the region head still leads with the held ask, its reason, and the repair.
  it('Cedar, no maker: the band’s act is Add the maker; the head keeps the held ask', async () => {
    const reading = installReading([CHAIR_NO_MAKER, SHELVING], new Date(), false);
    expect(reading?.makerRecorded).toBe(false);
    const bandAct = ownAct('install', {
      inquiryOpen: false,
      firstMissingEssential: null,
      proposalState: null,
      clientFirstName: null,
      unspecifiedCount: 0,
      releaseEligible: false,
      install: { state: reading!.state, windowHeld: false, makerRecorded: reading!.makerRecorded },
    });
    expect(bandAct).toEqual({
      label: 'Add the maker',
      targetId: ACT_TARGET_IDS.installReading,
      tier: 'scored',
    });

    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR_NO_MAKER, SHELVING]} />);
    const held = await screen.findByRole('button', { name: 'Ask the maker for a date' });
    await waitFor(() => expect(held).toHaveAttribute('aria-disabled', 'true'));
    expect(held).toHaveAccessibleDescription('No maker is recorded on this line.');
    const repair = screen.getByRole('button', { name: 'Add the maker' });

    // The band's press (targetId installReading) lands on the control it names.
    expect(pressFromBand()).toBe(true);
    expect(repair).toHaveFocus();
  });

  it('the sheet itself opens on the body when the line has a maker, flag on or off', async () => {
    const { unmount } = renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Note')));
    unmount();

    mockOneVoice = false;
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Note')));
  });

  it('with no maker recorded, the sheet opens on Subject under one-voice', async () => {
    renderWithQuery(
      <AskMakerSheet open onClose={jest.fn()} projectId={PROJECT} piece={CHAIR_NO_MAKER} held={null} />,
    );
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Subject')));
  });

  it('520-2: as Follow up with the maker, the subject names the PO and the body takes focus', async () => {
    const halloran: AskMakerPiece = {
      ...CHAIR,
      name: 'Halloran dining table',
      // FR5 530-4: the number the maker knows (vendor_po_number) leads.
      purchase_order: { po_number: 'PO-2026-0031', vendor_po_number: 'NA-2026-077' },
    };
    renderWithQuery(
      <AskMakerSheet open followUp onClose={jest.fn()} projectId={PROJECT} piece={halloran} held={null} />,
    );
    const sheet = screen.getByRole('dialog', { name: 'Follow up with the maker' });
    expect(screen.getByLabelText('Subject')).toHaveValue('NA-2026-077 — following up');
    expect(screen.getByLabelText('Note')).toHaveValue('');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Note')));
    // A held draft for review, never a send.
    expect(sheet).toHaveTextContent('Nothing reaches the maker until a person sends it.');
    expect(screen.getByRole('button', { name: 'Hold for review' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('520-2: with no PO number, the subject names the piece', () => {
    renderWithQuery(
      <AskMakerSheet open followUp onClose={jest.fn()} projectId={PROJECT} piece={CHAIR} held={null} />,
    );
    expect(screen.getByLabelText('Subject')).toHaveValue(
      `${pieceName(CHAIR.name)} — following up`,
    );
  });

  it('leaves the band’s press untaken with one-voice off', async () => {
    mockOneVoice = false;
    renderWithQuery(<InstallReadingLine projectId={PROJECT} items={[CHAIR, SHELVING]} />);
    await screen.findByRole('button', { name: 'Ask the maker for a date' });

    expect(pressFromBand()).toBe(false);
    expect(screen.queryByRole('button', { name: 'Hold for review' })).toBeNull();
  });
});
