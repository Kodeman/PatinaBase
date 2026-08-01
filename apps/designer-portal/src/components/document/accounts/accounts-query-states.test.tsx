import { fireEvent, render, screen } from '@testing-library/react';

import {
  useArAging,
  useDesignerTeachingStats,
  useEarnings,
  useEarningsStats,
  useInvoice,
  useInvoices,
} from '@patina/supabase';
import { AccountsBook } from './accounts-book';
import { InvoiceFolio } from './invoice-folio';

jest.mock('@patina/supabase', () => ({
  useArAging: jest.fn(),
  useDesignerTeachingStats: jest.fn(),
  useEarnings: jest.fn(),
  useEarningsStats: jest.fn(),
  useInvoice: jest.fn(),
  useInvoices: jest.fn(),
  useIssueInvoice: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useRecordPayment: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useSendInvoice: () => ({ isPending: false, mutateAsync: jest.fn() }),
  useVoidInvoice: () => ({ isPending: false, mutateAsync: jest.fn() }),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual('@tanstack/react-query'),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock('../command-bar', () => ({
  openLedger: jest.fn(),
}));

jest.mock('@/hooks/use-studio-accounts', () => ({
  useStudioMargin: () => ({ data: null }),
}));

jest.mock('../ledger-front-matter', () => ({
  LedgerFrontMatter: () => <div data-testid="ledger-front-matter">Ledger totals</div>,
}));

jest.mock('./accounts-ledger-page', () => ({
  AccountsLedgerPage: () => <div data-testid="accounts-ledger">Ledger rows</div>,
}));

jest.mock('./accounts-receivables-page', () => ({
  AccountsReceivablesPage: () => <div>Receivables rows</div>,
}));

jest.mock('./accounts-earnings-page', () => ({
  AccountsEarningsPage: () => <div>Earnings rows</div>,
}));

jest.mock('../overlays/doc-sheet', () => ({
  DocSheetHead: () => <div>Accounts header</div>,
}));

jest.mock('@/lib/document/registry', () => ({
  STUDIO_LEDGERS: [{ key: 'accounts', icon: () => null }],
}));

const mockUseInvoices = useInvoices as jest.Mock;
const mockUseInvoice = useInvoice as jest.Mock;
const mockUseArAging = useArAging as jest.Mock;
const mockUseEarnings = useEarnings as jest.Mock;
const mockUseEarningsStats = useEarningsStats as jest.Mock;
const mockUseDesignerTeachingStats = useDesignerTeachingStats as jest.Mock;

describe('designer Accounts query failures', () => {
  beforeEach(() => {
    mockUseArAging.mockReturnValue({
      aging: { totalBalanceCents: 0, buckets: [] },
    });
    mockUseEarnings.mockReturnValue({ data: [] });
    mockUseEarningsStats.mockReturnValue({ data: null });
    mockUseDesignerTeachingStats.mockReturnValue({ data: null });
  });

  it('does not turn a failed invoice list into zero totals or an empty ledger', () => {
    const refetch = jest.fn();
    mockUseInvoices.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<AccountsBook onClose={jest.fn()} />);

    expect(screen.getByRole('alert')).toHaveTextContent(/studio book could not be opened/i);
    expect(screen.queryByTestId('ledger-front-matter')).not.toBeInTheDocument();
    expect(screen.queryByTestId('accounts-ledger')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('distinguishes an invoice-folio query failure from invoice not found', () => {
    const refetch = jest.fn();
    mockUseInvoice.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<InvoiceFolio invoiceId="invoice-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/invoice folio could not be opened/i);
    expect(screen.queryByText(/invoice not found/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('uses invoice not found only for a successful missing read', () => {
    mockUseInvoice.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<InvoiceFolio invoiceId="missing-invoice" />);

    expect(screen.getByText(/invoice not found/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
