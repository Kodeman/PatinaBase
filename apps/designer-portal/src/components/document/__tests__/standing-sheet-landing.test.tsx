/**
 * US-19 FR4 522-3 (Fix 4, `one-voice`) — every Standing-sheet row lands on a
 * control, as the band's acts do. The sheet goes back first; then a Pieces act
 * goes to Pieces by its name (`Spec the N unspecified`, `Send the purchase
 * order`, `File the claim`, `Follow up with the maker`, `Open the pieces`) and
 * a `Nudge` row the table names no control for opens the Message composer.
 * Where no region takes it, the act keeps its own landing. Off, the row's act
 * runs as the 0b sheet ran it.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useRef, useState } from 'react';
import { ACT_LANDING_EVENTS } from '@/lib/document/act-names';
import type { LensStandingItem } from '@/lib/document/lens-band-derivation';
import { StandingSheet } from '../standing-sheet';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const row = (
  key: string,
  actKey: string,
  label: string,
  over: Partial<LensStandingItem> = {},
): LensStandingItem => ({
  key,
  eyebrow: 'NEEDS YOU',
  sentence: `${label} — the row`,
  act: { key: actKey, label, onAct: jest.fn() },
  tier: 'overdue',
  days: null,
  standingSince: null,
  ...over,
});

/** A region that owns a control and takes `type` the way Pieces and the
 *  letterhead do: cancel it, then land focus two frames later. */
function listen(type: string, take = true) {
  const details: unknown[] = [];
  const onEvent = (event: Event) => {
    details.push((event as CustomEvent).detail);
    if (!take) return;
    event.preventDefault();
    requestAnimationFrame(() =>
      requestAnimationFrame(() => document.getElementById('region-control')?.focus()),
    );
  };
  window.addEventListener(type, onEvent);
  return { details, stop: () => window.removeEventListener(type, onEvent) };
}

/** The band: the door that opens the sheet, and the sheet itself. */
function Band({ items, grouped = true }: { items: LensStandingItem[]; grouped?: boolean }) {
  const [open, setOpen] = useState(true);
  const door = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button ref={door} type="button" onClick={() => setOpen(true)}>
        Standing · {items.length}
      </button>
      <button id="region-control" type="button">
        The region’s control
      </button>
      <StandingSheet
        open={open}
        onClose={() => setOpen(false)}
        items={items}
        grouped={grouped}
        triggerRef={door}
      />
    </>
  );
}

describe('a Standing-sheet row lands on a control (FR4 522-3)', () => {
  it('Spec the 3 unspecified: the sheet goes back and Pieces takes the act, focus on its control', async () => {
    const spec = row('ticket:spec', 'own:document-act-pieces-head', 'Spec the 3 unspecified');
    const pieces = listen(ACT_LANDING_EVENTS.ffeAct);
    render(<Band items={[spec]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Spec the 3 unspecified' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'The region’s control' })),
    );
    expect(pieces.details).toEqual(['spec']);
    expect(spec.act!.onAct).not.toHaveBeenCalled();
    pieces.stop();
  });

  it.each([
    ['Send the purchase order', 'po_unsent-0', 'send'],
    ['File the claim', 'row:damaged', 'claim'],
    ['Follow up with the maker', 'row:po_silence', 'follow-up'],
    ['Open the pieces', 'row:blocked', 'open'],
  ])('%s goes to Pieces as `%s` → `%s`', async (label, actKey, landing) => {
    const item = row('r', actKey, label);
    const pieces = listen(ACT_LANDING_EVENTS.ffeAct);
    render(<Band items={[item]} />);

    fireEvent.click(screen.getByRole('button', { name: label }));
    await waitFor(() => expect(pieces.details).toEqual([landing]));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'The region’s control' })),
    );
    expect(item.act!.onAct).not.toHaveBeenCalled();
    pieces.stop();
  });

  it('a table Nudge row opens the Message composer through document:compose-message', async () => {
    const nudge = row('ticket:pieces', 'row:awaiting_decision', 'Nudge Mei');
    const composer = listen(ACT_LANDING_EVENTS.composeMessage);
    render(<Band items={[nudge]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Nudge Mei' }));
    await waitFor(() => expect(composer.details).toEqual([{ named: [] }]));
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'The region’s control' })),
    );
    expect(nudge.act!.onAct).not.toHaveBeenCalled();
    composer.stop();
  });

  it('a need’s own Nudge keeps its own landing, which names what is overdue', async () => {
    const nudge = row('overdue_decision-0', 'overdue_decision-0', 'Nudge Mei', {
      needKind: 'overdue_decision',
    });
    const composer = listen(ACT_LANDING_EVENTS.composeMessage);
    render(<Band items={[nudge]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Nudge Mei' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(nudge.act!.onAct).toHaveBeenCalledTimes(1));
    expect(composer.details).toEqual([]);
    composer.stop();
  });

  // US-19 FR9 F9-1 — a per-PO silence's act names its line; the name alone
  // would land on the oldest PO's. A need's own (or lent) follow-up keeps it.
  it('a need’s own Follow up with the maker keeps its own landing, which names its line', async () => {
    const s032 = row('po_unacknowledged-1', 'po_unacknowledged-1', 'Follow up with the maker', {
      needKind: 'po_unacknowledged',
    });
    const pieces = listen(ACT_LANDING_EVENTS.ffeAct);
    render(<Band items={[s032]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Follow up with the maker' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(s032.act!.onAct).toHaveBeenCalledTimes(1));
    expect(pieces.details).toEqual([]);
    pieces.stop();
  });

  it('where no region takes the act, the act keeps its own landing', async () => {
    const send = row('po_unsent-0', 'po_unsent-0', 'Send the purchase order');
    const nobody = listen(ACT_LANDING_EVENTS.ffeAct, false);
    render(<Band items={[send]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Send the purchase order' }));
    await waitFor(() => expect(send.act!.onAct).toHaveBeenCalledTimes(1));
    expect(nobody.details).toEqual(['send']);
    nobody.stop();
  });

  it('flag off: the row’s act runs at once, the sheet stays, and nothing is dispatched', () => {
    const spec = row('ticket:spec', 'own:document-act-pieces-head', 'Spec the 3 unspecified');
    const pieces = listen(ACT_LANDING_EVENTS.ffeAct);
    render(<Band items={[spec]} grouped={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'Spec the 3 unspecified' }));
    });
    expect(spec.act!.onAct).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(pieces.details).toEqual([]);
    pieces.stop();
  });
});
