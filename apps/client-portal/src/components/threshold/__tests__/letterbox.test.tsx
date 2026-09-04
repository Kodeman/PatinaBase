import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { InvoiceModel } from '@/lib/threshold/derive';

import { Letterbox } from '../letterbox';

function invoice(overrides: Partial<InvoiceModel> = {}): InvoiceModel {
  return {
    id: 'b0000000-0000-0000-0000-0000000000i4',
    number: 'Invoice No. 4',
    totalCents: 1_825_000,
    paidCents: 912_500,
    balanceCents: 912_500,
    dueDate: '2026-08-15',
    ...overrides,
  };
}

describe('Letterbox — one letter, half out of the slot', () => {
  it('carries the anchor and the threshold unit', () => {
    render(<Letterbox invoice={invoice()} />);

    const root = screen.getByTestId('letterbox');
    expect(root).toHaveAttribute('id', 'letterbox');
    expect(root).toHaveAttribute('data-threshold-unit', 'letterbox');
  });

  it('draws the letterbox with the letter standing out of it', () => {
    render(<Letterbox invoice={invoice()} />);

    expect(
      screen.getByRole('img', {
        name: 'A letterbox with an invoice standing half out of the slot',
      }),
    ).toBeInTheDocument();
  });

  it('states the letter in words and figures before it is opened', () => {
    render(<Letterbox invoice={invoice()} />);

    const body = screen.getByTestId('letterbox-body');
    expect(body).toHaveTextContent('Invoice No. 4');
    expect(body).toHaveTextContent('$18,250');
    expect(body).toHaveTextContent('$9,125');
    expect(body).toHaveTextContent('due August 15');
  });

  it('unfolds to the toll when the letterbox is opened', async () => {
    render(<Letterbox invoice={invoice()} />);

    expect(screen.queryByTestId('spine-toll')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /open the letterbox/i }));

    const toll = screen.getByTestId('spine-toll');
    expect(toll).toBeInTheDocument();
    expect(toll).toHaveAttribute('data-invoice-id', 'b0000000-0000-0000-0000-0000000000i4');
    expect(
      screen.getByRole('button', { name: /close the letterbox/i }),
    ).toHaveAttribute('aria-expanded', 'true');
  });

  it('stands empty, and says so, when nothing has come', () => {
    render(<Letterbox invoice={null} />);

    expect(screen.getByTestId('letterbox-body')).toHaveTextContent('Nothing in the letterbox.');
    expect(
      screen.queryByRole('button', { name: /open the letterbox/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: 'An empty letterbox' }),
    ).toBeInTheDocument();
  });
});
