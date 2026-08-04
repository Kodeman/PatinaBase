/**
 * The overlay stack — one Escape puts back ONE sheet.
 *
 * RoomSheet used to bind Escape on `document` without asking whether it was the
 * sheet on top, and it never joined the managed modal stack. A RoomSheet raised
 * over a DocSheet therefore collapsed the whole stack on a single Escape: the
 * designer lost the ledger they were reading as well as the sheet they meant to
 * put back. This is the regression fence for that.
 */

import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { DocSheet } from '../overlays/doc-sheet';
import { topActiveModalDialog } from '../overlays/active-dialog';
import { RoomSheet } from '../rooms/room-sheet';

/**
 * The real arrangement: a surface owns BOTH sheets as siblings (a Room renders
 * its RoomSheet; a ledger raised over it renders its DocSheet), and the
 * RoomSheet is raised second. This is the case that used to break — DocSheet
 * portals to `document.body`, so an inline RoomSheet sat EARLIER in the
 * document than the sheet it visually covers, and `topActiveModalDialog()`
 * named the wrong one.
 */
function StackedSheets() {
  const [docOpen, setDocOpen] = useState(true);
  const [roomOpen, setRoomOpen] = useState(false);

  return (
    <>
      <RoomSheet
        open={roomOpen}
        onClose={() => setRoomOpen(false)}
        title="The room sheet"
      >
        <p>Room body</p>
      </RoomSheet>
      <DocSheet
        open={docOpen}
        onClose={() => setDocOpen(false)}
        title="The ledger"
      >
        <p>Ledger body</p>
        <button type="button" onClick={() => setRoomOpen(true)}>
          Raise the room sheet
        </button>
      </DocSheet>
    </>
  );
}

function raiseRoomSheet() {
  render(<StackedSheets />);
  fireEvent.click(screen.getByRole('button', { name: 'Raise the room sheet' }));
}

describe('DocSheet + RoomSheet — the managed stack', () => {
  it('hands the top of the stack to the RoomSheet and covers the DocSheet', () => {
    raiseRoomSheet();

    const roomPanel = screen.getByRole('dialog', { name: 'The room sheet' });
    expect(topActiveModalDialog()).toBe(roomPanel);

    // The ledger is still mounted (D1) but knows it is underneath.
    expect(screen.getByText('Ledger body')).toBeInTheDocument();
    expect(
      document.querySelector('[data-doc-sheet-layer]'),
    ).toHaveAttribute('data-doc-sheet-stack-state', 'covered');
    expect(
      document.querySelector('[data-room-sheet-layer]'),
    ).toHaveAttribute('data-room-sheet-stack-state', 'top');
  });

  it('one Escape closes ONLY the RoomSheet; a second closes the DocSheet', () => {
    raiseRoomSheet();
    expect(screen.getByText('Room body')).toBeInTheDocument();
    expect(screen.getByText('Ledger body')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('Room body')).not.toBeInTheDocument();
    expect(screen.getByText('Ledger body')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByText('Ledger body')).not.toBeInTheDocument();
  });

  it('gives the DocSheet the top back when the RoomSheet is put away', () => {
    raiseRoomSheet();
    fireEvent.keyDown(document, { key: 'Escape' });

    const docPanel = screen.getByRole('dialog', { name: 'The ledger' });
    expect(topActiveModalDialog()).toBe(docPanel);
    expect(
      document.querySelector('[data-doc-sheet-layer]'),
    ).toHaveAttribute('data-doc-sheet-stack-state', 'top');
  });

  it('still closes a lone RoomSheet on Escape', () => {
    const onClose = jest.fn();
    render(
      <RoomSheet open onClose={onClose} title="Alone">
        <p>Only body</p>
      </RoomSheet>,
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
