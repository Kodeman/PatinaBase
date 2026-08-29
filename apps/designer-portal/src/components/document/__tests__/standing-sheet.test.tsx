import { fireEvent, render, screen, within } from '@testing-library/react';
import { createRef } from 'react';
import type { LensStandingItem } from '@/lib/document/lens-band-derivation';
import { StandingSheet } from '../standing-sheet';

jest.mock('@/lib/analytics/document-events', () => ({
  documentEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
}));

const item = (
  key: string,
  eyebrow: string,
  sentence: string,
  actLabel: string | null,
  tier: LensStandingItem['tier'],
): LensStandingItem => ({
  key,
  eyebrow,
  sentence,
  act: actLabel ? { label: actLabel, onAct: jest.fn() } : null,
  tier,
  days: null,
  standingSince: null,
});

const FOUR: LensStandingItem[] = [
  item('a', 'OVERDUE 6D', 'Primary bedroom approval', 'Send a reminder', 'overdue'),
  item('b', 'OVERDUE 3D', 'Living room fabric', 'Choose the fabric', 'overdue'),
  item('c', 'CLAIM OPEN', 'Carrier window, brass-and-oak console', 'Review the claim', 'damage'),
  item('d', 'NO ACK', 'PO-2026-0418 unanswered, Sturdy Oak', 'Follow up with the maker', 'po-silence'),
];

describe('StandingSheet (OD-6 / L-11)', () => {
  it('titles itself with the whole count, and marks the panel a standing sheet', () => {
    render(<StandingSheet open onClose={jest.fn()} items={FOUR} />);
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAttribute('data-doc-sheet-kind', 'standing');
    expect(panel).toHaveAccessibleName('Standing · 4');
  });

  it('lists EVERY standing exception with its own kind, sentence and act', () => {
    render(<StandingSheet open onClose={jest.fn()} items={FOUR} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.getAttribute('data-standing-tier'))).toEqual([
      'overdue',
      'overdue',
      'damage',
      'po-silence',
    ]);
    FOUR.forEach((entry, index) => {
      const row = within(rows[index]);
      expect(row.getByText(entry.eyebrow)).toBeInTheDocument();
      expect(row.getByText(entry.sentence)).toBeInTheDocument();
      expect(
        row.getByRole('button', { name: entry.act!.label }),
      ).toBeInTheDocument();
    });
  });

  it('prints a row that opens nothing without an act, and never drops it', () => {
    const items = [...FOUR, item('e', 'STUCK', '2 unspecified', null, 'po-silence')];
    render(<StandingSheet open onClose={jest.fn()} items={items} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByText('2 unspecified')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Standing · 5');
  });

  it('fires the row act the band handed it', () => {
    render(<StandingSheet open onClose={jest.fn()} items={FOUR} />);
    fireEvent.click(screen.getByRole('button', { name: 'Choose the fabric' }));
    expect(FOUR[1].act!.onAct).toHaveBeenCalledTimes(1);
  });

  it('puts itself back on Escape', () => {
    const onClose = jest.fn();
    render(<StandingSheet open onClose={onClose} items={FOUR} />);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('mounts nothing while closed', () => {
    const triggerRef = createRef<HTMLElement>();
    render(
      <StandingSheet
        open={false}
        onClose={jest.fn()}
        items={FOUR}
        triggerRef={triggerRef}
      />,
    );
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
