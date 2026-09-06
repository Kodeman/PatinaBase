import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';

import type { HouseLedgerModel, NoteModel, ThresholdMark } from '@/lib/threshold/derive';
import { thresholdPhases } from '@/lib/threshold/canonical-phases';

// ── Boundaries ──────────────────────────────────────────────────────────────
// Only the door reads anything: its own bundle, and the sign route it never
// reaches here. Mock the module the component actually imports (patina-testing).

jest.mock('@/hooks/use-commercial-client', () => ({
  __esModule: true,
  useClientCommercialDocument: jest.fn(),
  invalidateSignedCommercialDocument: jest.fn().mockResolvedValue(undefined),
}));

// L3 gave the leaf its other four answers; they carry their own hooks and
// their own suites (door-acts.test.tsx, door-gate.test.tsx). This file is
// about the note pinned to the leaf, so the acts stand in as a stub — the
// same boundary door-gate.test.tsx draws.
jest.mock('../door-acts', () => ({
  __esModule: true,
  DoorActs: () => null,
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  proposalClientEvents: { signed: jest.fn() },
  makingEvents: {
    gateFollowed: jest.fn(),
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

import { useClientCommercialDocument } from '@/hooks/use-commercial-client';

import { DoorGate, type DoorProposal } from '../door-gate';
import { Doorstep } from '../doorstep';
import { HouseLedger } from '../house-ledger';
import { StoryPole } from '../story-pole';

const bundleMock = useClientCommercialDocument as jest.Mock;

function ledger(overrides: Partial<HouseLedgerModel> = {}): HouseLedgerModel {
  return {
    plannedCents: 8_500_000,
    agreedCents: 6_140_000,
    owedCents: 912_500,
    owedInvoiceCount: 1,
    owedStudioCount: 0,
    owedDueDate: '2026-08-15',
    owedDatedCount: 1,
    heldCents: 144_000,
    awaitingCents: 689_000,
    overageLine: null,
    ...overrides,
  };
}

// (a) ────────────────────────────────────────────────────────────────────────

describe('the story pole on a project with no phase rows', () => {
  const sections = [{ id: 'doorstep', label: 'You stand at the doorstep' }];

  it('graduates the house’s six chapters', () => {
    render(<StoryPole phases={thresholdPhases([], 'Procurement')} sections={sections} />);

    const rail = screen.getByTestId('story-pole-rail');
    expect(rail.querySelectorAll('li')).toHaveLength(6);
    expect(rail).toHaveTextContent('Discovery');
    expect(rail).toHaveTextContent('Design Refinement');
    expect(rail).toHaveTextContent('Completion');
  });

  it('holds the chapter the project names, and dates none of them', () => {
    render(<StoryPole phases={thresholdPhases([], 'Procurement')} sections={sections} />);

    expect(screen.getByTestId('story-pole-graduation-procurement')).toHaveAttribute(
      'data-held',
      'true',
    );
    expect(screen.queryByTestId('story-pole-span-procurement')).not.toBeInTheDocument();
    expect(screen.queryByTestId('story-pole-span-installation')).not.toBeInTheDocument();
  });

  it('walks all six when the project itself is completed', () => {
    render(<StoryPole phases={thresholdPhases([], null, 'completed')} sections={sections} />);

    const rail = screen.getByTestId('story-pole-rail');
    expect(rail.querySelectorAll('[data-walked]')).toHaveLength(6);
    expect(rail.querySelectorAll('[data-held]')).toHaveLength(0);
  });

  it('walks nothing when the project is merely archived', () => {
    render(<StoryPole phases={thresholdPhases([], null, 'archived')} sections={sections} />);

    const rail = screen.getByTestId('story-pole-rail');
    expect(rail.querySelectorAll('[data-walked]')).toHaveLength(0);
    expect(rail.querySelectorAll('[data-held]')).toHaveLength(0);
  });

  it('holds nothing when the project names no phase it recognises', () => {
    render(
      <StoryPole
        phases={thresholdPhases([], 'Construction Documentation')}
        sections={sections}
      />,
    );

    expect(screen.getByTestId('story-pole-rail').querySelectorAll('[data-held]')).toHaveLength(0);
  });
});

// (b) ────────────────────────────────────────────────────────────────────────

describe('the owed row’s due date', () => {
  it('names the day the open invoice falls due, beside its figure', () => {
    render(<HouseLedger ledger={ledger()} />);

    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent('$9,125 · due 15 August');
  });

  it('names the day as the SOONEST when the figure spans several invoices', () => {
    render(<HouseLedger ledger={ledger({ owedInvoiceCount: 3, owedDatedCount: 3 })} />);

    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent(
      '$9,125 · soonest due 15 August',
    );
  });

  it('does not put the whole sum on one day when only one invoice is dated', () => {
    render(<HouseLedger ledger={ledger({ owedInvoiceCount: 3, owedDatedCount: 1 })} />);

    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent(
      '$9,125 · soonest due 15 August',
    );
  });

  it('spells the year out once the day is not in this one', () => {
    render(<HouseLedger ledger={ledger()} today={new Date(2027, 0, 4)} />);

    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent(
      '$9,125 · due 15 August 2026',
    );
  });

  it('prints the figure alone when no invoice carries a due date', () => {
    render(<HouseLedger ledger={ledger({ owedDueDate: null })} />);

    const owed = screen.getByTestId('house-ledger-owed');
    expect(owed).toHaveTextContent('$9,125');
    expect(owed).not.toHaveTextContent('due');
  });

  it('reads a date-only column as that calendar day, not the day before', () => {
    render(<HouseLedger ledger={ledger({ owedDueDate: '2026-08-01' })} />);

    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent('due 1 August');
  });
});

// (c) ────────────────────────────────────────────────────────────────────────

describe('the reading-mark dateline', () => {
  it('stands beside the since control', () => {
    render(
      <Doorstep
        sentence="One door in this house is closed until you sign it."
        previously={null}
        changedCount={0}
        showSince
        sinceActive={false}
        readingMark="Read here on the fourth of August."
      />,
    );

    expect(screen.getByTestId('doorstep-reading-mark')).toHaveTextContent(
      'Read here on the fourth of August.',
    );
    expect(screen.getByRole('button', { name: 'What changed since yesterday' })).toBeInTheDocument();
  });

  it('is absent on a first visit', () => {
    render(
      <Doorstep
        sentence="Nothing waits for your name."
        previously={null}
        changedCount={0}
        showSince={false}
        sinceActive={false}
      />,
    );

    expect(screen.queryByTestId('doorstep-reading-mark')).not.toBeInTheDocument();
  });
});

// (d) ────────────────────────────────────────────────────────────────────────

const MARK: ThresholdMark = {
  id: 'door:prop-7',
  kind: 'door',
  roomId: 'room-library',
  label: 'Furnishings authorization No. 7',
  anchor: 'door',
  proposalId: 'prop-7',
  amountCents: 689_000,
};

const PROPOSAL: DoorProposal = {
  id: 'prop-7',
  title: 'Furnishings authorization No. 7',
  totalAmountCents: 689_000,
  sentAt: '2026-08-04',
  updatedAt: '2026-08-04',
  kind: 'furnishings_authorization',
};

const LONG_BODY =
  'Three last pieces for the library — the sconces you loved, the drapery, and the kilim runner ' +
  'we found in Dayton. Sign and I will have all three of them ordered by Friday morning, which ' +
  'keeps the installation week where it is.';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderDoor(note: NoteModel | null) {
  return render(
    <DoorGate
      mark={MARK}
      proposal={PROPOSAL}
      note={note}
      projectId="proj-1"
      studioName="Quist Interiors"
    />,
    { wrapper },
  );
}

describe('the note pinned to the door leaf', () => {
  beforeEach(() => {
    bundleMock.mockReturnValue({
      isLoading: false,
      isError: false,
      data: {
        document: { kind: 'furnishings_authorization' },
        furnishings: {
          checkpointId: null,
          depositRequiredCents: 0,
          depositPaidCents: 0,
          items: [],
        },
        tradeScope: null,
      },
    });
  });

  it('pins the note’s opening, not its body', () => {
    renderDoor({ id: 'note-1', body: LONG_BODY, sentAt: '2026-08-04', enclosures: [] });

    const pin = screen.getByTestId('door-note-pin');
    expect(pin).toHaveTextContent('Three last pieces for the library');
    expect(pin.textContent).toContain('…');
    expect(pin).not.toHaveTextContent('keeps the installation week where it is');
  });

  it('offers the way to the letter itself', () => {
    renderDoor({ id: 'note-1', body: LONG_BODY, sentAt: '2026-08-04', enclosures: [] });

    expect(screen.getByTestId('door-note-read')).toHaveAttribute('href', '#note');
  });

  it('attributes the quote to the studio and the day it was sent', () => {
    renderDoor({ id: 'note-1', body: 'Sign when you can.', sentAt: '2026-08-04', enclosures: [] });

    expect(screen.getByTestId('door-note-pin')).toHaveTextContent(
      '— Quist Interiors · 4 August',
    );
  });

  it('pins nothing when the house has no standing note', () => {
    renderDoor(null);

    expect(screen.queryByTestId('door-note-pin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('door-note-read')).not.toBeInTheDocument();
  });
});
