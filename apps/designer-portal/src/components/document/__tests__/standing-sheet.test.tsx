import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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

  // FR1 F14 / R20 — the Direction's collapsed row: one sentence, one act, and
  // no kind word of its own under the section's heading.
  it('prints the proposal’s collapsed input row with one act and no empty eyebrow', () => {
    const onAct = jest.fn();
    render(
      <StandingSheet
        open
        onClose={jest.fn()}
        items={[]}
        inputs={[
          {
            key: 'proposal-inputs',
            eyebrow: '',
            sentence: 'The proposal needs 8 inputs',
            act: { key: 'write-the-proposal', label: 'Write the proposal', onAct },
          },
        ]}
      />,
    );
    const panel = screen.getByRole('dialog');
    expect(panel).toHaveAccessibleName('Standing · 1');
    const rows = panel.querySelectorAll('[data-standing-input-row]');
    expect(rows).toHaveLength(1);
    expect(rows[0].querySelectorAll('p')).toHaveLength(1);
    expect(panel).not.toHaveTextContent(/blocks|Client proposal/);
    fireEvent.click(within(rows[0] as HTMLElement).getByRole('button', { name: 'Write the proposal' }));
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('D10 — files setup under a clay SETUP eyebrow at the foot, counted, never terracotta', () => {
    const onAct = jest.fn();
    render(
      <StandingSheet
        open
        onClose={jest.fn()}
        items={FOUR}
        inputs={[
          {
            key: '0:Working budget',
            eyebrow: 'BUDGET',
            sentence: 'Working budget · Client · blocks Direction',
            act: null,
          },
        ]}
        setup={[
          {
            key: 'setup:no_client_linked',
            setup: 'no_client_linked',
            sentence: 'No client linked',
            act: { key: 'setup:no_client_linked', label: 'Link a client', onAct },
            opensSheet: true,
          },
        ]}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Standing · 6');
    const heading = screen.getByText('SETUP');
    expect(heading).toHaveClass('text-[var(--color-clay-ink)]');
    expect(heading.className).toMatch(/border-t/);
    // At the foot: after the inputs' heading in document order.
    const inputs = screen.getByText('INPUT NEEDED · 1');
    expect(
      inputs.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const row = document.querySelector('[data-standing-setup-row]') as HTMLElement;
    expect(row).toHaveTextContent('No client linked');
    expect(row.innerHTML).not.toMatch(/terracotta/);
    fireEvent.click(within(row).getByRole('button', { name: 'Link a client' }));
    expect(onAct).toHaveBeenCalledTimes(1);
  });

  it('D10 — a setup act that lands on the paper puts the sheet back before it runs', async () => {
    const onAct = jest.fn();
    const onClose = jest.fn();
    render(
      <StandingSheet
        open
        onClose={onClose}
        items={[]}
        setup={[
          {
            key: 'setup:target_date_unset',
            setup: 'target_date_unset',
            sentence: 'No target date set',
            act: { key: 'setup:target_date_unset', label: 'Set dates', onAct },
            opensSheet: false,
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Set dates' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // Not yet: the sheet's door takes focus a frame after the close.
    expect(onAct).not.toHaveBeenCalled();
    await waitFor(() => expect(onAct).toHaveBeenCalledTimes(1));
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
