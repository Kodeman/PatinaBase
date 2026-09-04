import { act, fireEvent, render, screen } from '@testing-library/react';

import type { RoadOrderModel } from '@/lib/threshold/road-orders';
import { resetCheckoutReturn } from '@/lib/threshold/checkout-return';

jest.mock('@patina/supabase', () => ({
  __esModule: true,
  useStartDirectOrderCheckout: jest.fn(),
}));

jest.mock('@/lib/analytics/events', () => ({
  __esModule: true,
  makingEvents: { actionShown: jest.fn(), actionSelected: jest.fn() },
  clientEvents: {},
}));

import { useStartDirectOrderCheckout } from '@patina/supabase';

import { RoadOrders } from '../road-orders';

const checkoutMock = useStartDirectOrderCheckout as jest.Mock;

const LAMP: RoadOrderModel = {
  id: 'ord-1',
  name: 'Brass floor lamp',
  quantity: 1,
  amountCents: 42_000,
  currency: 'USD',
  stageIndex: 0,
  payable: true,
};

const RUG: RoadOrderModel = {
  id: 'ord-2',
  name: 'Flatweave rug',
  quantity: 2,
  amountCents: 180_000,
  currency: 'USD',
  stageIndex: 3,
  payable: false,
};

let mutateAsync: jest.Mock;
const originalLocation = window.location;

let assign: jest.Mock;

function standAt(search: string) {
  assign = jest.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: {
      search,
      href: `https://client.test/projects/p1${search}`,
      pathname: '/projects/p1',
      assign,
    },
  });
}

describe('RoadOrders — the pieces she bought herself', () => {
  beforeEach(() => {
    resetCheckoutReturn();
    mutateAsync = jest.fn().mockResolvedValue({ url: 'https://checkout.stripe.test/order' });
    checkoutMock.mockReturnValue({ mutateAsync, isPending: false });
    standAt('');
    jest.spyOn(window.history, 'replaceState').mockImplementation(() => {});
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation });
  });

  it('stands each piece at its stop, and offers the act only where it is payable', () => {
    render(<RoadOrders orders={[LAMP, RUG]} />);

    expect(screen.getByText(/Brass floor lamp/)).toBeInTheDocument();
    expect(screen.getByText('Agreed · bought direct · $420')).toBeInTheDocument();
    expect(screen.getByText('In transit · bought direct · 2 of them · $1,800')).toBeInTheDocument();

    expect(screen.getAllByRole('button', { name: /pay for this piece/i })).toHaveLength(1);
  });

  it('takes one piece to the till and goes there', async () => {
    render(<RoadOrders orders={[LAMP, RUG]} />);

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pay for this piece/i }));
    });

    expect(mutateAsync).toHaveBeenCalledWith({ directOrderId: 'ord-1' });
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.test/order');
  });

  it('states a failure in place and stays on the road', async () => {
    render(<RoadOrders orders={[LAMP]} />);
    mutateAsync.mockRejectedValue(new Error('This order was refunded.'));

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /pay for this piece/i }));
    });

    expect(screen.getByTestId('road-orders-error')).toHaveTextContent('This order was refunded.');
  });

  it('reads the return from the till for an order', () => {
    standAt('?order=ord-1&checkout=success');
    render(<RoadOrders orders={[LAMP]} today={new Date(2026, 8, 4)} />);

    expect(screen.getByTestId('road-orders-receipt')).toHaveTextContent(
      'Paid September 4. Receipt in your email.',
    );
  });

  it('says nothing changed when she came back from a cancelled till', () => {
    standAt('?order=ord-1&checkout=cancelled');
    render(<RoadOrders orders={[LAMP]} />);

    expect(screen.getByTestId('road-orders-receipt')).toHaveTextContent('Nothing changed.');
  });

  it('leaves an invoice’s return to the letterbox', () => {
    standAt('?invoice=inv-4&checkout=success');
    render(<RoadOrders orders={[LAMP]} />);

    expect(screen.queryByTestId('road-orders-receipt')).not.toBeInTheDocument();
  });
});
