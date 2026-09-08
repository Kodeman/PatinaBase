import { render, screen } from '@testing-library/react';

import { LandmarkLedger, type LandmarkLedgerProps } from '../landmark-ledger';

function ledger(overrides: Partial<LandmarkLedgerProps> = {}): LandmarkLedgerProps {
  return {
    whereWeAre: true,
    whatChanged: true,
    whatYouOwe: true,
    whatNeedsYou: 'wall',
    thePapers: true,
    ...overrides,
  };
}

/** The landmarks as rendered, in order: [label, href]. */
function struck(): Array<[string, string | null]> {
  return screen
    .getAllByRole('link')
    .map((link) => [link.textContent?.trim() ?? '', link.getAttribute('href')]);
}

describe('LandmarkLedger — five names, each a jump to the place it names', () => {
  it('strikes all five when the whole house drew', () => {
    render(<LandmarkLedger {...ledger()} />);

    expect(struck()).toEqual([
      ['Where we are', '#doorstep'],
      ['What changed', '#changed'],
      ['What you owe', '#letterbox'],
      ['What needs you', '#wall'],
      ['The papers', '#mat-papers'],
    ]);
  });

  it('is an index of landmarks, not a header', () => {
    render(<LandmarkLedger {...ledger()} />);

    const nav = screen.getByTestId('landmark-ledger');
    expect(nav.tagName).toBe('NAV');
    expect(nav).toHaveAccessibleName('Landmarks');
    expect(nav).not.toHaveAttribute('data-threshold-unit');
    expect(nav).not.toHaveAttribute('data-dimmable');
  });

  it('omits a landmark whose target does not render — never draws it disabled', () => {
    render(
      <LandmarkLedger
        {...ledger({ whatChanged: false, whatYouOwe: false, whatNeedsYou: null })}
      />,
    );

    expect(struck()).toEqual([
      ['Where we are', '#doorstep'],
      ['The papers', '#mat-papers'],
    ]);
    expect(screen.queryByText('What changed')).not.toBeInTheDocument();
    expect(screen.queryByText('What you owe')).not.toBeInTheDocument();
    expect(screen.queryByText('What needs you')).not.toBeInTheDocument();
    for (const link of screen.getAllByRole('link')) {
      expect(link).not.toHaveAttribute('aria-disabled');
    }
  });

  it('keeps the money legible while the house is read as it moved', () => {
    render(<LandmarkLedger {...ledger()} />);

    expect(screen.getByText('What you owe').closest('a')).toHaveAttribute('data-never-dim');
    expect(screen.getByText('Where we are').closest('a')).not.toHaveAttribute('data-never-dim');
  });

  it('sends "What needs you" to whichever ask actually drew', () => {
    const { rerender } = render(<LandmarkLedger {...ledger({ whatNeedsYou: 'door' })} />);
    expect(screen.getByText('What needs you').closest('a')).toHaveAttribute('href', '#door');

    rerender(<LandmarkLedger {...ledger({ whatNeedsYou: 'approval-dec-9' })} />);
    expect(screen.getByText('What needs you').closest('a')).toHaveAttribute(
      'href',
      '#approval-dec-9',
    );
  });

  it('renders nothing at all when the page has no landmark to give', () => {
    const { container } = render(
      <LandmarkLedger
        whereWeAre={false}
        whatChanged={false}
        whatYouOwe={false}
        whatNeedsYou={null}
        thePapers={false}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
