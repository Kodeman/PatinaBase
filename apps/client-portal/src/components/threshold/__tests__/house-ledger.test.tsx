import { render, screen } from '@testing-library/react';

import type { HouseLedgerModel } from '@/lib/threshold/derive';

import { HouseLedger } from '../house-ledger';

function ledger(overrides: Partial<HouseLedgerModel> = {}): HouseLedgerModel {
  return {
    plannedCents: 8_500_000,
    agreedCents: 6_140_000,
    owedCents: 912_500,
    owedInvoiceCount: 1,
    owedStudioCount: 0,
    owedDueDate: null,
    owedDatedCount: 0,
    heldCents: 144_000,
    awaitingCents: 689_000,
    overageLine: null,
    ...overrides,
  };
}

describe('HouseLedger — the house in figures, with its words', () => {
  it('carries the anchor and the threshold unit', () => {
    render(<HouseLedger ledger={ledger()} />);

    const root = screen.getByTestId('house-ledger');
    expect(root).toHaveAttribute('id', 'ledger');
    expect(root).toHaveAttribute('data-threshold-unit', 'ledger');
  });

  it('states where the house stands, agreed against planned', () => {
    render(<HouseLedger ledger={ledger()} />);

    expect(screen.getByTestId('house-ledger-top')).toHaveTextContent(
      'The house stands at $61,400 agreed of $85,000 planned.',
    );
  });

  it('stands on whichever half it knows, and says nothing with neither', () => {
    const { unmount } = render(<HouseLedger ledger={ledger({ plannedCents: null })} />);
    expect(screen.getByTestId('house-ledger-top')).toHaveTextContent(
      'The house stands at $61,400 agreed.',
    );
    unmount();

    const planned = render(<HouseLedger ledger={ledger({ agreedCents: null })} />);
    expect(screen.getByTestId('house-ledger-top')).toHaveTextContent(
      'The house stands at $85,000 planned.',
    );
    planned.unmount();

    render(<HouseLedger ledger={ledger({ agreedCents: null, plannedCents: null })} />);
    expect(screen.queryByTestId('house-ledger-top')).not.toBeInTheDocument();
  });

  it('carries the column with the sentence when only one row stands', () => {
    render(
      <HouseLedger
        ledger={ledger({ heldCents: null, awaitingCents: 0 })}
      />,
    );

    expect(screen.getByTestId('house-ledger-top')).toBeInTheDocument();
    expect(screen.getByTestId('house-ledger-owed')).toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger-held')).not.toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger-awaiting')).not.toBeInTheDocument();
  });

  it('notes the room standing past its target, and the one absorbing it', () => {
    render(
      <HouseLedger
        ledger={ledger({
          overageLine: 'The library stands about eleven hundred past its target; the bedroom absorbs it.',
        })}
      />,
    );

    expect(screen.getByTestId('house-ledger-overage')).toHaveTextContent(
      'The library stands about eleven hundred past its target; the bedroom absorbs it.',
    );
  });

  it('says nothing about overage when no room has passed its target', () => {
    render(<HouseLedger ledger={ledger()} />);

    expect(screen.queryByTestId('house-ledger-overage')).not.toBeInTheDocument();
  });

  it('gives owed, held and awaiting each a figure and a sentence', () => {
    render(<HouseLedger ledger={ledger()} />);

    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent('$9,125');
    expect(screen.getByTestId('house-ledger-held')).toHaveTextContent('$1,440');
    expect(screen.getByTestId('house-ledger-awaiting')).toHaveTextContent('$6,890');
    expect(screen.getByTestId('house-ledger-awaiting')).toHaveTextContent('Awaiting your name');
  });

  it('counts the invoices the owed figure is spread across', () => {
    const { unmount } = render(<HouseLedger ledger={ledger({ owedInvoiceCount: 1 })} />);
    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent('Owed on the open invoice');
    unmount();

    render(<HouseLedger ledger={ledger({ owedInvoiceCount: 3 })} />);
    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent(
      'Owed across 3 open invoices',
    );
  });

  /* A letter drawn against no house stands in the adopted house's letterbox
     and is summed into its owed figure. The row has to say which of that money
     is not the house's, or the figure asserts work that was never done here. */
  it('says on the owed row when the money is the studio’s, not the house’s', () => {
    const { unmount } = render(
      <HouseLedger ledger={ledger({ owedInvoiceCount: 1, owedStudioCount: 1 })} />,
    );
    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent(
      'Owed on the open invoice from the studio, not for this house',
    );
    unmount();

    const second = render(
      <HouseLedger ledger={ledger({ owedInvoiceCount: 2, owedStudioCount: 2 })} />,
    );
    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent(
      'Owed across 2 open invoices from the studio, not for this house',
    );
    second.unmount();

    render(<HouseLedger ledger={ledger({ owedInvoiceCount: 3, owedStudioCount: 1 })} />);
    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent(
      'Owed across 3 open invoices, one from the studio',
    );
  });

  it('leaves the owed row alone when every letter is this house’s', () => {
    render(<HouseLedger ledger={ledger({ owedInvoiceCount: 2, owedStudioCount: 0 })} />);

    const row = screen.getByTestId('house-ledger-owed');
    expect(row).toHaveTextContent('Owed across 2 open invoices');
    expect(row).not.toHaveTextContent('studio');
  });

  it('reads the rows in the accountant’s order', () => {
    render(<HouseLedger ledger={ledger()} />);

    const order = screen
      .getAllByTestId(/^house-ledger-(owed|held|awaiting)$/)
      .map((row) => row.getAttribute('data-testid'));
    expect(order).toEqual([
      'house-ledger-owed',
      'house-ledger-held',
      'house-ledger-awaiting',
    ]);
  });

  it('never renders a bare figure without words', () => {
    render(<HouseLedger ledger={ledger()} />);

    for (const row of screen.getAllByTestId(/^house-ledger-(owed|held|awaiting)$/)) {
      const words = row.querySelector('[data-ledger-words]');
      const figure = row.querySelector('[data-ledger-figure]');
      expect(words?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
      expect(figure?.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });

  it('lets each row be quieted, but never the sentence above them', () => {
    render(<HouseLedger ledger={ledger()} />);

    expect(screen.getByTestId('house-ledger')).not.toHaveAttribute('data-dimmable');
    for (const row of screen.getAllByTestId(/^house-ledger-(owed|held|awaiting)$/)) {
      expect(row).toHaveAttribute('data-dimmable');
    }
  });

  it('suppresses a row at zero, a row it does not know, and a row below zero', () => {
    render(
      <HouseLedger
        ledger={ledger({ owedCents: 0, heldCents: null, awaitingCents: -500 })}
      />,
    );

    expect(screen.queryByTestId('house-ledger-owed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger-held')).not.toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger-awaiting')).not.toBeInTheDocument();
  });
});
