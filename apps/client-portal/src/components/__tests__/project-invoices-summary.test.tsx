import { fireEvent, render, screen } from '@testing-library/react';

import { useProjectInvoices } from '@patina/supabase';
import { ProjectInvoicesSummary } from '../project-invoices-summary';

jest.mock('@patina/supabase', () => ({
  useProjectInvoices: jest.fn(),
}));

const mockUseProjectInvoices = useProjectInvoices as jest.Mock;

describe('ProjectInvoicesSummary query states', () => {
  it('renders a retryable failure instead of disappearing when the query fails', () => {
    const refetch = jest.fn();
    mockUseProjectInvoices.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    });

    render(<ProjectInvoicesSummary projectId="project-1" />);

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load project invoices/i);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('stays absent only for a successful empty query', () => {
    mockUseProjectInvoices.mockReturnValue({
      data: [],
      isLoading: false,
      isError: false,
      refetch: jest.fn(),
    });
    const { container } = render(<ProjectInvoicesSummary projectId="project-1" />);

    expect(container).toBeEmptyDOMElement();
  });
});
