const mockShowErrorToast = jest.fn();
const mockLogError = jest.fn();

jest.mock('../error-handler', () => ({
  handleApiError: (error: unknown) => error,
  logError: (...args: unknown[]) => mockLogError(...args),
  showErrorToast: (...args: unknown[]) => mockShowErrorToast(...args),
  isAuthError: () => false,
  isNetworkError: () => false,
  handleAuthExpiry: () => false,
}));

import { queryClient } from '../react-query';

describe('React Query error surfaces', () => {
  beforeEach(() => {
    queryClient.clear();
    mockShowErrorToast.mockClear();
    mockLogError.mockClear();
  });

  it('logs but does not toast a query explicitly marked as a silent background lookup', async () => {
    const failure = new Error('relationship lookup failed');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['designer-client-for-user', 'client-1'],
        queryFn: async () => {
          throw failure;
        },
        meta: { errorSurface: 'silent' },
      }),
    ).rejects.toBe(failure);

    expect(mockLogError).toHaveBeenCalledWith(failure, {
      queryKey: ['designer-client-for-user', 'client-1'],
      meta: { errorSurface: 'silent' },
    });
    expect(mockShowErrorToast).not.toHaveBeenCalled();
  });

  it('keeps the legacy toast for foreground queries without silent metadata', async () => {
    const failure = new Error('foreground query failed');

    await expect(
      queryClient.fetchQuery({
        queryKey: ['foreground-query'],
        queryFn: async () => {
          throw failure;
        },
      }),
    ).rejects.toBe(failure);

    expect(mockShowErrorToast).toHaveBeenCalledWith(failure);
  });
});
