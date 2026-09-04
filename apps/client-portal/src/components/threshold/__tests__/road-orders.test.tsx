import { act, fireEvent, render, screen } from '@testing-library/react';

import type { ClosedOrderModel, RoadOrderModel } from '@/lib/threshold/road-orders';
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
  inFlight: false,
  houseless: false,
  settled: false,
};

const RUG: RoadOrderModel = {
  id: 'ord-2',
  name: 'Flatweave rug',
  quantity: 2,
  amountCents: 180_000,
  currency: 'USD',
  stageIndex: 3,
  payable: false,
  inFlight: false,
  houseless: false,
  settled: true,
};

const REFUNDED: ClosedOrderModel = {
  id: 'ord-9',
  name: 'Ceramic table lamp',
  amountCents: 26_000,
  currency: 'USD',
  word: 'Refunded',
  raisedAt: '2026-07-02T10:00:00Z',
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

  it('says the money landed only once the order’s own row says so', () => {
    standAt('?order=ord-2&checkout=success');
    render(<RoadOrders orders={[RUG]} today={new Date(2026, 8, 4)} />);

    // The retired /orders page's own confirmed sentence, and the piece it is
    // about — no date, because a return carries none the row can vouch for.
    expect(screen.getByTestId('road-orders-receipt')).toHaveTextContent(
      'Flatweave rug · Payment received — thank you! A receipt is on its way to your inbox.',
    );
  });

  it('waits, and never claims a payment, while the row is still unpaid', () => {
    standAt('?order=ord-1&checkout=success');
    render(<RoadOrders orders={[LAMP]} today={new Date(2026, 8, 4)} />);

    const receipt = screen.getByTestId('road-orders-receipt');
    expect(receipt).toHaveTextContent('Confirming payment… This usually takes a few seconds.');
    expect(receipt).not.toHaveTextContent('Paid');
  });

  it('states the bank transfer once the wait runs out', () => {
    jest.useFakeTimers();
    try {
      standAt('?order=ord-1&checkout=success');
      render(<RoadOrders orders={[LAMP]} today={new Date(2026, 8, 4)} />);

      act(() => {
        jest.advanceTimersByTime(31_000);
      });

      expect(screen.getByTestId('road-orders-receipt')).toHaveTextContent(
        'Your bank transfer has been started.',
      );
    } finally {
      jest.useRealTimers();
    }
  });

  it('says nothing about a piece that is not standing on this road', () => {
    standAt('?order=ord-elsewhere&checkout=success');
    render(<RoadOrders orders={[LAMP]} today={new Date(2026, 8, 4)} />);

    expect(screen.queryByTestId('road-orders-receipt')).not.toBeInTheDocument();
  });

  it('says a bank transfer is pending on a piece already in flight', () => {
    render(<RoadOrders orders={[{ ...LAMP, payable: false, inFlight: true }]} />);

    expect(screen.getByText(/bank transfer pending/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pay for this piece/i })).not.toBeInTheDocument();
  });

  it('says when a piece is tied to no house', () => {
    render(<RoadOrders orders={[{ ...LAMP, houseless: true }]} />);

    expect(
      screen.getByText(/bought direct, not tied to this house/),
    ).toBeInTheDocument();
  });

  it('keeps what is no longer coming, with its word and its date', () => {
    render(<RoadOrders orders={[]} closed={[REFUNDED]} today={new Date(2026, 8, 4)} />);

    expect(screen.getByTestId('road-orders-closed')).toHaveTextContent(
      'Ceramic table lamp · Refunded · bought July 2 · $260',
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
