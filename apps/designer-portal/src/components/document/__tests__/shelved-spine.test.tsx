/**
 * What is left of the spine's old block after OD-16: the room lens.
 *
 * `spine-running-index.tsx` and `spine-shelved-blocks.tsx` are deleted — the
 * ladder is the rail's one block now (`spine/lens-ladder.tsx`), and it is
 * asserted in `spine/__tests__/lens-ladder.test.tsx`. The paper-order cases
 * this file used to carry moved with the declaration they read, to
 * `lib/document/__tests__/document-index.test.ts` (W2-L2).
 *
 * The room lens stays here because it is not the ladder's: the hold is a
 * document-wide context the ticket's chips, the letterhead and now the ladder's
 * rungs all write to, and it survives every width (B2/R124).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { useRoomLens, RoomLensProvider } from '../room-lens-context';

describe('the room lens', () => {
  function Probe() {
    const { heldRoomId, toggleRoom } = useRoomLens();
    return (
      <button type="button" onClick={() => toggleRoom('r1')}>
        {heldRoomId ?? 'none'}
      </button>
    );
  }

  it('holds one room and lets go of it on a second press', () => {
    render(
      <RoomLensProvider>
        <Probe />
      </RoomLensProvider>,
    );
    const button = screen.getByRole('button');
    expect(button).toHaveTextContent('none');
    fireEvent.click(button);
    expect(button).toHaveTextContent('r1');
    fireEvent.click(button);
    expect(button).toHaveTextContent('none');
  });

  it('holds nothing at all outside a provider rather than throwing', () => {
    render(<Probe />);
    expect(screen.getByRole('button')).toHaveTextContent('none');
  });
});
