import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const addMutate = jest.fn(async () => ({ id: 'line-9' }));
const invalidateQueries = jest.fn();

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries }),
}));

jest.mock('@/hooks/use-projects', () => ({
  useAddProjectFFEItem: () => ({ mutateAsync: addMutate, isPending: false }),
}));

jest.mock('@/hooks/use-commercial-documents', () => ({
  commercialDocumentKeys: {
    budget: (projectId: string) => ['working-budget', projectId],
  },
}));

import { AddLineSheet, dollarsToCents } from '../add-line-sheet';

const renderSheet = (
  over: Partial<Parameters<typeof AddLineSheet>[0]> = {},
) =>
  render(
    <AddLineSheet
      open
      projectId="project-1"
      roomId="room-1"
      roomName="Primary bedroom"
      onClose={jest.fn()}
      {...over}
    />,
  );

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('dollarsToCents', () => {
  it('reads a typed figure, however it is punctuated', () => {
    expect(dollarsToCents('12,300')).toBe(1230000);
    expect(dollarsToCents('$4,200.50')).toBe(420050);
    expect(dollarsToCents('')).toBe(0);
    expect(dollarsToCents('—')).toBe(0);
  });
});

describe('AddLineSheet', () => {
  beforeEach(() => {
    addMutate.mockClear();
    invalidateQueries.mockClear();
  });

  it('adds goods to the room it was reached from', async () => {
    renderSheet();
    type('Line name', 'Walnut bed, king');
    type('Quantity', '2');
    type('Client unit price', '12,300');
    type('Vendor', 'Hollowell Woodshop');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));

    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(addMutate).toHaveBeenCalledWith({
      projectId: 'project-1',
      name: 'Walnut bed, king',
      quantity: 2,
      unitPriceCents: 1230000,
      vendorName: 'Hollowell Woodshop',
      itemType: 'fixed',
      projectRoomId: 'room-1',
      budgetMaxCents: null,
    });
  });

  it('swaps the price for a ceiling on an allowance', async () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Allowance' }));
    type('Line name', 'Sisal area rug');
    type('Allowance ceiling', '4,000');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));

    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(addMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        itemType: 'allowance',
        unitPriceCents: 400000,
        budgetMaxCents: 400000,
      }),
    );
  });

  it('leaves the maker out when it was not given', async () => {
    renderSheet();
    type('Line name', 'Console table');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));
    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(addMutate).toHaveBeenCalledWith(
      expect.objectContaining({ vendorName: null, unitPriceCents: 0 }),
    );
  });

  it('lands an unassigned line under Throughout', async () => {
    renderSheet({ roomId: null, roomName: 'Throughout' });
    type('Line name', 'Runner');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));
    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(addMutate).toHaveBeenCalledWith(
      expect.objectContaining({ projectRoomId: null }),
    );
  });

  it('refreshes the working budget so the Scheduled column follows', async () => {
    const onClose = jest.fn();
    renderSheet({ onClose });
    type('Line name', 'Library table');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['working-budget', 'project-1'],
    });
  });

  it('will not add a nameless line', () => {
    renderSheet();
    const act = screen.getByRole('button', { name: /add the line/i });
    expect(act).toBeDisabled();
    fireEvent.click(act);
    expect(addMutate).not.toHaveBeenCalled();
  });

  it('keeps quantity at one or more', async () => {
    renderSheet();
    type('Line name', 'Bench');
    type('Quantity', '0');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));
    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(addMutate).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 1 }),
    );
  });

  it('says what went wrong and keeps the sheet open', async () => {
    addMutate.mockRejectedValueOnce(new Error('The insert was refused.'));
    const onClose = jest.fn();
    renderSheet({ onClose });
    type('Line name', 'Bench');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'The insert was refused.',
      ),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
