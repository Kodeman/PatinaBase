import { fireEvent, render, screen, within } from '@testing-library/react';

import type { PreviouslyEntry } from '@/lib/threshold/derive';

// A signed instrument unfolds into the same reading the door offers. That
// component has its own suite (instrument-reading.test.tsx); here it is a
// witness that the line reaches it with the right paper.
jest.mock('../instrument-reading', () => ({
  __esModule: true,
  InstrumentReading: ({ proposalId }: { proposalId: string }) => (
    <div data-testid="instrument-reading-stub">{proposalId}</div>
  ),
}));

import { Previously } from '../previously';

const ENTRIES: PreviouslyEntry[] = [
  {
    id: 'prop-6',
    kind: 'instrument',
    label: 'Design services agreement',
    date: new Date('2026-03-12T12:00:00Z'),
    state: 'signed',
  },
  {
    id: 'note-0',
    kind: 'note',
    label:
      'The design set is with you — three rooms concepted: library and lounge, entry and stair hall, primary bedroom.',
    date: new Date('2026-05-30T12:00:00Z'),
    state: 'answered',
  },
  {
    id: 'note-x',
    kind: 'note',
    label: 'A line with no date behind it.',
    date: null,
    state: 'standing',
  },
];

describe('Previously', () => {
  it('anchors at #previously and rules one dated receipt per entry', () => {
    const { container } = render(<Previously entries={ENTRIES} />);

    const section = container.querySelector('section');
    expect(section).toHaveAttribute('id', 'previously');
    expect(section).toHaveAttribute('data-threshold-unit', 'previously');
    expect(screen.getByRole('heading', { level: 2, name: 'Previously' })).toBeInTheDocument();
    expect(screen.getAllByTestId('previously-line')).toHaveLength(3);
  });

  it('dates each receipt and ends it in a state word', () => {
    render(<Previously entries={ENTRIES} />);

    const lines = screen.getAllByTestId('previously-line');
    expect(within(lines[0]).getByTestId('previously-date')).toHaveTextContent('12 March');
    // The one word on this page that is also a stamp reads as the stamp reads
    // it, in the stamp's own ink; the three note words are a lifecycle, not a
    // mark, and read in the muted ink of the date beside them.
    const signed = within(lines[0]).getByTestId('previously-state');
    expect(signed).toHaveTextContent('SIGNED');
    expect(signed).toHaveStyle({ color: 'var(--color-mocha)' });
    const answered = within(lines[1]).getByTestId('previously-state');
    expect(answered).toHaveTextContent('Answered');
    expect(answered).toHaveStyle({ color: 'var(--text-muted)' });
    expect(within(lines[2]).getByTestId('previously-state')).toHaveTextContent('Standing');
    expect(within(lines[2]).getByTestId('previously-date')).toHaveTextContent('—');
  });

  it('rules a dotted leader between the title and the state word', () => {
    render(<Previously entries={ENTRIES} />);
    expect(screen.getAllByTestId('previously-leader')).toHaveLength(3);
  });

  it('opts into dimming', () => {
    const { container } = render(<Previously entries={ENTRIES} />);
    expect(container.querySelector('section')).toHaveAttribute('data-dimmable');
  });

  it('truncates a long line and keeps the whole of it for the unfold', () => {
    render(<Previously entries={ENTRIES} />);

    const line = screen.getAllByTestId('previously-line')[1];
    expect(line.textContent).toContain('…');
    expect(line.textContent).not.toContain('primary bedroom');

    fireEvent.click(within(line).getByRole('button'));
    expect(screen.getByTestId('previously-body')).toHaveTextContent('primary bedroom');
  });

  it('offers no unfold on a line that already carries the whole of it', () => {
    render(<Previously entries={[ENTRIES[0]]} />);

    const line = screen.getByTestId('previously-line');
    expect(within(line).queryByRole('button')).not.toBeInTheDocument();
    expect(line).toHaveTextContent('Design services agreement');
  });

  it('unfolds a receipt into its body in place, and folds it back', () => {
    render(<Previously entries={ENTRIES} />);

    const line = screen.getAllByTestId('previously-line')[1];
    const control = within(line).getByRole('button');
    expect(control).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(control);

    expect(control).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('previously-body')).toHaveTextContent(
      'three rooms concepted: library and lounge, entry and stair hall, primary bedroom',
    );

    fireEvent.click(control);
    expect(screen.queryByTestId('previously-body')).not.toBeInTheDocument();
  });

  it('unfolds a signed instrument into the paper itself, however short its line', () => {
    const signed: PreviouslyEntry = {
      id: 'instrument:prop-7',
      kind: 'instrument',
      label: 'Furnishings authorization · No. 7',
      date: new Date('2026-08-05T12:00:00Z'),
      state: 'signed',
    };

    render(<Previously entries={[signed]} />);

    const control = screen.getByRole('button');
    expect(control).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(control);

    expect(control).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('instrument-reading-stub')).toHaveTextContent('prop-7');

    fireEvent.click(control);
    expect(screen.queryByTestId('instrument-reading-stub')).not.toBeInTheDocument();
  });

  it('keeps a cut instrument line’s own words above the reading it unfolds into', () => {
    const signed: PreviouslyEntry = {
      id: 'instrument:prop-7',
      kind: 'instrument',
      label: 'Furnishings authorization · Library, lounge and the upstairs landing, in full',
      date: new Date('2026-08-05T12:00:00Z'),
      state: 'signed',
    };

    render(<Previously entries={[signed]} />);
    fireEvent.click(screen.getByRole('button'));

    // The unfold used to be for the words the line could not hold; the reading
    // is what it gained, not what it replaced.
    const body = screen.getByTestId('previously-body');
    expect(body).toHaveTextContent('Furnishings authorization · Library, lounge and the upstairs landing, in full');
    expect(within(body).getByTestId('instrument-reading-stub')).toHaveTextContent('prop-7');
  });

  it('falls back to the label unfold when an instrument line carries no paper id', () => {
    const odd: PreviouslyEntry = {
      id: 'instrument-prop-7',
      kind: 'instrument',
      label: 'Furnishings authorization · Library, lounge and the upstairs landing, in full',
      date: new Date('2026-08-05T12:00:00Z'),
      state: 'signed',
    };

    render(<Previously entries={[odd]} />);
    fireEvent.click(screen.getByRole('button'));

    expect(screen.getByTestId('previously-body')).toHaveTextContent('Furnishings authorization · Library, lounge and the upstairs landing, in full');
    expect(screen.queryByTestId('instrument-reading-stub')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no history to read', () => {
    const { container } = render(<Previously entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
