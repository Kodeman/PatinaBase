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

  // ── W3-F8 — with nothing standing there is no list to rule off ──────────
  it('renders no exceptions list, and no rule over the inputs, when none stand', () => {
    const { container } = render(
      <StandingSheet
        open
        onClose={jest.fn()}
        items={[]}
        inputs={[
          {
            key: '0:Working budget',
            eyebrow: 'BUDGET',
            sentence: 'Working budget \u00b7 Client \u00b7 blocks Direction',
            act: null,
          },
        ]}
      />,
    );
    expect(container.querySelectorAll('[data-standing-row]')).toHaveLength(0);
    const heading = screen.getByText('INPUT NEEDED · 1');
    expect(heading.className).not.toMatch(/border-t|mt-4|pt-3/);
    // Exactly one list: the inputs'.
    expect(screen.getAllByRole('list')).toHaveLength(1);
  });

  it('keeps the rule over the inputs while something stands', () => {
    render(
      <StandingSheet
        open
        onClose={jest.fn()}
        items={FOUR}
        inputs={[
          {
            key: '0:Working budget',
            eyebrow: 'BUDGET',
            sentence: 'Working budget \u00b7 Client \u00b7 blocks Direction',
            act: null,
          },
        ]}
      />,
    );
    expect(screen.getByText('INPUT NEEDED · 1').className).toMatch(/border-t/);
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
