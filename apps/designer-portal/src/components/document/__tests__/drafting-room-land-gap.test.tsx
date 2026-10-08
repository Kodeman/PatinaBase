/**
 * US-19 FR3 F3-2 (510-6, `one-voice`) — `Write the proposal` walks into the
 * Drafting Room at `?land=gap` and lands with focus on the first unfinished
 * facet's first input. Without the param the Room opens as before.
 *
 * The mocking shape is rooms/drafting/drafting-room.test.tsx's.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { DraftingRoom } from '../rooms/drafting/drafting-room';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
}));
jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: jest.fn().mockResolvedValue(undefined) }),
}));
jest.mock('@patina/utils', () => ({ latestVerdictByLine: () => new Map() }));
jest.mock('@patina/supabase', () => ({
  useProposal: () => ({
    data: {
      id: 'proposal-1',
      title: 'Whitfield House',
      client_name: 'Sarah Whitfield',
      project_id: 'project-1',
      client_id: 'client-1',
      status: 'draft',
    },
    isLoading: false,
    error: null,
    refetch: jest.fn(),
  }),
  useProposalFeedback: () => ({ data: [] }),
  useScopeBuilderSummary: () => ({ data: { totalFFEEstimateCents: 1000, totalDesignFeeCents: 500 } }),
  useUpdateProposalItem: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
// Rooms and FF&E written; Palette is the first gap.
jest.mock('@/hooks/use-drafting-state', () => ({
  useDraftingState: () => ({
    facets: {
      rooms: true,
      ffe: true,
      palette: false,
      boards: false,
      phases: true,
      exclusions: false,
      payments: false,
      terms: false,
    },
    summary: { rooms: 2, ffe: 4, palettes: 0, boards: 0, phases: 2, exclusions: 0, payments: 0, swatches: 0, coTerms: false },
    items: [],
    fill: [1, 0.25, 0],
    pct: 42,
    state: 'Drafting',
    gaps: ['a palette', 'mood boards', 'exclusions'],
    isLoading: false,
  }),
  useDraftingWritesPending: () => false,
}));
jest.mock('../rooms/room-shell', () => ({
  RoomShell: ({ action, children }: { action?: React.ReactNode; children: React.ReactNode }) => (
    <>
      {action}
      {children}
    </>
  ),
}));
jest.mock('../strata-mark', () => ({ StrataMark: () => null }));
jest.mock('../status-chip', () => ({ StatusChip: ({ label }: { label: string }) => <span>{label}</span> }));
jest.mock('../proposal-share-instrument', () => ({ ProposalShareInstrument: () => null }));
jest.mock('@/lib/document/verdict-chip', () => ({ verdictChipSpec: () => null }));
jest.mock('../drafting/proposal-mirror', () => ({ ProposalPreviewRail: () => null }));
jest.mock('@/components/portal/scope-builder/rooms-in-scope', () => ({
  RoomsInScope: () => <input aria-label="Room name" />,
}));
jest.mock('@/components/portal/scope-builder/ffe-schedule-builder', () => ({
  FFEScheduleBuilder: () => <input aria-label="Piece" />,
}));
jest.mock('@/components/portal/scope-builder/palette-builder', () => ({
  PaletteBuilder: () => (
    <>
      <button type="button">Add a swatch</button>
      <input aria-label="Palette name" />
    </>
  ),
}));
jest.mock('@/components/portal/scope-builder/boards-builder', () => ({ BoardsBuilder: () => null }));
jest.mock('@/components/portal/scope-builder/phase-builder', () => ({ PhaseBuilder: () => null }));
jest.mock('@/components/portal/scope-builder/exclusions-list', () => ({ ExclusionsList: () => null }));
jest.mock('@/components/portal/scope-builder/payment-milestones-builder', () => ({
  PaymentMilestonesBuilder: () => null,
}));
jest.mock('@/components/portal/scope-builder/change-order-terms-editor', () => ({
  ChangeOrderTermsEditor: () => null,
}));
jest.mock('@/lib/help-system/use-document-surface', () => ({ useDocumentSurface: jest.fn() }));
jest.mock('@/lib/help-system/document-surface-keys', () => ({ DOCUMENT_SURFACE_KEYS: { drafting: 'drafting' } }));
jest.mock('../rooms/drafting/terms-agreement-body', () => ({ TermsAgreementBody: () => null }));
jest.mock('../rooms/drafting/schedule-line-unfold', () => ({ ScheduleLineUnfold: () => null }));
jest.mock('@/components/document/coordination/compose-decision-sheet', () => ({
  ComposeDecisionSheet: () => null,
}));
jest.mock('../mobile/mobile-shell', () => ({ useMobilePrimaryAction: jest.fn() }));
jest.mock('@/lib/document/room-origin', () => ({
  clearRoomOrigin: jest.fn(),
  readRoomOrigin: () => '/desk',
}));
jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

afterEach(() => {
  window.history.replaceState({}, '', '/');
});

describe('Write the proposal lands on the first missing input (F3-2, 510-6)', () => {
  it('?land=gap focuses the first unfinished facet’s first field', async () => {
    window.history.replaceState({}, '', '/drafting/proposal-1?land=gap');
    render(<DraftingRoom proposalId="proposal-1" />);

    const field = screen.getByLabelText('Palette name');
    await waitFor(() => expect(field).toHaveFocus());
    expect(screen.getByRole('button', { name: /Palette/i })).toHaveAttribute('aria-expanded', 'true');
  });

  it('without it, the Room opens as before and nothing in a facet takes focus', async () => {
    window.history.replaceState({}, '', '/drafting/proposal-1');
    render(<DraftingRoom proposalId="proposal-1" />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /Palette/i })).toHaveAttribute('aria-expanded', 'true'),
    );
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(screen.getByLabelText('Palette name')).not.toHaveFocus();
  });
});
