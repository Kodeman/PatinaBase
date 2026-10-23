import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PurchaseRecordForm } from '../purchase-record-form';

const mockRecord = jest.fn();
jest.mock('@patina/supabase', () => ({
  useRecordStudioPurchase: () => ({ mutateAsync: mockRecord, isPending: false }),
  useProjectRecordedStudio: () => ({ data: 'studio-1' }),
  useStudioPaymentMethods: () => ({ data: [] }),
  useOrganizationMembers: () => ({ data: [] }),
  useUser: () => ({ user: null }),
  useProjectFFEItems: () => ({ data: [] }),
  useStudioPurchases: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-folio', () => ({ useUploadFolioFile: () => ({ isPending: false }) }));
jest.mock('../../line-unfold/the-buy-cell', () => ({ MakerSearch: () => null }));

it('records the bound line as purchase history, not approval or another order', async () => {
  const done = jest.fn();
  mockRecord.mockResolvedValue({ description: 'Oak table' });
  render(<PurchaseRecordForm projectId="project-1" initialLine={{ id: 'line-1', name: 'Oak table' }} onDone={done} />);
  expect(screen.getByText('This records an existing purchase. Nothing will be sent or ordered.')).toBeInTheDocument();
  expect(screen.getByText('This is purchase history, not approval or a release to buy.')).toBeInTheDocument();
  expect(screen.getByRole('combobox', { name: 'Line' })).toBeDisabled();
  expect(screen.getByRole('combobox', { name: 'Line' })).toHaveValue('line-1');
  expect(screen.getByRole('button', { name: 'The studio, no project' })).toBeDisabled();
  expect(screen.getByText('Recording moves this line to ordered.')).toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox', { name: 'Where' }), { target: { value: 'Madison dealer' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'Amount paid' }), { target: { value: '240' } });
  fireEvent.click(screen.getByRole('button', { name: /Record the buy/ }));
  await waitFor(() => expect(mockRecord).toHaveBeenCalledWith(expect.objectContaining({ ffeItemId: 'line-1', projectId: 'project-1', amountCents: 24000 })));
  expect(done).toHaveBeenCalledWith('Recorded · Oak table');
});
