import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const addMutate = jest.fn(async (_request: Record<string, unknown>) => ({
  outcome: 'created',
  selectionId: 'line-9',
}));

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

jest.mock('@/lib/help-system/open-help', () => ({ openHelp: jest.fn() }));

const linkMutate = jest.fn(async () => ({ id: 'line-fabric', project_id: 'project-1' }));

jest.mock('@patina/supabase', () => ({
  useCreateNamedProjectNeed: () => ({ mutateAsync: addMutate, isPending: false }),
  // C-24: "This piece takes COM" links the fabric line to the piece.
  useLinkFfePair: () => ({ mutateAsync: linkMutate, isPending: false }),
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
      assignmentScope="room"
      onClose={jest.fn()}
      {...over}
    />,
  );

const lineField = () => screen.getByLabelText('Line name') as HTMLInputElement;

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

const enterLine = (value: string) => {
  type('Line name', value);
  fireEvent.keyDown(lineField(), { key: 'Enter' });
};

const sent = (call: number) => addMutate.mock.calls[call]?.[0];

describe('AddLineSheet', () => {
  beforeEach(() => {
    addMutate.mockClear();
    linkMutate.mockClear();
  });

  describe('Enter adds the line and starts the next', () => {
    it('opens with the cursor in Line', async () => {
      renderSheet();
      await waitFor(() => expect(lineField()).toHaveFocus());
    });

    it('saves through the named-need command, clears the fields, stays open and returns to Line', async () => {
      const onClose = jest.fn();
      renderSheet({ onClose });
      type('Line name', 'Walnut bed, king');
      type('Quantity', '2');

      fireEvent.keyDown(lineField(), { key: 'Enter' });

      await waitFor(() => expect(lineField()).toHaveValue(''));
      expect(addMutate).toHaveBeenCalledTimes(1);
      expect(sent(0)).toEqual({
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
      expect(screen.getByLabelText('Quantity')).toHaveValue(1);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
      expect(lineField()).toHaveFocus();
    });

    it('S1: four Enters make four Living Room lines, L1–L4, and the sheet stays open', async () => {
      const onClose = jest.fn();
      renderSheet({ roomId: 'room-living', roomName: 'Living Room', onClose });
      const lines = ['Sofa', 'Lounge chair', 'Coffee table', 'Floor lamp'];

      for (const [index, line] of lines.entries()) {
        enterLine(line);
        await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(index + 1));
        await waitFor(() => expect(lineField()).toHaveValue(''));
        expect(lineField()).toHaveFocus();
      }

      expect(addMutate.mock.calls.map(([request]) => request.name)).toEqual(lines);
      for (const [request] of addMutate.mock.calls) {
        expect(request).toEqual(
          expect.objectContaining({ assignmentScope: 'room', roomId: 'room-living' }),
        );
      }
      const keys = new Set(addMutate.mock.calls.map(([request]) => request.idempotencyKey));
      expect(keys.size).toBe(4);
      expect(onClose).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('does nothing on Enter with no name', () => {
      renderSheet();
      fireEvent.keyDown(lineField(), { key: 'Enter' });
      expect(addMutate).not.toHaveBeenCalled();
    });

    it('the Add act also keeps the sheet open and returns focus to Line', async () => {
      const onClose = jest.fn();
      renderSheet({ onClose });
      type('Line name', 'Library table');
      const act = screen.getByRole('button', { name: /add the line/i });
      act.focus();
      fireEvent.click(act);
      await waitFor(() => expect(lineField()).toHaveValue(''));
      expect(lineField()).toHaveFocus();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe('closing is its own act', () => {
    it('Esc closes the sheet', async () => {
      const onClose = jest.fn();
      renderSheet({ onClose });
      const dialog = screen.getByRole('dialog');
      await waitFor(() =>
        expect(dialog).toContainElement(document.activeElement as HTMLElement),
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(addMutate).not.toHaveBeenCalled();
    });

    it('a visible Done adding act closes the sheet without adding', () => {
      const onClose = jest.fn();
      renderSheet({ onClose });
      type('Line name', 'Half-typed');
      const done = screen.getByRole('button', { name: 'Done adding' });
      expect(done).toBeVisible();
      fireEvent.click(done);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(addMutate).not.toHaveBeenCalled();
    });
  });

  describe('the scope value is the one the caller names', () => {
    it('Not in a room yet sends unassigned with no room', async () => {
      renderSheet({ roomId: null, roomName: 'Not in a room yet', assignmentScope: 'unassigned' });
      enterLine('Mirror');
      await waitFor(() => expect(addMutate).toHaveBeenCalled());
      expect(sent(0)).toEqual(
        expect.objectContaining({ assignmentScope: 'unassigned', roomId: null }),
      );
    });

    it('a room sends room with its id', async () => {
      renderSheet({ roomId: 'room-living', roomName: 'Living Room', assignmentScope: 'room' });
      enterLine('Sofa');
      await waitFor(() => expect(addMutate).toHaveBeenCalled());
      expect(sent(0)).toEqual(
        expect.objectContaining({ assignmentScope: 'room', roomId: 'room-living' }),
      );
    });

    it('Throughout is sent when chosen', async () => {
      renderSheet({ roomId: null, roomName: 'Throughout', assignmentScope: 'throughout' });
      enterLine('Runner');
      await waitFor(() => expect(addMutate).toHaveBeenCalled());
      expect(sent(0)).toEqual(
        expect.objectContaining({ assignmentScope: 'throughout', roomId: null }),
      );
    });

    it('never reads the scope from the printed room name', async () => {
      renderSheet({ roomId: null, roomName: 'Throughout', assignmentScope: 'unassigned' });
      enterLine('Mirror');
      await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
      expect(sent(0)).toEqual(expect.objectContaining({ assignmentScope: 'unassigned' }));
    });

    it('a name printed Unsorted is not a scope either', async () => {
      renderSheet({ roomId: null, roomName: 'Unsorted', assignmentScope: 'throughout' });
      enterLine('Runner');
      await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
      expect(sent(0)).toEqual(expect.objectContaining({ assignmentScope: 'throughout' }));
    });
  });

  describe('COM fabric (unchanged)', () => {
    it('adds a piece that takes COM as a pair: the piece, then its fabric linked to it', async () => {
      addMutate
        .mockResolvedValueOnce({ outcome: 'created', selectionId: 'line-sofa' })
        .mockResolvedValueOnce({ outcome: 'created', selectionId: 'line-fabric' });
      renderSheet();
      type('Line name', 'Sofa');
      fireEvent.click(screen.getByLabelText('This piece takes COM'));
      fireEvent.click(screen.getByRole('button', { name: /add the pair/i }));

      await waitFor(() =>
        expect(linkMutate).toHaveBeenCalledWith({ childId: 'line-fabric', parentId: 'line-sofa' }),
      );
      expect(addMutate).toHaveBeenCalledTimes(2);
      expect(addMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: 'Sofa — COM fabric',
          assignmentScope: 'room',
          roomId: 'room-1',
        }),
      );
      await waitFor(() => expect(lineField()).toHaveValue(''));
      expect(screen.getByLabelText('This piece takes COM')).not.toBeChecked();
    });

    it('keeps the fabric beside its piece when the piece is not in a room yet', async () => {
      addMutate
        .mockResolvedValueOnce({ outcome: 'created', selectionId: 'line-sofa' })
        .mockResolvedValueOnce({ outcome: 'created', selectionId: 'line-fabric' });
      renderSheet({ roomId: null, roomName: 'Not in a room yet', assignmentScope: 'unassigned' });
      type('Line name', 'Sofa');
      fireEvent.click(screen.getByLabelText('This piece takes COM'));
      fireEvent.click(screen.getByRole('button', { name: /add the pair/i }));

      await waitFor(() => expect(linkMutate).toHaveBeenCalled());
      expect(addMutate).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: 'Sofa — COM fabric',
          assignmentScope: 'unassigned',
          roomId: null,
        }),
      );
    });

    it('adds one line, and links nothing, when the piece takes no COM', async () => {
      renderSheet();
      type('Line name', 'Bench');
      fireEvent.click(screen.getByRole('button', { name: /add the line/i }));
      await waitFor(() => expect(addMutate).toHaveBeenCalledTimes(1));
      expect(linkMutate).not.toHaveBeenCalled();
    });
  });

  it('does not offer an allowance kind until its effective fields can be collected', () => {
    renderSheet();
    expect(screen.queryByRole('button', { name: 'Allowance' })).not.toBeInTheDocument();
  });

  it('does not send pricing or vendor fields through the named-need command', async () => {
    renderSheet();
    enterLine('Console table');
    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(sent(0)).not.toHaveProperty('vendorName');
    expect(sent(0)).not.toHaveProperty('unitPriceCents');
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
    type('Quantity', '0');
    enterLine('Bench');
    await waitFor(() => expect(addMutate).toHaveBeenCalled());
    expect(sent(0)).toEqual(expect.objectContaining({ quantity: 1 }));
  });

  it('says what went wrong, keeps the name and keeps the sheet open', async () => {
    addMutate.mockRejectedValueOnce(new Error('The insert was refused.'));
    const onClose = jest.fn();
    renderSheet({ onClose });
    enterLine('Bench');
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('The insert was refused.'),
    );
    expect(lineField()).toHaveValue('Bench');
    expect(onClose).not.toHaveBeenCalled();
  });
});
