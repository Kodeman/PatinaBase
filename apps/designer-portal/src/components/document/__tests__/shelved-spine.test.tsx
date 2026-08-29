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

/**
 * The money read's cost guard, re-homed. `spine-shelved-blocks.tsx` mounted
 * `useMoneyLadder` — and the two un-`enabled` queries under it,
 * `useProjectInvoices` and `usePurchaseOrders` — only where the spread's
 * regions included `money`, because a conditional MOUNT was the only gate
 * those queries could take. The file is gone (OD-16) and the ladder replaced
 * it, so the guard now stands on the ladder: the rail states the money stop
 * from facts it is HANDED and opens no read of its own, on any spread.
 */
const useMoneyLadder = jest.fn();
const useProjectInvoices = jest.fn();
const usePurchaseOrders = jest.fn();
jest.mock('@/hooks/use-money-ladder', () => ({
  useMoneyLadder: (...args: unknown[]) => useMoneyLadder(...args),
}));
jest.mock('@patina/supabase', () => ({
  useProjectInvoices: (...args: unknown[]) => useProjectInvoices(...args),
  usePurchaseOrders: (...args: unknown[]) => usePurchaseOrders(...args),
}));

import { useRoomLens, RoomLensProvider } from '../room-lens-context';
import { LensLadder } from '../spine/lens-ladder';
import {
  deriveLadderDoors,
  deriveLadderSegments,
} from '@/lib/document/lens-ladder-derivation';
import type { SectionKey } from '@/lib/document/desk-derivation';
import type { TicketInput } from '@/lib/document/ticket-derivation';

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

describe('the ladder’s money read', () => {
  const ROOMS = [{ id: 'r1', name: 'Living room' }];

  function ticket(section: SectionKey): TicketInput {
    return {
      section,
      phase: { name: 'Install', position: 5, of: 6 },
      project: true,
      rooms: { settled: true, list: ROOMS },
      pieces: {
        settled: true,
        lines: [{ stamp: 'ordered', roomId: 'r1', specified: true }],
      },
      drawings: { settled: true, sheetCount: 2 },
      boards: { settled: true, count: 1 },
      money: { settled: false, failed: false, ladder: null },
      dates: { settled: true, schedule: null },
      people: { settled: true, callSheetEnabled: false, rosterCount: 0 },
      now: new Date(2026, 7, 25),
    };
  }

  function ladderFor(section: SectionKey) {
    const input = {
      ticket: ticket(section),
      approvals: {
        settled: true,
        awaiting: 0,
        overdue: 0,
        overdueDays: null,
        records: 0,
      },
      care: { settled: true, closed: 0, total: 6 },
      record: { settled: true, complete: 1 },
    };
    return {
      segments: deriveLadderSegments(input),
      doors: deriveLadderDoors({ ticket: input.ticket, held: false }),
    };
  }

  beforeEach(() => {
    useMoneyLadder.mockReset();
    useProjectInvoices.mockReset();
    usePurchaseOrders.mockReset();
  });

  it('pays for no money read on a spread that prints no money row', () => {
    for (const section of ['install', 'care'] as const) {
      const { segments, doors } = ladderFor(section);
      expect(segments.map((segment) => segment.key)).toEqual([
        'approvals',
        'ffe',
        'care',
        'record',
      ]);

      const { unmount } = render(
        <LensLadder
          segments={segments}
          doors={doors}
          activeKey={null}
          onJump={jest.fn()}
        />,
      );
      expect(
        screen.queryByRole('navigation', { name: 'This paper' })
          ?.querySelector('[data-index-region="money"]'),
      ).toBeNull();
      unmount();
    }

    expect(useMoneyLadder).not.toHaveBeenCalled();
    expect(useProjectInvoices).not.toHaveBeenCalled();
    expect(usePurchaseOrders).not.toHaveBeenCalled();
  });

  it('states the money stop from facts it is handed, and still opens no read', () => {
    const { segments, doors } = ladderFor('project');
    expect(segments.map((segment) => segment.key)).toContain('money');

    render(
      <LensLadder
        segments={segments}
        doors={doors}
        activeKey="money"
        onJump={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('navigation', { name: 'This paper' }),
    ).toHaveAttribute('data-reading-index', 'money');
    expect(useMoneyLadder).not.toHaveBeenCalled();
    expect(useProjectInvoices).not.toHaveBeenCalled();
    expect(usePurchaseOrders).not.toHaveBeenCalled();
  });
});
