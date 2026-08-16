/**
 * The Rooms Rail (W3 3d, R6/A7). What it must do: print the proposal's rooms
 * off the Rooms facet's read; report a press as the held id and a second press
 * (or "All") as release — never filter; save "Add a room" through the facet's
 * existing creation flow; carry no width-gated hiding whatsoever (A7 — the
 * lens persists at all widths by construction); and stay keyboard operable.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RoomsRail } from '../rooms-rail';
import { proposalEvents } from '@/lib/analytics';

let mockRoomsResult: { data: Array<{ id: string; name: string }>; isLoading: boolean };
const mockMutate = jest.fn();
let mockAddPending = false;

jest.mock('@patina/supabase', () => ({
  useProposalScopeRooms: () => mockRoomsResult,
  useAddScopeRoom: () => ({ mutate: mockMutate, isPending: mockAddPending }),
}));

jest.mock('@/lib/analytics', () => ({
  proposalEvents: { scopeUpdated: jest.fn() },
}));

const ROOMS = [
  { id: 'room-1', name: 'Living Room' },
  { id: 'room-2', name: 'Primary Bedroom' },
];

function rail(props: Partial<React.ComponentProps<typeof RoomsRail>> = {}) {
  return render(
    <RoomsRail proposalId="proposal-1" value={null} onChange={jest.fn()} {...props} />,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRoomsResult = { data: ROOMS, isLoading: false };
  mockAddPending = false;
});

describe('RoomsRail', () => {
  it("prints the proposal's rooms from the facet's read, after All", () => {
    rail();

    const segments = screen
      .getAllByRole('button')
      .map((b) => b.textContent);
    expect(segments).toEqual([
      'All',
      'Living Room',
      'Primary Bedroom',
      '+ Add a room',
    ]);
  });

  it('prints nothing while the read is still loading', () => {
    mockRoomsResult = { data: [], isLoading: true };
    const { container } = rail();

    expect(container).toBeEmptyDOMElement();
  });

  it('reports a pressed room as the held id', async () => {
    const onChange = jest.fn();
    rail({ onChange });

    await userEvent.click(screen.getByRole('button', { name: 'Primary Bedroom' }));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('room-2');
  });

  it('releases on a second press of the held room', async () => {
    const onChange = jest.fn();
    rail({ value: 'room-2', onChange });

    const held = screen.getByRole('button', { name: 'Primary Bedroom' });
    expect(held).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(held);

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('releases on the plain All position', async () => {
    const onChange = jest.fn();
    rail({ value: 'room-1', onChange });

    await userEvent.click(screen.getByRole('button', { name: 'All' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('marks exactly the held segment, and All when nothing is held', () => {
    const none = rail();
    expect(screen.getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    none.unmount();

    rail({ value: 'room-1' });
    const pressed = screen
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent);
    expect(pressed).toEqual(['Living Room']);
  });

  it("saves Add a room through the facet's creation flow", () => {
    mockMutate.mockImplementation((_vars, opts) => opts?.onSuccess?.());
    rail();

    // fireEvent (not userEvent) where the rail updates its own state — the
    // repo's user-event copy is not act-wrapped (drafting-room.test pattern).
    fireEvent.click(screen.getByRole('button', { name: '+ Add a room' }));
    const input = screen.getByLabelText('Room name');
    fireEvent.change(input, { target: { value: 'Study' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toEqual({
      proposalId: 'proposal-1',
      name: 'Study',
    });
    // The facet's flow ends with its analytics event, and the line folds back.
    expect(proposalEvents.scopeUpdated).toHaveBeenCalledWith({
      proposalId: 'proposal-1',
      field: 'room',
      action: 'add',
    });
    expect(screen.queryByLabelText('Room name')).toBeNull();
    expect(screen.getByRole('button', { name: '+ Add a room' })).toBeInTheDocument();
  });

  it('does not save an empty name', () => {
    rail();

    fireEvent.click(screen.getByRole('button', { name: '+ Add a room' }));
    const input = screen.getByLabelText('Room name');
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(mockMutate).not.toHaveBeenCalled();
  });

  it('folds the add line back on Escape without saving', () => {
    rail();

    fireEvent.click(screen.getByRole('button', { name: '+ Add a room' }));
    fireEvent.keyDown(screen.getByLabelText('Room name'), { key: 'Escape' });

    expect(mockMutate).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Room name')).toBeNull();
    expect(screen.getByRole('button', { name: '+ Add a room' })).toBeInTheDocument();
  });

  it('carries no width-gated hiding anywhere — A7: the rail persists at all widths', () => {
    const { container } = rail({ value: 'room-1' });

    const everyClass = [container, ...Array.from(container.querySelectorAll('*'))]
      .map((el) => ('className' in el ? String((el as HTMLElement).className) : ''))
      .join(' ');
    // No display:none, no breakpoint-gated visibility on the rail or any segment.
    expect(everyClass).not.toMatch(/(^|\s)hidden(\s|$)/);
    expect(everyClass).not.toMatch(/min-\[1440px\]|max-\[1439|lg:hidden|xl:hidden|sm:hidden|md:hidden/);
    // Below 1440 the row lives in its own scroll container instead.
    expect(container.querySelector('.overflow-x-auto')).not.toBeNull();
  });

  it('is keyboard operable — a focused segment activates on Enter and Space', async () => {
    const onChange = jest.fn();
    rail({ onChange });

    const room = screen.getByRole('button', { name: 'Living Room' });
    room.focus();
    expect(room).toHaveFocus();

    await userEvent.keyboard('{Enter}');
    expect(onChange).toHaveBeenNthCalledWith(1, 'room-1');

    await userEvent.keyboard(' ');
    expect(onChange).toHaveBeenNthCalledWith(2, 'room-1');
  });
});
