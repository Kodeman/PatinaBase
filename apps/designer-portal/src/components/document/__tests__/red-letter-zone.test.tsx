import { fireEvent, render, screen } from '@testing-library/react';
import { RedLetterZone, type RedLetterRow } from '../red-letter-zone';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: {
    actionShown: jest.fn(),
    actionSelected: jest.fn(),
  },
}));

const onAct = jest.fn();

const rows: RedLetterRow[] = [
  {
    key: 'r1',
    kind: 'overdue_decision',
    text: '2 decisions overdue',
    actionLabel: 'Resolve decisions',
    onAct,
    urgent: true,
  },
  {
    key: 'r2',
    kind: 'overdue_invoice',
    text: 'Invoice 004 overdue',
    actionLabel: 'Send a reminder',
    onAct: jest.fn(),
    urgent: false,
  },
  {
    key: 'r3',
    kind: 'task_due',
    text: 'Task due — confirm the fabric',
    actionLabel: null,
    onAct: jest.fn(),
    urgent: false,
  },
];

describe('RedLetterZone', () => {
  beforeEach(() => onAct.mockClear());

  it('renders nothing when there is nothing to attend to', () => {
    const { container } = render(<RedLetterZone rows={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('prints one row per need, in the given order', () => {
    render(<RedLetterZone rows={rows} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.textContent)).toEqual([
      '2 decisions overdueResolve decisions',
      'Invoice 004 overdueSend a reminder',
      'Task due — confirm the fabric',
    ]);
  });

  it('is a named region, never an alert', () => {
    render(<RedLetterZone rows={rows} />);
    const region = screen.getByRole('region', { name: 'Needs attention' });
    expect(region).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('fires the row action', () => {
    render(<RedLetterZone rows={rows} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resolve decisions' }));
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('omits the act where a need names none', () => {
    render(<RedLetterZone rows={rows} />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('gathers every act into ONE named group, not one group per row', () => {
    render(<RedLetterZone rows={rows} />);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveAccessibleName('Needs attention actions');
  });

  it('keys each act to its own row, so two needs of a kind stay distinct', () => {
    const twoOfAKind: RedLetterRow[] = [
      { ...rows[0], key: 'a' },
      { ...rows[0], key: 'b', onAct: jest.fn() },
    ];
    render(<RedLetterZone rows={twoOfAKind} />);
    const keys = screen
      .getAllByRole('button')
      .map((button) => button.getAttribute('data-action-key'));
    expect(keys).toEqual([
      'red-letter-overdue_decision-0',
      'red-letter-overdue_decision-1',
    ]);
  });

  it('weights an urgent need heavier, and only by weight', () => {
    render(<RedLetterZone rows={rows} />);
    const [urgent, ordinary] = screen.getAllByRole('listitem');
    expect(urgent.querySelector('p')).toHaveClass('font-medium');
    expect(ordinary.querySelector('p')).toHaveClass('font-normal');
  });
});
