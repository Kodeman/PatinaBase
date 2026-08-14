import { fireEvent, render, screen, within } from '@testing-library/react';
import { FolioCalendar } from '../date/folio-calendar';

/** Fri 14 Aug 2026 — the deck's day. Next workday Mon 17, next week Mon 24. */
const TODAY = '2026-08-14';

const cell = (iso: string) =>
  document.querySelector<HTMLButtonElement>(`[data-folio-cell="${iso}"]`)!;

const setButton = () => screen.getByRole('button', { name: 'Set' });

describe('FolioCalendar', () => {
  it('offers both modes, with the day mode taking the first press', () => {
    render(<FolioCalendar value={null} today={TODAY} onCommit={jest.fn()} />);

    expect(screen.getByRole('button', { name: 'On a day' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Over a span' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('hides the toggle when the surface allows one shape', () => {
    render(<FolioCalendar value={null} today={TODAY} modes={['day']} onCommit={jest.fn()} />);

    expect(screen.queryByRole('button', { name: 'Over a span' })).not.toBeInTheDocument();
    expect(screen.getByRole('grid')).toBeInTheDocument();
  });

  it('sets the draft and the readout from a preset without committing', () => {
    const onCommit = jest.fn();
    render(<FolioCalendar value={null} today={TODAY} onCommit={onCommit} />);

    expect(screen.getByText('—')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Next workday/ }));

    expect(screen.getByText('Mon, Aug 17')).toBeInTheDocument();
    expect(cell('2026-08-17')).toHaveAttribute('aria-selected', 'true');
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('commits a day only on SET, exactly once', () => {
    const onCommit = jest.fn();
    render(<FolioCalendar value={null} today={TODAY} onCommit={onCommit} />);

    expect(setButton()).toBeDisabled();

    fireEvent.click(cell('2026-08-20'));

    expect(screen.getByText('Thu, Aug 20')).toBeInTheDocument();
    expect(setButton()).toBeEnabled();
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(setButton());

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ kind: 'day', date: '2026-08-20' });
  });

  it('builds a span from two clicks and commits it on SET', () => {
    const onCommit = jest.fn();
    render(<FolioCalendar value={null} today={TODAY} onCommit={onCommit} />);

    fireEvent.click(screen.getByRole('button', { name: 'Over a span' }));
    fireEvent.click(cell('2026-08-25'));

    expect(setButton()).toBeDisabled();

    fireEvent.click(cell('2026-08-28'));

    expect(screen.getByText('Aug 25 — Aug 28 · 4 days')).toBeInTheDocument();
    expect(cell('2026-08-26')).toHaveAttribute('data-in-span', 'true');
    expect(onCommit).not.toHaveBeenCalled();

    fireEvent.click(setButton());

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({
      kind: 'span',
      start: '2026-08-25',
      end: '2026-08-28',
    });
  });

  it('shades the hover preview while the anchor waits for its second click', () => {
    render(<FolioCalendar value={null} today={TODAY} onCommit={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Over a span' }));
    fireEvent.click(cell('2026-08-25'));
    fireEvent.pointerEnter(cell('2026-08-27'));

    expect(cell('2026-08-26')).toHaveAttribute('data-in-span', 'true');
    expect(screen.getByText('Aug 25 — Aug 27 · 3 days')).toBeInTheDocument();
  });

  it('cancels on Esc and commits nothing', () => {
    const onCommit = jest.fn();
    const onCancel = jest.fn();
    render(
      <FolioCalendar value={null} today={TODAY} onCommit={onCommit} onCancel={onCancel} />,
    );

    fireEvent.click(cell('2026-08-20'));
    fireEvent.keyDown(cell('2026-08-20'), { key: 'Escape' });

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('moves the roving tabstop with the arrow keys', () => {
    render(<FolioCalendar value={null} today={TODAY} onCommit={jest.fn()} />);

    expect(cell(TODAY)).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(cell(TODAY), { key: 'ArrowRight' });
    expect(cell('2026-08-15')).toHaveAttribute('tabindex', '0');
    expect(cell(TODAY)).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(cell('2026-08-15'), { key: 'ArrowDown' });
    expect(cell('2026-08-22')).toHaveAttribute('tabindex', '0');

    // exactly one tabstop, always
    const tabbable = within(screen.getByRole('grid')).getAllByRole('gridcell', {
      hidden: true,
    }).filter((node) => node.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('keeps Enter inside the grid — an enclosing row must never see it', () => {
    const onCommit = jest.fn();
    const rowKeyDown = jest.fn();
    render(
      <div onKeyDown={rowKeyDown}>
        <FolioCalendar value={null} today={TODAY} onCommit={onCommit} />
      </div>,
    );

    // Enter takes the ROVING cell (today), the way a grid keyboard always does.
    fireEvent.keyDown(cell(TODAY), { key: 'Enter' });

    expect(rowKeyDown).not.toHaveBeenCalled();
    expect(screen.getByText('Fri, Aug 14')).toBeInTheDocument();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('refuses days before minDate', () => {
    const onCommit = jest.fn();
    render(
      <FolioCalendar value={null} today={TODAY} minDate="2026-08-14" onCommit={onCommit} />,
    );

    const blocked = cell('2026-08-10');
    expect(blocked).toHaveAttribute('aria-disabled', 'true');

    fireEvent.click(blocked);

    expect(blocked).toHaveAttribute('aria-selected', 'false');
    expect(setButton()).toBeDisabled();
  });
});
