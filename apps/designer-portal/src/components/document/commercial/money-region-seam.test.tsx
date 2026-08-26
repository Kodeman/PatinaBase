/**
 * The Money seam (W4b) — money's posture on the Delivery table.
 *
 * On the table money is the measure, not the work: one scored line stating
 * what has been committed against the authority it is spent out of, folded
 * before it is asked for, and unfolding IN PLACE to exactly the region that
 * stands on the paper today. The mock surface is money-region.test.tsx's, so a
 * difference here is `tableSeam`'s doing and nothing else's.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

let mockAuthority: Record<string, unknown>;
let mockBudget: Record<string, unknown>;
let mockInstruments: Record<string, unknown>;
let mockTradeScopes: Record<string, unknown>;
let mockAccount: Record<string, unknown>;
let mockPurchaseOrders: Record<string, unknown>;
let mockInvoices: Record<string, unknown>;

jest.mock('@patina/supabase', () => ({
  ...jest.requireActual('@patina/supabase'),
  usePurchaseOrders: () => mockPurchaseOrders,
  useProjectInvoices: () => mockInvoices,
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  useProjectBillingAuthority: () => mockAuthority,
  useWorkingBudget: () => mockBudget,
  useProjectInstruments: () => mockInstruments,
  useTradeScopes: () => mockTradeScopes,
}));

jest.mock('@/hooks/use-account-page', () => ({
  useAccountPage: () => mockAccount,
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
    regionFolded: jest.fn(),
  },
}));

jest.mock('../accounts/invoice-overlays', () => ({
  openInvoiceComposer: jest.fn(),
}));
jest.mock('../command-bar', () => ({ openLedger: jest.fn() }));
jest.mock('./project-authority-band', () => ({
  ProjectAuthorityBandForProject: () => <div>Authority band</div>,
}));
jest.mock('./project-commerce-section', () => ({
  ProjectCommerceSection: () => <div>Commerce section</div>,
}));
jest.mock('../account-band', () => ({ AccountBand: () => <div>Account band</div> }));

import { MoneyRegion } from './money-region';
import { requestRegionUnfold } from '@/lib/document/document-index';

/** A project busy enough that the region's OWN default would stand it open —
 *  so a folded seam here is the table's posture and not the sparse default. */
beforeEach(() => {
  window.localStorage.clear();
  mockAuthority = {
    data: { authorizedCents: 8_000_000, remainingCents: 1_760_000 },
    isLoading: false,
    error: null,
  };
  mockBudget = {
    data: { version: { version: 2, lines: [{ targetCents: 7_000_000 }] } },
    isLoading: false,
    error: null,
  };
  mockInstruments = {
    data: [{ state: 'executed', totalAmountCents: 6_240_000 }],
    isLoading: false,
    error: null,
  };
  mockTradeScopes = { data: [], isLoading: false, error: null };
  mockAccount = {
    data: { committedCents: 900_000, milestones: [] },
    isLoading: false,
    isError: false,
  };
  mockPurchaseOrders = { data: [], isLoading: false, error: null };
  mockInvoices = { data: [], isLoading: false, error: null };
});

describe('the Money seam, on the Delivery table', () => {
  it('stands as one line: committed, against the authority it is spent from', () => {
    render(<MoneyRegion projectId="project-1" tableSeam />);

    const seam = screen.getByRole('button', { name: /unfold/i });
    expect(seam).toHaveTextContent('$62,400 committed of $80,000 authority');
    expect(screen.queryByRole('heading', { name: 'Money' })).toBeNull();
  });

  it('unfolds in place to exactly the region that stands on the paper today', () => {
    const { container } = render(<MoneyRegion projectId="project-1" tableSeam />);
    const section = container.querySelector('[data-index-region="money"]')!;

    fireEvent.click(screen.getByRole('button', { name: /unfold/i }));

    // Same section element, now carrying the whole region: head, six rungs,
    // and the detail surfaces the rungs summarise.
    expect(container.querySelector('[data-index-region="money"]')).toBe(section);
    expect(screen.getByRole('heading', { name: 'Money' })).toBeVisible();
    expect(screen.getByText('$17,600 remaining · $62,400 committed')).toBeVisible();
    expect(screen.getByText('Budget · $80,000 approved')).toBeVisible();
    expect(screen.getByText('Account band')).toBeInTheDocument();
  });

  it('keeps its index anchor folded, and its heading once the index asks', () => {
    const { container } = render(<MoneyRegion projectId="project-1" tableSeam />);

    // The running index's money entry resolves in both postures: the anchor
    // stands while folded, and the region answers the index's own request by
    // unfolding — the index jumps to readable content, never to a seam.
    expect(container.querySelector('[data-index-region="money"]')).not.toBeNull();
    expect(document.getElementById('money-region-heading')).toBeNull();

    act(() => requestRegionUnfold('money'));

    expect(document.getElementById('money-region-heading')).not.toBeNull();
  });

  it('remembers the table’s fold apart from the region’s own', () => {
    const { unmount } = render(<MoneyRegion projectId="project-1" tableSeam />);
    fireEvent.click(screen.getByRole('button', { name: /unfold/i }));
    unmount();

    // Off the table the region keeps its own derived posture: a busy project
    // stands open, and the table's remembered press did not spend its seam.
    render(<MoneyRegion projectId="project-1" />);
    expect(window.localStorage.getItem('patina:doc-fold:project-1:money')).toBeNull();
    expect(
      window.localStorage.getItem('patina:doc-fold:project-1:money-table'),
    ).toBe('0');
  });

  it('folds by declaration, not by data — a quiet project seams too', () => {
    mockInstruments = { data: [], isLoading: false, error: null };
    mockBudget = { data: { version: null }, isLoading: false, error: null };
    mockAccount = { data: null, isLoading: false, isError: false };

    render(<MoneyRegion projectId="project-1" tableSeam />);

    expect(screen.getByRole('button', { name: /unfold/i })).toHaveTextContent(
      '$0 committed of $80,000 authority',
    );
  });

  it('states no figure before its reads settle — the declaration waits', () => {
    // The authority is still in flight. A seam that stood now would print
    // "$0 committed · no authority yet" and then flip to the truth, which is
    // the same lie the region's own tiers refuse to tell.
    mockAuthority = { data: undefined, isLoading: true, error: null };

    render(<MoneyRegion projectId="project-1" tableSeam />);

    expect(screen.queryByRole('button', { name: /unfold/i })).toBeNull();
    // The seam's own sentence, in the shape it would have had: never printed.
    expect(
      screen.queryByText('$0 committed · no authority yet'),
    ).not.toBeInTheDocument();
    // The region stands as it does anywhere unsettled: each rung printing its
    // name and no figure.
    expect(screen.getByText('Budget')).toBeInTheDocument();
  });

  it('will not fold over money that is chasing the designer', () => {
    // One drawn, unpaid invoice. The declared fold would hide it — and on this
    // table the accounts have no other home, because the money region IS the
    // accounts surface on the project spread.
    mockAccount = {
      data: {
        committedCents: 900_000,
        milestones: [
          { invoice_id: 'invoice-1', paid_at: null, status: 'outstanding' },
        ],
      },
      isLoading: false,
      isError: false,
    };

    render(<MoneyRegion projectId="project-1" tableSeam />);

    expect(screen.queryByRole('button', { name: /unfold/i })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Money' })).toBeVisible();
    expect(screen.getByText('Account band')).toBeInTheDocument();
  });

  it('folds over milestones that are neither drawn against nor outstanding', () => {
    mockAccount = {
      data: {
        committedCents: 900_000,
        milestones: [{ invoice_id: null, paid_at: null, status: 'upcoming' }],
      },
      isLoading: false,
      isError: false,
    };

    render(<MoneyRegion projectId="project-1" tableSeam />);

    // A schedule with nothing drawn and nothing owed is quiet, so the
    // declaration governs and the seam stands.
    expect(screen.getByRole('button', { name: /unfold/i })).toBeInTheDocument();
  });
});
