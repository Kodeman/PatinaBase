import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const addMutate = jest.fn(async () => ({ id: 'line-9' }));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

jest.mock('@patina/supabase', () => ({
  useCreateNamedProjectNeed: () => ({ mutateAsync: addMutate, isPending: false }),
}));

import { AddLineSheet } from '../add-line-sheet';

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

describe('AddLineSheet', () => {
  beforeEach(() => {
    addMutate.mockClear();
  });

  it('adds goods to the room it was reached from', async () => {
    renderSheet();
    type('Line name', 'Walnut bed, king');
    type('Quantity', '2');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));

    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(addMutate).toHaveBeenCalledWith({
      projectId: 'project-1',
      name: 'Walnut bed, king',
      quantity: 2,
      itemType: 'tbd',
      assignmentScope: 'room',
      roomId: 'room-1',
      disposition: 'candidate',
      source: 'named-need',
      idempotencyKey: expect.any(String),
    });
  });

  it('does not offer an allowance kind until its effective fields can be collected', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: 'Allowance' })).not.toBeInTheDocument();
  });

  it('does not send pricing or vendor fields through the named-need command', async () => {
    renderSheet();
    type('Line name', 'Console table');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));
    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    const request = addMutate.mock.calls[0]?.[0];
    expect(request).not.toHaveProperty('vendorName');
    expect(request).not.toHaveProperty('unitPriceCents');
  });

  it('lands a project-wide line under Throughout', async () => {
    renderSheet({ roomId: null, roomName: 'Throughout' });
    type('Line name', 'Runner');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));
    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(addMutate).toHaveBeenCalledWith(
      expect.objectContaining({ roomId: null, assignmentScope: 'throughout' }),
    );
  });

  it('closes after the canonical command succeeds', async () => {
    const onClose = jest.fn();
    renderSheet({ onClose });
    type('Line name', 'Library table');
    fireEvent.click(screen.getByRole('button', { name: /add the line/i }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
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
