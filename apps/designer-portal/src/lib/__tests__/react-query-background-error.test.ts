import type { QueryClient } from '@tanstack/react-query';
import {
  handleApiError,
  handleAuthExpiry,
  logError,
  showErrorToast,
} from '../error-handler';
import { nextSubjectQueryClient } from '../react-query';

jest.mock('../error-handler', () => ({
  ...jest.requireActual('../error-handler'),
  logError: jest.fn(),
  showErrorToast: jest.fn(),
  handleAuthExpiry: jest.fn(),
}));

const toast = jest.mocked(showErrorToast);
const logged = jest.mocked(logError);
const authExpiry = jest.mocked(handleAuthExpiry);

let client: QueryClient;

beforeEach(() => {
  client = nextSubjectQueryClient();
  authExpiry.mockReset().mockReturnValue(false);
});

afterEach(() => {
  client.clear();
});

describe('native QueryCache error surfaces', () => {
  it.each([
    { label: 'populated rows', data: [{ id: 'po-1' }] },
    { label: 'empty rows', data: [] },
    { label: 'null', data: null },
    { label: 'zero', data: 0 },
    { label: 'false', data: false },
    { label: 'empty string', data: '' },
  ])('retains warm $label and logs a failed refetch without a toast', async ({ data }) => {
    const queryKey = ['warm-query'];
    await client.fetchQuery({ queryKey, queryFn: async () => data, staleTime: 0 });
    const retained = client.getQueryData(queryKey);
    const failure = new Error('warm read refused');

    await expect(client.fetchQuery({
      queryKey,
      queryFn: async () => { throw failure; },
      retry: false,
      staleTime: 0,
    })).rejects.toBe(failure);

    expect(client.getQueryState(queryKey)).toMatchObject({
      status: 'error', fetchStatus: 'idle', error: failure,
    });
    expect(client.getQueryData(queryKey)).toBe(retained);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith(handleApiError(failure), { queryKey, meta: undefined });
    expect(toast).not.toHaveBeenCalled();
  });

  it('shows exactly one toast for a cold first-load failure', async () => {
    const queryKey = ['cold-query'];
    const failure = new Error('cold read refused');

    await expect(client.fetchQuery({
      queryKey, queryFn: async () => { throw failure; }, retry: false,
    })).rejects.toBe(failure);

    expect(client.getQueryData(queryKey)).toBeUndefined();
    expect(logged).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith(handleApiError(failure));
  });

  it('logs a cold silent lookup failure without a toast', async () => {
    const failure = new Error('supporting read refused');

    await expect(client.fetchQuery({
      queryKey: ['silent-query'],
      queryFn: async () => { throw failure; },
      meta: { errorSurface: 'silent' },
      retry: false,
    })).rejects.toBe(failure);

    expect(logged).toHaveBeenCalledTimes(1);
    expect(toast).not.toHaveBeenCalled();
  });

  it('leaves a cold expired-session failure with the session arbiter', async () => {
    const failure = { code: 'PGRST301', message: 'JWT expired' };
    authExpiry.mockReturnValue(true);

    await expect(client.fetchQuery({
      queryKey: ['expired-query'], queryFn: async () => { throw failure; }, retry: false,
    })).rejects.toBe(failure);

    expect(authExpiry).toHaveBeenCalledTimes(1);
    expect(authExpiry).toHaveBeenCalledWith(failure, {
      restoreErrorSurface: expect.any(Function),
    });
    expect(toast).not.toHaveBeenCalled();
  });

  it('leaves a warm expired-session failure with the session arbiter', async () => {
    const queryKey = ['warm-expired-query'];
    await client.fetchQuery({ queryKey, queryFn: async () => [], staleTime: 0 });
    const failure = { code: 'PGRST301', message: 'JWT expired' };
    authExpiry.mockReturnValue(true);

    await expect(client.fetchQuery({
      queryKey, queryFn: async () => { throw failure; }, retry: false, staleTime: 0,
    })).rejects.toBe(failure);

    expect(authExpiry).toHaveBeenCalledTimes(1);
    expect(authExpiry).toHaveBeenCalledWith(failure, {
      restoreErrorSurface: expect.any(Function),
    });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(queryKey)).toEqual([]);
    expect(toast).not.toHaveBeenCalled();
  });

  it.each(['dead', 'alive', 'inconclusive'] as const)(
    'keeps warm session arbitration and its %s restore outcome',
    async (outcome) => {
      const queryKey = ['warm-session-verdict'];
      await client.fetchQuery({ queryKey, queryFn: async () => [], staleTime: 0 });
      const failure = { code: 'PGRST301', message: 'JWT expired' };
      authExpiry.mockReturnValue(true);

      await expect(client.fetchQuery({
        queryKey, queryFn: async () => { throw failure; }, retry: false, staleTime: 0,
      })).rejects.toBe(failure);

      expect(authExpiry).toHaveBeenCalledTimes(1);
      expect(toast).not.toHaveBeenCalled();
      authExpiry.mock.calls[0][1]?.restoreErrorSurface?.(outcome);

      expect(client.getQueryData(queryKey)).toEqual([]);
      if (outcome === 'dead') {
        expect(toast).toHaveBeenCalledTimes(1);
        expect(toast).toHaveBeenCalledWith(handleApiError(failure));
      } else {
        expect(toast).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['dead', 'alive', 'inconclusive'] as const)(
    'preserves the cold session restore path for a %s verdict',
    async (outcome) => {
      const failure = { code: 'PGRST301', message: 'JWT expired' };
      authExpiry.mockImplementation((_error, options) => {
        options?.restoreErrorSurface?.(outcome);
        return true;
      });

      await expect(client.fetchQuery({
        queryKey: ['session-verdict'], queryFn: async () => { throw failure; }, retry: false,
      })).rejects.toBe(failure);

      expect(authExpiry).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledTimes(1);
      expect(toast).toHaveBeenCalledWith(outcome === 'dead'
        ? handleApiError(failure)
        : expect.objectContaining({ code: 'REQUEST_FAILED_SESSION_ALIVE' }));
    },
  );
});
