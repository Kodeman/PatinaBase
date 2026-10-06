import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  useStudioPaymentMethods,
  useUpsertStudioPaymentMethod,
} from '@patina/supabase';
import { StudioPaymentMethodsCard } from '../studio-payment-methods';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@patina/supabase', () => ({
  useStudioPaymentMethods: jest.fn(),
  useUpsertStudioPaymentMethod: jest.fn(),
}));

const mockUpsert = jest.fn();

const AMEX = {
  id: 'pm-amex',
  organization_id: 'org-1',
  label: 'Amex · Leah',
  kind: 'card',
  last4: '4471',
  holder_member_id: null,
  archived_at: null,
};

beforeEach(() => {
  mockUpsert.mockReset().mockResolvedValue({ id: 'pm-new' });
  (useStudioPaymentMethods as jest.Mock).mockReturnValue({
    data: [AMEX],
    isLoading: false,
  });
  (useUpsertStudioPaymentMethod as jest.Mock).mockReturnValue({
    mutateAsync: mockUpsert,
    isPending: false,
  });
});

describe('StudioPaymentMethodsCard · paying makers (C-11)', () => {
  it('lists the studio methods by label and last four only', () => {
    render(<StudioPaymentMethodsCard studioId="org-1" canEdit />);
    expect(useStudioPaymentMethods).toHaveBeenCalledWith('org-1');
    expect(screen.getByTestId('studio-payment-methods')).toHaveTextContent(
      'Amex · LeahCard ••4471',
    );
  });

  it('adds a method with its last four, keeping only digits', async () => {
    render(<StudioPaymentMethodsCard studioId="org-1" canEdit />);
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: ' Chase ops ' },
    });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'ach' } });
    fireEvent.change(screen.getByLabelText('Last 4'), {
      target: { value: '9-0-1-2-3' },
    });
    expect(screen.getByLabelText('Last 4')).toHaveValue('9012');
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith({
        organizationId: 'org-1',
        label: 'Chase ops',
        kind: 'ach',
        last4: '9012',
      }),
    );
  });

  it('holds Add on a short last four, and sends none when empty', async () => {
    render(<StudioPaymentMethodsCard studioId="org-1" canEdit />);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Studio checks' } });
    fireEvent.change(screen.getByLabelText('Last 4'), { target: { value: '12' } });
    expect(screen.getByRole('alert')).toHaveTextContent('exactly four digits');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Last 4'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Kind'), { target: { value: 'check' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith({
        organizationId: 'org-1',
        label: 'Studio checks',
        kind: 'check',
        last4: null,
      }),
    );
  });

  it('removes a method by archiving it', async () => {
    render(<StudioPaymentMethodsCard studioId="org-1" canEdit />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Amex · Leah' }));
    await waitFor(() =>
      expect(mockUpsert).toHaveBeenCalledWith({ id: 'pm-amex', archived: true }),
    );
  });

  it('reads the list without editing for a member who cannot keep it', () => {
    render(<StudioPaymentMethodsCard studioId="org-1" canEdit={false} />);
    expect(screen.getByTestId('studio-payment-methods')).toHaveTextContent('Amex · Leah');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Name')).not.toBeInTheDocument();
  });
});
