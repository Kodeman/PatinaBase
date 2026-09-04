import {
  cleanedCheckoutUrl,
  consumeCheckoutReturn,
  readCheckoutReturn,
  resetCheckoutReturn,
} from '../checkout-return';

describe('readCheckoutReturn', () => {
  it('reads a settled return and the invoice it names', () => {
    expect(readCheckoutReturn('?invoice=inv-4&checkout=success&session_id=cs_1')).toEqual({
      outcome: 'settled',
      invoiceId: 'inv-4',
      orderId: null,
    });
  });

  it('reads both spellings of a cancelled return as nothing changed', () => {
    expect(readCheckoutReturn('?checkout=cancelled')?.outcome).toBe('unchanged');
    expect(readCheckoutReturn('?checkout=cancel')?.outcome).toBe('unchanged');
  });

  it('reads an order return', () => {
    expect(readCheckoutReturn('?order=ord-1&checkout=success')).toEqual({
      outcome: 'settled',
      invoiceId: null,
      orderId: 'ord-1',
    });
  });

  it('is silent when the address carries no return at all', () => {
    expect(readCheckoutReturn('')).toBeNull();
    expect(readCheckoutReturn('?invoice=inv-4')).toBeNull();
    expect(readCheckoutReturn('?checkout=pending')).toBeNull();
  });
});

describe('cleanedCheckoutUrl', () => {
  it('strikes out every param the till added and sets the anchor', () => {
    expect(
      cleanedCheckoutUrl(
        'https://client.test/projects/p1?invoice=inv-4&checkout=success&session_id=cs_1&checkout_attempt_id=a1&payment_id=p1',
        '#letterbox',
      ),
    ).toBe('/projects/p1#letterbox');
  });

  it('keeps params the house put there itself', () => {
    expect(
      cleanedCheckoutUrl('https://client.test/projects/p1?since=1&checkout=cancelled', '#letterbox'),
    ).toBe('/projects/p1?since=1#letterbox');
  });
});

describe('consumeCheckoutReturn', () => {
  const replaceState = jest.fn();
  const originalHistory = window.history.replaceState;

  beforeEach(() => {
    resetCheckoutReturn();
    replaceState.mockClear();
    window.history.replaceState = replaceState;
  });

  afterEach(() => {
    window.history.replaceState = originalHistory;
  });

  function standAt(search: string) {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        search,
        href: `https://client.test/projects/p1${search}`,
        pathname: '/projects/p1',
      },
    });
  }

  it('reads once, cleans the address, and serves the same answer after', () => {
    standAt('?invoice=inv-4&checkout=success&session_id=cs_1');

    const first = consumeCheckoutReturn();
    expect(first).toEqual({ outcome: 'settled', invoiceId: 'inv-4', orderId: null });
    expect(replaceState).toHaveBeenCalledWith({}, '', '/projects/p1#letterbox');

    expect(consumeCheckoutReturn()).toBe(first);
    expect(replaceState).toHaveBeenCalledTimes(1);
  });

  it('sends an order return to the road', () => {
    standAt('?order=ord-1&checkout=cancelled');

    expect(consumeCheckoutReturn()?.orderId).toBe('ord-1');
    expect(replaceState).toHaveBeenCalledWith({}, '', '/projects/p1#road');
  });

  it('leaves an ordinary address alone', () => {
    standAt('');

    expect(consumeCheckoutReturn()).toBeNull();
    expect(replaceState).not.toHaveBeenCalled();
  });
});
