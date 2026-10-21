import { render, screen, within } from '@testing-library/react';

import { ArrivalLine, ARRIVAL_SENTENCE } from '../arrival-line';
import { STANDING_ZERO, StandingRows, isStandingSentence } from '../standing-rows';

const MEASURES = /\d\s*\/\s*\d|%|percent/i;

describe('StandingRows', () => {
  it('shows three rows in the fixed order, each linking to its anchor', () => {
    render(
      <StandingRows
        letterbox={{ sentence: '$600.00 is past due since 25 September.', amountAct: true }}
        approvals={{ sentence: 'One approval waits: the living room sofa.' }}
        ledger={{ sentence: 'Six invoices are open, $1,375.00 together.' }}
      />,
    );
    const links = within(screen.getByRole('list', { name: 'Where things stand' })).getAllByRole('link');
    expect(links.map((l) => l.getAttribute('href'))).toEqual(['#letterbox', '#approvals', '#ledger']);
    expect(links[0]).toHaveTextContent('$600.00 is past due since 25 September.');
  });

  it('fills only the row whose act carries an amount', () => {
    render(
      <StandingRows
        letterbox={{ sentence: '$600.00 is past due since 25 September.', amountAct: true }}
        approvals={{ sentence: 'One approval waits: the living room sofa.' }}
        ledger={{ sentence: null }}
      />,
    );
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.getAttribute('data-act'))).toEqual(['amount', null, null]);
  });

  it('states each zero state in words and keeps all three rows', () => {
    render(<StandingRows letterbox={{ sentence: null }} approvals={{ sentence: '' }} ledger={{ sentence: null }} />);
    expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
      STANDING_ZERO.letterbox,
      STANDING_ZERO.approvals,
      STANDING_ZERO.ledger,
    ]);
  });

  it('never prints a count against a total or a percentage', () => {
    const { container } = render(
      <StandingRows
        letterbox={{ sentence: '1 / 6 invoices paid' }}
        approvals={{ sentence: 'Approvals 50% done' }}
        ledger={{ sentence: 'Two of 3 open, 66 percent' }}
      />,
    );
    expect(container.textContent).not.toMatch(MEASURES);
    expect(screen.getAllByRole('link')).toHaveLength(3);
  });

  it('accepts money and dates, refuses measures', () => {
    expect(isStandingSentence('$600.00 is past due since 25 September.')).toBe(true);
    expect(isStandingSentence('3/7 rooms done')).toBe(false);
    expect(isStandingSentence('80% there')).toBe(false);
  });
});

describe('ArrivalLine', () => {
  it('says what the page is for', () => {
    render(<ArrivalLine />);
    expect(screen.getByText(ARRIVAL_SENTENCE)).toHaveClass('ed-arrival');
  });
});
