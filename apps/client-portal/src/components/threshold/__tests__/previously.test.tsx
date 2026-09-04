import { fireEvent, render, screen, within } from '@testing-library/react';

import type { PreviouslyEntry } from '@/lib/threshold/derive';

import { Previously } from '../previously';

const ENTRIES: PreviouslyEntry[] = [
  {
    id: 'prop-6',
    kind: 'instrument',
    label: 'Design services agreement',
    date: new Date('2026-03-12T12:00:00Z'),
  },
  {
    id: 'note-0',
    kind: 'note',
    label:
      'The design set is with you — three rooms concepted: library and lounge, entry and stair hall, primary bedroom.',
    date: new Date('2026-05-30T12:00:00Z'),
  },
  {
    id: 'note-x',
    kind: 'note',
    label: 'A line with no date behind it.',
    date: null,
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
    expect(within(lines[0]).getByTestId('previously-state')).toHaveTextContent('Signed');
    expect(within(lines[1]).getByTestId('previously-state')).toHaveTextContent('Sent');
    expect(within(lines[2]).getByTestId('previously-date')).toHaveTextContent('—');
  });

  it('rules a dotted leader between the title and the state word', () => {
    render(<Previously entries={ENTRIES} />);
    expect(screen.getAllByTestId('previously-leader')).toHaveLength(3);
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

  it('renders nothing when there is no history to read', () => {
    const { container } = render(<Previously entries={[]} />);
    expect(container).toBeEmptyDOMElement();
  });
});
