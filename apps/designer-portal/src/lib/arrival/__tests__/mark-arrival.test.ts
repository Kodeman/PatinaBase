/**
 * US-14 arrival — the write-only anchor is fire-and-forget: the right args, and nothing it does
 * (a rejected rpc, a throwing client) ever reaches the page.
 */
jest.mock('@patina/supabase', () => ({ createBrowserClient: jest.fn() }));

import { createBrowserClient } from '@patina/supabase';
import { markArrival } from '../mark-arrival';

const mockClient = createBrowserClient as unknown as jest.Mock;

describe('markArrival', () => {
  it('calls mark_arrival with the scope, and a null engagement for the Desk', () => {
    const rpc = jest.fn(() => Promise.resolve({ data: null, error: null }));
    mockClient.mockReturnValue({ rpc });
    markArrival('document', 'e1');
    markArrival('desk', 'ignored');
    expect(rpc).toHaveBeenNthCalledWith(1, 'mark_arrival', {
      p_scope: 'document',
      p_engagement_id: 'e1',
    });
    expect(rpc).toHaveBeenNthCalledWith(2, 'mark_arrival', {
      p_scope: 'desk',
      p_engagement_id: null,
    });
  });

  it('swallows a rejected rpc: both outcomes are handled, nothing is unhandled', async () => {
    const unhandled = jest.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const rpc = jest.fn(() => Promise.reject(new Error('22023: bad shape')));
      mockClient.mockReturnValue({ rpc });
      expect(() => markArrival('document', 'e1')).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('attaches a rejection handler to the rpc thenable', () => {
    const then = jest.fn();
    mockClient.mockReturnValue({ rpc: jest.fn(() => ({ then })) });
    markArrival('document', 'e1');
    expect(then).toHaveBeenCalledWith(expect.any(Function), expect.any(Function));
    const [, onRejected] = then.mock.calls[0] as [unknown, (e: unknown) => unknown];
    expect(() => onRejected(new Error('network'))).not.toThrow();
  });

  it('never throws when the client or the rpc throws', () => {
    mockClient.mockImplementation(() => {
      throw new Error('no env');
    });
    expect(() => markArrival('desk', null)).not.toThrow();
    mockClient.mockReturnValue({
      rpc: () => {
        throw new Error('sync');
      },
    });
    expect(() => markArrival('desk', null)).not.toThrow();
  });
});
