import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PurchaseRecordForm } from '../purchase-record-form';

const mockRecord = jest.fn();
const studioLine = { id: 'line-1', name: 'Oak table', status: 'approved', design_disposition: 'selected', external_fulfilment_id: null };
const externalLine = { id: 'external-1', name: 'GC cabinetry', status: 'specified', design_disposition: 'selected', product_id: 'product-1', unit_price_cents: 0, external_fulfilment_id: 'fulfilment-1' };
const mockItems = [studioLine, externalLine];
jest.mock('@patina/supabase', () => ({
  useRecordStudioPurchase: () => ({ mutateAsync: mockRecord, isPending: false }),
  useProjectRecordedStudio: () => ({ data: 'studio-1' }),
  useStudioPaymentMethods: () => ({ data: [] }),
  useOrganizationMembers: () => ({ data: [] }),
  useUser: () => ({ user: null }),
  useProjectFFEItems: () => ({ data: mockItems }),
  useStudioPurchases: () => ({ data: [] }),
}));
jest.mock('@/hooks/use-folio', () => ({ useUploadFolioFile: () => ({ isPending: false }) }));
jest.mock('../../line-unfold/the-buy-cell', () => ({ MakerSearch: () => null }));

it('offers only studio lines in the global purchase selector', () => {
  render(<PurchaseRecordForm projectId="project-1" onDone={jest.fn()} />);
  expect(screen.getByRole('option', { name: 'Oak table' })).toHaveValue('line-1');
  expect(screen.queryByRole('option', { name: 'GC cabinetry' })).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('combobox', { name: 'Line' }), { target: { value: 'line-1' } });
  expect(screen.getByRole('combobox', { name: 'Line' })).toHaveValue('line-1');
});

it('does not offer an external initial line outside the filtered purchase selector', () => {
  render(<PurchaseRecordForm projectId="project-1" initialLine={externalLine} onDone={jest.fn()} />);
  expect(screen.queryByRole('option', { name: 'GC cabinetry' })).not.toBeInTheDocument();
});

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
