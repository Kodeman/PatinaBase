import { fireEvent, render, screen } from '@testing-library/react';

import { useInvoices } from '@patina/supabase';
import ClientInvoicesPage from '../page';

const searchParamGet = jest.fn();

jest.mock('next/navigation', () => ({
  useSearchParams: () => ({ get: searchParamGet }),
}));

jest.mock('@patina/supabase', () => {
  const actual = jest.requireActual('@patina/supabase');
  return {
    ...actual,
    useInvoices: jest.fn(),
  };
});

const mockUseInvoices = useInvoices as jest.Mock;

describe('ClientInvoicesPage query states', () => {
  beforeEach(() => {
    searchParamGet.mockReturnValue(null);
  });

  it('shows a retryable query failure instead of a false empty invoice history', () => {
    const refetch = jest.fn();
    mockUseInvoices.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<ClientInvoicesPage />);

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load invoices/i);
    expect(screen.queryByText(/no invoices yet/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('uses the empty state only after a successful empty query', () => {
    mockUseInvoices.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });

    render(<ClientInvoicesPage />);

    expect(screen.getByText(/no invoices yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
