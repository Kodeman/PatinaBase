import { documentResolutionState } from '../document-resolution-state';

describe('documentResolutionState', () => {
  it('keeps a cached miss in the picking-up state while the transition refetch is active', () => {
    expect(
      documentResolutionState({
        resolutionKind: 'missing',
        isLoading: false,
        isFetching: true,
        isError: false,
      }),
    ).toBe('loading');
  });

  it('shows a true missing state only after resolution settles', () => {
    expect(
      documentResolutionState({
        resolutionKind: 'missing',
        isLoading: false,
        isFetching: false,
        isError: false,
      }),
    ).toBe('missing');
  });

  it('does not hide a resolved document during an ordinary background refresh', () => {
    expect(
      documentResolutionState({
        resolutionKind: 'engagement',
        isLoading: false,
        isFetching: true,
        isError: false,
      }),
    ).toBe('ready');
  });

  it('settles a disabled or malformed document id as missing instead of loading forever', () => {
    expect(
      documentResolutionState({
        resolutionKind: undefined,
        isLoading: false,
        isFetching: false,
        isError: false,
      }),
    ).toBe('missing');
  });

  it('surfaces a failed resolver query as a retryable error', () => {
    expect(
      documentResolutionState({
        resolutionKind: undefined,
        isLoading: false,
        isFetching: false,
        isError: true,
      }),
    ).toBe('error');
  });
});
