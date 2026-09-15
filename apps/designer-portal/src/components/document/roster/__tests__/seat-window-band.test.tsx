/**
 * THE ENGAGEMENT WINDOW, AND THE NOTICE THAT IT MOVED (direction §7 P3,
 * CRM-23).
 *
 * Two writes, in one order, and the face says which landed: the window is the
 * fact, the notice is the record OF the fact, and a notice written ahead of a
 * failed window write would be a record of something that never happened.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { SeatWindowBand, windowNoticeFact } from '../seat-window-band';

const updateMutate = jest.fn();
const noticeMutate = jest.fn();

jest.mock('@patina/supabase', () => ({
  useUpdateProjectParty: () => ({ mutateAsync: updateMutate, isPending: false }),
  useRecordNotice: () => ({ mutateAsync: noticeMutate, isPending: false }),
  asNoticeError: (e: unknown) => (e instanceof Error ? e.message : String(e ?? '')),
}));

const written = jest.fn();

function renderBand(from: string | null = '2026-09-01', to: string | null = '2026-10-01') {
  return render(
    <SeatWindowBand
      seatId="seat-luis"
      projectId="okonkwo"
      name="Luis Ochoa"
      onSiteFrom={from}
      onSiteTo={to}
      onWritten={written}
    />,
  );
}

function openBand() {
  fireEvent.click(screen.getByText('Change the window'));
}

beforeEach(() => {
  updateMutate.mockReset().mockResolvedValue({});
  noticeMutate.mockReset().mockResolvedValue({ id: 't1' });
  written.mockReset();
});

describe('the seat window band', () => {
  it('names the act for what it is on a seat with no dates', () => {
    renderBand(null, null);
    expect(screen.getByText('Set the window')).toBeInTheDocument();
  });

  it('opens ON the record, never empty, so a correction restates it', () => {
    renderBand();
    openBand();
    expect(screen.getByLabelText('First day on site')).toHaveValue('2026-09-01');
    expect(screen.getByLabelText('Last day on site')).toHaveValue('2026-10-01');
  });

  // W4 r3 MAJOR-2 — the trigger keeps its place (SPEC §7 #5, the shape
  // notice-log.tsx and roster-row.tsx already hold), so pressing it never
  // unmounts the element under the caret and drops a keyboard user at the top
  // of a thirty-row Call Sheet. The panel is always in the DOM, so
  // aria-controls resolves.
  it('keeps the trigger, and its aria-controls names a panel that exists', () => {
    const { container } = renderBand();
    const trigger = screen.getByText('Change the window').closest('button')!;
    const panelId = trigger.getAttribute('aria-controls')!;
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(container.querySelector(`#${CSS.escape(panelId)}`)).not.toBeNull();

    trigger.focus();
    fireEvent.click(trigger);

    // The SAME node is still mounted and still focused.
    expect(screen.getByText('Change the window').closest('button')).toBe(trigger);
    expect(document.activeElement).toBe(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(container.querySelector(`#${CSS.escape(panelId)}`)).not.toBeNull();
    expect(document.activeElement).not.toBe(document.body);
  });

  it('survives a save with focus intact, and the panel closes rather than vanishes', async () => {
    const { container } = renderBand();
    openBand();
    const save = screen.getByText('Write the window').closest('button')!;
    save.focus();
    fireEvent.click(save);
    await waitFor(() => expect(written).toHaveBeenCalled());

    const trigger = screen.getByText('Change the window').closest('button')!;
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    const panelId = trigger.getAttribute('aria-controls')!;
    const panel = container.querySelector(`#${CSS.escape(panelId)}`)!;
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute('hidden');
  });

  it('writes the window and THEN the notice, in that order', async () => {
    const order: string[] = [];
    updateMutate.mockImplementation(async () => {
      order.push('window');
      return {};
    });
    noticeMutate.mockImplementation(async () => {
      order.push('notice');
      return { id: 't1' };
    });
    renderBand();
    openBand();
    fireEvent.change(screen.getByLabelText('Last day on site'), {
      target: { value: '2026-10-09' },
    });
    fireEvent.click(screen.getByText('Write the window'));
    await waitFor(() => expect(order).toEqual(['window', 'notice']));
    expect(updateMutate).toHaveBeenCalledWith({
      id: 'seat-luis',
      projectId: 'okonkwo',
      patch: { onSiteFrom: '2026-09-01', onSiteTo: '2026-10-09' },
    });
    expect(noticeMutate).toHaveBeenCalledWith({
      projectId: 'okonkwo',
      what: windowNoticeFact('Luis Ochoa', '2026-09-01', '2026-10-09'),
      told: [],
    });
  });

  it('records who was told only where the studio says so', async () => {
    renderBand();
    openBand();
    fireEvent.click(screen.getByLabelText('Luis Ochoa has been told'));
    fireEvent.click(screen.getByText('Write the window'));
    await waitFor(() =>
      expect(noticeMutate).toHaveBeenCalledWith(
        expect.objectContaining({ told: ['seat-luis'] }),
      ),
    );
  });

  it('writes NO notice when the window itself is refused', async () => {
    updateMutate.mockRejectedValue(new Error('row-level security'));
    renderBand();
    openBand();
    fireEvent.click(screen.getByText('Write the window'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent("not yours to write");
    expect(noticeMutate).not.toHaveBeenCalled();
    expect(written).not.toHaveBeenCalled();
  });

  it('says the window moved AND that the record did not, when it did not', async () => {
    noticeMutate.mockRejectedValue(new Error('notice_not_authorized'));
    renderBand();
    openBand();
    fireEvent.click(screen.getByText('Write the window'));
    await waitFor(() =>
      expect(written).toHaveBeenCalledWith(
        expect.stringContaining('The record of the change did not save'),
      ),
    );
    expect(written).toHaveBeenCalledWith(
      expect.stringContaining('Luis Ochoa’s window runs'),
    );
  });

  it('refuses a window that ends before it begins, before any write', async () => {
    renderBand();
    openBand();
    fireEvent.change(screen.getByLabelText('First day on site'), {
      target: { value: '2026-11-01' },
    });
    fireEvent.click(screen.getByText('Write the window'));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('before the first');
    expect(updateMutate).not.toHaveBeenCalled();
    expect(noticeMutate).not.toHaveBeenCalled();
  });
});
