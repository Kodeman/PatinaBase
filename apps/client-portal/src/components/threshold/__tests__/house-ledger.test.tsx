import { render, screen } from '@testing-library/react';

import type { HouseLedgerModel } from '@/lib/threshold/derive';

import { HouseLedger } from '../house-ledger';

function ledger(overrides: Partial<HouseLedgerModel> = {}): HouseLedgerModel {
  return {
    plannedCents: 8_500_000,
    agreedCents: 6_140_000,
    owedCents: 912_500,
    heldCents: 144_000,
    awaitingCents: 689_000,
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

  it('says nothing about agreed-of-planned when either half is unknown', () => {
    render(<HouseLedger ledger={ledger({ plannedCents: null })} />);

    expect(screen.queryByTestId('house-ledger-top')).not.toBeInTheDocument();
  });

  it('gives owed, held and awaiting each a figure and a sentence', () => {
    render(<HouseLedger ledger={ledger()} />);

    expect(screen.getByTestId('house-ledger-owed')).toHaveTextContent('$9,125');
    expect(screen.getByTestId('house-ledger-held')).toHaveTextContent('$1,440');
    expect(screen.getByTestId('house-ledger-awaiting')).toHaveTextContent('$6,890');
    expect(screen.getByTestId('house-ledger-awaiting')).toHaveTextContent('Awaiting your name');
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

  it('suppresses a row at zero, and a row it does not know', () => {
    render(<HouseLedger ledger={ledger({ owedCents: 0, heldCents: null, awaitingCents: 0 })} />);

    expect(screen.queryByTestId('house-ledger-owed')).not.toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger-held')).not.toBeInTheDocument();
    expect(screen.queryByTestId('house-ledger-awaiting')).not.toBeInTheDocument();
  });
});
